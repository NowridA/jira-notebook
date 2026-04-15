import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const TICKETS_FILE = path.join(DATA_DIR, "tickets.json");
const SYNC_RUNS_FILE = path.join(DATA_DIR, "sync_runs.json");

const TICKETS_BLOB_PATH = "jira-notebook/tickets.json";
const SYNC_RUNS_BLOB_PATH = "jira-notebook/sync_runs.json";

export interface Ticket {
  key: string;
  url: string;
  summary: string;
  status: string;
  updated: string;
  descriptionText: string;
  commentsText?: string;
  raw?: unknown;
}

export interface SyncRun {
  at: string; // ISO
  count: number;
}

// ---------------------------------------------------------------------------
// Storage helpers — filesystem in dev, Vercel Blob in production
// ---------------------------------------------------------------------------

function isVercel(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

async function blobRead<T>(blobPath: string, fallback: T): Promise<T> {
  const { list } = await import("@vercel/blob");
  const { blobs } = await list({ prefix: blobPath });
  if (blobs.length === 0) return fallback;
  const res = await fetch(blobs[0].url, { cache: "no-store" });
  if (!res.ok) return fallback;
  try {
    const data = (await res.json()) as T;
    return data;
  } catch {
    return fallback;
  }
}

async function blobWrite(blobPath: string, data: unknown): Promise<void> {
  const { put } = await import("@vercel/blob");
  await put(blobPath, JSON.stringify(data), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
  });
}

// ---------------------------------------------------------------------------
// Filesystem helpers (local dev)
// ---------------------------------------------------------------------------

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function fsRead<T>(filePath: string, fallback: T): T {
  ensureDataDir();
  if (!fs.existsSync(filePath)) return fallback;
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function fsWrite(filePath: string, data: unknown): void {
  ensureDataDir();
  const tmp = `${filePath}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, filePath);
}

// ---------------------------------------------------------------------------
// Public API (all async)
// ---------------------------------------------------------------------------

export async function readTickets(): Promise<Ticket[]> {
  if (isVercel()) {
    const data = await blobRead<unknown>(TICKETS_BLOB_PATH, []);
    return Array.isArray(data) ? (data as Ticket[]) : [];
  }
  const data = fsRead<unknown>(TICKETS_FILE, []);
  return Array.isArray(data) ? (data as Ticket[]) : [];
}

export async function writeTickets(tickets: Ticket[]): Promise<void> {
  if (isVercel()) {
    await blobWrite(TICKETS_BLOB_PATH, tickets);
  } else {
    fsWrite(TICKETS_FILE, tickets);
  }
}

export async function upsertTickets(newTickets: Ticket[]): Promise<Ticket[]> {
  const existing = await readTickets();
  const byKey = new Map<string, Ticket>(existing.map((t) => [t.key, t]));
  for (const t of newTickets) {
    byKey.set(t.key, t);
  }
  const merged = Array.from(byKey.values()).sort((a, b) =>
    a.key.localeCompare(b.key)
  );
  await writeTickets(merged);
  return merged;
}

export async function readSyncRuns(): Promise<SyncRun[]> {
  if (isVercel()) {
    const data = await blobRead<unknown>(SYNC_RUNS_BLOB_PATH, []);
    return Array.isArray(data) ? (data as SyncRun[]) : [];
  }
  const data = fsRead<unknown>(SYNC_RUNS_FILE, []);
  return Array.isArray(data) ? (data as SyncRun[]) : [];
}

export async function appendSyncRun(run: SyncRun): Promise<void> {
  const runs = await readSyncRuns();
  runs.push(run);
  if (isVercel()) {
    await blobWrite(SYNC_RUNS_BLOB_PATH, runs);
  } else {
    fsWrite(SYNC_RUNS_FILE, runs);
  }
}

export async function getLatestSyncRun(): Promise<SyncRun | null> {
  const runs = await readSyncRuns();
  if (runs.length === 0) return null;
  return runs[runs.length - 1];
}
