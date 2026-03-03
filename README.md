# Jira Notebook

A web-based, easy-to-install **NotebookLM-style** app for Jira tickets. It runs locally with one command, syncs tickets from Jira, and lets you ask questions with **AI-grounded answers** strictly based on your synced tickets — no hallucinations, no external knowledge.

## What it does

- **Sync** Jira tickets (manual "Sync now" + optional daily reminder)
- **Store** synced tickets locally in `data/tickets.json`
- **Ask** questions in natural language; AI scans ALL synced tickets to generate answers
- **Grounded answers** — every answer is traceable to specific Jira ticket(s)
- **Confidence scoring** — each response shows High / Medium / Low confidence
- **Sources** — structured citations with ticket key, link, title, and snippet
- **Fallback** — works without Gemini key (keyword-based mode), fully powered with one

## Install

1. Go to the project folder:
   ```bash
   cd Users/nowridamin/workspace/jira-notebook
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create `.env.local` in the project root with:
   ```env
   JIRA_BASE_URL=https://your-domain.atlassian.net
   JIRA_EMAIL=your-email@example.com
   JIRA_API_TOKEN=your-api-token
   JIRA_JQL=assignee=currentUser() ORDER BY updated DESC
   ```
   (No trailing slash on `JIRA_BASE_URL`. Get an API token from [Atlassian account security](https://id.atlassian.com/manage-profile/security/api-tokens).)
   - **AI-powered answers (optional but recommended):** Add your [Google Gemini API key](https://aistudio.google.com/apikey):
     ```env
     GEMINI_API_KEY=your-gemini-api-key
     ```
     Without this key, answers fall back to keyword matching. With it, the app uses Gemini to synthesize grounded answers with confidence scoring.
     - Optionally override the model (default `gemini-2.0-flash`):
       ```env
       GEMINI_MODEL=gemini-2.0-pro
       ```
   - To sync **all tickets from a project board** (e.g. [Vendasta DEV board](https://vendasta.jira.com/jira/software/c/projects/DEV/boards/569)), use the project key in JQL:
     ```env
     JIRA_BASE_URL=https://vendasta.jira.com
     JIRA_JQL=project = DEV ORDER BY updated DESC
     ```
     Sync fetches all matching issues (paginated); no limit to how many.
   - **To fetch every Jira ticket related to you (assigned, ever assigned, reported, created, watching, or where you changed status). For that, use this JQL — replace the line that starts with "To show all issues" you’ve worked on** (like [Jira For you / Worked on](https://vendasta.jira.com/jira/for-you)): `assignee = currentUser()` only returns issues **currently** assigned to you (e.g. “Assigned to me (1)” = 1 issue). Use a broader JQL so the app can show everything you’ve been involved in:
     ```env
     JIRA_BASE_URL=https://vendasta.jira.com
     JIRA_JQL=(assignee = currentUser() OR assignee was currentUser() OR reporter = currentUser() OR creator = currentUser() OR watchers = currentUser() OR status CHANGED BY currentUser()) ORDER BY updated DESC
     ```
     Covers: currently assigned, ever assigned, reporter, creator, watchers, and any issue where you changed status. Jira does not expose "commented by me" in plain JQL without plugins; this is the broadest native query.
4. Run the app:
   ```bash
   npm run dev
   ```
5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Build for production

```bash
npm run build
npm start
```

Then open the URL shown (e.g. http://localhost:3000).

## How to sync

- **In the UI:** Click **Sync Now** in the left sidebar.
- **From the command line (dev server must be running):**
  ```bash
  curl -X POST http://localhost:3000/api/sync-jira
  ```
- **Optional script:** With the dev server running:
  ```bash
  node scripts/sync-jira.mjs
  ```

## Troubleshooting

- **401 Unauthorized:** Check `JIRA_EMAIL` and `JIRA_API_TOKEN`. Create a new API token at [Atlassian API tokens](https://id.atlassian.com/manage-profile/security/api-tokens) and ensure the account has access to the Jira site.
- **403 Forbidden:** The user may not have permission to run JQL search. Try a simpler `JIRA_JQL` (e.g. `order by updated DESC`) or confirm permissions in Jira.
- **404 Not Found:** Ensure `JIRA_BASE_URL` has no trailing slash and points to your Jira base (e.g. `https://vendasta.atlassian.net`).
- **410 Gone / API removed:** Jira has deprecated some search endpoints. This app uses `/rest/api/3/search/jql`. If you see 410, the host may require a different API path; check [Atlassian’s API changelog](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/).
- **No tickets after sync:** Check `JIRA_JQL` in `.env.local`. Run the sync and look at the response in the Network tab or via `curl -X POST http://localhost:3000/api/sync-jira` to see `count` and any error payload.
- **Only one ticket when Jira shows many:** If your JQL is `assignee = currentUser()`, you only get issues **currently** assigned to you. Use the "every ticket related to you" JQL in the install section (assignee, assignee was, reporter, creator, watchers, status CHANGED BY). If you get a JQL error, try dropping the last clause: remove `OR status CHANGED BY currentUser()` or `OR creator = currentUser()` and try again.

## Data storage

- Tickets: `data/tickets.json`
- Sync run history: `data/sync_runs.json`
- Secrets stay in `.env.local` (never committed; `.env*` is in `.gitignore`).

## How answers work

1. **Deep scan** — all synced tickets are scored against your question (keyword matching, phrase detection, recency).
2. **Context window** — the top 20 most relevant tickets are sent to the AI as context.
3. **Grounded synthesis** — the AI generates a structured answer using ONLY the provided tickets. No external knowledge.
4. **Confidence scoring** — every response includes a confidence level:
   - **High** — direct, explicit answer found in ticket(s)
   - **Medium** — answer derived from multiple tickets, not explicit in one place
   - **Low** — partial information; answer incomplete or ambiguous
5. **Sources** — each answer block cites the specific Jira ticket(s) it drew from.

If `GEMINI_API_KEY` is not set, the system falls back to keyword-based retrieval with formatted ticket snippets.

## Tech stack

- Next.js (App Router), TypeScript, Tailwind, Google Gemini SDK. One web app; no Docker or extra tooling.
