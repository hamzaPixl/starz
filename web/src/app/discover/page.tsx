"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { CATEGORY_COLORS } from "@/lib/lang-colors";
import { NavHeader } from "@/components/nav-header";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, TrendingUp, TrendingDown, Star, Zap, Shield,
  AlertTriangle, ExternalLink, Check, X as XIcon,
} from "lucide-react";

export default function DiscoverPage() {
  const [trends, setTrends] = useState<any>(null);
  const [freshness, setFreshness] = useState<any>(null);
  const [ecosystems, setEcosystems] = useState<any>(null);
  const [digest, setDigest] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getTrends(), api.getFreshness(), api.getEcosystems(), api.getDigest(30),
    ]).then(([t, f, e, d]) => {
      setTrends(t); setFreshness(f); setEcosystems(e); setDigest(d);
    }).catch(console.error).finally(() => setLoading(false));
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
  const ecoPairs = ecosystems ? (Object.entries(ecosystems) as [string, any][]).sort((a, b) => b[1].coverage - a[1].coverage) : [];
  const fc = freshness?.counts ?? {};
  const stale = freshness?.tiers?.abandoned ?? [];
  const totalRepos = (fc.thriving ?? 0) + (fc.active ?? 0) + (fc.slowing_down ?? 0) + (fc.abandoned ?? 0);

  // Health distribution as segments
  const healthSegments = [
    { label: "Thriving", count: fc.thriving ?? 0, color: "#10b981" },
    { label: "Active", count: fc.active ?? 0, color: "#3b82f6" },
    { label: "Slowing", count: fc.slowing_down ?? 0, color: "#f59e0b" },
    { label: "Abandoned", count: fc.abandoned ?? 0, color: "#ef4444" },
  ];

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      <NavHeader />

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-8 py-10 space-y-10">

          <h1 className="text-4xl font-bold tracking-tight">Discover</h1>

          {/* ── Row 1: Health bar + Digest numbers ── */}
          <div className="rounded-xl border border-border bg-card p-6">
            {/* Health distribution bar */}
            <div className="flex h-4 rounded-lg overflow-hidden mb-4">
              {healthSegments.map(s => s.count > 0 ? (
                <div key={s.label} style={{ width: `${(s.count / totalRepos) * 100}%`, backgroundColor: s.color }}
                  className="transition-all" title={`${s.label}: ${s.count}`} />
              ) : null)}
            </div>
            <div className="flex items-center gap-8">
              {healthSegments.map(s => (
                <div key={s.label} className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: s.color }} />
                  <span className="text-sm text-muted-foreground">{s.label}</span>
                  <span className="text-sm font-bold font-mono" style={{ color: s.color }}>{s.count}</span>
                </div>
              ))}
              {digest && (
                <>
                  <div className="h-5 w-px bg-border ml-auto" />
                  <div className="flex items-center gap-2">
                    <Star className="h-4 w-4 text-primary" />
                    <span className="text-sm text-muted-foreground">Last 30 days:</span>
                    <span className="text-sm font-bold font-mono">{digest.new_stars_count} new</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ── Row 2: Timeline + Trends side by side ── */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            {/* Timeline — takes 3 cols */}
            {timeline.length > 0 && (
              <div className="lg:col-span-3 rounded-xl border border-border bg-card p-6">
                <p className="text-sm font-semibold mb-5">Starring Activity</p>
                <div className="flex items-end gap-2 h-36">
                  {timeline.slice(-12).map((entry: any) => (
                    <div key={entry.month} className="flex-1 flex flex-col items-center gap-1.5">
                      <div
                        className="w-full rounded-t bg-primary/50 hover:bg-primary transition-colors cursor-default relative group min-h-[4px]"
                        style={{ height: `${Math.max(3, (entry.count / maxT) * 100)}%` }}
                      >
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:block text-sm text-foreground bg-popover border border-border rounded-lg px-3 py-1.5 whitespace-nowrap z-10 font-mono shadow-lg">
                          {entry.month}: {entry.count}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground font-mono">{entry.month.slice(5)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Trends — takes 2 cols */}
            <div className="lg:col-span-2 rounded-xl border border-border bg-card p-6">
              <p className="text-sm font-semibold mb-5">Interest Shifts</p>
              {accelerating.length > 0 && (
                <div className="mb-5">
                  {accelerating.map((a: any) => (
                    <div key={a.category} className="flex items-center gap-3 py-2">
                      <TrendingUp className="h-4 w-4 text-green-400 shrink-0" />
                      <span className="text-sm flex-1 truncate">{a.category}</span>
                      <span className="text-sm text-muted-foreground font-mono">{a.previous}</span>
                      <span className="text-sm text-green-400 font-mono font-bold">{a.recent}</span>
                    </div>
                  ))}
                </div>
              )}
              {declining.length > 0 && (
                <div>
                  {declining.map((d: any) => (
                    <div key={d.category} className="flex items-center gap-3 py-2">
                      <TrendingDown className="h-4 w-4 text-amber-400 shrink-0" />
                      <span className="text-sm flex-1 truncate">{d.category}</span>
                      <span className="text-sm text-muted-foreground font-mono">{d.previous}</span>
                      <span className="text-sm text-amber-400 font-mono font-bold">{d.recent}</span>
                    </div>
                  ))}
                </div>
              )}
              {accelerating.length === 0 && declining.length === 0 && (
                <p className="text-sm text-muted-foreground py-4">Need more starring history to detect shifts.</p>
              )}
            </div>
          </div>

          {/* ── Row 3: Hot Topics as weighted tags ── */}
          {hotTopics.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-6">
              <p className="text-sm font-semibold mb-5">Hot Topics</p>
              <div className="flex flex-wrap gap-2.5">
                {hotTopics.map((h: any) => {
                  const maxH = hotTopics[0]?.count || 1;
                  const weight = h.count / maxH;
                  const size = 14 + weight * 8; // 14px to 22px
                  return (
                    <span key={h.topic} className="inline-flex items-baseline gap-2 rounded-lg bg-muted px-4 py-2 transition-colors hover:bg-accent cursor-default"
                      style={{ fontSize: `${size}px` }}>
                      <span className="text-foreground font-medium">{h.topic}</span>
                      <span className="text-muted-foreground font-mono" style={{ fontSize: '13px' }}>{h.count}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Row 4: Ecosystems ── */}
          {ecoPairs.length > 0 && (
            <div>
              <p className="text-sm font-semibold mb-4">Your Tech Stacks</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {ecoPairs.map(([name, data]: [string, any]) => (
                  <div key={name} className="rounded-xl border border-border bg-card p-5">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-base font-semibold">{name}</h3>
                      <span className="text-base font-bold text-primary font-mono">{data.coverage}%</span>
                    </div>
                    {/* Progress bar */}
                    <div className="h-2 rounded-full bg-muted overflow-hidden mb-4">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${data.coverage}%` }} />
                    </div>
                    {/* Components */}
                    <div className="flex flex-wrap gap-2 mb-3">
                      {data.matched_components?.map((c: string) => (
                        <span key={c} className="inline-flex items-center gap-1.5 text-xs text-green-400 bg-green-400/10 rounded-md px-2 py-1">
                          <Check className="h-3 w-3" /> {c}
                        </span>
                      ))}
                      {data.missing_components?.slice(0, 3).map((c: string) => (
                        <span key={c} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-muted rounded-md px-2 py-1">
                          <XIcon className="h-3 w-3" /> {c}
                        </span>
                      ))}
                    </div>
                    <p className="text-sm text-muted-foreground">{data.repo_count} repos in your collection</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Row 5: Stale repos ── */}
          {stale.length > 0 && (
            <div>
              <p className="text-sm font-semibold mb-4">Needs Attention</p>
              <div className="rounded-xl border border-border bg-card divide-y divide-border">
                {stale.slice(0, 8).map((r: any) => (
                  <a key={r.full_name} href={`https://github.com/${r.full_name}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-4 px-5 py-3.5 hover:bg-accent transition-colors group">
                    <span className="text-sm font-bold font-mono w-10 shrink-0" style={{
                      color: r.health_score < 20 ? "#ef4444" : "#f59e0b"
                    }}>{r.health_score}%</span>
                    <span className="text-sm text-foreground flex-1 truncate group-hover:text-primary transition-colors">{r.full_name}</span>
                    {r.language && <span className="text-sm text-muted-foreground hidden sm:block">{r.language}</span>}
                    <ExternalLink className="h-4 w-4 text-transparent group-hover:text-muted-foreground shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
