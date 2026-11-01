"use client";
import { useUnitSystem } from "./useUnitSystem";
import {
  memo,
  useCallback,
  useMemo,
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Hand, Maximize, Minus, Plus } from "lucide-react";
import { shortcutsBlocked } from "@/lib/keyboard";
import { keyboardPan } from "./canvas-navigation";
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
  useUpdateNodeInternals,
  useStore,
  useStoreApi,
  SelectionMode,
  type NodeProps,
  type Node,
  type EdgeProps,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type FitViewOptions,
  type Viewport,
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
import { EquipmentStatusIndicator } from "./EquipmentStatusIndicator";
import type {
  EquipmentStatus,
  EquipmentTarget,
} from "@/domain/equipment-status";
import {
  CANVAS_MIN_ZOOM,
  CANVAS_MAX_ZOOM,
  ZOOM_STEP,
  useCanvasWheelNavigation,
} from "./useCanvasWheelNavigation";
import { equipmentPort, equipmentSize, streamPath } from "./flow-geometry";
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
const coarsePointer = () => window.matchMedia("(pointer: coarse)").matches;
const subscribePointer = (onChange: () => void) => {
  const query = window.matchMedia("(pointer: coarse)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
type EquipmentNode = Node<
  {
    unit: Unit;
    connected: string[];
    change?: string;
    status?: EquipmentStatus;
    onNavigate?: (id: string, target: EquipmentTarget) => void;
  },
  "equipment"
>;
// Keep equipment labels and the outer stream lanes clear of the floating toolbar.
const flowFitOptions = {
  padding: { top: "110px", right: "60px", bottom: "70px", left: "60px" },
  minZoom: 0.05,
  maxZoom: 1.25,
} satisfies FitViewOptions;
function portGeometry(unit: Unit, output: boolean, index: number) {
  const { x, y, position } = equipmentPort(
    unit.kind,
    output,
    index,
    unit.params.trayCount,
  );
  return {
    position,
    style: {
      left: x,
      top: y,
      right: "auto",
      bottom: "auto",
      transform: "translate(-50%, -50%)",
    },
  };
}
const UnitNode = memo(function UnitNode({
  data,
  selected,
  positionAbsoluteX,
  positionAbsoluteY,
}: NodeProps<EquipmentNode>) {
  const n = data.unit,
    p = ports(n.kind);
  const size = equipmentSize(n.kind, n.params.trayCount);
  const updateNodeInternals = useUpdateNodeInternals();
  const nodeRef = useRef<HTMLDivElement>(null);
  const [labelBottom, setLabelBottom] = useState(-6);
  const [frame, setFrame] = useState({
    left: 0,
    top: 0,
    width: 128,
    height: 128,
  });
  useLayoutEffect(() => {
    const symbol = nodeRef.current?.querySelector("svg");
    const bounds = symbol?.getBBox();
    if (!bounds?.width || !bounds.height) return;
    const padding = 3 + Math.min(bounds.width, bounds.height) * 0.1;
    setFrame({
      left: bounds.x - padding,
      top: bounds.y - padding,
      width: bounds.width + padding * 2,
      height: bounds.height + padding * 2,
    });
    // Follow the visible drawing instead of the empty SVG margin. The reactor
    // label sits beside its top inlet, so it can align with the vessel body.
    const labelBounds =
      n.kind === "PBR"
        ? symbol?.querySelector<SVGGraphicsElement>(".pfd-body")?.getBBox()
        : bounds;
    setLabelBottom((labelBounds?.y ?? bounds.y) - 6);
    updateNodeInternals(n.id);
  }, [n.id, n.kind, n.params.trayCount, updateNodeInternals]);
  return (
    <div
      ref={nodeRef}
      className={`equipment-node ${n.kind === "PBR" ? "bottom-outlet" : ""} ${selected ? "selected" : ""} ${data.change ?? ""}`}
      style={size}
    >
      <div
        className="equipment-selection-frame"
        style={frame}
        aria-hidden="true"
      />
      <div className="unit-label" style={{ bottom: size.height - labelBottom }}>
        <span className="unit-tag-row">
          <span className="unit-tag" title={n.id}>
            {n.id}
          </span>
          {data.status && data.onNavigate && (
            <EquipmentStatusIndicator
              unit={n}
              status={data.status}
              nodeRef={nodeRef}
              x={positionAbsoluteX}
              anchorTop={positionAbsoluteY + labelBottom - 46}
              anchorBottom={positionAbsoluteY + frame.top + frame.height}
              onNavigate={data.onNavigate}
            />
          )}
        </span>
        <span className="unit-name" title={n.name}>
          {n.name}
        </span>
      </div>
      {p.inputs.map((id, i) => (
        <Handle
          key={id}
          id={id}
          type="target"
          aria-label={`${n.id} inlet ${id}`}
          title={`${n.id} · ${id === "in2" ? "Secondary inlet" : "Inlet"}`}
          isConnectable={n.kind === "Mixer" || !data.connected.includes(id)}
          isConnectableStart={false}
          {...portGeometry(n, false, i)}
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
      <EquipmentIcon kind={n.kind} size={128} trayCount={n.params.trayCount} />
      {p.outputs.map((id, i) => (
        <Handle
          key={id}
          id={id}
          type="source"
          aria-label={`${n.id} outlet ${id}`}
          title={`${n.id} · ${id === "out2" ? "Secondary outlet" : "Outlet"}`}
          isConnectable={!data.connected.includes(id)}
          isConnectableEnd={false}
          {...portGeometry(n, true, i)}
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
  fitRequest?: number;
  selected: string | null;
  selection: string[];
  onSelection: Dispatch<SetStateAction<string[]>>;
  onInspect: (id: string) => void;
  statuses?: Record<string, EquipmentStatus>;
  onNavigateIssue?: (id: string, target: EquipmentTarget) => void;
  onChange: (project: Project, label: string) => void;
  onAdd: (kind: Kind, position?: { x: number; y: number }) => void;
  onError: (message: string) => void;
  result: Result | null;
  compositionColors: boolean;
  compare?: Project;
  /** A fixed, read-only view of the same canvas for embedded walkthroughs. */
  presentation?: { viewport: Viewport; colorMode?: "light" | "dark" };
}
function Inner(props: Props) {
  const display = useUnitSystem();
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
    fitRequest = 0,
    presentation,
    statuses,
    onNavigateIssue,
  } = props;
  const rf = useReactFlow();
  const flowStore = useStoreApi();
  const zoom = useStore((state) => state.transform[2]);
  const nodesInitialized = useNodesInitialized();
  const containerRef = useRef<HTMLDivElement>(null);
  const [panMode, setPanMode] = useState(false);
  const [spacePan, setSpacePan] = useState(false);
  const touch = useSyncExternalStore(
    subscribePointer,
    coarsePointer,
    () => false,
  );
  const panning = panMode || spacePan;
  const marqueeActive = useRef(false);
  useCanvasWheelNavigation(containerRef, !presentation);
  const [showGrid, setShowGrid] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  useEffect(() => {
    if (presentation) return;
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
          ".plant-viewport, .plant-view, aside, .assistant-panel, .workspace-utilities",
        )
      )
        return;
      const key = event.key.toLowerCase();
      if (key === " ") {
        if (event.target instanceof Element && event.target.closest("button"))
          return;
        event.preventDefault();
        setSpacePan(true);
        return;
      }
      const viewport = rf.getViewport();
      let handled = true;
      if (key.startsWith("arrow")) {
        const delta = keyboardPan(key, event.shiftKey);
        if (delta)
          void rf.setViewport({
            ...viewport,
            x: viewport.x - delta[0],
            y: viewport.y - delta[1],
          });
        else handled = false;
      } else if (["+", "=", "-"].includes(key))
        void rf.zoomTo(
          Math.max(
            CANVAS_MIN_ZOOM,
            Math.min(
              CANVAS_MAX_ZOOM,
              viewport.zoom * (key === "-" ? 1 / ZOOM_STEP : ZOOM_STEP),
            ),
          ),
        );
      else if (key === "f") {
        const chosen = project.units.filter((unit) =>
          selection.includes(unit.id),
        );
        void rf.fitView({
          ...flowFitOptions,
          ...(event.shiftKey && chosen.length ? { nodes: chosen } : {}),
        });
      } else if (key === "p") setPanMode(true);
      else if (key === "v") setPanMode(false);
      else if (key === "g") setShowGrid((value) => !value);
      else if (key === "l") setShowLabels((value) => !value);
      else handled = false;
      if (handled) event.preventDefault();
    }
    const releaseSpace = (event: KeyboardEvent) => {
      if (event.code === "Space") setSpacePan(false);
    };
    const resetSpace = () => setSpacePan(false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", releaseSpace);
    window.addEventListener("blur", resetSpace);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", releaseSpace);
      window.removeEventListener("blur", resetSpace);
    };
  }, [rf, project.units, selection, presentation]);
  useEffect(() => {
    if (presentation) return;
    return flowStore.subscribe((current, previous) => {
      const rect = current.userSelectionRect;
      if (
        !marqueeActive.current ||
        !current.userSelectionActive ||
        !rect ||
        rect === previous.userSelectionRect
      )
        return;
      const canvas = current.domNode?.getBoundingClientRect();
      if (!canvas || !containerRef.current) return;
      const left = canvas.left + rect.x;
      const top = canvas.top + rect.y;
      const enclosed = new Set<string>();
      for (const node of containerRef.current.querySelectorAll<HTMLElement>(
        ".react-flow__node",
      )) {
        const frame = node
          .querySelector(".equipment-selection-frame")
          ?.getBoundingClientRect();
        if (
          node.dataset.id &&
          frame &&
          frame.left >= left &&
          frame.top >= top &&
          frame.right <= left + rect.width &&
          frame.bottom <= top + rect.height
        )
          enclosed.add(node.dataset.id);
      }
      // A marquee encloses visible equipment frames, not labels or connected pipes.
      onSelection((previous) => {
        const remaining = new Set(enclosed);
        return [...previous.filter((id) => remaining.delete(id)), ...remaining];
      });
    });
  }, [flowStore, onSelection, presentation]);
  const initiallyFramed = useRef(false);
  useEffect(() => {
    if (presentation || !nodesInitialized || initiallyFramed.current) return;
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
  }, [nodesInitialized, rf, presentation]);
  const fittedRequest = useRef(0);
  useEffect(() => {
    if (
      presentation ||
      !fitRequest ||
      !nodesInitialized ||
      fittedRequest.current === fitRequest
    )
      return;
    const frame = requestAnimationFrame(() => {
      fittedRequest.current = fitRequest;
      void rf.fitView({
        ...flowFitOptions,
        duration: 250,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [fitRequest, nodesInitialized, rf, presentation]);
  useEffect(() => {
    if (presentation) return;
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
  }, [rf, presentation]);
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
      style: { pointerEvents: "none" },
      position: unit.position,
      data: {
        unit,
        connected: connected.get(unit.id) ?? [],
        status: presentation ? undefined : statuses?.[unit.id],
        onNavigate: presentation ? undefined : onNavigateIssue,
        change: changes?.added.some((n) => n.id === unit.id)
          ? "added"
          : changes?.changed.some((n) => n.id === unit.id)
            ? "modified"
            : undefined,
      },
    }));
  }, [
    project.units,
    project.edges,
    changes,
    statuses,
    onNavigateIssue,
    presentation,
  ]);
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
        unit.params.trayCount,
      );
      // Edges attach to the outer edge of the nine-pixel connection handle.
      return {
        nodeId: id,
        side: geometry.position,
        x:
          position.x +
          geometry.x +
          (geometry.position === Position.Right
            ? 4.5
            : geometry.position === Position.Left
              ? -4.5
              : 0),
        y:
          position.y +
          geometry.y +
          (geometry.position === Position.Bottom
            ? 4.5
            : geometry.position === Position.Top
              ? -4.5
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
        const verticalPorts = unit.kind === "PBR";
        return {
          id: unit.id,
          x: position.x - (verticalPorts ? 0 : 8),
          y: position.y - 58,
          width: verticalPorts ? 192 : 144,
          height: equipmentSize(unit.kind, unit.params.trayCount).height + 58,
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
      if (marqueeActive.current) return;
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
      className={`flow-wrapper ${panning ? "pan-mode" : ""} ${showLabels ? "" : "hide-flow-labels"}`}
      tabIndex={0}
      aria-label="2D process canvas"
      data-canvas-mode={presentation ? "presentation" : "editor"}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(e) => {
        e.preventDefault();
        if (presentation) return;
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
        fitView={!presentation}
        fitViewOptions={flowFitOptions}
        minZoom={CANVAS_MIN_ZOOM}
        maxZoom={CANVAS_MAX_ZOOM}
        panOnScroll={false}
        panOnDrag={presentation ? false : panning || touch ? true : [1, 2]}
        selectionOnDrag={!presentation && !panning && !touch}
        selectionKeyCode={presentation || panning ? null : "Shift"}
        selectionMode={SelectionMode.Partial}
        onSelectionStart={() => {
          marqueeActive.current = true;
          onSelection([]);
        }}
        onSelectionEnd={() => {
          marqueeActive.current = false;
        }}
        nodesDraggable={!presentation && !panning}
        multiSelectionKeyCode={["Shift", "Control", "Meta"]}
        disableKeyboardA11y
        panActivationKeyCode={null}
        zoomOnScroll={false}
        zoomOnPinch={!presentation}
        zoomActivationKeyCode={null}
        viewport={presentation?.viewport}
        nodesConnectable={!presentation && !panning}
        nodesFocusable={!presentation}
        edgesFocusable={!presentation}
        elementsSelectable={!presentation && !panning}
        preventScrolling={!presentation}
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
        onNodeClick={(event, node) => {
          if (presentation || panning) return;
          if (!event.ctrlKey && !event.metaKey && !event.shiftKey)
            onSelection([node.id]);
          containerRef.current?.focus();
        }}
        onPaneClick={() => {
          if (presentation || panning) return;
          onSelection([]);
          containerRef.current?.focus();
        }}
        onNodeDoubleClick={(_, node) =>
          !presentation && !panning && onInspect(node.id)
        }
        onEdgeClick={() =>
          !presentation && !panning && containerRef.current?.focus()
        }
        onEdgeDoubleClick={(_, edge) =>
          !presentation && !panning && onInspect(edge.id)
        }
        onEdgeMouseEnter={(_, edge) => {
          const s = result?.streams[edge.id];
          const name =
            project.edges.find((stream) => stream.id === edge.id)?.name ??
            edge.id;
          setHover(
            s
              ? `${name} · ${display.format(flow(s), "molarFlow")} · ${display.format(s.temperature, "temperature", 1)} · xA ${(s.a / Math.max(flow(s), 1e-12)).toFixed(3)}`
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
          if (presentation) return;
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
          if (presentation) return false;
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
        {showGrid ? <Background color="var(--grid)" gap={24} size={1} /> : null}
        {!presentation && (
          <Controls
            showInteractive={false}
            showZoom={false}
            showFitView={false}
          >
            <ControlButton
              title="Zoom in (+)"
              aria-label="Zoom In"
              disabled={zoom >= CANVAS_MAX_ZOOM}
              onClick={() => void rf.zoomTo(rf.getZoom() * ZOOM_STEP)}
            >
              <Plus size={16} aria-hidden="true" />
            </ControlButton>
            <ControlButton
              title="Zoom out (−)"
              aria-label="Zoom Out"
              disabled={zoom <= CANVAS_MIN_ZOOM}
              onClick={() => void rf.zoomTo(rf.getZoom() / ZOOM_STEP)}
            >
              <Minus size={16} aria-hidden="true" />
            </ControlButton>
            <ControlButton
              title="Fit View"
              aria-label="Fit View"
              onClick={() =>
                void rf.fitView({ ...flowFitOptions, duration: duration() })
              }
            >
              <Maximize size={16} aria-hidden="true" />
            </ControlButton>
            {!touch && (
              <ControlButton
                className="react-flow__controls-pan"
                title="Pan canvas (P) · Select (V)"
                aria-label="Pan canvas"
                aria-pressed={panning}
                onClick={() => setPanMode((value) => !value)}
              >
                <Hand size={16} aria-hidden="true" />
              </ControlButton>
            )}
          </Controls>
        )}
      </ReactFlow>
      {!presentation && hover ? (
        <div className="canvas-footnote">{hover}</div>
      ) : null}
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
