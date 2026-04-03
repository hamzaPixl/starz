"use client";

import { useEffect, useState } from "react";
import { api, type FullStats } from "@/lib/api";
import { CATEGORY_COLORS, LANG_COLORS } from "@/lib/lang-colors";
import { formatStars } from "@/lib/format";
import { NavHeader } from "@/components/nav-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Loader2, TrendingUp, TrendingDown, Star, Shield, AlertTriangle,
  Zap, ExternalLink, Layers,
} from "lucide-react";

export default function DiscoverPage() {
  const [trends, setTrends] = useState<any>(null);
  const [freshness, setFreshness] = useState<any>(null);
  const [ecosystems, setEcosystems] = useState<any>(null);
  const [digest, setDigest] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [t, f, e, d] = await Promise.all([
          api.getTrends(),
          api.getFreshness(),
          api.getEcosystems(),
          api.getDigest(30),
        ]);
        setTrends(t); setFreshness(f); setEcosystems(e); setDigest(d);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    load();
  }, []);

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

  const timeline = trends?.timeline ?? [];
  const maxT = Math.max(...timeline.map((t: any) => t.count), 1);
  const accelerating = trends?.accelerating ?? [];
  const declining = trends?.declining ?? [];
  const hotTopics = trends?.hot_topics ?? [];
  const ecoPairs = ecosystems ? Object.entries(ecosystems) as [string, any][] : [];
  const freshCounts = freshness?.counts ?? {};
  const staleTiers = freshness?.tiers ?? {};

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      <NavHeader />

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-8 py-10 space-y-12">

          <div>
            <h1 className="text-4xl font-bold tracking-tight">Discover</h1>
            <p className="text-base text-muted-foreground mt-2">
              Trends, ecosystems, and health across your starred collection
            </p>
          </div>

          {/* ── Digest ── */}
          {digest && (
            <section>
              <h2 className="text-2xl font-bold tracking-tight mb-2">Last 30 Days</h2>
              <p className="text-sm text-muted-foreground mb-6">Your recent activity</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StatCard label="New Stars" value={digest.new_stars_count} icon={<Star className="h-5 w-5 text-primary" />} />
                <StatCard label="Thriving" value={freshCounts.thriving ?? 0} icon={<Zap className="h-5 w-5 text-green-400" />} color="#10b981" />
                <StatCard label="Active" value={freshCounts.active ?? 0} icon={<Shield className="h-5 w-5 text-blue-400" />} color="#3b82f6" />
                <StatCard label="Needs Attention" value={(freshCounts.abandoned ?? 0) + (freshCounts.slowing_down ?? 0)} icon={<AlertTriangle className="h-5 w-5 text-amber-400" />} color="#f59e0b" />
              </div>
            </section>
          )}

          {/* ── Timeline ── */}
          {timeline.length > 0 && (
            <section>
              <h2 className="text-2xl font-bold tracking-tight mb-2">Starring Activity</h2>
              <p className="text-sm text-muted-foreground mb-6">Monthly velocity</p>
              <div className="rounded-xl border border-border bg-card p-6">
                <div className="flex items-end gap-1.5 h-32">
                  {timeline.slice(-12).map((entry: any) => (
                    <div key={entry.month} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-xs text-muted-foreground font-mono opacity-0 group-hover:opacity-100">{entry.count}</span>
                      <div
                        className="w-full rounded-t-md bg-primary/50 hover:bg-primary transition-colors cursor-default relative group"
                        style={{ height: `${Math.max(6, (entry.count / maxT) * 100)}%` }}
                      >
                        <div className="absolute -top-7 left-1/2 -translate-x-1/2 hidden group-hover:block text-xs text-foreground bg-popover border border-border rounded px-2 py-1 whitespace-nowrap z-10 font-mono">
                          {entry.count}
                        </div>
                      </div>
                      <span className="text-[10px] text-muted-foreground font-mono">{entry.month.slice(5)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* ── Trends ── */}
          <section>
            <h2 className="text-2xl font-bold tracking-tight mb-2">Trends</h2>
            <p className="text-sm text-muted-foreground mb-6">What's accelerating vs declining in your interests</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {accelerating.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-6">
                  <p className="text-sm font-semibold text-green-400 flex items-center gap-2 mb-4">
                    <TrendingUp className="h-4 w-4" /> Accelerating
                  </p>
                  <div className="space-y-3">
                    {accelerating.map((a: any) => (
                      <div key={a.category} className="flex items-center justify-between">
                        <span className="text-sm text-foreground">{a.category}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground font-mono">{a.previous}</span>
                          <span className="text-green-400">→</span>
                          <span className="text-sm font-semibold text-green-400 font-mono">{a.recent}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {declining.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-6">
                  <p className="text-sm font-semibold text-amber-400 flex items-center gap-2 mb-4">
                    <TrendingDown className="h-4 w-4" /> Declining
                  </p>
                  <div className="space-y-3">
                    {declining.map((d: any) => (
                      <div key={d.category} className="flex items-center justify-between">
                        <span className="text-sm text-foreground">{d.category}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground font-mono">{d.previous}</span>
                          <span className="text-amber-400">→</span>
                          <span className="text-sm font-semibold text-amber-400 font-mono">{d.recent}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {accelerating.length === 0 && declining.length === 0 && (
                <p className="text-sm text-muted-foreground col-span-2">Not enough data yet. Star more repos over time to see trends.</p>
              )}
            </div>
          </section>

          {/* ── Hot Topics ── */}
          {hotTopics.length > 0 && (
            <section>
              <h2 className="text-2xl font-bold tracking-tight mb-2">Hot Topics</h2>
              <p className="text-sm text-muted-foreground mb-6">Most popular topics in your recent stars</p>
              <div className="flex flex-wrap gap-3">
                {hotTopics.map((h: any, i: number) => (
                  <div key={h.topic} className="rounded-xl border border-border bg-card px-5 py-3 flex items-center gap-3">
                    <span className="text-lg font-bold text-primary font-mono">{h.count}</span>
                    <span className="text-base text-foreground">{h.topic}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Ecosystems ── */}
          {ecoPairs.length > 0 && (
            <section>
              <h2 className="text-2xl font-bold tracking-tight mb-2">Your Ecosystems</h2>
              <p className="text-sm text-muted-foreground mb-6">Technology stacks detected in your stars</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {ecoPairs.sort((a, b) => b[1].coverage - a[1].coverage).map(([name, data]: [string, any]) => (
                  <div key={name} className="rounded-xl border border-border bg-card p-5">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-base font-semibold">{name}</h3>
                      <span className="text-sm font-bold text-primary font-mono">{data.coverage}%</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-muted overflow-hidden mb-3">
                      <div className="h-full rounded-full bg-primary/60" style={{ width: `${data.coverage}%` }} />
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">{data.repo_count} repos</p>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {data.matched_components?.slice(0, 6).map((c: string) => (
                        <Badge key={c} variant="secondary" className="text-xs">{c}</Badge>
                      ))}
                    </div>
                    {data.missing_components?.length > 0 && (
                      <p className="text-xs text-amber-400 mt-2">
                        Missing: {data.missing_components.slice(0, 3).join(", ")}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Stale repos ── */}
          {staleTiers.abandoned?.length > 0 && (
            <section>
              <h2 className="text-2xl font-bold tracking-tight mb-2">Needs Attention</h2>
              <p className="text-sm text-muted-foreground mb-6">Repos that may be abandoned or unmaintained</p>
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                {staleTiers.abandoned.slice(0, 10).map((r: any, i: number) => (
                  <div key={r.full_name} className={`flex items-center justify-between px-6 py-3 ${i > 0 ? "border-t border-border" : ""}`}>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-amber-400 font-mono w-8">{r.health_score}%</span>
                      <a href={`https://github.com/${r.full_name}`} target="_blank" rel="noopener noreferrer"
                        className="text-sm text-foreground hover:text-primary transition-colors">
                        {r.full_name}
                      </a>
                    </div>
                    <div className="flex items-center gap-3">
                      {r.language && <span className="text-sm text-muted-foreground">{r.language}</span>}
                      {r.category && <span className="text-xs text-muted-foreground">{r.category}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 flex items-center gap-4">
      <div className="h-11 w-11 rounded-xl bg-muted flex items-center justify-center shrink-0">{icon}</div>
      <div>
        <p className="text-2xl font-bold tabular-nums" style={color ? { color } : undefined}>{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
