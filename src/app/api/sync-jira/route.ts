import { NextResponse } from "next/server";
import { descriptionToPlainText } from "@/lib/jira-description";
import {
  type Ticket,
  upsertTickets,
  appendSyncRun,
} from "@/lib/data";

const REQUIRED_ENV = [
  "JIRA_BASE_URL",
  "JIRA_EMAIL",
  "JIRA_API_TOKEN",
  "JIRA_JQL",
] as const;

function getMissingEnv(): string[] {
  return REQUIRED_ENV.filter((key) => !process.env[key]?.trim());
}

interface JiraIssueResponse {
  key: string;
  fields: {
    summary?: string;
    status?: { name: string };
    updated?: string;
    description?: unknown;
  };
  self?: string;
}

const MAX_RESULTS_PER_PAGE = 50;
const MAX_PAGES = 100; // safety cap: 5000 tickets

const FIELDS = "summary,status,updated,description";

export async function POST() {
  const missing = getMissingEnv();
  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: "Missing required environment variables",
        missing,
      },
      { status: 400 }
    );
  }

  const baseUrl = process.env.JIRA_BASE_URL!.replace(/\/$/, "");
  const email = process.env.JIRA_EMAIL!;
  const token = process.env.JIRA_API_TOKEN!;
  const jql = process.env.JIRA_JQL!;

  const auth = Buffer.from(`${email}:${token}`).toString("base64");

  const allRawIssues: JiraIssueResponse[] = [];
  let startAt = 0;
  let totalFromApi: number | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      jql,
      maxResults: String(MAX_RESULTS_PER_PAGE),
      startAt: String(startAt),
      fields: FIELDS,
    });
    const url = `${baseUrl}/rest/api/3/search/jql?${params.toString()}`;

    let res: Response;
    try {
      res = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${auth}`,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { error: "Jira request failed", detail: message },
        { status: 500 }
      );
    }

    if (!res.ok) {
      const contentType = res.headers.get("content-type") ?? "";
      const text = await res.text();
      const responseSnippet = text.slice(0, 400);
      const errorPayload: {
        error: string;
        status: number;
        contentType: string;
        responseSnippet: string;
        responseJson?: unknown;
      } = {
        error: "Jira API error",
        status: res.status,
        contentType,
        responseSnippet,
      };
      if (contentType.toLowerCase().includes("application/json")) {
        try {
          errorPayload.responseJson = JSON.parse(text);
        } catch {
          // leave responseJson undefined if parse fails
        }
      }
      return NextResponse.json(errorPayload, { status: 500 });
    }

    let data: {
      issues?: JiraIssueResponse[];
      total?: number;
    };
    try {
      data = await res.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON from Jira API" },
        { status: 500 }
      );
    }

    const issues = data.issues ?? [];
    allRawIssues.push(...issues);

    if (typeof data.total === "number") totalFromApi = data.total;

    if (issues.length < MAX_RESULTS_PER_PAGE) break;
    startAt += issues.length;
    if (totalFromApi != null && allRawIssues.length >= totalFromApi) break;
  }

  const tickets: Ticket[] = allRawIssues.map((issue) => ({
    key: issue.key,
    url: `${baseUrl}/browse/${issue.key}`,
    summary: issue.fields?.summary ?? "",
    status: issue.fields?.status?.name ?? "",
    updated: issue.fields?.updated ?? "",
    descriptionText: descriptionToPlainText(issue.fields?.description),
    raw: issue.fields ?? undefined,
  }));

  upsertTickets(tickets);
  appendSyncRun({ at: new Date().toISOString(), count: tickets.length });

  const payload = {
    count: tickets.length,
    tickets: tickets.map((t) => ({
      key: t.key,
      summary: t.summary,
      status: t.status,
      updated: t.updated,
      url: t.url,
    })),
  };

  return NextResponse.json(payload);
}
