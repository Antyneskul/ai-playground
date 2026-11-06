import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { main } from "./cli.js";

async function tempDataDir() {
  const dir = await mkdtemp(path.join(tmpdir(), "approval-agent-cli-"));
  process.env.APPROVAL_AGENT_DATA_DIR = dir;
  return dir;
}

test("draft then list shows the pending item", async () => {
  await tempDataDir();
  const lines: string[] = [];
  const originalLog = console.log;
  console.log = (msg: string) => lines.push(msg);
  try {
    await main(["draft"]);
    await main(["list"]);
  } finally {
    console.log = originalLog;
  }
  assert.ok(lines.some((l) => l.includes("pending_review")));
});

test("approve with a missing id argument rejects instead of crashing silently", async () => {
  await tempDataDir();
  await assert.rejects(() => main(["approve"]));
});

test("an unknown command rejects instead of doing nothing silently", async () => {
  await tempDataDir();
  await assert.rejects(() => main(["bogus"]));
});

test("full lifecycle: draft, approve, run marks the item executed", async () => {
  await tempDataDir();
  const lines: string[] = [];
  const originalLog = console.log;
  console.log = (msg: string) => lines.push(msg);
  try {
    await main(["draft"]);
    await main(["approve", "1"]);
    await main(["run"]);
    await main(["list"]);
  } finally {
    console.log = originalLog;
  }
  assert.ok(lines.some((l) => l.includes("executed")));
});
