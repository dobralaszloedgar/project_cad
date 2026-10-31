import type { Unit } from "@/domain/schema";
import { modelInfo, type ThermoSettings } from "@/domain/thermo/registry";
import { sampleMixtures } from "@/domain/thermo/catalog";

export function EquipmentModelNotes({
  unit,
  settings,
}: {
  unit: Unit;
  settings: ThermoSettings;
}) {
  const thermal = unit.kind === "Heater" || unit.kind === "Cooler";
  return (
    <div className="model-notes">
      <h3>{modelInfo(settings.modelId).name}</h3>
      <p>Components A / B: {sampleMixtures[settings.mixture].name}.</p>
      <p>{modelInfo(settings.modelId).limitations}</p>
      {settings.mixture === "demo" ? (
        <>
          <p>
            A and B are synthetic species with equal molecular weight (28
            g/mol).
          </p>
          <p>Constant heat capacity: 30 J/(mol·K). Ideal gas volume: nRT/P.</p>
        </>
      ) : (
        <p>
          Sample constant heat capacities. Vapor pressures use
          temperature-bounded correlations. Volume is reported only for a wholly
          vapor stream.
        </p>
      )}
      {unit.kind === "PBR" && (
        <>
          <p>
            Isothermal A → B with equal molecular weights. Eₐ = 40 kJ/mol; ΔHᵣ =
            −20 kJ/mol. Heat duty includes reaction and sensible heat. These
            kinetic constants describe a synthetic teaching reaction.
          </p>
          {unit.params.reactorMode === "catalyst-weight" ? (
            <p>
              dFₐ/dW = −k(T)Cₐ; Cₐ = FₐP/(FRT). W is catalyst mass in kg, F is
              total molar flow in mol/s and k is in m³/(kg·s). k(T) = k₄₅₀
              exp[−40000/R (1/T − 1/450)]. The profile integrates species flow
              along the catalyst mass at fixed T and P.
            </p>
          ) : (
            <p>
              X = 1 − exp(−kτ), with k(450 K) = 0.1 s⁻¹ and k(T) = 0.1
              exp[−40000/R (1/T − 1/450)]. User-set residence time is
              independent of flow.
            </p>
          )}
          <p>No catalyst transport, deactivation or pressure-drop model.</p>
        </>
      )}
      {thermal && (
        <p>
          Q = Hout − Hin, in W. Positive Q adds heat. Outlet-temperature mode
          uses the selected enthalpy method. Specified-duty mode supports ideal
          gas: Tout = Tin + Q / Σ(FᵢCpᵢ), with constant component heat
          capacities and no phase change.
        </p>
      )}
      {unit.kind === "Mixer" && (
        <p>
          Fᵢ,out = Σ Fᵢ,in and Hout = Σ Hin. Outlet pressure equals the lowest
          flowing inlet pressure; no shaft work or heat transfer.
        </p>
      )}
      {unit.kind === "Distillation" && settings.modelId === "ideal-gas" ? (
        <p>
          One ideal equilibrium contact: y = αx / (1 + (α − 1)x). Fixed cut; no
          latent heat or stage design.
        </p>
      ) : null}
      {unit.kind === "Distillation" && settings.modelId !== "ideal-gas" && (
        <p>
          One TP equilibrium flash at feed temperature and pressure. Vapor
          leaves the first outlet; liquid leaves the second. No column stages or
          reflux calculation.
        </p>
      )}
      {unit.kind === "Splitter" ? (
        <p>
          Fᵢ,out2 = f Fᵢ,in and Fᵢ,out = (1 − f) Fᵢ,in. Temperature, pressure
          and phase state are preserved. This is a proportional flow split with
          zero heat duty.
        </p>
      ) : null}
      <p>No pressure drop or mechanical certification.</p>
    </div>
  );
}

export function CatalystProfile({
  profile,
}: {
  profile: { catalystMass: number; conversion: number }[];
}) {
  if (!profile.length) return null;
  const last = profile[profile.length - 1];
  const maxMass = last.catalystMass || 1;
  const points = profile
    .map(
      (p) =>
        `${42 + (p.catalystMass / maxMass) * 204},${130 - p.conversion * 104}`,
    )
    .join(" ");
  return (
    <figure className="catalyst-profile">
      <figcaption>Conversion along catalyst mass</figcaption>
      <svg
        viewBox="0 0 280 182"
        role="img"
        aria-label={`Conversion reaches ${(last.conversion * 100).toFixed(2)} percent at ${last.catalystMass} kilograms of catalyst`}
      >
        <path d="M42 26H246M42 78H246M42 130H246" className="profile-grid" />
        <path d="M42 26V130H246" className="profile-axis" />
        <polyline points={points} className="profile-line" />
        <text x="34" y="30" textAnchor="end">
          100
        </text>
        <text x="34" y="82" textAnchor="end">
          50
        </text>
        <text x="34" y="134" textAnchor="end">
          0
        </text>
        <text x="42" y="149" textAnchor="middle">
          0
        </text>
        {last.catalystMass > 0 && (
          <text x="246" y="149" textAnchor="middle">
            {last.catalystMass}
          </text>
        )}
        <text x="42" y="14">
          Conversion (%)
        </text>
        <text x="144" y="173" textAnchor="middle">
          Catalyst mass (kg)
        </text>
      </svg>
    </figure>
  );
}
