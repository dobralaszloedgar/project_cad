// Copyright © 2026 László Edgár Dobra. All rights reserved.
// Applies only to copyrightable Project CAD material owned by this holder.
// See the root LICENSE and THIRD_PARTY_NOTICES.txt for scope and exceptions.

import { build } from "esbuild";
import { expect, it } from "vitest";

it("keeps the calculation kernel out of the landing page and its previews", async () => {
  const result = await build({
    entryPoints: ["src/components/landing/LandingPage.tsx"],
    bundle: true,
    write: false,
    platform: "browser",
    format: "esm",
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
  expect(bundled).not.toContain("src/domain/thermo/kernel.wasm.json");
  expect(bundled).not.toContain("src/domain/solver.ts");
});
