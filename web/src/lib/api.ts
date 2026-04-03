const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:7827/api";

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// Types matching the Python Pydantic schemas
export interface Repo {
  id: number;
  full_name: string;
  name: string;
  owner: string;
  description: string | null;
  language: string | null;
  topics: string[];
  stargazers_count: number;
  html_url: string;
  homepage: string | null;
  category: string | null;
  summary: string | null;
  license: string | null;
  forks_count: number;
  archived: boolean;
}

export interface GraphNode {
  id: number;
  label: string;
  full_name: string;
  owner: string;
  category: string | null;
  language: string | null;
  stars: number;
  url: string;
  description: string | null;
}

export interface GraphLink {
  source: number;
  target: number;
  type: string;
  weight: number;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface RepoList {
  repos: Repo[];
  total: number;
  limit: number;
  offset: number;
}

export interface SearchResult {
  repo: Repo;
  score: number;
}

export interface SearchResponse {
  results: SearchResult[];
  query: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  answer: string;
  sources: {
    full_name: string;
    html_url: string;
    category: string | null;
    summary: string | null;
  }[];
}

export interface Stats {
  total: number;
  by_category: Record<string, number>;
  by_language: Record<string, number>;
}

export interface SyncStatus {
  status: string;
  progress: number;
  total: number;
  message: string;
}

// API functions
export const api = {
  getRepos: (params?: {
    category?: string;
    language?: string;
    q?: string;
    limit?: number;
    offset?: number;
  }) => {
    const search = new URLSearchParams();
    if (params?.category) search.set("category", params.category);
    if (params?.language) search.set("language", params.language);
    if (params?.q) search.set("q", params.q);
    if (params?.limit) search.set("limit", String(params.limit));
    if (params?.offset) search.set("offset", String(params.offset));
    const qs = search.toString();
    return fetchApi<RepoList>(`/repos${qs ? `?${qs}` : ""}`);
  },

  getRepo: (id: number) => fetchApi<Repo>(`/repos/${id}`),

  getStats: () => fetchApi<Stats>("/stats"),

  search: (query: string, limit = 10) =>
    fetchApi<SearchResponse>("/search", {
      method: "POST",
      body: JSON.stringify({ query, limit }),
    }),

  chat: (query: string, history: ChatMessage[] = []) =>
    fetchApi<ChatResponse>("/chat", {
      method: "POST",
      body: JSON.stringify({ query, history }),
    }),

  triggerSync: () =>
    fetchApi<{ message: string }>("/sync", { method: "POST" }),

  getSyncStatus: () => fetchApi<SyncStatus>("/sync/status"),

  getGraph: (edgeTypes?: string[]) => {
    const params = edgeTypes ? `?edge_types=${edgeTypes.join(",")}` : "";
    return fetchApi<GraphData>(`/graph${params}`);
  },

  getSimilar: (repoId: number, limit = 5) =>
    fetchApi<{ repo_id: number; similar: Repo[] }>(`/repos/${repoId}/similar?limit=${limit}`),
};
