"use client";
import { useEffect, useRef, useState } from "react";
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
  PanelLeft,
  ChevronRight,
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
} from "lucide-react";
import { useFloatingDrag } from "./useFloatingDrag";
import Dialog from "./Dialog";
import EquipmentLibrary from "./EquipmentLibrary";
import Templates from "./Templates";
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
  listProjects,
  updateSavedProject,
  type SavedProject,
} from "@/lib/storage";
import ProcessCanvas from "./ProcessCanvas";
import Inspector from "./Inspector";
import Results from "./Results";
import AssistantPanel from "./AssistantPanel";
const Plant3D = dynamic(() => import("./Plant3D"), {
  ssr: false,
  loading: () => <div className="empty-state">Loading 3D workspace…</div>,
});
export default function Workspace() {
  const [state, setState] = useState<WorkspaceState>({
    version: 1,
    project: reactorExample(),
    revisions: [],
  });
  const [ready, setReady] = useState(false);
  const [storage, setStorage] = useState("Loading local project");
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState("2D");
  const [tab, setTab] = useState("Results");
  const [compareId, setCompareId] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [message, setMessage] = useState("");
  const [theme, setTheme] = useState("light");
  const [clearConfirm, setClearConfirm] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(true);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [rainbow, setRainbow] = useState(true);
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
  const project = state.project;
  useEffect(() => {
    let active = true;
    Promise.all([loadWorkspace(), activeProjectId()])
      .then(([saved, id]) => {
        if (!active) return;
        setProjectId(id);
        setLibraryOpen(!window.matchMedia("(max-width: 760px)").matches);
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
  }, []);
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
  function change(next: Project, label: string, run = false) {
    try {
      projectSchema.parse(next);
      const errors = validateGraph(next);
      if (errors.length) throw new Error(errors[0]);
      if (state.revisions.length >= 245)
        throw new Error(
          "Revision limit reached. Export this project, then clear local history to continue.",
        );
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
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Invalid project.");
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
      setResultsOpen(true);
    } catch (e) {
      setResult(null);
      setMessage(e instanceof Error ? e.message : "Simulation failed.");
    }
  }
  function loadExample(name: string) {
    const next =
      name === "solution"
        ? solutionExample()
        : name === "heating"
          ? heatingExample()
          : name === "reactor"
            ? reactorExample()
            : name === "distillation"
              ? distillationExample()
              : {
                  version: 1 as const,
                  name: "Untitled process",
                  units: [],
                  edges: [],
                };
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
    setResultsOpen(false);
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
    setResultsOpen(true);
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
    if (window.matchMedia("(max-width: 760px)").matches) setLibraryOpen(false);
    setSelected(null);
    setResult(null);
    setCompareId("");
    setMessage("");
    setPropertiesOpen(false);
    setResultsOpen(false);
    setTemplatesOpen(false);
    setAssistantOpen(false);
    setView("2D");
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
          <Workflow size={29} />
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
            aria-label="Toggle equipment library"
            title="Equipment library"
            aria-pressed={libraryOpen}
            onClick={() => setLibraryOpen(!libraryOpen)}
          >
            <PanelLeft size={18} />
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
            onClick={() => setPreferencesOpen(true)}
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
                <button
                  onClick={() => {
                    setPreferencesOpen(true);
                    setMenuOpen(false);
                  }}
                >
                  <Settings2 size={15} />
                  Preferences
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
      <div
        className={`editor-body ${libraryOpen ? "with-library" : ""}`}
        inert={!ready}
      >
        {libraryOpen ? (
          <EquipmentLibrary
            onAdd={add}
            onClose={() => setLibraryOpen(false)}
            onPreferences={() => setPreferencesOpen(true)}
          />
        ) : null}
        <section
          className="canvas-panel"
          ref={canvasRef}
          aria-label="Process canvas"
        >
          <div className="canvas-toolbar">
            <div className="tool-group workspace-mode-tools">
              <button
                className={libraryOpen ? "active" : ""}
                aria-label="Equipment"
                onClick={() => setLibraryOpen(!libraryOpen)}
              >
                <Workflow size={17} />
                <span>Equipment</span>
              </button>
              <span className="tool-divider" />
              <button onClick={() => openResults()}>
                <ChartNoAxesColumnIncreasing size={17} />
                <span>Results</span>
              </button>
            </div>
            <div className="canvas-view-controls">
              <button
                className={`rainbow-toggle ${rainbow ? "active" : ""}`}
                aria-label="Rainbow flow"
                aria-pressed={rainbow}
                title="Rainbow flow"
                onClick={() => setRainbow(!rainbow)}
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
              <button onClick={arrange} disabled={!project.units.length}>
                <AlignHorizontalJustifyStart size={16} />
                <span>Arrange</span>
              </button>
              <button
                className="toolbar-icon"
                aria-label="Maximize canvas"
                title="Maximize canvas"
                onClick={() => {
                  if (document.fullscreenElement)
                    void document.exitFullscreen();
                  else void canvasRef.current?.requestFullscreen();
                }}
              >
                <Maximize size={16} />
              </button>
              <button
                className="toolbar-icon"
                aria-label="Workspace help"
                title="Workspace help"
                onClick={() =>
                  setMessage(
                    "Double-click equipment to edit. Drag between ports to connect. Open projects from Home and choose New for templates; use the view switch for 2D, 3D, and Split views.",
                  )
                }
              >
                <CircleHelp size={15} />
              </button>
            </div>
          </div>
          <div
            className={`canvas-body ${view === "Split" ? "split-view" : ""}`}
          >
            {view !== "3D" ? (
              <ProcessCanvas
                key={`${project.name}-${view}`}
                project={project}
                selected={selected}
                onSelect={setSelected}
                onInspect={inspect}
                onChange={change}
                onAdd={add}
                onError={setMessage}
                result={result}
                rainbow={rainbow}
                compare={
                  state.revisions.find((r) => r.id === compareId)?.project
                }
              />
            ) : null}
            {view !== "2D" ? (
              <Plant3D
                project={project}
                selected={selected}
                onSelect={inspect}
              />
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
                    setLibraryOpen(false);
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
              : "Stream properties"
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
      {resultsOpen ? (
        <Dialog
          title={tab === "Results" ? "Process results" : "Revision history"}
          className="results-dialog"
          onClose={() => setResultsOpen(false)}
        >
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
              setResultsOpen(false);
              inspect(id);
            }}
          />
        </Dialog>
      ) : null}
      {preferencesOpen ? (
        <Dialog
          title="Preferences"
          className="preferences-dialog"
          onClose={() => setPreferencesOpen(false)}
        >
          <div className="preference-section">
            <h3>Appearance</h3>
            <p>Choose the workspace theme.</p>
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
          <div className="preference-section">
            <ThermoSettingsPanel
              project={project}
              onApply={(settings) => {
                change(
                  applyActions(project, {
                    summary: "Change thermodynamic model",
                    actions: [{ type: "set_thermo_model", ...settings }],
                  }),
                  `Model: ${modelInfo(settings.modelId).name}`,
                );
              }}
            />
          </div>
          <div className="preference-section">
            <h3>Local project</h3>
            <p>
              The project and its revisions are saved on this device. Export a
              JSON copy to keep or share your work.
            </p>
            <div className="preference-actions">
              <button className="btn" onClick={exportFile}>
                <Download size={15} />
                Export project
              </button>
              <button
                className="btn danger"
                onClick={() => {
                  setPreferencesOpen(false);
                  setClearConfirm(true);
                }}
              >
                <Trash2 size={15} />
                Clear local project & history
              </button>
            </div>
          </div>
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
