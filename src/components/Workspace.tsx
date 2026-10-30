"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Workflow,
  Upload,
  Download,
  Play,
  Box,
  PanelTop,
  Columns2,
  Moon,
  Sun,
  Info,
  Trash2,
  X,
  Home,
  History,
  ChevronRight,
  ChevronLeft,
  GitBranch,
  Thermometer,
  FlaskConical,
  MoreHorizontal,
  Pencil,
  Maximize,
  MessageCircle,
  Settings2,
  FolderOpen,
  Check,
  ChartNoAxesColumnIncreasing,
  CircleHelp,
  AlignHorizontalJustifyStart,
  Rainbow,
  Palette,
  HardDrive,
} from "lucide-react";
import { useFloatingDrag } from "./useFloatingDrag";
import Dialog from "./Dialog";
import EquipmentLibrary from "./EquipmentLibrary";
import { EquipmentPanelIcon } from "./EquipmentIcon";
import Templates from "./Templates";
import { plantTemplate } from "@/domain/plant-templates";
import ProjectsPage from "./ProjectsPage";
import {
  type Project,
  type Kind,
  newUnit,
  projectSchema,
  validateGraph,
} from "@/domain/schema";
import {
  reactorExample,
  distillationExample,
  heatingExample,
  solutionExample,
  thermalCycleExample,
  mixingExample,
  catalystExample,
} from "@/domain/examples";
import ThermoSettingsPanel from "./ThermoSettings";
import { defaultThermo, modelInfo } from "@/domain/thermo/registry";
import { sampleMixtures } from "@/domain/thermo/catalog";
import { type Result, simulate } from "@/domain/solver";
import { applyActions, type Plan } from "@/domain/actions";
import {
  checkpoint,
  restore,
  type Workspace as WorkspaceState,
  type Revision,
} from "@/lib/revisions";
import {
  saveWorkspace,
  loadWorkspace,
  parseImport,
  clearWorkspace,
  activeProjectId,
  openExampleWorkspace,
  listProjects,
  updateSavedProject,
  type SavedProject,
} from "@/lib/storage";
import ProcessCanvas from "./ProcessCanvas";
import Inspector from "./Inspector";
import Results from "./Results";
import AssistantPanel from "./AssistantPanel";
import KeyboardHelp from "./KeyboardHelp";
import { isCloseKey, shortcutsBlocked } from "@/lib/keyboard";
import {
  copySelection,
  deleteSelection,
  pasteSelection,
  type SelectionCopy,
} from "@/domain/editor";
const Plant3D = dynamic(() => import("./Plant3D"), {
  ssr: false,
  loading: () => <div className="empty-state">Loading 3D workspace…</div>,
});
type WorkspacePanel =
  "Equipment" | "Results" | "Themes" | "Storage settings" | "Settings";
