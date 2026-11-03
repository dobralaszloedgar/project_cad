// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { build } from "esbuild";
import { expect, it } from "vitest";

it("keeps normal playback light while deferring shared editor assets to authoring", async () => {
  const result = await build({
    entryPoints: ["src/components/landing/LandingPage.tsx"],
    bundle: true,
    write: false,
    platform: "browser",
    format: "esm",
    splitting: true,
    outdir: "out",
    metafile: true,
    logLevel: "silent",
    external: [
      "*.css",
      "next/*",
      "react",
      "react-dom",
      "react/jsx-runtime",
      "motion/react",
      "lucide-react",
      "three",
      "three/*",
      "@react-three/*",
      "@xyflow/react",
    ],
  });
  const bundled = Object.values(result.metafile.outputs).flatMap((output) =>
    Object.entries(output.inputs)
      .filter(([, input]) => input.bytesInOutput > 0)
      .map(([name]) => name),
  );
  const initial = new Set<string>();
  const visit = (name: string) => {
    const output = result.metafile.outputs[name];
    for (const input of Object.keys(output.inputs)) initial.add(input);
    for (const dependency of output.imports)
      if (!dependency.external && dependency.kind !== "dynamic-import")
        visit(dependency.path);
  };
  const entry = Object.entries(result.metafile.outputs).find(
    ([, output]) =>
      output.entryPoint === "src/components/landing/LandingPage.tsx",
  )!;
  visit(entry[0]);
  expect(
    [...initial].some((name) =>
      /equipment-3d|graphics\/renderer|landing-camera|node_modules\/three|node_modules\/@react-three/.test(
        name,
      ),
    ),
  ).toBe(false);
  expect(initial.has("src/domain/solver.ts")).toBe(false);
  expect(initial.has("src/domain/thermo/kernel.wasm.json")).toBe(false);
  expect(bundled).toContain("src/components/equipment-3d/models.ts");
  expect(bundled).toContain("src/components/equipment-3d/process-contents.ts");
});
