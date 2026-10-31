import { useMemo } from "react";
import { renderToString } from "katex";
import type { Unit } from "@/domain/schema";
import { modelInfo, type ThermoSettings } from "@/domain/thermo/registry";
import { mixtureName } from "@/domain/thermo/catalog";
import "katex/dist/katex.min.css";
import { useUnitSystem } from "./useUnitSystem";

function Equation({
  children,
  inline = false,
}: {
  children: string;
  inline?: boolean;
}) {
  const html = useMemo(
    () =>
      renderToString(children, {
        displayMode: !inline,
        output: "htmlAndMathml",
        strict: "error",
        trust: false,
      }),
    [children, inline],
  );
  return (
    <span
      className={inline ? "model-math-inline" : "model-equation"}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function EquipmentModelNotes({
  unit,
  settings,
}: {
  unit: Unit;
  settings: ThermoSettings;
}) {
  const thermal = unit.kind === "Heater" || unit.kind === "Cooler";
  const idealGas = settings.modelId === "ideal-gas";
  const catalystWeight = unit.params.reactorMode === "catalyst-weight";
  return (
    <div className="model-notes">
      <h3>{modelInfo(settings.modelId).name}</h3>
      <ul>
        <li>Components: {mixtureName(settings)}.</li>
        <li>{modelInfo(settings.modelId).limitations}</li>
        {settings.mixture === "demo" ? (
          <li>
            Synthetic species; equal{" "}
            <Equation inline>{String.raw`M = 28\,\mathrm{g/mol}`}</Equation>;
            constant{" "}
            <Equation
              inline
            >{String.raw`C_p = 30\,\mathrm{J/(mol\cdot K)}`}</Equation>
            .
          </li>
        ) : (
          <li>
            Component heat-capacity and vapor-pressure correlations have
            temperature limits.
          </li>
        )}
        <li>
          Vapor-only volume flow:{" "}
          <Equation inline>{String.raw`\dot V = FRT/P`}</Equation>; total molar
          flow <Equation inline>{String.raw`F = \sum_i F_i`}</Equation> in
          mol/s.
        </li>
      </ul>
      {unit.kind === "Feed" && (
        <>
          <Equation>{String.raw`F_i = F z_i,\qquad \sum_i z_i = 1`}</Equation>
          <ul>
            <li>Specified flow, composition, temperature and pressure.</li>
          </ul>
        </>
      )}
      {unit.kind === "Product" && (
        <>
          <Equation>{String.raw`F_{i,\mathrm{product}} = F_{i,\mathrm{in}},\qquad Q = 0`}</Equation>
          <ul>
            <li>Receives the inlet state unchanged.</li>
          </ul>
        </>
      )}
      {unit.kind === "PBR" && unit.params.packedBed && (
        <>
          <Equation>{String.raw`\frac{dF_i}{dW} = \sum_j \nu_{ij}\frac{r_j}{|\nu_{b,j}|},\qquad Q = \dot H_{\mathrm{out}} - \dot H_{\mathrm{in}}`}</Equation>
          <ul>
            <li>
              Enabled reactions are solved together in stoichiometric extent
              coordinates. Rates specify net disappearance of each reaction’s
              basis reactant, per kg of catalyst.
            </li>
            <li>
              Isothermal gas model. Pressure follows the specified linear drop;
              volume flow is calculated from local ideal-gas conditions or held
              at the entered value.
            </li>
            <li>
              Power-law or general kinetics, including explicit reverse and
              inhibition terms. Reference-temperature Arrhenius scaling uses
              user-specified activation energies.
            </li>
            <li>
              Conversion sizing finds the first resolved target crossing.
              Unreachable targets, nonphysical depletion and unresolved stiff
              kinetics are reported as calculation errors.
            </li>
            <li>
              Atom and mass balance, component availability and formation
              enthalpy are checked. No phase equilibrium, transport resistance,
              catalyst deactivation or mechanical bed design is modeled.
            </li>
          </ul>
        </>
      )}
      {unit.kind === "PBR" && !unit.params.packedBed && (
        <>
          {catalystWeight ? (
            <Equation>{String.raw`\frac{dF_A}{dW} = -k(T)C_A,\qquad C_A = \frac{F_AP}{FRT}`}</Equation>
          ) : (
            <Equation>{String.raw`X = 1 - e^{-k(T)\tau}`}</Equation>
          )}
          <Equation>{String.raw`k(T) = k_{450}\exp\!\left[-\frac{E_a}{R}\left(\frac{1}{T}-\frac{1}{450\,\mathrm K}\right)\right]`}</Equation>
          <ul>
            <li>
              Isothermal <Equation inline>{String.raw`A \to B`}</Equation> at
              fixed pressure; synthetic A/B and ideal gas only.
            </li>
            <li>
              Teaching kinetics:{" "}
              <Equation
                inline
              >{String.raw`E_a = 40\,\mathrm{kJ/mol}`}</Equation>
              ;{" "}
              <Equation
                inline
              >{String.raw`\Delta H_r = -20\,\mathrm{kJ/mol}`}</Equation>
              .
            </li>
            {catalystWeight ? (
              <li>
                Integrates over catalyst mass <Equation inline>W</Equation>{" "}
                (kg); specified{" "}
                <Equation inline>{String.raw`k_{450}`}</Equation> in{" "}
                <Equation
                  inline
                >{String.raw`\mathrm{m^3/(kg\cdot s)}`}</Equation>
                .
              </li>
            ) : (
              <li>
                <Equation
                  inline
                >{String.raw`k_{450} = 0.1\,\mathrm{s^{-1}}`}</Equation>
                ; specified residence time{" "}
                <Equation inline>{String.raw`\tau`}</Equation> is independent of
                flow.
              </li>
            )}
            <li>
              Duty includes reaction and sensible heat; no catalyst transport or
              deactivation.
            </li>
          </ul>
        </>
      )}
      {thermal && (
        <>
          <Equation>{String.raw`Q = \dot H_{\mathrm{out}} - \dot H_{\mathrm{in}}`}</Equation>
          {idealGas && (
            <Equation>{String.raw`T_{\mathrm{out}} = T_{\mathrm{in}} + \frac{Q}{\sum_i F_i C_{p,i}}`}</Equation>
          )}
          <ul>
            <li>Duty in W; positive adds heat, negative removes heat.</li>
            <li>Outlet-temperature mode uses the selected enthalpy model.</li>
            <li>
              Specified duty: ideal gas only, constant heat capacities, no phase
              change.
            </li>
          </ul>
        </>
      )}
      {unit.kind === "Mixer" && (
        <>
          <Equation>{String.raw`\begin{aligned}F_{i,\mathrm{out}} &= \sum_j F_{i,j} \\ \dot H_{\mathrm{out}} &= \sum_j \dot H_j \\ P_{\mathrm{out}} &= \min_j P_j\end{aligned}`}</Equation>
          <ul>
            <li>
              Conserves component flows and enthalpy; no heat transfer or shaft
              work.
            </li>
            <li>
              Pressure uses flowing inlets only; zero-flow inlets are ignored.
            </li>
          </ul>
        </>
      )}
      {unit.kind === "Distillation" &&
        (idealGas ? (
          <>
            <Equation>{String.raw`y = \frac{\alpha x}{1+(\alpha-1)x},\qquad z = dy+(1-d)x`}</Equation>
            <ul>
              <li>
                One equilibrium contact; fixed distillate cut and relative
                volatility.
              </li>
              <li>
                <Equation inline>d</Equation>: distillate fraction;{" "}
                <Equation inline>{String.raw`x,\ y,\ z`}</Equation>: A fractions
                in bottoms, distillate and feed.
              </li>
              <li>No latent heat, stages or reflux calculation.</li>
            </ul>
          </>
        ) : (
          <>
            <Equation>
              {settings.modelId === "ideal-solution"
                ? String.raw`y_iP = x_iP_i^{\mathrm{sat}}(T)`
                : String.raw`y_iP = x_i\gamma_iP_i^{\mathrm{sat}}(T)`}
            </Equation>
            <Equation>{String.raw`\begin{aligned}F_{i,1} &= \beta F y_i \\ F_{i,2} &= (1-\beta)F x_i\end{aligned}`}</Equation>
            <ul>
              <li>
                One TP flash at feed temperature and pressure; no stages or
                reflux.
              </li>
              <li>
                Outlet 1: vapor; outlet 2: liquid.{" "}
                <Equation inline>{String.raw`\beta`}</Equation>: vapor fraction.
              </li>
              {settings.modelId === "modified-unifac-2.0" && (
                <li>Activity coefficients from Modified UNIFAC 2.0.</li>
              )}
            </ul>
          </>
        ))}
      {unit.kind === "Splitter" && (
        <>
          <Equation>{String.raw`\begin{aligned}F_{i,1} &= (1-f)F_{i,\mathrm{in}} \\ F_{i,2} &= fF_{i,\mathrm{in}}\end{aligned}`}</Equation>
          <ul>
            <li>
              <Equation inline>f</Equation>: outlet 2 fraction, applied equally
              to each component.
            </li>
            <li>Temperature, pressure and phase preserved; zero duty.</li>
          </ul>
        </>
      )}
      <ul>
        <li>
          {unit.params.packedBed
            ? "Prescribed pressure drop; no hydraulic bed sizing or mechanical certification."
            : "No pressure-drop model or mechanical certification."}
        </li>
      </ul>
    </div>
  );
}

export function CatalystProfile({
  profile,
}: {
  profile: { catalystMass: number; conversion: number }[];
}) {
  const display = useUnitSystem();
  if (!profile.length) return null;
  const last = profile[profile.length - 1];
  const maxMass = last.catalystMass || 1;
  const minConversion = Math.min(
    0,
    ...profile.map((point) => point.conversion),
  );
  const maxConversion = Math.max(
    1,
    ...profile.map((point) => point.conversion),
  );
  const conversionRange = maxConversion - minConversion;
  const label = (value: number) => Number((100 * value).toPrecision(4));
  const points = profile
    .map(
      (p) =>
        `${42 + (p.catalystMass / maxMass) * 204},${130 - ((p.conversion - minConversion) / conversionRange) * 104}`,
    )
    .join(" ");
  return (
    <figure className="catalyst-profile">
      <figcaption>Conversion along catalyst mass</figcaption>
      <svg
        viewBox="0 0 280 182"
        role="img"
        aria-label={`Conversion reaches ${(last.conversion * 100).toFixed(2)} percent at ${display.format(last.catalystMass, "mass")} of catalyst`}
      >
        <path d="M42 26H246M42 78H246M42 130H246" className="profile-grid" />
        <path d="M42 26V130H246" className="profile-axis" />
        <polyline points={points} className="profile-line" />
        <text x="34" y="30" textAnchor="end">
          {label(maxConversion)}
        </text>
        <text x="34" y="82" textAnchor="end">
          {label((minConversion + maxConversion) / 2)}
        </text>
        <text x="34" y="134" textAnchor="end">
          {label(minConversion)}
        </text>
        <text x="42" y="149" textAnchor="middle">
          0
        </text>
        {last.catalystMass > 0 && (
          <text x="246" y="149" textAnchor="middle">
            {Number(display.value(last.catalystMass, "mass").toPrecision(5))}
          </text>
        )}
        <text x="42" y="14">
          Conversion (%)
        </text>
        <text x="144" y="173" textAnchor="middle">
          Catalyst mass ({display.quantityLabel("mass")})
        </text>
      </svg>
    </figure>
  );
}
