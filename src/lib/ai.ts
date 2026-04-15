import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Ticket } from "./data";

export type Confidence = "High" | "Medium" | "Low";

export interface AnswerBlock {
  text: string;
  sources: { key: string; url: string; summary: string }[];
}

export interface AIResult {
  answers: AnswerBlock[];
  confidence: Confidence;
}

const SYSTEM_PROMPT = `You are an AI assistant that answers questions strictly based on synced Jira tickets.

CORE RULES:
- Every answer MUST be traceable to a Jira ticket provided in context.
- Do NOT use external knowledge. Do NOT assume anything not written in the tickets.
- No hallucinations. No speculation. No inferred business logic unless explicitly in ticket content.
- Each ticket may include a Description and Comments/Replies section — treat both as equally valid sources of information.
- Solutions, resolutions, and decisions found in Comments/Replies are especially valuable — surface these clearly.
- If multiple tickets contain relevant but distinct information, provide separate answers, each with its own source(s).
- Combine related ticket details when appropriate; remove redundancy; clarify ambiguities using only Jira content.
- Prioritize the most recent or most complete information if conflicts exist.
- If no relevant information exists, respond with exactly: "No relevant information found in the synced Jira tickets."

RESPONSE FORMAT (strict JSON only — no markdown, no code fences):
{
  "answers": [
    {
      "text": "Your answer here, structured and clear.",
      "sourceKeys": ["ABC-123", "ABC-456"]
    }
  ],
  "confidence": "High" | "Medium" | "Low"
}

CONFIDENCE GUIDELINES:
- High: Direct, explicit answer clearly stated in ticket(s).
- Medium: Answer derived from multiple ticket references but not explicitly stated in one place.
- Low: Partial information found; answer incomplete or somewhat ambiguous.

If no relevant information is found, return:
{
  "answers": [{ "text": "No relevant information found in the synced Jira tickets.", "sourceKeys": [] }],
  "confidence": "Low"
}

IMPORTANT: Return ONLY raw JSON. No markdown formatting, no \`\`\`json blocks, no extra text.`;

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

  if (!Array.isArray(raw.answers) || raw.answers.length === 0) {
    return {
      answers: [
        {
          text: "No relevant information found in the synced Jira tickets.",
          sources: [],
        },
      ],
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

  return { answers, confidence };
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
      answers: [
        {
          text: "No relevant information found in the synced Jira tickets.",
          sources: [],
        },
      ],
      confidence: "Low",
    };
  }

  const answers: AnswerBlock[] = tickets.slice(0, 7).map((t) => {
    const desc = (t.descriptionText ?? "").trim().slice(0, 300);
    const text = desc
      ? `${t.summary}\n\n${desc}`
      : t.summary || t.key;
    return {
      text,
      sources: [{ key: t.key, url: t.url, summary: t.summary }],
    };
  });

  const confidence: Confidence =
    tickets.length === 1 ? "High" : tickets.length <= 3 ? "Medium" : "Low";

  return { answers, confidence };
}
