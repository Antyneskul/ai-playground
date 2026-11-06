import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { formatItems, runList } from "./list.js";
import { runDraft } from "./draft.js";

async function tempDataDir() {
  return mkdtemp(path.join(tmpdir(), "approval-agent-list-"));
}

test("formatItems returns a placeholder message for an empty list", () => {
  assert.equal(formatItems([]), "No items.");
});

test("formatItems includes each item's id, status, and message", () => {
  const output = formatItems([
    { id: "1", message: "hello", status: "pending_review", createdAt: "x", updatedAt: "x" },
  ]);
  assert.match(output, /1/);
  assert.match(output, /pending_review/);
  assert.match(output, /hello/);
});

test("runList reflects what runDraft wrote to disk", async () => {
  const dir = await tempDataDir();
  await runDraft(dir);
  const output = await runList(dir);
  assert.match(output, /pending_review/);
});

test("runList on an empty data dir returns the empty-list message, not a crash", async () => {
  const dir = await tempDataDir();
  assert.equal(await runList(dir), "No items.");
});
