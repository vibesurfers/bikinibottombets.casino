"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  DemoGraphNode,
  DemoGraphEdge,
  GraphNodeType,
} from "@/lib/demo-data";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
});

// Node color mapping
const NODE_COLORS: Record<GraphNodeType, string> = {
  pe_fund: "#9333ea",
  vc_fund: "#3b82f6",
  hedge_fund: "#f59e0b",
  asset_manager: "#8b5cf6",
  company: "#22c55e",
  person: "#06b6d4",
};

const NODE_TYPE_LABELS: Record<GraphNodeType, string> = {
  pe_fund: "PE Fund",
  vc_fund: "VC Fund",
  hedge_fund: "Hedge Fund",
  asset_manager: "Asset Mgr",
  company: "Company",
  person: "Person",
};

// Edge color by relationship category
function edgeColor(type: string): string {
  if (type === "portfolio_company" || type === "investor") return "#9333ea80";
  if (type === "co_investor") return "#f59e0b80";
  if (
    type === "executive" ||
    type === "board_member" ||
    type === "advisor" ||
    type === "founder"
  )
    return "#06b6d480";
  if (type === "customer" || type === "supplier") return "#22c55e80";
  return "#64748b80";
}

interface GraphNode extends DemoGraphNode {
  x?: number;
  y?: number;
}

interface EntityGraphProps {
  nodes: DemoGraphNode[];
  edges: DemoGraphEdge[];
}

