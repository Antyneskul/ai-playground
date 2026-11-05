import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runExecute } from "./run.js";
import { runDraft } from "./draft.js";
import { runApprove } from "./decide.js";
import { readState } from "../state.js";
import { getLogFilePath } from "../paths.js";

async function tempDataDir() {
  return mkdtemp(path.join(tmpdir(), "approval-agent-run-"));
}

test("runExecute executes every approved item, marks it executed, and logs it", async () => {
  const dir = await tempDataDir();
  await runDraft(dir);
  await runApprove(dir, "1");
  const executed = await runExecute(dir);
  assert.equal(executed.length, 1);
  assert.equal(executed[0].status, "executed");
  const state = await readState(dir);
  assert.equal(state.items[0].status, "executed");
  const logContents = await readFile(getLogFilePath(dir), "utf8");
  assert.equal(logContents.trim().split("\n").length, 1);
});

test("runExecute with no approved items is a clean no-op: no state write, no log file", async () => {
  const dir = await tempDataDir();
  await runDraft(dir); // stays pending_review
  const executed = await runExecute(dir);
  assert.equal(executed.length, 0);
  await assert.rejects(() => stat(getLogFilePath(dir)), /ENOENT/);
});

test("running twice in a row does not re-execute or re-log an already-executed item", async () => {
  const dir = await tempDataDir();
  await runDraft(dir);
  await runApprove(dir, "1");
  await runExecute(dir);
  const second = await runExecute(dir);
  assert.equal(second.length, 0);
  const logContents = await readFile(getLogFilePath(dir), "utf8");
  assert.equal(logContents.trim().split("\n").length, 1);
});
