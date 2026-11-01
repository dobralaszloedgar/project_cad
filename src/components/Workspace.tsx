"use client";
import { defaultPackedBed } from "@/domain/reactions/schema";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  Download,
  Play,
  Box,
  PanelTop,
  Columns2,
  Info,
  Trash2,
  X,
  Home,
  Compass,
  ChevronRight,
  Thermometer,
  FlaskConical,
  Pencil,
  Maximize,
  Minimize,
  MessageCircle,
  Settings2,
  ChartNoAxesColumnIncreasing,
  CircleHelp,
  AlignHorizontalJustifyStart,
  Rainbow,
  HardDrive,
  Ruler,
} from "lucide-react";
import { useCanvasFullscreen } from "./useCanvasFullscreen";
import Dialog from "./Dialog";
import BrandMark from "./BrandMark";
import EquipmentLibrary from "./EquipmentLibrary";
import { EquipmentPanelIcon } from "./EquipmentIcon";
import Templates from "./Templates";
import { plantTemplate } from "@/domain/plant-templates";
import { arrangeFlowsheet } from "@/domain/flowsheet-layout";
import { availableEquipmentTag } from "@/domain/equipment-tags";
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
import { reactorExample } from "@/domain/examples";
import { loadTemplate } from "@/domain/templates";
import ThermodynamicSelector from "./ThermoSettings";
import ProjectComponents from "./ProjectComponents";
import {
  defaultThermo,
  modelInfo,
  type ThermoSettings,
} from "@/domain/thermo/registry";
import { mixtureName, thermoContext } from "@/domain/thermo/catalog";
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
  createProjectFile,
  moveProjectFile,
  scanProjectLibrary,
  connectProjectRoot,
  locateProjectFile,
  chooseProjectDirectory,
  createProjectLibraryFolder,
  type ProjectLibrary,
  activateSavedProject,
  loadSavedProject,
  getProjectFolderInfo,
  requestProjectFolderAccess,
  FolderStorageError,
  openExampleWorkspace,
  listProjects,
  updateSavedProject,
  trashSavedProject,
  restoreSavedProject,
  deleteSavedProject,
  type SavedProject,
  type SaveLocation,
  type ProjectDirectoryHandle,
  type ProjectFolderInfo,
} from "@/lib/storage";
import {
  getDefaultProjectDirectory,
  setDefaultProjectDirectory,
} from "@/lib/project-preferences";
import {
  projectDisplayName,
  projectLocation,
  serializeProjectFile,
} from "@/lib/project-file";
import { projectFileName } from "@/lib/project-directory";
import ProcessCanvas from "./ProcessCanvas";
import { EquipmentSimulationError } from "@/domain/solver";
import {
  equipmentStatuses,
  equipmentIssueTarget,
  simulationKey,
  type EquipmentTarget,
  type SimulationFailure,
} from "@/domain/equipment-status";
import Inspector from "./Inspector";
import Results from "./Results";
import FloatingAssistant from "./assistant/FloatingAssistant";
import KeyboardHelp from "./KeyboardHelp";
import ProjectStorageSettings from "./ProjectStorageSettings";
import UnitSettings from "./UnitSettings";
import { useUnitSystem } from "./useUnitSystem";
import { useTheme } from "./useTheme";
import { useCanvasSound } from "./useCanvasSound";
import CanvasSoundSettings, { CanvasSoundToggle } from "./CanvasSoundControls";
import { editSoundCue } from "@/lib/audio/edit-sound";
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
  "Equipment" | "Results" | "Units" | "Storage settings" | "Settings";
