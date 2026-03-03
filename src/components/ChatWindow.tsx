"use client";

import { useEffect, useRef } from "react";
import MessageBubble, { type Message } from "./MessageBubble";

interface ChatWindowProps {
  messages: Message[];
  loading: boolean;
  hasActiveThread: boolean;
  onNewChat: () => void;
}

function LoadingDots() {
  return (
    <div className="message message-assistant">
      <div className="loading-dots">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

function EmptyState({ onNewChat }: { onNewChat: () => void }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      <h2 className="empty-state-title">Jira Knowledge Search</h2>
      <p className="empty-state-text">
        Ask questions about your synced Jira tickets. Every answer is grounded
        in real ticket data with sources and confidence scoring.
      </p>
      <button type="button" className="btn btn-primary" onClick={onNewChat}>
        Start a new chat
      </button>
    </div>
  );
}

export default function ChatWindow({
  messages,
  loading,
  hasActiveThread,
  onNewChat,
}: ChatWindowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  if (!hasActiveThread) {
    return (
      <div className="chat-area-container">
        <EmptyState onNewChat={onNewChat} />
      </div>
    );
  }

  return (
    <div className="chat-area-container" ref={scrollRef}>
      {messages.length === 0 && !loading && (
        <div className="chat-start-hint">
          <p>Start by asking a question about your Jira tickets.</p>
        </div>
      )}
      <div className="chat-messages">
        {messages.map((msg, i) => (
          <MessageBubble key={msg.id ?? i} message={msg} />
        ))}
        {loading && <LoadingDots />}
      </div>
    </div>
  );
}
