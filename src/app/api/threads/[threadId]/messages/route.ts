import { NextRequest, NextResponse } from "next/server";
import { getThread, getMessages, addMessage } from "@/lib/threads";

interface Params {
  params: Promise<{ threadId: string }>;
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { threadId } = await params;
  const thread = getThread(threadId);
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }
  const messages = getMessages(threadId);
  return NextResponse.json({ messages });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { threadId } = await params;
  const thread = getThread(threadId);
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  let body: { role?: string; content?: string; payload?: unknown; error?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const role = body.role;
  if (role !== "user" && role !== "assistant") {
    return NextResponse.json(
      { error: "role must be 'user' or 'assistant'" },
      { status: 400 }
    );
  }
  const content = typeof body.content === "string" ? body.content : "";
  const message = addMessage(threadId, role, content, body.payload, body.error);
  return NextResponse.json({ message }, { status: 201 });
}
