#!/usr/bin/env node
/**
 * Optional: trigger Jira sync by calling the app's API.
 * Requires the dev server to be running: npm run dev
 *
 * Usage: node scripts/sync-jira.mjs
 * Or:    node scripts/sync-jira.mjs http://localhost:3000
 */
const base = process.argv[2] || "http://localhost:3000";
const url = `${base.replace(/\/$/, "")}/api/sync-jira`;

async function main() {
  console.log("Calling", url, "...");
  const res = await fetch(url, { method: "POST" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("Sync failed:", res.status, data.error || data);
    process.exit(1);
  }
  console.log("Synced", data.count, "tickets.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
