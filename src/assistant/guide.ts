/** Shared by provider instructions, discovery tools, HTTP and the generated doc. */
export const AI_GUIDE_VERSION = "project-cad-ai-guide-v1";

export const engineeringGuidance = `ENGINEERING CONTRACT
All serialized inputs and outputs use SI, regardless of the user's display units:
temperature K; pressure and pressure drop Pa; molar flow mol/s; duty W;
residence time s; catalyst mass kg; length m; density kg/m3; surface tension N/m.
Compositions, recoveries, area fractions and reflux ratios are dimensionless.
For example, 20 mN/m in the engineering UI is 0.020 N/m in JSON.

Use get_capabilities (or GET /api/capabilities) for exact current schemas,
defaults, bounds, ports, model IDs and tools. Unknown fields are rejected.
Equipment kinds: Feed, Product, Mixer, Splitter, Heater, Cooler, PBR, Distillation.
Feed has out; Product has in; Mixer has in/in2 and out; Splitter and Distillation
have in and out/out2; other equipment has in/out. Mixer and reaction-set PBR
inlets accept multiple streams; other ports accept one stream. Distillation out
is distillate and out2 is bottoms. One recycle loop returning to a Mixer is
supported; independent multiple loops are rejected. Every unit must lie on a
Feed-to-Product path and all required ports must be connected before simulation.
An incomplete but structurally valid graph may be previewed and saved.

Projects support 2-40 components, 40 units and 80 streams. Feed composition maps
component IDs to nonnegative mole fractions or ratios, with a positive total.
Ratios are normalized automatically for simulation. Legacy fractionA refers to
the first two components. New feeds added in the UI track unspecified inputs in
missingInputs; updating the corresponding params clears those entries. Simulation
requires all missing inputs to be supplied. Stream components contains molar flows for all species;
a and b are compatibility aliases for the first two, not additional flows.
Use saved catalog component records and preserve their provenance. Model IDs:
ideal-gas, ideal-solution (Raoult), modified-unifac-2.0. Synthetic demo A/B,
aromatics, aqueous and catalog mixtures are available. Never silently change
the thermodynamic model. Liquid models use low-pressure VLE and source property
ranges; no liquid-liquid stability search. Missing properties are not zero.

PBR params.packedBed supports balanced gas reaction sets, supplied power-law or
bounded expression kinetics, catalyst mass or target-conversion sizing,
prescribed pressure drop, and ideal-gas or constant-volume flow. Real reacting
species require formation enthalpies. Never invent kinetics or reaction data.
Without packedBed, residence-time and catalyst-weight modes are synthetic,
isothermal A -> B teaching models. Heater/Cooler thermalMode is temperature or
duty; heatDuty is positive for heating and negative for cooling. Specified-duty
operation supports ideal gas only. The active mode determines which input is used.

DISTILLATION
No params.distillation: legacy single contact (ideal gas) or TP flash (liquid
model). Set method to fug or mesh to select an explicit column calculation.
Set distillation.condenserType to total (default for older projects) or partial
(equilibrium condenser). Total draws liquid distillate; partial draws vapor in
equilibrium with liquid reflux. The selection also changes the 2D/3D overhead
piping. In FUG, the specified distillateTemperature must support vapor for a
partial condenser; stage estimates include that condenser and the reboiler.
FUG needs adjacent lightKey/heavyKey IDs, supplied relativeVolatilities for every
active feed component, lightRecovery, heavyRecovery and feedLiquidFraction q.
Use refluxMode multiplier with refluxMultiplier, or ratio with refluxRatio.
Never invent relative volatilities. distillateTemperature/bottomsTemperature set
product states. FUG estimates minimum/theoretical stages and minimum reflux;
it has no stage profile, per-tray hydraulics or separate end duties.

MESH needs Raoult or Modified UNIFAC with supported real chemicals, one feed,
either a saturated total or equilibrium partial condenser, and kettle reboiler.
Ideal gas is unsupported.
params.trayCount is 2-80 equilibrium trays, excluding condenser/reboiler.
params.pressure is top pressure; distillation.pressureDrop is the specified
total pressure increase down the column. Set feedTray (1 is top, <= trayCount),
refluxRatio and distillateFlow (positive and less than feed molar flow).
maxIterations and tolerance control the solve. It reports stage temperatures,
pressures, phase compositions/flows, residuals and both end duties. No side
draws, tray efficiencies or hydraulic feedback. Tray count changes the MESH
equations; it is visual only in FUG and legacy modes. Inactive mode settings
remain stored when switching methods.

SIEVE-TRAY HYDRAULICS
Set params.distillation.hydraulics.enabled=true in MESH. The supported trayType
is sieve: a clean, level, single-pass, nonfoaming preliminary rating. Geometry
defaults are presets, not a validated design for a specific tower. Supply both
liquidDensity and surfaceTension explicitly; never invent these properties.
The supplied liquid properties are constant across trays. Vapor density uses
the solved composition, pressure, temperature and ideal-gas relation.

Hydraulic field       SI unit     Allowed range       Default
enabled              boolean     true/false          true
trayType             string      sieve               sieve
diameter             m           0.15-12             1.2
traySpacing          m           0.30-0.90           0.46
downcomerFraction     fraction    0.05-0.25           0.12
holeAreaFraction      fraction    0.10-0.15           0.10
holeDiameter         m           0.003-0.0127        0.005
weirHeight           m           0.015-0.10          0.05
downcomerClearance   m           0.005-0.10          0.04
dischargeCoefficient fraction    0.60-0.90           0.75
liquidDensity        kg/m3       100-2500            none
surfaceTension       N/m         0.001-0.10          none
downcomerClearance must not exceed weirHeight. downcomerFraction is the area
fraction of one downcomer; holeAreaFraction is the open fraction of active area.

The rating is evaluated after MESH. It NEVER changes tray efficiency, pressure
profile, product purity, product flow or duties. pressureDropPa in its results
is diagnostic and is not fed into distillation.pressureDrop. Changing diameter
and spacing changes the rating and 3D geometry, not the separation solution.
Disabled/omitted hydraulics produces no rating; FUG/legacy has no per-tray rating.
Missing liquid properties gives an unavailable rating with warnings, even when
the separation converged. Out-of-correlation metrics are null, not all-clear.
There is no predicted weeping/entrainment mass rate, choke-flooding model,
dynamic liquid inventory or CFD. See docs/DISTILLATION.txt for correlations,
sources and numerical validity ranges.

RESULTS AND HONEST REPORTING
HTTP POST /api/simulate returns the Result directly. The assistant simulate tool
wraps it as {projectId, revision, preview, result}. Always check converged,
warnings, residual, massResidual and energyResidual. HTTP 200 means the request
was evaluated, not that convergence or acceptable hydraulics was established.
Report nonconvergence and unavailable/partial data; do not invent outputs.
streams[edgeId] holds stream states; properties[edgeId] holds phase properties;
equipment[unitId] holds duty and model-specific results. PBR packed-bed outputs
are at equipment[id].packedBed. Column outputs are at equipment[id].distillation;
check method before accessing method-specific fields. MESH componentIds defines
the ordering of every composition array. Stages include condenser, tray and
reboiler kinds; hydraulic stages include physical trays only, numbered from top.
MESH condenserDutyW/reboilerDutyW are separate duties; FUG lacks these fields.
Results report condenserType. MESH condenser liquidMolS is reflux; vaporMolS
is zero for total condensation or the vapor distillate rate for partial.

The hydraulic object at equipment[id].distillation.hydraulics contains version,
status (rated, partial or unavailable), resolved config, stages, limitingTray,
maxFloodFraction, minimumWeepRatio and warnings. Per-tray state is normal,
near-flooding, weeping, flooding, flooding-and-weeping or unrated. Rows include
vaporDensity, vaporVelocity, holeVelocity, liquidVolumeFlow, flowParameter,
floodVelocity, jetFloodFraction, downcomerFloodFraction, weepVelocity, weepRatio,
clearLiquidHeight, frothHeight, downcomerBackup, pressureDropPa and notes.
Flood fractions >= 1 predict flooding; >= 0.8 flags approach to flooding.
weepRatio is actual/critical hole velocity; < 1 predicts weeping. Fractions are
not percentages (0.8 means 80%). Both flooding and weeping can occur together.
Rated describes available correlations, not a claim that the design is safe.
Check status, nulls and row notes as well as state and summary extrema.

The 2D/3D app uses this same saved configuration and solver. A successful current
simulation supplies tray colors, weeping drops and flooding illustration. A tool
simulation of a proposal is a preview; apply the reviewed changes and run the
workspace simulation to refresh its display. 3D motion is illustrative, not a
quantitative fluid simulation or an API-exported render.`;

