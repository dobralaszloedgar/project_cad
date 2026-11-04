# Getting started

[Documentation index](README.md) · [Development setup](DEVELOPMENT.md)

## Open your first project

1. From the repository, run `npm ci` and `npm run dev` with Node.js 24 or newer.
2. Open [http://127.0.0.1:3000](http://127.0.0.1:3000).
3. Create a project from a bundled template. **Heating and cooling** or **Mixing and splitting** provides a straightforward starting point.
4. Choose a project folder when the browser supports direct folder access, or continue with browser storage.
5. Choose **Simulate**, then inspect stream results, equipment duties, convergence, and balance residuals.

Bundled templates include their chemical records. Catalog search for a new chemical selection needs the configured database described in [development setup](DEVELOPMENT.md#configuration). New blank projects start without assumed chemistry; add project components before configuring a process.

## Edit and inspect a process

Double-click equipment, or select it and choose **Edit**, to open its properties. Configure feeds, connections, operating conditions, and the active calculation method. Equipment setup and calculated results share the same saved project in the **2D**, **3D**, and **Split** views.

Equipment status indicators help locate setup problems:

| Color  | Meaning                                        |
| ------ | ---------------------------------------------- |
| Yellow | Required setup is missing.                     |
| Red    | Settings are invalid or the simulation failed. |
| Green  | Ready to simulate.                             |
| Blue   | Calculated, including any reported warnings.   |

Hover or focus an indicator for details. Click an issue to open the relevant setting or connection. Changing process inputs requires another calculation; moving, arranging, or renaming equipment preserves the current results.

## Choose a model and template

Use the model selector for **Ideal gas**, **Raoult's law**, or **Modified UNIFAC 2.0**. Chemical availability depends on the data required by the model. Catalog projects support 2–40 components, and selected records are saved inside the project.

| Template family                      | Explore                                                               |
| ------------------------------------ | --------------------------------------------------------------------- |
| Heating/cooling and mixing/splitting | Material balances, enthalpy balances, and proportional stream splits. |
| Distillation · FUG shortcut          | Key recoveries, minimum reflux, and estimated stages.                 |
| Distillation · MESH column           | Equilibrium-stage profiles and condenser/reboiler duties.             |
| PBR · Water–gas shift                | Gas reaction stoichiometry and published kinetics.                    |
| PBR · Catalyst sizing                | Conversion and catalyst-mass relationships.                           |
| PBR · Methanol synthesis             | Multiple reactions with documented kinetic sources.                   |

See [equipment](EQUIPMENT.txt), [distillation](DISTILLATION.txt), and [reaction templates](REACTION_TEMPLATES.txt) for the equations and limits that apply to each example.

## Units and navigation

Open **Workspace menu → Units** to select SI, Metric engineering, or US customary units. Metric engineering is the default. Display preferences apply across projects in the same browser; saved process values remain in SI. Reaction-law constants retain the explicit units of their rate definitions.

Use the **Themes** tab to select an appearance. In 3D, select equipment to choose an orbit anchor; drag to orbit, use Space + drag or right/middle drag to pan, and pinch or Ctrl/Cmd + scroll to zoom. Press **F** to fit the plant or **Shift+F** to focus the selection. Open the keyboard reference with **H** or **?** for the complete shortcut list.

## Save and return later

Use **Projects** to switch between projects, organize folders, rename, duplicate, search, or star a project. Each project retains its own flowsheet and history. **Storage → Export project** downloads a complete `.pcad` copy.

Direct disk access is available in desktop Chrome and Edge on HTTPS or localhost. Other supported browsers use browser storage, which belongs to the current browser profile and website. Export a backup before clearing site data. See [project storage](PROJECT_STORAGE.md) for reconnecting moved files and handling conflicts.

## Connect the optional assistant

Open the assistant, choose **Connect assistant**, install the desktop connector, and approve the connection locally. Muse provides project-aware assistance; the engineering solver produces the numerical results. Choose the conversation's edit mode before requesting changes.

See the [assistant guide](ASSISTANT.md) for installation, access settings, sign-in, and history.

Copyright © 2026 László Edgár Dobra. All rights reserved. See [LICENSE](../LICENSE) and [third-party notices](../THIRD_PARTY_NOTICES.txt).