export default function Workspace({
  exampleId,
  initialView = "2D",
  initialPlayback = false,
}: {
  exampleId?: string;
  initialView?: "2D" | "3D" | "Split";
  initialPlayback?: boolean;
}) {
  const [state, setState] = useState<WorkspaceState>(() => ({
    version: 1,
    project: (exampleId && plantTemplate(exampleId)) || reactorExample(),
    revisions: [],
  }));
  const [ready, setReady] = useState(false);
  const [storage, setStorage] = useState("Loading local project");
  const [selection, setSelection] = useState<string[]>([]);
  const selected = selection.at(-1) ?? null;
  function setSelected(id: string | null) {
    setSelection(id ? [id] : []);
  }
  const [helpOpen, setHelpOpen] = useState(false);
  const editHistory = useRef<{ past: Project[]; future: Project[] }>({
    past: [],
    future: [],
  });
  const clipboard = useRef<SelectionCopy | null>(null);
  const pasteOffset = useRef(40);
  const [view, setView] = useState<string>(initialView);
  const [playbackOnOpen, setPlaybackOnOpen] = useState(initialPlayback);
  const [tab, setTab] = useState("Results");
  const [compareId, setCompareId] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [message, setMessage] = useState("");
  const [theme, setTheme] = useState("light");
  const [clearConfirm, setClearConfirm] = useState(false);
  const [drawer, setDrawer] = useState<WorkspacePanel | null>(null);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [compositionColors, setCompositionColors] = useState(true);
  const [projectId, setProjectId] = useState("main");
  const [showProjects, setShowProjects] = useState(false);
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);
  const [projectBusy, setProjectBusy] = useState(false);
  const [projectMessage, setProjectMessage] = useState("");
  const canvasRef = useRef<HTMLElement>(null);
  const bubbleRef = useRef<HTMLButtonElement>(null);
  const assistantRef = useRef<HTMLDivElement>(null);
  const bubbleDrag = useFloatingDrag(
    canvasRef,
    bubbleRef,
    !showProjects && !assistantOpen,
    true,
  );
  const assistantDrag = useFloatingDrag(
    canvasRef,
    assistantRef,
    !showProjects && assistantOpen,
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const saveQueue = useRef(Promise.resolve());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveVersion = useRef(0);
  const project = useMemo(
    () => projectSchema.parse(state.project),
    [state.project],
  );
  const pullTabRef = useRef<HTMLButtonElement>(null);
  const workspaceMenuRef = useRef<HTMLElement>(null);
  function openPanel(panel: WorkspacePanel) {
    setWorkspaceMenuOpen(false);
    if (panel === "Results") setTab("Results");
    setDrawer(panel);
  }
  function closeDrawer() {
    setDrawer(null);
    pullTabRef.current?.focus();
  }
  useEffect(() => {
    if (!drawer && !workspaceMenuOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (
        !isCloseKey(event) ||
        event.defaultPrevented ||
        document.querySelector("dialog[open]")
      )
        return;
      event.preventDefault();
      setWorkspaceMenuOpen(false);
      setDrawer(null);
      pullTabRef.current?.focus();
    }
    function onPointerDown(event: PointerEvent) {
      if (
        workspaceMenuOpen &&
        !workspaceMenuRef.current?.contains(event.target as Node) &&
        !pullTabRef.current?.contains(event.target as Node)
      )
        setWorkspaceMenuOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [drawer, workspaceMenuOpen]);
  useEffect(() => {
    let active = true;
    const example = exampleId ? plantTemplate(exampleId) : undefined;
    const opening =
      example && exampleId
        ? openExampleWorkspace(exampleId, {
            version: 1,
            project: example,
            revisions: [checkpoint(example, "Created from example")],
          }).then(({ workspace, projectId }) => [workspace, projectId] as const)
        : Promise.all([loadWorkspace(), activeProjectId()]);
    opening
      .then(([saved, id]) => {
        if (!active) return;
        setProjectId(id);
        setDrawer(null);
        if (saved) setState(saved);
        else
          setState((s) => ({
            ...s,
            revisions: [checkpoint(s.project, "Initial example")],
          }));
        setStorage("Saved on this device");
        setReady(true);
      })
      .catch(() => {
        if (active) {
          setStorage("Local storage unavailable · export to save");
          setReady(true);
        }
      });
    return () => {
      active = false;
    };
  }, [exampleId]);
  useEffect(() => {
    if (!ready) return;
    const version = ++saveVersion.current;
    const timer = setTimeout(() => {
      saveQueue.current = saveQueue.current
        .catch(() => {})
        .then(() => saveWorkspace(state, projectId))
        .then(() => {
          if (version === saveVersion.current)
            setStorage("Saved on this device");
        })
        .catch(() =>
          setStorage("Could not save locally · export your project"),
        );
    }, 350);
    saveTimer.current = timer;
    return () => clearTimeout(timer);
  }, [state, ready, projectId]);
  function change(
    next: Project,
    label: string,
    run = false,
    recordHistory = true,
  ) {
    try {
      next = projectSchema.parse(next);
      const errors = validateGraph(next);
      if (errors.length) throw new Error(errors[0]);
      if (state.revisions.length >= 245)
        throw new Error(
          "Revision limit reached. Export this project, then clear local history to continue.",
        );
      if (recordHistory) {
        editHistory.current.past.push(project);
        editHistory.current.future = [];
      }
      setState((s) => ({
        ...s,
        project: next,
        revisions: [...s.revisions, checkpoint(next, label)],
      }));
      setStorage("Saving…");
      setResult(null);
      setMessage("");
      if (run) {
        try {
          const r = simulate(next);
          setResult(r);
          setMessage(
            r.converged
              ? "Calculated · open Results for balances and model limits."
              : "Recycle did not converge. Inspect diagnostics.",
          );
        } catch (e) {
          setMessage(e instanceof Error ? e.message : "Simulation failed.");
        }
      }
      return true;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Invalid project.");
      return false;
    }
  }
  function add(kind: Kind, position?: { x: number; y: number }) {
    const id = `${kind}-${crypto.randomUUID().slice(0, 6)}`;
    const unit = newUnit(
      kind,
      id,
      position?.x ?? 200 + (project.units.length % 4) * 180,
      position?.y ?? 350 + Math.floor(project.units.length / 4) * 100,
    );
    change({ ...project, units: [...project.units, unit] }, `Add ${kind}`);
    setSelected(id);
  }
  function run() {
    try {
      const calculated = simulate(project);
      setResult(calculated);
      setMessage(
        calculated.converged
          ? "Calculated · review model limits in Results."
          : "Recycle did not converge. Final iterate only.",
      );
      setTab("Results");
      setWorkspaceMenuOpen(false);
      setDrawer("Results");
    } catch (e) {
      setResult(null);
      setMessage(e instanceof Error ? e.message : "Simulation failed.");
    }
  }
  function loadExample(name: string) {
    const factories: Record<string, () => Project> = {
      solution: solutionExample,
      heating: heatingExample,
      reactor: reactorExample,
      distillation: distillationExample,
      "thermal-cycle": thermalCycleExample,
      mixing: mixingExample,
      catalyst: catalystExample,
    };
    const next = Object.hasOwn(factories, name)
      ? factories[name]()
      : (plantTemplate(name) ?? {
          version: 1 as const,
          name: "Untitled process",
          units: [],
          edges: [],
        });
    if (showProjects) {
      void createProject(next);
      return;
    }
    change(next, `Load ${name} example`);
    setSelected(
      next.units.find((n) => n.kind === "PBR" || n.kind === "Distillation")
        ?.id ?? null,
    );
    setCompareId("");
    setTemplatesOpen(false);
    setPropertiesOpen(false);
    setDrawer(null);
  }
  async function importFile(file: File) {
    try {
      if (file.size > 2_000_000) throw new Error("Project file exceeds 2 MB.");
      const imported = parseImport(await file.text());
      if (state.revisions.length + imported.revisions.length > 240)
        throw new Error(
          "Combined revision history is too large. Import a project-only JSON file.",
        );
      setStorage("Saving…");
      editHistory.current = {
        past: [...editHistory.current.past, project],
        future: [],
      };
      setState((s) => ({
        version: 1,
        project: imported.project,
        revisions: [
          ...s.revisions,
          checkpoint(s.project, "Before import"),
          ...imported.revisions.map((r) => ({ ...r, id: crypto.randomUUID() })),
          checkpoint(imported.project, "Imported project"),
        ],
      }));
      setResult(null);
      setSelected(null);
      setCompareId("");
      setMessage("Project imported; previous work remains in Revisions.");
    } catch (e) {
      setMessage(
        e instanceof Error && e.name !== "ZodError"
          ? e.message
          : "Invalid project file. Expected a version 1 Project CAD document with valid equipment and streams.",
      );
    }
  }
  function exportFile() {
    const blob = new Blob([JSON.stringify(state, null, 2)], {
        type: "application/json",
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "project-cad.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function restoreRevision(r: Revision) {
    if (state.revisions.length > 245) {
      setMessage("Export before restoring: revision limit reached.");
      return;
    }
    setStorage("Saving…");
    editHistory.current = {
      past: [...editHistory.current.past, project],
      future: [],
    };
    setState(restore(state, r));
    setResult(null);
    setMessage("Restored as a new revision. Later revisions are preserved.");
    setSelected(null);
  }
  function applyPlan(plan: Plan, base: string) {
    if (base !== JSON.stringify(project)) {
      setMessage("Project changed. Generate a fresh proposal.");
      return;
    }
    try {
      change(applyActions(project, plan), "Apply Meta actions", true);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Invalid proposal.");
    }
  }
  function inspect(id: string) {
    setSelected(id);
    setPropertiesOpen(true);
  }
  function openResults(nextTab = "Results") {
    setTab(nextTab);
    setWorkspaceMenuOpen(false);
    setDrawer("Results");
  }
  function arrange() {
    change(
      {
        ...project,
        units: project.units.map((unit, index) => ({
          ...unit,
          position: { x: index * 185, y: 150 },
        })),
      },
      "Arrange equipment",
    );
  }
  async function clearLocal() {
    try {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      ++saveVersion.current;
      setStorage("Clearing…");
      await saveQueue.current;
      await clearWorkspace(projectId);
      const blank: WorkspaceState = {
        version: 1,
        project: { version: 1, name: "Untitled process", units: [], edges: [] },
        revisions: [],
      };
      await saveWorkspace(blank, projectId);
      setState(blank);
      editHistory.current = { past: [], future: [] };
      setStorage("Saved on this device");
      setResult(null);
      setSelected(null);
      setCompareId("");
      setClearConfirm(false);
      setMessage("Local project and history cleared.");
    } catch {
      setMessage("Could not clear local storage.");
    }
  }
  async function flushCurrentProject() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    ++saveVersion.current;
    const snapshot = state,
      id = projectId;
    saveQueue.current = saveQueue.current
      .catch(() => {})
      .then(() => saveWorkspace(snapshot, id));
    await saveQueue.current;
    setStorage("Saved on this device");
  }
  async function openProjects() {
    if (!ready || projectBusy) return;
    setProjectBusy(true);
    setProjectMessage("");
    try {
      await flushCurrentProject();
      setSavedProjects(await listProjects());
      setShowProjects(true);
      setMenuOpen(false);
    } catch {
      setMessage(
        "Could not open local projects. Export a copy of the current project.",
      );
    } finally {
      setProjectBusy(false);
    }
  }
  function resetEditor() {
    editHistory.current = { past: [], future: [] };
    setDrawer(null);
    setWorkspaceMenuOpen(false);
    setSelected(null);
    setResult(null);
    setCompareId("");
    setMessage("");
    setPropertiesOpen(false);
    setTemplatesOpen(false);
    setAssistantOpen(false);
    setView("2D");
    setPlaybackOnOpen(false);
    const url = new URL(window.location.href);
    for (const key of ["example", "view", "play"]) url.searchParams.delete(key);
    window.history.replaceState(window.history.state, "", url);
  }
  async function createProject(next: Project) {
    if (projectBusy) return;
    setProjectBusy(true);
    try {
      await flushCurrentProject();
      const id = crypto.randomUUID(),
        workspace: WorkspaceState = {
          version: 1,
          project: next,
          revisions: [checkpoint(next, "Created project")],
        };
      await saveWorkspace(workspace, id);
      setProjectId(id);
      setState(workspace);
      setShowProjects(false);
      resetEditor();
    } catch {
      setProjectMessage(
        "Could not create the project. Your current project is still available.",
      );
    } finally {
      setProjectBusy(false);
    }
  }
  async function openProject(entry: SavedProject) {
    if (projectBusy) return;
    setProjectBusy(true);
    try {
      await flushCurrentProject();
      await saveWorkspace(entry.workspace, entry.id);
      setProjectId(entry.id);
      setState(entry.workspace);
      setShowProjects(false);
      resetEditor();
    } catch {
      setProjectMessage("Could not open this project. Please try again.");
    } finally {
      setProjectBusy(false);
    }
  }
  async function editSavedProject(
    entry: SavedProject,
    name?: string,
    duplicate = false,
  ) {
    if (projectBusy) return;
    setProjectBusy(true);
    setProjectMessage("");
    try {
      await flushCurrentProject();
      const next = structuredClone(entry);
      if (duplicate) {
        next.id = crypto.randomUUID();
        next.workspace.project.name = `${next.workspace.project.name.slice(0, 75)} copy`;
        next.createdAt = new Date().toISOString();
        next.starred = false;
      } else if (name) {
        next.workspace.project.name = name;
        next.workspace.revisions.push(
          checkpoint(next.workspace.project, "Rename project"),
        );
      } else next.starred = !next.starred;
      next.updatedAt = new Date().toISOString();
      await updateSavedProject(next);
      if (next.id === projectId && name) {
        await saveWorkspace(next.workspace, projectId);
        setState(next.workspace);
      }
      setSavedProjects(await listProjects());
      setProjectMessage(
        duplicate
          ? "Project duplicated."
          : name
            ? "Project renamed."
            : next.starred
              ? "Project starred."
              : "Star removed.",
      );
    } catch {
      setProjectMessage("Could not update this project. Please try again.");
    } finally {
      setProjectBusy(false);
    }
  }
  function toggleFullscreen() {
    const action = document.fullscreenElement
      ? document.exitFullscreen()
      : canvasRef.current?.requestFullscreen();
    void action?.catch(() =>
      setMessage("Full screen is unavailable in this browser."),
    );
  }
  function undoEdit(redo = false) {
    const history = editHistory.current;
    const source = redo ? history.future : history.past;
    const target = redo ? history.past : history.future;
    const next = source.at(-1);
    if (!next || !change(next, redo ? "Redo edit" : "Undo edit", false, false))
      return;
    source.pop();
    target.push(project);
    setSelection((ids) =>
      ids.filter((id) =>
        [...next.units, ...next.edges].some((item) => item.id === id),
      ),
    );
  }
  function pasteCopy(
    copy: SelectionCopy | null,
    offset: number,
    label: string,
  ) {
    if (!copy?.units.length) return;
    try {
      const next = pasteSelection(project, copy, offset);
      if (change(next.project, label)) setSelection(next.selection);
    } catch {
      setMessage(
        "Cannot paste here: the project allows up to 40 equipment and 80 streams, within the canvas bounds.",
      );
    }
  }
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        !ready ||
        projectBusy ||
        showProjects ||
        event.defaultPrevented ||
        event.isComposing
      )
        return;
      if (isCloseKey(event) && !document.querySelector("dialog[open]")) {
        event.preventDefault();
        if (menuOpen) setMenuOpen(false);
        else if (assistantOpen) setAssistantOpen(false);
        else setSelection([]);
        canvasRef.current?.focus();
        return;
      }
      if (shortcutsBlocked(event)) return;
      const key = event.key.toLowerCase();
      const command = event.ctrlKey || event.metaKey;
      let handled = true;
      if (key === "f11" || (key === "f" && event.ctrlKey && event.metaKey))
        toggleFullscreen();
      else if (event.altKey) return;
      else if (command) {
        if (key === "s")
          void flushCurrentProject().catch(() =>
            setMessage("Could not save locally. Export a copy of the project."),
          );
        else if (key === "enter") run();
        else if (key === "z") undoEdit(event.shiftKey);
        else if (key === "y") undoEdit(true);
        else if (key === "a")
          setSelection(project.units.map((unit) => unit.id));
        else if (key === "d")
          pasteCopy(
            copySelection(project, selection),
            40,
            "Duplicate selection",
          );
        else if (key === "c" || key === "x") {
          const copy = copySelection(project, selection);
          if (copy.units.length) {
            clipboard.current = copy;
            pasteOffset.current = 40;
            if (
              key === "x" &&
              change(deleteSelection(project, selection), "Cut selection")
            )
              setSelection([]);
          }
        } else if (key === "v") {
          pasteCopy(clipboard.current, pasteOffset.current, "Paste selection");
          pasteOffset.current += 40;
        } else handled = false;
      } else if (key === "delete" || key === "backspace") {
        if (
          selection.length &&
          change(deleteSelection(project, selection), "Delete selection")
        )
          setSelection([]);
      } else if (key === "e" || key === "f2") {
        if (selected) setPropertiesOpen(true);
      } else if (key === "a" && event.shiftKey) arrange();
      else if (key === "a" || key === "/") {
        openPanel("Equipment");
        requestAnimationFrame(() =>
          canvasRef.current
            ?.querySelector<HTMLInputElement>('[aria-label="Search equipment"]')
            ?.focus(),
        );
      } else if (key === "r") {
        if (drawer === "Results") closeDrawer();
        else openResults();
      } else if (key === "h" || key === "?") setHelpOpen(true);
      else handled = false;
      if (handled) event.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });
  if (showProjects)
    return (
      <main className="workspace" data-theme={theme}>
        <ProjectsPage
          projects={savedProjects}
          currentId={projectId}
          onOpen={(entry) => void openProject(entry)}
          onNew={() => setTemplatesOpen(true)}
          onRename={(entry, name) => void editSavedProject(entry, name)}
          onDuplicate={(entry) => void editSavedProject(entry, undefined, true)}
          onStar={(entry) => void editSavedProject(entry)}
          onBack={() => setShowProjects(false)}
          theme={theme}
          onTheme={() => setTheme(theme === "light" ? "dark" : "light")}
          busy={projectBusy}
          message={projectMessage}
        />
        {templatesOpen ? (
          <Templates
            onLoad={loadExample}
            onClose={() => setTemplatesOpen(false)}
          />
        ) : null}
      </main>
    );
  const selectedUnit = project.units.find((n) => n.id === selected);
  return (
    <main className="workspace" data-theme={theme}>
      <header className="app-header">
        <button
          className="brand"
          onClick={() => void openProjects()}
          aria-label="Project CAD home"
        >
          <EquipmentPanelIcon size={29} />
          <span>Project CAD</span>
        </button>
        <span className="header-divider" />
        <div className="header-navigation">
          <button
            className="icon-button"
            aria-label="Open projects"
            title="Projects"
            onClick={() => void openProjects()}
          >
            <Home size={18} />
          </button>
          <button
            className="icon-button"
            aria-label="Open revision history"
            title="Revision history"
            onClick={() => openResults("Revisions")}
          >
            <History size={18} />
          </button>
        </div>
        <div className="project-heading">
          <h1>{project.name}</h1>
          <ChevronRight size={15} />
          <span className="revision-badge">
            <GitBranch size={13} />v{Math.max(1, state.revisions.length)}
          </span>
        </div>
        <div className="header-actions">
          <button
            className="model-button"
            onClick={() => openPanel("Settings")}
          >
            <Thermometer size={16} />
            <span>
              {modelInfo((project.thermo ?? defaultThermo).modelId).name}
            </span>
          </button>
          <span
            className="species-count"
            title={
              sampleMixtures[(project.thermo ?? defaultThermo).mixture].name
            }
          >
            <FlaskConical size={16} />
            <span>2</span>
          </span>
          <button
            className="icon-button theme-button"
            aria-label="Toggle theme"
            title="Toggle theme"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          >
            {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
          </button>
          <div className="project-menu-wrap">
            <button
              className="icon-button"
              aria-label="Project menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <MoreHorizontal size={19} />
            </button>
            {menuOpen ? (
              <div className="project-menu">
                <button
                  onClick={() => {
                    setTemplatesOpen(true);
                    setMenuOpen(false);
                  }}
                >
                  <FolderOpen size={15} />
                  Templates
                </button>
                <button
                  onClick={() => {
                    fileRef.current?.click();
                    setMenuOpen(false);
                  }}
                  disabled={!ready}
                >
                  <Upload size={15} />
                  Import project
                </button>
                <button
                  onClick={() => {
                    exportFile();
                    setMenuOpen(false);
                  }}
                >
                  <Download size={15} />
                  Export project
                </button>
              </div>
            ) : null}
          </div>
          <button
            className="btn btn-primary simulate-button"
            aria-label="Run simulation"
            onClick={run}
            disabled={!ready}
          >
            <Play size={13} fill="currentColor" />
            Simulate
          </button>
        </div>
        <input
          ref={fileRef}
          hidden
          type="file"
          accept=".json,application/json"
          aria-label="Import project file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importFile(f);
            e.target.value = "";
          }}
        />
      </header>
      <div className="editor-body" inert={!ready}>
        <section
          className="canvas-panel"
          ref={canvasRef}
          tabIndex={-1}
          aria-label="Process canvas"
        >
          <button
            ref={pullTabRef}
            className={`workspace-pull-tab ${workspaceMenuOpen || drawer ? "active" : ""}`}
            aria-label="Workspace menu"
            title="Workspace menu"
            aria-expanded={workspaceMenuOpen}
            aria-controls="workspace-menu"
            onClick={() => {
              setWorkspaceMenuOpen(!workspaceMenuOpen);
              setDrawer(null);
            }}
          >
            <Settings2 size={19} />
            {workspaceMenuOpen ? (
              <ChevronLeft size={14} />
            ) : (
              <ChevronRight size={14} />
            )}
          </button>
          {workspaceMenuOpen ? (
            <nav
              id="workspace-menu"
              className="workspace-menu"
              aria-label="Workspace"
              ref={workspaceMenuRef}
            >
              <h2>Workspace</h2>
              {[
                { name: "Equipment", icon: EquipmentPanelIcon },
                { name: "Results", icon: ChartNoAxesColumnIncreasing },
                { name: "Themes", icon: Palette },
                { name: "Toggle chat", icon: MessageCircle },
                { name: "Storage settings", icon: HardDrive },
                { name: "Settings", icon: Settings2 },
              ].map(({ name, icon: Icon }) => (
                <button
                  key={name}
                  onClick={() => {
                    if (name === "Toggle chat") {
                      setWorkspaceMenuOpen(false);
                      setAssistantOpen(!assistantOpen);
                    } else openPanel(name as WorkspacePanel);
                  }}
                >
                  <Icon size={20} />
                  <span>{name}</span>
                  <ChevronRight size={16} />
                </button>
              ))}
            </nav>
          ) : null}
          {drawer ? (
            <aside
              id={`workspace-${drawer.toLowerCase().replaceAll(" ", "-")}-panel`}
              className={`workspace-drawer drawer-${drawer.toLowerCase().replaceAll(" ", "-")}`}
              aria-label={drawer}
            >
              <header className="library-heading">
                <h2>{drawer}</h2>
                <button
                  className="icon-button"
                  aria-label={`Close ${drawer}`}
                  onClick={closeDrawer}
                >
                  <X size={16} />
                </button>
              </header>
              {drawer === "Equipment" ? (
                <EquipmentLibrary onAdd={add} />
              ) : (
                <div className="workspace-drawer-content">
                  {drawer === "Results" ? (
                    <Results
                      project={project}
                      result={result}
                      revisions={state.revisions}
                      tab={tab}
                      onTab={setTab}
                      onRestore={restoreRevision}
                      compareId={compareId}
                      onCompare={setCompareId}
                      onSelect={(id) => {
                        setDrawer(null);
                        inspect(id);
                      }}
                    />
                  ) : (
                    <>
                      {drawer === "Themes" || drawer === "Settings" ? (
                        <div className="preference-section">
                          <h3>Appearance</h3>
                          <div className="theme-options">
                            <button
                              className={`btn ${theme === "light" ? "chosen" : ""}`}
                              onClick={() => setTheme("light")}
                            >
                              <Sun size={16} />
                              Light
                            </button>
                            <button
                              className={`btn ${theme === "dark" ? "chosen" : ""}`}
                              onClick={() => setTheme("dark")}
                            >
                              <Moon size={16} />
                              Dark
                            </button>
                          </div>
                        </div>
                      ) : null}
                      {drawer === "Settings" ? (
                        <div className="preference-section">
                          <ThermoSettingsPanel
                            project={project}
                            onApply={(settings) => {
                              change(
                                applyActions(project, {
                                  summary: "Change thermodynamic model",
                                  actions: [
                                    { type: "set_thermo_model", ...settings },
                                  ],
                                }),
                                `Model: ${modelInfo(settings.modelId).name}`,
                              );
                            }}
                          />
                        </div>
                      ) : null}
                      {drawer === "Storage settings" ||
                      drawer === "Settings" ? (
                        <div className="preference-section">
                          <h3>Local project</h3>
                          <div className="preference-actions">
                            <button className="btn" onClick={exportFile}>
                              <Download size={15} />
                              Export project
                            </button>
                            <button
                              className="btn danger"
                              onClick={() => {
                                setDrawer(null);
                                setClearConfirm(true);
                              }}
                            >
                              <Trash2 size={15} />
                              Clear local project & history
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              )}
            </aside>
          ) : null}
          <div className="canvas-toolbar">
            <nav
              className="tool-group workspace-mode-tools"
              aria-label="Workspace panels"
            >
              <button
                className={drawer === "Equipment" ? "active" : ""}
                aria-expanded={drawer === "Equipment"}
                aria-controls="workspace-equipment-panel"
                onClick={() =>
                  drawer === "Equipment"
                    ? closeDrawer()
                    : openPanel("Equipment")
                }
              >
                <EquipmentPanelIcon size={18} />
                <span>Equipment</span>
              </button>
              <span className="tool-divider" />
              <button
                className={drawer === "Results" ? "active" : ""}
                aria-expanded={drawer === "Results"}
                aria-controls="workspace-results-panel"
                onClick={() =>
                  drawer === "Results" ? closeDrawer() : openPanel("Results")
                }
              >
                <ChartNoAxesColumnIncreasing size={18} />
                <span>Results</span>
              </button>
            </nav>
            <div className="canvas-right-tools">
              <div className="canvas-view-controls">
                <button
                  className={`composition-toggle ${compositionColors ? "active" : ""}`}
                  aria-label="Color streams by composition"
                  aria-pressed={compositionColors}
                  title="Color streams by composition"
                  onClick={() => setCompositionColors(!compositionColors)}
                >
                  <Rainbow size={17} />
                </button>
                <div className="view-switch" aria-label="Canvas view">
                  {[
                    { name: "2D", label: "2D flowsheet", icon: PanelTop },
                    { name: "3D", label: "3D schematic", icon: Box },
                    { name: "Split", label: "Split", icon: Columns2 },
                  ].map((item) => (
                    <button
                      key={item.name}
                      aria-label={item.label}
                      aria-pressed={view === item.name}
                      className={view === item.name ? "active" : ""}
                      onClick={() => setView(item.name)}
                    >
                      <item.icon size={15} />
                      <span>{item.name}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="tool-group canvas-edit-tools">
                <button
                  aria-label="Properties"
                  title="Edit selected equipment"
                  disabled={!selected}
                  onClick={() => setPropertiesOpen(true)}
                >
                  <Pencil size={16} />
                  <span>Edit</span>
                </button>
                <button
                  aria-label="Arrange"
                  title="Arrange equipment"
                  onClick={arrange}
                  disabled={!project.units.length}
                >
                  <AlignHorizontalJustifyStart size={16} />
                  <span>Arrange</span>
                </button>
                <button
                  className="toolbar-icon"
                  aria-label="Maximize canvas"
                  title="Maximize canvas"
                  onClick={toggleFullscreen}
                >
                  <Maximize size={16} />
                </button>
                <button
                  className="toolbar-icon"
                  aria-label="Workspace help"
                  title="Workspace help"
                  onClick={() => setHelpOpen(true)}
                >
                  <CircleHelp size={15} />
                </button>
              </div>
            </div>
          </div>
          <div
            className={`canvas-body ${view === "Split" ? "split-view" : ""}`}
          >
            {view !== "3D" ? (
              <ProcessCanvas
                key={`${projectId}-${project.name}`}
                project={project}
                selected={selected}
                selection={selection}
                onSelection={setSelection}
                onInspect={inspect}
                onChange={change}
                onAdd={add}
                onError={setMessage}
                result={result}
                compositionColors={compositionColors}
                compare={
                  state.revisions.find((r) => r.id === compareId)?.project
                }
              />
            ) : null}
            {view !== "2D" && ready ? (
              <Plant3D
                initialPlaying={playbackOnOpen}
                dark={theme === "dark"}
                project={project}
                selected={selected}
                onSelect={inspect}
              />
            ) : view !== "2D" ? (
              <div className="empty-state">Opening 3D project…</div>
            ) : null}
          </div>
          {project.units.length === 0 ? (
            <div className="blank-canvas">
              <Workflow size={34} />
              <h2>Your next process starts here</h2>
              <p>
                Add equipment from the library or start with a simple template.
              </p>
              <button className="btn" onClick={() => setTemplatesOpen(true)}>
                <FolderOpen size={15} />
                Browse templates
              </button>
            </div>
          ) : null}
          {message ? (
            <div className="notification" role="status">
              <Info size={15} />
              <span>{message}</span>
              <button
                className="icon-button"
                aria-label="Dismiss notification"
                onClick={() => setMessage("")}
              >
                <X size={14} />
              </button>
            </div>
          ) : null}
          {!assistantOpen ? (
            <button
              ref={bubbleRef}
              style={bubbleDrag.style}
              {...bubbleDrag.dragProps}
              className={`assistant-toggle ${assistantOpen ? "active" : ""}`}
              aria-label={
                assistantOpen ? "Close Meta assistant" : "Open Meta assistant"
              }
              title="Meta assistant · drag to dock in a corner"
              onClick={() => {
                if (!bubbleDrag.suppressClick()) {
                  if (window.matchMedia("(max-width: 760px)").matches)
                    setDrawer(null);
                  setAssistantOpen(true);
                }
              }}
            >
              <MessageCircle size={21} />
            </button>
          ) : null}
          {assistantOpen ? (
            <div
              className="assistant-drawer"
              ref={assistantRef}
              style={assistantDrag.style}
            >
              <AssistantPanel
                project={project}
                onApply={applyPlan}
                onClose={() => setAssistantOpen(false)}
                dragProps={assistantDrag.dragProps}
                onError={setMessage}
              />
            </div>
          ) : null}
          <footer className="canvas-footer">
            <div className="canvas-status">
              <span className="save-status">
                <Check size={12} />
                {storage}
              </span>
              <span>
                {project.units.length} equipment · {project.edges.length}{" "}
                streams
              </span>
              <span className={result?.converged ? "calculated" : ""}>
                {result
                  ? result.converged
                    ? "Calculated"
                    : "Not converged"
                  : "Not calculated"}
              </span>
            </div>
          </footer>
        </section>
      </div>
      {helpOpen ? <KeyboardHelp onClose={() => setHelpOpen(false)} /> : null}
      {templatesOpen ? (
        <Templates
          onClose={() => setTemplatesOpen(false)}
          onLoad={loadExample}
        />
      ) : null}
      {propertiesOpen ? (
        <Dialog
          title={
            selectedUnit
              ? `${selectedUnit.name} · ${selectedUnit.id}`
              : (project.edges.find((edge) => edge.id === selected)?.name ??
                "Stream properties")
          }
          className="properties-dialog"
          onClose={() => setPropertiesOpen(false)}
        >
          <Inspector
            project={project}
            selected={selected}
            result={result}
            onChange={(p, l) => {
              change(p, l, true);
              if (
                !p.units.some((n) => n.id === selected) &&
                !p.edges.some((e) => e.id === selected)
              )
                setPropertiesOpen(false);
            }}
            onError={setMessage}
          />
        </Dialog>
      ) : null}
      {clearConfirm ? (
        <Dialog
          title="Clear this device’s project?"
          className="confirm-dialog"
          onClose={() => setClearConfirm(false)}
        >
          <p>
            This removes the current project and its saved revision history.
            Export first if you want to keep a copy.
          </p>
          <div className="dialog-actions">
            <button className="btn" onClick={() => setClearConfirm(false)}>
              Cancel
            </button>
            <button className="btn" onClick={exportFile}>
              Export copy
            </button>
            <button className="btn btn-error" onClick={clearLocal}>
              Clear project
            </button>
          </div>
        </Dialog>
      ) : null}
    </main>
  );
}
