"use client";

import { useEffect, useState, useMemo } from "react";
import { api, type Repo, type Stats, type FullStats } from "@/lib/api";
import { CATEGORY_COLORS, LANG_COLORS } from "@/lib/lang-colors";
import { formatStars, timeAgo } from "@/lib/format";
import { NavHeader } from "@/components/nav-header";
import { SearchBar } from "@/components/search-bar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ExternalLink,
  Star,
  Loader2,
  X,
  GitFork,
  Heart,
  Clock,
  ArrowUpRight,
  ChevronRight,
  Sparkles,
  Activity,
  Shield,
} from "lucide-react";

interface CategoryCluster {
  name: string;
  count: number;
  color: string;
  repos: Repo[];
  topLanguages: { name: string; count: number; color: string }[];
  avgHealth: number;
  totalStars: number;
}

export default function ExplorePage() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [fullStats, setFullStats] = useState<FullStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);
  const [similarRepos, setSimilarRepos] = useState<Repo[]>([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [repoData, statsData, fullStatsData] = await Promise.all([
          api.getRepos({ limit: 200 }),
          api.getStats(),
          api.getFullStats(),
        ]);
        setRepos(repoData.repos);
        setStats(statsData);
        setFullStats(fullStatsData);
      } catch (e) {
        console.error("Failed to load:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Load similar when repo selected
  useEffect(() => {
    if (!selectedRepo) {
      setSimilarRepos([]);
      return;
    }
    setLoadingSimilar(true);
    api
      .getSimilar(selectedRepo.id, 6)
      .then((data) => setSimilarRepos(data.similar))
      .catch(() => setSimilarRepos([]))
      .finally(() => setLoadingSimilar(false));
  }, [selectedRepo]);

  // Build category clusters
  const clusters = useMemo(() => {
    if (!stats || repos.length === 0) return [];

    const grouped: Record<string, Repo[]> = {};
    for (const repo of repos) {
      const cat = repo.category || "Other";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(repo);
    }

    return Object.entries(grouped)
      .map(([name, catRepos]): CategoryCluster => {
        // Top languages in this category
        const langCounts: Record<string, number> = {};
        let totalStars = 0;
        let totalHealth = 0;
        for (const r of catRepos) {
          if (r.language) langCounts[r.language] = (langCounts[r.language] || 0) + 1;
          totalStars += r.stargazers_count;
          totalHealth += r.health_score || 0;
        }
        const topLanguages = Object.entries(langCounts)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 3)
          .map(([name, count]) => ({ name, count, color: LANG_COLORS[name] || "#666" }));

        return {
          name,
          count: catRepos.length,
          color: CATEGORY_COLORS[name] || "#6b7280",
          repos: catRepos.sort((a, b) => b.stargazers_count - a.stargazers_count),
          topLanguages,
          avgHealth: catRepos.length > 0 ? Math.round(totalHealth / catRepos.length) : 0,
          totalStars,
        };
      })
      .sort((a, b) => b.count - a.count);
  }, [repos, stats]);

  // Filter by search
  const filteredClusters = useMemo(() => {
    if (!searchQuery.trim()) return clusters;
    const q = searchQuery.toLowerCase();
    return clusters
      .map((c) => ({
        ...c,
        repos: c.repos.filter(
          (r) =>
            r.full_name.toLowerCase().includes(q) ||
            r.description?.toLowerCase().includes(q) ||
            r.language?.toLowerCase().includes(q) ||
            r.topics?.some((t) => t.toLowerCase().includes(q))
        ),
      }))
      .filter((c) => c.repos.length > 0);
  }, [clusters, searchQuery]);

  const activeCluster = selectedCategory
    ? filteredClusters.find((c) => c.name === selectedCategory)
    : null;

  const maxCount = clusters[0]?.count || 1;

  if (loading) {
    return (
      <div className="h-screen flex flex-col">
        <NavHeader />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <NavHeader>
        <span className="text-[11px] text-muted-foreground font-mono">
          {repos.length} repos &middot; {clusters.length} categories
        </span>
      </NavHeader>

      <div className="flex flex-1 min-h-0">
        {/* Left: Category map */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          {/* Search */}
          <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border/30 px-6 py-3">
            <div className="max-w-md">
              <SearchBar onSearch={setSearchQuery} placeholder="Search across all repos..." />
            </div>
          </div>

          <div className="px-6 py-5">
            {/* Category bubbles overview */}
            {!selectedCategory && (
              <>
                <div className="mb-6">
                  <h2 className="text-sm font-semibold mb-1">Your Knowledge Map</h2>
                  <p className="text-xs text-muted-foreground">
                    {repos.length} repos across {clusters.length} categories. Click to explore.
                  </p>
                </div>

                {/* Bubble grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 mb-8">
                  {filteredClusters.map((cluster) => {
                    const sizePct = Math.max(60, (cluster.count / maxCount) * 100);
                    return (
                      <button
                        key={cluster.name}
                        onClick={() => setSelectedCategory(cluster.name)}
                        className="group relative rounded-xl border border-border/30 bg-card/30 p-4 text-left transition-all hover:border-border/60 hover:bg-card/50 hover:glow-sm"
                      >
                        {/* Color accent bar */}
                        <div
                          className="absolute top-0 left-4 right-4 h-0.5 rounded-b-full opacity-60 group-hover:opacity-100 transition-opacity"
                          style={{ backgroundColor: cluster.color }}
                        />

                        <div className="flex items-start justify-between mb-2 mt-1">
                          <span
                            className="text-2xl font-bold tabular-nums"
                            style={{ color: cluster.color }}
                          >
                            {cluster.count}
                          </span>
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/0 group-hover:text-muted-foreground/50 transition-all" />
                        </div>

                        <p className="text-xs font-medium text-foreground/80 mb-2 leading-tight">
                          {cluster.name}
                        </p>

                        {/* Language dots */}
                        <div className="flex items-center gap-1">
                          {cluster.topLanguages.map((lang) => (
                            <span
                              key={lang.name}
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ backgroundColor: lang.color }}
                              title={`${lang.name}: ${lang.count}`}
                            />
                          ))}
                          <span className="text-[10px] text-muted-foreground/40 ml-1">
                            {formatStars(cluster.totalStars)} stars
                          </span>
                        </div>

                        {/* Health bar */}
                        <div className="mt-2 h-1 rounded-full bg-secondary/30 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${cluster.avgHealth}%`,
                              backgroundColor:
                                cluster.avgHealth > 70
                                  ? "#10b981"
                                  : cluster.avgHealth > 40
                                    ? "#f59e0b"
                                    : "#ef4444",
                            }}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Timeline sparkline */}
                {fullStats?.timeline && (
                  <div className="rounded-xl border border-border/30 bg-card/20 p-4 mb-6">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="text-xs font-medium">Starring Activity</h3>
                        <p className="text-[10px] text-muted-foreground">Monthly velocity</p>
                      </div>
                      <Activity className="h-3.5 w-3.5 text-muted-foreground/30" />
                    </div>
                    <div className="flex items-end gap-1 h-16">
                      {Object.entries(fullStats.timeline)
                        .slice(-12)
                        .map(([month, count]) => {
                          const maxH = Math.max(
                            ...Object.values(fullStats.timeline).map(Number),
                            1
                          );
                          return (
                            <div
                              key={month}
                              className="flex-1 rounded-t-sm bg-primary/40 hover:bg-primary/70 transition-colors cursor-default"
                              style={{
                                height: `${Math.max(4, (Number(count) / maxH) * 100)}%`,
                              }}
                              title={`${month}: ${count} repos`}
                            />
                          );
                        })}
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-[9px] text-muted-foreground/30">
                        {Object.keys(fullStats.timeline).slice(-12)[0]}
                      </span>
                      <span className="text-[9px] text-muted-foreground/30">
                        {Object.keys(fullStats.timeline).slice(-1)[0]}
                      </span>
                    </div>
                  </div>
                )}

                {/* Top topics cloud */}
                {fullStats?.top_topics && (
                  <div className="rounded-xl border border-border/30 bg-card/20 p-4">
                    <h3 className="text-xs font-medium mb-3">Topic Cloud</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(fullStats.top_topics)
                        .slice(0, 25)
                        .map(([topic, count], i) => {
                          const maxT = Number(Object.values(fullStats.top_topics)[0]) || 1;
                          const opacity = 0.3 + (Number(count) / maxT) * 0.7;
                          const size = 10 + (Number(count) / maxT) * 4;
                          return (
                            <span
                              key={topic}
                              className="rounded-md bg-primary/10 px-2 py-0.5 text-primary transition-colors hover:bg-primary/20 cursor-default"
                              style={{ fontSize: `${size}px`, opacity }}
                            >
                              {topic}
                              <span className="ml-1 opacity-50">{String(count)}</span>
                            </span>
                          );
                        })}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Drilled-in category view */}
            {selectedCategory && activeCluster && (
              <>
                <div className="mb-4 flex items-center gap-3">
                  <button
                    onClick={() => {
                      setSelectedCategory(null);
                      setSelectedRepo(null);
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    All categories
                  </button>
                  <ChevronRight className="h-3 w-3 text-muted-foreground/30" />
                  <span className="text-xs font-medium flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: activeCluster.color }}
                    />
                    {activeCluster.name}
                  </span>
                  <Badge variant="secondary" className="text-[10px] h-4">
                    {activeCluster.count} repos
                  </Badge>
                </div>

                {/* Category stats bar */}
                <div className="flex items-center gap-4 mb-4 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Star className="h-3 w-3" />
                    {formatStars(activeCluster.totalStars)} total stars
                  </span>
                  <span className="flex items-center gap-1">
                    <Shield className="h-3 w-3" />
                    Avg health: {activeCluster.avgHealth}%
                  </span>
                  <span className="flex items-center gap-1">
                    {activeCluster.topLanguages.map((l) => (
                      <span
                        key={l.name}
                        className="inline-flex items-center gap-0.5"
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: l.color }}
                        />
                        {l.name}
                      </span>
                    ))}
                  </span>
                </div>

                {/* Repos list */}
                <div className="space-y-1">
                  {activeCluster.repos.map((repo) => (
                    <button
                      key={repo.id}
                      onClick={() => setSelectedRepo(repo)}
                      className={`w-full text-left rounded-lg border px-4 py-3 transition-all ${
                        selectedRepo?.id === repo.id
                          ? "border-primary/40 bg-primary/5 glow-sm"
                          : "border-border/20 bg-card/20 hover:border-border/40 hover:bg-card/40"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] text-muted-foreground/40">
                              {repo.owner}
                            </span>
                            {repo.archived && (
                              <Badge variant="secondary" className="text-[9px] h-3.5 px-1 opacity-50">
                                archived
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm font-medium truncate">{repo.name}</p>
                          {repo.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                              {repo.description}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                            <Star className="h-2.5 w-2.5" />
                            {formatStars(repo.stargazers_count)}
                          </span>
                          {repo.health_score > 0 && (
                            <span
                              className="text-[9px] font-mono"
                              style={{
                                color:
                                  repo.health_score > 70
                                    ? "#10b981"
                                    : repo.health_score > 40
                                      ? "#f59e0b"
                                      : "#ef4444",
                              }}
                            >
                              {repo.health_score}%
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        {repo.language && (
                          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{
                                backgroundColor: LANG_COLORS[repo.language] || "#666",
                              }}
                            />
                            {repo.language}
                          </span>
                        )}
                        {repo.license && (
                          <span className="text-[10px] text-muted-foreground/40">
                            {repo.license}
                          </span>
                        )}
                        {repo.forks_count > 0 && (
                          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground/40">
                            <GitFork className="h-2.5 w-2.5" />
                            {formatStars(repo.forks_count)}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right: Selected repo detail + similar */}
        {selectedRepo && (
          <aside className="w-[340px] shrink-0 border-l border-border/50 bg-card/20 overflow-y-auto">
            <div className="p-4">
              <div className="flex items-start justify-between mb-3">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/40 font-medium">
                  Repo Detail
                </span>
                <button
                  onClick={() => setSelectedRepo(null)}
                  className="text-muted-foreground/40 hover:text-foreground transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Repo info */}
              <div className="space-y-3">
                <div>
                  <p className="text-[11px] text-muted-foreground">{selectedRepo.owner}</p>
                  <h3 className="text-base font-semibold">{selectedRepo.name}</h3>
                </div>

                {selectedRepo.description && (
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {selectedRepo.description}
                  </p>
                )}

                {selectedRepo.summary && selectedRepo.summary !== selectedRepo.description && (
                  <div className="rounded-lg bg-primary/5 border border-primary/10 p-2.5">
                    <p className="text-[10px] text-primary/60 font-medium mb-1 flex items-center gap-1">
                      <Sparkles className="h-2.5 w-2.5" /> AI Summary
                    </p>
                    <p className="text-xs text-foreground/70 leading-relaxed">
                      {selectedRepo.summary}
                    </p>
                  </div>
                )}

                {/* Metadata grid */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-md bg-secondary/20 px-2.5 py-1.5">
                    <p className="text-[10px] text-muted-foreground/50">Stars</p>
                    <p className="text-sm font-semibold tabular-nums">
                      {formatStars(selectedRepo.stargazers_count)}
                    </p>
                  </div>
                  <div className="rounded-md bg-secondary/20 px-2.5 py-1.5">
                    <p className="text-[10px] text-muted-foreground/50">Health</p>
                    <p
                      className="text-sm font-semibold tabular-nums"
                      style={{
                        color:
                          (selectedRepo.health_score || 0) > 70
                            ? "#10b981"
                            : (selectedRepo.health_score || 0) > 40
                              ? "#f59e0b"
                              : "#ef4444",
                      }}
                    >
                      {selectedRepo.health_score || 0}%
                    </p>
                  </div>
                  {selectedRepo.forks_count > 0 && (
                    <div className="rounded-md bg-secondary/20 px-2.5 py-1.5">
                      <p className="text-[10px] text-muted-foreground/50">Forks</p>
                      <p className="text-sm font-semibold tabular-nums">
                        {formatStars(selectedRepo.forks_count)}
                      </p>
                    </div>
                  )}
                  {selectedRepo.language && (
                    <div className="rounded-md bg-secondary/20 px-2.5 py-1.5">
                      <p className="text-[10px] text-muted-foreground/50">Language</p>
                      <p className="text-sm font-medium flex items-center gap-1">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{
                            backgroundColor: LANG_COLORS[selectedRepo.language] || "#666",
                          }}
                        />
                        {selectedRepo.language}
                      </p>
                    </div>
                  )}
                </div>

                {/* Tags */}
                {selectedRepo.topics && selectedRepo.topics.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {selectedRepo.topics.map((t) => (
                      <span
                        key={t}
                        className="rounded-md bg-secondary/30 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}

                <a
                  href={selectedRepo.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  Open on GitHub
                </a>
              </div>

              <Separator className="my-4 opacity-20" />

              {/* Similar repos */}
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/40 font-medium mb-2">
                  Similar repos
                </p>
                {loadingSimilar ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : similarRepos.length > 0 ? (
                  <div className="space-y-1">
                    {similarRepos.map((r: any) => (
                      <a
                        key={r.full_name || r.id}
                        href={r.html_url || `https://github.com/${r.full_name}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-secondary/30 transition-colors"
                      >
                        {r.language && (
                          <span
                            className="h-1.5 w-1.5 rounded-full shrink-0"
                            style={{
                              backgroundColor: LANG_COLORS[r.language] || "#666",
                            }}
                          />
                        )}
                        <span className="text-xs truncate flex-1 group-hover:text-primary transition-colors">
                          {r.full_name || r.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground/30 font-mono">
                          {formatStars(r.stargazers_count || r.stars || 0)}
                        </span>
                        <ArrowUpRight className="h-2.5 w-2.5 text-muted-foreground/0 group-hover:text-muted-foreground/40 transition-colors shrink-0" />
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground/30">No similar repos found</p>
                )}
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
