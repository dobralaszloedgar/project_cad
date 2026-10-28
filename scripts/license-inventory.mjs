import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
const inventory = [];
for (const [location, entry] of Object.entries(lock.packages)) {
  if (!location) continue;
  try {
    const pkg = JSON.parse(
      await readFile(path.join(location, "package.json"), "utf8"),
    );
    let license = pkg.license ?? entry.license;
    let licenseSource = "package metadata";
    if (!license) {
      const licenseText = await readFile(
        path.join(location, "LICENSE"),
        "utf8",
      ).catch(() => "");
      if (
        licenseText.startsWith("MIT License") &&
        licenseText.includes("Permission is hereby granted, free of charge")
      ) {
        license = "MIT";
        licenseSource = `${location}/LICENSE`;
      }
    }
    inventory.push({
      package: pkg.name,
      version: pkg.version,
      license: license ?? "REVIEW REQUIRED",
      licenseSource,
      repository:
        typeof pkg.repository === "string"
          ? pkg.repository
          : (pkg.repository?.url ?? null),
      developmentOnly: entry.dev === true,
    });
  } catch {
    inventory.push({
      package: location,
      version: entry.version,
      license: entry.license ?? "REVIEW REQUIRED",
      optionalNotInstalled: true,
    });
  }
}
await writeFile(
  "docs/dependency-licenses.json",
  JSON.stringify(
    {
      generated: "2026-10-27",
      note: "Declared package metadata; consult each package license and notices before distribution.",
      packages: inventory.sort((a, b) => a.package.localeCompare(b.package)),
    },
    null,
    2,
  ) + "\n",
);
console.log(`Recorded ${inventory.length} dependency entries.`);
