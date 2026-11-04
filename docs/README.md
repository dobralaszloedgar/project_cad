# Project CAD documentation

[Project overview](../README.md) · [Getting started](GETTING_STARTED.md) · [Development](DEVELOPMENT.md)

## Using the application

| Guide                                              | Contents                                                                           |
| -------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [Getting started](GETTING_STARTED.md)              | First project, simulation, equipment editing, units, and navigation.               |
| [Project files and folders](PROJECT_STORAGE.md)    | `.pcad` documents, autosave, folder discovery, portable copies, and recovery.      |
| [Project assistant](ASSISTANT.md)                  | Desktop installation, pairing, Muse, access modes, and conversation history.       |
| [Browser and graphics support](BROWSER_SUPPORT.md) | Folder access, WebGPU/WebGL fallback, graphics settings, and compatibility checks. |

## Engineering reference

These references describe the implemented models and their limits. Scientific references remain in their existing text format so source and provenance links stay stable.

| Reference                                    | Contents                                                                   |
| -------------------------------------------- | -------------------------------------------------------------------------- |
| [Equipment](EQUIPMENT.txt)                   | Unit-operation equations, settings, and supported limits.                  |
| [Thermodynamics](THERMODYNAMICS.txt)         | Ideal gas, Raoult's law, Modified UNIFAC 2.0, and caloric approximations.  |
| [Distillation](DISTILLATION.txt)             | FUG shortcut design, MESH stages, and optional sieve-tray ratings.         |
| [Reaction templates](REACTION_TEMPLATES.txt) | Chemical records, published kinetic laws, units, and validity ranges.      |
| [Chemical catalog](CHEMICAL_CATALOG.txt)     | Data coverage, immutable records, provenance, and import procedure.        |
| [Model limits](DEMO_LIMITATIONS.txt)         | Scope of the current simulator and legacy teaching models.                 |
| [Scientific sources](SOURCES.txt)            | Scientific references and dataset attribution.                             |
| [Numerical benchmarks](BENCHMARKS.txt)       | Dated comparisons with independent implementations and reference fixtures. |

## Development and releases

| Guide                                            | Contents                                                                                            |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| [Development](DEVELOPMENT.md)                    | Requirements, local configuration, commands, testing, and kernel rebuilds.                          |
| [Assistant releases](ASSISTANT_RELEASES.md)      | Native packaging, upgrades, public downloads, signing, and verification.                            |
| [Release checks](RELEASE_CHECKS.txt)             | External release policy and source/package verification requirements.                               |
| [Assistant tool guide](AI_GUIDE.txt)             | Generated tool and model contract; edit `src/assistant/guide.ts`, then run `npm run docs:ai-guide`. |
| [Design notes](DESIGN.txt)                       | Interface tokens, typography, layout, and interaction conventions.                                  |
| [Dependency inventory](dependency-licenses.json) | Dated package-license metadata; upstream license files remain authoritative.                        |

## Historical records

These documents describe specific earlier implementations or verification runs. Their dates and release versions matter; use the current guides above for setup and behavior.

| Record                                                           | Scope                                                                        |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [Validation log](VALIDATION.txt)                                 | Previous local validation runs and numerical observations.                   |
| [Original demo walkthrough](DEMO_WALKTHROUGH.txt)                | Earlier synthetic binary example and legacy interface.                       |
| [Legacy Meta model card](MODEL_CARD.txt)                         | Original server-side Meta gateway, separate from the current Muse connector. |
| [Assistant 0.1.13 handoff](MUSE_CONNECTOR_HANDOFF.txt)           | Release-specific build, publication, and verification notes.                 |
| [Equipment reference audit](equipment-model-reference-check.txt) | Recorded equipment reference review.                                         |

Copyright © 2026 László Edgár Dobra. All rights reserved. See [LICENSE](../LICENSE) and [third-party notices](../THIRD_PARTY_NOTICES.txt).
