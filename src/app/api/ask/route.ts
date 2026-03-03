import { NextRequest, NextResponse } from "next/server";
import { answerFromTickets } from "@/lib/retrieval";

export async function POST(request: NextRequest) {
  let body: { question?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }
  const question =
    typeof body.question === "string" ? body.question.trim() : "";
  if (!question) {
    return NextResponse.json(
      { error: "Missing or empty question" },
      { status: 400 }
    );
  }

  try {
    const result = await answerFromTickets(question);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Ask API error:", message);
    return NextResponse.json(
      { error: "Failed to generate answer", detail: message },
      { status: 500 }
    );
  }
}
