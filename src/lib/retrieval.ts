import { readTickets, type Ticket } from "./data";
import {
  synthesizeAnswer,
  type AIResult,
  type AnswerBlock,
  type Confidence,
} from "./ai";

export interface Citation {
  key: string;
  url: string;
  summary: string;
  snippet: string;
  status?: string;
  updated?: string;
}

export interface RetrievalResult {
  answers: { text: string; sources: { key: string; url: string; summary: string }[] }[];
  confidence: Confidence;
  citations: Citation[];
}

const MAX_CONTEXT_TICKETS = 40;
const SNIPPET_MAX_LEN = 200;

// Projects to search — comma-separated env var, e.g. "DEV" or "DEV,MCR"
// Empty = search all projects
const SEARCH_PROJECTS: Set<string> = (() => {
  const raw = process.env.JIRA_SEARCH_PROJECTS?.trim() ?? "";
  if (!raw) return new Set<string>();
  return new Set(raw.split(",").map((p) => p.trim().toUpperCase()).filter(Boolean));
})();

const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "to", "of", "in", "for",
  "on", "with", "at", "by", "from", "as", "into", "about", "like",
  "through", "after", "over", "between", "out", "against", "during",
  "without", "before", "under", "around", "among", "this", "that",
  "these", "those", "it", "its", "my", "your", "our", "their", "his",
  "her", "what", "which", "who", "whom", "how", "when", "where", "why",
  "all", "each", "every", "both", "few", "more", "most", "other",
  "some", "such", "no", "not", "only", "same", "so", "than", "too",
  "very", "just", "and", "but", "or", "if", "then", "else", "also",
  "any", "me", "i", "we", "you", "they", "he", "she", "get", "got",
  "show", "find", "list", "tell", "give", "see", "look", "recent",
  "latest", "new", "old", "current", "related", "issue", "ticket",
  "jira", "problem", "error", "issues", "tickets",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s\-_/,.;:!?()[\]{}'"]+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

/**
 * Extract the most specific/important keywords from a query.
 * Longer tokens are treated as more specific (e.g. "pagination" > "page").
 * Returns tokens sorted by specificity descending.
 */
function extractKeywords(query: string): { tokens: string[]; primary: string[] } {
  const tokens = tokenize(query);
  if (tokens.length === 0) return { tokens: [], primary: [] };

  // Sort by length desc — longer words tend to be more domain-specific
  const sorted = [...tokens].sort((a, b) => b.length - a.length);

  // Primary keywords: top 3 most specific terms
  const primary = sorted.slice(0, 3);

  return { tokens, primary };
}

/**
 * Score a ticket against the query using multiple signals:
 * - Exact ticket key match (highest)
 * - Phrase matching (consecutive query words found together)
 * - Primary keyword hits in summary (high weight — these are the specific terms)
 * - Primary keyword hits in description/comments
 * - General keyword coverage
 * - Recency bonus
 */
function scoreTicket(ticket: Ticket, query: string): number {
  const queryLower = query.toLowerCase();
  const { tokens: queryTokens, primary } = extractKeywords(query);
  if (queryTokens.length === 0) return 0;

  const summaryLower = (ticket.summary ?? "").toLowerCase();
  const corpus = [
    ticket.key ?? "",
    summaryLower,
    ticket.descriptionText ?? "",
    ticket.commentsText ?? "",
  ]
    .join(" ")
    .toLowerCase();

  let score = 0;

  // Exact ticket key match
  if (queryLower.includes(ticket.key.toLowerCase())) {
    score += 10;
  }

  // Phrase match in corpus
  if (queryTokens.length >= 2) {
    const phrase = queryTokens.join(" ");
    if (corpus.includes(phrase)) score += 5;
    // Partial phrase (primary keywords together)
    if (primary.length >= 2 && corpus.includes(primary.join(" "))) score += 3;
  }

  // Primary keyword hits — weighted higher when in summary
  for (const kw of primary) {
    if (summaryLower.includes(kw)) score += 2.5;   // in summary = very relevant
    else if (corpus.includes(kw)) score += 1.0;     // in description/comments
  }

  // General keyword coverage
  const corpusTokens = new Set(tokenize(corpus));
  let matchCount = 0;
  for (const word of queryTokens) {
    if (corpusTokens.has(word)) matchCount++;
  }
  score += (matchCount / queryTokens.length) * 2;

  // Recency bonus
  const updatedTime = new Date(ticket.updated).getTime();
  if (!isNaN(updatedTime)) {
    const ageDays = (Date.now() - updatedTime) / (1000 * 60 * 60 * 24);
    if (ageDays < 7) score += 0.5;
    else if (ageDays < 30) score += 0.3;
    else if (ageDays < 90) score += 0.1;
  }

  return score;
}

function getSnippet(ticket: Ticket): string {
  const s = (ticket.summary ?? "").trim();
  if (s.length > 0 && s.length <= SNIPPET_MAX_LEN) return s;
  if (s.length > SNIPPET_MAX_LEN) return s.slice(0, SNIPPET_MAX_LEN) + "…";
  const d = (ticket.descriptionText ?? "").trim();
  if (d.length <= SNIPPET_MAX_LEN) return d || ticket.key;
  return d.slice(0, SNIPPET_MAX_LEN) + "…";
}

/**
 * Filter tickets by project if JIRA_SEARCH_PROJECTS is set.
 * e.g. JIRA_SEARCH_PROJECTS=DEV restricts search to DEV-* tickets.
 */
function filterByProject(tickets: Ticket[]): Ticket[] {
  if (SEARCH_PROJECTS.size === 0) return tickets;
  return tickets.filter((t) => {
    const project = t.key.split("-")[0].toUpperCase();
    return SEARCH_PROJECTS.has(project);
  });
}

/**
 * Deep-scan synced tickets, rank by relevance, then use AI to
 * synthesize a grounded answer with sources and confidence scoring.
 */
export async function answerFromTickets(
  question: string
): Promise<RetrievalResult> {
  const allTickets = await readTickets();
  const tickets = filterByProject(allTickets);
  const queryTrimmed = question.trim();

  if (!queryTrimmed || tickets.length === 0) {
    return {
      answers: [{ text: "No relevant information found in the synced Jira tickets.", sources: [] }],
      confidence: "Low",
      citations: [],
    };
  }

  const allByKey = new Map<string, Ticket>(tickets.map((t) => [t.key, t]));

  const scored = tickets
    .map((t) => ({ ticket: t, score: scoreTicket(t, queryTrimmed) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return {
      answers: [{ text: "No relevant information found in the synced Jira tickets.", sources: [] }],
      confidence: "Low",
      citations: [],
    };
  }

  const contextTickets = scored
    .slice(0, MAX_CONTEXT_TICKETS)
    .map((x) => x.ticket);

  const aiResult: AIResult = await synthesizeAnswer(
    queryTrimmed,
    contextTickets,
    allByKey
  );

  const referencedKeys = new Set<string>();
  for (const ans of aiResult.answers) {
    for (const src of ans.sources) {
      referencedKeys.add(src.key);
    }
  }

  const citations: Citation[] = [];
  for (const key of referencedKeys) {
    const t = allByKey.get(key);
    if (t) {
      citations.push({
        key: t.key,
        url: t.url,
        summary: t.summary,
        snippet: getSnippet(t),
        status: t.status,
        updated: t.updated,
      });
    }
  }

  return {
    answers: aiResult.answers,
    confidence: aiResult.confidence,
    citations,
  };
}
