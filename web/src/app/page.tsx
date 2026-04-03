"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { api, type Repo, type Stats, type FullStats } from "@/lib/api";
import { CATEGORY_COLORS, LANG_COLORS } from "@/lib/lang-colors";
import { formatStars, timeAgo } from "@/lib/format";
import { SearchBar } from "@/components/search-bar";
import { SyncButton } from "@/components/sync-button";
import { NavHeader } from "@/components/nav-header";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  X,
  Loader2,
  Star,
  GitFork,
  ExternalLink,
  Sparkles,
  Activity,
  Shield,
  Clock,
  ArrowUpRight,
  ChevronRight,
  TrendingUp,
  Code2,
  FolderTree,
  Tag,
} from "lucide-react";

const BATCH_SIZE = 50;

export default function Home() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [fullStats, setFullStats] = useState<FullStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [category, setCategory] = useState<string | null>(null);
  const [language, setLanguage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [total, setTotal] = useState(0);
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);
  const [similarRepos, setSimilarRepos] = useState<any[]>([]);
  const offsetRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    api.getFullStats().then(setFullStats).catch(() => {});
  }, []);

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
      offsetRef.current += repoData.repos.length;
      setHasMore(repoData.total > offsetRef.current);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMore(false);
    }
  }, [category, language, query, loadingMore, hasMore]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!sentinelRef.current || !hasMore || loading || loadingMore) return;
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore(); },
      { threshold: 0.1 }
    );
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [hasMore, loading, loadingMore, loadMore]);

  useEffect(() => {
    if (!selectedRepo) { setSimilarRepos([]); return; }
    api.getSimilar(selectedRepo.id, 5)
      .then((d) => setSimilarRepos(d.similar))
      .catch(() => setSimilarRepos([]));
  }, [selectedRepo]);

  const handleSyncComplete = useCallback(() => {
    loadData();
    api.getFullStats().then(setFullStats).catch(() => {});
  }, [loadData]);

  const hasFilters = category || language || query;

  // Derived data
  const categories = stats
    ? Object.entries(stats.by_category).sort(([, a], [, b]) => b - a)
    : [];
  const languages = stats
    ? Object.entries(stats.by_language).sort(([, a], [, b]) => b - a).slice(0, 12)
    : [];

  const timelineEntries = fullStats?.timeline
    ? Object.entries(fullStats.timeline).slice(-12)
    : [];
  const maxTimeline = Math.max(...timelineEntries.map(([, c]) => Number(c)), 1);

  const totalEdges = fullStats?.edges
    ? Object.values(fullStats.edges).reduce((a, b) => a + (b?.count || 0), 0)
    : 0;

  const topTopics = fullStats?.top_topics
    ? Object.entries(fullStats.top_topics).slice(0, 8)
    : [];

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <NavHeader>
        <SyncButton onSyncComplete={handleSyncComplete} />
      </NavHeader>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-[1400px] mx-auto px-6 py-5 space-y-5">

          {/* ── Hero metrics ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard icon={<Star className="h-4 w-4 text-primary" />} label="Repos" value={stats?.total ?? 0} />
            <MetricCard icon={<FolderTree className="h-4 w-4 text-primary" />} label="Categories" value={categories.length} />
            <MetricCard icon={<Code2 className="h-4 w-4 text-primary" />} label="Languages" value={languages.length} />
            <MetricCard icon={<GitFork className="h-4 w-4 text-primary" />} label="Connections" value={totalEdges} />
          </div>

          {/* ── Activity timeline + topics row ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {/* Timeline */}
            <div className="lg:col-span-2 rounded-xl border border-border/20 bg-card/20 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Activity className="h-3.5 w-3.5 text-muted-foreground/40" />
                  <span className="text-xs font-medium">Starring Activity</span>
                </div>
                {timelineEntries.length > 0 && (
                  <span className="text-[10px] text-muted-foreground/40 font-mono">
                    {timelineEntries[0][0]} — {timelineEntries[timelineEntries.length - 1][0]}
                  </span>
                )}
              </div>
              <div className="flex items-end gap-[3px] h-20">
                {timelineEntries.map(([month, count]) => (
                  <div
                    key={month}
                    className="flex-1 rounded-t bg-primary/40 hover:bg-primary/70 transition-colors cursor-default relative group"
                    style={{ height: `${Math.max(4, (Number(count) / maxTimeline) * 100)}%` }}
                  >
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 hidden group-hover:block text-[9px] text-foreground bg-popover border border-border rounded px-1.5 py-0.5 whitespace-nowrap z-10">
                      {month}: {String(count)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-1.5">
                <span className="text-[9px] text-muted-foreground/30 font-mono">{timelineEntries[0]?.[0]}</span>
                <span className="text-[9px] text-muted-foreground/30 font-mono">{timelineEntries[timelineEntries.length - 1]?.[0]}</span>
              </div>
            </div>

            {/* Top topics */}
            <div className="rounded-xl border border-border/20 bg-card/20 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Tag className="h-3.5 w-3.5 text-muted-foreground/40" />
                <span className="text-xs font-medium">Top Interests</span>
              </div>
              <div className="space-y-1.5">
                {topTopics.map(([topic, count]) => {
                  const maxT = Number(topTopics[0]?.[1]) || 1;
                  const pct = (Number(count) / maxT) * 100;
                  return (
                    <div key={topic} className="flex items-center gap-2 group">
                      <span className="text-xs text-muted-foreground/60 truncate flex-1 group-hover:text-foreground transition-colors">
                        {topic}
                      </span>
                      <div className="w-16 h-1 rounded-full bg-secondary/30 overflow-hidden shrink-0">
                        <div className="h-full rounded-full bg-primary/50" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[10px] text-muted-foreground/30 font-mono w-4 text-right">{String(count)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Category overview ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-muted-foreground/60">Categories</span>
              {hasFilters && (
                <button onClick={() => { setCategory(null); setLanguage(null); setQuery(""); }}
                  className="text-[10px] text-muted-foreground/40 hover:text-foreground">Clear filters</button>
              )}
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {categories.map(([name, count]) => (
                <button
                  key={name}
                  onClick={() => setCategory(category === name ? null : name)}
                  className={`shrink-0 rounded-lg border px-3 py-2 text-left transition-all min-w-[120px] ${
                    category === name
                      ? "border-primary/40 bg-primary/10 glow-sm"
                      : "border-border/20 bg-card/20 hover:border-border/40 hover:bg-card/40"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[name] || "#666" }} />
                    <span className="text-lg font-bold tabular-nums" style={{ color: category === name ? CATEGORY_COLORS[name] : undefined }}>
                      {count}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground/60 truncate leading-tight">{name}</p>
                </button>
              ))}
            </div>
          </div>

          {/* ── Language pills ── */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            {languages.map(([name, count]) => (
              <button
                key={name}
                onClick={() => setLanguage(language === name ? null : name)}
                className={`shrink-0 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-mono transition-all ${
                  language === name
                    ? "bg-primary/15 text-primary ring-1 ring-primary/30"
                    : "text-muted-foreground/40 hover:text-foreground hover:bg-secondary/40"
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: LANG_COLORS[name] || "#666" }} />
                {name}
                <span className="opacity-30">{count}</span>
              </button>
            ))}
          </div>

          {/* ── Search + active filters ── */}
          <div className="flex items-center gap-3">
            <div className="flex-1 max-w-md">
              <SearchBar onSearch={setQuery} placeholder="Search your stars..." />
            </div>
            {hasFilters && (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground/40 font-mono">{total} results</span>
                {category && (
                  <Badge variant="secondary" className="gap-1 cursor-pointer text-[10px] h-5" onClick={() => setCategory(null)}>
                    {category} <X className="h-2.5 w-2.5" />
                  </Badge>
                )}
                {language && (
                  <Badge variant="secondary" className="gap-1 cursor-pointer text-[10px] h-5" onClick={() => setLanguage(null)}>
                    {language} <X className="h-2.5 w-2.5" />
                  </Badge>
                )}
              </div>
            )}
          </div>

          {/* ── Repo cards grid ── */}
          {loading && repos.length === 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
          ) : repos.length === 0 ? (
            <div className="flex flex-col items-center py-16">
              <Sparkles className="h-8 w-8 text-muted-foreground/20 mb-3" />
              <p className="text-sm text-muted-foreground/50">No repos found</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {repos.map((repo) => (
                <button
                  key={repo.id}
                  onClick={() => setSelectedRepo(selectedRepo?.id === repo.id ? null : repo)}
                  className={`text-left rounded-xl border p-4 transition-all ${
                    selectedRepo?.id === repo.id
                      ? "border-primary/40 bg-primary/5 glow-sm"
                      : "border-border/20 bg-card/20 hover:border-border/40 hover:bg-card/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground/40">{repo.owner}</p>
                      <p className="text-sm font-semibold truncate">{repo.name}</p>
                    </div>
                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                      <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground/50 font-mono">
                        <Star className="h-2.5 w-2.5" /> {formatStars(repo.stargazers_count)}
                      </span>
                      <span className="text-[9px] font-mono" style={{
                        color: repo.health_score > 70 ? "#10b981" : repo.health_score > 40 ? "#f59e0b" : "#ef4444"
                      }}>
                        {repo.health_score}%
                      </span>
                    </div>
                  </div>
                  {repo.description && (
                    <p className="text-[11px] text-muted-foreground/50 line-clamp-2 mb-2 leading-relaxed">{repo.description}</p>
                  )}
                  <div className="flex items-center gap-2">
                    {repo.language && (
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground/40">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: LANG_COLORS[repo.language] || "#666" }} />
                        {repo.language}
                      </span>
                    )}
                    {repo.category && (
                      <span className="text-[9px] text-muted-foreground/30">{repo.category}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="h-px" />
          {loadingMore && (
            <div className="flex items-center justify-center gap-2 py-4">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary/40" />
              <span className="text-xs text-muted-foreground/40 font-mono">Loading more...</span>
            </div>
          )}
          {!hasMore && repos.length > 0 && !loading && (
            <p className="text-center text-[10px] text-muted-foreground/20 font-mono py-4">— {total} repos —</p>
          )}
        </div>
      </div>

      {/* ── Selected repo detail sidebar ── */}
      {selectedRepo && (
        <aside className="fixed right-0 top-12 bottom-0 w-[360px] border-l border-border/30 bg-background/95 backdrop-blur-md overflow-y-auto z-20 animate-fade-in-up">
          <div className="p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] text-muted-foreground/40">{selectedRepo.owner}</p>
                <h3 className="text-base font-semibold">{selectedRepo.name}</h3>
              </div>
              <button onClick={() => setSelectedRepo(null)} className="text-muted-foreground/40 hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>

            {selectedRepo.description && (
              <p className="text-xs text-muted-foreground leading-relaxed">{selectedRepo.description}</p>
            )}

            {selectedRepo.summary && (
              <div className="rounded-lg bg-primary/5 border border-primary/10 p-3">
                <p className="text-[10px] text-primary/60 font-medium mb-1 flex items-center gap-1"><Sparkles className="h-2.5 w-2.5" /> AI Summary</p>
                <p className="text-xs text-foreground/70 leading-relaxed">{selectedRepo.summary}</p>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              <MiniStat label="Stars" value={formatStars(selectedRepo.stargazers_count)} />
              <MiniStat label="Health" value={`${selectedRepo.health_score}%`} color={selectedRepo.health_score > 70 ? "#10b981" : selectedRepo.health_score > 40 ? "#f59e0b" : "#ef4444"} />
              <MiniStat label="Forks" value={formatStars(selectedRepo.forks_count)} />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {selectedRepo.language && (
                <Badge variant="secondary" className="text-[10px] gap-1">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: LANG_COLORS[selectedRepo.language] || "#666" }} />
                  {selectedRepo.language}
                </Badge>
              )}
              {selectedRepo.license && <Badge variant="secondary" className="text-[10px]">{selectedRepo.license}</Badge>}
              {selectedRepo.category && <Badge variant="outline" className="text-[10px]">{selectedRepo.category}</Badge>}
            </div>

            {selectedRepo.topics && selectedRepo.topics.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selectedRepo.topics.map((t) => (
                  <span key={t} className="rounded bg-secondary/30 px-1.5 py-0.5 text-[9px] text-muted-foreground/50">{t}</span>
                ))}
              </div>
            )}

            <a href={selectedRepo.html_url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
              <ExternalLink className="h-3 w-3" /> Open on GitHub
            </a>

            <Separator className="opacity-20" />

            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/40 font-medium mb-2">Similar repos</p>
              {similarRepos.length > 0 ? (
                <div className="space-y-1">
                  {similarRepos.map((r: any) => (
                    <a key={r.full_name || r.id} href={r.html_url || `https://github.com/${r.full_name}`}
                      target="_blank" rel="noopener noreferrer"
                      className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-secondary/30 transition-colors">
                      {r.language && <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: LANG_COLORS[r.language] || "#666" }} />}
                      <span className="text-xs truncate flex-1 group-hover:text-primary transition-colors">{r.full_name || r.name}</span>
                      <span className="text-[10px] text-muted-foreground/30 font-mono">{formatStars(r.stargazers_count || 0)}</span>
                      <ArrowUpRight className="h-2.5 w-2.5 text-muted-foreground/0 group-hover:text-muted-foreground/40 shrink-0" />
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground/30">Loading...</p>
              )}
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border/20 bg-card/20 p-3 flex items-center gap-3">
      <div className="h-9 w-9 rounded-lg bg-primary/8 flex items-center justify-center shrink-0">{icon}</div>
      <div>
        <p className="text-xl font-bold tabular-nums">{value.toLocaleString()}</p>
        <p className="text-[10px] text-muted-foreground/50">{label}</p>
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg bg-secondary/20 px-2.5 py-1.5 text-center">
      <p className="text-[10px] text-muted-foreground/40">{label}</p>
      <p className="text-sm font-semibold tabular-nums" style={color ? { color } : undefined}>{value}</p>
    </div>
  );
}
