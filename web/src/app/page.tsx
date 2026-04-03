"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { api, type Repo, type Stats, type FullStats } from "@/lib/api";
import { CATEGORY_COLORS, LANG_COLORS } from "@/lib/lang-colors";
import { formatStars } from "@/lib/format";
import { SearchBar } from "@/components/search-bar";
import { SyncButton } from "@/components/sync-button";
import { NavHeader } from "@/components/nav-header";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  X, Loader2, Star, GitFork, ExternalLink, Sparkles, ArrowUpRight,
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
    setLoading(true); offset.current = 0;
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
    if (loadingMore || !hasMore) return; setLoadingMore(true);
    try {
      const r = await api.getRepos({ category: cat ?? undefined, language: lang ?? undefined, q: query || undefined, limit: BATCH, offset: offset.current });
      setRepos(p => [...p, ...r.repos]); offset.current += r.repos.length; setHasMore(r.total > offset.current);
    } catch (e) { console.error(e); } finally { setLoadingMore(false); }
  }, [cat, lang, query, loadingMore, hasMore]);

  useEffect(() => {
    if (!sentinel.current || !hasMore || loading || loadingMore) return;
    const o = new IntersectionObserver(e => { if (e[0].isIntersecting) more(); }, { threshold: 0.1 });
    o.observe(sentinel.current); return () => o.disconnect();
  }, [hasMore, loading, loadingMore, more]);

  const sync = useCallback(() => { load(); api.getFullStats().then(setFull).catch(() => {}); }, [load]);

  const categories = stats ? Object.entries(stats.by_category).sort(([, a], [, b]) => b - a) : [];
  const languages = stats ? Object.entries(stats.by_language).sort(([, a], [, b]) => b - a).slice(0, 14) : [];
  const topTopics = full?.top_topics ? Object.entries(full.top_topics).slice(0, 8) : [];
  const topOwners = full?.top_owners ? Object.entries(full.top_owners).slice(0, 5) : [];
  const totalEdges = full?.edges ? Object.values(full.edges).reduce((a, b) => a + (b?.count || 0), 0) : 0;
  const hasFilters = cat || lang || query;

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      <NavHeader><SyncButton onSyncComplete={sync} /></NavHeader>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-8 py-10 space-y-12">

          {/* ── Overview ── */}
          <section>
            <h1 className="text-4xl font-bold tracking-tight mb-8">Your Stars</h1>

            {/* Top categories as horizontal bar segments — proportional */}
            <div className="rounded-xl border border-border bg-card p-6 mb-6">
              <div className="flex h-8 rounded-lg overflow-hidden mb-4">
                {categories.map(([name, count]) => {
                  const pct = (count / (stats?.total || 1)) * 100;
                  if (pct < 1.5) return null;
                  return (
                    <button
                      key={name}
                      onClick={() => setCat(cat === name ? null : name)}
                      className={`relative transition-opacity ${cat && cat !== name ? "opacity-30" : "opacity-100 hover:opacity-80"}`}
                      style={{ width: `${pct}%`, backgroundColor: CATEGORY_COLORS[name] || "#6b7280" }}
                      title={`${name}: ${count}`}
                    />
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {categories.map(([name, count]) => {
                  const active = cat === name;
                  const color = CATEGORY_COLORS[name] || "#6b7280";
                  return (
                    <button
                      key={name}
                      onClick={() => setCat(active ? null : name)}
                      className={`flex items-center gap-2 text-sm transition-colors ${active ? "text-foreground font-semibold" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: color }} />
                      {name}
                      <span className="font-mono text-muted-foreground">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* ── Profile ── */}
          <section>
            <h2 className="text-2xl font-bold tracking-tight mb-2">Your Profile</h2>
            <p className="text-sm text-muted-foreground mb-6">What you star the most</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="rounded-xl border border-border bg-card p-6">
                <p className="text-sm font-semibold text-muted-foreground mb-5">Top Topics</p>
                <div className="space-y-3">
                  {topTopics.map(([topic, count]) => {
                    const max = Number(topTopics[0]?.[1]) || 1;
                    return (
                      <div key={topic} className="flex items-center gap-4">
                        <span className="text-sm text-foreground w-32 truncate">{topic}</span>
                        <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-primary/60" style={{ width: `${(Number(count) / max) * 100}%` }} />
                        </div>
                        <span className="text-sm text-muted-foreground font-mono w-8 text-right">{String(count)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-5">
                <div className="rounded-xl border border-border bg-card p-6">
                  <p className="text-sm font-semibold text-muted-foreground mb-4">Languages</p>
                  <div className="flex flex-wrap gap-2.5">
                    {languages.map(([name, count]) => (
                      <button key={name} onClick={() => setLang(lang === name ? null : name)}
                        className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all ${lang === name ? "bg-primary/15 text-primary ring-1 ring-primary/40" : "bg-muted text-muted-foreground hover:text-foreground hover:bg-accent"}`}>
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: LANG_COLORS[name] || "#666" }} />
                        {name}
                        <span className="text-muted-foreground font-mono text-xs">{count}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-card p-6">
                  <p className="text-sm font-semibold text-muted-foreground mb-4">Favorite Creators</p>
                  <div className="space-y-2.5">
                    {topOwners.map(([name, count]) => (
                      <div key={name} className="flex items-center justify-between">
                        <span className="text-sm text-foreground">{name}</span>
                        <span className="text-sm text-muted-foreground font-mono">{String(count)} repos</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ── Browse ── */}
          <section>
            <h2 className="text-2xl font-bold tracking-tight mb-2">Browse</h2>
            <p className="text-sm text-muted-foreground mb-6">{hasFilters ? `${total} results` : "All your starred repos"}</p>

            <div className="flex items-center gap-4 mb-6">
              <div className="flex-1 max-w-lg">
                <SearchBar onSearch={setQuery} placeholder="Search repos..." />
              </div>
              {hasFilters && (
                <div className="flex items-center gap-2">
                  {cat && <Badge variant="secondary" className="gap-1 cursor-pointer text-sm px-3 py-1" onClick={() => setCat(null)}>{cat} <X className="h-3 w-3" /></Badge>}
                  {lang && <Badge variant="secondary" className="gap-1 cursor-pointer text-sm px-3 py-1" onClick={() => setLang(null)}>{lang} <X className="h-3 w-3" /></Badge>}
                  <button onClick={() => { setCat(null); setLang(null); setQuery(""); }} className="text-sm text-muted-foreground hover:text-foreground ml-1">Clear</button>
                </div>
              )}
            </div>

            {loading && repos.length === 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
              </div>
            ) : repos.length === 0 ? (
              <div className="text-center py-20">
                <Sparkles className="h-10 w-10 text-muted-foreground/30 mx-auto mb-4" />
                <p className="text-base text-muted-foreground">No repos match your filters</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {repos.map(repo => (
                  <button key={repo.id} onClick={() => setSelected(selected?.id === repo.id ? null : repo)}
                    className={`text-left rounded-xl border p-5 transition-all ${selected?.id === repo.id ? "border-primary/60 bg-primary/8 glow-sm" : "border-border bg-card hover:bg-accent"}`}>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">{repo.owner}</p>
                        <p className="text-base font-semibold truncate">{repo.name}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="flex items-center gap-1 text-sm text-muted-foreground font-mono">
                          <Star className="h-3.5 w-3.5" /> {formatStars(repo.stargazers_count)}
                        </span>
                        <span className="text-xs font-mono" style={{
                          color: repo.health_score > 70 ? "#10b981" : repo.health_score > 40 ? "#f59e0b" : "#ef4444"
                        }}>{repo.health_score}%</span>
                      </div>
                    </div>
                    {repo.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-3 leading-relaxed">{repo.description}</p>
                    )}
                    <div className="flex items-center gap-3">
                      {repo.language && (
                        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: LANG_COLORS[repo.language] || "#666" }} />
                          {repo.language}
                        </span>
                      )}
                      {repo.category && <span className="text-xs text-muted-foreground">{repo.category}</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div ref={sentinel} className="h-px" />
            {loadingMore && (
              <div className="flex items-center justify-center gap-3 py-8">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Loading more...</span>
              </div>
            )}
            {!hasMore && repos.length > 0 && !loading && (
              <p className="text-center text-sm text-muted-foreground py-8">{total} repos loaded</p>
            )}
          </section>
        </div>
      </div>

      {/* ── Detail sidebar ── */}
      {selected && (
        <aside className="fixed right-0 top-12 bottom-0 w-[420px] border-l border-border bg-background overflow-y-auto z-20 animate-fade-in-up shadow-2xl shadow-black/30">
          <div className="p-8 space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{selected.owner}</p>
                <h3 className="text-2xl font-bold tracking-tight mt-1">{selected.name}</h3>
              </div>
              <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground p-1">
                <X className="h-5 w-5" />
              </button>
            </div>

            {selected.description && (
              <p className="text-base text-muted-foreground leading-relaxed">{selected.description}</p>
            )}

            {selected.summary && (
              <div className="rounded-xl bg-primary/8 border border-primary/15 p-5">
                <p className="text-xs font-semibold text-primary/70 uppercase tracking-wider mb-2">AI Summary</p>
                <p className="text-sm text-foreground/80 leading-relaxed">{selected.summary}</p>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-muted p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">Stars</p>
                <p className="text-xl font-bold tabular-nums">{formatStars(selected.stargazers_count)}</p>
              </div>
              <div className="rounded-xl bg-muted p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">Health</p>
                <p className="text-xl font-bold tabular-nums" style={{
                  color: selected.health_score > 70 ? "#10b981" : selected.health_score > 40 ? "#f59e0b" : "#ef4444"
                }}>{selected.health_score}%</p>
              </div>
              <div className="rounded-xl bg-muted p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">Forks</p>
                <p className="text-xl font-bold tabular-nums">{formatStars(selected.forks_count)}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {selected.language && (
                <Badge variant="secondary" className="gap-2 text-sm px-3 py-1">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: LANG_COLORS[selected.language] || "#666" }} />
                  {selected.language}
                </Badge>
              )}
              {selected.license && <Badge variant="secondary" className="text-sm px-3 py-1">{selected.license}</Badge>}
              {selected.category && <Badge variant="outline" className="text-sm px-3 py-1">{selected.category}</Badge>}
            </div>

            {selected.topics?.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selected.topics.map(t => (
                  <span key={t} className="rounded-lg bg-muted px-2.5 py-1 text-xs text-muted-foreground">{t}</span>
                ))}
              </div>
            )}

            <a href={selected.html_url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-base text-primary hover:underline font-medium">
              <ExternalLink className="h-4 w-4" /> Open on GitHub
            </a>

            <Separator />

            <div>
              <p className="text-sm font-semibold text-muted-foreground mb-4">Similar Repos</p>
              {similar.length > 0 ? (
                <div className="space-y-1">
                  {similar.map((r: any) => (
                    <a key={r.full_name || r.id} href={r.html_url || `https://github.com/${r.full_name}`}
                      target="_blank" rel="noopener noreferrer"
                      className="group flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted transition-colors">
                      {r.language && <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: LANG_COLORS[r.language] || "#666" }} />}
                      <span className="text-sm truncate flex-1 group-hover:text-primary transition-colors">{r.full_name || r.name}</span>
                      <span className="text-sm text-muted-foreground font-mono">{formatStars(r.stargazers_count || 0)}</span>
                      <ArrowUpRight className="h-4 w-4 text-transparent group-hover:text-muted-foreground shrink-0" />
                    </a>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Finding similar...</span>
                </div>
              )}
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}