function savedMessage(location: SaveLocation) {
  return location.location === "folder"
    ? `Saved to ${location.folderName}/${location.fileName ?? "project.json"}`
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
  initialScreen = "editor",
  initialView = "2D",
  initialPlayback = false,
  initialArrange = false,
}: {
  exampleId?: string;
  initialScreen?: "projects" | "editor";
  initialView?: "2D" | "3D" | "Split";
  initialPlayback?: boolean;
  initialArrange?: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<WorkspaceState>(() => ({
    version: 1,
    project:
      (exampleId && (loadTemplate(exampleId) ?? plantTemplate(exampleId))) ||
      reactorExample(),
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
  const [graphicsSettingsContainer, setGraphicsSettingsContainer] =
    useState<HTMLDivElement | null>(null);
  const [fitRequest, setFitRequest] = useState(0);
  const [playbackOnOpen, setPlaybackOnOpen] = useState(initialPlayback);
  const [tab, setTab] = useState("Results");
  const [compareId, setCompareId] = useState("");
  const [simulation, setSimulation] = useState<{
    projectId: string;
    key: string;
    result: Result | null;
    failure?: SimulationFailure;
  } | null>(null);
  const [issueTarget, setIssueTarget] = useState<EquipmentTarget | undefined>(
    undefined,
  );
  const [message, setMessage] = useState("");
  const { theme: palette, setTheme } = useTheme();
  const unitDisplay = useUnitSystem();
  const theme = palette.mode;
  const sound = useCanvasSound();
  const [clearConfirm, setClearConfirm] = useState(false);
  const [drawer, setDrawer] = useState<WorkspacePanel | null>(null);
  const [thermoDialog, setThermoDialog] = useState<
    "model" | "components" | null
  >(null);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const assistantApplyLock = useRef(false);
  useEffect(() => {
    if (!assistantOpen) return;
    const mobile = window.matchMedia("(max-width: 760px)");
    const onResize = (event: MediaQueryListEvent) => {
      if (event.matches) setDrawer(null);
    };
    mobile.addEventListener("change", onResize);
    return () => mobile.removeEventListener("change", onResize);
  }, [assistantOpen]);
  const handleAssistantOpenChange = useCallback((open: boolean) => {
    setAssistantOpen(open);
    if (open && window.matchMedia("(max-width: 760px)").matches)
      setDrawer(null);
  }, []);
  const [compositionColors, setCompositionColors] = useState(true);
  const [projectId, setProjectId] = useState(
    initialScreen === "projects" ? "" : "main",
  );
  const [showProjects, setShowProjects] = useState(
    initialScreen === "projects",
  );
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);
  const [library, setLibrary] = useState<ProjectLibrary | null>(null);
  const libraryRefreshing = useRef(false);
  const [projectBusy, setProjectBusy] = useState(false);
  const [projectMessage, setProjectMessage] = useState("");
  const [folderName, setFolderName] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | undefined>();
  const [saveIssue, setSaveIssue] = useState<{
    message: string;
    needsPermission: boolean;
  } | null>(null);
  const [persistenceReady, setPersistenceReady] = useState(false);
  const [createDraft, setCreateDraft] = useState<{
    seed: Project;
    revisions?: Revision[];
    directory?: ProjectDirectoryHandle;
  } | null>(null);
  const [reloadConfirm, setReloadConfirm] = useState(false);
  const [saveFolderDraft, setSaveFolderDraft] = useState<SavedProject | null>(
    null,
  );
  const canvasRef = useRef<HTMLElement>(null);
  const { isFullscreen, isViewportFullscreen, toggleFullscreen } =
    useCanvasFullscreen(canvasRef, setMessage);
  const saveQueue = useRef(Promise.resolve());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveVersion = useRef(0);
  const project = useMemo(
    () => projectSchema.parse(state.project),
    [state.project],
  );
  const calculationKey = useMemo(() => simulationKey(project), [project]);
  const currentSimulation =
    simulation?.projectId === projectId && simulation.key === calculationKey
      ? simulation
      : null;
  const result = currentSimulation?.result ?? null;
  const failure = currentSimulation?.failure;
  const statuses = useMemo(
    () =>
      equipmentStatuses(
        project,
        result,
        failure,
        simulation?.projectId === projectId ? simulation.result : null,
      ),
    [project, result, failure, simulation, projectId],
  );
  function calculate(next: Project) {
    try {
      const result = simulate(next);
      setSimulation({ projectId, key: simulationKey(next), result });
      return result;
    } catch (error) {
      setSimulation({
        projectId,
        key: simulationKey(next),
        result: null,
        failure: {
          message: errorMessage(error),
          unitId:
            error instanceof EquipmentSimulationError
              ? error.unitId
              : undefined,
        },
      });
      throw error;
    }
  }
  const displayProjectName = projectDisplayName({ fileName, workspace: state });
  useEffect(() => {
    document.title = `Project CAD – ${!ready || showProjects ? "Home" : displayProjectName}`;
  }, [ready, showProjects, displayProjectName]);
  const pullTabRef = useRef<HTMLButtonElement>(null);
  const unitsButtonRef = useRef<HTMLButtonElement>(null);
  const workspaceMenuRef = useRef<HTMLDivElement>(null);
  const workspaceMenuPinned = useRef(false);
  function closeWorkspaceMenu() {
    workspaceMenuPinned.current = false;
    setWorkspaceMenuOpen(false);
  }
  function openPanel(panel: WorkspacePanel) {
    closeWorkspaceMenu();
    if (panel === "Results") setTab("Results");
    setDrawer(panel);
    if (window.matchMedia("(max-width: 760px)").matches)
      setAssistantOpen(false);
  }
  function openThermodynamics(section: "model" | "components") {
    closeWorkspaceMenu();
    setDrawer(null);
    setThermoDialog(section);
  }
  function applyThermodynamics(settings: ThermoSettings) {
    change(
      applyActions(project, {
        summary: "Change thermodynamics and components",
        actions: [{ type: "set_thermo_model", ...settings }],
      }),
      `Model: ${modelInfo(settings.modelId).name}`,
    );
    setThermoDialog(null);
  }
  function closeDrawer() {
    const trigger = drawer === "Units" ? unitsButtonRef : pullTabRef;
    setDrawer(null);
    requestAnimationFrame(() => trigger.current?.focus());
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
      closeWorkspaceMenu();
      setDrawer(null);
      (drawer === "Units" ? unitsButtonRef : pullTabRef).current?.focus();
    }
    function onPointerDown(event: PointerEvent) {
      if (
        workspaceMenuOpen &&
        !workspaceMenuRef.current?.contains(event.target as Node) &&
        !pullTabRef.current?.contains(event.target as Node)
      )
        closeWorkspaceMenu();
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [drawer, workspaceMenuOpen]);
  const lastSaved = useRef<{ id: string; workspace: WorkspaceState } | null>(
    null,
  );
  const reportSaved = useCallback((location: SaveLocation) => {
    setStorage(savedMessage(location));
    setFolderName(location.folderName ?? null);
    setFileName(location.fileName);
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
      setFileName(info?.fileName);
      if (
        info &&
        (info.error || info.hasRecovery || info.permission !== "granted")
      ) {
        const description =
          info.error ??
          (info.permission !== "granted"
            ? "Reconnect the folder to save the project file. Your current work is available in this browser."
            : "Changes in this browser have not been saved to the project file. Retry saving or reload the file.");
        setStorage("Could not finish saving");
        setSaveIssue({
          message: description,
          needsPermission: info.permission !== "granted",
        });
      } else
        reportSaved(
          info
            ? {
                location: "folder",
                folderName: info.name,
                fileName: info.fileName,
              }
            : { location: "browser" },
        );
    },
    [reportSaved],
  );
  useEffect(() => {
    let active = true;
    const example = exampleId
      ? (loadTemplate(exampleId) ?? plantTemplate(exampleId))
      : undefined;
    const opening = (async () => {
      const directory = await getDefaultProjectDirectory().catch(() => null);
      if (directory) await connectProjectRoot(directory);
      const scanned = await scanProjectLibrary();
      if (active) {
        setLibrary(scanned);
        setSavedProjects(scanned.projects);
      }
    })().then(() =>
      example && exampleId
        ? openExampleWorkspace(exampleId, {
            version: 1,
            project: example,
            revisions: [checkpoint(example, "Created from example")],
          })
        : loadActiveWorkspace(),
    );
    opening
      .then(async ({ workspace: saved, projectId: activeId }) => {
        // Opening the dashboard must not create a sample project in storage.
        const id = initialScreen === "projects" && !saved ? "" : activeId;
        const info = await getProjectFolderInfo(id);
        if (!active) return;
        const initialProject = id
          ? (example ?? reactorExample())
          : blankProject();
        let workspace = saved ?? {
          version: 1 as const,
          project: initialProject,
          revisions: id ? [checkpoint(initialProject, "Initial example")] : [],
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
        if (!id) {
          setSavedProjects(await listProjects());
          if (!active) return;
          setShowProjects(true);
        }
        setDrawer(null);
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
        if (workspace !== saved && id) setStorage("Saving…");
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
  }, [exampleId, initialArrange, initialScreen, reportFolder, reportSaveError]);
  useEffect(() => {
    if (
      !ready ||
      !persistenceReady ||
      projectBusy ||
      !projectId ||
      showProjects
    )
      return;
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
    showProjects,
    reportSaved,
    reportSaveError,
  ]);
  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (
        ready &&
        !showProjects &&
        projectId &&
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
  }, [ready, saveIssue, projectId, state, showProjects]);
  function change(
    next: Project,
    label: string,
    run = false,
    recordHistory = true,
  ) {
    if (!ready || projectBusy || assistantApplyLock.current) return;
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
      setMessage("");
      if (run) {
        try {
          const r = calculate(next);
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
  function edit(next: Project, label: string, run = false) {
    if (!change(next, label, run)) return false;
    const cue = editSoundCue(project, next);
    if (cue) sound.play(cue);
    return true;
  }
  function add(kind: Kind, position?: { x: number; y: number }) {
    const id = availableEquipmentTag(kind, project.units);
    const unit = newUnit(
      kind,
      id,
      position?.x ?? 200 + (project.units.length % 4) * 180,
      position?.y ?? 350 + Math.floor(project.units.length / 4) * 100,
    );
    if (kind === "PBR") {
      const settings = project.thermo ?? defaultThermo;
      const ids =
        settings.mixture === "catalog" && !settings.catalog
          ? []
          : thermoContext(settings).ids;
      unit.params.packedBed = defaultPackedBed(ids);
    }
    if (edit({ ...project, units: [...project.units, unit] }, `Add ${kind}`))
      setSelected(id);
  }
  function run() {
    sound.prepareSimulation();
    try {
      const calculated = calculate(project);
      sound.playSimulation(calculated.converged ? "complete" : "attention");
      setMessage(
        calculated.converged
          ? "Calculated · review model limits in Results."
          : "Recycle did not converge. Final iterate only.",
      );
      setTab("Results");
      setWorkspaceMenuOpen(false);
      setDrawer("Results");
    } catch (e) {
      sound.playSimulation("attention");
      setMessage(e instanceof Error ? e.message : "Simulation failed.");
    }
  }
  function loadExample(name: string) {
    const next = name === "empty" ? blankProject() : loadTemplate(name);
    if (!next) {
      setMessage("This template is unavailable.");
      return;
    }
    setTemplatesOpen(false);
    setCreateDraft({ seed: next });
  }
  function exportFile() {
    const now = new Date().toISOString();
    const text = serializeProjectFile({
      format: "project-cad",
      formatVersion: 1,
      projectId: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      workspace: state,
    });
    const blob = new Blob([text], {
        type: "application/json",
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    try {
      a.download = projectFileName(
        projectDisplayName({ fileName, workspace: state }),
      );
    } catch {
      a.download = "Project.pcad";
    }
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
            ? "Applied and saved to the project file."
            : "Applied and saved on this device.";
      } catch (error) {
        await saveWorkspaceRecovery(next, projectId);
        reportSaveError(error);
        outcome =
          "Applied and saved to local recovery. The folder save needs attention.";
      }
      editHistory.current = {
        past: [...editHistory.current.past, project],
        future: [],
      };
      setState(next);
      setSelected(null);
      setMessage(outcome);
      return outcome;
    } finally {
      assistantApplyLock.current = false;
      setProjectBusy(false);
    }
  }
  function inspect(id: string) {
    setIssueTarget(undefined);
    setSelected(id);
    setPropertiesOpen(true);
  }
  const navigateIssue = useCallback((id: string, target: EquipmentTarget) => {
    setSelection([id]);
    setWorkspaceMenuOpen(false);
    if (target.section === "thermodynamics") {
      setPropertiesOpen(false);
      setThermoDialog(target.field === "components" ? "components" : "model");
    } else {
      setIssueTarget(target);
      setPropertiesOpen(true);
    }
  }, []);
  function openResults(nextTab = "Results") {
    setTab(nextTab);
    setWorkspaceMenuOpen(false);
    setDrawer("Results");
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
      editHistory.current = { past: [], future: [] };
      setSimulation(null);
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
    if (!projectId) return;
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
  async function openLanding() {
    if (!ready || projectBusy) return;
    setProjectBusy(true);
    try {
      await preserveCurrentProject();
      router.push("/");
    } catch (error) {
      setMessage(errorMessage(error));
      setProjectMessage(errorMessage(error));
    } finally {
      setProjectBusy(false);
    }
  }
  async function openProjects() {
    if (!ready || projectBusy) return;
    setProjectBusy(true);
    setProjectMessage("");
    try {
      await preserveCurrentProject();
      await refreshLibrarySnapshot();
      setShowProjects(true);
      const url = new URL(window.location.href);
      for (const key of ["example", "view", "play", "arrange"])
        url.searchParams.delete(key);
      url.searchParams.set("home", "1");
      window.history.replaceState(window.history.state, "", url);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setProjectBusy(false);
    }
  }
  async function refreshLibrarySnapshot() {
    const scanned = await scanProjectLibrary();
    setLibrary(scanned);
    setSavedProjects(scanned.projects);
    if (scanned.errors.length) setProjectMessage(scanned.errors.join(" "));
    return scanned;
  }
  async function refreshProjectFiles() {
    if (!ready || projectBusy || libraryRefreshing.current) return;
    libraryRefreshing.current = true;
    setProjectBusy(true);
    setProjectMessage("");
    try {
      await preserveCurrentProject();
      await refreshLibrarySnapshot();
      if (projectId) {
        const info = await getProjectFolderInfo(projectId);
        reportFolder(info);
        if (info?.hasRecovery && !info.error && info.permission === "granted")
          await flushCurrentProject();
      }
    } catch (error) {
      setProjectMessage(errorMessage(error));
    } finally {
      libraryRefreshing.current = false;
      setProjectBusy(false);
    }
  }
  useEffect(() => {
    const refresh = () => {
      if (
        document.visibilityState === "visible" &&
        !document.querySelector("dialog[open]")
      )
        void refreshProjectFiles();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("project-cad-folders-changed", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("project-cad-folders-changed", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  });
  async function connectFolder() {
    if (projectBusy) return;
    try {
      const directory = await chooseProjectDirectory();
      if (!directory) return;
      setProjectBusy(true);
      await preserveCurrentProject();
      await connectProjectRoot(directory);
      await setDefaultProjectDirectory(directory);
      setProjectMessage("");
      await refreshLibrarySnapshot();
    } catch (error) {
      setProjectMessage(errorMessage(error));
    } finally {
      setProjectBusy(false);
    }
  }
  async function locateProject(id: string) {
    if (projectBusy) return;
    try {
      const directory = await chooseProjectDirectory();
      if (!directory) return;
      setProjectBusy(true);
      await preserveCurrentProject();
      const found = await locateProjectFile(id, directory);
      await refreshLibrarySnapshot();
      if (id === projectId) {
        reportFolder(await getProjectFolderInfo(id));
        await flushCurrentProject();
      }
      setProjectMessage(`Reconnected ${projectLocation(found)}.`);
    } catch (error) {
      setProjectMessage(errorMessage(error));
      if (id === projectId) reportSaveError(error);
    } finally {
      setProjectBusy(false);
    }
  }
  async function newLibraryFolder(
    directory: ProjectDirectoryHandle,
    name: string,
  ) {
    if (projectBusy) throw new Error("Another project action is in progress.");
    setProjectBusy(true);
    try {
      if (
        (await directory.requestPermission({ mode: "readwrite" })) !== "granted"
      )
        throw new Error("Allow folder access to create a folder.");
      await createProjectLibraryFolder(directory, name);
      await refreshLibrarySnapshot();
    } finally {
      setProjectBusy(false);
    }
  }
  function resetEditor({ keepDashboard = false } = {}) {
    editHistory.current = { past: [], future: [] };
    setDrawer(null);
    setWorkspaceMenuOpen(false);
    setSelected(null);
    setSimulation(null);
    setCompareId("");
    setMessage("");
    setPropertiesOpen(false);
    setTemplatesOpen(false);
    setAssistantOpen(false);
    setView("2D");
    setPlaybackOnOpen(false);
    const url = new URL(window.location.href);
    for (const key of ["example", "view", "play"]) url.searchParams.delete(key);
    if (!keepDashboard) url.searchParams.delete("home");
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
      const entry = await createProjectFile(parent, name, workspace);
      // A saved file is still a success if remembering its location fails.
      const remembered = await setDefaultProjectDirectory(parent).then(
        () => true,
        () => false,
      );
      await activateProject(entry);
      const notices = [];
      if (!savedToFile)
        notices.push(
          `Changes to ${project.name} are kept in this browser. Open it from Projects to finish saving its file.`,
        );
      if (!remembered)
        notices.push(
          "Project saved. This browser could not remember the folder for your next project.",
        );
      if (notices.length) setMessage(notices.join(" "));
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
  async function changeProjectFolder(
    name: string,
    parent: ProjectDirectoryHandle,
  ) {
    if (projectBusy || !saveFolderDraft)
      throw new Error(
        "Another project action is in progress. Please try again.",
      );
    setProjectBusy(true);
    try {
      if (saveFolderDraft.folderName)
        await requestProjectFolderAccess(saveFolderDraft.id);
      await preserveCurrentProject();
      const saved = await moveProjectFile(saveFolderDraft.id, parent, name);
      if (saveFolderDraft.id === projectId) {
        ++saveVersion.current;
        setProjectId(saved.id);
        setState(saved.workspace);
        lastSaved.current = { id: saved.id, workspace: saved.workspace };
        reportSaved({
          location: "folder",
          folderName: saved.folderName,
          fileName: saved.fileName,
        });
      }
      await refreshLibrarySnapshot();
      setProjectMessage(
        `Saved to ${projectLocation(saved)}. Future changes save here automatically.`,
      );
      setSaveFolderDraft(null);
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
          "Folder access was not granted. Reconnect the folder to save the project file.",
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
          "Folder access was not granted. Reconnect the folder to read the project file.",
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
              ? {
                  location: "folder",
                  folderName: info.name,
                  fileName: info.fileName,
                }
              : { location: "browser" },
          );
        }
        setSavedProjects(await listProjects());
        next.workspace.project.name = `${projectDisplayName(source).slice(0, 75)} copy`;
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
        if (next.id === projectId && !next.fileName) {
          setState(next.workspace);
          lastSaved.current = null;
          setStorage("Saving…");
        }
      }
      const updated = await updateSavedProject(next, { rename: Boolean(name) });
      if (next.id === projectId && name) {
        setState(updated.workspace);
        lastSaved.current = { id: projectId, workspace: updated.workspace };
        reportSaved(
          info
            ? {
                location: "folder",
                folderName: updated.folderName,
                fileName: updated.fileName,
              }
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
  async function manageProjectTrash(
    entry: SavedProject,
    action: "trash" | "restore" | "delete",
  ): Promise<boolean> {
    if (projectBusy) return false;
    setProjectBusy(true);
    setProjectMessage("");
    try {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      ++saveVersion.current;
      await saveQueue.current.catch(() => {});
      if (action === "trash") {
        if (entry.id === projectId) await preserveCurrentProject();
        const active = await trashSavedProject(entry.id);
        if (entry.id === projectId) {
          const workspace: WorkspaceState = active?.workspace ?? {
            version: 1,
            project: blankProject(),
            revisions: [],
          };
          const id = active?.id ?? "";
          lastSaved.current = { id, workspace };
          setProjectId(id);
          setState(workspace);
          resetEditor({ keepDashboard: true });
          reportFolder(
            id ? await getProjectFolderInfo(id).catch(() => null) : null,
          );
        }
      } else if (action === "restore") {
        await restoreSavedProject(entry.id);
      } else {
        await deleteSavedProject(entry.id);
      }
      setSavedProjects(await listProjects());
      setProjectMessage(
        action === "trash"
          ? `“${entry.workspace.project.name}” moved to Trash.`
          : action === "restore"
            ? `“${entry.workspace.project.name}” restored to Home.`
            : `“${entry.workspace.project.name}” permanently deleted${entry.folderName ? " from disk" : ""}.`,
      );
      return true;
    } catch (error) {
      setProjectMessage(errorMessage(error));
      return false;
    } finally {
      setProjectBusy(false);
    }
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
      if (edit(next.project, label)) setSelection(next.selection);
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
      if (thermoDialog === "model") return;
      if (isCloseKey(event) && !document.querySelector("dialog[open]")) {
        event.preventDefault();
        if (assistantOpen) setAssistantOpen(false);
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
              edit(deleteSelection(project, selection), "Cut selection")
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
          edit(deleteSelection(project, selection), "Delete selection")
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
  const saveNotice = saveIssue ? (
    <FolderSaveNotice
      message={saveIssue.message}
      folderName={folderName}
      fileName={fileName}
      needsPermission={saveIssue.needsPermission}
      busy={projectBusy}
      onRetry={() => void retrySave()}
      onReconnect={() => void retrySave(true)}
      onReload={() => setReloadConfirm(true)}
      onExport={exportFile}
      onLocate={() => void locateProject(projectId)}
    />
  ) : null;
  const projectDialogs = (
    <>
      {saveFolderDraft ? (
        <CreateProjectDialog
          seed={{
            ...saveFolderDraft.workspace.project,
            name: projectDisplayName(saveFolderDraft),
          }}
          saveLocation
          moving={!!saveFolderDraft.folderName}
          onCreate={changeProjectFolder}
          onClose={() => {
            if (!projectBusy) setSaveFolderDraft(null);
          }}
        />
      ) : null}
      {createDraft ? (
        <CreateProjectDialog
          seed={createDraft.seed}
          initialDirectory={createDraft.directory}
          onCreate={createProject}
          onClose={() => {
            if (!projectBusy) {
              setCreateDraft(null);
              void refreshLibrarySnapshot().catch((error) =>
                setProjectMessage(errorMessage(error)),
              );
            }
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
            <strong>
              {folderName}/{fileName ?? "project.json"}
            </strong>
            . Export a copy first to keep any changes that have not reached the
            file.
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
      <main className="workspace" data-theme={theme} data-palette={palette.id}>
        <ProjectsPage
          projects={savedProjects}
          roots={library?.roots ?? []}
          folders={library?.folders ?? []}
          currentId={projectId}
          onOpen={(entry) => void openProject(entry)}
          onNew={(directory) =>
            setCreateDraft({ seed: blankProject(), directory })
          }
          onTemplates={() => setTemplatesOpen(true)}
          onRename={(entry, name) => void editSavedProject(entry, name)}
          onDuplicate={(entry) => void editSavedProject(entry, undefined, true)}
          onStar={(entry) => void editSavedProject(entry)}
          onTrash={(entry) => void manageProjectTrash(entry, "trash")}
          onRestore={(entry) => void manageProjectTrash(entry, "restore")}
          onDelete={(entry) => manageProjectTrash(entry, "delete")}
          onBack={() => {
            const url = new URL(window.location.href);
            url.searchParams.delete("home");
            window.history.replaceState(window.history.state, "", url);
            setShowProjects(false);
          }}
          onLanding={() => void openLanding()}
          palette={palette.id}
          onPalette={setTheme}
          onSaveFolder={setSaveFolderDraft}
          onRefresh={() => void refreshProjectFiles()}
          onConnectFolder={() => void connectFolder()}
          onLocate={(entry) => void locateProject(entry.id)}
          onNewFolder={newLibraryFolder}
          busy={projectBusy || !ready}
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
    <main className="workspace" data-theme="light" data-palette="light">
      <header
        className="app-header"
        inert={!ready || projectBusy || isViewportFullscreen}
      >
        <button
          className="brand"
          onClick={() => void openProjects()}
          aria-label="Project CAD home"
        >
          <BrandMark size={29} />
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
            aria-label="Landing page"
            title="Landing page"
            onClick={() => void openLanding()}
          >
            <Compass size={18} />
          </button>
        </div>
        <div className="project-heading">
          <h1>{projectDisplayName({ fileName, workspace: state })}</h1>
        </div>
        <div className="header-actions">
          <CanvasSoundToggle sound={sound} />
          {view !== "2D" && !isFullscreen ? (
            <div ref={setGraphicsSettingsContainer} />
          ) : null}
          <ThermodynamicSelector
            key={`${projectId}:${state.revisions.length}`}
            settings={project.thermo ?? defaultThermo}
            open={thermoDialog === "model"}
            onOpenChange={(open) =>
              open ? openThermodynamics("model") : setThermoDialog(null)
            }
            onApply={applyThermodynamics}
            onError={setMessage}
          />
          <button
            className="species-count"
            aria-label="Project components"
            aria-haspopup="dialog"
            title={`Components: ${mixtureName(project.thermo ?? defaultThermo)}`}
            onClick={() => openThermodynamics("components")}
          >
            <FlaskConical size={16} />
            <span>
              {project.thermo?.mixture === "catalog"
                ? (project.thermo.catalog?.chemicals.length ?? 0)
                : 2}
            </span>
          </button>
          <button
            ref={unitsButtonRef}
            className="icon-button units-button"
            aria-label="Units"
            aria-haspopup="dialog"
            aria-expanded={drawer === "Units"}
            aria-controls="workspace-units-panel"
            title={`Engineering units: ${unitDisplay.label}`}
            onClick={() =>
              drawer === "Units" ? closeDrawer() : openPanel("Units")
            }
          >
            <Ruler size={16} aria-hidden="true" />
          </button>
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
      </header>
      {saveNotice}
      <div className="editor-body" inert={!ready || projectBusy}>
        <section
          className={`canvas-panel${isViewportFullscreen ? " canvas-panel-fullscreen" : ""}`}
          ref={canvasRef}
          tabIndex={-1}
          aria-label="Process canvas"
        >
          <div
            ref={workspaceMenuRef}
            className="workspace-utilities"
            data-open={workspaceMenuOpen}
            onPointerEnter={(event) => {
              if (event.pointerType === "mouse") setWorkspaceMenuOpen(true);
            }}
            onPointerLeave={() => {
              if (
                !workspaceMenuPinned.current &&
                !workspaceMenuRef.current?.contains(document.activeElement)
              )
                closeWorkspaceMenu();
            }}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget))
                closeWorkspaceMenu();
            }}
          >
            <button
              ref={pullTabRef}
              className={`workspace-pull-tab ${workspaceMenuOpen ? "active" : ""}`}
              aria-label="Workspace menu"
              title="Workspace menu"
              aria-expanded={workspaceMenuOpen}
              aria-controls="workspace-menu"
              onClick={() => {
                workspaceMenuPinned.current = !workspaceMenuPinned.current;
                setWorkspaceMenuOpen(workspaceMenuPinned.current);
                setDrawer(null);
              }}
            >
              <Settings2 size={16} aria-hidden="true" />
              <ChevronRight size={12} aria-hidden="true" />
            </button>
            {workspaceMenuOpen ? (
              <nav
                id="workspace-menu"
                className="workspace-menu"
                aria-label="Workspace"
              >
                <h2>Workspace</h2>
                {[
                  { name: "Equipment", icon: EquipmentPanelIcon },
                  { name: "Results", icon: ChartNoAxesColumnIncreasing },
                  { name: "Components", icon: FlaskConical },
                  { name: "Thermodynamics", icon: Thermometer },
                  { name: "Toggle chat", icon: MessageCircle },
                  { name: "Storage settings", icon: HardDrive },
                  { name: "Settings", icon: Settings2 },
                ].map(({ name, icon: Icon }) => (
                  <button
                    key={name}
                    onClick={() => {
                      pullTabRef.current?.focus();
                      if (name === "Toggle chat") {
                        closeWorkspaceMenu();
                        handleAssistantOpenChange(!assistantOpen);
                      } else if (
                        name === "Components" ||
                        name === "Thermodynamics"
                      ) {
                        openThermodynamics(
                          name === "Components" ? "components" : "model",
                        );
                      } else openPanel(name as WorkspacePanel);
                    }}
                  >
                    <Icon size={17} />
                    <span>{name}</span>
                    <ChevronRight size={13} aria-hidden="true" />
                  </button>
                ))}
              </nav>
            ) : null}
          </div>
          {drawer && drawer !== "Units" ? (
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
                      {drawer === "Settings" ? (
                        <>
                          <CanvasSoundSettings sound={sound} />
                          <div className="preference-section">
                            <h3>Engineering units</h3>
                            <p>
                              {unitDisplay.label} · Choose units for equipment
                              inputs and calculated results.
                            </p>
                            <button
                              className="btn"
                              onClick={() => openPanel("Units")}
                            >
                              <Ruler size={15} /> Configure units
                            </button>
                          </div>
                          <div className="preference-section">
                            <h3>Assistant</h3>
                            <p>
                              Open the assistant or bring back a hidden chat
                              bubble.
                            </p>
                            <button
                              className="btn"
                              onClick={() => {
                                setDrawer(null);
                                handleAssistantOpenChange(true);
                              }}
                            >
                              <MessageCircle size={15} /> Show assistant
                            </button>
                          </div>
                        </>
                      ) : null}
                      {drawer === "Storage settings" ||
                      drawer === "Settings" ? (
                        <div className="preference-section">
                          <ProjectStorageSettings />
                          <h3>Local project</h3>
                          <p>
                            {folderName
                              ? `This project and its revisions save to ${folderName}/${fileName ?? "project.json"} on your laptop.`
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
                {view !== "2D" && isFullscreen ? (
                  <div ref={setGraphicsSettingsContainer} />
                ) : null}
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
                  aria-label={
                    isFullscreen ? "Exit full screen" : "Maximize canvas"
                  }
                  aria-pressed={isFullscreen}
                  title={
                    isFullscreen
                      ? "Exit full screen (Esc)"
                      : "Full screen (F11)"
                  }
                  onClick={toggleFullscreen}
                >
                  {isFullscreen ? (
                    <Minimize size={16} />
                  ) : (
                    <Maximize size={16} />
                  )}
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
                fitRequest={fitRequest}
                selected={selected}
                selection={selection}
                onSelection={setSelection}
                onInspect={inspect}
                statuses={statuses}
                onNavigateIssue={navigateIssue}
                onChange={edit}
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
                dark={false}
                canvasColor="#fafbf9"
                project={project}
                result={result}
                selected={selected}
                onSelect={setSelected}
                graphicsSettingsContainer={graphicsSettingsContainer}
              />
            ) : view !== "2D" ? (
              <div className="empty-state">Opening 3D project…</div>
            ) : null}
          </div>
          {message ? (
            <div className="notification" role="status">
              <Info size={15} />
              <span>{message}</span>
              {failure?.unitId && (
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() =>
                    navigateIssue(
                      failure.unitId!,
                      equipmentIssueTarget(failure.message),
                    )
                  }
                >
                  Review error
                </button>
              )}
              <button
                className="icon-button"
                aria-label="Dismiss notification"
                onClick={() => setMessage("")}
              >
                <X size={14} />
              </button>
            </div>
          ) : null}
          <FloatingAssistant
            key={projectId}
            containerRef={canvasRef}
            controlsRef={workspaceMenuRef}
            open={assistantOpen}
            onOpenChange={handleAssistantOpenChange}
            projectId={projectId}
            project={project}
            folderName={folderName}
            appliedProposalIds={state.revisions.map((revision) => revision.id)}
            onApply={applyAssistantProposal}
            onError={setMessage}
          />
          <span className="save-status sr-only" aria-live="polite">
            {storage}
          </span>
        </section>
      </div>
      {helpOpen ? <KeyboardHelp onClose={() => setHelpOpen(false)} /> : null}
      {projectDialogs}
      {drawer === "Units" ? (
        <Dialog
          title="Engineering units"
          className="units-dialog"
          onClose={closeDrawer}
        >
          <UnitSettings />
        </Dialog>
      ) : null}
      {thermoDialog === "components" ? (
        <Dialog
          title="Project components"
          className="components-dialog"
          onClose={() => setThermoDialog(null)}
        >
          <ProjectComponents
            project={project}
            onCancel={() => setThermoDialog(null)}
            onApply={applyThermodynamics}
          />
        </Dialog>
      ) : null}
      {propertiesOpen ? (
        <Dialog
          title={
            selectedUnit
              ? `${selectedUnit.name} · ${selectedUnit.id}`
              : (project.edges.find((edge) => edge.id === selected)?.name ??
                "Stream properties")
          }
          className={`properties-dialog${selectedUnit ? " equipment-editor-dialog" : ""}`}
          onClose={() => {
            setPropertiesOpen(false);
            setIssueTarget(undefined);
          }}
        >
          <Inspector
            project={project}
            selected={selected}
            result={result}
            issueTarget={issueTarget}
            status={selectedUnit ? statuses[selectedUnit.id] : undefined}
            onNavigateIssue={(target) =>
              selected && navigateIssue(selected, target)
            }
            onChange={(p, l) => {
              edit(p, l, true);
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
              ? ` It also replaces ${folderName}/${fileName ?? "project.json"} with an empty project.`
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
