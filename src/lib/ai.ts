import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Ticket } from "./data";

export type Confidence = "High" | "Medium" | "Low";

export interface AnswerBlock {
  text: string;
  sources: { key: string; url: string; summary: string }[];
}

export interface AIResult {
  summary: string;
  answers: AnswerBlock[];
  confidence: Confidence;
}

const SYSTEM_PROMPT = `You are a sharp, concise Jira knowledge assistant. You answer questions strictly from the Jira ticket context provided.

CORE RULES:
- Every answer MUST be grounded in the provided tickets. No external knowledge, no speculation.
- Treat ticket Descriptions and Comments/Replies equally. Solutions in comments are gold — surface them first.
- Be concise. Do NOT repeat ticket titles or restate what is already obvious.
- Merge related findings into one clear answer rather than listing every ticket separately.
- If a resolution or fix was found, lead with it — don't bury it.
- Only split into multiple answer blocks when the findings are genuinely distinct topics.
- If no relevant information exists, say so clearly.

RESPONSE FORMAT (strict JSON only — no code fences):
{
  "summary": "One sentence interpreting what the user is really asking.",
  "answers": [
    {
      "text": "Answer text using markdown: **bold** for key terms/categories, bullet lists (- item) for multiple points. Lead with the resolution or key finding. Do NOT include raw ticket titles or dump ticket fields.",
      "sourceKeys": ["DEV-123"]
    }
  ],
  "confidence": "High" | "Medium" | "Low"
}

ANSWER QUALITY GUIDELINES:
- Format with markdown: **bold** for categories/key terms, - bullet points for lists of causes or steps.
- Start with the most important finding or resolution.
- Write as a concise explanation, NOT as a ticket dump. Never show "SLA due date:", "Comments/Replies:", or raw ticket field labels.
- Include specific details (error names, steps taken, resolutions) from descriptions and comments.
- If multiple tickets say the same thing, cite all but write one consolidated answer.
- Avoid phrases like "According to the ticket" or "The ticket mentions" — just state the fact.
- Max 3 answer blocks. Prefer 1-2 tight answers over many scattered ones.

CONFIDENCE GUIDELINES:
- High: Direct answer explicitly in ticket(s), including from comments.
- Medium: Answer inferred from combining multiple tickets.
- Low: Partial or ambiguous information only.

If no relevant information is found, return:
{
  "summary": "Looking for information about this topic in Jira.",
  "answers": [{ "text": "No relevant information found in the synced Jira tickets.", "sourceKeys": [] }],
  "confidence": "Low"
}

IMPORTANT: Return ONLY raw JSON. No \`\`\`json blocks, no extra text.`;

function buildTicketContext(tickets: Ticket[]): string {
  return tickets
    .map((t) => {
      const parts = [
        `[${t.key}] ${t.summary}`,
        `Status: ${t.status}`,
        `Updated: ${t.updated}`,
        `URL: ${t.url}`,
      ];
      if (t.descriptionText) {
        parts.push(`Description: ${t.descriptionText.slice(0, 1000)}`);
      }
      if (t.commentsText) {
        parts.push(`Comments/Replies:\n${t.commentsText.slice(0, 1500)}`);
      }
      return parts.join("\n");
    })
    .join("\n---\n");
}

interface RawAIResponse {
  summary?: string;
  answers?: { text?: string; sourceKeys?: string[] }[];
  confidence?: string;
}

export async function synthesizeAnswer(
  question: string,
  relevantTickets: Ticket[],
  allTicketsByKey: Map<string, Ticket>
): Promise<AIResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return fallbackAnswer(relevantTickets, allTicketsByKey);
  }

  const modelName = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2000,
        responseMimeType: "application/json",
      },
    });

    const userMessage =
      `JIRA TICKETS:\n${buildTicketContext(relevantTickets)}\n\nQUESTION:\n${question}`;

    const result = await model.generateContent([
      { text: SYSTEM_PROMPT },
      { text: userMessage },
    ]);

    const raw = result.response.text();
    const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed: RawAIResponse = JSON.parse(cleaned);
    return mapRawToResult(parsed, allTicketsByKey);
  } catch (err) {
    console.error("Gemini call failed, falling back:", err);
    return fallbackAnswer(relevantTickets, allTicketsByKey);
  }
}

function mapRawToResult(
  raw: RawAIResponse,
  ticketMap: Map<string, Ticket>
): AIResult {
  const confidence = normalizeConfidence(raw.confidence);
  const summary = raw.summary?.trim() ?? "";

  if (!Array.isArray(raw.answers) || raw.answers.length === 0) {
    return {
      summary,
      answers: [{ text: "No relevant information found in the synced Jira tickets.", sources: [] }],
      confidence: "Low",
    };
  }

  const answers: AnswerBlock[] = raw.answers.map((a) => ({
    text: a.text ?? "",
    sources: (a.sourceKeys ?? [])
      .map((key) => {
        const t = ticketMap.get(key);
        return t
          ? { key: t.key, url: t.url, summary: t.summary }
          : { key, url: "", summary: "" };
      })
      .filter((s) => s.key),
  }));

  return { summary, answers, confidence };
}

function normalizeConfidence(val?: string): Confidence {
  const v = (val ?? "").toLowerCase();
  if (v === "high") return "High";
  if (v === "medium") return "Medium";
  return "Low";
}

function fallbackAnswer(
  tickets: Ticket[],
  _allMap: Map<string, Ticket>
): AIResult {
  if (tickets.length === 0) {
    return {
      summary: "",
      answers: [{ text: "No relevant information found in the synced Jira tickets.", sources: [] }],
      confidence: "Low",
    };
  }

  const answers: AnswerBlock[] = tickets.slice(0, 5).map((t) => {
    const desc = (t.descriptionText ?? "").trim().slice(0, 250);
    const comments = (t.commentsText ?? "").trim().slice(0, 250);
    const body = [desc, comments ? `Comments/Replies:\n${comments}` : ""]
      .filter(Boolean)
      .join("\n\n");
    return {
      text: body ? `${t.summary}\n\n${body}` : t.summary || t.key,
      sources: [{ key: t.key, url: t.url, summary: t.summary }],
    };
  });

  const confidence: Confidence =
    tickets.length === 1 ? "High" : tickets.length <= 3 ? "Medium" : "Low";

  return { summary: "", answers, confidence };
}
