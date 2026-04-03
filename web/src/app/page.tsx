"use client";

import { useEffect, useState, useCallback } from "react";
import { api, type Repo, type Stats } from "@/lib/api";
import { SearchBar } from "@/components/search-bar";
import { RepoGrid } from "@/components/repo-grid";
import { CategoryFilter } from "@/components/category-filter";
import { SyncButton } from "@/components/sync-button";
import { ChatPanel } from "@/components/chat-panel";
import { Button } from "@/components/ui/button";

export default function Home() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<string | null>(null);
  const [language, setLanguage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [total, setTotal] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [repoData, statsData] = await Promise.all([
        api.getRepos({
          category: category ?? undefined,
          language: language ?? undefined,
          q: query || undefined,
        }),
        api.getStats(),
      ]);
      setRepos(repoData.repos);
      setTotal(repoData.total);
      setStats(statsData);
    } catch (e) {
      console.error("Failed to load:", e);
    } finally {
      setLoading(false);
    }
  }, [category, language, query]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSyncComplete = useCallback(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="hidden w-64 shrink-0 border-r p-4 md:block">
        <h1 className="mb-4 text-2xl font-bold">Starz</h1>
        <div className="mb-4">
          <SyncButton onSyncComplete={handleSyncComplete} />
        </div>
        {stats && (
          <CategoryFilter
            stats={stats}
            selectedCategory={category}
            selectedLanguage={language}
            onCategoryChange={setCategory}
            onLanguageChange={setLanguage}
          />
        )}
      </aside>

      {/* Main content */}
      <main className="flex-1 p-6">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="flex-1">
            <SearchBar onSearch={setQuery} />
            <p className="mt-2 text-sm text-muted-foreground">
              {total} repo{total !== 1 ? "s" : ""}
              {category ? ` in ${category}` : ""}
              {language ? ` (${language})` : ""}
            </p>
          </div>
          <Button
            variant={chatOpen ? "default" : "outline"}
            size="sm"
            onClick={() => setChatOpen((prev) => !prev)}
          >
            {chatOpen ? "Close Chat" : "Chat"}
          </Button>
        </div>
        <RepoGrid repos={repos} loading={loading} />
      </main>

      {/* Chat panel (toggleable right sidebar) */}
      {chatOpen && (
        <aside className="hidden w-96 shrink-0 border-l md:block">
          <ChatPanel />
        </aside>
      )}
    </div>
  );
}
