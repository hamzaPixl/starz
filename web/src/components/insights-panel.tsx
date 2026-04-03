"use client";

import type { FullStats, Repo } from "@/lib/api";
import { LANG_COLORS } from "@/lib/lang-colors";
import { formatStars } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Star,
  ExternalLink,
  Tag,
  User,
  Code2,
  TrendingUp,
  Clock,
} from "lucide-react";

interface InsightsPanelProps {
  stats: FullStats | null;
  loading: boolean;
}

function SectionTitle({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5 mb-2.5">
      <span className="text-muted-foreground/40">{icon}</span>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground/40 font-semibold">
        {label}
      </p>
    </div>
  );
}

function InsightSkeleton() {
  return (
    <div className="space-y-6 p-4">
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </div>
      <Skeleton className="h-px w-full" />
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </div>
    </div>
  );
}

function BarItem({
  label,
  count,
  max,
  color,
}: {
  label: string;
  count: number;
  max: number;
  color?: string;
}) {
  const pct = Math.max(4, (count / max) * 100);
  return (
    <div className="flex items-center gap-2 group">
      <span className="text-xs text-muted-foreground truncate min-w-0 flex-1 group-hover:text-foreground transition-colors">
        {label}
      </span>
      <div className="w-20 h-1.5 rounded-full bg-secondary/40 overflow-hidden shrink-0">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            backgroundColor: color || "oklch(0.7 0.15 270)",
          }}
        />
      </div>
      <span className="text-[10px] text-muted-foreground/40 tabular-nums w-6 text-right shrink-0 font-mono">
        {count}
      </span>
    </div>
  );
}

function MiniRepoRow({ repo, rank }: { repo: Repo; rank?: number }) {
  const langColor = repo.language
    ? LANG_COLORS[repo.language] || "#666"
    : null;

  return (
    <a
      href={repo.html_url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-secondary/30"
    >
      {rank !== undefined && (
        <span className="text-[10px] text-muted-foreground/30 tabular-nums w-3 shrink-0 font-mono">
          {rank}
        </span>
      )}
      {repo.language && (
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: langColor || "#666" }}
        />
      )}
      {!repo.language && <span className="h-2 w-2 shrink-0" />}
      <span className="text-xs text-foreground/80 truncate min-w-0 flex-1 group-hover:text-primary transition-colors">
        {repo.name}
      </span>
      <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground/30 tabular-nums shrink-0 font-mono">
        <Star className="h-2.5 w-2.5" />
        {formatStars(repo.stargazers_count)}
      </span>
      <ExternalLink className="h-2.5 w-2.5 text-muted-foreground/0 group-hover:text-muted-foreground/40 transition-colors shrink-0" />
    </a>
  );
}

export function InsightsPanel({ stats, loading }: InsightsPanelProps) {
  if (loading || !stats) {
    return <InsightSkeleton />;
  }

  const topTopics = Object.entries(stats.top_topics)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6);
  const topLangs = Object.entries(stats.by_language)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);
  const topOwners = Object.entries(stats.top_owners)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  const maxTopic = topTopics[0]?.[1] || 1;
  const maxLang = topLangs[0]?.[1] || 1;
  const maxOwner = topOwners[0]?.[1] || 1;

  const topRepos = stats.top_repos?.slice(0, 5) || [];
  const recentRepos = stats.recently_starred?.slice(0, 5) || [];

  return (
    <TooltipProvider delay={300}>
      <div className="space-y-5 p-4">
        {/* Profile: top topics */}
        <div>
          <SectionTitle
            icon={<Tag className="h-3 w-3" />}
            label="Your interests"
          />
          <div className="space-y-1.5">
            {topTopics.map(([name, count]) => (
              <BarItem key={name} label={name} count={count} max={maxTopic} />
            ))}
          </div>
        </div>

        <Separator className="opacity-20" />

        {/* Top languages */}
        <div>
          <SectionTitle
            icon={<Code2 className="h-3 w-3" />}
            label="Languages"
          />
          <div className="space-y-1.5">
            {topLangs.map(([name, count]) => (
              <BarItem
                key={name}
                label={name}
                count={count}
                max={maxLang}
                color={LANG_COLORS[name]}
              />
            ))}
          </div>
        </div>

        <Separator className="opacity-20" />

        {/* Top owners */}
        <div>
          <SectionTitle
            icon={<User className="h-3 w-3" />}
            label="Top creators"
          />
          <div className="space-y-1.5">
            {topOwners.map(([name, count]) => (
              <BarItem key={name} label={name} count={count} max={maxOwner} />
            ))}
          </div>
        </div>

        <Separator className="opacity-20" />

        {/* Most starred */}
        {topRepos.length > 0 && (
          <div>
            <SectionTitle
              icon={<TrendingUp className="h-3 w-3" />}
              label="Most starred"
            />
            <div className="space-y-0">
              {topRepos.map((repo, i) => (
                <MiniRepoRow key={repo.id} repo={repo} rank={i + 1} />
              ))}
            </div>
          </div>
        )}

        {recentRepos.length > 0 && (
          <>
            <Separator className="opacity-20" />
            <div>
              <SectionTitle
                icon={<Clock className="h-3 w-3" />}
                label="Recently starred"
              />
              <div className="space-y-0">
                {recentRepos.map((repo) => (
                  <MiniRepoRow key={repo.id} repo={repo} />
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
