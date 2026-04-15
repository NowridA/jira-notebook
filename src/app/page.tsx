"use client";

import { useState, useEffect, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import ChatWindow from "@/components/ChatWindow";
import ChatInput from "@/components/ChatInput";
import type { Message, AssistantPayload, CitationItem } from "@/components/MessageBubble";
import type { ThreadItem } from "@/components/ThreadList";

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

const HOUR_MS = 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * HOUR_MS;

export default function Home() {
  // Thread state
  const [threads, setThreads] = useState<ThreadItem[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [latestCitations, setLatestCitations] = useState<CitationItem[]>([]);

  // Jira state (preserved from original)
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    lastSyncAt: null,
    lastSyncCount: null,
  });

  const fetchThreads = useCallback(async () => {
    const res = await fetch("/api/threads");
    if (!res.ok) return;
    const data = await res.json();
    setThreads(data.threads ?? []);
  }, []);

  const fetchMessages = useCallback(async (threadId: string) => {
    const res = await fetch(`/api/threads/${threadId}/messages`);
    if (!res.ok) return;
    const data = await res.json();
    const mapped: Message[] = (data.messages ?? []).map(
      (m: { id: string; role: "user" | "assistant"; content: string; timestamp: string; payload?: AssistantPayload; error?: string }) => ({
        id: m.id,
        role: m.role,
        text: m.content,
        payload: m.payload as AssistantPayload | undefined,
        error: m.error,
        timestamp: m.timestamp,
      })
    );
    setMessages(mapped);

    const lastAssistant = [...mapped]
      .reverse()
      .find((m) => m.role === "assistant" && m.payload);
    setLatestCitations(lastAssistant?.payload?.citations ?? []);
  }, []);

  const fetchTickets = useCallback(async () => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (statusFilter) params.set("status", statusFilter);
    params.set("limit", "100");
    const res = await fetch(`/api/tickets?${params}`);
    if (!res.ok) return;
    const data = await res.json();
    setTickets(data.tickets ?? []);
  }, [search, statusFilter]);

  const fetchSyncStatus = useCallback(async () => {
    const res = await fetch("/api/sync-status");
    if (!res.ok) return;
    const data = await res.json();
    setSyncStatus({
      lastSyncAt: data.lastSyncAt ?? null,
      lastSyncCount: data.lastSyncCount ?? null,
    });
  }, []);

  const autoSyncIfStale = useCallback(async () => {
    const res = await fetch("/api/sync-status");
    if (!res.ok) return;
    const data = await res.json();
    const lastSyncAt = data.lastSyncAt ?? null;
    const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;
    const isStale =
      !lastSyncAt ||
      Date.now() - new Date(lastSyncAt).getTime() > FORTY_EIGHT_HOURS_MS;
    if (isStale) {
      setSyncing(true);
      try {
        const syncRes = await fetch("/api/sync-jira", { method: "POST" });
        const syncData = await syncRes.json();
        if (!syncData.error) {
          await fetchTickets();
          await fetchSyncStatus();
        }
      } catch {
        // silent fail for background auto-sync
      } finally {
        setSyncing(false);
      }
    }
  }, [fetchTickets, fetchSyncStatus]);

  useEffect(() => {
    fetchThreads();
    fetchTickets();
    fetchSyncStatus().then(() => autoSyncIfStale());
  }, [fetchThreads, fetchTickets, fetchSyncStatus, autoSyncIfStale]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync-jira", { method: "POST" });
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        // Vercel returned an HTML error page (e.g. timeout or crash)
        const status = res.status;
        if (status === 504 || status === 408) {
          alert(
            "Sync timed out on Vercel. The full sync (12k+ tickets) takes too long for the free tier.\n\n" +
            "Run the sync locally and upload:\n" +
            "  npm run dev  →  click Sync\n" +
            "  npx tsx upload-to-blob.mts"
          );
        } else {
          alert(`Sync failed: server returned HTTP ${status} (not JSON). Check Vercel function logs.`);
        }
        return;
      }
      const data = await res.json();
      if (data.error) {
        const snippet = data.responseSnippet?.slice(0, 150) ?? "";
        const msg = snippet ? `${data.error}: ${snippet}` : data.error;
        alert("Sync failed: " + msg);
      } else {
        await fetchTickets();
        await fetchSyncStatus();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      alert("Sync failed: " + message);
    } finally {
      setSyncing(false);
    }
  };

  const handleNewChat = async () => {
    const res = await fetch("/api/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) return;
    const data = await res.json();
    const newThread: ThreadItem = data.thread;
    setThreads((prev) => [newThread, ...prev]);
    setActiveThreadId(newThread.id);
    setMessages([]);
    setLatestCitations([]);
    setInput("");
  };

  const handleSelectThread = async (threadId: string) => {
    if (threadId === activeThreadId) return;
    setActiveThreadId(threadId);
    setMessages([]);
    setLatestCitations([]);
    setInput("");
    await fetchMessages(threadId);
  };

  const handleRenameThread = async (id: string, title: string) => {
    await fetch(`/api/threads/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    setThreads((prev) =>
      prev.map((t) => (t.id === id ? { ...t, title } : t))
    );
  };

  const handleDeleteThread = async (id: string) => {
    await fetch(`/api/threads/${id}`, { method: "DELETE" });
    setThreads((prev) => prev.filter((t) => t.id !== id));
    if (activeThreadId === id) {
      setActiveThreadId(null);
      setMessages([]);
      setLatestCitations([]);
    }
  };

  const handleDuplicateThread = async (id: string) => {
    const res = await fetch(`/api/threads/${id}/duplicate`, { method: "POST" });
    if (!res.ok) return;
    const data = await res.json();
    const newThread: ThreadItem = data.thread;
    setThreads((prev) => [newThread, ...prev]);
    setActiveThreadId(newThread.id);
    await fetchMessages(newThread.id);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    let threadId = activeThreadId;

    if (!threadId) {
      const res = await fetch("/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) return;
      const data = await res.json();
      const newThread: ThreadItem = data.thread;
      setThreads((prev) => [newThread, ...prev]);
      setActiveThreadId(newThread.id);
      threadId = newThread.id;
    }

    setInput("");
    const userMsg: Message = { role: "user", text, id: `temp-${Date.now()}` };
    setMessages((m) => [...m, userMsg]);
    setLoading(true);
    setLatestCitations([]);

    // Persist user message
    fetch(`/api/threads/${threadId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "user", content: text }),
    }).catch(() => {});

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const data = await res.json();

      if (data.error) {
        const errorMsg: Message = {
          role: "assistant",
          error: data.error,
          id: `temp-${Date.now()}`,
        };
        setMessages((m) => [...m, errorMsg]);

        fetch(`/api/threads/${threadId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role: "assistant",
            content: "",
            error: data.error,
          }),
        }).catch(() => {});
      } else {
        const payload: AssistantPayload = {
          summary: data.summary ?? "",
          answers: data.answers ?? [],
          confidence: data.confidence ?? "Low",
          citations: data.citations ?? [],
        };
        const assistantMsg: Message = {
          role: "assistant",
          payload,
          id: `temp-${Date.now()}`,
        };
        setMessages((m) => [...m, assistantMsg]);
        setLatestCitations(payload.citations);

        const summaryText =
          payload.answers.map((a) => a.text).join("\n") || "AI response";
        fetch(`/api/threads/${threadId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role: "assistant",
            content: summaryText,
            payload,
          }),
        }).catch(() => {});
      }
    } catch {
      const errorMsg: Message = {
        role: "assistant",
        error: "Request failed. Please try again.",
        id: `temp-${Date.now()}`,
      };
      setMessages((m) => [...m, errorMsg]);
    } finally {
      setLoading(false);
      await fetchThreads();
    }
  };

  const lastSyncAge =
    syncStatus.lastSyncAt == null
      ? null
      : Date.now() - new Date(syncStatus.lastSyncAt).getTime();
  const showSyncBanner =
    lastSyncAge !== null && lastSyncAge > TWENTY_FOUR_HOURS_MS;
  const statusOptions = Array.from(
    new Set(tickets.map((t) => t.status).filter(Boolean))
  ).sort();

  return (
    <div className="app-grid">
      <Sidebar
        threads={threads}
        activeThreadId={activeThreadId}
        onNewChat={handleNewChat}
        onSelectThread={handleSelectThread}
        onRenameThread={handleRenameThread}
        onDeleteThread={handleDeleteThread}
        onDuplicateThread={handleDuplicateThread}
        tickets={tickets}
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        statusOptions={statusOptions}
        syncing={syncing}
        onSync={handleSync}
        syncStatus={syncStatus}
      />

      <main className="main-panel">
        {showSyncBanner && (
          <div className="banner">
            Last sync was {Math.round(lastSyncAge! / HOUR_MS)} hours ago.{" "}
            <button type="button" className="btn-link" onClick={handleSync}>
              Sync now?
            </button>
          </div>
        )}
        {activeThreadId && (
          <p className="system-note">
            AI-powered answers grounded strictly in synced Jira tickets. Every
            answer includes sources and a confidence score.
          </p>
        )}
        <ChatWindow
          messages={messages}
          loading={loading}
          hasActiveThread={activeThreadId !== null}
          onNewChat={handleNewChat}
        />
        {activeThreadId && (
          <ChatInput
            value={input}
            onChange={setInput}
            onSend={handleSend}
            disabled={loading}
          />
        )}
      </main>

      <aside className="citations-panel" aria-label="Citations">
        <h2 className="citations-title">Sources</h2>
        {latestCitations.length === 0 && (
          <p className="citations-empty">
            Ask a question to see sources from synced tickets.
          </p>
        )}
        {latestCitations.map((c) => (
          <div key={c.key} className="citation">
            <a
              href={c.url}
              target="_blank"
              rel="noopener noreferrer"
              className="citation-key"
            >
              {c.key}
            </a>
            <p className="citation-summary">{c.summary}</p>
            <p className="citation-snippet">{c.snippet}</p>
            <div className="citation-meta">
              {c.status && <span className="citation-status">{c.status}</span>}
              {c.updated && (
                <span>{new Date(c.updated).toLocaleDateString()}</span>
              )}
            </div>
          </div>
        ))}
      </aside>
    </div>
  );
}
