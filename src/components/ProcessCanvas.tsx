"use client";
import { useMemo, useState, useRef, useEffect, useId } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Handle,
  MarkerType,
  BaseEdge,
  applyNodeChanges,
  useReactFlow,
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
export const streamColors = {
  teal: "#7f8e87",
  blue: "#367c6c",
  amber: "#b47b1e",
};
type EquipmentNode = Node<{ unit: Unit; change?: string }, "equipment">;
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
function UnitNode({ data, selected }: NodeProps<EquipmentNode>) {
  const n = data.unit,
    p = ports(n.kind);
  return (
    <div
      className={`equipment-node ${selected ? "selected" : ""} ${data.change ?? ""}`}
    >
      <span className="unit-tag">{n.id}</span>
      {p.inputs.map((id, i) => (
        <Handle
          key={id}
          id={id}
          type="target"
          {...portGeometry(n.kind, false, i)}
          className="material-handle"
        />
      ))}
      <EquipmentIcon kind={n.kind} size={128} />
      <span className="unit-name">{n.name}</span>
      {p.outputs.map((id, i) => (
        <Handle
          key={id}
          id={id}
          type="source"
          {...portGeometry(n.kind, true, i)}
          className="material-handle"
        />
      ))}
    </div>
  );
}
function PipeEdge(props: EdgeProps) {
  const gradient = `stream-${useId().replace(/:/g, "")}`;
  const rainbow = props.data?.rainbow === true;
  const path = streamPath(props);
  return (
    <g>
      {rainbow ? (
        <defs>
          <linearGradient
            id={gradient}
            gradientUnits="userSpaceOnUse"
            x1={props.sourceX}
            y1={props.sourceY}
            x2={props.targetX}
            y2={props.targetY}
          >
            {[
              "#25866a",
              "#3192b4",
              "#6a6bc3",
              "#b15a9a",
              "#cb7355",
              "#b49836",
              "#25866a",
            ].map((color, index) => (
              <stop
                key={index}
                offset={`${(index / 6) * 100}%`}
                stopColor={color}
              />
            ))}
          </linearGradient>
        </defs>
      ) : null}
      <BaseEdge
        id={props.id}
        path={path}
        markerEnd={props.markerEnd}
        style={{
          ...props.style,
          ...(rainbow ? { stroke: `url(#${gradient})`, strokeWidth: 2.5 } : {}),
        }}
        interactionWidth={24}
      />
      {rainbow ? (
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
}
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
  rainbow: boolean;
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
    rainbow,
  } = props;
  const rf = useReactFlow();
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const first = rf.getNodes()[0];
        if (first && window.matchMedia("(max-width: 760px)").matches) {
          void rf.setViewport({
            x: 28 - first.position.x,
            y: Math.max(150, container.clientHeight * 0.42) - first.position.y,
            zoom: 1,
          });
          return;
        }
        void rf.fitView({ padding: 0.25 });
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
  const changes = compare ? diff(compare, project) : null;
  const nodes: EquipmentNode[] = useMemo(
    () =>
      project.units.map((unit) => ({
        id: unit.id,
        type: "equipment",
        position: positions[unit.id] ?? unit.position,
        measured: measurements[unit.id],
        data: {
          unit,
          change: changes?.added.some((n) => n.id === unit.id)
            ? "added"
            : changes?.changed.some((n) => n.id === unit.id)
              ? "modified"
              : undefined,
        },
        selected: unit.id === selected,
      })),
    [project.units, positions, measurements, selected, changes],
  );
  const edges = project.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourcePort,
    targetHandle: e.targetPort,
    type: "pipe",
    data: { rainbow },
    style: {
      stroke: streamColors[e.color],
      strokeWidth: selected === e.id ? 3 : 2,
    },
    markerEnd: { type: MarkerType.ArrowClosed, color: streamColors[e.color] },
    selected: e.id === selected,
  }));
  function nodeChanges(changes: NodeChange<EquipmentNode>[]) {
    const measuredIds = new Set(
      changes
        .filter((change) => change.type === "dimensions")
        .map((change) => change.id),
    );
    if (measuredIds.size) {
      const initialized = applyNodeChanges(changes, nodes);
      setMeasurements((previous) => ({
        ...previous,
        ...Object.fromEntries(
          initialized
            .filter((node) => measuredIds.has(node.id))
            .map((node) => [node.id, node.measured]),
        ),
      }));
    }
    const moved = changes.filter((c) => c.type === "position" && c.position);
    if (moved.length)
      setPositions((prev) => ({
        ...prev,
        ...Object.fromEntries(
          moved.map((c) => (c.type === "position" ? [c.id, c.position] : [])),
        ),
      }));
  }
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
        minZoom={0.2}
        maxZoom={1.8}
        zoomOnDoubleClick={false}
        snapToGrid
        snapGrid={[10, 10]}
        onNodesChange={nodeChanges}
        onNodeDragStop={(_, node) => {
          onChange(
            {
              ...project,
              units: project.units.map((n) =>
                n.id === node.id ? { ...n, position: node.position } : n,
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
        onConnect={(c) => {
          const edge: Connection = {
            id: crypto.randomUUID(),
            source: c.source,
            target: c.target,
            sourcePort: c.sourceHandle as Connection["sourcePort"],
            targetPort: c.targetHandle as Connection["targetPort"],
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
        <Controls showInteractive={false} />
      </ReactFlow>
      <div className="canvas-footnote">
        <span className="desktop-canvas-hint">
          {hover ||
            "Drag equipment · connect material ports · double-click to edit"}
        </span>
        <span className="mobile-canvas-hint">
          Drag canvas to pan · use + / − to zoom
        </span>
      </div>
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
