"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { api, type Repo, type Stats, type FullStats } from "@/lib/api";
import { SearchBar } from "@/components/search-bar";
import { RepoFeed } from "@/components/repo-feed";
import { StatsStrip } from "@/components/stats-strip";
import { InsightsPanel } from "@/components/insights-panel";
import { SyncButton } from "@/components/sync-button";
import { NavHeader } from "@/components/nav-header";
import { Badge } from "@/components/ui/badge";
import { X, Loader2, LayoutList, Rows3, Database } from "lucide-react";

const BATCH_SIZE = 50;

export default function Home() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [fullStats, setFullStats] = useState<FullStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [fullStatsLoading, setFullStatsLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [category, setCategory] = useState<string | null>(null);
  const [language, setLanguage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [total, setTotal] = useState(0);
  const [groupBy, setGroupBy] = useState<"category" | "none">("category");
  const offsetRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Load repos + basic stats on filter change
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

  // Load full stats once
  useEffect(() => {
    setFullStatsLoading(true);
    api
      .getFullStats()
      .then(setFullStats)
      .catch((e) => console.error("Failed to load full stats:", e))
      .finally(() => setFullStatsLoading(false));
  }, []);

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

  // IntersectionObserver to trigger loadMore when sentinel is visible
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
    api.getFullStats().then(setFullStats).catch(() => {});
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
      {/* Top bar */}
      <NavHeader>
        {stats && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50 font-mono">
            <Database className="h-3 w-3" />
            <span>{stats.total} repos</span>
          </div>
        )}
        <SyncButton onSyncComplete={handleSyncComplete} />
      </NavHeader>

      {/* Scrollable body */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* Stats strip */}
        <div className="shrink-0 px-6 pt-4 pb-3">
          <StatsStrip stats={fullStats} loading={fullStatsLoading} />
        </div>

        {/* Filter bar */}
        <div className="shrink-0 px-6 pb-2 space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex-1 max-w-md">
              <SearchBar
                onSearch={setQuery}
                placeholder="Search your stars..."
              />
            </div>

            {/* Group toggle */}
            <div className="hidden sm:flex items-center gap-0.5 rounded-lg border border-border/20 p-0.5 bg-secondary/20">
              <button
                type="button"
                onClick={() => setGroupBy("category")}
                className={`rounded-md px-2 py-1.5 text-xs transition-all ${
                  groupBy === "category"
                    ? "bg-background/80 text-foreground shadow-sm"
                    : "text-muted-foreground/50 hover:text-foreground"
                }`}
                aria-label="Group by category"
              >
                <Rows3 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setGroupBy("none")}
                className={`rounded-md px-2 py-1.5 text-xs transition-all ${
                  groupBy === "none"
                    ? "bg-background/80 text-foreground shadow-sm"
                    : "text-muted-foreground/50 hover:text-foreground"
                }`}
                aria-label="Flat list"
              >
                <LayoutList className="h-3.5 w-3.5" />
              </button>
            </div>

            {hasFilters && (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground/40 tabular-nums font-mono">
                  {total} result{total !== 1 ? "s" : ""}
                </span>
                {category && (
                  <Badge
                    variant="secondary"
                    className="gap-1 cursor-pointer text-[10px] h-5 bg-primary/10 text-primary hover:bg-primary/20 border-0"
                    onClick={() => setCategory(null)}
                  >
                    {category}
                    <X className="h-2.5 w-2.5" />
                  </Badge>
                )}
                {language && (
                  <Badge
                    variant="secondary"
                    className="gap-1 cursor-pointer text-[10px] h-5 bg-primary/10 text-primary hover:bg-primary/20 border-0"
                    onClick={() => setLanguage(null)}
                  >
                    {language}
                    <X className="h-2.5 w-2.5" />
                  </Badge>
                )}
                <button
                  onClick={clearFilters}
                  className="text-[10px] text-muted-foreground/40 hover:text-foreground ml-1 transition-colors"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>

          {/* Category + language pills */}
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none">
            {categories.map(([name, count]) => (
              <button
                key={name}
                onClick={() => setCategory(category === name ? null : name)}
                className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all ${
                  category === name
                    ? "bg-primary text-primary-foreground glow-sm"
                    : "bg-secondary/40 text-secondary-foreground/60 hover:bg-secondary/70 hover:text-foreground"
                }`}
              >
                {name}
                <span className="opacity-30 tabular-nums font-mono text-[10px]">
                  {count}
                </span>
              </button>
            ))}
            {categories.length > 0 && languages.length > 0 && (
              <div className="shrink-0 w-px h-4 bg-border/20 mx-1" />
            )}
            {languages.map(([name, count]) => (
              <button
                key={name}
                onClick={() => setLanguage(language === name ? null : name)}
                className={`shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-mono transition-all ${
                  language === name
                    ? "bg-primary/15 text-primary ring-1 ring-primary/30"
                    : "text-muted-foreground/40 hover:text-foreground hover:bg-secondary/40"
                }`}
              >
                {name}
                <span className="opacity-30 text-[10px]">{count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Two-column layout: feed + insights */}
        <div className="flex-1 min-h-0 flex">
          {/* Left: repo feed */}
          <div className="flex-1 min-w-0 overflow-y-auto border-t border-border/10">
            <div className="pb-4">
              <RepoFeed repos={repos} loading={loading} groupBy={groupBy} />

              {/* Sentinel for infinite scroll */}
              <div ref={sentinelRef} className="h-px" />

              {/* Loading more indicator */}
              {loadingMore && (
                <div className="flex items-center justify-center gap-2 py-6">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary/40" />
                  <span className="text-xs text-muted-foreground/40 font-mono">
                    Loading more...
                  </span>
                </div>
              )}

              {/* End of list */}
              {!hasMore && repos.length > 0 && !loading && (
                <div className="flex justify-center py-8">
                  <span className="text-[11px] text-muted-foreground/20 font-mono">
                    -- {total} repos loaded --
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Right: insights panel */}
          <aside className="hidden lg:block w-[300px] shrink-0 border-l border-t border-border/10 overflow-y-auto bg-card/10">
            <InsightsPanel stats={fullStats} loading={fullStatsLoading} />
          </aside>
        </div>
      </div>
    </div>
  );
}
