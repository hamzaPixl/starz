"use client";

import { useState, useEffect } from "react";
import type { Repo } from "@/lib/api";
import { api } from "@/lib/api";
import { LANG_COLORS } from "@/lib/lang-colors";
import { formatStars } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import {
  Star,
  ExternalLink,
  ChevronRight,
  GitFork,
  Tag,
  Link2,
  Archive,
} from "lucide-react";

interface RepoRowProps {
  repo: Repo;
}

export function RepoRow({ repo }: RepoRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [similar, setSimilar] = useState<Repo[] | null>(null);
  const [loadingSimilar, setLoadingSimilar] = useState(false);

  const langColor = repo.language
    ? LANG_COLORS[repo.language] || "#666"
    : null;

  useEffect(() => {
    if (!expanded || similar !== null) return;
    setLoadingSimilar(true);
    api
      .getSimilar(repo.id, 4)
      .then((data) => setSimilar(data.similar))
      .catch(() => setSimilar([]))
      .finally(() => setLoadingSimilar(false));
  }, [expanded, repo.id, similar]);

  return (
      <div className="group/row">
        {/* Compact row */}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className={`flex w-full items-center gap-2.5 px-4 py-2 text-left transition-all hover:bg-secondary/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
            expanded
              ? "bg-secondary/20 border-l-2 border-l-primary/40"
              : "border-l-2 border-l-transparent"
          }`}
          aria-expanded={expanded}
          aria-label={`${repo.full_name}, ${repo.stargazers_count} stars`}
        >
          <ChevronRight
            className={`h-3 w-3 shrink-0 text-muted-foreground/40 transition-transform duration-200 ${
              expanded ? "rotate-90" : ""
            }`}
          />

          {/* Language dot */}
          {repo.language ? (
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white/5"
              style={{ backgroundColor: langColor || "#666" }}
              title={repo.language}
            />
          ) : (
            <span className="h-2.5 w-2.5 shrink-0" />
          )}

          {/* Name */}
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground/90">
            <span className="text-muted-foreground/40 font-normal">
              {repo.owner}/
            </span>
            {repo.name}
          </span>

          {/* Stars */}
          <span className="flex items-center gap-1 shrink-0 text-xs text-muted-foreground/50 tabular-nums font-mono">
            <Star className="h-3 w-3" />
            {formatStars(repo.stargazers_count)}
          </span>

          {/* Category badge */}
          {repo.category && (
            <Badge
              variant="secondary"
              className="hidden text-[10px] h-[18px] px-1.5 sm:inline-flex shrink-0 font-normal bg-secondary/60 text-muted-foreground/70 border-0"
            >
              {repo.category}
            </Badge>
          )}

          {/* Archived indicator */}
          {repo.archived && (
            <Archive
              className="h-3 w-3 text-muted-foreground/30 shrink-0"
              aria-label="Archived"
            />
          )}
        </button>

        {/* Expanded detail */}
        {expanded && (
          <div className="ml-[42px] mr-4 mt-0 mb-2 space-y-3 rounded-lg border border-border/20 bg-card/20 backdrop-blur-sm p-4 animate-in slide-in-from-top-1 fade-in-0 duration-200">
            {/* Description */}
            {(repo.description || repo.summary) && (
              <p className="text-[13px] text-muted-foreground/80 leading-relaxed">
                {repo.description || repo.summary}
              </p>
            )}

            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-3">
              {repo.language && (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/60">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: langColor || "#666" }}
                  />
                  {repo.language}
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground/60">
                <Star className="h-3 w-3" />
                {repo.stargazers_count.toLocaleString()} stars
              </span>
              {repo.forks_count > 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground/60">
                  <GitFork className="h-3 w-3" />
                  {repo.forks_count.toLocaleString()}
                </span>
              )}
              {repo.license && (
                <span className="text-xs text-muted-foreground/40 font-mono">
                  {repo.license}
                </span>
              )}
              {repo.homepage && (
                <a
                  href={repo.homepage}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary/60 hover:text-primary transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Link2 className="h-3 w-3" />
                  Website
                </a>
              )}
            </div>

            {/* Topics */}
            {repo.topics.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {repo.topics.slice(0, 8).map((topic) => (
                  <span
                    key={topic}
                    className="inline-flex items-center gap-1 rounded-md bg-primary/6 px-2 py-0.5 text-[10px] text-primary/60 ring-1 ring-primary/10"
                  >
                    <Tag className="h-2.5 w-2.5" />
                    {topic}
                  </span>
                ))}
                {repo.topics.length > 8 && (
                  <span className="text-[10px] text-muted-foreground/30 self-center font-mono">
                    +{repo.topics.length - 8}
                  </span>
                )}
              </div>
            )}

            {/* Similar repos */}
            {loadingSimilar && (
              <div className="flex items-center gap-2">
                <div className="h-1 w-1 rounded-full bg-primary/40 animate-pulse" />
                <p className="text-[11px] text-muted-foreground/40">
                  Finding similar repos...
                </p>
              </div>
            )}
            {similar && similar.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/30 font-semibold mb-2">
                  Similar in your stars
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {similar.map((s) => (
                    <a
                      key={s.id}
                      href={s.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-md border border-border/20 bg-background/30 px-2.5 py-1 text-[11px] text-muted-foreground/60 hover:text-primary hover:border-primary/20 transition-all"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {s.language && (
                        <span
                          className="h-1.5 w-1.5 rounded-full shrink-0"
                          style={{
                            backgroundColor:
                              LANG_COLORS[s.language] || "#666",
                          }}
                        />
                      )}
                      <span className="truncate max-w-[140px]">
                        {s.full_name}
                      </span>
                      <span className="text-muted-foreground/30 tabular-nums font-mono">
                        {formatStars(s.stargazers_count)}
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* GitHub link */}
            <div className="pt-1">
              <a
                href={repo.html_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-primary/70 hover:text-primary transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-3 w-3" />
                Open on GitHub
              </a>
            </div>
          </div>
        )}
      </div>
  );
}
