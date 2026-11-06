import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildDraftMessage, runDraft } from "./draft.js";
import { readState } from "../state.js";

async function tempDataDir() {
  return mkdtemp(path.join(tmpdir(), "approval-agent-draft-"));
}

test("buildDraftMessage embeds the given id and timestamp", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const message = buildDraftMessage("1", now);
  assert.match(message, /#1/);
  assert.match(message, /2026-01-01T00:00:00\.000Z/);
});

test("runDraft writes a new pending_review item and returns it", async () => {
  const dir = await tempDataDir();
  const item = await runDraft(dir, new Date("2026-01-01T00:00:00.000Z"));
  assert.equal(item.id, "1");
  assert.equal(item.status, "pending_review");
  const state = await readState(dir);
  assert.equal(state.items.length, 1);
  assert.equal(state.items[0].id, "1");
});

test("runDraft called twice assigns distinct ids", async () => {
  const dir = await tempDataDir();
  await runDraft(dir);
  const second = await runDraft(dir);
  assert.equal(second.id, "2");
});
