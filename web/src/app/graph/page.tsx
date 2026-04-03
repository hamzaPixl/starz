"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import { api, type GraphData, type GraphNode, type Repo, type Stats } from "@/lib/api";
import { CATEGORY_COLORS } from "@/lib/lang-colors";
import { formatStars } from "@/lib/format";
import { NavHeader } from "@/components/nav-header";
import { SearchBar } from "@/components/search-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
// Tooltips use native title attributes for simplicity in the graph view
import {
  ExternalLink,
  Star,
  Loader2,
  X,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Eye,
  EyeOff,
  Tag,
  GitFork,
  Link2,
} from "lucide-react";

// Dynamically import ForceGraph2D (no SSR — needs canvas)
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
});

const EDGE_TYPE_CONFIG = [
  {
    type: "similar",
    label: "Similar",
    description: "Embedding similarity",
    color: "#8b5cf6",
    linkColor: "rgba(139, 92, 246, 0.25)",
  },
  {
    type: "shared_topic",
    label: "Shared topics",
    description: "Common GitHub topics",
    color: "#10b981",
    linkColor: "rgba(16, 185, 129, 0.25)",
  },
  {
    type: "same_owner",
    label: "Same owner",
    description: "Same GitHub org/user",
    color: "#3b82f6",
    linkColor: "rgba(59, 130, 246, 0.3)",
  },
];

// Build a stable category → position mapping for clustering
function buildCategoryPositions(categories: string[]) {
  const positions: Record<string, { x: number; y: number }> = {};
  const cols = Math.ceil(Math.sqrt(categories.length));
  const spacing = 300;
  categories.forEach((cat, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    positions[cat] = {
      x: (col - cols / 2) * spacing,
      y: (row - Math.ceil(categories.length / cols) / 2) * spacing,
    };
  });
  return positions;
}

interface HoveredNode extends GraphNode {
  x?: number;
  y?: number;
}

