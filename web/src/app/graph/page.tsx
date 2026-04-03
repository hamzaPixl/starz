"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { api, type GraphData, type GraphNode, type Stats } from "@/lib/api";
import { NavHeader } from "@/components/nav-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ExternalLink,
  Star,
  Loader2,
  X,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from "lucide-react";

// Dynamically import ForceGraph2D (no SSR — needs canvas)
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
});

// Category → color mapping
const CATEGORY_COLORS: Record<string, string> = {
  "Frontend Framework": "#3b82f6",
  "Backend Framework": "#10b981",
  "CLI Tool": "#f59e0b",
  "ML/AI Library": "#8b5cf6",
  "DevOps/Infrastructure": "#ef4444",
  "Database/Storage": "#06b6d4",
  "UI Component Library": "#ec4899",
  "Programming Language/Runtime": "#f97316",
  "Testing Tool": "#84cc16",
  "Documentation/Static Site": "#6366f1",
  "Security Tool": "#dc2626",
  "Data Processing": "#14b8a6",
  "Mobile Development": "#a855f7",
  "Developer Productivity": "#eab308",
  Other: "#6b7280",
};

const EDGE_TYPE_COLORS: Record<string, string> = {
  similar: "rgba(139, 92, 246, 0.3)",
  same_owner: "rgba(59, 130, 246, 0.4)",
  shared_topic: "rgba(16, 185, 129, 0.35)",
};

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
  const [activeEdgeTypes, setActiveEdgeTypes] = useState<Set<string>>(
    new Set(["similar", "same_owner", "shared_topic"])
  );
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const graphRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

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

  // Load data
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

  // Filter graph data by active edge types and category
  const filteredData = useCallback(() => {
    if (!graphData) return { nodes: [], links: [] };

    const filteredLinks = graphData.links.filter((l) =>
      activeEdgeTypes.has(l.type)
    );

    // Get node IDs that have at least one link
    const connectedIds = new Set<number>();
    filteredLinks.forEach((l) => {
      const src = typeof l.source === "object" ? (l.source as any).id : l.source;
      const tgt = typeof l.target === "object" ? (l.target as any).id : l.target;
      connectedIds.add(src);
      connectedIds.add(tgt);
    });

    let filteredNodes = graphData.nodes;
    if (activeCategory) {
      filteredNodes = filteredNodes.filter(
        (n) => n.category === activeCategory
      );
      const catIds = new Set(filteredNodes.map((n) => n.id));
      return {
        nodes: filteredNodes,
        links: filteredLinks.filter((l) => {
          const src = typeof l.source === "object" ? (l.source as any).id : l.source;
          const tgt = typeof l.target === "object" ? (l.target as any).id : l.target;
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
  const handleFit = () => graphRef.current?.zoomToFit(400, 50);

  const categories = stats
    ? Object.entries(stats.by_category).sort(([, a], [, b]) => b - a)
    : [];

  const data = filteredData();

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <NavHeader>
        {stats && (
          <span className="text-[11px] text-muted-foreground font-mono">
            {data.nodes.length} nodes &middot; {data.links.length} edges
          </span>
        )}
      </NavHeader>

      <div className="flex flex-1 min-h-0">
        {/* Graph canvas */}
        <div ref={containerRef} className="flex-1 relative bg-background">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <ForceGraph2D
                ref={graphRef}
                graphData={data}
                width={dimensions.width - (selectedNode ? 320 : 0)}
                height={dimensions.height}
                nodeId="id"
                nodeLabel=""
                nodeRelSize={4}
                nodeVal={(node: any) =>
                  Math.max(1, Math.log2(node.stars || 1))
                }
                nodeColor={(node: any) =>
                  hoveredNode && hoveredNode.id === node.id
                    ? "#fff"
                    : CATEGORY_COLORS[node.category] || "#6b7280"
                }
                nodeCanvasObjectMode={() => "after"}
                nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
                  if (globalScale > 2.5) {
                    const label = node.label || "";
                    const fontSize = 10 / globalScale;
                    ctx.font = `${fontSize}px sans-serif`;
                    ctx.textAlign = "center";
                    ctx.textBaseline = "top";
                    ctx.fillStyle = "rgba(255,255,255,0.7)";
                    ctx.fillText(
                      label,
                      node.x,
                      node.y + 6 / globalScale
                    );
                  }
                }}
                linkColor={(link: any) =>
                  EDGE_TYPE_COLORS[link.type] || "rgba(100,100,100,0.2)"
                }
                linkWidth={(link: any) => Math.max(0.3, link.weight * 1.5)}
                onNodeHover={(node: any) => setHoveredNode(node || null)}
                onNodeClick={(node: any) => {
                  setSelectedNode(node);
                  graphRef.current?.centerAt(node.x, node.y, 400);
                  graphRef.current?.zoom(3, 400);
                }}
                onBackgroundClick={() => setSelectedNode(null)}
                cooldownTicks={100}
                d3AlphaDecay={0.03}
                d3VelocityDecay={0.3}
                enableNodeDrag={true}
                backgroundColor="transparent"
              />

              {/* Hover tooltip */}
              {hoveredNode && !selectedNode && (
                <div className="absolute top-4 left-4 rounded-lg border border-border/50 bg-card/95 backdrop-blur-sm p-3 max-w-xs pointer-events-none">
                  <p className="text-xs font-semibold text-foreground">
                    {hoveredNode.full_name}
                  </p>
                  {hoveredNode.description && (
                    <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">
                      {hoveredNode.description}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1.5">
                    {hoveredNode.language && (
                      <span className="text-[10px] text-muted-foreground">
                        {hoveredNode.language}
                      </span>
                    )}
                    {hoveredNode.category && (
                      <Badge variant="secondary" className="text-[10px] h-4 px-1">
                        {hoveredNode.category}
                      </Badge>
                    )}
                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                      <Star className="h-2.5 w-2.5" />
                      {hoveredNode.stars?.toLocaleString()}
                    </span>
                  </div>
                </div>
              )}

              {/* Zoom controls */}
              <div className="absolute bottom-4 left-4 flex gap-1">
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-8 w-8 p-0"
                  onClick={handleZoomIn}
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-8 w-8 p-0"
                  onClick={handleZoomOut}
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-8 w-8 p-0"
                  onClick={handleFit}
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Right panel: filters + selected node detail */}
        <aside className="w-[280px] shrink-0 border-l border-border/50 bg-card/30 flex flex-col overflow-y-auto">
          {/* Edge type toggles */}
          <div className="p-4 border-b border-border/30">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-medium mb-2">
              Connection types
            </p>
            <div className="space-y-1.5">
              {[
                { type: "similar", label: "Similar (embedding)", color: "#8b5cf6" },
                { type: "same_owner", label: "Same owner", color: "#3b82f6" },
                { type: "shared_topic", label: "Shared topics", color: "#10b981" },
              ].map(({ type, label, color }) => (
                <button
                  key={type}
                  onClick={() => toggleEdgeType(type)}
                  className={`flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-xs transition-colors ${
                    activeEdgeTypes.has(type)
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground/50 hover:text-muted-foreground"
                  }`}
                >
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: color, opacity: activeEdgeTypes.has(type) ? 1 : 0.3 }}
                  />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Category filter */}
          <div className="p-4 border-b border-border/30">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-medium mb-2">
              Filter by category
            </p>
            <div className="space-y-0.5">
              <button
                onClick={() => setActiveCategory(null)}
                className={`w-full text-left rounded-md px-2 py-1 text-xs transition-colors ${
                  !activeCategory
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                All categories
              </button>
              {categories.map(([name, count]) => (
                <button
                  key={name}
                  onClick={() =>
                    setActiveCategory(activeCategory === name ? null : name)
                  }
                  className={`flex items-center justify-between w-full rounded-md px-2 py-1 text-xs transition-colors ${
                    activeCategory === name
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{
                        backgroundColor: CATEGORY_COLORS[name] || "#6b7280",
                      }}
                    />
                    <span className="truncate">{name}</span>
                  </span>
                  <span className="text-[10px] opacity-50">{count}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Selected node detail */}
          {selectedNode && (
            <div className="p-4 flex-1">
              <div className="flex items-start justify-between mb-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-medium">
                  Selected
                </p>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold">{selectedNode.full_name}</h3>
                {selectedNode.description && (
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {selectedNode.description}
                  </p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {selectedNode.language && (
                    <Badge variant="secondary" className="text-[10px]">
                      {selectedNode.language}
                    </Badge>
                  )}
                  {selectedNode.category && (
                    <Badge
                      variant="outline"
                      className="text-[10px]"
                      style={{
                        borderColor: CATEGORY_COLORS[selectedNode.category] || "#6b7280",
                        color: CATEGORY_COLORS[selectedNode.category] || "#6b7280",
                      }}
                    >
                      {selectedNode.category}
                    </Badge>
                  )}
                  <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                    <Star className="h-2.5 w-2.5" />
                    {selectedNode.stars?.toLocaleString()}
                  </span>
                </div>
                <a
                  href={selectedNode.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                >
                  <ExternalLink className="h-3 w-3" />
                  Open on GitHub
                </a>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
