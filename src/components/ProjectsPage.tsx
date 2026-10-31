"use client";
import { useCallback, useEffect, useRef, useState } from "react";
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
} from "lucide-react";
import type { SavedProject } from "@/lib/storage";
import { ports, type Project } from "@/domain/schema";
import { EquipmentIcon } from "./EquipmentIcon";
import { equipmentPort, streamPath } from "./flow-geometry";
import Dialog from "./Dialog";
import BrandMark from "./BrandMark";
import ThemePicker from "./ThemePicker";
import ProjectStorageSettings from "./ProjectStorageSettings";
import ProjectContextMenu from "./ProjectContextMenu";
import folderStyles from "./CreateProjectDialog.module.css";
function ProjectPreview({ project }: { project: Project }) {
  if (!project.units.length)
    return (
      <div className="project-preview empty-preview">
        <FileBox size={26} />
        <span>No equipment yet</span>
      </div>
    );
  const minX = Math.min(...project.units.map((unit) => unit.position.x)),
    minY = Math.min(...project.units.map((unit) => unit.position.y));
  const width =
      Math.max(...project.units.map((unit) => unit.position.x)) - minX + 180,
    height =
      Math.max(...project.units.map((unit) => unit.position.y)) - minY + 210;
  return (
    <div className="project-preview">
      <svg
        className="project-preview-stage"
        viewBox={`-24 -24 ${width + 48} ${height + 48}`}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        <g className="preview-pipes">
          {project.edges.map((edge) => {
            const source = project.units.find(
                (unit) => unit.id === edge.source,
              ),
              target = project.units.find((unit) => unit.id === edge.target);
            if (!source || !target) return null;
            const output = equipmentPort(
                source.kind,
                true,
                ports(source.kind).outputs.indexOf(edge.sourcePort),
              ),
              input = equipmentPort(
                target.kind,
                false,
                ports(target.kind).inputs.indexOf(edge.targetPort),
              );
            return (
              <path
                key={edge.id}
                d={streamPath({
                  sourceX: source.position.x - minX + output.x,
                  sourceY: source.position.y - minY + output.y,
                  targetX: target.position.x - minX + input.x,
                  targetY: target.position.y - minY + input.y,
                  sourcePosition: output.position,
                  targetPosition: input.position,
                  sourceHandleId: edge.sourcePort,
                  targetHandleId: edge.targetPort,
                })}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              />
            );
          })}
        </g>
        {project.units.map((unit) => (
          <g
            key={unit.id}
            className="preview-unit"
            transform={`translate(${unit.position.x - minX},${unit.position.y - minY})`}
          >
            <EquipmentIcon kind={unit.kind} size={128} />
          </g>
        ))}
      </svg>
    </div>
  );
}
export default function ProjectsPage({
  projects,
  currentId,
  onOpen,
  onNew,
  onTemplates,
  onRename,
  onDuplicate,
  onStar,
  onTrash,
  onRestore,
  onDelete,
  onBack,
  onLanding,
  palette,
  onPalette,
  onSaveFolder,
  busy,
  message,
}: {
  projects: SavedProject[];
  currentId: string;
  onOpen: (entry: SavedProject) => void;
  onNew: () => void;
  onTemplates?: () => void;
  onRename: (entry: SavedProject, name: string) => void;
  onDuplicate: (entry: SavedProject) => void;
  onStar: (entry: SavedProject) => void;
  onTrash: (entry: SavedProject) => void;
  onRestore: (entry: SavedProject) => void;
  onDelete: (entry: SavedProject) => Promise<boolean>;
  onBack: () => void;
  onLanding: () => void;
  palette: string;
  onPalette: (id: string) => void;
  onSaveFolder: (entry: SavedProject) => void;
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
      x: number;
      y: number;
      trigger: HTMLElement;
    } | null>(null),
    [settings, setSettings] = useState<"Themes" | "Storage settings" | null>(
      null,
    ),
    [details, setDetails] = useState<SavedProject | null>(null),
    [renaming, setRenaming] = useState<SavedProject | null>(null),
    [deleting, setDeleting] = useState<SavedProject | null>(null),
    [deleteFailed, setDeleteFailed] = useState(false),
    [name, setName] = useState("");
  const inTrash = filter === "Trash";
  const cancelDeleteRef = useRef<HTMLButtonElement>(null);
  const visible = projects
    .filter(
      (entry) =>
        Boolean(entry.trashedAt) === inTrash &&
        (filter !== "Starred" || entry.starred) &&
        entry.workspace.project.name
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.workspace.project.name.localeCompare(
            b.workspace.project.name,
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
  ) {
    if (busy) return;
    setSelected(entry?.id ?? null);
    setMenu({ entry, x, y, trigger });
  }
  function rename(entry: SavedProject) {
    setRenaming(entry);
    setName(entry.workspace.project.name);
  }
  function confirmDelete(entry: SavedProject) {
    setDeleteFailed(false);
    setDeleting(entry);
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
              onClick={onNew}
              disabled={busy}
            >
              <Plus size={20} />
              Create project
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
              onClick={() => {
                setFilter(item.label);
                setSelected(null);
                setSearch("");
                closeMenu();
              }}
            >
              <item.icon size={17} />
              <span>{item.label}</span>
            </button>
          ))}
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
              onClick={() => setSettings("Storage settings")}
            >
              <HardDrive size={17} />
              <span>Storage settings</span>
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
            <h1>{search.trim() ? "Search results" : filter}</h1>
            {selectedEntry ? (
              <div
                className="project-selection"
                role="toolbar"
                aria-label="Selected project"
              >
                <span title={selectedEntry.workspace.project.name}>
                  {selectedEntry.workspace.project.name}
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
                      onClick={() => onOpen(selectedEntry)}
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
                      aria-label="Save selected project to folder"
                      title="Save to folder…"
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
            {inTrash ? "Trashed projects" : "Projects"}{" "}
            <span>{visible.length}</span>
            {message ? <p role="status">{message}</p> : null}
          </div>
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
                      if (event.detail === 0 && !inTrash) onOpen(entry);
                    }}
                    onDoubleClick={() => {
                      if (!inTrash) onOpen(entry);
                    }}
                    aria-pressed={selected === entry.id}
                    disabled={busy}
                    aria-label={`${inTrash ? "Select" : "Open"} ${entry.workspace.project.name}`}
                  >
                    <ProjectPreview project={entry.workspace.project} />
                    <div className="project-card-title">
                      <FileBox size={21} />
                      <span>
                        <strong>{entry.workspace.project.name}</strong>
                        <small
                          className={folderStyles.projectLocation}
                          title={
                            entry.folderName
                              ? `${entry.folderName}/project.json`
                              : "Stored in this browser"
                          }
                        >
                          {entry.id === currentId ? "Open · " : ""}
                          {entry.folderName
                            ? `${entry.folderName}/project.json`
                            : "Browser storage"}
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
                  {!inTrash ? (
                    <button
                      className="project-star"
                      aria-label={`${entry.starred ? "Unstar" : "Star"} ${entry.workspace.project.name}`}
                      onClick={() => onStar(entry)}
                      disabled={busy}
                    >
                      <Star
                        size={15}
                        fill={entry.starred ? "currentColor" : "none"}
                      />
                    </button>
                  ) : null}
                  <button
                    className="project-card-menu-toggle"
                    aria-label={`Actions for ${entry.workspace.project.name}`}
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
          ) : (
            <div className="projects-empty">
              <Folder size={30} />
              <h2>
                {search
                  ? "No matching projects"
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
          )}
        </section>
      </div>
      {menu ? (
        <ProjectContextMenu
          {...menu}
          label={
            menu.entry
              ? `Actions for ${menu.entry.workspace.project.name}`
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
                    label: "Open",
                    icon: <FolderOpen size={16} />,
                    run: () => onOpen(menu.entry!),
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
                    label: "Save to folder…",
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
            : [
                {
                  label: "Create project",
                  icon: <Plus size={16} />,
                  run: onNew,
                },
                {
                  label: "Themes",
                  icon: <Palette size={16} />,
                  run: () => setSettings("Themes"),
                  divider: true,
                },
                {
                  label: "Storage settings",
                  icon: <HardDrive size={16} />,
                  run: () => setSettings("Storage settings"),
                },
              ]
          ).map((action) => ({ ...action, disabled: busy }))}
        />
      ) : null}
      {deleting ? (
        <Dialog
          title="Delete project permanently?"
          className="confirm-dialog"
          initialFocusRef={cancelDeleteRef}
          onClose={() => {
            if (!busy) setDeleting(null);
          }}
        >
          <p>
            Permanently delete{" "}
            <strong>{deleting.workspace.project.name}</strong> and its revision
            history? This cannot be undone.
          </p>
          {deleting.folderName ? (
            <p>
              This also deletes{" "}
              <strong>{deleting.folderName}/project.json</strong> from disk. The
              folder and any other files inside it are kept.
            </p>
          ) : (
            <p>This removes the project saved in this browser.</p>
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
              disabled={busy}
              onClick={async () => {
                setDeleteFailed(false);
                if (await onDelete(deleting)) {
                  setDeleting(null);
                  setSelected(null);
                } else setDeleteFailed(true);
              }}
            >
              <Trash2 size={16} />
              {busy ? "Deleting…" : "Delete permanently"}
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
      {settings === "Storage settings" ? (
        <Dialog
          title="Storage settings"
          className="project-storage-dialog"
          onClose={() => setSettings(null)}
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
            <dd>{details.workspace.project.name}</dd>
            <dt>Save location</dt>
            <dd>
              {details.folderName
                ? `${details.folderName}/project.json`
                : "Browser storage"}
            </dd>
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
              Save to folder…
            </button>
          </div>
        </Dialog>
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
