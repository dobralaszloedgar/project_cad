"use client";
import { memo, useCallback, useMemo, useState, useRef, useEffect } from "react";
import { Maximize, Minus, Plus } from "lucide-react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  ControlButton,
  Handle,
  Position,
  MarkerType,
  BaseEdge,
  useReactFlow,
  useNodesInitialized,
  type NodeProps,
  type Node,
  type EdgeProps,
  type NodeChange,
} from "@xyflow/react";
import {
  type Project,
  type Unit,
  type Kind,
  type Connection,
  ports,
  validateGraph,
} from "@/domain/schema";
import { EquipmentIcon } from "./EquipmentIcon";
import { equipmentPort, streamPath } from "./flow-geometry";
import type { Result } from "@/domain/solver";
import { flow } from "@/domain/solver";
import { diff } from "@/lib/revisions";
import { projectStreamColors, streamColors } from "./stream-colors";
export { streamColors } from "./stream-colors";
const mixerDropHandle = "mixer-center";
type EquipmentNode = Node<
  { unit: Unit; connected: string[]; change?: string },
  "equipment"
>;
function portGeometry(kind: Kind, output: boolean, index: number) {
  const { x, y, position } = equipmentPort(kind, output, index);
  return {
    position,
    style: {
      left: `${(x / 128) * 100}%`,
      top: `${(y / 128) * 100}%`,
      right: "auto",
      bottom: "auto",
      transform: "translate(-50%, -50%)",
    },
  };
}
const UnitNode = memo(function UnitNode({
  data,
  selected,
}: NodeProps<EquipmentNode>) {
  const n = data.unit,
    p = ports(n.kind);
  return (
    <div
      className={`equipment-node ${n.kind === "PBR" || n.kind === "Distillation" ? "bottom-outlet" : ""} ${selected ? "selected" : ""} ${data.change ?? ""}`}
    >
      <span className="unit-tag">{n.id}</span>
      {p.inputs.map((id, i) => (
        <Handle
          key={id}
          id={id}
          type="target"
          aria-label={`${n.id} inlet ${id}`}
          title={`${n.id} · ${id === "in2" ? "Secondary inlet" : "Inlet"}`}
          isConnectable={n.kind === "Mixer" || !data.connected.includes(id)}
          isConnectableStart={false}
          {...portGeometry(n.kind, false, i)}
          className="material-handle"
        />
      ))}
      {n.kind === "Mixer" && (
        <Handle
          id={mixerDropHandle}
          type="target"
          position={Position.Left}
          isConnectableStart={false}
          className="mixer-drop-handle"
          aria-label={`${n.id} connect streams to mixer`}
        />
      )}
      <EquipmentIcon kind={n.kind} size={128} />
      <span className="unit-name">{n.name}</span>
      {p.outputs.map((id, i) => (
        <Handle
          key={id}
          id={id}
          type="source"
          aria-label={`${n.id} outlet ${id}`}
          title={`${n.id} · ${id === "out2" ? "Secondary outlet" : "Outlet"}`}
          isConnectable={!data.connected.includes(id)}
          isConnectableEnd={false}
          {...portGeometry(n.kind, true, i)}
          className="material-handle"
        />
      ))}
    </div>
  );
});
const PipeEdge = memo(function PipeEdge(props: EdgeProps) {
  const colored = props.data?.compositionColors === true;
  const path = streamPath(props);
  return (
    <g>
      <BaseEdge
        id={props.id}
        path={path}
        markerEnd={props.markerEnd}
        style={props.style}
        interactionWidth={24}
      />
      {colored ? (
        <path
          className="stream-flow-motion"
          d={path}
          fill="none"
          stroke="var(--canvas)"
          strokeWidth={1.2}
          strokeDasharray="3 18"
          pointerEvents="none"
        />
      ) : null}
    </g>
  );
});
const nodeTypes = { equipment: UnitNode };
const edgeTypes = { pipe: PipeEdge };
interface Props {
  project: Project;
  selected: string | null;
  onSelect: (id: string) => void;
  onInspect: (id: string) => void;
  onChange: (project: Project, label: string) => void;
  onAdd: (kind: Kind, position?: { x: number; y: number }) => void;
  onError: (message: string) => void;
  result: Result | null;
  compositionColors: boolean;
  compare?: Project;
}
function Inner(props: Props) {
  const {
    project,
    selected,
    onSelect,
    onInspect,
    onChange,
    onAdd,
    onError,
    result,
    compare,
    compositionColors,
  } = props;
  const rf = useReactFlow();
  const containerRef = useRef<HTMLDivElement>(null);
  const initialized = useNodesInitialized();
  const initiallyFramed = useRef(false);
  useEffect(() => {
    if (!initialized || initiallyFramed.current) return;
    initiallyFramed.current = true;
    const first = rf.getNodes()[0];
    const container = containerRef.current;
    if (first && container && window.matchMedia("(max-width: 760px)").matches) {
      void rf.setViewport({
        x: 28 - first.position.x,
        y: Math.max(150, container.clientHeight * 0.42) - first.position.y,
        zoom: 1,
      });
    }
  }, [initialized, rf]);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let frame = 0;
    let width = container.clientWidth;
    let height = container.clientHeight;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const nextWidth = container.clientWidth;
        const nextHeight = container.clientHeight;
        if (
          width > 0 &&
          height > 0 &&
          nextWidth > 0 &&
          nextHeight > 0 &&
          (width !== nextWidth || height !== nextHeight)
        ) {
          const viewport = rf.getViewport();
          // Preserve the world point at the center instead of refitting on resize.
          void rf.setViewport({
            ...viewport,
            x: viewport.x + (nextWidth - width) / 2,
            y: viewport.y + (nextHeight - height) / 2,
          });
        }
        width = nextWidth;
        height = nextHeight;
      });
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [rf]);
  const [positions, setPositions] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const [measurements, setMeasurements] = useState<
    Record<string, EquipmentNode["measured"]>
  >({});
  const [hover, setHover] = useState("");
  const changes = useMemo(
    () => (compare ? diff(compare, project) : null),
    [compare, project],
  );
  const baseNodes: EquipmentNode[] = useMemo(() => {
    const connected = new Map<string, string[]>();
    for (const edge of project.edges) {
      connected.set(edge.source, [
        ...(connected.get(edge.source) ?? []),
        edge.sourcePort,
      ]);
      connected.set(edge.target, [
        ...(connected.get(edge.target) ?? []),
        edge.targetPort,
      ]);
    }
    return project.units.map((unit) => ({
      id: unit.id,
      type: "equipment",
      position: unit.position,
      data: {
        unit,
        connected: connected.get(unit.id) ?? [],
        change: changes?.added.some((n) => n.id === unit.id)
          ? "added"
          : changes?.changed.some((n) => n.id === unit.id)
            ? "modified"
            : undefined,
      },
    }));
  }, [project.units, project.edges, changes]);
  const nodes: EquipmentNode[] = useMemo(
    () =>
      baseNodes.map((node) => ({
        ...node,
        position: positions[node.id] ?? node.position,
        measured: measurements[node.id],
        selected: node.id === selected,
      })),
    [baseNodes, positions, measurements, selected],
  );
  const colors = useMemo(
    () => (compositionColors ? projectStreamColors(project, result) : {}),
    [project, result, compositionColors],
  );
  const edges = useMemo(
    () =>
      project.edges.map((e) => {
        const color = compositionColors ? colors[e.id] : streamColors[e.color];
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourcePort,
          targetHandle: e.targetPort,
          type: "pipe",
          data: { compositionColors },
          style: { stroke: color, strokeWidth: selected === e.id ? 3.5 : 2.5 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color,
            width: 14,
            height: 14,
          },
          selected: e.id === selected,
        };
      }),
    [project.edges, compositionColors, colors, selected],
  );
  function targetPort(connection: {
    target: string;
    targetHandle?: string | null;
  }): Connection["targetPort"] {
    if (
      connection.targetHandle === mixerDropHandle &&
      project.units.some(
        (unit) => unit.id === connection.target && unit.kind === "Mixer",
      )
    ) {
      // Keep persisted port IDs compatible with existing projects and distribute
      // center drops across both inlet branches, including occupied branches.
      const incoming = project.edges.filter(
        (edge) => edge.target === connection.target,
      );
      return incoming.filter((edge) => edge.targetPort === "in").length <=
        incoming.filter((edge) => edge.targetPort === "in2").length
        ? "in"
        : "in2";
    }
    return connection.targetHandle as Connection["targetPort"];
  }
  const nodeChanges = useCallback((changes: NodeChange<EquipmentNode>[]) => {
    const dimensions = changes.filter(
      (change) => change.type === "dimensions" && change.dimensions,
    );
    if (dimensions.length) {
      setMeasurements((previous) => {
        const next = { ...previous };
        for (const change of dimensions) {
          if (change.type === "dimensions") next[change.id] = change.dimensions;
        }
        return next;
      });
    }
    const moved = changes.filter((c) => c.type === "position" && c.position);
    if (moved.length)
      setPositions((prev) => ({
        ...prev,
        ...Object.fromEntries(
          moved.map((c) => (c.type === "position" ? [c.id, c.position] : [])),
        ),
      }));
  }, []);
  const duration = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 220;
  return (
    <div
      ref={containerRef}
      className="flow-wrapper"
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(e) => {
        e.preventDefault();
        const kind = e.dataTransfer.getData("application/project-cad") as Kind;
        if (
          [
            "Feed",
            "Product",
            "Mixer",
            "Splitter",
            "PBR",
            "Heater",
            "Cooler",
            "Distillation",
          ].includes(kind)
        )
          onAdd(kind, rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={3}
        panOnScroll
        panOnScrollSpeed={1}
        panOnDrag={[0, 1, 2]}
        panActivationKeyCode="Space"
        zoomOnScroll={false}
        zoomOnPinch
        zoomActivationKeyCode={["Control", "Meta"]}
        zoomOnDoubleClick={false}
        onNodesChange={nodeChanges}
        onNodeDragStop={(_, node) => {
          onChange(
            {
              ...project,
              units: project.units.map((n) =>
                n.id === node.id
                  ? {
                      ...n,
                      position: {
                        x: Math.round(node.position.x / 10) * 10,
                        y: Math.round(node.position.y / 10) * 10,
                      },
                    }
                  : n,
              ),
            },
            "Move equipment",
          );
          setPositions({});
        }}
        onNodeClick={(_, node) => onSelect(node.id)}
        onNodeDoubleClick={(_, node) => onInspect(node.id)}
        onEdgeClick={(_, edge) => onInspect(edge.id)}
        onEdgeMouseEnter={(_, edge) => {
          const s = result?.streams[edge.id];
          setHover(
            s
              ? `${edge.id} · ${flow(s).toFixed(3)} mol/s · ${s.temperature.toFixed(1)} K · xA ${(s.a / Math.max(flow(s), 1e-12)).toFixed(3)}`
              : `${edge.id} · Run to calculate`,
          );
        }}
        onEdgeMouseLeave={() => setHover("")}
        isValidConnection={(connection) => {
          if (!connection.sourceHandle || !connection.targetHandle)
            return false;
          return (
            validateGraph({
              ...project,
              edges: [
                ...project.edges,
                {
                  id: "pending-connection",
                  source: connection.source,
                  target: connection.target,
                  sourcePort:
                    connection.sourceHandle as Connection["sourcePort"],
                  targetPort: targetPort(connection),
                  color: "teal",
                },
              ],
            }).length === 0
          );
        }}
        onConnect={(c) => {
          const edge: Connection = {
            id: crypto.randomUUID(),
            source: c.source,
            target: c.target,
            sourcePort: c.sourceHandle as Connection["sourcePort"],
            targetPort: targetPort(c),
            color: "teal",
          };
          const next = { ...project, edges: [...project.edges, edge] };
          const errors = validateGraph(next);
          if (errors.length) onError(errors[0]);
          else onChange(next, "Connect stream");
        }}
        onBeforeDelete={async ({ nodes, edges }) => {
          const ids = new Set(nodes.map((n) => n.id)),
            edgeIds = new Set(edges.map((e) => e.id));
          onChange(
            {
              ...project,
              units: project.units.filter((n) => !ids.has(n.id)),
              edges: project.edges.filter(
                (e) =>
                  !edgeIds.has(e.id) &&
                  !ids.has(e.source) &&
                  !ids.has(e.target),
              ),
            },
            "Delete selection",
          );
          return false;
        }}
        deleteKeyCode={["Backspace", "Delete"]}
      >
        <Background color="#bfcac4" gap={24} size={1} />
        <Controls showInteractive={false} showZoom={false} showFitView={false}>
          <ControlButton
            title="Zoom In"
            aria-label="Zoom In"
            onClick={() => void rf.zoomIn({ duration: duration() })}
          >
            <Plus />
          </ControlButton>
          <ControlButton
            title="Zoom Out"
            aria-label="Zoom Out"
            onClick={() => void rf.zoomOut({ duration: duration() })}
          >
            <Minus />
          </ControlButton>
          <ControlButton
            title="Fit View"
            aria-label="Fit View"
            onClick={() =>
              void rf.fitView({ padding: 0.2, duration: duration() })
            }
          >
            <Maximize />
          </ControlButton>
        </Controls>
      </ReactFlow>
      <div className="navigation-hint">
        Drag / scroll to pan · Pinch or Ctrl/⌘ + scroll to zoom
      </div>
      {hover ? <div className="canvas-footnote">{hover}</div> : null}
    </div>
  );
}
export default function ProcessCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  );
}
