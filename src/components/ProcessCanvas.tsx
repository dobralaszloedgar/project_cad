"use client";
import {
  memo,
  useCallback,
  useMemo,
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Hand, Maximize, Minus, Plus } from "lucide-react";
import { shortcutsBlocked } from "@/lib/keyboard";
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
  useStore,
  type NodeProps,
  type Node,
  type EdgeProps,
  type Edge,
  type NodeChange,
  type EdgeChange,
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
import { availableStreamName } from "@/domain/stream-names";
import { projectStreamColors, streamColor } from "./stream-colors";
import { inlineStreamLabelPosition } from "./stream-label-placement";
import {
  routeStreams,
  type StreamRoute,
  type RouteEndpoint,
} from "./stream-routing";
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
type Pipe = Edge<{
  compositionColors: boolean;
  name: string;
  color: string;
  route?: StreamRoute;
}>;
const STREAM_LABEL_DETAIL_ZOOM = 0.65;
const STREAM_LABEL_FONT_SIZE = 11 + 96 / 72;
const PipeEdge = memo(function PipeEdge(props: EdgeProps<Pipe>) {
  const colored = props.data?.compositionColors === true;
  const path = props.data?.route?.path ?? streamPath(props);
  const zoom = useStore((state) => state.transform[2]);
  const name = props.data?.name;
  const textRef = useRef<SVGTextElement>(null);
  const [textBounds, setTextBounds] = useState({
    name,
    width: 0,
    height: 14,
    offsetY: 0,
  });
  useLayoutEffect(() => {
    const measure = () => {
      const text = textRef.current;
      const bounds = text?.getBBox();
      if (text && bounds?.width) {
        const scale = STREAM_LABEL_FONT_SIZE / parseFloat(text.style.fontSize);
        setTextBounds({
          name,
          width: bounds.width * scale,
          height: bounds.height * scale,
          offsetY:
            (bounds.y + bounds.height / 2 - Number(text.getAttribute("y"))) *
            scale,
        });
      }
    };
    measure();
    let active = true;
    void document.fonts.ready.then(() => {
      if (active) measure();
    });
    return () => {
      active = false;
    };
  }, [name]);
  const measured = textBounds.name === name && textBounds.width > 0;
  const width = measured ? textBounds.width : (name?.length ?? 0) * 8;
  const height = measured ? textBounds.height : 14;
  const labelWidth =
    (width + 6) / zoom + Number(props.style?.strokeWidth ?? 2.5);
  const labelHeight = (height + 1) / zoom;
  const offsetY = measured ? textBounds.offsetY / zoom : 0;
  const label = useMemo(
    () =>
      inlineStreamLabelPosition(
        path,
        props.data?.route?.label ?? {
          x: (props.sourceX + props.targetX) / 2,
          y: (props.sourceY + props.targetY) / 2,
        },
        (width + 6) / STREAM_LABEL_DETAIL_ZOOM + 3.5,
        (height + 1) / STREAM_LABEL_DETAIL_ZOOM,
        1.75 + 1 / STREAM_LABEL_DETAIL_ZOOM,
      ),
    [
      path,
      props.data?.route?.label,
      props.sourceX,
      props.sourceY,
      props.targetX,
      props.targetY,
      width,
      height,
    ],
  );
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
      {name && (
        <g
          className={`stream-label ${zoom < STREAM_LABEL_DETAIL_ZOOM ? "stream-label-overview" : ""}`}
          aria-hidden="true"
          pointerEvents="none"
        >
          <rect
            className="stream-label-box"
            x={label.x - labelWidth / 2}
            y={label.y - labelHeight / 2}
            width={labelWidth}
            height={labelHeight}
            rx={1 / zoom}
            fill="var(--canvas)"
          />
          <text
            ref={textRef}
            x={label.x}
            y={label.y - offsetY}
            textAnchor="middle"
            dominantBaseline="central"
            style={{
              fontSize: STREAM_LABEL_FONT_SIZE / zoom,
              fontWeight: 500,
              fill: props.data?.color,
            }}
          >
            {name}
          </text>
        </g>
      )}
    </g>
  );
});
const nodeTypes = { equipment: UnitNode };
const edgeTypes = { pipe: PipeEdge };
interface Props {
  project: Project;
  selected: string | null;
  selection: string[];
  onSelection: Dispatch<SetStateAction<string[]>>;
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
    selection,
    onSelection,
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
  const [panMode, setPanMode] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        shortcutsBlocked(event) ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      )
        return;
      if (
        event.target instanceof Element &&
        event.target.closest(
          ".plant-viewport, .plant-view, aside, .assistant-panel",
        )
      )
        return;
      const key = event.key.toLowerCase();
      const viewport = rf.getViewport();
      const step = event.shiftKey ? 256 : 64;
      let handled = true;
      if (key.startsWith("arrow")) {
        const delta = {
          arrowleft: [step, 0],
          arrowright: [-step, 0],
          arrowup: [0, step],
          arrowdown: [0, -step],
        }[key];
        if (delta)
          void rf.setViewport({
            ...viewport,
            x: viewport.x + delta[0],
            y: viewport.y + delta[1],
          });
        else handled = false;
      } else if (["+", "=", "-"].includes(key))
        void rf.zoomTo(
          Math.max(
            0.1,
            Math.min(3, viewport.zoom * (key === "-" ? 1 / 1.2 : 1.2)),
          ),
        );
      else if (key === "f") {
        const chosen = project.units.filter((unit) =>
          selection.includes(unit.id),
        );
        void rf.fitView({
          padding: 0.2,
          ...(event.shiftKey && chosen.length ? { nodes: chosen } : {}),
        });
      } else if (key === "p") setPanMode(true);
      else if (key === "v") setPanMode(false);
      else if (key === "g") setShowGrid((value) => !value);
      else if (key === "l") setShowLabels((value) => !value);
      else handled = false;
      if (handled) event.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [rf, project.units, selection]);
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
        selected: selection.includes(node.id),
      })),
    [baseNodes, positions, measurements, selection],
  );
  const colors = useMemo(
    () => (compositionColors ? projectStreamColors(project, result) : {}),
    [project, result, compositionColors],
  );
  const routes = useMemo(() => {
    const endpoint = (
      id: string,
      output: boolean,
      port: string,
    ): RouteEndpoint | undefined => {
      const unit = project.units.find((unit) => unit.id === id);
      if (!unit) return undefined;
      const position = positions[id] ?? unit.position;
      const geometry = equipmentPort(
        unit.kind,
        output,
        port.endsWith("2") ? 1 : 0,
      );
      // Edges attach to the outer edge of the eight-pixel connection handle.
      return {
        nodeId: id,
        side: geometry.position,
        x:
          position.x +
          geometry.x +
          (geometry.position === Position.Right
            ? 4
            : geometry.position === Position.Left
              ? -4
              : 0),
        y:
          position.y +
          geometry.y +
          (geometry.position === Position.Bottom
            ? 4
            : geometry.position === Position.Top
              ? -4
              : 0),
      };
    };
    return routeStreams(
      project.edges.flatMap((edge) => {
        const source = endpoint(edge.source, true, edge.sourcePort);
        const target = endpoint(edge.target, false, edge.targetPort);
        return source && target ? [{ id: edge.id, source, target }] : [];
      }),
      project.units.map((unit) => {
        const position = positions[unit.id] ?? unit.position;
        return {
          id: unit.id,
          x: position.x,
          y: position.y - 28,
          width: 128,
          height: 186,
        };
      }),
    );
  }, [project.units, project.edges, positions]);
  const edges = useMemo(
    () =>
      project.edges.map((e) => {
        const color =
          e.colorIndex !== undefined
            ? streamColor(e.colorIndex)
            : compositionColors
              ? colors[e.id]
              : "var(--stream-stroke)";
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourcePort,
          targetHandle: e.targetPort,
          type: "pipe",
          data: {
            compositionColors,
            name: e.name ?? e.id,
            color,
            route: routes.get(e.id),
          },
          ariaLabel: e.name ?? e.id,
          style: { stroke: color, strokeWidth: selected === e.id ? 3.5 : 2.5 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color,
            width: 14,
            height: 14,
          },
          selected: selection.includes(e.id),
        };
      }),
    [project.edges, compositionColors, colors, selected, selection, routes],
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
  const updateSelection = useCallback(
    (changes: (NodeChange<EquipmentNode> | EdgeChange)[]) => {
      const selectedChanges = changes.filter(
        (change) => change.type === "select",
      );
      if (!selectedChanges.length) return;
      onSelection((previous) => {
        const next = new Set(previous);
        for (const change of selectedChanges) {
          if (change.selected) next.add(change.id);
          else next.delete(change.id);
        }
        return [...next];
      });
    },
    [onSelection],
  );
  const nodeChanges = useCallback(
    (changes: NodeChange<EquipmentNode>[]) => {
      updateSelection(changes);
      const dimensions = changes.filter(
        (change) => change.type === "dimensions" && change.dimensions,
      );
      if (dimensions.length) {
        setMeasurements((previous) => {
          const next = { ...previous };
          for (const change of dimensions) {
            if (change.type === "dimensions")
              next[change.id] = change.dimensions;
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
    },
    [updateSelection],
  );
  const duration = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 220;
  return (
    <div
      ref={containerRef}
      className={`flow-wrapper ${showLabels ? "" : "hide-flow-labels"}`}
      tabIndex={0}
      aria-label="2D process canvas"
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
        panOnDrag={panMode ? [0, 1, 2] : [1, 2]}
        selectionOnDrag={!panMode}
        nodesDraggable={!panMode}
        multiSelectionKeyCode={["Shift", "Control", "Meta"]}
        disableKeyboardA11y
        panActivationKeyCode="Space"
        zoomOnScroll={false}
        zoomOnPinch
        zoomActivationKeyCode={["Control", "Meta"]}
        zoomOnDoubleClick={false}
        onNodesChange={nodeChanges}
        onEdgesChange={updateSelection}
        onNodeDragStop={(_, node, movedNodes) => {
          const moved = new Map(
            movedNodes.map((item) => [item.id, item.position]),
          );
          moved.set(node.id, node.position);
          onChange(
            {
              ...project,
              units: project.units.map((n) =>
                moved.has(n.id)
                  ? {
                      ...n,
                      position: {
                        x: Math.round(moved.get(n.id)!.x / 10) * 10,
                        y: Math.round(moved.get(n.id)!.y / 10) * 10,
                      },
                    }
                  : n,
              ),
            },
            "Move equipment",
          );
          setPositions({});
        }}
        onNodeClick={() => containerRef.current?.focus()}
        onPaneClick={() => {
          onSelection([]);
          containerRef.current?.focus();
        }}
        onNodeDoubleClick={(_, node) => onInspect(node.id)}
        onEdgeClick={(event, edge) => {
          if (!event.shiftKey && !event.ctrlKey && !event.metaKey)
            onInspect(edge.id);
          else containerRef.current?.focus();
        }}
        onEdgeMouseEnter={(_, edge) => {
          const s = result?.streams[edge.id];
          const name =
            project.edges.find((stream) => stream.id === edge.id)?.name ??
            edge.id;
          setHover(
            s
              ? `${name} · ${flow(s).toFixed(3)} mol/s · ${s.temperature.toFixed(1)} K · xA ${(s.a / Math.max(flow(s), 1e-12)).toFixed(3)}`
              : `${name} · Run to calculate`,
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
            name: availableStreamName(project.edges),
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
        deleteKeyCode={null}
      >
        {showGrid ? <Background color="#bfcac4" gap={24} size={1} /> : null}
        <Controls showInteractive={false} showZoom={false} showFitView={false}>
          <ControlButton
            title="Pan canvas"
            aria-label="Pan canvas"
            aria-pressed={panMode}
            onClick={() => setPanMode(!panMode)}
          >
            <Hand />
          </ControlButton>
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
        Drag to select · Space + drag / scroll to pan · Pinch to zoom
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
