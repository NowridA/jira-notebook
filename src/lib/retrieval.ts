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
  summary: string;
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
  "any", "me", "i", "we", "you", "they", "he", "she",
  // query filler words — not useful as search terms
  "get", "got", "show", "find", "list", "tell", "give", "see", "look",
  "recent", "latest", "new", "old", "current", "related",
  // generic Jira/tech words — every ticket has these, not discriminating
  "issue", "issues", "ticket", "tickets", "jira",
  "problem", "problems", "error", "errors", "bug", "bugs",
  "fix", "fixed", "fixing", "update", "updates", "change", "changes",
  "request", "requests", "task", "tasks", "work", "feature", "features",
  "please", "need", "needs", "want", "wants", "using", "used", "use",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s\-_/,.;:!?()[\]{}'"]+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

/**
 * Extract the most specific/important keywords from a query.
 * Also generates compound keywords from short (1-2 char) word + next word,
 * e.g. "i media" → "imedia" to handle brand names like "I Media" or "iMedia".
 * Longer tokens are treated as more specific.
 */
function extractKeywords(query: string): { tokens: string[]; primary: string[]; bigramSet: Set<string> } {
  const tokens = tokenize(query);
  if (tokens.length === 0) return { tokens: [], primary: [], bigramSet: new Set() };

  // Build bigrams: single/double-char word + following meaningful word
  // "i media" → "imedia", "e commerce" → "ecommerce", etc.
  const rawWords = query.toLowerCase().split(/[\s\-_/,.;:!?()[\]{}'"]+/).filter((w) => w.length > 0);
  const bigramSet = new Set<string>();
  for (let i = 0; i < rawWords.length - 1; i++) {
    const w1 = rawWords[i];
    const w2 = rawWords[i + 1];
    if (w1.length <= 2 && w2.length >= 3 && !STOP_WORDS.has(w2)) {
      bigramSet.add(w1 + w2);
    }
  }

  const allTokens = [...new Set([...tokens, ...bigramSet])];
  // Sort by length desc — longer words tend to be more domain-specific
  const sorted = [...allTokens].sort((a, b) => b.length - a.length);

  // Primary keywords: top 3 most specific terms
  const primary = sorted.slice(0, 3);

  return { tokens: allTokens, primary, bigramSet };
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
function scoreTicket(ticket: Ticket, query: string, enforceAnd = true): number {
  const queryLower = query.toLowerCase();
  const { tokens: queryTokens, primary, bigramSet } = extractKeywords(query);
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

  // Compact corpus (spaces stripped) — lets bigrams match "I Media" as "imedia"
  const compactCorpus = corpus.replace(/\s+/g, "");

  // Helpers: bigram keywords also check the space-stripped corpus
  const kwInCorpus = (kw: string) =>
    corpus.includes(kw) || (bigramSet.has(kw) && compactCorpus.includes(kw));
  const kwInSummary = (kw: string) =>
    summaryLower.includes(kw) ||
    (bigramSet.has(kw) && summaryLower.replace(/\s+/g, "").includes(kw));

  // Hard AND requirement: all primary keywords must be present somewhere in the ticket
  if (enforceAnd && primary.length >= 2) {
    if (!primary.every(kwInCorpus)) return 0;
  }

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
    if (kwInSummary(kw)) score += 2.5;   // in summary = very relevant
    else if (kwInCorpus(kw)) score += 1.0; // in description/comments
  }

  // General keyword coverage
  const corpusTokens = new Set(tokenize(corpus));
  let matchCount = 0;
  for (const word of queryTokens) {
    if (corpusTokens.has(word) || (bigramSet.has(word) && compactCorpus.includes(word))) matchCount++;
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
      summary: "",
      answers: [{ text: "No relevant information found in the synced Jira tickets.", sources: [] }],
      confidence: "Low",
      citations: [],
    };
  }

  const allByKey = new Map<string, Ticket>(tickets.map((t) => [t.key, t]));

  // First pass: strict AND (all primary keywords must match)
  let scored = tickets
    .map((t) => ({ ticket: t, score: scoreTicket(t, queryTrimmed, true) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  // If strict AND yields nothing, fall back to OR scoring so rare words don't block results
  if (scored.length === 0) {
    scored = tickets
      .map((t) => ({ ticket: t, score: scoreTicket(t, queryTrimmed, false) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  if (scored.length === 0) {
    return {
      summary: "",
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
    summary: aiResult.summary,
    answers: aiResult.answers,
    confidence: aiResult.confidence,
    citations,
  };
}
