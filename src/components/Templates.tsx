// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

"use client";
import { useState } from "react";
import { ArrowRight, ChevronDown, Plus, Search, X } from "lucide-react";
import Dialog from "./Dialog";
import {
  templates,
  templateSections,
  templateSpecification,
  type TemplateSection,
} from "@/domain/templates";
import FlowsheetPreview from "./FlowsheetPreview";

const examples = templates.map((template) => {
  const project = template.create();
  const specification = templateSpecification(project);
  return {
    ...template,
    project,
    specification,
    search:
      `${template.name} ${template.description} ${template.tag} ${specification}`.toLowerCase(),
  };
});

export default function Templates({
  onLoad,
  onClose,
}: {
  onLoad: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<
    Partial<Record<TemplateSection, boolean>>
  >({ plants: true });
  const [searchCollapsed, setSearchCollapsed] = useState<
    Partial<Record<TemplateSection, boolean>>
  >({});
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = examples.filter((template) =>
    terms.every((term) => template.search.includes(term)),
  );
  return (
    <Dialog
      title="Start from a template"
      onClose={onClose}
      className="templates-dialog"
    >
      <div className="template-toolbar">
        <p>Choose a process. Everything is ready to run.</p>
        <label className="template-search">
          <Search size={16} aria-hidden="true" />
          <input
            aria-label="Search templates"
            placeholder="Search templates…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSearchCollapsed({});
            }}
          />
          {query && (
            <button
              type="button"
              className="icon-button"
              aria-label="Clear template search"
              onClick={() => setQuery("")}
            >
              <X size={14} />
            </button>
          )}
        </label>
      </div>
      <div className="template-list">
        {templateSections.map((section) => {
          const items = matches.filter(
            (template) => template.section === section.id,
          );
          if (!items.length) return null;
          return (
            <details
              key={section.id}
              className="template-section"
              open={
                terms.length > 0
                  ? !searchCollapsed[section.id]
                  : !!expanded[section.id]
              }
            >
              <summary
                onClick={(event) => {
                  event.preventDefault();
                  if (terms.length)
                    setSearchCollapsed((current) => ({
                      ...current,
                      [section.id]: !current[section.id],
                    }));
                  else
                    setExpanded((current) => ({
                      ...current,
                      [section.id]: !current[section.id],
                    }));
                }}
              >
                <span>{section.name}</span>
                <span className="template-section-count">{items.length}</span>
                <ChevronDown size={16} aria-hidden="true" />
              </summary>
              <div className="template-section-items">
                {items.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    className={`template-option ${template.project.units.length > 12 ? "template-option-plant" : ""}`}
                    data-template-id={template.id}
                    onClick={() => onLoad(template.id)}
                    title={template.specification}
                  >
                    <span className="template-diagram">
                      <FlowsheetPreview project={template.project} />
                    </span>
                    <span className="template-copy">
                      <strong>{template.name}</strong>
                      <span>{template.description}</span>
                      <small className="template-tag">{template.tag}</small>
                      <small>
                        {template.project.units.length} equipment ·{" "}
                        {template.project.edges.length} streams
                      </small>
                    </span>
                    <ArrowRight size={17} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </details>
          );
        })}
        {!matches.length && (
          <p className="template-empty" role="status">
            No templates match “{query}”. Try a chemical or process name.
          </p>
        )}
      </div>
      <div className="template-bottom">
        <span>
          {templates.length} examples · Editable flowsheets & rate laws
        </span>
        <button type="button" className="btn" onClick={() => onLoad("empty")}>
          <Plus size={15} /> Blank flowsheet
        </button>
      </div>
    </Dialog>
  );
}
