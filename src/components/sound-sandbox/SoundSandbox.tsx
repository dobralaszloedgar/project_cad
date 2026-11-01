"use client";

import Link from "next/link";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  addEdge,
  Background,
  BackgroundVariant,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import {
  ArrowLeft,
  ArrowUpRight,
  AudioLines,
  Check,
  ChevronRight,
  CircleDot,
  Maximize,
  MousePointer2,
  Play,
  Plus,
  RotateCcw,
  Square,
  Trash2,
  Unplug,
  Volume2,
  VolumeX,
  Waypoints,
} from "lucide-react";
import type { Kind } from "@/domain/schema";
import {
  EquipmentIcon,
  EquipmentPanelIcon,
  equipmentLabels,
} from "@/components/EquipmentIcon";
import {
  soundCues,
  soundStyles,
  type SoundCue,
  type SoundStyle,
} from "@/lib/audio/sound-design";
import { SoundPlayer } from "@/lib/audio/sound-player";
import styles from "./SoundSandbox.module.css";

type EquipmentNode = Node<{ kind: Kind; tag: string }, "equipment">;
const palette: Kind[] = ["Feed", "Mixer", "Heater", "PBR", "Product"];
const dragMime = "application/x-project-cad-sound-equipment";
const fitOptions = { padding: 0.28, maxZoom: 1.15 };
const edgeOptions = {
  type: "smoothstep",
  style: { stroke: "#2d7b67", strokeWidth: 2 },
  markerEnd: {
    type: MarkerType.ArrowClosed,
    color: "#2d7b67",
    width: 16,
    height: 16,
  },
};
const cueIcons = {
  place: Plus,
  wire: MousePointer2,
  connect: Waypoints,
  remove: Unplug,
};

function startingNodes(): EquipmentNode[] {
  return [
    {
      id: "feed",
      type: "equipment",
      position: { x: 50, y: 125 },
      data: { kind: "Feed", tag: "F-101" },
      ariaLabel: "Feed F-101",
    },
    {
      id: "heater",
      type: "equipment",
      position: { x: 310, y: 125 },
      data: { kind: "Heater", tag: "H-101" },
      ariaLabel: "Heater H-101",
    },
    {
      id: "product",
      type: "equipment",
      position: { x: 570, y: 125 },
      data: { kind: "Product", tag: "P-101" },
      ariaLabel: "Product P-101",
    },
  ];
}

const Equipment = memo(function Equipment({
  data,
  selected,
}: NodeProps<EquipmentNode>) {
  return (
    <div className={styles.node} data-selected={selected}>
      <span className={styles.nodeTag}>{data.tag}</span>
      <div className={styles.nodeSymbol}>
        <EquipmentIcon kind={data.kind} size={88} />
        {data.kind !== "Feed" && (
          <Handle
            className={styles.port}
            type="target"
            position={data.kind === "PBR" ? Position.Top : Position.Left}
            style={
              data.kind === "PBR"
                ? { top: 6 }
                : { left: 6, top: data.kind === "Mixer" ? 27.5 : "50%" }
            }
            id="in"
            aria-label={`${data.tag} inlet`}
          />
        )}
        {data.kind !== "Product" && (
          <Handle
            className={styles.port}
            type="source"
            position={data.kind === "PBR" ? Position.Bottom : Position.Right}
            style={data.kind === "PBR" ? { bottom: 6 } : { right: 6 }}
            id="out"
            aria-label={`${data.tag} outlet`}
          />
        )}
      </div>
      <span className={styles.nodeName}>
        {data.kind === "PBR" ? "Reactor" : equipmentLabels[data.kind]}
      </span>
    </div>
  );
});
const nodeTypes = { equipment: Equipment };

