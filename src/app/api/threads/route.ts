import { NextRequest, NextResponse } from "next/server";
import { readThreads, createThread } from "@/lib/threads";

export async function GET() {
  const threads = readThreads();
  return NextResponse.json({ threads });
}

export async function POST(request: NextRequest) {
  let body: { title?: string } = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine
  }
  const thread = createThread(
    typeof body.title === "string" ? body.title.trim() || undefined : undefined
  );
  return NextResponse.json({ thread }, { status: 201 });
}
