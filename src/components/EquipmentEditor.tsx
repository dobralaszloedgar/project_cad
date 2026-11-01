"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, ChevronDown, Copy, Info, Trash2 } from "lucide-react";
import { ports, type Project, type Unit } from "@/domain/schema";
import { flow, type Result, type Stream } from "@/domain/solver";
import { defaultThermo, modelInfo } from "@/domain/thermo/registry";
import {
  componentNames,
  mixtureName,
  thermoContext,
} from "@/domain/thermo/catalog";
import { EquipmentModelNotes, CatalystProfile } from "./EquipmentModelNotes";
import "./equipment-setup.css";
import { PackedBedSetup } from "./reactions/PackedBedSetup";
import { PackedBedResults } from "./reactions/PackedBedResults";
import { defaultPackedBed } from "@/domain/reactions/schema";
import { packedBedIssues } from "@/domain/reactions/validation";
import { componentFlows } from "@/domain/stream-composition";
import type { Dimension } from "@/domain/unit-definitions";
import EngineeringInput from "./EngineeringInput";
import NumberInput from "./NumberInput";
import { useUnitSystem } from "./useUnitSystem";
import { DistillationSetup } from "./DistillationSetup";
import { DistillationResults } from "./DistillationResults";
import {
  equipmentSetupIssues,
  type EquipmentStatus,
  type EquipmentTarget,
} from "@/domain/equipment-status";
import { revealEquipmentIssue } from "./equipment-issue-navigation";
import "./equipment-status.css";

type NumericParam = {
  [K in keyof Unit["params"]]-?: Unit["params"][K] extends number ? K : never;
}[keyof Unit["params"]];

const parameterDimensions: Partial<Record<NumericParam, Dimension>> = {
  temperature: "temperature",
  pressure: "pressure",
  flow: "molarFlow",
  heatDuty: "power",
};

function setupParams(
  unit: Unit,
  componentIds: readonly string[],
): Unit["params"] {
  if (unit.kind !== "PBR" || unit.params.packedBed) return unit.params;
  return {
    ...unit.params,
    packedBed: {
      ...defaultPackedBed(componentIds),
      catalystMass: unit.params.catalystMass,
    },
  };
}

