"use client";

import type { Repo } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardAction,
  CardDescription,
} from "@/components/ui/card";
import { Star } from "lucide-react";

interface RepoCardProps {
  repo: Repo;
}

const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: "bg-blue-500",
  JavaScript: "bg-yellow-400",
  Python: "bg-green-500",
  Rust: "bg-orange-600",
  Go: "bg-cyan-500",
  Java: "bg-red-500",
  Ruby: "bg-red-600",
  Swift: "bg-orange-500",
  Kotlin: "bg-purple-500",
  C: "bg-gray-500",
  "C++": "bg-pink-500",
  "C#": "bg-green-600",
  PHP: "bg-indigo-400",
  Shell: "bg-emerald-500",
  Lua: "bg-blue-700",
  Dart: "bg-teal-500",
  Scala: "bg-red-400",
  Elixir: "bg-purple-600",
  Haskell: "bg-purple-400",
  Zig: "bg-amber-500",
};

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + "...";
}

export function RepoCard({ repo }: RepoCardProps) {
  const colorClass =
    repo.language && LANGUAGE_COLORS[repo.language]
      ? LANGUAGE_COLORS[repo.language]
      : "bg-gray-400";

  return (
    <Card size="sm" className="transition-shadow hover:shadow-md">
      <CardHeader>
        <CardTitle>
          <a
            href={repo.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            {repo.full_name}
          </a>
        </CardTitle>
        <CardAction>
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            <Star className="h-3.5 w-3.5" />
            {repo.stargazers_count.toLocaleString()}
          </span>
        </CardAction>
        {repo.description && (
          <CardDescription>{truncate(repo.description, 120)}</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-1.5">
          {repo.language && (
            <Badge variant="secondary" className="gap-1.5">
              <span
                className={`inline-block h-2 w-2 rounded-full ${colorClass}`}
                aria-hidden="true"
              />
              {repo.language}
            </Badge>
          )}
          {repo.category && (
            <Badge variant="outline">{repo.category}</Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
