import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { getDataDir, getStateFilePath, getLogFilePath } from "./paths.js";

test("getDataDir defaults to <cwd>/data", () => {
  delete process.env.APPROVAL_AGENT_DATA_DIR;
  assert.equal(getDataDir(), path.join(process.cwd(), "data"));
});

test("getDataDir honors APPROVAL_AGENT_DATA_DIR override", () => {
  process.env.APPROVAL_AGENT_DATA_DIR = "/tmp/example";
  assert.equal(getDataDir(), "/tmp/example");
  delete process.env.APPROVAL_AGENT_DATA_DIR;
});

test("getStateFilePath and getLogFilePath join onto the given dataDir", () => {
  assert.equal(getStateFilePath("/tmp/example"), path.join("/tmp/example", "state.json"));
  assert.equal(getLogFilePath("/tmp/example"), path.join("/tmp/example", "execution.log"));
});