function SoundWave({ style }: { style: SoundStyle }) {
  const heights = {
    soft: [3, 5, 8, 16, 28, 35, 28, 21, 15, 11, 8, 6, 4, 3, 2],
    digital: [2, 3, 31, 8, 19, 5, 35, 7, 23, 5, 14, 4, 8, 3, 2],
    wood: [3, 24, 34, 17, 8, 4, 20, 29, 14, 6, 3, 9, 5, 3, 2],
  }[style];
  return (
    <svg
      className={styles.wave}
      viewBox="0 0 92 40"
      fill="none"
      aria-hidden="true"
    >
      {heights.map((height, i) => (
        <path
          key={i}
          d={`M${4 + i * 6} ${20 - height / 2}v${height}`}
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

function Playground() {
  const [style, setStyle] = useState<SoundStyle>("soft");
  const [enabled, setEnabled] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [volume, setVolume] = useState(35);
  const [audioError, setAudioError] = useState("");
  const [activeCue, setActiveCue] = useState<SoundCue | null>(null);
  const [playingSequence, setPlayingSequence] = useState(false);
  const [lastAction, setLastAction] = useState(
    "A small process, ready to make your own.",
  );
  const [nodes, setNodes, onNodesChange] =
    useNodesState<EquipmentNode>(startingNodes());
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const player = useRef<SoundPlayer | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRequest = useRef(0);
  const nextId = useRef(102);
  const dragOrigin = useRef<{ x: number; y: number } | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const flow = useReactFlow<EquipmentNode, Edge>();

  useEffect(
    () => () => {
      audioRequest.current++;
      timers.current.forEach(clearTimeout);
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
      player.current?.dispose();
      player.current = null;
    },
    [],
  );

  const stopSequence = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    player.current?.stop();
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    setPlayingSequence(false);
    setActiveCue(null);
  }, []);

  const trigger = useCallback(
    (cue: SoundCue, action: string) => {
      setLastAction(action);
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
      setActiveCue(cue);
      highlightTimer.current = setTimeout(() => setActiveCue(null), 400);
      player.current?.play(style, cue);
    },
    [style],
  );

  async function toggleSound() {
    stopSequence();
    if (enabled) {
      audioRequest.current++;
      player.current?.mute();
      setEnabled(false);
      return;
    }
    const request = ++audioRequest.current;
    setEnabling(true);
    setAudioError("");
    try {
      player.current ??= new SoundPlayer();
      const ready = await player.current.enable(volume / 100);
      if (request !== audioRequest.current) return;
      if (!ready) throw new Error("Audio is paused");
      setEnabled(true);
      trigger("place", "Sound is on. Try placing a component.");
    } catch {
      if (request === audioRequest.current) {
        setAudioError(
          "Audio couldn’t start. Try enabling sound again in a browser that supports Web Audio.",
        );
      }
    } finally {
      if (request === audioRequest.current) setEnabling(false);
    }
  }

  function previewSequence() {
    if (playingSequence) {
      stopSequence();
      return;
    }
    stopSequence();
    setPlayingSequence(true);
    soundCues.forEach((cue, index) => {
      const play = () => trigger(cue.id, `Preview · ${cue.name}`);
      if (index === 0) play();
      else timers.current.push(setTimeout(play, index * 600));
    });
    timers.current.push(setTimeout(() => setPlayingSequence(false), 2250));
  }

  const validConnection = useCallback(
    (connection: Connection | Edge) => {
      const source = nodes.find((node) => node.id === connection.source);
      const target = nodes.find((node) => node.id === connection.target);
      return Boolean(
        source &&
        target &&
        source.id !== target.id &&
        source.data.kind !== "Product" &&
        target.data.kind !== "Feed" &&
        !edges.some((edge) => edge.target === target.id),
      );
    },
    [nodes, edges],
  );

  const connect = useCallback(
    (connection: Connection) => {
      if (!validConnection(connection)) return;
      setEdges((current) =>
        addEdge({ ...connection, ...edgeOptions }, current),
      );
      const source = nodes.find((node) => node.id === connection.source);
      const target = nodes.find((node) => node.id === connection.target);
      trigger(
        "connect",
        `${source?.data.tag} connected to ${target?.data.tag}.`,
      );
    },
    [nodes, setEdges, trigger, validConnection],
  );

  const nextConnection = nodes
    .flatMap((source, index) =>
      nodes.slice(index + 1).map((target) => ({
        source: source.id,
        target: target.id,
        sourceHandle: "out",
        targetHandle: "in",
      })),
    )
    .find(validConnection);
  const hasSelection =
    nodes.some((node) => node.selected) || edges.some((edge) => edge.selected);

  function addComponent(kind: Kind, point?: { x: number; y: number }) {
    const rect = canvas.current?.getBoundingClientRect();
    if (!rect) return;
    const number = nextId.current++;
    const position = flow.screenToFlowPosition(
      point ?? {
        x: rect.left + rect.width / 2 + ((number % 3) - 1) * 40,
        y: rect.top + rect.height * 0.75,
      },
    );
    const tag = `${kind === "PBR" ? "R" : kind[0]}-${number}`;
    setNodes((current) => [
      ...current.map((node) => ({ ...node, selected: false })),
      {
        id: `equipment-${number}`,
        type: "equipment",
        data: { kind, tag },
        position: { x: position.x - 62, y: position.y - 66 },
        selected: true,
        ariaLabel: `${equipmentLabels[kind]} ${tag}`,
      },
    ]);
    trigger("place", `${equipmentLabels[kind]} ${tag} placed.`);
  }

  function resetCanvas() {
    stopSequence();
    setNodes(startingNodes());
    setEdges([]);
    setLastAction("Fresh canvas. Try another sound style.");
    void flow.fitView({ ...fitOptions, nodes: startingNodes() });
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          <EquipmentPanelIcon size={23} />
          Project CAD
        </Link>
        <ChevronRight size={15} className={styles.breadcrumbArrow} />
        <span className={styles.breadcrumb}>Sound sandbox</span>
        <span className={styles.previewBadge}>Preview</span>
        <Link
          href="/"
          className={styles.backLink}
          aria-label="Back to workspace"
        >
          <ArrowLeft size={15} />
          <span>Back to workspace</span>
        </Link>
      </header>

      <main className={styles.main}>
        <section className={styles.intro}>
          <div>
            <div className={styles.eyebrow}>
              <AudioLines size={16} />A little feedback, a better flow
            </div>
            <h1>Sound for building.</h1>
            <p>
              Try three subtle sound styles as you place components and wire
              them together.
            </p>
          </div>
          <div className={styles.audioControls}>
            <button
              type="button"
              className={styles.enableButton}
              data-enabled={enabled}
              aria-pressed={enabled}
              onClick={toggleSound}
              disabled={enabling}
            >
              {enabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
              {enabling
                ? "Starting audio…"
                : enabled
                  ? "Sound on"
                  : "Enable sound"}
              {enabled && <span className={styles.onDot} />}
            </button>
            <div className={styles.volumeControl}>
              <label htmlFor="sound-volume">Volume</label>
              <input
                id="sound-volume"
                type="range"
                min="0"
                max="100"
                step="1"
                value={volume}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setVolume(value);
                  player.current?.setVolume(value / 100);
                }}
              />
              <output htmlFor="sound-volume">{volume}%</output>
            </div>
            <span className={styles.audioHint}>
              {enabled
                ? "Click Sound on to mute anytime"
                : "Starts muted. Enable when you’re ready."}
            </span>
          </div>
        </section>
        {audioError && (
          <p className={styles.error} role="alert">
            {audioError}
          </p>
        )}

        <section
          className={styles.stylesSection}
          aria-label="Choose a sound style"
        >
          <div className={styles.sectionLabel}>
            <span>01</span>Choose a sound
          </div>
          <div className={styles.styleGrid}>
            {soundStyles.map((option, index) => (
              <button
                key={option.id}
                type="button"
                className={styles.styleCard}
                aria-pressed={style === option.id}
                onClick={() => {
                  stopSequence();
                  setStyle(option.id);
                }}
              >
                <div className={styles.styleTop}>
                  <span className={styles.styleNumber}>0{index + 1}</span>
                  <span className={styles.styleCharacter}>
                    {option.character}
                  </span>
                  <span className={styles.radio}>
                    {style === option.id && (
                      <Check size={12} strokeWidth={2.5} />
                    )}
                  </span>
                </div>
                <div className={styles.styleTitle}>
                  <h2>{option.name}</h2>
                  <SoundWave style={option.id} />
                </div>
                <p>{option.description}</p>
                {option.id === "soft" && (
                  <span className={styles.recommended}>
                    Suggested starting point
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>

        <div className={styles.sectionLabel}>
          <span>02</span>Give it a try
          <span className={styles.sectionNote}>
            Click a component to add it, or drag it onto the canvas.
          </span>
        </div>
        <div className={styles.workbench}>
          <section className={styles.canvasPanel} aria-label="Practice canvas">
            <div className={styles.palette}>
              <div className={styles.paletteItems}>
                {palette.map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    className={styles.paletteItem}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData(dragMime, kind);
                      event.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() => addComponent(kind)}
                    aria-label={`Add ${equipmentLabels[kind]}`}
                  >
                    <EquipmentIcon kind={kind} size={24} />
                    <span>
                      {kind === "PBR" ? "Reactor" : equipmentLabels[kind]}
                    </span>
                    <Plus size={12} className={styles.palettePlus} />
                  </button>
                ))}
              </div>
              <button
                type="button"
                className={styles.iconButton}
                onClick={resetCanvas}
                aria-label="Reset canvas"
                title="Reset canvas"
              >
                <RotateCcw size={16} />
              </button>
            </div>
            <div
              ref={canvas}
              className={styles.canvas}
              data-testid="sound-canvas"
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
              }}
              onDrop={(event) => {
                event.preventDefault();
                const kind = event.dataTransfer.getData(dragMime) as Kind;
                if (palette.includes(kind))
                  addComponent(kind, { x: event.clientX, y: event.clientY });
              }}
            >
              <ReactFlow<EquipmentNode, Edge>
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnectStart={() =>
                  trigger(
                    "wire",
                    "Wire picked up. Drag to another component’s inlet.",
                  )
                }
                onConnect={connect}
                isValidConnection={validConnection}
                onNodeDragStart={(_, node) => {
                  dragOrigin.current = { ...node.position };
                }}
                onNodeDragStop={(_, node) => {
                  const origin = dragOrigin.current;
                  dragOrigin.current = null;
                  if (
                    origin &&
                    Math.hypot(
                      node.position.x - origin.x,
                      node.position.y - origin.y,
                    ) > 2
                  )
                    trigger("place", `${node.data.tag} placed.`);
                }}
                onDelete={({ nodes: removedNodes, edges: removedEdges }) => {
                  if (removedNodes.length || removedEdges.length)
                    trigger("remove", "Selection removed.");
                }}
                defaultEdgeOptions={edgeOptions}
                fitView
                fitViewOptions={fitOptions}
                minZoom={0.3}
                maxZoom={1.5}
                deleteKeyCode={["Backspace", "Delete"]}
              >
                <Background
                  variant={BackgroundVariant.Dots}
                  gap={22}
                  size={1.2}
                  color="#d1dcd6"
                />
              </ReactFlow>
              <div className={styles.canvasHint}>
                <CircleDot size={14} />
                Drag from a green outlet to an inlet to wire.
              </div>
              <div className={styles.canvasTools}>
                <button
                  type="button"
                  onClick={() => {
                    if (nextConnection) connect(nextConnection);
                  }}
                  disabled={!nextConnection}
                >
                  <Waypoints size={15} />
                  Connect next pair
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void flow.deleteElements({
                      nodes: nodes.filter((node) => node.selected),
                      edges: edges.filter((edge) => edge.selected),
                    })
                  }
                  disabled={!hasSelection}
                  aria-label="Remove selected item"
                  title="Remove selection (Delete)"
                >
                  <Trash2 size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => void flow.fitView(fitOptions)}
                  aria-label="Fit canvas"
                  title="Fit canvas"
                >
                  <Maximize size={15} />
                </button>
              </div>
            </div>
            <div className={styles.canvasFooter}>
              <span className={styles.actionStatus} role="status">
                <span
                  className={styles.activityDot}
                  data-active={activeCue !== null}
                />
                {lastAction}
              </span>
              <span className={styles.counts}>
                {nodes.length} components<span>·</span>
                {edges.length}{" "}
                {edges.length === 1 ? "connection" : "connections"}
              </span>
            </div>
          </section>

          <aside
            className={styles.cuePanel}
            aria-label="Preview individual sounds"
          >
            <div className={styles.cueHeading}>
              <h2>Every little moment.</h2>
              <span>Short sounds. Just enough feedback.</span>
            </div>
            <div className={styles.cueList}>
              {soundCues.map((cue) => {
                const Icon = cueIcons[cue.id];
                return (
                  <button
                    type="button"
                    key={cue.id}
                    className={styles.cueButton}
                    data-active={activeCue === cue.id}
                    disabled={!enabled}
                    onClick={() => {
                      stopSequence();
                      trigger(cue.id, `Preview · ${cue.name}`);
                    }}
                    aria-label={`Preview ${cue.name.toLowerCase()}`}
                  >
                    <span className={styles.cueIcon}>
                      <Icon size={17} />
                    </span>
                    <span className={styles.cueCopy}>
                      <strong>{cue.name}</strong>
                      <span>{cue.description}</span>
                    </span>
                    <Play size={13} className={styles.cuePlay} />
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className={styles.sequenceButton}
              disabled={!enabled}
              onClick={previewSequence}
            >
              {playingSequence ? <Square size={14} /> : <Play size={14} />}
              {playingSequence ? "Stop sequence" : "Hear the sequence"}
            </button>
            <p className={styles.cueNote}>
              {enabled
                ? "Switch styles and replay to compare."
                : "Enable sound above to start listening."}
            </p>
          </aside>
        </div>

        <footer className={styles.footer}>
          <span>
            <AudioLines size={14} />
            Sounds are previewed only in this sandbox.
          </span>
          <Link href="/">
            Made for your flow
            <ArrowUpRight size={14} />
          </Link>
        </footer>
      </main>
    </div>
  );
}

export default function SoundSandbox() {
  return (
    <ReactFlowProvider>
      <Playground />
    </ReactFlowProvider>
  );
}
