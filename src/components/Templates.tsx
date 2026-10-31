"use client";
import { ArrowRight, Plus } from "lucide-react";
import Dialog from "./Dialog";
import { type Project } from "@/domain/schema";
import { templates, templateSpecification } from "@/domain/templates";
import { EquipmentIcon } from "./EquipmentIcon";
const examples = templates.map((template) => ({
  ...template,
  project: template.create(),
}));
function TemplateDiagram({ project }: { project: Project }) {
  return (
    <div className="template-diagram" aria-hidden="true">
      {project.units
        .filter(
          (n) => n.kind !== "Product" || n.id === project.units.at(-1)?.id,
        )
        .slice(0, 5)
        .map((n, i) => (
          <span key={n.id}>
            {i > 0 ? <ArrowRight size={16} /> : null}
            <EquipmentIcon kind={n.kind} size={36} />
          </span>
        ))}
    </div>
  );
}
export default function Templates({
  onLoad,
  onClose,
}: {
  onLoad: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      title="Start from a template"
      onClose={onClose}
      className="templates-dialog"
    >
      <p className="dialog-intro">
        Ready to run with real chemicals: components, property models,
        separations and operating conditions are already specified.
      </p>
      <div className="template-list">
        {examples.map((t) => (
          <button
            key={t.id}
            className="template-option"
            onClick={() => onLoad(t.id)}
          >
            <TemplateDiagram project={t.project} />
            <span className="template-copy">
              <strong>{t.name}</strong>
              <span>{t.description}</span>
              <small>{templateSpecification(t.project)}</small>
              <small>
                {t.project.units.length} equipment · {t.project.edges.length}{" "}
                streams
              </small>
            </span>
            <ArrowRight size={18} />
          </button>
        ))}
      </div>
      <div className="template-bottom">
        <span>
          Every template includes its chemical property data. Reactor templates
          will be available when real-chemical reactions are supported.
        </span>
        <button className="btn" onClick={() => onLoad("empty")}>
          <Plus size={15} /> Blank flowsheet
        </button>
      </div>
    </Dialog>
  );
}
