"use client";

import type { FullStats } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import {
  Star,
  FolderTree,
  Code2,
  GitFork,
  TrendingUp,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface StatsStripProps {
  stats: FullStats | null;
  loading: boolean;
}

interface MetricCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  detail?: string;
  tooltip?: string;
}

function MetricCard({ label, value, icon, detail, tooltip }: MetricCardProps) {
  const content = (
    <div className="flex items-center gap-3 rounded-lg border border-border/20 bg-card/30 backdrop-blur-sm px-4 py-3 min-w-0 transition-colors hover:bg-card/50 hover:border-border/40">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/8 ring-1 ring-primary/10">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xl font-bold tabular-nums leading-tight tracking-tight">
          {value}
        </p>
        <p className="text-[11px] text-muted-foreground truncate">
          {label}
          {detail && (
            <span className="text-muted-foreground/40 ml-1">{detail}</span>
          )}
        </p>
      </div>
    </div>
  );

  if (tooltip) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <div className="flex items-center gap-3 rounded-lg border border-border/20 bg-card/30 backdrop-blur-sm px-4 py-3 min-w-0 transition-colors hover:bg-card/50 hover:border-border/40 cursor-default" />
          }
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/8 ring-1 ring-primary/10">
            {icon}
          </div>
          <div className="min-w-0">
            <p className="text-xl font-bold tabular-nums leading-tight tracking-tight">
              {value}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">
              {label}
              {detail && (
                <span className="text-muted-foreground/40 ml-1">{detail}</span>
              )}
            </p>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    );
  }

  return content;
}

function MetricSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/20 bg-card/30 px-4 py-3">
      <Skeleton className="h-9 w-9 rounded-lg" />
      <div className="space-y-1.5">
        <Skeleton className="h-5 w-12" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  );
}

function SparklineBar({
  data,
  maxCount,
}: {
  data: { month: string; count: number }[];
  maxCount: number;
}) {
  const slice = data.slice(-12);
  return (
    <div className="flex items-end gap-[3px] h-7">
      {slice.map((d, i) => (
        <div
          key={d.month}
          className="w-[5px] rounded-[2px] bg-primary/50 transition-all hover:bg-primary cursor-default"
          style={{
            height: `${Math.max(12, (d.count / maxCount) * 100)}%`,
            opacity: 0.3 + (i / slice.length) * 0.7,
          }}
          title={`${d.month}: ${d.count} repos`}
        />
      ))}
    </div>
  );
}

export function StatsStrip({ stats, loading }: StatsStripProps) {
  if (loading || !stats) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <MetricSkeleton key={i} />
        ))}
      </div>
    );
  }

  const categoryCount = Object.keys(stats.by_category || {}).length;
  const languageCount = Object.keys(stats.by_language || {}).length;
  const totalEdges = Object.values(stats.edges || {}).reduce(
    (a, b) => a + (b?.count || 0),
    0
  );

  // Convert timeline dict to array
  const timelineArray = Object.entries(stats.timeline || {}).map(
    ([month, count]) => ({ month, count })
  );
  const maxTimelineCount = Math.max(
    ...timelineArray.map((t) => t.count),
    1
  );

  // Calculate recent velocity
  const recentMonths = timelineArray.slice(-3);
  const avgRecent =
    recentMonths.length > 0
      ? Math.round(
          recentMonths.reduce((a, b) => a + b.count, 0) / recentMonths.length
        )
      : 0;

  return (
    <TooltipProvider delay={200}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <MetricCard
          label="Total repos"
          value={formatNumber(stats.total)}
          icon={<Star className="h-4 w-4 text-primary" />}
          tooltip="GitHub repositories you've starred"
        />
        <MetricCard
          label="Categories"
          value={String(categoryCount)}
          icon={<FolderTree className="h-4 w-4 text-primary" />}
          tooltip="AI-classified categories"
        />
        <MetricCard
          label="Languages"
          value={String(languageCount)}
          icon={<Code2 className="h-4 w-4 text-primary" />}
          tooltip="Unique programming languages"
        />
        <MetricCard
          label="Connections"
          value={formatNumber(totalEdges)}
          icon={<GitFork className="h-4 w-4 text-primary" />}
          tooltip="Computed edges: similar, shared topic, same owner"
        />
        <div className="flex items-center gap-3 rounded-lg border border-border/20 bg-card/30 backdrop-blur-sm px-4 py-3 min-w-0 transition-colors hover:bg-card/50 hover:border-border/40">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/8 ring-1 ring-primary/10">
            <TrendingUp className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <SparklineBar data={timelineArray} maxCount={maxTimelineCount} />
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Velocity{" "}
              <span className="text-foreground/70 font-medium tabular-nums">
                ~{avgRecent}/mo
              </span>
            </p>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
