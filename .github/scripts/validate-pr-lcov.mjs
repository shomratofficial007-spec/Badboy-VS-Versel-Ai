#!/usr/bin/env node
import fs from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SOURCE_FILE = /^(?:functions|lib|artifacts\/mobile)\/.*\.(?:ts|tsx)$/;
const TEST_FILE = /\.(?:test|spec)\.(?:ts|tsx)$/;
const ROUTER_SCREEN = /^artifacts\/mobile\/app\//;

export function isCoverageSource(file) {
  return file.status !== "removed"
    && Number(file.additions ?? 0) > 0
    && SOURCE_FILE.test(file.filename ?? "")
    && !TEST_FILE.test(file.filename)
    && !file.filename.endsWith(".d.ts")
    && !ROUTER_SCREEN.test(file.filename);
}

export function addedLineNumbers(patch) {
  if (typeof patch !== "string" || patch.length === 0) {
    throw new Error("Changed production source has no unified diff patch; exact added-line coverage cannot be verified.");
  }

  const added = new Set();
  let newLine = null;
  for (const line of patch.split(/\r?\n/)) {
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      newLine = Number(hunk[1]);
      continue;
    }
    if (newLine === null || line.startsWith("\\ No newline")) continue;
    if (line.startsWith("+++")) continue;
    if (line.startsWith("+")) {
      added.add(newLine);
      newLine += 1;
    } else if (line.startsWith(" ")) {
      newLine += 1;
    } else if (line.startsWith("-")) {
      // Removed lines do not advance the new-file line number.
    }
  }

  if (added.size === 0) {
    throw new Error("Unified diff contains no parseable added lines for a changed production source.");
  }
  return added;
}

export function parseLcov(content) {
  if (typeof content !== "string" || content.trim() === "") {
    throw new Error("LCOV report is missing or empty.");
  }

  const records = new Map();
  for (const rawRecord of content.split("end_of_record")) {
    const lines = rawRecord.split(/\r?\n/);
    const sourceLine = lines.find((line) => line.startsWith("SF:"));
    if (!sourceLine) continue;
    const filename = sourceLine.slice(3).replaceAll("\\", "/");
    if (!filename) throw new Error("LCOV contains an empty source filename.");
    if (records.has(filename)) throw new Error(`LCOV contains duplicate source records: ${filename}`);

    const lineHits = new Map();
    for (const line of lines) {
      if (!line.startsWith("DA:")) continue;
      const match = line.match(/^DA:(\d+),(\d+)(?:,\d+)?$/);
      if (!match) throw new Error(`Malformed LCOV line-data record for ${filename}: ${line}`);
      const lineNumber = Number(match[1]);
      const hits = Number(match[2]);
      if (lineNumber < 1 || !Number.isSafeInteger(hits)) {
        throw new Error(`Invalid LCOV line-data record for ${filename}: ${line}`);
      }
      lineHits.set(lineNumber, hits);
    }
    records.set(filename, lineHits);
  }

  if (records.size === 0) throw new Error("LCOV contains no source-file records.");
  return records;
}

function findRecord(records, filename) {
  const matches = [...records.entries()].filter(([source]) =>
    source === filename || source.endsWith(`/${filename}`)
  );
  if (matches.length !== 1) {
    throw new Error(matches.length === 0
      ? `LCOV is missing changed production source: ${filename}`
      : `LCOV source path is ambiguous for ${filename}: ${matches.map(([source]) => source).join(", ")}`);
  }
  return matches[0][1];
}

export function validateChangedSourceCoverage(lcov, changedFiles, minimumPercent = 80) {
  if (!Array.isArray(changedFiles)) throw new Error("Changed-files input must be a JSON array.");
  if (!Number.isFinite(minimumPercent) || minimumPercent < 0 || minimumPercent > 100) {
    throw new Error("Coverage threshold must be between 0 and 100.");
  }

  const records = parseLcov(lcov);
  const eligible = changedFiles.filter(isCoverageSource);
  let covered = 0;
  let executable = 0;
  const details = [];

  for (const file of eligible) {
    const added = addedLineNumbers(file.patch);
    const lineHits = findRecord(records, file.filename);
    const changedExecutable = [...added].filter((line) => lineHits.has(line));
    const fileCovered = changedExecutable.filter((line) => lineHits.get(line) > 0).length;
    executable += changedExecutable.length;
    covered += fileCovered;
    details.push({
      filename: file.filename,
      covered: fileCovered,
      executable: changedExecutable.length,
    });
  }

  const percent = executable === 0 ? null : (covered / executable) * 100;
  if (percent !== null && percent < minimumPercent) {
    throw new Error(
      `Changed production-source coverage ${percent.toFixed(2)}% (${covered}/${executable}) is below the required ${minimumPercent}%.`
    );
  }

  return { covered, executable, percent, details, eligibleFiles: eligible.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [lcovPath, changedFilesPath] = process.argv.slice(2);
    if (!lcovPath || !changedFilesPath) {
      throw new Error("Usage: node validate-pr-lcov.mjs <lcov.info> <changed-files.json>");
    }
    const lcov = fs.readFileSync(lcovPath, "utf8");
    const changedFiles = JSON.parse(fs.readFileSync(changedFilesPath, "utf8"));
    const result = validateChangedSourceCoverage(lcov, changedFiles, 80);

    for (const detail of result.details) {
      console.log(`Changed source: ${detail.filename} — ${detail.covered}/${detail.executable} added executable lines covered`);
    }
    if (result.percent === null) {
      console.log("No added executable lines were present in the changed production sources; the 80% line-coverage floor is not applicable.");
    } else {
      console.log(`Changed production-source line coverage: ${result.percent.toFixed(2)}% (${result.covered}/${result.executable}); required minimum: 80%.`);
    }
  } catch (error) {
    console.error(`::error::${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
