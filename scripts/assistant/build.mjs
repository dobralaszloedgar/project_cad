import { build } from "esbuild";
import { createHash } from "node:crypto";
import {
  mkdir,
  cp,
  copyFile,
  readFile,
  writeFile,
  readdir,
  stat,
  rm,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkSourceReferences } from "./reference-policy.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
export async function buildAssistant(
  destination = join(root, "dist", "assistant", "payload"),
) {
  await checkSourceReferences(root);
  await rm(join(destination, "app"), { recursive: true, force: true });
  await rm(join(destination, "manifest.json"), { force: true });
  await mkdir(join(destination, "app"), { recursive: true });
  await build({
    absWorkingDir: root,
    entryPoints: {
      assistant: "scripts/assistant.ts",
      control: "scripts/assistant/control.ts",
      desktop: "scripts/assistant/desktop.ts",
    },
    outdir: join(destination, "app"),
    outExtension: { ".js": ".mjs" },
    bundle: true,
    platform: "node",
    target: "node24",
    format: "esm",
    packages: "bundle",
    sourcemap: false,
    minify: false,
    legalComments: "inline",
  });
  await copyFile(
    join(root, "scripts", "assistant", "releases.json"),
    join(destination, "releases.json"),
  );
  await copyFile(
    join(root, "scripts", "assistant", "install.mjs"),
    join(destination, "install.mjs"),
  );
  await copyFile(
    join(root, "scripts", "assistant", "install-cleanup.mjs"),
    join(destination, "install-cleanup.mjs"),
  );
  for (const file of ["desktop.html", "icon.svg", "uninstall-windows.ps1"])
    await copyFile(
      join(root, "scripts", "assistant", file),
      join(destination, file),
    );
  await copyFile(
    join(root, "node_modules", "@muse-code", "sdk", "LICENSE"),
    join(destination, "MuseSDK-LICENSE.txt"),
  );
  await copyFile(
    join(root, "node_modules", "zod", "LICENSE"),
    join(destination, "Zod-LICENSE.txt"),
  );
  await cp(
    join(root, "node_modules", "unpdf", "dist", "licenses"),
    join(destination, "PDF-licenses"),
    { recursive: true },
  );
  await copyFile(
    join(root, "node_modules", "unpdf", "LICENSE"),
    join(destination, "Unpdf-LICENSE.txt"),
  );
  await copyFile(
    join(root, "LICENSE"),
    join(destination, "ProjectCAD-LICENSE.txt"),
  );
  const sdk = JSON.parse(
    await readFile(
      join(root, "node_modules", "@muse-code", "sdk", "package.json"),
      "utf8",
    ),
  );
  await writeFile(
    join(destination, "THIRD_PARTY_NOTICES.txt"),
    `Project CAD Assistant\n\nNode.js: bundled runtime; see Node-LICENSE.txt.\nZod: MIT; see Zod-LICENSE.txt.\nUnpdf: MIT; see Unpdf-LICENSE.txt. PDF.js and image decoders: see PDF-licenses/.\nMuse Code SDK: see MuseSDK-LICENSE.txt.\nMuse Code is installed automatically from its official package when missing. Existing provider installations and authentication are reused.\n`,
  );
  const files = {};
  async function inventory(directory) {
    for (const entry of await readdir(directory)) {
      const file = join(directory, entry);
      if ((await stat(file)).isDirectory()) await inventory(file);
      else
        files[file.slice(destination.length + 1)] = createHash("sha256")
          .update(await readFile(file))
          .digest("hex");
    }
  }
  await inventory(destination);
  const release = JSON.parse(
    await readFile(join(destination, "releases.json"), "utf8"),
  );
  await writeFile(
    join(destination, "manifest.json"),
    JSON.stringify(
      {
        name: "Project CAD Assistant",
        version: release.version,
        protocol: 1,
        providers: ["muse"],
        sdkVersion: sdk.version,
        files,
      },
      null,
      2,
    ) + "\n",
  );
  return destination;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await buildAssistant();
  console.log("Built the Project CAD assistant payload.");
}
