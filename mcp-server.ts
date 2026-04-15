#!/usr/bin/env node
/**
 * Jira Notebook MCP Server
 *
 * Exposes your synced Jira tickets as tools Claude can call directly.
 *
 * Setup (each team member):
 *   1. Add to ~/.claude/settings.json (or Claude Desktop config):
 *      {
 *        "mcpServers": {
 *          "jira-notebook": {
 *            "command": "npx",
 *            "args": ["tsx", "/path/to/jira-notebook/mcp-server.ts"],
 *            "env": { "JIRA_NOTEBOOK_URL": "https://your-app.vercel.app" }
 *          }
 *        }
 *      }
 *   2. Restart Claude Code / Claude Desktop
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE_URL = (process.env.JIRA_NOTEBOOK_URL ?? "http://localhost:3000").replace(/\/$/, "");

async function apiCall<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, options);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API error ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

const server = new McpServer({
  name: "jira-notebook",
  version: "1.0.0",
});

server.tool(
  "search_jira_tickets",
  "Search through synced Jira tickets and get an AI-generated answer grounded in ticket content, including comments and replies. Use this to find solutions, understand past decisions, look up bugs, or get context on any topic covered in Jira.",
  { question: z.string().describe("The question to answer using Jira ticket data") },
  async ({ question }) => {
    const data = await apiCall<{
      answers?: { text: string; sources: { key: string; url: string; summary: string }[] }[];
      confidence?: string;
      citations?: { key: string; url: string; summary: string; snippet: string; status?: string; updated?: string }[];
      error?: string;
    }>("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });

    if (data.error) {
      return { content: [{ type: "text", text: `Error: ${data.error}` }] };
    }

    const lines: string[] = [];

    for (const answer of data.answers ?? []) {
      lines.push(answer.text);
      if (answer.sources.length > 0) {
        lines.push("Sources: " + answer.sources.map((s) => `${s.key} (${s.url})`).join(", "));
      }
      lines.push("");
    }

    if (data.confidence) {
      lines.push(`Confidence: ${data.confidence}`);
    }

    if (data.citations && data.citations.length > 0) {
      lines.push("\nCited tickets:");
      for (const c of data.citations) {
        lines.push(`- [${c.key}] ${c.summary} — ${c.status ?? ""} — ${c.url}`);
        if (c.snippet) lines.push(`  "${c.snippet}"`);
      }
    }

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

server.tool(
  "list_jira_tickets",
  "Browse and filter synced Jira tickets. Use to find tickets by keyword, status, or date.",
  {
    query: z.string().optional().describe("Keyword to search in ticket key, summary, or description"),
    status: z.string().optional().describe("Filter by status (e.g. Open, Closed, In Progress)"),
    limit: z.number().optional().describe("Max tickets to return (default 20, max 100)"),
  },
  async ({ query, status, limit }) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (status) params.set("status", status);
    params.set("limit", String(Math.min(limit ?? 20, 100)));

    const data = await apiCall<{
      tickets: { key: string; url: string; summary: string; status: string; updated: string }[];
      total: number;
    }>(`/api/tickets?${params}`);

    const lines = [`Found ${data.total} matching tickets (showing ${data.tickets.length}):\n`];
    for (const t of data.tickets) {
      lines.push(`[${t.key}] ${t.summary}`);
      lines.push(`  Status: ${t.status} | Updated: ${t.updated}`);
      lines.push(`  ${t.url}`);
    }

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

server.tool(
  "get_jira_sync_status",
  "Check when Jira tickets were last synced and how many are stored.",
  {},
  async () => {
    const data = await apiCall<{ lastSyncAt: string | null; lastSyncCount: number | null }>("/api/sync-status");

    const lines: string[] = [];
    if (data.lastSyncAt) {
      const age = Date.now() - new Date(data.lastSyncAt).getTime();
      const hours = Math.round(age / (1000 * 60 * 60));
      lines.push(`Last synced: ${data.lastSyncAt} (${hours}h ago)`);
      lines.push(`Tickets stored: ${data.lastSyncCount?.toLocaleString() ?? "unknown"}`);
    } else {
      lines.push("Not yet synced. Trigger a sync from the web UI or call sync_jira_tickets.");
    }

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

server.tool(
  "sync_jira_tickets",
  "Trigger a full Jira sync. This fetches all tickets and comments from Jira and updates the shared database. May take several minutes for large datasets.",
  {},
  async () => {
    const data = await apiCall<{ count?: number; error?: string }>("/api/sync-jira", {
      method: "POST",
    });

    if (data.error) {
      return { content: [{ type: "text", text: `Sync failed: ${data.error}` }] };
    }

    return {
      content: [{ type: "text", text: `Sync complete. ${data.count?.toLocaleString() ?? 0} tickets synced.` }],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