export const aiGuideText = `PROJECT CAD AI GUIDE
Version: ${AI_GUIDE_VERSION}
Source: src/assistant/guide.ts
This file is generated. Run npm run docs:ai-guide after editing the source.
GET /api/ai/guide and the get_guide tool return this same guide. Provider system
instructions include it; the server JSON planner uses its engineering contract.

AGENT WORKFLOW AND OWNERSHIP
Read get_guide, get_project and get_capabilities before engineering changes.
The application supplies a fresh get_project snapshot on each provider turn.
Use its revision verbatim; it is a canonical SHA-256 of the normalized project.
Preserve IDs and existing data unless the requested change requires replacement.
Never claim an operation ran unless its tool returned success.

Tools (all are scoped to the connected browser project):
get_guide {}: version and content of this document.
get_project {}: projectId, revision, project.
get_capabilities {}: schemas, ports, models, units, tools, API paths and limits.
get_catalog_models {}: chemical database model coverage and release.
search_chemicals {model,query?,release?,field?,sort?,page?}: search supported
  chemicals (field all/name/cas/formula; sort relevance/name; page starts at 1).
get_chemical_selection {release,ids,model}: verified 2-40 component snapshot for
  set_thermo_model with mixture:catalog. These catalog tools do not edit anything.
  Update incompatible feed compositions/reaction IDs in the same proposed plan.
preview_actions {baseRevision,plan}: validate a batch; return normalized candidate
  project and candidateRevision, counts and applied:false. No state is changed.
simulate {baseRevision,plan?}: calculate the current project or a candidate batch;
  returns actual solver output, source revision and preview flag. Does not apply.
propose_actions {baseRevision,plan}: present a validated batch in the app for user
  review; applied:false until the user clicks Apply reviewed actions.

Before proposing, preview the complete plan and simulate it when numerical
behavior matters. Re-read and rebuild after a stale-revision error; do not just
replace the revision on a stale plan. A proposal is not an applied or saved edit.
Review mode permits proposals. Read-only mode permits reading, previews and
simulations but rejects proposals. Apply reviewed actions validates the revision,
creates one history entry, and uses normal project saving/recovery. Keep the
project tab connected; the local companion has no direct file-writing tools.
Rebuild/restart a source companion to load changed tools. Distributed installers
need a new package release. Codex chats whose tool contract changed start a fresh
provider thread with recent conversation context and the current project; their
application history remains intact. Claude and Muse supply current tools each turn.
Tools do not install software, alter accounts, publish projects, control the
camera, export screenshots, or manage project folders/trash/history. Those UI
and lifecycle operations are outside this engineering API. No autonomous save
or hidden persistence endpoint is provided.

ACTION CONTRACT
plan = {summary: nonempty string, actions: array of at most 100 actions}.
Schemas from capabilities are authoritative. Actions run in order on a clone;
an invalid batch leaves the original untouched. Supported actions:
add {unit}: complete unit including id, kind, name, position:{x,y}, params.
connect {edge}: id, source, target, sourcePort, targetPort; optional name/colors.
update {id,params,name?,position?}: change equipment fields (params:{} for a
  name/position-only edit). Unspecified top-level params stay unchanged.
remove {id}: remove equipment and its incident streams.
disconnect {id}: remove a stream by its ID.
update_stream {id,changes}: patch name, colors, source/target and port fields.
rename_project {name}: rename the connected project.
set_thermo_model {modelId,mixture,extrapolate?,catalog?}: replace thermo settings;
  a catalog mixture needs a verified catalog snapshot with its component data.
Each action also includes its type, e.g. {type:"disconnect",id:"stream-1"}.

update.params.distillation and its hydraulics object are SPARSE MERGES. Changing
only diameter preserves method, reflux, feed tray, liquid properties and all
other geometry. A newly created configuration receives creation defaults.
relativeVolatilities and composition maps replace the complete maps. packedBed
replaces its complete configuration: start from the current value when editing.
Arrays replace whole arrays. Omitted fields preserve old values. Explicit
distillation:null removes the column configuration and returns to legacy mode;
hydraulics:null removes only its rating configuration; packedBed:null restores
the legacy reactor. hydraulics:{enabled:false} preserves its values for reuse.
Full projects submitted to /api/simulate use creation schemas, not patch schemas;
null deletion markers are valid only inside update actions.

Example diameter/spacing edit for an ALREADY CONFIGURED MESH column (replace ID
and revision with get_project values; retain the existing supplied properties):
{
  "baseRevision": "<revision from get_project>",
  "plan": {
    "summary": "Change tower diameter and tray spacing",
    "actions": [{
      "type": "update", "id": "D-201",
      "params": {"distillation": {"hydraulics": {
        "diameter": 1.4, "traySpacing": 0.6
      }}}
    }]
  }
}
To enable a new rating, also set method:"mesh" and hydraulics.enabled:true,
supply liquidDensity/surfaceTension from the user's data, and verify all MESH
specifications. Changing geometry alone does not select MESH or enable a
previously disabled rating. Do not treat the example geometry as a recommendation.

HTTP API FOR EXTERNAL AGENTS
Use paths relative to the running Project CAD website (local development:
http://127.0.0.1:3000). Discovery and deterministic calculations need no model key.
GET /api/ai/guide: text/plain, this entire guide.
GET /api/capabilities: JSON, identical schemas/units/limits to get_capabilities,
  with mode stateless. Includes projectSchema and actionSchema (the plan schema).
POST /api/actions/preview: JSON {project,plan,baseRevision?}. Returns normalized
  candidate project, baseRevision, candidateRevision, counts, plan, applied:false.
  If baseRevision is provided it must match the supplied normalized project;
  a mismatch returns 409. This checks the payload, not a remote saved project.
  An empty plan can normalize a project and obtain its revision.
POST /api/simulate: JSON body is the complete Project object, not {project:...}
  and not the saved file's {project,revisions,...} envelope. Returns Result.

Headless sequence: discover schemas; obtain/export a Project; preview a plan;
pass preview.project to /api/simulate; inspect convergence and warnings; return
the candidate and evidence to the caller. These stateless endpoints never read
or overwrite the browser's current project or its history. External agents must
provide the project JSON. Use the connected assistant for in-app proposals.
Invalid JSON/schema/graph/calculation requests return {error} with 422;
preview revision conflicts return 409; request bodies over 4 MiB return 413.
Numerical nonconvergence may be a 200 response with converged:false.

Existing chemical endpoints (public read-only data, server catalog configuration
required; do not fabricate records if unavailable):
GET /api/chemicals/models: available models and catalog release coverage.
GET /api/chemicals?query=...&model=...&release=...&field=all&sort=relevance&page=1
  field is all/name/cas/formula; sort relevance/name; page is 1-based. Keep the
  returned release hash when selecting records from search results.
POST /api/chemicals/selection: {release,ids,model}, 2-40 component IDs, <=8 KiB;
  returns a verified catalog snapshot for set_thermo_model with mixture:catalog.
Chemical endpoints use 400 for invalid inputs, 413 for an oversized selection,
and catalog-specific statuses (including 503 when unconfigured/unavailable).
The in-app catalog tools call these same endpoints. Catalog failure is an error,
not permission to invent data; existing saved components can still run offline.

GET /api/ai returns legacy server planner availability. POST /api/ai accepts
{prompt,project} and returns a validated plan and model; it is not a project-save
API or an arbitrary tool gateway. It requires explicit server model configuration,
same-origin localhost use and rate limits. The desktop companion's authenticated
loopback protocol on 127.0.0.1:43118 is separate; see README.txt for pairing.

${engineeringGuidance}

MAINTENANCE AND VERIFICATION
Update src/assistant/guide.ts whenever a public action, tool, result or API
contract changes, then run npm run docs:ai-guide. docs/AI_GUIDE.txt is a generated
copy; npm run docs:ai-guide:check fails on drift. Capabilities derive schemas
directly from the validators. Integration tests exercise hydraulic partial edits,
unchanged separation, invalid geometry, disabled/missing ratings, discovery,
real HTTP simulation/preview responses and assistant review boundaries.
Detailed references: docs/DISTILLATION.txt, docs/EQUIPMENT.txt,
docs/THERMODYNAMICS.txt, docs/REACTION_TEMPLATES.txt, docs/CHEMICAL_CATALOG.txt.
`;
