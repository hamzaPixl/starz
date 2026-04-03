"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api, type ChatMessage, type ChatResponse, type Stats } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { NavHeader } from "@/components/nav-header";
import {
  Send,
  Sparkles,
  ExternalLink,
  User,
  Bot,
  Copy,
  Check,
  Star,
} from "lucide-react";

// ── Types ──

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: ChatResponse["sources"];
}

// ── Sub-components ──

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-secondary"
      aria-label="Copy message"
    >
      {copied ? (
        <Check className="h-3 w-3 text-green-400" />
      ) : (
        <Copy className="h-3 w-3 text-muted-foreground" />
      )}
    </button>
  );
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => (
          <p className="text-sm leading-relaxed mb-3 last:mb-0">{children}</p>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold text-foreground">{children}</strong>
        ),
        em: ({ children }) => (
          <em className="italic text-muted-foreground">{children}</em>
        ),
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:text-primary/80 underline underline-offset-2 transition-colors"
          >
            {children}
          </a>
        ),
        ul: ({ children }) => (
          <ul className="list-disc list-inside space-y-1.5 mb-3 text-sm">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-inside space-y-1.5 mb-3 text-sm">{children}</ol>
        ),
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        code: ({ className, children }) => {
          const isBlock = className?.includes("language-");
          if (isBlock) {
            return (
              <div className="my-3 rounded-lg bg-background/80 border border-border/30 overflow-hidden">
                <pre className="p-4 overflow-x-auto">
                  <code className="text-xs font-mono text-foreground/90">
                    {children}
                  </code>
                </pre>
              </div>
            );
          }
          return (
            <code className="rounded bg-background/60 px-1.5 py-0.5 text-xs font-mono text-primary/90">
              {children}
            </code>
          );
        },
        pre: ({ children }) => <>{children}</>,
        h1: ({ children }) => (
          <h1 className="text-lg font-semibold mb-2 mt-4">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-base font-semibold mb-2 mt-3">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-sm font-semibold mb-1.5 mt-2">{children}</h3>
        ),
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-primary/30 pl-4 my-3 text-muted-foreground italic">
            {children}
          </blockquote>
        ),
        hr: () => <hr className="my-4 border-border/30" />,
        table: ({ children }) => (
          <div className="my-3 overflow-x-auto rounded-lg border border-border/30">
            <table className="w-full text-sm">{children}</table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-secondary/30">{children}</thead>
        ),
        th: ({ children }) => (
          <th className="px-3 py-2 text-left font-medium text-muted-foreground text-xs">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="px-3 py-2 border-t border-border/20 text-sm">
            {children}
          </td>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function SourceChips({ sources }: { sources: ChatResponse["sources"] }) {
  return (
    <div className="mt-4 pt-3 border-t border-border/20">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-2 font-medium">
        Sources
      </p>
      <div className="flex flex-wrap gap-2">
        {sources.map((s, j) => (
          <a
            key={j}
            href={s.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-background/50 border border-border/30 px-3 py-1.5 text-xs text-muted-foreground hover:text-primary hover:border-primary/30 transition-all"
          >
            <ExternalLink className="h-3 w-3 shrink-0" />
            <span className="truncate max-w-[200px]">{s.full_name}</span>
            {s.category && (
              <span className="text-[10px] text-muted-foreground/40 ml-1">
                {s.category}
              </span>
            )}
          </a>
        ))}
      </div>
    </div>
  );
}

// ── Main page ──

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api.getStats().then(setStats).catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  const handleSend = useCallback(async () => {
    const query = input.trim();
    if (!query || loading) return;

    setMessages((prev) => [...prev, { role: "user", content: query }]);
    setInput("");
    setLoading(true);

    try {
      const history: ChatMessage[] = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const response = await api.chat(query, history);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: response.answer,
          sources: response.sources,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong. Try again." },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [input, loading, messages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestion = (q: string) => {
    setInput(q);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  return (
    <div className="h-screen flex flex-col">
      {/* ── Header ── */}
      <NavHeader>
        {stats && (
          <span className="text-[11px] text-muted-foreground font-mono">
            {stats.total} repos indexed
          </span>
        )}
      </NavHeader>

      {/* ── Messages ── */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
          {/* Empty state */}
          {messages.length === 0 && (
            <div className="py-16 space-y-8">
              <div className="text-center">
                <div className="mx-auto h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                  <Sparkles className="h-8 w-8 text-primary/50" />
                </div>
                <h2 className="text-xl font-semibold mb-1">
                  What are you looking for?
                </h2>
                <p className="text-sm text-muted-foreground">
                  Search across{" "}
                  {stats ? `${stats.total} starred repos` : "your starred repos"}{" "}
                  using natural language
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg mx-auto">
                {[
                  {
                    q: "What React UI libraries do I have?",
                    icon: <Star className="h-4 w-4" />,
                  },
                  {
                    q: "Find me a Python CLI framework",
                    icon: <Star className="h-4 w-4" />,
                  },
                  {
                    q: "Any DevOps tools for Docker?",
                    icon: <Star className="h-4 w-4" />,
                  },
                  {
                    q: "List my ML and AI repos",
                    icon: <Star className="h-4 w-4" />,
                  },
                ].map(({ q, icon }) => (
                  <button
                    key={q}
                    onClick={() => handleSuggestion(q)}
                    className="flex items-center gap-3 text-left rounded-xl border border-border/30 bg-secondary/20 px-4 py-3 text-sm text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-secondary/40 transition-all"
                  >
                    <span className="shrink-0 text-primary/40">{icon}</span>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {messages.map((msg, i) => (
            <div key={i} className="group">
              <div className="flex items-center gap-2.5 mb-2">
                {msg.role === "user" ? (
                  <>
                    <div className="h-6 w-6 rounded-full bg-primary/15 flex items-center justify-center">
                      <User className="h-3.5 w-3.5 text-primary/70" />
                    </div>
                    <span className="text-xs font-medium text-muted-foreground">
                      You
                    </span>
                  </>
                ) : (
                  <>
                    <div className="h-6 w-6 rounded-full bg-primary/15 flex items-center justify-center">
                      <Bot className="h-3.5 w-3.5 text-primary/70" />
                    </div>
                    <span className="text-xs font-medium text-muted-foreground">
                      Starz
                    </span>
                    <CopyButton text={msg.content} />
                  </>
                )}
              </div>

              <div className="pl-8">
                {msg.role === "user" ? (
                  <p className="text-sm text-foreground">{msg.content}</p>
                ) : (
                  <div className="text-foreground/90">
                    <MarkdownContent content={msg.content} />
                  </div>
                )}
                {msg.sources && msg.sources.length > 0 && (
                  <SourceChips sources={msg.sources} />
                )}
              </div>
            </div>
          ))}

          {/* Loading */}
          {loading && (
            <div>
              <div className="flex items-center gap-2.5 mb-2">
                <div className="h-6 w-6 rounded-full bg-primary/15 flex items-center justify-center">
                  <Bot className="h-3.5 w-3.5 text-primary/70" />
                </div>
                <span className="text-xs font-medium text-muted-foreground">
                  Starz
                </span>
              </div>
              <div className="pl-8 flex items-center gap-2">
                <div className="flex gap-1">
                  <span
                    className="h-2 w-2 rounded-full bg-primary/40 animate-bounce"
                    style={{ animationDelay: "0ms" }}
                  />
                  <span
                    className="h-2 w-2 rounded-full bg-primary/40 animate-bounce"
                    style={{ animationDelay: "150ms" }}
                  />
                  <span
                    className="h-2 w-2 rounded-full bg-primary/40 animate-bounce"
                    style={{ animationDelay: "300ms" }}
                  />
                </div>
                <span className="text-xs text-muted-foreground/40">
                  Searching your stars...
                </span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* ── Input bar ── */}
      <div className="shrink-0 border-t border-border/50 bg-background/95 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-6 py-4">
          <div className="flex gap-3 items-end rounded-xl border border-border/40 bg-secondary/20 p-2 focus-within:border-primary/30 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your starred repos..."
              disabled={loading}
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm placeholder:text-muted-foreground/40 focus:outline-none min-h-[24px] max-h-[120px] py-1 px-2"
              aria-label="Chat message"
            />
            <Button
              size="sm"
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="shrink-0 h-8 w-8 p-0 rounded-lg"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground/30 mt-2 text-center">
            Powered by Claude Sonnet &middot; Semantic search across your GitHub
            stars
          </p>
        </div>
      </div>
    </div>
  );
}
