"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { api, type Repo, type Stats } from "@/lib/api";
import { SearchBar } from "@/components/search-bar";
import { RepoGrid } from "@/components/repo-grid";
import { SyncButton } from "@/components/sync-button";
import { NavHeader } from "@/components/nav-header";
import { Badge } from "@/components/ui/badge";
import { X, Loader2 } from "lucide-react";

const BATCH_SIZE = 50;

export default function Home() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [category, setCategory] = useState<string | null>(null);
  const [language, setLanguage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [total, setTotal] = useState(0);
  const offsetRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Load initial data or on filter change
  const loadData = useCallback(async () => {
    setLoading(true);
    offsetRef.current = 0;
    try {
      const [repoData, statsData] = await Promise.all([
        api.getRepos({
          category: category ?? undefined,
          language: language ?? undefined,
          q: query || undefined,
          limit: BATCH_SIZE,
          offset: 0,
        }),
        api.getStats(),
      ]);
      setRepos(repoData.repos);
      setTotal(repoData.total);
      setStats(statsData);
      offsetRef.current = repoData.repos.length;
      setHasMore(repoData.total > repoData.repos.length);
    } catch (e) {
      console.error("Failed to load:", e);
    } finally {
      setLoading(false);
    }
  }, [category, language, query]);

  // Load next batch on scroll
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const repoData = await api.getRepos({
        category: category ?? undefined,
        language: language ?? undefined,
        q: query || undefined,
        limit: BATCH_SIZE,
        offset: offsetRef.current,
      });
      setRepos((prev) => [...prev, ...repoData.repos]);
      setTotal(repoData.total);
      offsetRef.current += repoData.repos.length;
      setHasMore(repoData.total > offsetRef.current);
    } catch (e) {
      console.error("Failed to load more:", e);
    } finally {
      setLoadingMore(false);
    }
  }, [category, language, query, loadingMore, hasMore]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // IntersectionObserver to trigger loadMore when sentinel becomes visible
  useEffect(() => {
    if (!sentinelRef.current || !hasMore || loading || loadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, loadMore]);

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
      <NavHeader>
        {stats && (
          <span className="text-[11px] text-muted-foreground font-mono">
            {stats.total} repos
          </span>
        )}
        <SyncButton onSyncComplete={handleSyncComplete} />
      </NavHeader>

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

          {/* Sentinel for infinite scroll */}
          <div ref={sentinelRef} className="h-px" />

          {/* Loading more indicator */}
          {loadingMore && (
            <div className="flex items-center justify-center gap-2 py-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                Loading more...
              </span>
            </div>
          )}

          {/* End of list */}
          {!hasMore && repos.length > 0 && !loading && (
            <div className="flex justify-center py-6">
              <span className="text-xs text-muted-foreground/50">
                All {total} repos loaded
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
