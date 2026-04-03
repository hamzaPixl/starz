"use client";

import { useEffect, useState, useCallback } from "react";
import { api, type Repo, type Stats } from "@/lib/api";
import { SearchBar } from "@/components/search-bar";
import { RepoGrid } from "@/components/repo-grid";
import { SyncButton } from "@/components/sync-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageCircle, X, Sparkles } from "lucide-react";

export default function Home() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<string | null>(null);
  const [language, setLanguage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [total, setTotal] = useState(0);

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
    <div className="h-screen flex flex-col overflow-hidden">
      {/* ── Top bar ── */}
      <header className="shrink-0 flex items-center justify-between border-b border-border/50 px-6 h-12">
        <div className="flex items-center gap-3">
          <Sparkles className="h-4 w-4 text-primary" />
          <h1 className="text-sm font-semibold tracking-tight">Starz</h1>
          {stats && (
            <span className="text-[11px] text-muted-foreground font-mono">
              {stats.total} repos
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <SyncButton onSyncComplete={handleSyncComplete} />
          <a href="/chat/">
            <Button variant="ghost" size="sm" className="gap-1.5 h-8 text-xs">
              <MessageCircle className="h-3.5 w-3.5" />
              Ask AI
            </Button>
          </a>
        </div>
      </header>

      {/* ── Scrollable body ── */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Sticky filter bar */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border/30 px-6 py-3 space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex-1 max-w-md">
              <SearchBar onSearch={setQuery} placeholder="Search your stars..." />
            </div>
            {hasFilters && (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {total} result{total !== 1 ? "s" : ""}
                </span>
                {category && (
                  <Badge
                    variant="secondary"
                    className="gap-1 cursor-pointer text-[11px] h-5"
                    onClick={() => setCategory(null)}
                  >
                    {category}
                    <X className="h-2.5 w-2.5" />
                  </Badge>
                )}
                {language && (
                  <Badge
                    variant="secondary"
                    className="gap-1 cursor-pointer text-[11px] h-5"
                    onClick={() => setLanguage(null)}
                  >
                    {language}
                    <X className="h-2.5 w-2.5" />
                  </Badge>
                )}
                <button
                  onClick={clearFilters}
                  className="text-[11px] text-muted-foreground hover:text-foreground ml-1"
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          {/* Category + language pills on one row */}
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none">
            {categories.map(([name, count]) => (
              <button
                key={name}
                onClick={() => setCategory(category === name ? null : name)}
                className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-all ${
                  category === name
                    ? "bg-primary text-primary-foreground glow-sm"
                    : "bg-secondary/70 text-secondary-foreground hover:bg-accent"
                }`}
              >
                {name}
                <span className="opacity-40">{count}</span>
              </button>
            ))}
            {categories.length > 0 && languages.length > 0 && (
              <div className="shrink-0 w-px h-4 bg-border/50 mx-1" />
            )}
            {languages.map(([name, count]) => (
              <button
                key={name}
                onClick={() => setLanguage(language === name ? null : name)}
                className={`shrink-0 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-mono transition-all ${
                  language === name
                    ? "bg-primary/20 text-primary ring-1 ring-primary/40"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/70"
                }`}
              >
                {name}
                <span className="opacity-40">{count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Repo grid */}
        <div className="px-6 py-4">
          <RepoGrid repos={repos} loading={loading} />
        </div>
      </div>
    </div>
  );
}
