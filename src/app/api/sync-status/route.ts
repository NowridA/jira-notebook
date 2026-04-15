import { NextResponse } from "next/server";
import { getLatestSyncRun } from "@/lib/data";

export async function GET() {
  const run = await getLatestSyncRun();
  return NextResponse.json({
    lastSyncAt: run?.at ?? null,
    lastSyncCount: run?.count ?? null,
  });
}