function streamRows(display: ReturnType<typeof useUnitSystem>): {
  label: string;
  component?: number;
  value: (stream: Stream, properties?: Result["properties"][string]) => string;
}[] {
  return [
    {
      label: "Molar flow",
      value: (stream) => display.format(flow(stream), "molarFlow", 4),
    },
    {
      label: "Temperature",
      value: (stream) => display.format(stream.temperature, "temperature", 2),
    },
    {
      label: "Pressure",
      value: (stream) => display.format(stream.pressure, "pressure", 3),
    },
    {
      label: "Phase",
      value: (_stream, properties) => properties?.phase ?? "—",
    },
    {
      label: "Vapor fraction",
      value: (_stream, properties) =>
        properties?.vaporFraction?.toFixed(5) ?? "Undefined",
    },
  ];
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      className="equipment-section"
      data-setup-section={
        title === "Composition"
          ? "composition"
          : title === "Thermodynamics"
            ? "thermodynamics"
            : undefined
      }
    >
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Connections({ unit, project }: { unit: Unit; project: Project }) {
  const settings = project.thermo ?? defaultThermo;
  const unitPorts = ports(unit.kind);
  const missing = [
    ...(unit.kind === "Mixer"
      ? project.edges.some((edge) => edge.target === unit.id)
        ? []
        : ["an inlet"]
      : unitPorts.inputs.filter(
          (port) =>
            !project.edges.some(
              (edge) => edge.target === unit.id && edge.targetPort === port,
            ),
        )),
    ...unitPorts.outputs.filter(
      (port) =>
        !project.edges.some(
          (edge) => edge.source === unit.id && edge.sourcePort === port,
        ),
    ),
  ];
  return (
    <aside
      className="equipment-setup-side"
      aria-label="Equipment connections"
      data-setup-section="connections"
    >
      <Section title="Connections">
        {(["inputs", "outputs"] as const).flatMap((direction) =>
          unitPorts[direction].map((port, index) => {
            const incoming = direction === "inputs";
            const edges = project.edges.filter((edge) =>
              incoming
                ? edge.target === unit.id && edge.targetPort === port
                : edge.source === unit.id && edge.sourcePort === port,
            );
            const label = `${incoming ? "Inlet" : "Outlet"}${unitPorts[direction].length > 1 ? ` ${index + 1}` : ""}`;
            return (
              <div className="equipment-port" key={port} data-setup-port={port}>
                <span>
                  {label}
                  {unit.kind === "Mixer" && port === "in2" ? " · optional" : ""}
                </span>
                {edges.length ? (
                  edges.map((edge) => (
                    <div className="equipment-port-value" key={edge.id}>
                      <strong>{edge.name ?? edge.id}</strong>
                      <small>
                        {incoming ? "From" : "To"}{" "}
                        {incoming ? edge.source : edge.target}
                      </small>
                    </div>
                  ))
                ) : (
                  <div className="equipment-port-value is-empty">
                    Unconnected
                  </div>
                )}
              </div>
            );
          }),
        )}
        <p className="equipment-help">Connect streams on the flowsheet.</p>
        {missing.length ? (
          <p className="equipment-help">
            Connect{" "}
            {missing
              .map(
                (port) =>
                  ({ in: "the inlet", out: "outlet 1", out2: "outlet 2" })[
                    port
                  ] ?? port,
              )
              .join(", ")}{" "}
            before calculating.
          </p>
        ) : (
          <p className="equipment-connected">
            <CheckCircle2 size={14} /> All required ports connected
          </p>
        )}
      </Section>
      <Section title="Thermodynamics">
        <dl className="equipment-context">
          <dt>Property model</dt>
          <dd>{modelInfo(settings.modelId).name}</dd>
          <dt>Components</dt>
          <dd>{mixtureName(settings)}</dd>
        </dl>
      </Section>
    </aside>
  );
}

function EquipmentResults({
  unit,
  project,
  result,
  dirty,
}: {
  unit: Unit;
  project: Project;
  result: Result | null;
  dirty: boolean;
}) {
  const eq = result?.equipment[unit.id];
  const display = useUnitSystem();
  const rows = streamRows(display);
  const settings = project.thermo ?? defaultThermo;
  const names = componentNames(settings);
  const context = thermoContext(settings);
  const resultRows = [
    ...rows.slice(0, 3),
    ...names.map((name, index) => ({
      label: `Mole fraction ${name}`,
      value: (stream: Stream) =>
        flow(stream)
          ? (
              componentFlows(stream, context.ids)[context.ids[index]] /
              flow(stream)
            ).toFixed(5)
          : "Undefined at zero flow",
    })),
    ...rows.slice(3),
  ];
  const edges = project.edges.filter((edge) =>
    unit.kind === "Product" ? edge.target === unit.id : edge.source === unit.id,
  );
  return (
    <div className="equipment-result">
      <h3>Calculated results</h3>
      {dirty && (
        <p className="equipment-help" role="status">
          Unapplied changes. Results show the last applied conditions.
        </p>
      )}
      {!eq ? (
        <div className="equipment-results-empty">
          <Info size={20} />
          <p>Run the simulation to calculate this equipment.</p>
        </div>
      ) : (
        <>
          {!result?.converged && (
            <p className="equipment-help" role="status">
              The simulation did not converge. These results are provisional.
            </p>
          )}
          <div className="equipment-performance">
            <dl className="equipment-result-values">
              <div>
                <dt>
                  {eq.distillation?.method === "fug"
                    ? "Net duty at specified product temperatures"
                    : "Heat duty"}
                </dt>
                <dd>{display.format(eq.duty, "power")}</dd>
              </div>
              {eq.conversion !== undefined && (
                <div>
                  <dt>Single-pass conversion</dt>
                  <dd>{(eq.conversion * 100).toFixed(2)}%</dd>
                </div>
              )}
            </dl>
            {eq.profile && <CatalystProfile profile={eq.profile} />}
          </div>
          {eq.distillation && (
            <DistillationResults
              result={eq.distillation}
              names={Object.fromEntries(
                context.ids.map((id) => [id, context.catalog.get(id).name]),
              )}
            />
          )}
          {eq.packedBed && (
            <PackedBedResults
              result={eq.packedBed}
              chemicals={context.ids.map((id) => context.catalog.get(id))}
              config={unit.params.packedBed!}
            />
          )}
          <Section
            title={
              unit.kind === "Product" ? "Received stream" : "Outlet streams"
            }
          >
            <div className="equipment-table-scroll">
              <table className="equipment-stream-results">
                <thead>
                  <tr>
                    <th scope="col">Property</th>
                    {edges.map((edge) => (
                      <th scope="col" key={edge.id}>
                        {edge.name ?? edge.id}
                        <small>
                          {unit.kind === "Product"
                            ? "Inlet"
                            : edge.sourcePort === "out2"
                              ? "Outlet 2"
                              : "Outlet 1"}
                        </small>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {resultRows.map(({ label, value }) => (
                    <tr key={label}>
                      <th scope="row">{label}</th>
                      {edges.map((edge) => {
                        const stream = result?.streams[edge.id];
                        return (
                          <td key={edge.id}>
                            {stream
                              ? value(stream, result?.properties[edge.id])
                              : "—"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

export default function EquipmentEditor({
  unit,
  project,
  result,
  onApply,
  onDuplicate,
  onDelete,
  issueTarget,
  status,
  onNavigateIssue,
}: {
  unit: Unit;
  project: Project;
  result: Result | null;
  onApply: (unit: Unit) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  issueTarget?: EquipmentTarget;
  status?: EquipmentStatus;
  onNavigateIssue?: (target: EquipmentTarget) => void;
}) {
  const settings = project.thermo ?? defaultThermo;
  const context = thermoContext(settings);
  const [params, setParams] = useState(() => setupParams(unit, context.ids));
  const display = useUnitSystem();
  const [name, setName] = useState(unit.name);
  const [tab, setTab] = useState<"setup" | "results">(
    issueTarget?.section === "results" ? "results" : "setup",
  );
  const [lastTarget, setLastTarget] = useState(issueTarget);
  const root = useRef<HTMLElement>(null);
  const clearNavigation = useRef<(() => void) | undefined>(undefined);
  if (lastTarget !== issueTarget) {
    setLastTarget(issueTarget);
    if (issueTarget)
      setTab(issueTarget.section === "results" ? "results" : "setup");
  }
  useEffect(() => {
    if (root.current && issueTarget)
      clearNavigation.current = revealEquipmentIssue(root.current, issueTarget);
    return () => clearNavigation.current?.();
  }, [issueTarget]);
  function navigate(target: EquipmentTarget) {
    if (target.section === "thermodynamics" && onNavigateIssue) {
      onNavigateIssue(target);
      return;
    }
    setTab(target.section === "results" ? "results" : "setup");
    clearNavigation.current?.();
    if (root.current)
      clearNavigation.current = revealEquipmentIssue(root.current, target);
  }
  const [appliedUnit, setAppliedUnit] = useState(unit);
  // Refresh the draft after an applied edit without losing the selected tab.
  if (appliedUnit !== unit) {
    setAppliedUnit(unit);
    setParams(setupParams(unit, context.ids));
    setName(unit.name);
  }
  const thermal = unit.kind === "Heater" || unit.kind === "Cooler";
  const dirty =
    name !== unit.name ||
    JSON.stringify(params) !== JSON.stringify(unit.params);
  const formId = `equipment-form-${unit.id}`;
  const components = context.ids.map((id) => context.catalog.get(id).name);
  const labels = componentNames(settings);
  const chemicals = context.ids.map((id) => context.catalog.get(id));
  const multiComposition = context.ids.length > 2 || !!params.composition;
  const composition = Object.fromEntries(
    context.ids.map((id, i) => [
      id,
      params.composition?.[id] ??
        (params.composition
          ? 0
          : i === 0
            ? params.fractionA
            : i === 1
              ? 1 - params.fractionA
              : 0),
    ]),
  );
  const compositionTotal = Object.values(composition).reduce(
    (sum, n) => sum + n,
    0,
  );
  const [validationError, setValidationError] = useState("");
  const setupIssues = [
    ...equipmentSetupIssues(project, { ...unit, name, params }),
    ...(status?.issues.filter(
      (issue) =>
        issue.target.section === "connections" ||
        (!dirty && issue.kind === "error"),
    ) ?? []),
  ].filter(
    (issue, index, issues) =>
      issues.findIndex(
        (entry) =>
          entry.message === issue.message &&
          entry.target.reactionId === issue.target.reactionId,
      ) === index,
  );
  function field(
    key: NumericParam,
    label: string,
    min: number,
    max: number,
    step: string,
    suffix?: string,
  ) {
    const dimension = parameterDimensions[key];
    const title = suffix ? label.slice(0, label.lastIndexOf(" (")) : label;
    const displayedSuffix = dimension
      ? display.quantityLabel(dimension)
      : suffix;
    return (
      <label className="equipment-field" data-setup-field={key}>
        <span>{title}</span>
        <span className="equipment-quantity">
          {dimension ? (
            <EngineeringInput
              className="input"
              aria-label={`${title} (${displayedSuffix})`}
              required
              dimension={dimension}
              min={min}
              max={max}
              step={step === "any" ? undefined : Number(step)}
              value={params[key]}
              onValueChange={(value) => setParams({ ...params, [key]: value })}
            />
          ) : (
            <NumberInput
              className="input"
              aria-label={label}
              required
              min={min}
              max={max}
              step={step === "any" ? 0.001 : Number(step)}
              integer={key === "trayCount"}
              value={params[key]}
              onValueChange={(value) => setParams({ ...params, [key]: value })}
            />
          )}
          {displayedSuffix && (
            <span className="equipment-unit" aria-hidden="true">
              {displayedSuffix}
            </span>
          )}
        </span>
      </label>
    );
  }
  const temperature = field(
    "temperature",
    "Temperature (K)",
    250,
    800,
    "1",
    "K",
  );
  return (
    <aside className="panel inspector equipment-editor" ref={root}>
      <div className="equipment-editor-top">
        <div
          className="equipment-editor-tabs"
          role="tablist"
          aria-label="Equipment view"
        >
          {(["setup", "results"] as const).map((view) => (
            <button
              type="button"
              role="tab"
              id={`equipment-tab-${view}`}
              aria-controls={`equipment-panel-${view}`}
              aria-selected={tab === view}
              tabIndex={tab === view ? 0 : -1}
              key={view}
              onClick={() => setTab(view)}
              onKeyDown={(event) => {
                if (
                  !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                    event.key,
                  )
                )
                  return;
                event.preventDefault();
                const next =
                  event.key === "Home"
                    ? "setup"
                    : event.key === "End"
                      ? "results"
                      : view === "setup"
                        ? "results"
                        : "setup";
                setTab(next);
                document.getElementById(`equipment-tab-${next}`)?.focus();
              }}
            >
              {view === "setup" ? "Setup" : "Results"}
              {view === "results" && result?.equipment[unit.id] && (
                <span
                  className={`equipment-result-dot${dirty || !result.converged ? " is-stale" : ""}`}
                />
              )}
            </button>
          ))}
        </div>
        <span
          className={`equipment-save-state${dirty ? " is-dirty" : ""}`}
          role="status"
        >
          {dirty ? "Unsaved changes" : "No pending changes"}
        </span>
      </div>
      <div className="equipment-editor-content">
        <div
          className="equipment-tab-panel equipment-setup-panel"
          role="tabpanel"
          id="equipment-panel-setup"
          aria-labelledby="equipment-tab-setup"
          hidden={tab !== "setup"}
        >
          <form
            id={formId}
            className="equipment-form"
            data-setup-section="settings"
            onInvalid={(event) => {
              setTab("setup");
              const input = event.target as HTMLElement;
              requestAnimationFrame(() => input.focus());
            }}
            onSubmit={(event) => {
              event.preventDefault();
              const issues =
                params.packedBed && unit.kind === "PBR"
                  ? packedBedIssues(params.packedBed, chemicals)
                  : [];
              if (
                unit.kind === "Feed" &&
                multiComposition &&
                Math.abs(compositionTotal - 1) > 1e-8
              )
                issues.push("Feed mole fractions must sum to 1.");
              if (issues.length) {
                setValidationError(issues[0]);
                setTab("setup");
                return;
              }
              setValidationError("");
              onApply({
                ...unit,
                name: name.trim(),
                params:
                  unit.kind === "Feed" && multiComposition
                    ? {
                        ...params,
                        composition,
                        fractionA: composition[context.ids[0]],
                      }
                    : params,
              });
              const submitter = (event.nativeEvent as SubmitEvent).submitter;
              if (submitter?.dataset.editorAction === "calculate")
                setTab("results");
            }}
          >
            <div
              className="equipment-identity"
              role="group"
              aria-label="Equipment identity"
            >
              <label>
                Tag
                <input className="input" value={unit.id} readOnly />
              </label>
              <label data-setup-field="name">
                Name
                <input
                  className="input"
                  aria-label="Equipment name"
                  value={name}
                  maxLength={60}
                  required
                  pattern=".*\S.*"
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
            </div>
            {validationError && (
              <p className="reaction-issues" role="alert">
                {validationError}
              </p>
            )}
            {setupIssues.length > 0 && (
              <section
                className="equipment-setup-issues"
                aria-label="Equipment issues"
              >
                <h3>
                  {setupIssues.some((issue) => issue.kind === "error")
                    ? "Review equipment errors"
                    : "Complete setup"}
                </h3>
                <ul className="equipment-issue-list">
                  {setupIssues.map((issue, index) => (
                    <li key={`${issue.message}-${index}`}>
                      <button
                        type="button"
                        onClick={() => navigate(issue.target)}
                      >
                        {issue.message}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {unit.kind === "Feed" && (
              <>
                <Section title="Feed conditions">
                  <fieldset className="equipment-state">
                    <legend>State properties</legend>
                    <div className="equipment-field-grid">
                      {temperature}
                      {field(
                        "pressure",
                        "Pressure (Pa)",
                        10000,
                        2000000,
                        "any",
                        "Pa",
                      )}
                    </div>
                  </fieldset>
                  {field(
                    "flow",
                    "Molar flow (mol/s)",
                    0.001,
                    1000,
                    "any",
                    "mol/s",
                  )}
                </Section>
                <Section title="Composition">
                  {multiComposition ? (
                    <>
                      <div className="equipment-composition-heading">
                        <span>Component</span>
                        <span>Mole fraction</span>
                      </div>
                      {chemicals.map((chemical) => (
                        <div
                          className="equipment-composition-row"
                          key={chemical.id}
                        >
                          <span>{chemical.name}</span>
                          <NumberInput
                            className="input"
                            required
                            min={0}
                            max={1}
                            step={0.01}
                            aria-label={`Mole fraction ${chemical.name}`}
                            value={composition[chemical.id]}
                            onValueChange={(value) =>
                              setParams({
                                ...params,
                                composition: {
                                  ...composition,
                                  [chemical.id]: value,
                                },
                              })
                            }
                          />
                        </div>
                      ))}
                      <div className="reaction-actions">
                        <output aria-label="Total mole fraction">
                          Total:{" "}
                          {Number.isFinite(compositionTotal)
                            ? Number(compositionTotal.toFixed(8))
                            : "—"}
                        </output>
                        <button
                          type="button"
                          className="btn btn-sm"
                          disabled={
                            !Number.isFinite(compositionTotal) ||
                            compositionTotal <= 0
                          }
                          onClick={() =>
                            setParams({
                              ...params,
                              composition: Object.fromEntries(
                                Object.entries(composition).map(([id, n]) => [
                                  id,
                                  n / compositionTotal,
                                ]),
                              ),
                            })
                          }
                        >
                          Normalize composition
                        </button>
                      </div>
                      <p className="equipment-help">
                        Specify every feed component. Fractions must sum to 1;
                        products may enter with zero flow.
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="equipment-composition-heading">
                        <span>Component</span>
                        <span>Mole fraction</span>
                      </div>
                      <div className="equipment-composition-row">
                        <span>{components[0]}</span>
                        {field(
                          "fractionA",
                          `Mole fraction ${labels[0]}`,
                          0,
                          1,
                          "0.01",
                        )}
                      </div>
                      <div className="equipment-composition-row">
                        <span>{components[1]}</span>
                        <output aria-label={`Mole fraction ${labels[1]}`}>
                          {Number.isFinite(params.fractionA)
                            ? Number((1 - params.fractionA).toFixed(8))
                            : "—"}
                        </output>
                      </div>
                      <p className="equipment-help">
                        {components[1]} is the balance to a total mole fraction
                        of 1.
                      </p>
                    </>
                  )}
                </Section>
              </>
            )}
            {thermal && (
              <Section
                title={
                  unit.kind === "Heater"
                    ? "Heating specification"
                    : "Cooling specification"
                }
              >
                <label
                  className="equipment-field"
                  data-setup-field="thermalMode"
                >
                  Thermal specification
                  <select
                    className="select"
                    value={params.thermalMode}
                    onChange={(event) =>
                      setParams({
                        ...params,
                        thermalMode: event.target
                          .value as Unit["params"]["thermalMode"],
                      })
                    }
                  >
                    <option value="temperature">Outlet temperature</option>
                    <option
                      value="duty"
                      disabled={settings.modelId !== "ideal-gas"}
                    >
                      Specified heat duty
                    </option>
                  </select>
                </label>
                {params.thermalMode === "temperature"
                  ? temperature
                  : field(
                      "heatDuty",
                      "Heat duty (W)",
                      unit.kind === "Heater" ? 0 : -1e8,
                      unit.kind === "Cooler" ? 0 : 1e8,
                      "any",
                      "W",
                    )}
                <p className="equipment-help">
                  {params.thermalMode === "duty"
                    ? "Positive duty adds heat; negative duty removes heat. Outlet temperature is calculated."
                    : "Heat duty is calculated from the inlet and outlet enthalpy."}
                  {settings.modelId !== "ideal-gas" &&
                    " Specified duty requires the ideal-gas model. Use outlet temperature with this model."}
                </p>
              </Section>
            )}
            {unit.kind === "PBR" && (
              <>
                <Section title="Operating conditions">
                  <div className="equipment-field-grid">{temperature}</div>
                  <p className="equipment-help">
                    Isothermal operation. Inlet pressure comes from the
                    connected stream.
                  </p>
                </Section>
                {params.packedBed && (
                  <PackedBedSetup
                    value={params.packedBed}
                    chemicals={chemicals}
                    temperature={params.temperature}
                    onChange={(packedBed) => {
                      setParams({ ...params, packedBed });
                      setValidationError("");
                    }}
                  />
                )}
              </>
            )}
            {unit.kind === "Splitter" && (
              <Section title="Outlet split">
                <p className="equipment-help">
                  Both outlets retain the inlet composition, temperature and
                  pressure.
                </p>
                <div className="equipment-field-grid">
                  <label className="equipment-field">
                    Primary outlet fraction
                    <output className="equipment-readonly">
                      {Number.isFinite(params.recycleFraction)
                        ? Number((1 - params.recycleFraction).toFixed(8))
                        : "—"}
                    </output>
                  </label>
                  {field(
                    "recycleFraction",
                    "Secondary outlet fraction",
                    0,
                    0.95,
                    "0.05",
                  )}
                </div>
              </Section>
            )}
            {unit.kind === "Distillation" && (
              <>
                <DistillationSetup
                  params={params}
                  settings={settings}
                  onChange={setParams}
                />
                {!params.distillation && (
                  <Section title="Separation specification">
                    <p className="equipment-model-badge">
                      Simplified separation ·{" "}
                      {settings.modelId === "ideal-gas"
                        ? "single equilibrium contact"
                        : "single TP flash"}
                    </p>
                    {settings.modelId === "ideal-gas" ? (
                      <div className="equipment-field-grid">
                        {field(
                          "relativeVolatility",
                          context.ids.length > 2
                            ? "Relative volatility: first / remaining components"
                            : "Relative volatility A/B",
                          1.01,
                          20,
                          "0.01",
                        )}
                        {field(
                          "distillateFraction",
                          "Distillate fraction",
                          0.01,
                          0.99,
                          "0.01",
                        )}
                      </div>
                    ) : (
                      <p className="equipment-help">
                        The feed temperature and pressure determine the phase
                        split. Vapor leaves outlet 1; liquid leaves outlet 2.
                      </p>
                    )}
                  </Section>
                )}
                <Section
                  title={
                    params.distillation?.method === "mesh"
                      ? "Equilibrium trays"
                      : "Column appearance"
                  }
                >
                  {field(
                    "trayCount",
                    params.distillation?.method === "mesh"
                      ? "Equilibrium trays (2D & 3D)"
                      : "Visible trays (2D & 3D)",
                    2,
                    80,
                    "1",
                  )}
                  <p className="equipment-help">
                    {params.distillation?.method === "mesh"
                      ? "This count sets the solved equilibrium trays and resizes both views. Condenser and reboiler are additional stages."
                      : "Visible trays resize both column views. They do not constrain the separation calculation."}
                  </p>
                </Section>
              </>
            )}
            {unit.kind === "Mixer" && (
              <Section title="Mixing conditions">
                <p className="equipment-help">
                  The outlet conserves component flows and enthalpy at the
                  lowest flowing inlet pressure. Temperature and composition are
                  calculated from the connected feeds.
                </p>
                <p className="equipment-help">
                  Connect one or more feeds to the mixer’s center on the
                  flowsheet.
                </p>
              </Section>
            )}
            {unit.kind === "Product" && (
              <Section title="Product stream">
                <p className="equipment-help">
                  Flow, composition, temperature and pressure come from the
                  connected inlet. View the calculated state in Results.
                </p>
              </Section>
            )}
            <details className="equipment-model-details">
              <summary>
                <Info size={15} />
                Model equations and assumptions
                <ChevronDown size={15} />
              </summary>
              <EquipmentModelNotes
                unit={{ ...unit, params }}
                settings={settings}
              />
            </details>
          </form>
          <Connections unit={unit} project={project} />
        </div>
        <section
          className="equipment-tab-panel equipment-results-panel"
          role="tabpanel"
          id="equipment-panel-results"
          aria-labelledby="equipment-tab-results"
          hidden={tab !== "results"}
          data-setup-section="results"
        >
          {status?.issues.some((issue) => issue.kind === "warning") && (
            <section
              className="equipment-setup-issues"
              aria-label="Calculation warnings"
              data-setup-field="warnings"
            >
              <h3>Calculation warnings</h3>
              <ul>
                {status.issues
                  .filter((issue) => issue.kind === "warning")
                  .map((issue) => (
                    <li key={issue.message}>{issue.message}</li>
                  ))}
              </ul>
            </section>
          )}
          <EquipmentResults
            unit={unit}
            project={project}
            result={result}
            dirty={dirty}
          />
        </section>
      </div>
      <footer className="equipment-editor-footer">
        <button className="btn btn-sm" type="button" onClick={onDuplicate}>
          <Copy size={14} />
          Duplicate
        </button>
        <button
          className="btn btn-sm danger"
          type="button"
          aria-label="Delete equipment"
          onClick={onDelete}
        >
          <Trash2 size={14} />
        </button>
        <button
          className="btn btn-sm equipment-apply"
          type="submit"
          form={formId}
          aria-keyshortcuts="Control+s Meta+s"
          onClick={() => setTab("setup")}
        >
          Apply conditions
        </button>
        <button
          className="btn btn-primary btn-sm"
          type="submit"
          form={formId}
          data-editor-action="calculate"
          aria-keyshortcuts="Control+Shift+Enter Meta+Shift+Enter"
        >
          Calculate
        </button>
      </footer>
    </aside>
  );
}
