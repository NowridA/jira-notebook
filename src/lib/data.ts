import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const TICKETS_FILE = path.join(DATA_DIR, "tickets.json");
const SYNC_RUNS_FILE = path.join(DATA_DIR, "sync_runs.json");

export interface Ticket {
  key: string;
  url: string;
  summary: string;
  status: string;
  updated: string;
  descriptionText: string;
  raw?: unknown;
}

export interface SyncRun {
  at: string; // ISO
  count: number;
}

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/** Read tickets from disk. Returns empty array if file missing or invalid. */
export function readTickets(): Ticket[] {
  ensureDataDir();
  if (!fs.existsSync(TICKETS_FILE)) return [];
  try {
    const raw = fs.readFileSync(TICKETS_FILE, "utf-8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** Atomic write: write to temp file then rename. */
export function writeTickets(tickets: Ticket[]): void {
  ensureDataDir();
  const tmp = `${TICKETS_FILE}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(tickets, null, 2), "utf-8");
  fs.renameSync(tmp, TICKETS_FILE);
}

/** Upsert tickets by key. Merges into existing data. */
export function upsertTickets(newTickets: Ticket[]): Ticket[] {
  const existing = readTickets();
  const byKey = new Map<string, Ticket>(existing.map((t) => [t.key, t]));
  for (const t of newTickets) {
    byKey.set(t.key, t);
  }
  const merged = Array.from(byKey.values()).sort((a, b) =>
    a.key.localeCompare(b.key)
  );
  writeTickets(merged);
  return merged;
}

/** Read sync runs. Returns empty array if file missing or invalid. */
export function readSyncRuns(): SyncRun[] {
  ensureDataDir();
  if (!fs.existsSync(SYNC_RUNS_FILE)) return [];
  try {
    const raw = fs.readFileSync(SYNC_RUNS_FILE, "utf-8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** Append a sync run (atomic write). */
export function appendSyncRun(run: SyncRun): void {
  ensureDataDir();
  const runs = readSyncRuns();
  runs.push(run);
  const tmp = `${SYNC_RUNS_FILE}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(runs, null, 2), "utf-8");
  fs.renameSync(tmp, SYNC_RUNS_FILE);
}

/** Get the latest sync run (most recent by date). */
export function getLatestSyncRun(): SyncRun | null {
  const runs = readSyncRuns();
  if (runs.length === 0) return null;
  return runs[runs.length - 1];
}
