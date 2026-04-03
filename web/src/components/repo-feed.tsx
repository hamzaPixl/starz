"use client";

import { useState, useMemo } from "react";
import type { Repo } from "@/lib/api";
import { RepoRow } from "@/components/repo-row";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronRight, Sparkles, FolderOpen } from "lucide-react";

interface RepoFeedProps {
  repos: Repo[];
  loading: boolean;
  groupBy: "category" | "none";
}

function FeedSkeleton() {
  return (
    <div className="space-y-0">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-2.5">
          <Skeleton className="h-3 w-3 rounded" />
          <Skeleton className="h-2.5 w-2.5 rounded-full" />
          <Skeleton className="h-4 flex-1 max-w-[220px]" />
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-4 w-20 hidden sm:block" />
        </div>
      ))}
    </div>
  );
}

interface CategoryGroup {
  name: string;
  repos: Repo[];
}

function GroupHeader({
  name,
  count,
  expanded,
  onToggle,
}: {
  name: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left sticky top-0 z-[1] bg-background/95 backdrop-blur-sm border-b border-border/10 hover:bg-secondary/20 transition-colors"
      aria-expanded={expanded}
    >
      {expanded ? (
        <ChevronDown className="h-3 w-3 text-muted-foreground/40" />
      ) : (
        <ChevronRight className="h-3 w-3 text-muted-foreground/40" />
      )}
      <FolderOpen className="h-3.5 w-3.5 text-primary/40" />
      <span className="text-xs font-semibold text-foreground/80 tracking-wide">
        {name}
      </span>
      <span className="text-[10px] text-muted-foreground/30 tabular-nums font-mono">
        {count}
      </span>
      <div className="flex-1" />
      {!expanded && (
        <span className="text-[10px] text-muted-foreground/20">
          click to expand
        </span>
      )}
    </button>
  );
}

export function RepoFeed({ repos, loading, groupBy }: RepoFeedProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set()
  );

  const groups = useMemo<CategoryGroup[]>(() => {
    if (groupBy === "none") {
      return [{ name: "All", repos }];
    }
    const map = new Map<string, Repo[]>();
    for (const repo of repos) {
      const key = repo.category || "Uncategorized";
      const arr = map.get(key) || [];
      arr.push(repo);
      map.set(key, arr);
    }
    return Array.from(map.entries())
      .sort(([, a], [, b]) => b.length - a.length)
      .map(([name, repos]) => ({ name, repos }));
  }, [repos, groupBy]);

  const toggleGroup = (name: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  if (loading && repos.length === 0) {
    return <FeedSkeleton />;
  }

  if (!loading && repos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="h-14 w-14 rounded-2xl bg-primary/5 flex items-center justify-center mb-4 ring-1 ring-primary/10">
          <Sparkles className="h-7 w-7 text-primary/20" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">
          No repos found
        </p>
        <p className="text-xs text-muted-foreground/40 mt-1">
          Try adjusting your filters or run a sync
        </p>
      </div>
    );
  }

  if (groupBy === "none") {
    return (
      <div className="space-y-0">
        {repos.map((repo) => (
          <RepoRow key={repo.id} repo={repo} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {groups.map((group) => {
        const collapsed = collapsedGroups.has(group.name);
        return (
          <div key={group.name}>
            <GroupHeader
              name={group.name}
              count={group.repos.length}
              expanded={!collapsed}
              onToggle={() => toggleGroup(group.name)}
            />
            {!collapsed && (
              <div className="space-y-0">
                {group.repos.map((repo) => (
                  <RepoRow key={repo.id} repo={repo} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
