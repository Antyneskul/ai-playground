import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createEmptyState, readState, writeState, addItem, findItem,
  transitionItem, InvalidTransitionError,
} from "./state.js";

async function tempDataDir() {
  return mkdtemp(path.join(tmpdir(), "approval-agent-state-"));
}

test("readState returns an empty state when no file exists yet", async () => {
  const dir = await tempDataDir();
  assert.deepEqual(await readState(dir), createEmptyState());
});

test("writeState then readState round-trips", async () => {
  const dir = await tempDataDir();
  const { state } = addItem(createEmptyState(), "hello");
  await writeState(dir, state);
  assert.deepEqual(await readState(dir), state);
});

test("addItem assigns sequential ids and pending_review status", () => {
  const { state: s1, item: item1 } = addItem(createEmptyState(), "first");
  assert.equal(item1.id, "1");
  assert.equal(item1.status, "pending_review");
  const { item: item2 } = addItem(s1, "second");
  assert.equal(item2.id, "2");
});

test("findItem finds an existing item and returns undefined for a missing one", () => {
  const { state } = addItem(createEmptyState(), "hello");
  assert.equal(findItem(state, "1")?.message, "hello");
  assert.equal(findItem(state, "nope"), undefined);
});

test("transitionItem moves an item from an allowed status to the target status", () => {
  const { state } = addItem(createEmptyState(), "hello");
  const { state: next, item } = transitionItem(state, "1", ["pending_review"], "approved");
  assert.equal(item.status, "approved");
  assert.equal(findItem(next, "1")?.status, "approved");
});

test("transitionItem throws InvalidTransitionError for a nonexistent id", () => {
  const { state } = addItem(createEmptyState(), "hello");
  assert.throws(() => transitionItem(state, "999", ["pending_review"], "approved"), InvalidTransitionError);
});

test("transitionItem throws InvalidTransitionError when current status is not allowed", () => {
  const { state } = addItem(createEmptyState(), "hello");
  const { state: approvedState } = transitionItem(state, "1", ["pending_review"], "approved");
  assert.throws(
    () => transitionItem(approvedState, "1", ["pending_review"], "approved"),
    InvalidTransitionError,
  );
});