export default function GraphPage() {
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoveredNode, setHoveredNode] = useState<HoveredNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [similarRepos, setSimilarRepos] = useState<Repo[] | null>(null);
  const [loadingSimilar, setLoadingSimilar] = useState(false);
  const [activeEdgeTypes, setActiveEdgeTypes] = useState<Set<string>>(
    new Set(["similar", "shared_topic"])
  );
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchHighlight, setSearchHighlight] = useState<Set<number>>(
    new Set()
  );
  const graphRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Sidebar width
  const sidebarWidth = 300;

  // Measure container
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  // Load data - default to similar + shared_topic
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [graph, statsData] = await Promise.all([
          api.getGraph(),
          api.getStats(),
        ]);
        setGraphData(graph);
        setStats(statsData);
      } catch (e) {
        console.error("Failed to load graph:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Load similar repos when node is selected
  useEffect(() => {
    if (!selectedNode) {
      setSimilarRepos(null);
      return;
    }
    setLoadingSimilar(true);
    api
      .getSimilar(selectedNode.id, 5)
      .then((data) => setSimilarRepos(data.similar))
      .catch(() => setSimilarRepos([]))
      .finally(() => setLoadingSimilar(false));
  }, [selectedNode]);

  // Search within graph
  useEffect(() => {
    if (!searchQuery.trim() || !graphData) {
      setSearchHighlight(new Set());
      return;
    }
    const q = searchQuery.toLowerCase();
    const matches = new Set<number>();
    graphData.nodes.forEach((n) => {
      if (
        n.label?.toLowerCase().includes(q) ||
        n.full_name?.toLowerCase().includes(q) ||
        n.description?.toLowerCase().includes(q) ||
        n.category?.toLowerCase().includes(q) ||
        n.language?.toLowerCase().includes(q)
      ) {
        matches.add(n.id);
      }
    });
    setSearchHighlight(matches);
  }, [searchQuery, graphData]);

  // Category positions for clustering
  const categoryPositions = useMemo(() => {
    if (!stats) return {};
    const cats = Object.keys(stats.by_category).sort(
      (a, b) => (stats.by_category[b] || 0) - (stats.by_category[a] || 0)
    );
    return buildCategoryPositions(cats);
  }, [stats]);

  // Filter graph data
  const filteredData = useMemo(() => {
    if (!graphData) return { nodes: [], links: [] };

    const filteredLinks = graphData.links.filter((l) =>
      activeEdgeTypes.has(l.type)
    );

    let filteredNodes = graphData.nodes;
    if (activeCategory) {
      filteredNodes = filteredNodes.filter(
        (n) => n.category === activeCategory
      );
      const catIds = new Set(filteredNodes.map((n) => n.id));
      return {
        nodes: filteredNodes,
        links: filteredLinks.filter((l) => {
          const src =
            typeof l.source === "object" ? (l.source as any).id : l.source;
          const tgt =
            typeof l.target === "object" ? (l.target as any).id : l.target;
          return catIds.has(src) && catIds.has(tgt);
        }),
      };
    }

    return { nodes: filteredNodes, links: filteredLinks };
  }, [graphData, activeEdgeTypes, activeCategory]);

  const toggleEdgeType = (type: string) => {
    setActiveEdgeTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const handleZoomIn = () => graphRef.current?.zoom(1.5, 400);
  const handleZoomOut = () => graphRef.current?.zoom(0.67, 400);
  const handleFit = () => graphRef.current?.zoomToFit(400, 60);

  const handleNodeClick = useCallback((node: any) => {
    setSelectedNode(node);
    graphRef.current?.centerAt(node.x, node.y, 400);
    graphRef.current?.zoom(3, 400);
  }, []);

  const categories = stats
    ? Object.entries(stats.by_category).sort(([, a], [, b]) => b - a)
    : [];

  const isSearching = searchHighlight.size > 0;

  // Edge type color lookup
  const edgeColorMap: Record<string, string> = {};
  EDGE_TYPE_CONFIG.forEach((e) => {
    edgeColorMap[e.type] = e.linkColor;
  });

  return (
    <TooltipProvider delay={200}>
      <div className="h-screen flex flex-col overflow-hidden">
        <NavHeader>
          {stats && (
            <span className="text-[11px] text-muted-foreground/50 font-mono">
              {filteredData.nodes.length} nodes &middot;{" "}
              {filteredData.links.length} edges
            </span>
          )}
        </NavHeader>

        <div className="flex flex-1 min-h-0">
          {/* Graph canvas */}
          <div ref={containerRef} className="flex-1 relative bg-background">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-primary/40" />
                <span className="text-xs text-muted-foreground/40 font-mono">
                  Loading knowledge graph...
                </span>
              </div>
            ) : (
              <>
                <ForceGraph2D
                  ref={graphRef}
                  graphData={filteredData}
                  width={dimensions.width - sidebarWidth}
                  height={dimensions.height}
                  nodeId="id"
                  nodeLabel=""
                  nodeRelSize={3}
                  nodeVal={(node: any) =>
                    Math.max(1.5, Math.log2(node.stars || 1) * 0.8)
                  }
                  nodeColor={(node: any) => {
                    // Dim non-matching nodes during search
                    if (isSearching && !searchHighlight.has(node.id)) {
                      return "rgba(60, 60, 80, 0.3)";
                    }
                    if (
                      selectedNode &&
                      selectedNode.id === node.id
                    ) {
                      return "#fff";
                    }
                    if (
                      hoveredNode &&
                      hoveredNode.id === node.id
                    ) {
                      return "#fff";
                    }
                    return CATEGORY_COLORS[node.category] || "#6b7280";
                  }}
                  nodeCanvasObjectMode={() => "after"}
                  nodeCanvasObject={(
                    node: any,
                    ctx: CanvasRenderingContext2D,
                    globalScale: number
                  ) => {
                    // Glow for selected/hovered node
                    if (
                      (selectedNode && selectedNode.id === node.id) ||
                      (hoveredNode && hoveredNode.id === node.id)
                    ) {
                      ctx.beginPath();
                      ctx.arc(node.x, node.y, 8 / globalScale, 0, 2 * Math.PI);
                      ctx.fillStyle = "rgba(139, 92, 246, 0.15)";
                      ctx.fill();
                    }

                    // Highlight search matches
                    if (isSearching && searchHighlight.has(node.id)) {
                      ctx.beginPath();
                      ctx.arc(
                        node.x,
                        node.y,
                        10 / globalScale,
                        0,
                        2 * Math.PI
                      );
                      ctx.strokeStyle = "rgba(139, 92, 246, 0.6)";
                      ctx.lineWidth = 1.5 / globalScale;
                      ctx.stroke();
                    }

                    // Labels at different zoom levels
                    if (globalScale > 2) {
                      const label = node.label || "";
                      const fontSize = Math.min(12, 10 / globalScale);
                      ctx.font = `500 ${fontSize}px 'Geist', sans-serif`;
                      ctx.textAlign = "center";
                      ctx.textBaseline = "top";
                      ctx.fillStyle =
                        isSearching && !searchHighlight.has(node.id)
                          ? "rgba(255,255,255,0.15)"
                          : "rgba(255,255,255,0.8)";
                      ctx.fillText(label, node.x, node.y + 7 / globalScale);
                    }
                    if (globalScale > 4) {
                      const owner = node.owner || "";
                      const fontSize = Math.min(9, 8 / globalScale);
                      ctx.font = `400 ${fontSize}px 'Geist', sans-serif`;
                      ctx.textAlign = "center";
                      ctx.textBaseline = "top";
                      ctx.fillStyle = "rgba(255,255,255,0.35)";
                      ctx.fillText(owner, node.x, node.y + 16 / globalScale);
                    }
                  }}
                  linkColor={(link: any) =>
                    edgeColorMap[link.type] || "rgba(100,100,100,0.15)"
                  }
                  linkWidth={(link: any) =>
                    Math.max(0.2, link.weight * 1.2)
                  }
                  onNodeHover={(node: any) => setHoveredNode(node || null)}
                  onNodeClick={handleNodeClick}
                  onBackgroundClick={() => setSelectedNode(null)}
                  cooldownTicks={200}
                  d3AlphaDecay={0.02}
                  d3VelocityDecay={0.25}
                  // Cluster by category using forces
                  d3AlphaMin={0.01}
                  enableNodeDrag={true}
                  backgroundColor="transparent"
                  onEngineStop={() => {
                    // Apply gentle category clustering
                    if (graphRef.current && categoryPositions) {
                      const fg = graphRef.current;
                      // Use d3 forces if available
                      try {
                        fg.d3Force("x")?.strength(0.05);
                        fg.d3Force("y")?.strength(0.05);
                      } catch {
                        // forces may not be available
                      }
                    }
                  }}
                />

                {/* Hover tooltip */}
                {hoveredNode && !selectedNode && (
                  <div className="absolute top-4 left-4 rounded-xl border border-border/30 bg-card/95 backdrop-blur-md p-4 max-w-xs pointer-events-none shadow-2xl shadow-black/20">
                    <p className="text-sm font-semibold text-foreground">
                      {hoveredNode.full_name}
                    </p>
                    {hoveredNode.description && (
                      <p className="text-[12px] text-muted-foreground/70 mt-1.5 line-clamp-2 leading-relaxed">
                        {hoveredNode.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      {hoveredNode.language && (
                        <span className="text-[11px] text-muted-foreground/50 font-mono">
                          {hoveredNode.language}
                        </span>
                      )}
                      {hoveredNode.category && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] h-4 px-1.5 bg-secondary/60 border-0"
                        >
                          {hoveredNode.category}
                        </Badge>
                      )}
                      <span className="text-[11px] text-muted-foreground/50 flex items-center gap-0.5 font-mono">
                        <Star className="h-2.5 w-2.5" />
                        {hoveredNode.stars?.toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}

                {/* Search overlay */}
                <div className="absolute top-4 left-4 w-64">
                  {!hoveredNode && (
                    <SearchBar
                      onSearch={setSearchQuery}
                      placeholder="Search graph..."
                    />
                  )}
                  {isSearching && (
                    <p className="text-[10px] text-muted-foreground/40 mt-1.5 px-1 font-mono">
                      {searchHighlight.size} match
                      {searchHighlight.size !== 1 ? "es" : ""}
                    </p>
                  )}
                </div>

                {/* Zoom controls */}
                <div className="absolute bottom-4 left-4 flex gap-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 w-8 p-0 bg-card/80 backdrop-blur-sm border border-border/20"
                    onClick={handleZoomIn}
                    title="Zoom in"
                  >
                    <ZoomIn className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 w-8 p-0 bg-card/80 backdrop-blur-sm border border-border/20"
                    onClick={handleZoomOut}
                    title="Zoom out"
                  >
                    <ZoomOut className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 w-8 p-0 bg-card/80 backdrop-blur-sm border border-border/20"
                    onClick={handleFit}
                    title="Fit to view"
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </>
            )}
          </div>

          {/* Right sidebar */}
          <aside
            className="shrink-0 border-l border-border/20 bg-card/10 backdrop-blur-sm flex flex-col overflow-hidden"
            style={{ width: sidebarWidth }}
          >
            <div className="flex-1 overflow-y-auto">
              {/* Edge type toggles */}
              <div className="p-4 border-b border-border/10">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground/30 font-semibold mb-3">
                  Connection types
                </p>
                <div className="space-y-1">
                  {EDGE_TYPE_CONFIG.map(({ type, label, description, color }) => (
                    <button
                      key={type}
                      onClick={() => toggleEdgeType(type)}
                      className={`flex items-center gap-2.5 w-full rounded-lg px-2.5 py-2 text-xs transition-all ${
                        activeEdgeTypes.has(type)
                          ? "bg-secondary/40 text-foreground"
                          : "text-muted-foreground/30 hover:text-muted-foreground/60 hover:bg-secondary/20"
                      }`}
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0 transition-opacity"
                        style={{
                          backgroundColor: color,
                          opacity: activeEdgeTypes.has(type) ? 1 : 0.2,
                        }}
                      />
                      <div className="text-left flex-1">
                        <span className="block font-medium">{label}</span>
                        <span className="block text-[10px] text-muted-foreground/40">
                          {description}
                        </span>
                      </div>
                      {activeEdgeTypes.has(type) ? (
                        <Eye className="h-3 w-3 text-muted-foreground/30" />
                      ) : (
                        <EyeOff className="h-3 w-3 text-muted-foreground/15" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Category legend */}
              <div className="p-4 border-b border-border/10">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground/30 font-semibold mb-3">
                  Categories
                </p>
                <div className="space-y-0.5 max-h-[250px] overflow-y-auto">
                  <button
                    onClick={() => setActiveCategory(null)}
                    className={`w-full text-left rounded-md px-2.5 py-1.5 text-xs transition-all ${
                      !activeCategory
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground/50 hover:text-foreground hover:bg-secondary/20"
                    }`}
                  >
                    All categories
                  </button>
                  {categories.map(([name, count]) => (
                    <button
                      key={name}
                      onClick={() =>
                        setActiveCategory(
                          activeCategory === name ? null : name
                        )
                      }
                      className={`flex items-center justify-between w-full rounded-md px-2.5 py-1.5 text-xs transition-all ${
                        activeCategory === name
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground/50 hover:text-foreground hover:bg-secondary/20"
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{
                            backgroundColor:
                              CATEGORY_COLORS[name] || "#6b7280",
                          }}
                        />
                        <span className="truncate">{name}</span>
                      </span>
                      <span className="text-[10px] text-muted-foreground/25 tabular-nums font-mono shrink-0 ml-2">
                        {count}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Selected node detail */}
              {selectedNode && (
                <div className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground/30 font-semibold">
                      Selected repo
                    </p>
                    <button
                      onClick={() => setSelectedNode(null)}
                      className="text-muted-foreground/30 hover:text-foreground transition-colors"
                      aria-label="Deselect node"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-sm font-bold tracking-tight">
                      {selectedNode.full_name}
                    </h3>
                    {selectedNode.description && (
                      <p className="text-xs text-muted-foreground/60 leading-relaxed">
                        {selectedNode.description}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {selectedNode.language && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] bg-secondary/40 border-0"
                        >
                          {selectedNode.language}
                        </Badge>
                      )}
                      {selectedNode.category && (
                        <Badge
                          variant="outline"
                          className="text-[10px]"
                          style={{
                            borderColor:
                              CATEGORY_COLORS[selectedNode.category] ||
                              "#6b7280",
                            color:
                              CATEGORY_COLORS[selectedNode.category] ||
                              "#6b7280",
                          }}
                        >
                          {selectedNode.category}
                        </Badge>
                      )}
                      <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground/40 font-mono">
                        <Star className="h-2.5 w-2.5" />
                        {selectedNode.stars?.toLocaleString()}
                      </span>
                    </div>

                    <a
                      href={selectedNode.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-primary/70 hover:text-primary transition-colors"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Open on GitHub
                    </a>

                    {/* Similar repos */}
                    <Separator className="opacity-10" />
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground/30 font-semibold mb-2">
                        Similar repos
                      </p>
                      {loadingSimilar && (
                        <div className="space-y-2">
                          {Array.from({ length: 3 }).map((_, i) => (
                            <Skeleton key={i} className="h-10 w-full rounded-lg" />
                          ))}
                        </div>
                      )}
                      {similarRepos && similarRepos.length > 0 && (
                        <div className="space-y-1">
                          {similarRepos.map((repo) => (
                            <a
                              key={repo.id}
                              href={repo.html_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs hover:bg-secondary/30 transition-colors group"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-foreground/80 group-hover:text-primary truncate transition-colors">
                                  {repo.full_name}
                                </p>
                                {repo.description && (
                                  <p className="text-[10px] text-muted-foreground/40 truncate mt-0.5">
                                    {repo.description}
                                  </p>
                                )}
                              </div>
                              <span className="text-[10px] text-muted-foreground/30 tabular-nums font-mono shrink-0">
                                {formatStars(repo.stargazers_count)}
                              </span>
                            </a>
                          ))}
                        </div>
                      )}
                      {similarRepos && similarRepos.length === 0 && (
                        <p className="text-[11px] text-muted-foreground/30">
                          No similar repos found
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </TooltipProvider>
  );
}
