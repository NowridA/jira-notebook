"use client";
import ReactMarkdown from "react-markdown";

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
  summary?: string;
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
  return (
    <div className="answer-block">
      {total > 1 && <div className="answer-label">Finding {index + 1}</div>}
      <div className="answer-text">
        <ReactMarkdown>{answer.text}</ReactMarkdown>
      </div>
      {answer.sources.length > 0 && (
        <div className="answer-sources">
          <span className="answer-source-label">Sources:</span>
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
      {payload.summary && (
        <div className="answer-summary">{payload.summary}</div>
      )}
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
