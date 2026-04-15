import { NextRequest, NextResponse } from "next/server";
import { readTickets } from "@/lib/data";

const DEFAULT_LIMIT = 50;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const q = searchParams.get("q")?.trim().toLowerCase() ?? "";
  const status = searchParams.get("status")?.trim() ?? "";
  const updatedSince = searchParams.get("updatedSince")?.trim() ?? "";
  const limit = Math.min(
    Math.max(1, parseInt(searchParams.get("limit") ?? "", 10) || DEFAULT_LIMIT),
    200
  );

  let tickets = await readTickets();

  if (q) {
    tickets = tickets.filter((t) => {
      const key = t.key.toLowerCase();
      const summary = (t.summary ?? "").toLowerCase();
      const desc = (t.descriptionText ?? "").toLowerCase();
      return key.includes(q) || summary.includes(q) || desc.includes(q);
    });
  }

  if (status) {
    tickets = tickets.filter(
      (t) => t.status?.toLowerCase() === status.toLowerCase()
    );
  }

  if (updatedSince) {
    const since = new Date(updatedSince).getTime();
    if (!Number.isNaN(since)) {
      tickets = tickets.filter((t) => new Date(t.updated).getTime() >= since);
    }
  }

  const total = tickets.length;
  const limited = tickets.slice(0, limit);

  return NextResponse.json({
    count: limited.length,
    total,
    tickets: limited.map((t) => ({
      key: t.key,
      url: t.url,
      summary: t.summary,
      status: t.status,
      updated: t.updated,
      descriptionText: t.descriptionText,
    })),
  });
}
