# Project CAD

Project CAD is a local process-flowsheet demonstration with 2D/3D views and a Rust/WebAssembly thermodynamics kernel.

## Status

Three thermodynamic models are available: ideal gas, ideal solution (Raoult’s law), and Modified UNIFAC 2.0. A six-record sample catalog is included; the full chemical database is future work.

Eight equipment types have simple setup controls and distinct 2D/3D schematics. Packed-bed reactors support a synthetic catalyst-mass model with a calculated conversion profile, plus the legacy residence-time model. Heaters and coolers accept an outlet temperature or, for ideal gas, a specified duty. The new templates exercise two-feed mixing, heating/cooling and catalyst-bed balances. Equations and limits are in [docs/EQUIPMENT.txt](docs/EQUIPMENT.txt).

## Getting started

```bash
git clone git@github.com:dobralaszloedgar/project_cad.git
cd project_cad
```

Run `npm ci` and `npm run dev`. Open the Raoult’s law separation template to try the liquid models, or the reactor template for synthetic ideal-gas chemistry. Preferences controls the model and sample mixture.

Checks: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, and `npx playwright test tests/e2e/thermo.spec.ts`.

The prebuilt numerical kernel is included. To rebuild Rust with Docker, run `npm run thermo:build`. Model equations, data sources, limits, and the future catalog interface are documented in [docs/THERMODYNAMICS.txt](docs/THERMODYNAMICS.txt).
