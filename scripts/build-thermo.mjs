import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
// Docker keeps the compiler optional for ordinary npm install/build/test.
execFileSync(
  "docker",
  [
    "run",
    "--rm",
    "-v",
    `${resolve("rust/thermo")}:/work`,
    "-w",
    "/work",
    "rust:1.90-slim@sha256:7fa728f3678acf5980d5db70960cf8491aff9411976789086676bdf0c19db39e",
    "sh",
    "-c",
    "rustup target add wasm32-unknown-unknown && rustup component add rustfmt && cargo fmt --check && cargo test --locked && cargo build --locked --release --target wasm32-unknown-unknown",
  ],
  { stdio: "inherit" },
);
await import("./bundle-thermo.mjs");
