// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { useId, useMemo } from "react";
import type { Project } from "@/domain/schema";
import { arrangeFlowsheet } from "@/domain/flowsheet-layout";
import {
  connectedUnitPorts,
  junctionBranchCount,
  portIndex,
} from "@/domain/material-ports";
import { EquipmentIcon } from "./EquipmentIcon";
import { equipmentPort, equipmentSize } from "./flow-geometry";
import { routeStreams, type StreamConnection } from "./stream-routing";

/** Use the editor's equipment, fittings and pipe routing for every thumbnail. */
export function previewGeometry(project: Project) {
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
  const preview = overlapping ? arrangeFlowsheet(project) : project;
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
  const left = Math.min(...points.map((p) => p.x)) - 24;
  const top = Math.min(...points.map((p) => p.y)) - 24;
  const right = Math.max(...points.map((p) => p.x)) + 24;
  const bottom = Math.max(...points.map((p) => p.y)) + 24;
  return {
    units: preview.units,
    routes,
    viewBox: `${left} ${top} ${right - left} ${bottom - top}`,
  };
}

export default function FlowsheetPreview({
  project,
  className = "",
}: {
  project: Project;
  className?: string;
}) {
  const geometry = useMemo(() => previewGeometry(project), [project]);
  const arrow = useId();
  if (!geometry) return null;
  return (
    <svg
      className={`flowsheet-preview ${className}`}
      viewBox={geometry.viewBox}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <defs>
        <marker
          id={arrow}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="13"
          markerHeight="13"
          markerUnits="userSpaceOnUse"
          orient="auto-start-reverse"
        >
          <path
            d="M1 1L9 5L1 9"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="1.5"
          />
        </marker>
      </defs>
      <g
        className="preview-pipes"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      >
        {[...geometry.routes].map(([id, route]) => (
          <path
            key={id}
            data-stream-id={id}
            d={route.path}
            vectorEffect="non-scaling-stroke"
            markerEnd={`url(#${arrow})`}
          />
        ))}
      </g>
      {geometry.units.map((unit) => (
        <g
          key={unit.id}
          className="preview-unit"
          data-unit-id={unit.id}
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
  );
}
