"use client";
import { useState } from "react";
import { Search, ChevronDown } from "lucide-react";
import { type Kind } from "@/domain/schema";
import { EquipmentIcon, equipmentLabels } from "./EquipmentIcon";
const groups: { name: string; kinds: Kind[] }[] = [
  { name: "Inputs & outputs", kinds: ["Feed", "Product"] },
  { name: "Mixing & splitting", kinds: ["Mixer", "Splitter"] },
  { name: "Heat transfer", kinds: ["Heater", "Cooler"] },
  { name: "Reaction", kinds: ["PBR"] },
  { name: "Separation", kinds: ["Distillation"] },
];
export default function EquipmentLibrary({
  onAdd,
}: {
  onAdd: (kind: Kind) => void;
}) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const matches = groups
    .map((g) => ({
      ...g,
      kinds: g.kinds.filter((k) =>
        equipmentLabels[k].toLowerCase().includes(query.toLowerCase()),
      ),
    }))
    .filter((g) => g.kinds.length);
  return (
    <div className="equipment-library">
      <div className="library-search">
        <Search size={15} />
        <input
          type="search"
          aria-label="Search equipment"
          placeholder="Search equipment"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="equipment-groups">
        {matches.map((group) => (
          <section key={group.name} className="equipment-group">
            <button
              className="group-heading"
              aria-expanded={!collapsed.includes(group.name) || !!query}
              onClick={() =>
                setCollapsed((p) =>
                  p.includes(group.name)
                    ? p.filter((n) => n !== group.name)
                    : [...p, group.name],
                )
              }
            >
              <ChevronDown
                size={13}
                className={
                  collapsed.includes(group.name) && !query ? "closed" : ""
                }
              />
              <span>{group.name}</span>
              <small>{group.kinds.length}</small>
            </button>
            {!collapsed.includes(group.name) || query
              ? group.kinds.map((kind) => (
                  <button
                    key={kind}
                    className="equipment-item"
                    title={`Add ${equipmentLabels[kind]}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("application/project-cad", kind);
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() => onAdd(kind)}
                  >
                    <EquipmentIcon kind={kind} />
                    <span>{equipmentLabels[kind]}</span>
                  </button>
                ))
              : null}
          </section>
        ))}
        {!matches.length ? (
          <p className="search-empty">No equipment matches “{query}”.</p>
        ) : null}
      </div>
    </div>
  );
}
