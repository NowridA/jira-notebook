"use client";

import ThreadList, { type ThreadItem } from "./ThreadList";

interface TicketItem {
  key: string;
  url: string;
  summary: string;
  status: string;
  updated: string;
}

interface SyncStatus {
  lastSyncAt: string | null;
  lastSyncCount: number | null;
}

interface SidebarProps {
  threads: ThreadItem[];
  activeThreadId: string | null;
  onNewChat: () => void;
  onSelectThread: (id: string) => void;
  onRenameThread: (id: string, title: string) => void;
  onDeleteThread: (id: string) => void;
  onDuplicateThread: (id: string) => void;
  tickets: TicketItem[];
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  statusOptions: string[];
  syncing: boolean;
  onSync: () => void;
  syncStatus: SyncStatus;
}

export default function Sidebar({
  threads,
  activeThreadId,
  onNewChat,
  onSelectThread,
  onRenameThread,
  onDeleteThread,
  onDuplicateThread,
  tickets,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  statusOptions,
  syncing,
  onSync,
  syncStatus,
}: SidebarProps) {
  return (
    <aside className="sidebar-panel">
      <div className="sidebar-header">
        <h1 className="sidebar-title">Jira Notebook</h1>
        <button
          type="button"
          className="btn-sync-top"
          onClick={onSync}
          disabled={syncing}
        >
          {syncing ? (
            <svg className="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 1 1-6.22-8.56" />
            </svg>
          ) : syncStatus.lastSyncAt ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          )}
          <span>{syncing ? "Syncing…" : "Jira Sync"}</span>
          {syncStatus.lastSyncCount !== null && !syncing && (
            <span className="sync-count-badge">{syncStatus.lastSyncCount}</span>
          )}
        </button>
        <button type="button" className="btn-new-chat" onClick={onNewChat}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Chat
        </button>
      </div>

      <div className="sidebar-threads">
        <ThreadList
          threads={threads}
          activeThreadId={activeThreadId}
          onSelectThread={onSelectThread}
          onRenameThread={onRenameThread}
          onDeleteThread={onDeleteThread}
          onDuplicateThread={onDuplicateThread}
        />
      </div>

      <details className="jira-tools">
        <summary className="jira-tools-summary">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          Jira Tickets
          {syncStatus.lastSyncCount !== null && (
            <span className="jira-tools-count">{syncStatus.lastSyncCount}</span>
          )}
        </summary>
        <div className="jira-tools-content">
          <button
            type="button"
            className="btn btn-sync"
            onClick={onSync}
            disabled={syncing}
          >
            {syncing ? "Syncing…" : "Sync Now"}
          </button>
          <input
            type="text"
            className="input search"
            placeholder="Search tickets"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          <select
            className="input select"
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value)}
          >
            <option value="">All statuses</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <div className="ticket-list">
            {tickets.map((t) => (
              <a
                key={t.key}
                href={t.url}
                target="_blank"
                rel="noopener noreferrer"
                className="ticket-item-link"
              >
                <span className="ticket-key">{t.key}</span>
                <span className="ticket-summary">{t.summary || "—"}</span>
              </a>
            ))}
            {tickets.length === 0 && (
              <p className="sidebar-hint">No tickets. Sync from Jira first.</p>
            )}
          </div>
          <details className="jql-tip">
            <summary>JQL: sync all tickets related to you</summary>
            <p className="jql-tip-text">
              In <code>.env.local</code> set:
            </p>
            <code className="jql-tip-code">
              JIRA_JQL=(assignee = currentUser() OR assignee was currentUser()
              OR reporter = currentUser() OR creator = currentUser() OR watchers
              = currentUser() OR status CHANGED BY currentUser()) ORDER BY
              updated DESC
            </code>
          </details>
        </div>
      </details>
    </aside>
  );
}
