import { NextRequest, NextResponse } from "next/server";
import { getThread, updateThread, deleteThread } from "@/lib/threads";

interface Params {
  params: Promise<{ threadId: string }>;
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { threadId } = await params;
  const thread = getThread(threadId);
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }
  return NextResponse.json({ thread });
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { threadId } = await params;
  let body: { title?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const updated = updateThread(threadId, { title: body.title });
  if (!updated) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }
  return NextResponse.json({ thread: updated });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { threadId } = await params;
  const deleted = deleteThread(threadId);
  if (!deleted) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
