import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { appendExecutionLog } from "./log.js";

async function tempDataDir() {
  return mkdtemp(path.join(tmpdir(), "approval-agent-log-"));
}

test("appendExecutionLog creates the log file and writes one JSON line", async () => {
  const dir = await tempDataDir();
  await appendExecutionLog(dir, { timestamp: "2026-01-01T00:00:00.000Z", id: "1", message: "hello" });
  const contents = await readFile(path.join(dir, "execution.log"), "utf8");
  const lines = contents.trim().split("\n");
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]), { timestamp: "2026-01-01T00:00:00.000Z", id: "1", message: "hello" });
});

test("appendExecutionLog appends subsequent entries as additional lines", async () => {
  const dir = await tempDataDir();
  await appendExecutionLog(dir, { timestamp: "2026-01-01T00:00:00.000Z", id: "1", message: "first" });
  await appendExecutionLog(dir, { timestamp: "2026-01-01T00:00:01.000Z", id: "2", message: "second" });
  const contents = await readFile(path.join(dir, "execution.log"), "utf8");
  assert.equal(contents.trim().split("\n").length, 2);
});
