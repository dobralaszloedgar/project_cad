"use client";
import { ArrowRight, Plus } from "lucide-react";
import Dialog from "./Dialog";
import {
  reactorExample,
  distillationExample,
  heatingExample,
} from "@/domain/examples";
import { type Project } from "@/domain/schema";
import { EquipmentIcon } from "./EquipmentIcon";
const examples = [
  {
    id: "heating",
    name: "Simple heating",
    description: "Heat one feed to a specified temperature.",
    project: heatingExample(),
  },
  {
    id: "reactor",
    name: "Reactor with recycle",
    description: "Convert A to B and return part of the outlet.",
    project: reactorExample(),
  },
  {
    id: "distillation",
    name: "Ideal separation",
    description: "Separate a binary feed in one ideal contact.",
    project: distillationExample(),
  },
];
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
        Choose a simple flowsheet, then make it your own.
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
        <span>All templates use the same documented ideal models.</span>
        <button className="btn" onClick={() => onLoad("empty")}>
          <Plus size={15} /> Blank flowsheet
        </button>
      </div>
    </Dialog>
  );
}
