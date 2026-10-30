"use client";
import { useCallback, useEffect, useRef, useState } from "react";
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
  AlertCircle,
  FolderPlus,
} from "lucide-react";
import { useFloatingDrag } from "./useFloatingDrag";
import Dialog from "./Dialog";
import EquipmentLibrary from "./EquipmentLibrary";
import Templates from "./Templates";
import { plantTemplate } from "@/domain/plant-templates";
import { arrangeFlowsheet } from "@/domain/flowsheet-layout";
import ProjectsPage from "./ProjectsPage";
import CreateProjectDialog from "./CreateProjectDialog";
import FolderSaveNotice from "./FolderSaveNotice";
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
import { applyActions } from "@/domain/actions";
import type { Proposal } from "@/assistant/protocol";
import { projectRevision } from "@/assistant/tools";
import {
  checkpoint,
  restore,
  type Workspace as WorkspaceState,
  type Revision,
} from "@/lib/revisions";
import {
  saveWorkspace,
  saveWorkspaceRecovery,
  loadActiveWorkspace,
  parseImport,
  chooseProjectDirectory,
  createFolderProject,
  openFolderProject,
  activateSavedProject,
  loadSavedProject,
  getProjectFolderInfo,
  requestProjectFolderAccess,
  FolderStorageError,
  MAX_PROJECT_FILE_BYTES,
  openExampleWorkspace,
  listProjects,
  updateSavedProject,
  type SavedProject,
  type SaveLocation,
  type ProjectDirectoryHandle,
  type ProjectFolderInfo,
} from "@/lib/storage";
import ProcessCanvas from "./ProcessCanvas";
import Inspector from "./Inspector";
import Results from "./Results";
import AssistantPanel from "./AssistantPanel";
const Plant3D = dynamic(() => import("./Plant3D"), {
  ssr: false,
  loading: () => <div className="empty-state">Loading 3D workspace…</div>,
});
function savedMessage(location: SaveLocation) {
  return location.location === "folder"
    ? `Saved to ${location.folderName}/project.json`
    : "Saved on this device";
}
function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Could not save your project. Export a copy and try again.";
}
function blankProject(): Project {
  return { version: 1, name: "Untitled process", units: [], edges: [] };
}
export default function Workspace({
  exampleId,
  initialView = "2D",
  initialPlayback = false,
  initialArrange = false,
}: {
  exampleId?: string;
  initialView?: "2D" | "3D" | "Split";
  initialPlayback?: boolean;
  initialArrange?: boolean;
}) {
  const [state, setState] = useState<WorkspaceState>(() => ({
    version: 1,
    project: (exampleId && plantTemplate(exampleId)) || reactorExample(),
    revisions: [],
  }));
  const [ready, setReady] = useState(false);
  const [storage, setStorage] = useState("Loading local project");
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<string>(initialView);
  const [fitRequest, setFitRequest] = useState(0);
  const [playbackOnOpen, setPlaybackOnOpen] = useState(initialPlayback);
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
  const [assistantStarted, setAssistantStarted] = useState(false);
  const assistantApplyLock = useRef(false);
  useEffect(() => {
    if (!assistantOpen) return;
    const mobile = window.matchMedia("(max-width: 760px)");
    const onResize = (event: MediaQueryListEvent) => {
      if (event.matches) setLibraryOpen(false);
    };
    mobile.addEventListener("change", onResize);
    return () => mobile.removeEventListener("change", onResize);
  }, [assistantOpen]);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [rainbow, setRainbow] = useState(true);
  const [projectId, setProjectId] = useState("main");
  const [showProjects, setShowProjects] = useState(false);
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);
  const [projectBusy, setProjectBusy] = useState(false);
  const [projectMessage, setProjectMessage] = useState("");
  const [folderName, setFolderName] = useState<string | null>(null);
  const [saveIssue, setSaveIssue] = useState<{
    message: string;
    needsPermission: boolean;
  } | null>(null);
  const [persistenceReady, setPersistenceReady] = useState(false);
  const [createDraft, setCreateDraft] = useState<{
    seed: Project;
    revisions?: Revision[];
  } | null>(null);
  const [reloadConfirm, setReloadConfirm] = useState(false);
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
  const lastSaved = useRef<{ id: string; workspace: WorkspaceState } | null>(
    null,
  );
  const project = state.project;
  const reportSaved = useCallback((location: SaveLocation) => {
    setStorage(savedMessage(location));
    setFolderName(location.folderName ?? null);
    setSaveIssue(null);
  }, []);
  const reportSaveError = useCallback((error: unknown) => {
    const description = errorMessage(error);
    setStorage("Could not finish saving");
    setSaveIssue({
      message: description,
      needsPermission:
        error instanceof FolderStorageError && error.code === "permission",
    });
  }, []);
  const reportFolder = useCallback(
    (info: ProjectFolderInfo | null) => {
      setFolderName(info?.name ?? null);
      if (
        info &&
        (info.error || info.hasRecovery || info.permission !== "granted")
      ) {
        const description =
          info.error ??
          (info.permission !== "granted"
            ? "Reconnect the folder to save project.json. Your current work is available in this browser."
            : "Changes in this browser have not been saved to project.json. Retry saving or reload the file.");
        setStorage("Could not finish saving");
        setSaveIssue({
          message: description,
          needsPermission: info.permission !== "granted",
        });
      } else
        reportSaved(
          info
            ? { location: "folder", folderName: info.name }
            : { location: "browser" },
        );
    },
    [reportSaved],
  );
  useEffect(() => {
    let active = true;
    const example = exampleId ? plantTemplate(exampleId) : undefined;
    const opening =
      example && exampleId
        ? openExampleWorkspace(exampleId, {
            version: 1,
            project: example,
            revisions: [checkpoint(example, "Created from example")],
          })
        : loadActiveWorkspace();
    opening
      .then(async ({ workspace: saved, projectId: id }) => {
        const info = await getProjectFolderInfo(id);
        if (!active) return;
        const initialProject = example ?? reactorExample();
        let workspace = saved ?? {
          version: 1 as const,
          project: initialProject,
          revisions: [checkpoint(initialProject, "Initial example")],
        };
        if (
          initialArrange &&
          workspace.project.units.length &&
          workspace.revisions.length < 245
        ) {
          const bounds = (
            canvasRef.current?.querySelector(".flow-wrapper") ??
            canvasRef.current
          )?.getBoundingClientRect();
          const arranged = arrangeFlowsheet(workspace.project, bounds);
          workspace = {
            ...workspace,
            project: arranged,
            revisions: [
              ...workspace.revisions,
              checkpoint(arranged, "Arrange equipment"),
            ],
          };
          // This link requests a one-time arrangement; later reloads retain edits.
          const url = new URL(window.location.href);
          url.searchParams.delete("arrange");
          window.history.replaceState(window.history.state, "", url);
        }
        setProjectId(id);
        setLibraryOpen(!window.matchMedia("(max-width: 760px)").matches);
        setState(workspace);
        if (initialArrange || !window.matchMedia("(max-width: 760px)").matches)
          setFitRequest((value) => value + 1);
        if (
          saved &&
          saved === workspace &&
          info &&
          !info.hasRecovery &&
          !info.error &&
          info.permission === "granted"
        )
          lastSaved.current = { id, workspace };
        reportFolder(info);
        if (!saved) setStorage("Saving…");
        setPersistenceReady(true);
        setReady(true);
      })
      .catch((error) => {
        if (active) {
          reportSaveError(error);
          setReady(true);
        }
      });
    return () => {
      active = false;
    };
  }, [exampleId, initialArrange, reportFolder, reportSaveError]);
  useEffect(() => {
    if (!ready || !persistenceReady || projectBusy) return;
    if (
      lastSaved.current?.id === projectId &&
      lastSaved.current.workspace === state
    )
      return;
    const version = ++saveVersion.current;
    const timer = setTimeout(() => {
      setStorage("Saving…");
      saveQueue.current = saveQueue.current
        .catch(() => {})
        .then(() => saveWorkspace(state, projectId))
        .then((location) => {
          lastSaved.current = { id: projectId, workspace: state };
          if (version === saveVersion.current) reportSaved(location);
        })
        .catch((error) => {
          if (version === saveVersion.current) reportSaveError(error);
        });
    }, 350);
    saveTimer.current = timer;
    return () => clearTimeout(timer);
  }, [
    state,
    ready,
    persistenceReady,
    projectId,
    projectBusy,
    reportSaved,
    reportSaveError,
  ]);
  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (
        ready &&
        (saveIssue ||
          lastSaved.current?.id !== projectId ||
          lastSaved.current?.workspace !== state)
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [ready, saveIssue, projectId, state]);
  function change(next: Project, label: string, run = false) {
    if (!ready || projectBusy || assistantApplyLock.current) return;
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
      setTemplatesOpen(false);
      setCreateDraft({ seed: next });
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
    if (!ready || projectBusy) return;
    setProjectBusy(true);
    try {
      if (file.size > MAX_PROJECT_FILE_BYTES)
        throw new Error("Project file exceeds 32 MB.");
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
    } finally {
      setProjectBusy(false);
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
  async function applyAssistantProposal(proposal: Proposal): Promise<string> {
    if (proposal.projectId !== projectId)
      throw new Error("This proposal belongs to another project.");
    if (state.revisions.some((revision) => revision.id === proposal.id))
      return saveIssue
        ? "Already applied. The local recovery copy is saved; the folder still needs attention."
        : "Already applied and saved.";
    if (
      !ready ||
      !persistenceReady ||
      projectBusy ||
      assistantApplyLock.current
    )
      throw new Error("Wait for the current project operation to finish.");
    if (state.revisions.length >= 245)
      throw new Error(
        "Revision limit reached. Export the project and clear local history before applying changes.",
      );
    assistantApplyLock.current = true;
    setProjectBusy(true);
    try {
      if (proposal.baseRevision !== (await projectRevision(project)))
        throw new Error("The project changed. Ask for a fresh proposal.");
      const nextProject = applyActions(project, proposal.plan);
      const next: WorkspaceState = {
        ...state,
        project: nextProject,
        revisions: [
          ...state.revisions,
          {
            ...checkpoint(nextProject, "Apply assistant changes"),
            id: proposal.id,
          },
        ],
      };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      ++saveVersion.current;
      await saveQueue.current.catch(() => {});
      let outcome: string;
      try {
        const location = await saveWorkspace(next, projectId);
        lastSaved.current = { id: projectId, workspace: next };
        reportSaved(location);
        outcome =
          location.location === "folder"
            ? "Applied and saved to project.json."
            : "Applied and saved on this device.";
      } catch (error) {
        await saveWorkspaceRecovery(next, projectId);
        reportSaveError(error);
        outcome =
          "Applied and saved to local recovery. The folder save needs attention.";
      }
      setState(next);
      setResult(null);
      setSelected(null);
      setMessage(outcome);
      return outcome;
    } finally {
      assistantApplyLock.current = false;
      setProjectBusy(false);
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
    const bounds = (
      canvasRef.current?.querySelector(".flow-wrapper") ?? canvasRef.current
    )?.getBoundingClientRect();
    change(arrangeFlowsheet(project, bounds), "Arrange equipment");
    setFitRequest((value) => value + 1);
  }
  async function clearLocal() {
    if (projectBusy) return;
    setProjectBusy(true);
    try {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      ++saveVersion.current;
      setStorage("Clearing…");
      await saveQueue.current.catch(() => {});
      const blank: WorkspaceState = {
        version: 1,
        project: {
          ...blankProject(),
          name: folderName ? project.name : "Untitled process",
        },
        revisions: [],
      };
      setState(blank);
      setResult(null);
      setSelected(null);
      setCompareId("");
      setClearConfirm(false);
      const location = await saveWorkspace(blank, projectId);
      lastSaved.current = { id: projectId, workspace: blank };
      reportSaved(location);
      setMessage("Project and history cleared.");
    } catch (error) {
      reportSaveError(error);
    } finally {
      setProjectBusy(false);
    }
  }
  async function flushCurrentProject() {
    if (!persistenceReady)
      throw new Error(
        "Could not load local storage. Reload the app before saving a project.",
      );
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const version = ++saveVersion.current;
    const snapshot = state,
      id = projectId;
    if (
      !saveIssue &&
      lastSaved.current?.id === id &&
      lastSaved.current.workspace === snapshot
    ) {
      await saveQueue.current.catch(() => {});
      return;
    }
    setStorage("Saving…");
    saveQueue.current = saveQueue.current
      .catch(() => {})
      .then(() => saveWorkspace(snapshot, id))
      .then((location) => {
        lastSaved.current = { id, workspace: snapshot };
        if (version === saveVersion.current) reportSaved(location);
      })
      .catch((error) => {
        if (version === saveVersion.current) reportSaveError(error);
        throw error;
      });
    await saveQueue.current;
  }
  async function preserveCurrentProject() {
    try {
      await flushCurrentProject();
      return true;
    } catch (error) {
      // A project switch is safe only once the complete workspace is durable.
      // A failed disk write must not trap the user in an inaccessible folder.
      if (!persistenceReady) throw error;
      await saveWorkspaceRecovery(state, projectId);
      reportSaveError(error);
      return false;
    }
  }
  async function openProjects() {
    if (!ready || projectBusy) return;
    setProjectBusy(true);
    setProjectMessage("");
    try {
      await preserveCurrentProject();
      setSavedProjects(await listProjects());
      setShowProjects(true);
      setMenuOpen(false);
    } catch (error) {
      setMessage(errorMessage(error));
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
    setPlaybackOnOpen(false);
    setMenuOpen(false);
    const url = new URL(window.location.href);
    for (const key of ["example", "view", "play"]) url.searchParams.delete(key);
    window.history.replaceState(window.history.state, "", url);
  }
  async function activateProject(entry: SavedProject) {
    const info = await getProjectFolderInfo(entry.id);
    ++saveVersion.current;
    lastSaved.current =
      !info ||
      (!info.hasRecovery && !info.error && info.permission === "granted")
        ? { id: entry.id, workspace: entry.workspace }
        : null;
    setProjectId(entry.id);
    setState(entry.workspace);
    reportFolder(info);
    setShowProjects(false);
    resetEditor();
  }
  async function createProject(name: string, parent: ProjectDirectoryHandle) {
    if (projectBusy || !createDraft)
      throw new Error(
        "Another project action is in progress. Please try again.",
      );
    setProjectBusy(true);
    try {
      const savedToFile = await preserveCurrentProject();
      const next = { ...structuredClone(createDraft.seed), name };
      const history = createDraft.revisions ?? [];
      const workspace: WorkspaceState = {
        version: 1,
        project: next,
        // A full imported history is retained without exceeding its file limit.
        revisions:
          history.length >= 250
            ? history
            : [
                ...history,
                checkpoint(
                  next,
                  createDraft.revisions
                    ? "Duplicated project"
                    : "Created project",
                ),
              ],
      };
      const entry = await createFolderProject(parent, name, workspace);
      await activateProject(entry);
      if (!savedToFile)
        setMessage(
          `Changes to ${project.name} are kept in this browser. Open it from Projects to finish saving its file.`,
        );
      setCreateDraft(null);
    } finally {
      setProjectBusy(false);
    }
  }
  async function openProject(entry: SavedProject) {
    if (projectBusy) return;
    setProjectBusy(true);
    setProjectMessage("");
    try {
      // Request permission directly from this click, before flushing other files.
      if (entry.folderName) await requestProjectFolderAccess(entry.id);
      const savedToFile = await preserveCurrentProject();
      await activateProject(await activateSavedProject(entry.id));
      if (!savedToFile && entry.id !== projectId)
        setMessage(
          `Changes to ${project.name} are kept in this browser. Open it from Projects to finish saving its file.`,
        );
    } catch (error) {
      setProjectMessage(errorMessage(error));
    } finally {
      setProjectBusy(false);
    }
  }
  async function openProjectFolder() {
    if (!ready || projectBusy) return;
    setProjectBusy(true);
    setProjectMessage("");
    setMenuOpen(false);
    try {
      // Native pickers need the activation from this click.
      const directory = await chooseProjectDirectory();
      if (!directory) return;
      const savedToFile = await preserveCurrentProject();
      await activateProject(await openFolderProject(directory));
      if (!savedToFile)
        setMessage(
          `Changes to ${project.name} are kept in this browser. Open it from Projects to finish saving its file.`,
        );
    } catch (error) {
      const description = errorMessage(error);
      setProjectMessage(description);
      setMessage(description);
    } finally {
      setProjectBusy(false);
    }
  }
  async function retrySave(reconnect = false) {
    if (projectBusy) return;
    if (!persistenceReady) {
      window.location.reload();
      return;
    }
    setProjectBusy(true);
    try {
      if (reconnect && !(await requestProjectFolderAccess(projectId)))
        throw new FolderStorageError(
          "permission",
          "Folder access was not granted. Reconnect the folder to save project.json.",
        );
      // A retry checks the file again even if this workspace was saved earlier.
      lastSaved.current = null;
      await flushCurrentProject();
    } catch (error) {
      reportSaveError(error);
    } finally {
      setProjectBusy(false);
    }
  }
  async function reloadFromFolder() {
    if (projectBusy) return;
    setProjectBusy(true);
    try {
      if (!(await requestProjectFolderAccess(projectId)))
        throw new FolderStorageError(
          "permission",
          "Folder access was not granted. Reconnect the folder to read project.json.",
        );
      if (saveTimer.current) clearTimeout(saveTimer.current);
      ++saveVersion.current;
      await saveQueue.current.catch(() => {});
      // This is the only action allowed to discard browser recovery, after confirmation.
      const entry = await loadSavedProject(projectId);
      await activateProject(entry);
      setReloadConfirm(false);
    } catch (error) {
      reportSaveError(error);
      setReloadConfirm(false);
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
    let renameAttempt: SavedProject | null = null;
    try {
      if (
        (name || duplicate) &&
        entry.folderName &&
        !(await requestProjectFolderAccess(entry.id))
      )
        throw new Error(
          "Reconnect this project's folder before renaming or duplicating it.",
        );
      await preserveCurrentProject();
      const fresh = (await listProjects()).find(
        (candidate) => candidate.id === entry.id,
      );
      if (!fresh)
        throw new Error(
          "This project is no longer available. Open its folder again.",
        );
      const info = await getProjectFolderInfo(entry.id);
      if ((name || duplicate) && info?.hasRecovery)
        throw new Error(
          "Open this project and save or recover its pending changes before renaming or duplicating it.",
        );
      const source =
        (name || duplicate) && info
          ? await loadSavedProject(entry.id, { discardRecovery: false })
          : fresh;
      const next = structuredClone(source);
      if (duplicate) {
        // The safe read may have adopted a newer file. Keep the editor's
        // source aligned with that acknowledged version, even on Cancel.
        if (source.id === projectId) {
          setState(source.workspace);
          lastSaved.current = { id: projectId, workspace: source.workspace };
          reportSaved(
            info
              ? { location: "folder", folderName: info.name }
              : { location: "browser" },
          );
        }
        setSavedProjects(await listProjects());
        next.workspace.project.name = `${next.workspace.project.name.slice(0, 75)} copy`;
        setCreateDraft({
          seed: next.workspace.project,
          revisions: next.workspace.revisions,
        });
        return;
      } else if (name) {
        next.workspace.project.name = name;
        if (next.workspace.revisions.length < 250)
          next.workspace.revisions.push(
            checkpoint(next.workspace.project, "Rename project"),
          );
      } else next.starred = !next.starred;
      next.updatedAt = new Date().toISOString();
      if (name) {
        renameAttempt = next;
        if (next.id === projectId) {
          setState(next.workspace);
          lastSaved.current = null;
          setStorage("Saving…");
        }
      }
      await updateSavedProject(next);
      if (next.id === projectId && name) {
        setState(next.workspace);
        lastSaved.current = { id: projectId, workspace: next.workspace };
        reportSaved(
          info
            ? { location: "folder", folderName: info.name }
            : { location: "browser" },
        );
      }
      setSavedProjects(await listProjects());
      setProjectMessage(
        name
          ? "Project renamed."
          : next.starred
            ? "Project starred."
            : "Star removed.",
      );
    } catch (error) {
      setProjectMessage(errorMessage(error));
      if (renameAttempt) {
        if (renameAttempt.id === projectId) reportSaveError(error);
        // The library must expose the new recovery revision after a failed write.
        const projects = await listProjects().catch(() => null);
        if (projects) setSavedProjects(projects);
      }
    } finally {
      setProjectBusy(false);
    }
  }
  const saveNotice = saveIssue ? (
    <FolderSaveNotice
      message={saveIssue.message}
      folderName={folderName}
      needsPermission={saveIssue.needsPermission}
      busy={projectBusy}
      onRetry={() => void retrySave()}
      onReconnect={() => void retrySave(true)}
      onReload={() => setReloadConfirm(true)}
      onExport={exportFile}
    />
  ) : null;
  const projectDialogs = (
    <>
      {createDraft ? (
        <CreateProjectDialog
          seed={createDraft.seed}
          onCreate={createProject}
          onClose={() => {
            if (!projectBusy) setCreateDraft(null);
          }}
        />
      ) : null}
      {reloadConfirm ? (
        <Dialog
          title="Reload from folder?"
          className="confirm-dialog"
          onClose={() => {
            if (!projectBusy) setReloadConfirm(false);
          }}
        >
          <p>
            This replaces the current project and revision history with{" "}
            <strong>{folderName}/project.json</strong>. Export a copy first to
            keep any changes that have not reached the file.
          </p>
          <div className="dialog-actions">
            <button
              className="btn"
              disabled={projectBusy}
              onClick={() => setReloadConfirm(false)}
            >
              Cancel
            </button>
            <button className="btn" disabled={projectBusy} onClick={exportFile}>
              Export local copy
            </button>
            <button
              className="btn btn-primary"
              disabled={projectBusy}
              onClick={() => void reloadFromFolder()}
            >
              {projectBusy ? "Reloading…" : "Reload file"}
            </button>
          </div>
        </Dialog>
      ) : null}
    </>
  );
  if (showProjects)
    return (
      <main className="workspace" data-theme={theme}>
        {saveNotice}
        <ProjectsPage
          projects={savedProjects}
          currentId={projectId}
          onOpen={(entry) => void openProject(entry)}
          onNew={() => setCreateDraft({ seed: blankProject() })}
          onOpenFolder={() => void openProjectFolder()}
          onTemplates={() => setTemplatesOpen(true)}
          onRename={(entry, name) => void editSavedProject(entry, name)}
          onDuplicate={(entry) => void editSavedProject(entry, undefined, true)}
          onStar={(entry) => void editSavedProject(entry)}
          onBack={() => setShowProjects(false)}
          theme={theme}
          onTheme={() => setTheme(theme === "light" ? "dark" : "light")}
          busy={projectBusy}
          message={projectMessage}
        />
        {projectDialogs}
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
      <header className="app-header" inert={!ready || projectBusy}>
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
                  disabled={!ready || projectBusy}
                  onClick={() => {
                    setCreateDraft({ seed: blankProject() });
                    setMenuOpen(false);
                  }}
                >
                  <FolderPlus size={15} />
                  Create project
                </button>
                <button
                  disabled={!ready || projectBusy}
                  onClick={() => void openProjectFolder()}
                >
                  <FolderOpen size={15} />
                  Open project folder
                </button>
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
      {saveNotice}
      <div
        className={`editor-body ${libraryOpen ? "with-library" : ""}`}
        inert={!ready || projectBusy}
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
                fitRequest={fitRequest}
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
              aria-label={assistantOpen ? "Close assistant" : "Open assistant"}
              title="Project CAD assistant · drag to dock in a corner"
              onClick={() => {
                if (!bubbleDrag.suppressClick()) {
                  if (window.matchMedia("(max-width: 760px)").matches)
                    setLibraryOpen(false);
                  setAssistantOpen(true);
                  setAssistantStarted(true);
                }
              }}
            >
              <MessageCircle size={21} />
            </button>
          ) : null}
          {assistantStarted ? (
            <div
              className="assistant-drawer"
              ref={assistantRef}
              style={{
                ...assistantDrag.style,
                display: assistantOpen ? undefined : "none",
              }}
            >
              <AssistantPanel
                key={projectId}
                projectId={projectId}
                project={project}
                folderName={folderName}
                appliedProposalIds={state.revisions.map(
                  (revision) => revision.id,
                )}
                onApply={applyAssistantProposal}
                onClose={() => setAssistantOpen(false)}
                dragProps={assistantDrag.dragProps}
                onError={setMessage}
              />
            </div>
          ) : null}
          <footer className="canvas-footer">
            <div className="canvas-status">
              <span className="save-status">
                {saveIssue ? <AlertCircle size={12} /> : <Check size={12} />}
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
      {projectDialogs}
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
              {folderName
                ? `This project and its revisions save to ${folderName}/project.json on your laptop.`
                : "This project and its revisions are saved in this browser. Create a project in a folder to save directly to your laptop."}{" "}
              Export a JSON copy to keep or share your work.
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
          title={
            folderName
              ? "Clear this project and its file?"
              : "Clear this device’s project?"
          }
          className="confirm-dialog"
          onClose={() => {
            if (!projectBusy) setClearConfirm(false);
          }}
        >
          <p>
            This removes the current project and its saved revision history.
            {folderName
              ? ` It also replaces ${folderName}/project.json with an empty project.`
              : ""}
            Export first if you want to keep a copy.
          </p>
          <div className="dialog-actions">
            <button
              className="btn"
              disabled={projectBusy}
              onClick={() => setClearConfirm(false)}
            >
              Cancel
            </button>
            <button className="btn" disabled={projectBusy} onClick={exportFile}>
              Export copy
            </button>
            <button
              className="btn btn-error"
              disabled={projectBusy}
              onClick={clearLocal}
            >
              Clear project
            </button>
          </div>
        </Dialog>
      ) : null}
    </main>
  );
}
