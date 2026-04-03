"use client";

import type { Stats } from "@/lib/api";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

interface CategoryFilterProps {
  stats: Stats;
  selectedCategory: string | null;
  selectedLanguage: string | null;
  onCategoryChange: (category: string | null) => void;
  onLanguageChange: (language: string | null) => void;
}

function FilterButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "text-foreground hover:bg-muted"
      }`}
    >
      <span className="truncate">{label}</span>
      {count !== undefined && (
        <span
          className={`ml-2 shrink-0 text-xs tabular-nums ${
            active ? "text-primary-foreground/70" : "text-muted-foreground"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

export function CategoryFilter({
  stats,
  selectedCategory,
  selectedLanguage,
  onCategoryChange,
  onLanguageChange,
}: CategoryFilterProps) {
  const categories = Object.entries(stats.by_category).sort(
    ([, a], [, b]) => b - a
  );

  const languages = Object.entries(stats.by_language)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 15);

  return (
    <ScrollArea className="h-[calc(100vh-8rem)]">
      <div className="space-y-4">
        {/* Categories */}
        <div>
          <h2 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Categories
          </h2>
          <div className="space-y-0.5">
            <FilterButton
              label="All"
              count={stats.total}
              active={selectedCategory === null}
              onClick={() => onCategoryChange(null)}
            />
            {categories.map(([name, count]) => (
              <FilterButton
                key={name}
                label={name}
                count={count}
                active={selectedCategory === name}
                onClick={() =>
                  onCategoryChange(selectedCategory === name ? null : name)
                }
              />
            ))}
          </div>
        </div>

        <Separator />

        {/* Languages */}
        <div>
          <h2 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Languages
          </h2>
          <div className="space-y-0.5">
            <FilterButton
              label="All"
              active={selectedLanguage === null}
              onClick={() => onLanguageChange(null)}
            />
            {languages.map(([name, count]) => (
              <FilterButton
                key={name}
                label={name}
                count={count}
                active={selectedLanguage === name}
                onClick={() =>
                  onLanguageChange(selectedLanguage === name ? null : name)
                }
              />
            ))}
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}
