// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Folder,
  FolderOpen,
  Star,
  Search,
  LayoutGrid,
  LayoutTemplate,
  List,
  ChevronDown,
  ArrowDownWideNarrow,
  MoreHorizontal,
  FileBox,
  Copy,
  Pencil,
  ArrowLeft,
  Compass,
  Home,
  Palette,
  HardDrive,
  X,
  Info,
  Trash2,
  RotateCcw,
  RefreshCw,
  FolderPlus,
} from "lucide-react";
import type {
  SavedProject,
  ProjectRoot,
  ProjectLibraryFolder,
  ProjectDirectoryHandle,
} from "@/lib/storage";
import { projectDisplayName, projectLocation } from "@/lib/project-file";
import { type Project } from "@/domain/schema";
import { arrangeFlowsheet } from "@/domain/flowsheet-layout";
import { EquipmentIcon } from "./EquipmentIcon";
import { equipmentPort, equipmentSize } from "./flow-geometry";
import { routeStreams, type StreamConnection } from "./stream-routing";
import Dialog from "./Dialog";
import BrandMark from "./BrandMark";
import ThemePicker from "./ThemePicker";
import {
  connectedUnitPorts,
  junctionBranchCount,
  portIndex,
} from "@/domain/material-ports";
import ProjectStorageSettings from "./ProjectStorageSettings";
import ProjectContextMenu from "./ProjectContextMenu";
import CreateFolderDialog from "./CreateFolderDialog";
import folderStyles from "./CreateProjectDialog.module.css";

function previewGeometry(project: Project) {
  const boxes = (source: Project) =>
    source.units.map((unit) => ({
      id: unit.id,
      ...unit.position,
      ...equipmentSize(unit.kind, unit.params.trayCount),
    }));
  const original = boxes(project);
  const overlapping = original.some((a, index) =>
    original
      .slice(index + 1)
      .some(
        (b) =>
          a.x < b.x + b.width + 12 &&
          a.x + a.width + 12 > b.x &&
          a.y < b.y + b.height + 12 &&
          a.y + a.height + 12 > b.y,
      ),
  );
  // A thumbnail can tidy overlapping equipment without changing saved positions.
  const preview = overlapping
    ? arrangeFlowsheet(project, { width: 1440, height: 900 })
    : project;
  const units = new Map(preview.units.map((unit) => [unit.id, unit]));
  const connections: StreamConnection[] = [];
  for (const edge of preview.edges) {
    const source = units.get(edge.source),
      target = units.get(edge.target);
    if (!source || !target) continue;
    const from = equipmentPort(
      source.kind,
      true,
      portIndex(edge.sourcePort),
      source.params.trayCount,
      junctionBranchCount(source, connectedUnitPorts(source, preview.edges)),
    );
    const to = equipmentPort(
      target.kind,
      false,
      portIndex(edge.targetPort),
      target.params.trayCount,
      junctionBranchCount(target, connectedUnitPorts(target, preview.edges)),
    );
    connections.push({
      id: edge.id,
      source: {
        nodeId: source.id,
        side: from.position,
        x: source.position.x + from.x,
        y: source.position.y + from.y,
      },
      target: {
        nodeId: target.id,
        side: to.position,
        x: target.position.x + to.x,
        y: target.position.y + to.y,
      },
    });
  }
  const obstacles = boxes(preview);
  const routes = routeStreams(connections, obstacles);
  const points = [
    ...obstacles.flatMap(({ x, y, width, height }) => [
      { x, y },
      { x: x + width, y: y + height },
    ]),
    ...[...routes.values()].flatMap((route) => route.points),
  ];
  if (!points.length) return null;
  const left = Math.min(...points.map((point) => point.x)) - 24;
  const top = Math.min(...points.map((point) => point.y)) - 24;
  const right = Math.max(...points.map((point) => point.x)) + 24;
  const bottom = Math.max(...points.map((point) => point.y)) + 24;
  return {
    units: preview.units,
    routes,
    viewBox: `${left} ${top} ${right - left} ${bottom - top}`,
  };
}

