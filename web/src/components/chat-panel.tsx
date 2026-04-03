"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api, type ChatMessage, type ChatResponse } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Sparkles, ExternalLink, User, Bot, Copy, Check } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: ChatResponse["sources"];
}

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
          <p className="text-[13px] leading-relaxed mb-2 last:mb-0">{children}</p>
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
          <ul className="list-disc list-inside space-y-1 mb-2 text-[13px]">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-inside space-y-1 mb-2 text-[13px]">{children}</ol>
        ),
        li: ({ children }) => (
          <li className="leading-relaxed">{children}</li>
        ),
        code: ({ className, children }) => {
          const isBlock = className?.includes("language-");
          if (isBlock) {
            return (
              <div className="my-2 rounded-md bg-background/80 border border-border/30 overflow-hidden">
                <pre className="p-3 overflow-x-auto">
                  <code className="text-xs font-mono text-foreground/90">{children}</code>
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
          <h1 className="text-base font-semibold mb-2 mt-3">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-sm font-semibold mb-1.5 mt-2">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-[13px] font-semibold mb-1 mt-2">{children}</h3>
        ),
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-primary/30 pl-3 my-2 text-muted-foreground italic text-[13px]">
            {children}
          </blockquote>
        ),
        hr: () => <hr className="my-3 border-border/30" />,
        table: ({ children }) => (
          <div className="my-2 overflow-x-auto rounded-md border border-border/30">
            <table className="w-full text-xs">{children}</table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-secondary/30">{children}</thead>
        ),
        th: ({ children }) => (
          <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">{children}</th>
        ),
        td: ({ children }) => (
          <td className="px-2 py-1.5 border-t border-border/20">{children}</td>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function SourceChips({ sources }: { sources: ChatResponse["sources"] }) {
  return (
    <div className="mt-3 pt-2 border-t border-border/20">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1.5 font-medium">
        Sources
      </p>
      <div className="flex flex-wrap gap-1.5">
        {sources.map((s, j) => (
          <a
            key={j}
            href={s.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md bg-background/50 border border-border/30 px-2 py-1 text-[11px] text-muted-foreground hover:text-primary hover:border-primary/30 transition-all"
          >
            <ExternalLink className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate max-w-[140px]">{s.full_name}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

export function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSend = useCallback(async () => {
    const query = input.trim();
    if (!query || loading) return;

    const userMsg: Message = { role: "user", content: query };
    setMessages((prev) => [...prev, userMsg]);
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
        { role: "assistant", content: response.answer, sources: response.sources },
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
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-md bg-primary/15 flex items-center justify-center">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Ask your stars</h2>
            <p className="text-[11px] text-muted-foreground">
              AI-powered search across {messages.length > 0 ? "your repos" : "315+ repos"}
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {messages.length === 0 && (
            <div className="py-8 space-y-4">
              <div className="text-center">
                <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                  <Sparkles className="h-6 w-6 text-primary/40" />
                </div>
                <p className="text-sm text-muted-foreground/60">
                  What are you looking for?
                </p>
              </div>

              <div className="space-y-2">
                {[
                  { q: "What React UI libraries do I have?", icon: "react" },
                  { q: "Find me a Python CLI framework", icon: "python" },
                  { q: "Any DevOps tools for Docker?", icon: "devops" },
                  { q: "List my ML and AI starred repos", icon: "ai" },
                ].map(({ q }) => (
                  <button
                    key={q}
                    onClick={() => handleSuggestion(q)}
                    className="w-full text-left rounded-lg border border-border/30 bg-secondary/20 px-3 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-secondary/40 transition-all"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className="group">
              {/* Role indicator */}
              <div className="flex items-center gap-2 mb-1.5">
                {msg.role === "user" ? (
                  <>
                    <div className="h-5 w-5 rounded-full bg-primary/15 flex items-center justify-center">
                      <User className="h-3 w-3 text-primary/70" />
                    </div>
                    <span className="text-[11px] font-medium text-muted-foreground">You</span>
                  </>
                ) : (
                  <>
                    <div className="h-5 w-5 rounded-full bg-primary/15 flex items-center justify-center">
                      <Bot className="h-3 w-3 text-primary/70" />
                    </div>
                    <span className="text-[11px] font-medium text-muted-foreground">Starz</span>
                    <CopyButton text={msg.content} />
                  </>
                )}
              </div>

              {/* Content */}
              <div className="pl-7">
                {msg.role === "user" ? (
                  <p className="text-[13px] text-foreground">{msg.content}</p>
                ) : (
                  <div className="text-foreground/90">
                    <MarkdownContent content={msg.content} />
                  </div>
                )}

                {/* Sources */}
                {msg.sources && msg.sources.length > 0 && (
                  <SourceChips sources={msg.sources} />
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <div className="h-5 w-5 rounded-full bg-primary/15 flex items-center justify-center">
                  <Bot className="h-3 w-3 text-primary/70" />
                </div>
                <span className="text-[11px] font-medium text-muted-foreground">Starz</span>
              </div>
              <div className="pl-7">
                <div className="flex items-center gap-1.5">
                  <div className="flex gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                  <span className="text-[11px] text-muted-foreground/40">Searching your stars...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="border-t border-border/50 p-3">
        <div className="flex gap-2 items-center">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your stars..."
            disabled={loading}
            className="text-[13px] bg-secondary/30 border-border/30 focus-visible:ring-primary/30"
            aria-label="Chat message"
          />
          <Button
            size="sm"
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="shrink-0 h-9 w-9 p-0"
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground/30 mt-1.5 text-center">
          Powered by Claude Sonnet
        </p>
      </div>
    </div>
  );
}
