import test from "node:test";
import assert from "node:assert/strict";
import {
  addedLineNumbers,
  isCoverageSource,
  validateChangedSourceCoverage,
} from "./validate-pr-lcov.mjs";

const sourceFile = (patch, overrides = {}) => ({
  filename: "functions/api/[[path]].ts",
  status: "modified",
  additions: 2,
  patch,
  ...overrides,
});

test("counts only newly added lines from unified diff hunks", () => {
  const lines = addedLineNumbers([
    "@@ -10,3 +10,3 @@",
    " const before = true;",
    "-const removed = true;",
    "+const added = true;",
    " const after = true;",
    "@@ -30,1 +31,2 @@",
    "+const second = true;",
    " const final = true;",
  ].join("\n"));

  assert.deepEqual([...lines], [11, 31]);
});

test("counts added source lines that begin with the increment operator", () => {
  const lines = addedLineNumbers("@@ -1,0 +1,1 @@\n+++counter;");
  assert.deepEqual([...lines], [1]);
});

test("enforces the unchanged 80 percent floor on added executable lines", () => {
  const lcov = "SF:functions/api/[[path]].ts\nDA:11,1\nDA:12,1\nDA:40,0\nend_of_record";
  const patch = "@@ -10,1 +10,3 @@\n const existing = true;\n+const addedOne = true;\n+const addedTwo = true;";
  const changed = sourceFile(patch);
  const result = validateChangedSourceCoverage(lcov, [changed]);

  assert.equal(result.percent, 100);
  assert.equal(result.covered, 2);
  assert.equal(result.executable, 2);
});

test("fails when changed executable lines fall below 80 percent", () => {
  const lcov = "SF:functions/api/[[path]].ts\nDA:11,1\nDA:12,0\nDA:13,0\nDA:14,0\nDA:15,1\nend_of_record";
  const patch = "@@ -10,0 +11,5 @@\n+const a = 1;\n+const b = 2;\n+const c = 3;\n+const d = 4;\n+const e = 5;";

  assert.throws(
    () => validateChangedSourceCoverage(lcov, [sourceFile(patch, { additions: 5 })]),
    /below the required 80%/
  );
});

test("fails closed when a changed production source is absent from LCOV", () => {
  const patch = "@@ -1,0 +1,1 @@\n+export const value = 1;";
  assert.throws(
    () => validateChangedSourceCoverage("SF:other.ts\nDA:1,1\nend_of_record", [sourceFile(patch)]),
    /LCOV is missing changed production source/
  );
});

test("does not apply the executable-line threshold to comment-only additions", () => {
  const lcov = "SF:functions/api/[[path]].ts\nDA:9,1\nend_of_record";
  const patch = "@@ -9,1 +9,2 @@\n const existing = true;\n+// explanatory comment";
  const result = validateChangedSourceCoverage(lcov, [sourceFile(patch)]);

  assert.equal(result.percent, null);
  assert.equal(result.executable, 0);
});

test("fails closed when GitHub omits the changed-source patch", () => {
  assert.throws(
    () => validateChangedSourceCoverage("SF:functions/api/[[path]].ts\nDA:1,1\nend_of_record", [sourceFile(null)]),
    /no unified diff patch/
  );
});

test("excludes tests, declarations, removed files, and Expo Router screens", () => {
  assert.equal(isCoverageSource(sourceFile("@@ -1,0 +1,1 @@\n+x")), true);
  assert.equal(isCoverageSource(sourceFile("@@ -1,0 +1,1 @@\n+x", { filename: "functions/foo.test.ts" })), false);
  assert.equal(isCoverageSource(sourceFile("@@ -1,0 +1,1 @@\n+x", { filename: "lib/types.d.ts" })), false);
  assert.equal(isCoverageSource(sourceFile("@@ -1,0 +1,1 @@\n+x", { filename: "artifacts/mobile/app/index.tsx" })), false);
  assert.equal(isCoverageSource(sourceFile("@@ -1,0 +1,1 @@\n+x", { status: "removed" })), false);
});
