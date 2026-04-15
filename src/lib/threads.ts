import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

const DATA_DIR = path.join(process.cwd(), "data");
const THREADS_FILE = path.join(DATA_DIR, "threads.json");
const MESSAGES_DIR = path.join(DATA_DIR, "messages");

export interface Thread {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastMessage?: string;
}

export interface ThreadMessage {
  id: string;
  threadId: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  payload?: unknown;
  error?: string;
}

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(MESSAGES_DIR)) fs.mkdirSync(MESSAGES_DIR, { recursive: true });
}

function atomicWrite(filePath: string, data: unknown): void {
  const tmp = `${filePath}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, filePath);
}

export function readThreads(): Thread[] {
  ensureDataDir();
  if (!fs.existsSync(THREADS_FILE)) return [];
  try {
    const raw = fs.readFileSync(THREADS_FILE, "utf-8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeThreads(threads: Thread[]): void {
  ensureDataDir();
  atomicWrite(THREADS_FILE, threads);
}

export function createThread(title?: string): Thread {
  const threads = readThreads();
  const now = new Date().toISOString();
  const thread: Thread = {
    id: randomUUID(),
    title: title || "New Chat",
    createdAt: now,
    updatedAt: now,
  };
  threads.unshift(thread);
  writeThreads(threads);
  return thread;
}

export function getThread(id: string): Thread | null {
  return readThreads().find((t) => t.id === id) ?? null;
}

export function updateThread(
  id: string,
  updates: Partial<Pick<Thread, "title">>
): Thread | null {
  const threads = readThreads();
  const idx = threads.findIndex((t) => t.id === id);
  if (idx === -1) return null;
  if (updates.title !== undefined) threads[idx].title = updates.title;
  threads[idx].updatedAt = new Date().toISOString();
  writeThreads(threads);
  return threads[idx];
}

export function deleteThread(id: string): boolean {
  const threads = readThreads();
  const filtered = threads.filter((t) => t.id !== id);
  if (filtered.length === threads.length) return false;
  writeThreads(filtered);
  const msgFile = messagesFilePath(id);
  if (fs.existsSync(msgFile)) fs.unlinkSync(msgFile);
  return true;
}

function messagesFilePath(threadId: string): string {
  return path.join(MESSAGES_DIR, `${threadId}.json`);
}

export function getMessages(threadId: string): ThreadMessage[] {
  ensureDataDir();
  const filePath = messagesFilePath(threadId);
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function addMessage(
  threadId: string,
  role: "user" | "assistant",
  content: string,
  payload?: unknown,
  error?: string
): ThreadMessage {
  ensureDataDir();
  const messages = getMessages(threadId);
  const msg: ThreadMessage = {
    id: randomUUID(),
    threadId,
    role,
    content,
    timestamp: new Date().toISOString(),
    ...(payload !== undefined && { payload }),
    ...(error !== undefined && { error }),
  };
  messages.push(msg);
  atomicWrite(messagesFilePath(threadId), messages);

  const threads = readThreads();
  const idx = threads.findIndex((t) => t.id === threadId);
  if (idx !== -1) {
    threads[idx].updatedAt = msg.timestamp;
    const preview = role === "user" ? content : content || "AI response";
    threads[idx].lastMessage =
      preview.slice(0, 80) + (preview.length > 80 ? "…" : "");
    if (
      role === "user" &&
      messages.filter((m) => m.role === "user").length === 1
    ) {
      threads[idx].title =
        content.slice(0, 60) + (content.length > 60 ? "…" : "");
    }
    writeThreads(threads);
  }

  return msg;
}

export function duplicateThread(threadId: string): Thread | null {
  const original = getThread(threadId);
  if (!original) return null;
  const newThread = createThread(`${original.title} (copy)`);
  const messages = getMessages(threadId);
  if (messages.length > 0) {
    const newMessages = messages.map((m) => ({
      ...m,
      id: randomUUID(),
      threadId: newThread.id,
    }));
    atomicWrite(messagesFilePath(newThread.id), newMessages);
    const last = newMessages[newMessages.length - 1];
    updateThread(newThread.id, {});
    const threads = readThreads();
    const idx = threads.findIndex((t) => t.id === newThread.id);
    if (idx !== -1) {
      threads[idx].lastMessage = last.content.slice(0, 80);
      writeThreads(threads);
    }
  }
  return newThread;
}
