import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const kernel = readFileSync(
  "rust/thermo/target/wasm32-unknown-unknown/release/project_thermo.wasm",
);
if (
  /(?:\b[A-Za-z]:[\\/](?:[\w .-]+[\\/])+|\/(?:Users|home)\/)/i.test(
    kernel.toString("latin1"),
  )
)
  throw new Error(
    "The thermodynamics kernel contains local build paths. Rebuild with source-path remapping before bundling.",
  );
const parameters = readFileSync("rust/thermo/sample-groups.json");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
writeFileSync(
  "src/domain/thermo/kernel.wasm.json",
  JSON.stringify([...kernel]) + "\n",
);
writeFileSync(
  "src/domain/thermo/kernel-identity.json",
  JSON.stringify(
    { kernelHash: sha256(kernel), parameterHash: sha256(parameters) },
    null,
    2,
  ) + "\n",
);
console.log(`Bundled thermodynamics kernel (${kernel.length} bytes).`);