function ProjectPreview({ project }: { project: Project }) {
  const geometry = useMemo(() => previewGeometry(project), [project]);
  if (!geometry)
    return (
      <div className="project-preview empty-preview">
        <FileBox size={26} />
        <span>No equipment yet</span>
      </div>
    );
  return (
    <div className="project-preview">
      <svg
        className="project-preview-stage"
        viewBox={geometry.viewBox}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        <g className="preview-pipes">
          {[...geometry.routes].map(([id, route]) => (
            <path
              key={id}
              d={route.path}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            />
          ))}
        </g>
        {geometry.units.map((unit) => (
          <g
            key={unit.id}
            className="preview-unit"
            transform={`translate(${unit.position.x},${unit.position.y})`}
          >
            <EquipmentIcon
              kind={unit.kind}
              size={128}
              trayCount={unit.params.trayCount}
              branchCount={junctionBranchCount(
                unit,
                connectedUnitPorts(unit, project.edges),
              )}
              condenserType={unit.params.distillation?.condenserType}
            />
          </g>
        ))}
      </svg>
    </div>
  );
}
export default function ProjectsPage({
  projects,
  roots,
  folders,
  currentId,
  onOpen,
  onNew: createProject,
  onTemplates,
  onRename,
  onDuplicate,
  onStar,
  onTrash,
  onRestore,
  onDelete,
  onRestoreAll,
  onEmptyTrash,
  onBack,
  onLanding,
  palette,
  onPalette,
  onSaveFolder,
  onRefresh,
  onLocate,
  onNewFolder,
  busy,
  message,
}: {
  projects: SavedProject[];
  roots: ProjectRoot[];
  folders: ProjectLibraryFolder[];
  currentId: string;
  onOpen: (entry: SavedProject) => void;
  onNew: (directory?: ProjectDirectoryHandle) => void;
  onTemplates?: () => void;
  onRename: (entry: SavedProject, name: string) => void;
  onDuplicate: (entry: SavedProject) => void;
  onStar: (entry: SavedProject) => void;
  onTrash: (entry: SavedProject) => void;
  onRestore: (entry: SavedProject) => void;
  onDelete: (entry: SavedProject) => Promise<boolean>;
  onRestoreAll: (entries: SavedProject[]) => void;
  onEmptyTrash: (entries: SavedProject[]) => Promise<boolean>;
  onBack: () => void;
  onLanding: () => void;
  palette: string;
  onPalette: (id: string) => void;
  onSaveFolder: (entry: SavedProject) => void;
  onRefresh: () => void;
  onLocate: (entry: SavedProject) => void;
  onNewFolder: (
    directory: ProjectDirectoryHandle,
    name: string,
  ) => Promise<Pick<ProjectLibraryFolder, "rootId" | "path">>;
  busy: boolean;
  message: string;
}) {
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("Home"),
    [list, setList] = useState(() => {
      try {
        return localStorage.getItem("project-cad.projectView") === "list";
      } catch {
        return false;
      }
    }),
    [sort, setSort] = useState(() => {
      try {
        return localStorage.getItem("project-cad.projectSort") === "name"
          ? "name"
          : "modified";
      } catch {
        return "modified";
      }
    }),
    [selected, setSelected] = useState<string | null>(null),
    [menu, setMenu] = useState<{
      entry: SavedProject | null;
      kind: "new" | "context";
      x: number;
      y: number;
      trigger: HTMLElement;
    } | null>(null),
    [settings, setSettings] = useState<"Themes" | "Storage" | null>(null),
    [details, setDetails] = useState<SavedProject | null>(null),
    [renaming, setRenaming] = useState<SavedProject | null>(null),
    [deleting, setDeleting] = useState<{
      entries: SavedProject[];
      all: boolean;
    } | null>(null),
    [deleteFailed, setDeleteFailed] = useState(false),
    [name, setName] = useState("");
  const inTrash = filter === "Trash";
  const trashedProjects = projects.filter((entry) => entry.trashedAt);
  const trashCount = trashedProjects.length;
  // Keep the confirmed selection fixed, and retry only projects still in Trash.
  const deleteEntries = deleting
    ? deleting.entries.filter((entry) =>
        trashedProjects.some((project) => project.id === entry.id),
      )
    : [];
  const [selectedFolderView, setFolderView] = useState<{
    rootId: string;
    path: string;
  } | null>(null);
  // An externally moved folder can invalidate the current breadcrumb. Return
  // to its connected root, where the refreshed folder is visible.
  const folderView =
    selectedFolderView &&
    folders.some(
      (folder) =>
        folder.rootId === selectedFolderView.rootId &&
        folder.path === selectedFolderView.path,
    )
      ? selectedFolderView
      : selectedFolderView
        ? { ...selectedFolderView, path: "" }
        : null;
  const [creatingFolder, setCreatingFolder] = useState(false);
  const currentFolder = folderView
    ? folders.find(
        (folder) =>
          folder.rootId === folderView.rootId &&
          folder.path === folderView.path,
      )
    : undefined;
  const currentRoot = roots.find((root) => root.id === folderView?.rootId);
  const currentDirectory =
    currentFolder?.directory ??
    (folderView?.path === "" ? currentRoot?.directory : undefined);
  const searchTerm = search.trim().toLowerCase();
  const visibleFolders = folders
    .filter((folder) => {
      if (!folder.path) return false;
      const parentPath = folder.path.split("/").slice(0, -1).join("/");
      const inView = folderView
        ? folder.rootId === folderView.rootId && parentPath === folderView.path
        : filter === "Home" && (!parentPath || Boolean(searchTerm));
      return inView && folder.path.toLowerCase().includes(searchTerm);
    })
    .sort((a, b) =>
      a.path.localeCompare(b.path, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );
  const onNew = () => createProject(currentDirectory);
  const creationActions = [
    {
      label: menu?.kind === "context" ? "New Project" : "Project",
      icon: <Plus size={16} />,
      run: onNew,
    },
    {
      label: menu?.kind === "context" ? "New Folder" : "Folder",
      icon: <FolderPlus size={16} />,
      run: () => setCreatingFolder(true),
    },
    ...(menu?.kind === "context" && onTemplates
      ? [
          {
            label: "Templates",
            icon: <LayoutTemplate size={16} />,
            run: onTemplates,
          },
        ]
      : []),
  ];
  const openEntry = (entry: SavedProject) =>
    entry.missing ? onLocate(entry) : onOpen(entry);
  function browse(rootId: string, path: string) {
    setFolderView({ rootId, path });
    setFilter("Folder");
    setSearch("");
    setSelected(null);
    setMenu(null);
  }
  const cancelDeleteRef = useRef<HTMLButtonElement>(null);
  const visible = projects
    .filter(
      (entry) =>
        Boolean(entry.trashedAt) === inTrash &&
        (!folderView ||
          (!entry.missing &&
            entry.rootId === folderView.rootId &&
            entry.relativePath?.split("/").slice(0, -1).join("/") ===
              folderView.path)) &&
        (filter !== "Starred" || entry.starred) &&
        projectDisplayName(entry)
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
    )
    .sort((a, b) =>
      sort === "name"
        ? projectDisplayName(a).localeCompare(
            projectDisplayName(b),
            undefined,
            {
              numeric: true,
              sensitivity: "base",
            },
          )
        : (inTrash ? b.trashedAt! : b.updatedAt).localeCompare(
            inTrash ? a.trashedAt! : a.updatedAt,
          ),
    );
  const selectedEntry = visible.find((entry) => entry.id === selected);
  const closeMenu = useCallback(() => setMenu(null), []);
  useEffect(() => {
    try {
      localStorage.setItem("project-cad.projectView", list ? "list" : "grid");
      localStorage.setItem("project-cad.projectSort", sort);
    } catch {
      /* Keep preferences usable when browser storage is unavailable. */
    }
  }, [list, sort]);
  function showMenu(
    entry: SavedProject | null,
    x: number,
    y: number,
    trigger: HTMLElement,
    kind: "new" | "context" = "context",
  ) {
    if (busy) return;
    setSelected(entry?.id ?? null);
    setMenu({ entry, x, y, trigger, kind });
  }
  function rename(entry: SavedProject) {
    setRenaming(entry);
    setName(projectDisplayName(entry));
  }
  function confirmDelete(entry: SavedProject) {
    setDeleteFailed(false);
    setDeleting({ entries: [entry], all: false });
  }
  return (
    <section className="projects-page">
      <header className="projects-header">
        <div className="brand">
          <BrandMark size={29} />
          <span>Project CAD</span>
        </div>
        <span className="header-divider" />
        <span>Projects</span>
        <div className="projects-header-actions">
          <button
            className="icon-button"
            aria-label="Landing page"
            title="Landing page"
            onClick={onLanding}
            disabled={busy}
          >
            <Compass size={18} />
          </button>
          <button
            className="icon-button"
            aria-label="Back to canvas"
            onClick={onBack}
            disabled={busy || !currentId}
          >
            <ArrowLeft size={18} />
          </button>
        </div>
      </header>
      <div className="projects-layout">
        <nav
          className={`projects-sidebar ${folderStyles.projectNavigation}`}
          aria-label="Project navigation"
        >
          <div className={folderStyles.libraryActions}>
            <button
              className="new-project-button"
              aria-haspopup="menu"
              aria-expanded={menu?.kind === "new"}
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                showMenu(
                  null,
                  rect.left,
                  rect.bottom + 4,
                  event.currentTarget,
                  "new",
                );
              }}
              disabled={busy}
            >
              <Plus size={20} />
              New
            </button>
            {onTemplates ? (
              <button
                className={folderStyles.folderAction}
                onClick={onTemplates}
                disabled={busy}
              >
                <LayoutTemplate size={17} />
                Templates
              </button>
            ) : null}
          </div>
          {[
            { label: "Home", icon: Home },
            { label: "Starred", icon: Star },
            { label: "Trash", icon: Trash2 },
          ].map((item) => (
            <button
              key={item.label}
              className={`projects-nav-item ${filter === item.label ? "active" : ""}`}
              aria-current={filter === item.label ? "page" : undefined}
              aria-description={
                item.label === "Trash"
                  ? `${trashCount} ${trashCount === 1 ? "project" : "projects"} in Trash`
                  : undefined
              }
              onClick={() => {
                setFilter(item.label);
                setFolderView(null);
                setSelected(null);
                setSearch("");
                closeMenu();
              }}
            >
              <item.icon size={17} />
              <span>{item.label}</span>
              {item.label === "Trash" ? (
                <small aria-hidden="true">{trashCount}</small>
              ) : null}
            </button>
          ))}
          <div
            className="project-connected-folders"
            aria-label="Connected folders"
          >
            <span className="project-folders-caption">Folders</span>
            {roots.map((root) => (
              <button
                key={root.id}
                className={`projects-nav-item ${folderView?.rootId === root.id ? "active" : ""}`}
                onClick={() => browse(root.id, "")}
                title={root.name}
                disabled={busy}
              >
                <Folder size={17} />
                <span>{root.name}</span>
              </button>
            ))}
          </div>
          <div className="projects-preferences">
            <button
              className="projects-nav-item"
              onClick={() => setSettings("Themes")}
            >
              <Palette size={17} />
              <span>Themes</span>
            </button>
            <button
              className="projects-nav-item"
              onClick={() => setSettings("Storage")}
            >
              <HardDrive size={17} />
              <span>Storage</span>
            </button>
          </div>
        </nav>
        <section
          className="projects-content"
          aria-label="Project library"
          aria-busy={busy}
          tabIndex={-1}
          onClick={(event) => {
            if (
              !(event.target as Element).closest(
                "button, input, select, .project-card",
              )
            )
              setSelected(null);
          }}
          onContextMenu={(event) => {
            if (
              (event.target as Element).closest(
                "input, select, button, .project-card",
              )
            )
              return;
            event.preventDefault();
            showMenu(null, event.clientX, event.clientY, event.currentTarget);
          }}
        >
          <div className="project-search-row">
            <button
              className="icon-button"
              aria-label="Refresh projects"
              title="Refresh from disk"
              onClick={onRefresh}
              disabled={busy}
            >
              <RefreshCw size={18} />
            </button>
            <label className="project-search">
              <Search size={19} />
              <input
                aria-label="Search projects"
                placeholder="Search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setSelected(null);
                  closeMenu();
                }}
              />
              {search ? (
                <button
                  className="icon-button"
                  aria-label="Clear search"
                  onClick={() => setSearch("")}
                >
                  <X size={15} />
                </button>
              ) : null}
            </label>
            <label className="project-sort">
              <ArrowDownWideNarrow size={15} aria-hidden="true" />
              <select
                aria-label="Sort projects"
                value={sort}
                onChange={(event) => setSort(event.target.value)}
              >
                <option value="modified">Last modified</option>
                <option value="name">Name</option>
              </select>
              <ChevronDown size={12} aria-hidden="true" />
            </label>
            <div className="project-view-toggle">
              <button
                aria-label="Grid view"
                aria-pressed={!list}
                className={!list ? "active" : ""}
                onClick={() => setList(false)}
              >
                <LayoutGrid size={16} />
              </button>
              <button
                aria-label="List view"
                aria-pressed={list}
                className={list ? "active" : ""}
                onClick={() => setList(true)}
              >
                <List size={17} />
              </button>
            </div>
          </div>
          <div className="project-library-title">
            <h1>
              {search.trim()
                ? "Search results"
                : folderView
                  ? folderView.path.split("/").at(-1) ||
                    currentRoot?.name ||
                    "Folder"
                  : filter}
            </h1>
            {currentFolder ? (
              <button
                className="btn btn-sm"
                disabled={busy}
                onClick={() => setCreatingFolder(true)}
              >
                <FolderPlus size={16} />
                New folder
              </button>
            ) : null}
            {inTrash ? (
              <div
                className="project-trash-actions"
                role="group"
                aria-label="Trash actions"
              >
                <button
                  className="btn btn-sm"
                  disabled={busy || !trashCount}
                  onClick={() => onRestoreAll(trashedProjects)}
                >
                  <RotateCcw size={16} />
                  Restore all
                </button>
                <button
                  className="btn btn-sm danger"
                  disabled={busy || !trashCount}
                  onClick={() => {
                    setDeleteFailed(false);
                    setDeleting({ entries: trashedProjects, all: true });
                  }}
                >
                  <Trash2 size={16} />
                  Empty trash
                </button>
              </div>
            ) : null}
            {selectedEntry ? (
              <div
                className="project-selection"
                role="toolbar"
                aria-label="Selected project"
              >
                <span title={projectDisplayName(selectedEntry)}>
                  {projectDisplayName(selectedEntry)}
                </span>
                {inTrash ? (
                  <button
                    className="icon-button"
                    aria-label="Restore selected project"
                    title="Restore"
                    disabled={busy}
                    onClick={() => onRestore(selectedEntry)}
                  >
                    <RotateCcw size={16} />
                  </button>
                ) : (
                  <>
                    <button
                      className="icon-button"
                      aria-label="Open selected project"
                      title="Open"
                      disabled={busy}
                      onClick={() => openEntry(selectedEntry)}
                    >
                      <FolderOpen size={16} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label="Rename selected project"
                      title="Rename"
                      disabled={busy}
                      onClick={() => rename(selectedEntry)}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={
                        selectedEntry.folderName
                          ? "Move selected project to folder"
                          : "Save selected project to folder"
                      }
                      title={
                        selectedEntry.folderName
                          ? "Move to folder…"
                          : "Save to folder…"
                      }
                      disabled={busy}
                      onClick={() => onSaveFolder(selectedEntry)}
                    >
                      <HardDrive size={16} />
                    </button>
                  </>
                )}
                <button
                  className="icon-button"
                  aria-label={
                    inTrash
                      ? "Permanently delete selected project"
                      : "Move selected project to Trash"
                  }
                  title={inTrash ? "Delete permanently" : "Move to Trash"}
                  disabled={busy}
                  onClick={() =>
                    inTrash
                      ? confirmDelete(selectedEntry)
                      : onTrash(selectedEntry)
                  }
                >
                  <Trash2 size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Clear selection"
                  title="Clear selection"
                  onClick={() => setSelected(null)}
                >
                  <X size={16} />
                </button>
              </div>
            ) : null}
          </div>
          <div className="project-count">
            {visibleFolders.length ? (
              <>
                Folders <span>{visibleFolders.length}</span>
                <span aria-hidden="true">·</span>
              </>
            ) : null}
            {inTrash ? "Trashed projects" : "Projects"}{" "}
            <span>{visible.length}</span>
            {message ? <p role="status">{message}</p> : null}
          </div>
          {folderView && currentRoot ? (
            <nav
              className="project-folder-breadcrumbs"
              aria-label="Folder path"
            >
              <button
                onClick={() => browse(currentRoot.id, "")}
                disabled={busy}
              >
                {currentRoot.name}
              </button>
              {folderView.path
                .split("/")
                .filter(Boolean)
                .map((part, index, parts) => (
                  <span key={index}>
                    {" "}
                    /{" "}
                    <button
                      onClick={() =>
                        browse(
                          currentRoot.id,
                          parts.slice(0, index + 1).join("/"),
                        )
                      }
                      disabled={busy}
                    >
                      {part}
                    </button>
                  </span>
                ))}
            </nav>
          ) : null}
          {visibleFolders.length ? (
            <div
              className={`project-folder-grid${list ? " project-folder-list" : ""}`}
              role="group"
              aria-label="Folders"
            >
              {visibleFolders.map((folder) => (
                <button
                  className="project-folder-card"
                  key={`${folder.rootId}:${folder.path}`}
                  aria-label={`Open folder ${folder.path}`}
                  title={`${roots.find((root) => root.id === folder.rootId)?.name ?? ""}/${folder.path}`}
                  disabled={busy}
                  onClick={() => browse(folder.rootId, folder.path)}
                >
                  <Folder size={24} />
                  <span className="project-folder-label">
                    <span>{folder.path.split("/").at(-1)}</span>
                    {!folderView ? (
                      <small>
                        {[
                          roots.find((root) => root.id === folder.rootId)?.name,
                          ...folder.path.split("/").slice(0, -1),
                        ]
                          .filter(Boolean)
                          .join("/")}
                      </small>
                    ) : null}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
          {visible.length ? (
            <div className={list ? "project-list" : "project-grid"}>
              {visible.map((entry) => (
                <article
                  className={`project-card ${entry.id === currentId ? "current" : ""} ${entry.id === selected ? "is-selected" : ""}`}
                  key={entry.id}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const trigger =
                      event.currentTarget.querySelector<HTMLButtonElement>(
                        ".project-open",
                      )!;
                    showMenu(entry, event.clientX, event.clientY, trigger);
                  }}
                  onKeyDown={(event) => {
                    const trigger =
                      event.currentTarget.querySelector<HTMLButtonElement>(
                        ".project-open",
                      )!;
                    if (
                      event.key === "ContextMenu" ||
                      (event.shiftKey && event.key === "F10")
                    ) {
                      event.preventDefault();
                      const rect = trigger.getBoundingClientRect();
                      showMenu(entry, rect.left + 20, rect.top + 20, trigger);
                    } else if (event.key === "F2" && !busy && !inTrash) {
                      event.preventDefault();
                      rename(entry);
                    } else if (event.key === "Delete" && !busy) {
                      event.preventDefault();
                      if (inTrash) confirmDelete(entry);
                      else onTrash(entry);
                    } else if (event.key === "Escape") setSelected(null);
                  }}
                >
                  <button
                    className="project-open"
                    onClick={(event) => {
                      if (
                        event.ctrlKey &&
                        /Mac|iPhone|iPad/.test(navigator.platform)
                      ) {
                        showMenu(
                          entry,
                          event.clientX,
                          event.clientY,
                          event.currentTarget,
                        );
                        return;
                      }
                      setSelected(entry.id);
                      if (event.detail === 0 && !inTrash) openEntry(entry);
                    }}
                    onDoubleClick={() => {
                      if (!inTrash) openEntry(entry);
                    }}
                    aria-pressed={selected === entry.id}
                    disabled={busy}
                    aria-label={`${inTrash ? "Select" : "Open"} ${projectDisplayName(entry)}`}
                  >
                    <ProjectPreview project={entry.workspace.project} />
                    <div className="project-card-title">
                      <FileBox size={21} />
                      <span>
                        <strong>{projectDisplayName(entry)}</strong>
                        <small
                          className={folderStyles.projectLocation}
                          title={projectLocation(entry)}
                        >
                          {entry.id === currentId ? "Open · " : ""}
                          {entry.missing
                            ? "File missing · Locate project · "
                            : entry.copyOf
                              ? "Copy · "
                              : ""}
                          {projectLocation(entry)}
                        </small>
                      </span>
                    </div>
                    <div className="project-card-meta">
                      <time dateTime={entry.updatedAt}>
                        {new Date(entry.updatedAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </time>
                      <span>
                        {entry.workspace.project.units.length} equipment
                      </span>
                    </div>
                  </button>
                  <button
                    className="project-card-menu-toggle"
                    aria-label={`Actions for ${projectDisplayName(entry)}`}
                    aria-expanded={menu?.entry?.id === entry.id}
                    aria-haspopup="menu"
                    disabled={busy}
                    onClick={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      showMenu(
                        entry,
                        rect.right - 250,
                        rect.bottom + 4,
                        event.currentTarget,
                      );
                    }}
                  >
                    <MoreHorizontal size={18} />
                  </button>
                </article>
              ))}
            </div>
          ) : !visibleFolders.length ? (
            <div className="projects-empty">
              <Folder size={30} />
              <h2>
                {search
                  ? "No matching projects or folders"
                  : inTrash
                    ? "Trash is empty"
                    : filter === "Starred"
                      ? "No starred projects yet"
                      : "No projects yet"}
              </h2>
              {!search && filter === "Home" ? (
                <button
                  className="btn btn-primary"
                  onClick={onNew}
                  disabled={busy}
                >
                  Create project
                </button>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
      {menu ? (
        <ProjectContextMenu
          {...menu}
          label={
            menu.entry
              ? `Actions for ${projectDisplayName(menu.entry)}`
              : menu.kind === "new"
                ? "New"
                : "Library actions"
          }
          onClose={closeMenu}
          actions={(menu.entry
            ? inTrash
              ? [
                  {
                    label: "Restore",
                    icon: <RotateCcw size={16} />,
                    run: () => onRestore(menu.entry!),
                  },
                  {
                    label: "Delete permanently",
                    icon: <Trash2 size={16} />,
                    run: () => confirmDelete(menu.entry!),
                    divider: true,
                  },
                ]
              : [
                  {
                    label: menu.entry.missing
                      ? "Locate project"
                      : menu.entry.copyOf
                        ? "Open as independent project"
                        : "Open",
                    icon: <FolderOpen size={16} />,
                    run: () => openEntry(menu.entry!),
                  },
                  {
                    label: menu.entry.starred ? "Unstar" : "Star",
                    icon: <Star size={16} />,
                    run: () => onStar(menu.entry!),
                  },
                  {
                    label: "Rename",
                    icon: <Pencil size={16} />,
                    run: () => rename(menu.entry!),
                    divider: true,
                  },
                  {
                    label: "Duplicate",
                    icon: <Copy size={16} />,
                    run: () => onDuplicate(menu.entry!),
                  },
                  {
                    label: menu.entry.folderName
                      ? "Move to folder…"
                      : "Save to folder…",
                    icon: <HardDrive size={16} />,
                    run: () => onSaveFolder(menu.entry!),
                  },
                  {
                    label: "Project details",
                    icon: <Info size={16} />,
                    run: () => setDetails(menu.entry),
                    divider: true,
                  },
                  {
                    label: "Move to Trash",
                    icon: <Trash2 size={16} />,
                    run: () => onTrash(menu.entry!),
                    divider: true,
                  },
                ]
            : creationActions
          ).map((action) => ({ ...action, disabled: busy }))}
        />
      ) : null}
      {deleting ? (
        <Dialog
          title={deleting.all ? "Empty trash?" : "Delete project permanently?"}
          className="confirm-dialog"
          initialFocusRef={cancelDeleteRef}
          onClose={() => {
            if (!busy) setDeleting(null);
          }}
        >
          <p>
            Permanently delete{" "}
            {deleting.all ? (
              <>
                <strong>
                  {deleteEntries.length} trashed{" "}
                  {deleteEntries.length === 1 ? "project" : "projects"}
                </strong>{" "}
                and their revision history? This includes projects hidden by
                search.
              </>
            ) : (
              <>
                <strong>{deleting.entries[0].workspace.project.name}</strong>{" "}
                and its revision history?
              </>
            )}{" "}
            This cannot be undone.
          </p>
          {deleteEntries.some((entry) => entry.folderName) ? (
            <p>
              This also deletes{" "}
              {deleting.all ? (
                "their saved project files"
              ) : (
                <strong>{projectLocation(deleting.entries[0])}</strong>
              )}{" "}
              from disk. Folders and other files are kept.
            </p>
          ) : (
            <p>
              This removes {deleting.all ? "the projects" : "the project"} saved
              in this browser.
            </p>
          )}
          {deleteFailed ? (
            <p role="alert">
              {message || "Could not delete this project. Please try again."}
            </p>
          ) : null}
          <div className="dialog-actions">
            <button
              className="btn"
              ref={cancelDeleteRef}
              disabled={busy}
              onClick={() => setDeleting(null)}
            >
              Cancel
            </button>
            <button
              className="btn btn-error"
              disabled={busy || !deleteEntries.length}
              onClick={async () => {
                setDeleteFailed(false);
                const deleted = deleting.all
                  ? await onEmptyTrash(deleteEntries)
                  : await onDelete(deleteEntries[0]);
                if (deleted) {
                  setDeleting(null);
                  setSelected(null);
                } else setDeleteFailed(true);
              }}
            >
              <Trash2 size={16} />
              {busy
                ? "Deleting…"
                : deleting.all
                  ? "Empty trash"
                  : "Delete permanently"}
            </button>
          </div>
        </Dialog>
      ) : null}
      {settings === "Themes" ? (
        <Dialog
          title="Themes"
          className="themes-dialog"
          onClose={() => setSettings(null)}
        >
          <ThemePicker value={palette} onChange={onPalette} />
        </Dialog>
      ) : null}
      {settings === "Storage" ? (
        <Dialog
          title="Storage"
          className="project-storage-dialog"
          onClose={() => {
            setSettings(null);
            onRefresh();
          }}
        >
          <ProjectStorageSettings />
        </Dialog>
      ) : null}
      {details ? (
        <Dialog
          title="Project details"
          className="rename-project-dialog"
          onClose={() => setDetails(null)}
        >
          <dl className="project-details">
            <dt>Name</dt>
            <dd>{projectDisplayName(details)}</dd>
            <dt>Save location</dt>
            <dd>{projectLocation(details)}</dd>
            <dt>Last modified</dt>
            <dd>{new Date(details.updatedAt).toLocaleString()}</dd>
            <dt>Equipment</dt>
            <dd>{details.workspace.project.units.length}</dd>
            <dt>Revisions</dt>
            <dd>{details.workspace.revisions.length}</dd>
          </dl>
          <div className="dialog-actions">
            <button
              className="btn"
              disabled={busy}
              onClick={() => {
                setDetails(null);
                onSaveFolder(details);
              }}
            >
              <FolderOpen size={16} />
              {details.folderName ? "Move to folder…" : "Save to folder…"}
            </button>
          </div>
        </Dialog>
      ) : null}
      {creatingFolder ? (
        <CreateFolderDialog
          initialDirectory={currentDirectory}
          onCreate={async (directory, name) => {
            const parent = await onNewFolder(directory, name);
            browse(parent.rootId, parent.path);
          }}
          onClose={() => {
            setCreatingFolder(false);
            onRefresh();
          }}
        />
      ) : null}
      {renaming ? (
        <Dialog
          title="Rename project"
          className="rename-project-dialog"
          onClose={() => setRenaming(null)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim()) {
                onRename(renaming, name.trim());
                setRenaming(null);
              }
            }}
          >
            <label>
              Project name
              <input
                className="input"
                aria-label="Project name"
                autoFocus
                maxLength={80}
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <div className="dialog-actions">
              <button
                type="button"
                className="btn"
                onClick={() => setRenaming(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={busy || !name.trim()}
              >
                Save name
              </button>
            </div>
          </form>
        </Dialog>
      ) : null}
    </section>
  );
}
