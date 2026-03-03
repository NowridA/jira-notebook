"use client";

import { useState, useRef, useEffect } from "react";

export interface ThreadItem {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastMessage?: string;
}

interface ThreadListProps {
  threads: ThreadItem[];
  activeThreadId: string | null;
  onSelectThread: (id: string) => void;
  onRenameThread: (id: string, title: string) => void;
  onDeleteThread: (id: string) => void;
  onDuplicateThread: (id: string) => void;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function ThreadMenu({
  threadId,
  onRename,
  onDuplicate,
  onDelete,
  onClose,
}: {
  threadId: string;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div className="thread-menu" ref={ref} data-thread-id={threadId}>
      <button type="button" className="thread-menu-item" onClick={onRename}>
        Rename
      </button>
      <button type="button" className="thread-menu-item" onClick={onDuplicate}>
        Duplicate
      </button>
      <button
        type="button"
        className="thread-menu-item thread-menu-danger"
        onClick={onDelete}
      >
        Delete
      </button>
    </div>
  );
}

export default function ThreadList({
  threads,
  activeThreadId,
  onSelectThread,
  onRenameThread,
  onDeleteThread,
  onDuplicateThread,
}: ThreadListProps) {
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  const startRename = (thread: ThreadItem) => {
    setRenamingId(thread.id);
    setRenameValue(thread.title);
    setMenuOpenId(null);
  };

  const commitRename = () => {
    if (renamingId && renameValue.trim()) {
      onRenameThread(renamingId, renameValue.trim());
    }
    setRenamingId(null);
  };

  const handleDuplicate = (id: string) => {
    onDuplicateThread(id);
    setMenuOpenId(null);
  };

  const handleDelete = (id: string) => {
    onDeleteThread(id);
    setMenuOpenId(null);
  };

  if (threads.length === 0) {
    return (
      <div className="thread-list-empty">
        <p>No conversations yet.</p>
        <p className="thread-list-empty-hint">Click &quot;New Chat&quot; to start.</p>
      </div>
    );
  }

  return (
    <div className="thread-list">
      {threads.map((thread) => (
        <div
          key={thread.id}
          className={`thread-item ${activeThreadId === thread.id ? "thread-active" : ""}`}
          onClick={() => onSelectThread(thread.id)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSelectThread(thread.id);
          }}
        >
          {renamingId === thread.id ? (
            <input
              ref={renameInputRef}
              className="thread-rename-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") setRenamingId(null);
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <>
              <div className="thread-item-header">
                <span className="thread-title">{thread.title}</span>
                <button
                  type="button"
                  className="thread-menu-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpenId(menuOpenId === thread.id ? null : thread.id);
                  }}
                  aria-label="Thread options"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <circle cx="8" cy="3" r="1.5" />
                    <circle cx="8" cy="8" r="1.5" />
                    <circle cx="8" cy="13" r="1.5" />
                  </svg>
                </button>
              </div>
              {thread.lastMessage && (
                <span className="thread-preview">{thread.lastMessage}</span>
              )}
              <span className="thread-time">
                {relativeTime(thread.updatedAt)}
              </span>
            </>
          )}
          {menuOpenId === thread.id && (
            <ThreadMenu
              threadId={thread.id}
              onRename={() => startRename(thread)}
              onDuplicate={() => handleDuplicate(thread.id)}
              onDelete={() => handleDelete(thread.id)}
              onClose={() => setMenuOpenId(null)}
            />
          )}
        </div>
      ))}
    </div>
  );
}
