"use client";

import { useEffect, useState, useCallback } from "react";
import { api, type Repo, type Stats } from "@/lib/api";
import { SearchBar } from "@/components/search-bar";
import { RepoGrid } from "@/components/repo-grid";
import { ChatPanel } from "@/components/chat-panel";
import { SyncButton } from "@/components/sync-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  MessageCircle,
  X,
  Star,
  GitFork,
  Sparkles,
  LayoutGrid,
} from "lucide-react";

export default function Home() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<string | null>(null);
  const [language, setLanguage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [total, setTotal] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [view, setView] = useState<"grid" | "list">("grid");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [repoData, statsData] = await Promise.all([
        api.getRepos({
          category: category ?? undefined,
          language: language ?? undefined,
          q: query || undefined,
          limit: 100,
        }),
        api.getStats(),
      ]);
      setRepos(repoData.repos);
      setTotal(repoData.total);
      setStats(statsData);
    } catch (e) {
      console.error("Failed to load:", e);
    } finally {
      setLoading(false);
    }
  }, [category, language, query]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSyncComplete = useCallback(() => {
    loadData();
  }, [loadData]);

  const clearFilters = () => {
    setCategory(null);
    setLanguage(null);
    setQuery("");
  };

  const hasFilters = category || language || query;

  const categories = stats
    ? Object.entries(stats.by_category).sort(([, a], [, b]) => b - a)
    : [];
  const languages = stats
    ? Object.entries(stats.by_language)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 12)
    : [];

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Main dashboard */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center justify-between border-b border-border/50 px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold tracking-tight">Starz</h1>
            </div>
            {stats && (
              <span className="text-xs text-muted-foreground font-mono">
                {stats.total} repos
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <SyncButton onSyncComplete={handleSyncComplete} />
            <Button
              variant={chatOpen ? "default" : "ghost"}
              size="sm"
              onClick={() => setChatOpen(!chatOpen)}
              className="gap-1.5"
            >
              {chatOpen ? (
                <X className="h-4 w-4" />
              ) : (
                <MessageCircle className="h-4 w-4" />
              )}
              {chatOpen ? "Close" : "Ask AI"}
            </Button>
          </div>
        </header>

        {/* Search + filters strip */}
        <div className="border-b border-border/50 px-6 py-3 space-y-3">
          <div className="max-w-xl">
            <SearchBar
              onSearch={setQuery}
              placeholder="Search your stars..."
            />
          </div>

          {/* Category pills */}
          <div className="flex flex-wrap gap-1.5">
            {categories.map(([name, count]) => (
              <button
                key={name}
                onClick={() =>
                  setCategory(category === name ? null : name)
                }
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
                  category === name
                    ? "bg-primary text-primary-foreground glow-sm"
                    : "bg-secondary text-secondary-foreground hover:bg-accent"
                }`}
              >
                {name}
                <span className="opacity-50">{count}</span>
              </button>
            ))}
          </div>

          {/* Language pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {languages.map(([name, count]) => (
              <button
                key={name}
                onClick={() =>
                  setLanguage(language === name ? null : name)
                }
                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs transition-all font-mono ${
                  language === name
                    ? "bg-primary/20 text-primary ring-1 ring-primary/40"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                {name}
                <span className="opacity-40">{count}</span>
              </button>
            ))}
          </div>

          {/* Active filters summary */}
          {hasFilters && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {total} result{total !== 1 ? "s" : ""}
              </span>
              {category && (
                <Badge
                  variant="secondary"
                  className="gap-1 cursor-pointer"
                  onClick={() => setCategory(null)}
                >
                  {category}
                  <X className="h-3 w-3" />
                </Badge>
              )}
              {language && (
                <Badge
                  variant="secondary"
                  className="gap-1 cursor-pointer"
                  onClick={() => setLanguage(null)}
                >
                  {language}
                  <X className="h-3 w-3" />
                </Badge>
              )}
              <button
                onClick={clearFilters}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                Clear all
              </button>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <RepoGrid repos={repos} loading={loading} />
        </div>
      </div>

      {/* Chat panel — slide in from right */}
      {chatOpen && (
        <aside className="w-[400px] shrink-0 border-l border-border/50 bg-card/50">
          <ChatPanel />
        </aside>
      )}
    </div>
  );
}
