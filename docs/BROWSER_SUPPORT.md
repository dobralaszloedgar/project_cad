# Browser and graphics support

[Documentation index](README.md) · [Project storage](PROJECT_STORAGE.md) · [Development](DEVELOPMENT.md)

## Project storage by browser

| Browser               | Project storage                                                      |
| --------------------- | -------------------------------------------------------------------- |
| Desktop Chrome / Edge | Native writable folders on HTTPS or localhost, plus browser storage. |
| Firefox / Safari      | Browser storage and portable `.pcad` exports.                        |

Native folder permissions may need to be renewed after a browser restart. Browser storage belongs to the current website and browser profile; export projects before clearing site data.

## 3D rendering

The equipment studio, workspace 3D view, and landing scene prefer WebGPU and automatically fall back to WebGL 2 if WebGPU is unavailable or adapter/device initialization fails. Integrated GPUs are supported; a dedicated NVIDIA/AMD GPU is optional. Public deployments need HTTPS to use WebGPU (localhost also works). Browsers still need either WebGPU or WebGL 2 to display 3D; the 2D workspace remains available without them.

## Graphics settings

Open **Graphics settings** at the upper right of a 3D equipment view to see the actual backend and browser-reported GPU, or select **WebGL 2 compatibility**. The preference is saved in that browser. Resolution adapts to sustained rendering load and is capped by both pixel density and render-pixel count. Hidden scenes stop continuous animation, stationary equipment reuses its shadows, and liquid effects share shader programs across equipment.

## Troubleshooting

Software/fallback rendering shows a prompt to enable graphics acceleration. If neither API starts, the preview shows the same setup instructions and a retry button without discarding the project. In Chrome/Edge, enable **Settings → System → Use graphics acceleration when available**, then restart the browser. A missing WebGPU adapter alone does not imply acceleration is disabled, so a working hardware WebGL fallback does not show this prompt.

The app requests high-performance graphics, but the browser and OS choose the adapter. On Windows laptops, set the browser to **High performance** in **Settings → System → Display → Graphics**, then fully restart it. Chrome can ignore the website's power preference on Windows; see [Chrome's GPU selection limitations](https://developer.chrome.com/docs/web-platform/webgpu/troubleshooting-tips#windows-specific_limitations). The app cannot force NVIDIA or combine integrated and dedicated GPUs.

## Verification

Graphics checks: `npx vitest run tests/graphics.test.ts tests/equipment-models.test.ts tests/project-plant.test.ts` and `npx playwright test tests/e2e/graphics.spec.ts tests/e2e/equipment-sandbox.spec.ts tests/e2e/plant-workspace.spec.ts tests/e2e/landing.spec.ts`. On Windows, setting `GRAPHICS_CHANNEL=chrome` runs the graphics tests against installed Chrome and requires native WebGPU; `GRAPHICS_NVIDIA=1` additionally requests NVIDIA in that isolated test browser. These test flags do not change the user's browser settings.

Browser compatibility checks: `npm run test:browsers`. Install Edge and Chrome normally, then run `npx playwright install firefox webkit` for the other engines. The suite covers native capability detection, folder persistence and recovery in Edge/Chrome, browser-only projects in all four engines, simulation, editing, export, reload, narrow layouts, themes, and 3D rendering. WebKit is Safari-engine coverage, not a test of the macOS Safari application. Reports are written to `test-results/browser-report`. Set `PLAYWRIGHT_BASE_URL` to an already running production server to test the built app; otherwise the suite uses the local development server.

Copyright © 2026 László Edgár Dobra. All rights reserved. See [LICENSE](../LICENSE) and [third-party notices](../THIRD_PARTY_NOTICES.txt).
