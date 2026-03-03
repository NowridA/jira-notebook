import { NextRequest, NextResponse } from "next/server";
import { duplicateThread } from "@/lib/threads";

interface Params {
  params: Promise<{ threadId: string }>;
}

export async function POST(_request: NextRequest, { params }: Params) {
  const { threadId } = await params;
  const newThread = duplicateThread(threadId);
  if (!newThread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }
  return NextResponse.json({ thread: newThread }, { status: 201 });
}
