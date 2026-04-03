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
  X, Loader2, Star, GitFork, ExternalLink, Sparkles, ArrowUpRight,
  Code2, FolderTree, Tag, ChevronRight, Shield, Activity,
} from "lucide-react";

const BATCH = 50;

export default function Home() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [full, setFull] = useState<FullStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [cat, setCat] = useState<string | null>(null);
  const [lang, setLang] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Repo | null>(null);
  const [similar, setSimilar] = useState<any[]>([]);
  const offset = useRef(0);
  const sentinel = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    offset.current = 0;
    try {
      const [r, s] = await Promise.all([
        api.getRepos({ category: cat ?? undefined, language: lang ?? undefined, q: query || undefined, limit: BATCH }),
        api.getStats(),
      ]);
      setRepos(r.repos); setTotal(r.total); setStats(s);
      offset.current = r.repos.length;
      setHasMore(r.total > r.repos.length);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [cat, lang, query]);

  useEffect(() => { api.getFullStats().then(setFull).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!selected) { setSimilar([]); return; }
    api.getSimilar(selected.id, 5).then(d => setSimilar(d.similar)).catch(() => setSimilar([]));
  }, [selected]);

  const more = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const r = await api.getRepos({ category: cat ?? undefined, language: lang ?? undefined, q: query || undefined, limit: BATCH, offset: offset.current });
      setRepos(p => [...p, ...r.repos]);
      offset.current += r.repos.length;
      setHasMore(r.total > offset.current);
    } catch (e) { console.error(e); }
    finally { setLoadingMore(false); }
  }, [cat, lang, query, loadingMore, hasMore]);

  useEffect(() => {
    if (!sentinel.current || !hasMore || loading || loadingMore) return;
    const o = new IntersectionObserver(e => { if (e[0].isIntersecting) more(); }, { threshold: 0.1 });
    o.observe(sentinel.current);
    return () => o.disconnect();
  }, [hasMore, loading, loadingMore, more]);

  const sync = useCallback(() => { load(); api.getFullStats().then(setFull).catch(() => {}); }, [load]);

  const categories = stats ? Object.entries(stats.by_category).sort(([, a], [, b]) => b - a) : [];
  const languages = stats ? Object.entries(stats.by_language).sort(([, a], [, b]) => b - a).slice(0, 14) : [];
  const topTopics = full?.top_topics ? Object.entries(full.top_topics).slice(0, 10) : [];
  const topOwners = full?.top_owners ? Object.entries(full.top_owners).slice(0, 6) : [];
  const totalEdges = full?.edges ? Object.values(full.edges).reduce((a, b) => a + (b?.count || 0), 0) : 0;
  const hasFilters = cat || lang || query;

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      <NavHeader>
        <SyncButton onSyncComplete={sync} />
      </NavHeader>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-8 py-8 space-y-10">

          {/* ═══════════ SECTION 1: Overview ═══════════ */}
          <section>
            <div className="flex items-end justify-between mb-6">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Your Stars</h1>
                <p className="text-sm text-muted-foreground/60 mt-1">
                  {stats?.total ?? "..."} repositories across {categories.length} categories and {languages.length} languages
                </p>
              </div>
              <div className="flex items-center gap-6 text-sm">
                <Stat icon={<Star className="h-4 w-4" />} value={stats?.total ?? 0} label="Repos" />
                <Stat icon={<FolderTree className="h-4 w-4" />} value={categories.length} label="Categories" />
                <Stat icon={<GitFork className="h-4 w-4" />} value={totalEdges} label="Connections" />
              </div>
            </div>

            {/* Category map */}
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5">
              {categories.map(([name, count]) => {
                const active = cat === name;
                const color = CATEGORY_COLORS[name] || "#6b7280";
                return (
                  <button
                    key={name}
                    onClick={() => setCat(active ? null : name)}
                    className={`relative rounded-xl border px-3 py-3 text-left transition-all ${
                      active ? "border-primary/50 bg-primary/8 glow-sm" : "border-border/15 bg-card/15 hover:bg-card/30 hover:border-border/30"
                    }`}
                  >
                    <div className="absolute top-0 left-3 right-3 h-[2px] rounded-b" style={{ backgroundColor: color, opacity: active ? 1 : 0.4 }} />
                    <p className="text-xl font-bold tabular-nums mt-1" style={{ color: active ? color : undefined }}>{count}</p>
                    <p className="text-[11px] text-muted-foreground/50 leading-tight mt-0.5 truncate">{name}</p>
                  </button>
                );
              })}
            </div>
          </section>

          {/* ═══════════ SECTION 2: Interests ═══════════ */}
          <section>
            <SectionHead title="Your Profile" subtitle="What you star the most" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Topics */}
              <div className="rounded-xl border border-border/15 bg-card/10 p-5">
                <p className="text-xs font-semibold text-muted-foreground/40 uppercase tracking-wider mb-4">Top Topics</p>
                <div className="space-y-2.5">
                  {topTopics.map(([topic, count]) => {
                    const max = Number(topTopics[0]?.[1]) || 1;
                    return (
                      <div key={topic} className="flex items-center gap-3">
                        <span className="text-sm text-muted-foreground/70 w-28 truncate">{topic}</span>
                        <div className="flex-1 h-2 rounded-full bg-secondary/20 overflow-hidden">
                          <div className="h-full rounded-full bg-primary/50 transition-all" style={{ width: `${(Number(count) / max) * 100}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground/30 font-mono w-6 text-right">{String(count)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Languages + Owners */}
              <div className="space-y-4">
                <div className="rounded-xl border border-border/15 bg-card/10 p-5">
                  <p className="text-xs font-semibold text-muted-foreground/40 uppercase tracking-wider mb-3">Languages</p>
                  <div className="flex flex-wrap gap-2">
                    {languages.map(([name, count]) => (
                      <button
                        key={name}
                        onClick={() => setLang(lang === name ? null : name)}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-all ${
                          lang === name ? "bg-primary/15 text-primary ring-1 ring-primary/30" : "bg-secondary/20 text-muted-foreground/60 hover:bg-secondary/40"
                        }`}
                      >
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: LANG_COLORS[name] || "#666" }} />
                        {name}
                        <span className="text-muted-foreground/30 font-mono text-[10px]">{count}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-border/15 bg-card/10 p-5">
                  <p className="text-xs font-semibold text-muted-foreground/40 uppercase tracking-wider mb-3">Favorite Creators</p>
                  <div className="space-y-1.5">
                    {topOwners.map(([name, count]) => (
                      <div key={name} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground/60">{name}</span>
                        <span className="text-xs text-muted-foreground/30 font-mono">{String(count)} repos</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ═══════════ SECTION 3: Browse ═══════════ */}
          <section>
            <SectionHead title="Browse" subtitle={hasFilters ? `${total} results` : "All your starred repos"} />

            {/* Search + filters */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 max-w-lg">
                <SearchBar onSearch={setQuery} placeholder="Search repos..." />
              </div>
              {hasFilters && (
                <div className="flex items-center gap-1.5">
                  {cat && <Badge variant="secondary" className="gap-1 cursor-pointer text-[11px]" onClick={() => setCat(null)}>{cat} <X className="h-2.5 w-2.5" /></Badge>}
                  {lang && <Badge variant="secondary" className="gap-1 cursor-pointer text-[11px]" onClick={() => setLang(null)}>{lang} <X className="h-2.5 w-2.5" /></Badge>}
                  <button onClick={() => { setCat(null); setLang(null); setQuery(""); }} className="text-[11px] text-muted-foreground/40 hover:text-foreground ml-1">Clear</button>
                </div>
              )}
            </div>

            {/* Repo cards */}
            {loading && repos.length === 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
              </div>
            ) : repos.length === 0 ? (
              <div className="text-center py-16">
                <Sparkles className="h-8 w-8 text-muted-foreground/15 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground/40">No repos match your filters</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {repos.map(repo => (
                  <RepoCard
                    key={repo.id}
                    repo={repo}
                    active={selected?.id === repo.id}
                    onClick={() => setSelected(selected?.id === repo.id ? null : repo)}
                  />
                ))}
              </div>
            )}

            <div ref={sentinel} className="h-px" />
            {loadingMore && (
              <div className="flex items-center justify-center gap-2 py-6">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary/40" />
                <span className="text-xs text-muted-foreground/30 font-mono">Loading more...</span>
              </div>
            )}
            {!hasMore && repos.length > 0 && !loading && (
              <p className="text-center text-[10px] text-muted-foreground/15 font-mono py-6">— {total} repos —</p>
            )}
          </section>
        </div>
      </div>

      {/* ═══════════ Detail Sidebar ═══════════ */}
      {selected && (
        <aside className="fixed right-0 top-12 bottom-0 w-[380px] border-l border-border/20 bg-background/98 backdrop-blur-lg overflow-y-auto z-20 animate-fade-in-up shadow-xl shadow-black/20">
          <div className="p-6 space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground/40">{selected.owner}</p>
                <h3 className="text-lg font-bold tracking-tight">{selected.name}</h3>
              </div>
              <button onClick={() => setSelected(null)} className="text-muted-foreground/30 hover:text-foreground transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            {selected.description && (
              <p className="text-sm text-muted-foreground/70 leading-relaxed">{selected.description}</p>
            )}

            {selected.summary && (
              <div className="rounded-xl bg-primary/5 border border-primary/10 p-4">
                <p className="text-[10px] font-semibold text-primary/50 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> AI Summary
                </p>
                <p className="text-sm text-foreground/70 leading-relaxed">{selected.summary}</p>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2.5">
              <MiniStat label="Stars" value={formatStars(selected.stargazers_count)} />
              <MiniStat label="Health" value={`${selected.health_score}%`} color={selected.health_score > 70 ? "#10b981" : selected.health_score > 40 ? "#f59e0b" : "#ef4444"} />
              <MiniStat label="Forks" value={formatStars(selected.forks_count)} />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {selected.language && (
                <Badge variant="secondary" className="gap-1.5 text-xs">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: LANG_COLORS[selected.language] || "#666" }} />
                  {selected.language}
                </Badge>
              )}
              {selected.license && <Badge variant="secondary" className="text-xs">{selected.license}</Badge>}
              {selected.category && <Badge variant="outline" className="text-xs">{selected.category}</Badge>}
            </div>

            {selected.topics?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selected.topics.map(t => (
                  <span key={t} className="rounded-md bg-secondary/25 px-2 py-0.5 text-[10px] text-muted-foreground/40">{t}</span>
                ))}
              </div>
            )}

            <a href={selected.html_url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline font-medium">
              <ExternalLink className="h-3.5 w-3.5" /> Open on GitHub
            </a>

            <Separator className="opacity-10" />

            <div>
              <p className="text-xs font-semibold text-muted-foreground/30 uppercase tracking-wider mb-3">Similar Repos</p>
              {similar.length > 0 ? (
                <div className="space-y-1">
                  {similar.map((r: any) => (
                    <a key={r.full_name || r.id} href={r.html_url || `https://github.com/${r.full_name}`}
                      target="_blank" rel="noopener noreferrer"
                      className="group flex items-center gap-2.5 rounded-lg px-3 py-2 hover:bg-secondary/20 transition-colors">
                      {r.language && <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: LANG_COLORS[r.language] || "#666" }} />}
                      <span className="text-sm truncate flex-1 group-hover:text-primary transition-colors">{r.full_name || r.name}</span>
                      <span className="text-xs text-muted-foreground/25 font-mono">{formatStars(r.stargazers_count || 0)}</span>
                      <ArrowUpRight className="h-3 w-3 text-muted-foreground/0 group-hover:text-muted-foreground/40 shrink-0" />
                    </a>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 py-2">
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/20" />
                  <span className="text-xs text-muted-foreground/25">Finding similar...</span>
                </div>
              )}
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}

/* ── Sub-components ── */

function SectionHead({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-xl font-bold tracking-tight">{title}</h2>
      <p className="text-sm text-muted-foreground/40 mt-0.5">{subtitle}</p>
    </div>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="flex items-center gap-2 text-muted-foreground/50">
      {icon}
      <span className="font-bold tabular-nums text-foreground">{value.toLocaleString()}</span>
      <span className="text-xs">{label}</span>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl bg-secondary/15 px-3 py-2.5 text-center">
      <p className="text-[10px] text-muted-foreground/35 mb-0.5">{label}</p>
      <p className="text-base font-bold tabular-nums" style={color ? { color } : undefined}>{value}</p>
    </div>
  );
}

function RepoCard({ repo, active, onClick }: { repo: Repo; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-xl border p-4 transition-all ${
        active ? "border-primary/40 bg-primary/5 glow-sm" : "border-border/15 bg-card/15 hover:border-border/30 hover:bg-card/30"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="text-[10px] text-muted-foreground/30">{repo.owner}</p>
          <p className="text-sm font-semibold truncate">{repo.name}</p>
        </div>
        <div className="flex flex-col items-end gap-0.5 shrink-0">
          <span className="flex items-center gap-1 text-xs text-muted-foreground/40 font-mono">
            <Star className="h-3 w-3" /> {formatStars(repo.stargazers_count)}
          </span>
          <span className="text-[10px] font-mono" style={{
            color: repo.health_score > 70 ? "#10b981" : repo.health_score > 40 ? "#f59e0b" : "#ef4444"
          }}>{repo.health_score}%</span>
        </div>
      </div>
      {repo.description && (
        <p className="text-xs text-muted-foreground/40 line-clamp-2 mb-2.5 leading-relaxed">{repo.description}</p>
      )}
      <div className="flex items-center gap-2">
        {repo.language && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground/35">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: LANG_COLORS[repo.language] || "#666" }} />
            {repo.language}
          </span>
        )}
        {repo.category && (
          <span className="text-[10px] text-muted-foreground/20 truncate">{repo.category}</span>
        )}
      </div>
    </button>
  );
}
