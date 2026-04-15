/**
 * Jira Notebook — Google Chat Bot
 *
 * Setup:
 * 1. Go to script.google.com → New Project → paste this code
 * 2. Set JIRA_NOTEBOOK_URL in Project Settings > Script Properties
 * 3. Deploy as a Google Chat App (Deploy > New Deployment > Chat App)
 * 4. Add the bot to your Google Chat space
 *
 * Usage in Google Chat:
 *   @JiraNotebook what are the recent VLA problems?
 *   @JiraNotebook sync
 *   @JiraNotebook status
 */

var JIRA_NOTEBOOK_URL = PropertiesService.getScriptProperties().getProperty('JIRA_NOTEBOOK_URL');

/**
 * Handles all incoming Google Chat events.
 */
function onMessage(event) {
  var message = event.message.text || '';

  // Strip the bot mention (@BotName)
  var text = message.replace(/<[^>]+>/g, '').trim();

  if (!text) {
    return helpCard();
  }

  var lower = text.toLowerCase();

  // Commands
  if (lower === 'sync') {
    return handleSync();
  }
  if (lower === 'status') {
    return handleStatus();
  }
  if (lower === 'help') {
    return helpCard();
  }

  // Default: search Jira tickets
  return handleSearch(text);
}

/**
 * Search Jira tickets with AI answer.
 */
function handleSearch(question) {
  try {
    var response = UrlFetchApp.fetch(JIRA_NOTEBOOK_URL + '/api/ask', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ question: question }),
      muteHttpExceptions: true
    });

    var data = JSON.parse(response.getContentText());

    if (data.error) {
      return errorCard('Search failed: ' + data.error);
    }

    var sections = [];

    // Answer sections
    var answers = data.answers || [];
    for (var i = 0; i < answers.length; i++) {
      var answer = answers[i];
      var widgets = [
        { textParagraph: { text: answer.text } }
      ];

      // Source buttons
      if (answer.sources && answer.sources.length > 0) {
        var buttons = answer.sources.slice(0, 5).map(function(s) {
          return {
            textButton: {
              text: s.key,
              onClick: { openLink: { url: s.url } }
            }
          };
        });
        widgets.push({ buttons: buttons });
      }

      sections.push({ widgets: widgets });
    }

    // Confidence + citation count footer
    var footer = 'Confidence: ' + (data.confidence || 'Low');
    if (data.citations && data.citations.length > 0) {
      footer += '  |  ' + data.citations.length + ' source ticket(s)';
    }
    sections.push({
      widgets: [{ textParagraph: { text: '<i>' + footer + '</i>' } }]
    });

    return {
      cards: [{
        header: {
          title: '🔍 ' + question.slice(0, 60) + (question.length > 60 ? '…' : ''),
          subtitle: 'Jira Notebook'
        },
        sections: sections
      }]
    };

  } catch (e) {
    return errorCard('Request failed: ' + e.message);
  }
}

/**
 * Trigger a Jira sync.
 */
function handleSync() {
  try {
    var response = UrlFetchApp.fetch(JIRA_NOTEBOOK_URL + '/api/sync-jira', {
      method: 'post',
      contentType: 'application/json',
      payload: '{}',
      muteHttpExceptions: true
    });

    var data = JSON.parse(response.getContentText());

    if (data.error) {
      return errorCard('Sync failed: ' + data.error);
    }

    return simpleCard(
      '✅ Sync Complete',
      (data.count || 0).toLocaleString() + ' tickets synced successfully.'
    );

  } catch (e) {
    return errorCard('Sync request failed: ' + e.message);
  }
}

/**
 * Check sync status.
 */
function handleStatus() {
  try {
    var response = UrlFetchApp.fetch(JIRA_NOTEBOOK_URL + '/api/sync-status', {
      muteHttpExceptions: true
    });

    var data = JSON.parse(response.getContentText());

    if (!data.lastSyncAt) {
      return simpleCard('⚠️ Not Synced', 'No sync has been run yet. Type @JiraNotebook sync to sync now.');
    }

    var syncDate = new Date(data.lastSyncAt);
    var hoursAgo = Math.round((Date.now() - syncDate.getTime()) / (1000 * 60 * 60));
    var timeLabel = hoursAgo < 1 ? 'just now' : hoursAgo + ' hour(s) ago';

    return simpleCard(
      '📊 Sync Status',
      '• Tickets: ' + (data.lastSyncCount || 0).toLocaleString() + '\n' +
      '• Last sync: ' + timeLabel + '\n' +
      '• Synced at: ' + syncDate.toLocaleString()
    );

  } catch (e) {
    return errorCard('Status check failed: ' + e.message);
  }
}

// ---------------------------------------------------------------------------
// Card helpers
// ---------------------------------------------------------------------------

function simpleCard(title, body) {
  return {
    cards: [{
      header: { title: title, subtitle: 'Jira Notebook' },
      sections: [{ widgets: [{ textParagraph: { text: body } }] }]
    }]
  };
}

function errorCard(message) {
  return {
    cards: [{
      header: { title: '❌ Error', subtitle: 'Jira Notebook' },
      sections: [{ widgets: [{ textParagraph: { text: message } }] }]
    }]
  };
}

function helpCard() {
  return {
    cards: [{
      header: { title: '🤖 Jira Notebook Bot', subtitle: 'Search your Jira tickets with AI' },
      sections: [{
        widgets: [{
          textParagraph: {
            text:
              '<b>Ask a question:</b>\n@JiraNotebook what are the recent VLA problems?\n\n' +
              '<b>Check sync status:</b>\n@JiraNotebook status\n\n' +
              '<b>Trigger a sync:</b>\n@JiraNotebook sync\n\n' +
              '<b>Show this help:</b>\n@JiraNotebook help'
          }
        }]
      }]
    }]
  };
}
