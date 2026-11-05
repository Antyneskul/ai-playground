import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runApprove, runReject } from "./decide.js";
import { runDraft } from "./draft.js";
import { readState } from "../state.js";
import { InvalidTransitionError } from "../state.js";

async function tempDataDir() {
  return mkdtemp(path.join(tmpdir(), "approval-agent-decide-"));
}

test("runApprove moves a pending_review item to approved and persists it", async () => {
  const dir = await tempDataDir();
  await runDraft(dir);
  const item = await runApprove(dir, "1");
  assert.equal(item.status, "approved");
  const state = await readState(dir);
  assert.equal(state.items[0].status, "approved");
});

test("runReject moves a pending_review item to rejected and persists it", async () => {
  const dir = await tempDataDir();
  await runDraft(dir);
  const item = await runReject(dir, "1");
  assert.equal(item.status, "rejected");
});

test("runApprove throws InvalidTransitionError for a nonexistent id", async () => {
  const dir = await tempDataDir();
  await assert.rejects(() => runApprove(dir, "999"), InvalidTransitionError);
});

test("runApprove throws InvalidTransitionError on an already-approved item (double approve)", async () => {
  const dir = await tempDataDir();
  await runDraft(dir);
  await runApprove(dir, "1");
  await assert.rejects(() => runApprove(dir, "1"), InvalidTransitionError);
});

test("runReject throws InvalidTransitionError on an already-approved item", async () => {
  const dir = await tempDataDir();
  await runDraft(dir);
  await runApprove(dir, "1");
  await assert.rejects(() => runReject(dir, "1"), InvalidTransitionError);
});
