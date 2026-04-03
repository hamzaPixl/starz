"use client";

import type { Repo } from "@/lib/api";
import { Star, ExternalLink } from "lucide-react";

interface RepoCardProps {
  repo: Repo;
}

const LANG_COLORS: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Python: "#3572A5",
  Rust: "#dea584",
  Go: "#00ADD8",
  Java: "#b07219",
  Ruby: "#701516",
  Swift: "#F05138",
  Kotlin: "#A97BFF",
  "C++": "#f34b7d",
  "C#": "#178600",
  C: "#555555",
  PHP: "#4F5D95",
  Shell: "#89e051",
  Dart: "#00B4AB",
  Lua: "#000080",
  Scala: "#c22d40",
  Elixir: "#6e4a7e",
  MDX: "#fcb32c",
  CSS: "#563d7c",
  HTML: "#e34c26",
};

export function RepoCard({ repo }: RepoCardProps) {
  const langColor = repo.language ? LANG_COLORS[repo.language] || "#666" : null;

  return (
    <a
      href={repo.html_url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block rounded-xl border border-border/50 bg-card/50 p-4 transition-all hover:border-primary/30 hover:bg-card hover:glow-sm"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground truncate">{repo.owner}</p>
          <h3 className="text-sm font-semibold truncate group-hover:text-primary transition-colors">
            {repo.name}
          </h3>
        </div>
        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/0 group-hover:text-muted-foreground transition-all shrink-0 mt-1" />
      </div>

      {/* Description */}
      {repo.description && (
        <p className="text-xs text-muted-foreground line-clamp-2 mb-3 leading-relaxed">
          {repo.description}
        </p>
      )}

      {/* Summary (AI-generated) */}
      {repo.summary && !repo.description && (
        <p className="text-xs text-muted-foreground/70 line-clamp-2 mb-3 italic leading-relaxed">
          {repo.summary}
        </p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {repo.language && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <span
                className="inline-block h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: langColor || "#666" }}
              />
              {repo.language}
            </span>
          )}
          <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
            <Star className="h-3 w-3" />
            {repo.stargazers_count >= 1000
              ? `${(repo.stargazers_count / 1000).toFixed(1)}k`
              : repo.stargazers_count}
          </span>
        </div>
        {repo.category && (
          <span className="text-[10px] text-muted-foreground/60 font-mono truncate">
            {repo.category}
          </span>
        )}
      </div>
    </a>
  );
}
