"use client";

interface SourceItem {
  key: string;
  url: string;
  summary: string;
}

interface AnswerBlock {
  text: string;
  sources: SourceItem[];
}

type Confidence = "High" | "Medium" | "Low";

export interface AssistantPayload {
  answers: AnswerBlock[];
  confidence: Confidence;
  citations: CitationItem[];
}

export interface CitationItem {
  key: string;
  url: string;
  summary: string;
  snippet: string;
  status?: string;
  updated?: string;
}

export interface Message {
  id?: string;
  role: "user" | "assistant";
  content?: string;
  text?: string;
  payload?: AssistantPayload;
  error?: string;
  timestamp?: string;
}

function ConfidenceBadge({ level }: { level: Confidence }) {
  const cls =
    level === "High"
      ? "confidence-badge confidence-high"
      : level === "Medium"
        ? "confidence-badge confidence-medium"
        : "confidence-badge confidence-low";
  return <span className={cls}>Confidence: {level}</span>;
}

function AnswerBlockView({
  answer,
  index,
  total,
}: {
  answer: AnswerBlock;
  index: number;
  total: number;
}) {
  const label = total > 1 ? `Answer ${index + 1}:` : "Answer:";
  return (
    <div className="answer-block">
      <div className="answer-label">{label}</div>
      <div className="answer-text">{answer.text}</div>
      {answer.sources.length > 0 && (
        <div className="answer-sources">
          <span className="answer-source-label">Source:</span>
          {answer.sources.map((src) => (
            <div key={src.key} className="answer-source-item">
              <a
                href={src.url}
                target="_blank"
                rel="noopener noreferrer"
                className="answer-source-link"
              >
                {src.key}
              </a>
              {src.summary && (
                <span className="answer-source-title"> – {src.summary}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AssistantContent({ payload }: { payload: AssistantPayload }) {
  return (
    <div className="ai-response">
      {payload.answers.map((ans, i) => (
        <AnswerBlockView
          key={i}
          answer={ans}
          index={i}
          total={payload.answers.length}
        />
      ))}
      <ConfidenceBadge level={payload.confidence} />
    </div>
  );
}

export default function MessageBubble({ message }: { message: Message }) {
  const displayText = message.text ?? message.content ?? "";

  return (
    <div className={`message message-${message.role}`}>
      {message.role === "user" && (
        <div className="message-text">{displayText}</div>
      )}
      {message.role === "assistant" && message.error && (
        <div className="message-text message-error">Error: {message.error}</div>
      )}
      {message.role === "assistant" && message.payload && (
        <AssistantContent payload={message.payload} />
      )}
      {message.role === "assistant" &&
        !message.payload &&
        !message.error &&
        displayText && (
          <div className="message-text">{displayText}</div>
        )}
    </div>
  );
}
