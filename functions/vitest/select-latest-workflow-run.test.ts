import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const filterPath = fileURLToPath(
  new URL("../../.github/scripts/select-latest-workflow-run.jq", import.meta.url),
);
const multiWorkflowWaiterPath = fileURLToPath(
  new URL("../../.github/scripts/wait-for-workflows.sh", import.meta.url),
);
const freeApkWorkflowPath = fileURLToPath(
  new URL("../../.github/workflows/android-apk-free.yml", import.meta.url),
);

function selectLatest(runs: Array<Record<string, unknown>>, name = "Build and Test") {
  const output = execFileSync(
    "jq",
    ["-c", "--arg", "name", name, "-f", filterPath],
    {
      input: JSON.stringify({ workflow_runs: runs }),
      encoding: "utf8",
    },
  ).trim();

  return output ? JSON.parse(output) : null;
}

describe("latest workflow run selection", () => {
  it("does not mistake an older successful attempt for a newer queued rerun", () => {
    const olderSuccess = {
      name: "Build and Test",
      run_number: 42,
      run_attempt: 1,
      status: "completed",
      conclusion: "success",
      run_started_at: "2026-11-26T10:00:00Z",
      created_at: "2026-11-26T10:00:00Z",
    };
    const queuedRerun = {
      name: "Build and Test",
      run_number: 42,
      run_attempt: 2,
      status: "queued",
      conclusion: null,
      run_started_at: null,
      created_at: "2026-11-26T10:05:00Z",
    };

    expect(selectLatest([olderSuccess, queuedRerun])).toEqual(queuedRerun);
  });

  it("prefers a newer queued workflow run over an older completed success", () => {
    const olderSuccess = {
      name: "Build and Test",
      run_number: 41,
      run_attempt: 1,
      status: "completed",
      conclusion: "success",
      created_at: "2026-11-26T10:00:00Z",
    };
    const newerQueued = {
      name: "Build and Test",
      run_number: 42,
      run_attempt: 1,
      status: "queued",
      conclusion: null,
      created_at: "2026-11-26T10:05:00Z",
    };

    expect(selectLatest([newerQueued, olderSuccess])).toEqual(newerQueued);
  });

  it("uses the newest attempt when a workflow run is rerun", () => {
    const firstAttempt = {
      name: "Build and Test",
      run_number: 42,
      run_attempt: 1,
      status: "completed",
      conclusion: "failure",
      created_at: "2026-11-26T10:00:00Z",
    };
    const secondAttempt = {
      name: "Build and Test",
      run_number: 42,
      run_attempt: 2,
      status: "completed",
      conclusion: "success",
      created_at: "2026-11-26T10:00:00Z",
    };

    expect(selectLatest([secondAttempt, firstAttempt])).toEqual(secondAttempt);
  });

  it("filters by exact workflow name and returns null when absent", () => {
    const unrelated = {
      name: "Mobile checks",
      run_number: 100,
      run_attempt: 1,
      status: "completed",
      conclusion: "success",
      created_at: "2026-11-26T10:00:00Z",
    };

    expect(selectLatest([unrelated])).toBeNull();
  });
});



describe("multi-workflow waiter integration", () => {
  it("uses the shared latest-run selector for required and APK workflows", () => {
    const source = readFileSync(multiWorkflowWaiterPath, "utf8");
    const selectorLines = source.split("\n").filter((line) => line.includes(".github/scripts/select-latest-workflow-run.jq"));
    expect(selectorLines).toHaveLength(2);
    expect(selectorLines.every((line) => line.trim().startsWith("-f "))).toBe(true);
    expect(source).not.toContain("sort_by(.created_at)");
  });
});



describe("APK workflow path scope", () => {
  it("waits for APK validation when function or Worker configuration paths trigger it", () => {
    const waiter = readFileSync(multiWorkflowWaiterPath, "utf8");
    const scopeMatch = waiter.match(/if grep -Eq '([^']+)' <<< "\$\{changed_files\}"; then\s+android_scope=true/s);
    expect(scopeMatch?.[1]).toContain("functions/");
    expect(scopeMatch?.[1]).toContain("wrangler\\.json$");

    const apkWorkflow = readFileSync(freeApkWorkflowPath, "utf8");
    expect(apkWorkflow).toContain('"functions/**"');
    expect(apkWorkflow).toContain('"wrangler.json"');
  });
});
