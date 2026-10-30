"use client";
import { useState } from "react";
import {
  Workflow,
  Plus,
  Folder,
  FolderOpen,
  Clock3,
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
  Moon,
  Sun,
  ArrowLeft,
} from "lucide-react";
import type { SavedProject } from "@/lib/storage";
import { ports, type Project } from "@/domain/schema";
import { EquipmentIcon } from "./EquipmentIcon";
import { equipmentPort, streamPath } from "./flow-geometry";
import Dialog from "./Dialog";
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
  onOpenFolder,
  onTemplates,
  onRename,
  onDuplicate,
  onStar,
  onBack,
  theme,
  onTheme,
  busy,
  message,
}: {
  projects: SavedProject[];
  currentId: string;
  onOpen: (entry: SavedProject) => void;
  onNew: () => void;
  onOpenFolder?: () => void;
  onTemplates?: () => void;
  onRename: (entry: SavedProject, name: string) => void;
  onDuplicate: (entry: SavedProject) => void;
  onStar: (entry: SavedProject) => void;
  onBack: () => void;
  theme: string;
  onTheme: () => void;
  busy: boolean;
  message: string;
}) {
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("My projects"),
    [list, setList] = useState(false),
    [sort, setSort] = useState("modified"),
    [menu, setMenu] = useState<string | null>(null),
    [renaming, setRenaming] = useState<SavedProject | null>(null),
    [name, setName] = useState("");
  const visible = projects
    .filter(
      (entry) =>
        (filter !== "Starred" || entry.starred) &&
        entry.workspace.project.name
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      filter !== "Recent" && sort === "name"
        ? a.workspace.project.name.localeCompare(b.workspace.project.name)
        : b.updatedAt.localeCompare(a.updatedAt),
    );
  return (
    <section className="projects-page">
      <header className="projects-header">
        <button className="brand" onClick={onBack} aria-label="Project CAD">
          <Workflow size={29} />
          <span>Project CAD</span>
        </button>
        <span className="header-divider" />
        <span>Projects</span>
        <div className="projects-header-actions">
          <button
            className="icon-button"
            aria-label="Toggle theme"
            onClick={onTheme}
          >
            {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          <button
            className="icon-button"
            aria-label="Back to canvas"
            onClick={onBack}
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
            {onOpenFolder ? (
              <button
                className={folderStyles.folderAction}
                onClick={onOpenFolder}
                disabled={busy}
              >
                <FolderOpen size={17} />
                Open project folder
              </button>
            ) : null}
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
            { label: "My projects", icon: Folder },
            { label: "Recent", icon: Clock3 },
            { label: "Starred", icon: Star },
          ].map((item) => (
            <button
              key={item.label}
              className={`projects-nav-item ${filter === item.label ? "active" : ""}`}
              onClick={() => setFilter(item.label)}
            >
              <item.icon size={17} />
              <span>{item.label}</span>
              {item.label === "My projects" ? (
                <small>{projects.length}</small>
              ) : null}
            </button>
          ))}
        </nav>
        <section
          className="projects-content"
          aria-label="Project library"
          aria-busy={busy}
        >
          <div className="project-search-row">
            <label className="project-search">
              <Search size={19} />
              <input
                aria-label="Search projects"
                placeholder="Search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <label className="project-sort">
              <ArrowDownWideNarrow size={15} />
              <select
                aria-label="Sort projects"
                value={filter === "Recent" ? "modified" : sort}
                disabled={filter === "Recent"}
                onChange={(event) => setSort(event.target.value)}
              >
                <option value="modified">Last modified</option>
                <option value="name">Name</option>
              </select>
              <ChevronDown size={12} />
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
            <h1>{search ? "Search results" : filter}</h1>
          </div>
          <div className="project-count">
            Projects <span>{visible.length}</span>
            {message ? <p role="status">{message}</p> : null}
          </div>
          {visible.length ? (
            <div className={list ? "project-list" : "project-grid"}>
              {visible.map((entry) => (
                <article
                  className={`project-card ${entry.id === currentId ? "current" : ""}`}
                  key={entry.id}
                >
                  <button
                    className="project-open"
                    onClick={() => onOpen(entry)}
                    disabled={busy}
                    aria-label={`Open ${entry.workspace.project.name}`}
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
                  <button
                    className="project-card-menu-toggle"
                    aria-label={`Actions for ${entry.workspace.project.name}`}
                    aria-expanded={menu === entry.id}
                    onClick={() => setMenu(menu === entry.id ? null : entry.id)}
                  >
                    <MoreHorizontal size={18} />
                  </button>
                  {menu === entry.id ? (
                    <div className="project-card-menu">
                      <button
                        onClick={() => {
                          setRenaming(entry);
                          setName(entry.workspace.project.name);
                          setMenu(null);
                        }}
                      >
                        <Pencil size={14} />
                        Rename
                      </button>
                      <button
                        onClick={() => {
                          onDuplicate(entry);
                          setMenu(null);
                        }}
                      >
                        <Copy size={14} />
                        Duplicate
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <div className="projects-empty">
              <Folder size={30} />
              <h2>
                {search
                  ? "No matching projects"
                  : filter === "Starred"
                    ? "No starred projects yet"
                    : "Your projects start here"}
              </h2>
              <p>
                {search
                  ? "Try a different name."
                  : filter === "Starred"
                    ? "Use the star on a project to keep it here."
                    : "Create a project in a local folder or open an existing project folder."}
              </p>
              {!search && filter !== "Starred" ? (
                <button className="btn btn-primary" onClick={onNew}>
                  Create project
                </button>
              ) : null}
            </div>
          )}
        </section>
      </div>
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
              <button className="btn btn-primary" type="submit">
                Save name
              </button>
            </div>
          </form>
        </Dialog>
      ) : null}
    </section>
  );
}
