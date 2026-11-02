import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { execFileSync } from "node:child_process";
import {
  benchmarkCases,
  defaultToleranceDifferences,
} from "../../tests/helpers/numerical-benchmarks";
import { provenance } from "../../src/domain/thermo";

const destination = resolve(
  process.argv[2] ?? "test-results/benchmarks/comparison.json",
);
const cases = benchmarkCases.map((benchmark) => {
  const start = performance.now();
  try {
    const comparisons = benchmark.run();
    return {
      id: benchmark.id,
      group: benchmark.group,
      passed: comparisons.length > 0 && comparisons.every((c) => c.passed),
      elapsedMs: performance.now() - start,
      comparisons,
      error: undefined,
    };
  } catch (error) {
    return {
      id: benchmark.id,
      group: benchmark.group,
      passed: false,
      elapsedMs: performance.now() - start,
      comparisons: [],
      error: String(error),
    };
  }
});
const summary = [...new Set(cases.map((c) => c.group))].map((group) => {
  const rows = cases.filter((c) => c.group === group);
  const comparisons = rows.flatMap((c) => c.comparisons);
  return {
    group,
    passed: rows.filter((r) => r.passed).length,
    total: rows.length,
    maxima: Object.fromEntries(
      [...new Set(comparisons.map((c) => c.metric))].map((metric) => [
        metric,
        Math.max(
          ...comparisons.filter((c) => c.metric === metric).map((c) => c.error),
        ),
      ]),
    ),
  };
});
const report = {
  generatedAt: new Date().toISOString(),
  revision: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  workingTreeDirty: !!execFileSync("git", ["status", "--porcelain"], {
    encoding: "utf8",
  }).trim(),
  node: process.version,
  platform: process.platform,
  kernelHash: provenance().kernelHash,
  references: [
    "tests/fixtures/catalog-reference.json",
    "tests/fixtures/dwsim-reference.json",
    "tests/fixtures/independent-flash-reference.json",
    "tests/fixtures/independent-column-reference.json",
    "tests/fixtures/reaction-templates-reference.json",
  ].map((file) => ({
    file,
    sha256: createHash("sha256").update(readFileSync(file)).digest("hex"),
  })),
  passed: cases.every((c) => c.passed),
  summary,
  defaultToleranceDifferences: defaultToleranceDifferences(),
  cases,
};
mkdirSync(dirname(destination), { recursive: true });
writeFileSync(destination, JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify(
    {
      passed: report.passed,
      summary,
      failures: cases
        .filter((c) => !c.passed)
        .map((c) => ({
          id: c.id,
          error: c.error,
          comparisons: c.comparisons.filter((v) => !v.passed),
        })),
      largestDefaultToleranceDifference: report.defaultToleranceDifferences[0],
      report: destination,
    },
    null,
    2,
  ),
);
if (!report.passed) process.exitCode = 1;