export function EntityGraph({ nodes, edges }: EntityGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  // Resize observer for responsive container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        setDimensions({ width, height: Math.max(400, Math.min(600, width * 0.6)) });
      }
    });
    observer.observe(el);

    // Check mobile
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", checkMobile);
    };
  }, []);

  // Build graph data for react-force-graph
  const graphData = useMemo(
    () => ({
      nodes: nodes.map((n) => ({ ...n })),
      links: edges.map((e) => ({
        ...e,
        source: e.source,
        target: e.target,
      })),
    }),
    [nodes, edges]
  );

  // Connected edges for a node
  const getConnections = useCallback(
    (nodeId: string) =>
      edges.filter((e) => e.source === nodeId || e.target === nodeId),
    [edges]
  );

  // Custom node rendering
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodeCanvasObject = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const color = NODE_COLORS[node.type as GraphNodeType] ?? "#64748b";
      const isSelected = selectedNode?.id === node.id;
      const fontSize = Math.max(10 / globalScale, 2);
      const nodeSize = node.data.entityType === "person" ? 6 : 8;

      ctx.save();

      if (node.data.entityType === "person") {
        // Circle for persons
        ctx.beginPath();
        ctx.arc(x, y, nodeSize, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();
        if (isSelected) {
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2 / globalScale;
          ctx.stroke();
        }
      } else {
        // Rounded rectangle for organizations
        const w = nodeSize * 2.5;
        const h = nodeSize * 1.6;
        const r = 3;
        ctx.beginPath();
        ctx.moveTo(x - w + r, y - h);
        ctx.lineTo(x + w - r, y - h);
        ctx.quadraticCurveTo(x + w, y - h, x + w, y - h + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x - w + r, y + h);
        ctx.quadraticCurveTo(x - w, y + h, x - w, y + h - r);
        ctx.lineTo(x - w, y - h + r);
        ctx.quadraticCurveTo(x - w, y - h, x - w + r, y - h);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        if (isSelected) {
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2 / globalScale;
          ctx.stroke();
        }
      }

      // Label below node
      ctx.font = `${fontSize}px Sans-Serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      // Dark outline for readability
      ctx.strokeStyle = "rgba(0,0,0,0.8)";
      ctx.lineWidth = 3 / globalScale;
      ctx.strokeText(node.label, x, y + nodeSize + 2);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(node.label, x, y + nodeSize + 2);

      ctx.restore();
    },
    [selectedNode]
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleNodeClick = useCallback((node: any) => {
    setSelectedNode((prev) => (prev?.id === node.id ? null : node));
  }, []);

  const handleZoomIn = () => graphRef.current?.zoom(2, 300);
  const handleZoomOut = () => graphRef.current?.zoom(0.5, 300);
  const handleFitToView = () => graphRef.current?.zoomToFit(400, 40);

  // Entity count stats
  const orgCount = nodes.filter((n) => n.data.entityType === "organization").length;
  const personCount = nodes.filter((n) => n.data.entityType === "person").length;

  if (isMobile) {
    return <MobileFallback nodes={nodes} edges={edges} />;
  }

  return (
    <div className="space-y-4">
      {/* Header with stats */}
      <div className="flex items-center justify-between" data-testid="graph-header">
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">
            {orgCount} organizations, {personCount} persons, {edges.length} relationships
          </span>
        </div>
      </div>

      {/* Graph container */}
      <div ref={containerRef} className="relative rounded-lg border bg-card overflow-hidden">
        <ForceGraph2D
          ref={graphRef}
          graphData={graphData}
          width={dimensions.width}
          height={dimensions.height}
          nodeCanvasObject={nodeCanvasObject}
          nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
            const x = node.x ?? 0;
            const y = node.y ?? 0;
            const size = node.data?.entityType === "person" ? 6 : 8;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(x, y, size + 2, 0, 2 * Math.PI);
            ctx.fill();
          }}
          onNodeClick={handleNodeClick}
          linkColor={(link: any) => edgeColor(link.type)}
          linkDirectionalArrowLength={4}
          linkDirectionalArrowRelPos={0.85}
          linkLabel={(link: any) => link.label}
          linkWidth={1.5}
          backgroundColor="transparent"
          cooldownTicks={100}
          onEngineStop={() => graphRef.current?.zoomToFit(400, 40)}
        />

        {/* Graph controls */}
        <div className="absolute top-3 right-3 flex flex-col gap-1" data-testid="graph-controls">
          <Button variant="outline" size="xs" onClick={handleZoomIn} title="Zoom in">+</Button>
          <Button variant="outline" size="xs" onClick={handleZoomOut} title="Zoom out">-</Button>
          <Button variant="outline" size="xs" onClick={handleFitToView} title="Fit to view">Fit</Button>
        </div>

        {/* Legend */}
        <GraphLegend />
      </div>

      {/* Node detail panel */}
      {selectedNode && (
        <NodeDetailPanel
          node={selectedNode}
          connections={getConnections(selectedNode.id)}
          nodes={nodes}
          onSelectNode={(id) => {
            const target = nodes.find((n) => n.id === id);
            if (target) setSelectedNode(target as GraphNode);
          }}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  );
}

function GraphLegend() {
  return (
    <div
      className="absolute bottom-3 left-3 bg-card/90 backdrop-blur-sm rounded-lg border p-2 text-xs"
      data-testid="graph-legend"
    >
      <div className="grid grid-cols-3 gap-x-3 gap-y-1">
        {(Object.entries(NODE_COLORS) as [GraphNodeType, string][]).map(
          ([type, color]) => (
            <div key={type} className="flex items-center gap-1.5">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="text-muted-foreground">{NODE_TYPE_LABELS[type]}</span>
            </div>
          )
        )}
      </div>
    </div>
  );
}

function NodeDetailPanel({
  node,
  connections,
  nodes,
  onSelectNode,
  onClose,
}: {
  node: DemoGraphNode;
  connections: DemoGraphEdge[];
  nodes: DemoGraphNode[];
  onSelectNode: (id: string) => void;
  onClose: () => void;
}) {
  const nodeMap = useMemo(
    () => new Map(nodes.map((n) => [n.id, n])),
    [nodes]
  );

  // Group connections by type
  const grouped = useMemo(() => {
    const groups: Record<string, Array<{ edge: DemoGraphEdge; other: DemoGraphNode | undefined }>> = {};
    for (const edge of connections) {
      const otherId = edge.source === node.id ? edge.target : edge.source;
      const other = nodeMap.get(otherId);
      const key = edge.type;
      if (!groups[key]) groups[key] = [];
      groups[key].push({ edge, other });
    }
    return groups;
  }, [connections, node.id, nodeMap]);

  const formatAum = (aum: number) => {
    if (aum >= 1e9) return `$${(aum / 1e9).toFixed(1)}B`;
    if (aum >= 1e6) return `$${(aum / 1e6).toFixed(0)}M`;
    return `$${aum.toLocaleString()}`;
  };

  return (
    <Card data-testid="node-detail-panel">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge
              style={{ backgroundColor: NODE_COLORS[node.type] }}
              className="text-white"
            >
              {NODE_TYPE_LABELS[node.type]}
            </Badge>
            <CardTitle className="text-lg">{node.label}</CardTitle>
          </div>
          <Button variant="ghost" size="xs" onClick={onClose}>
            Close
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Metadata */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          {node.data.ticker && (
            <div>
              <span className="text-muted-foreground">Ticker: </span>
              <span className="font-mono">${node.data.ticker}</span>
            </div>
          )}
          {node.data.aum && (
            <div>
              <span className="text-muted-foreground">AUM: </span>
              <span>{formatAum(node.data.aum)}</span>
            </div>
          )}
          {node.data.title && (
            <div className="col-span-2">
              <span className="text-muted-foreground">Title: </span>
              <span>{node.data.title}</span>
            </div>
          )}
          {node.data.headquarters && (
            <div className="col-span-2">
              <span className="text-muted-foreground">HQ: </span>
              <span>{node.data.headquarters}</span>
            </div>
          )}
          {node.data.description && (
            <div className="col-span-2">
              <span className="text-muted-foreground">About: </span>
              <span>{node.data.description}</span>
            </div>
          )}
        </div>

        {/* Connections grouped by type */}
        {Object.entries(grouped).map(([type, items]) => (
          <div key={type}>
            <h4 className="text-xs font-medium text-muted-foreground uppercase mb-1">
              {type.replace(/_/g, " ")}
            </h4>
            <div className="space-y-1">
              {items.map(({ edge, other }) => (
                <button
                  key={edge.id}
                  className="flex items-center gap-2 text-sm w-full text-left hover:bg-muted/50 rounded px-2 py-1 transition-colors"
                  onClick={() => other && onSelectNode(other.id)}
                >
                  {other && (
                    <span
                      className="inline-block w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: NODE_COLORS[other.type] }}
                    />
                  )}
                  <span>{other?.label ?? "Unknown"}</span>
                  <span className="text-muted-foreground ml-auto text-xs">
                    {edge.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function MobileFallback({
  nodes,
  edges,
}: {
  nodes: DemoGraphNode[];
  edges: DemoGraphEdge[];
}) {
  const nodeMap = useMemo(
    () => new Map(nodes.map((n) => [n.id, n])),
    [nodes]
  );

  // Group nodes by entity type
  const organizations = nodes.filter((n) => n.data.entityType === "organization");
  const persons = nodes.filter((n) => n.data.entityType === "person");

  const getNodeEdges = (nodeId: string) =>
    edges.filter((e) => e.source === nodeId || e.target === nodeId);

  return (
    <div className="space-y-4" data-testid="mobile-fallback">
      <p className="text-sm text-muted-foreground">
        {organizations.length} organizations, {persons.length} persons,{" "}
        {edges.length} relationships
      </p>

      {/* Organizations */}
      <div>
        <h3 className="text-sm font-semibold mb-2">Organizations</h3>
        <div className="space-y-2">
          {organizations.map((node) => (
            <MobileNodeCard
              key={node.id}
              node={node}
              edges={getNodeEdges(node.id)}
              nodeMap={nodeMap}
            />
          ))}
        </div>
      </div>

      {/* Persons */}
      <div>
        <h3 className="text-sm font-semibold mb-2">People</h3>
        <div className="space-y-2">
          {persons.map((node) => (
            <MobileNodeCard
              key={node.id}
              node={node}
              edges={getNodeEdges(node.id)}
              nodeMap={nodeMap}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function MobileNodeCard({
  node,
  edges,
  nodeMap,
}: {
  node: DemoGraphNode;
  edges: DemoGraphEdge[];
  nodeMap: Map<string, DemoGraphNode>;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="py-3">
      <CardContent className="px-4 py-0">
        <button
          className="flex items-center gap-2 w-full text-left"
          onClick={() => setExpanded(!expanded)}
        >
          <span
            className="inline-block w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: NODE_COLORS[node.type] }}
          />
          <span className="font-medium text-sm">{node.label}</span>
          <Badge variant="outline" className="ml-auto text-xs">
            {NODE_TYPE_LABELS[node.type]}
          </Badge>
          <span className="text-muted-foreground text-xs">
            {expanded ? "^" : "v"}
          </span>
        </button>
        {expanded && edges.length > 0 && (
          <div className="mt-2 pl-5 space-y-1 border-l border-muted">
            {edges.map((edge) => {
              const otherId =
                edge.source === node.id ? edge.target : edge.source;
              const other = nodeMap.get(otherId);
              return (
                <div
                  key={edge.id}
                  className="flex items-center gap-2 text-xs text-muted-foreground"
                >
                  {other && (
                    <span
                      className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: NODE_COLORS[other.type] }}
                    />
                  )}
                  <span>{edge.label}</span>
                  <span className="font-medium text-foreground">
                    {other?.label ?? "Unknown"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
