/**
 * Best-effort plain text from Jira description.
 * Jira API v3 returns description as Atlassian Document Format (ADF); v2 may return string or ADF.
 */
export function descriptionToPlainText(description: unknown): string {
  if (description == null) return "";
  if (typeof description === "string") return description.trim();
  if (typeof description !== "object") return String(description);
  const obj = description as { type?: string; content?: unknown[]; text?: string };
  if (obj.text) return obj.text.trim();
  if (!Array.isArray(obj.content)) return "";
  return obj.content.map(extractText).filter(Boolean).join(" ").trim();
}

function extractText(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  const n = node as { type?: string; text?: string; content?: unknown[] };
  if (n.text) return n.text;
  if (Array.isArray(n.content)) return n.content.map(extractText).join(" ");
  return "";
}
