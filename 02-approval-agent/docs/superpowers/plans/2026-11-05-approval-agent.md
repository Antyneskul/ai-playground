# Approval Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a stateless CLI (`draft` / `list` / `approve` / `reject` / `run`) whose entire lifecycle state lives in a JSON file on disk, so any command can be the first thing run after a process restart.

**Architecture:** A pure state/log core (`src/state.ts`, `src/log.ts`) with no I/O side effects beyond reading/writing one JSON file and appending one log file; thin command functions (`src/commands/*.ts`) that call the core and are independently testable via an injectable data directory; a `src/cli.ts` entrypoint that parses `process.argv`, dispatches, and turns thrown errors into a non-zero exit with a visible message.

**Tech Stack:** TypeScript + Node, run via `tsx` (no build step), `node:test` + `node:assert/strict` for tests, no runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-11-05-approval-agent-design.md`

## Global Constraints

- TypeScript + Node, run via `tsx`, no build step; `package.json` has `"type": "module"`; `tsc --noEmit` is the typecheck command.
- Own standalone git repo at `ai-mini-labs/02-approval-agent`; no dependency on `01-eval-playground`.
- No long-running process and no blocking prompt (no `readline` waiting on stdin) anywhere.
- State lives entirely in a JSON file on disk — every command reads state, does one thing, writes state back, exits. No in-memory state survives across invocations.
- Transition guards are strict: `approve`/`reject` act only on items currently `pending_review`; `run` acts only on items currently `approved` and not yet executed. Any invalid transition is a loud, visible thrown error — never a silent no-op or overwrite.
- Execution is simulated by appending an entry to a local, append-only log file — no real external side effect.
- No auth, no multi-user support, no concurrent-writer safety, no retry/queueing infrastructure.

## Review Focus

- `approve`/`reject` given an id that doesn't exist in `items` — must throw a visible error, not silently do nothing. (Task 2)
- `approve`/`reject`/`run` given an item that is in the wrong status (e.g. double-approve, approving an already-executed item) — must throw a visible error, not silently overwrite status. (Task 2, Task 6, Task 7)
- `list`/`approve`/`reject`/`run` invoked before any `draft` has ever run (no state file on disk yet) — must treat this as an empty state, not crash. (Task 2)
- `run` invoked with zero `approved` items (nothing to do) — must exit cleanly without writing the state file or touching the log file. (Task 7)
- `run` invoked twice in a row after items were already executed — already-`executed` items must not be re-executed or re-appended to the log. (Task 7)

---

### Task 1: Project scaffolding + data-dir resolution

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Modify: `.gitignore` (add `data/`)
- Create: `src/paths.ts`
- Test: `src/paths.test.ts`

**Interfaces:**
- Produces: `getDataDir(): string`, `getStateFilePath(dataDir?: string): string`, `getLogFilePath(dataDir?: string): string` — every later module resolves file locations through these.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "approval-agent",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "tsx --test src/**/*.test.ts",
    "cli": "tsx src/cli.ts"
  },
  "devDependencies": {
    "@types/node": "^22.10.1",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`** (mirrors `01-eval-playground`'s config)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Run `npm install`**

Run: `npm install`
Expected: installs `typescript`, `tsx`, `@types/node` with no errors; creates `node_modules/` and `package-lock.json`.

- [ ] **Step 4: Add `data/` to `.gitignore`**

The state file and log file are runtime-generated local state, not committed. Append `data/` as a new line to the existing `.gitignore` (which already has `node_modules/`, `.env`, `*.log`).

- [ ] **Step 5: Write the failing test for `src/paths.ts`**

```ts
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
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `src/paths.ts` does not exist yet.

- [ ] **Step 7: Implement `src/paths.ts`**

Implement `getDataDir(): string` (reads `process.env.APPROVAL_AGENT_DATA_DIR`, falls back to `path.join(process.cwd(), "data")`), `getStateFilePath(dataDir = getDataDir()): string` (joins `dataDir` with `"state.json"`), `getLogFilePath(dataDir = getDataDir()): string` (joins `dataDir` with `"execution.log"`).

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test`
Expected: PASS (3 tests).

- [ ] **Step 9: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json tsconfig.json .gitignore src/paths.ts src/paths.test.ts
git commit -m "chore: scaffold project and add data-dir resolution"
```

---

### Task 2: State module — types, read/write, transitions

**Files:**
- Create: `src/types.ts`
- Create: `src/state.ts`
- Test: `src/state.test.ts`

**Interfaces:**
- Consumes: `getStateFilePath(dataDir?: string): string` from Task 1 (`src/paths.ts`).
- Produces: types `ItemStatus`, `Item { id: string; message: string; status: ItemStatus; createdAt: string; updatedAt: string }`, `State { nextId: number; items: Item[] }`; class `InvalidTransitionError extends Error`; functions `createEmptyState(): State`, `readState(dataDir: string): Promise<State>`, `writeState(dataDir: string, state: State): Promise<void>`, `addItem(state: State, message: string, now?: Date): { state: State; item: Item }`, `findItem(state: State, id: string): Item | undefined`, `transitionItem(state: State, id: string, allowedFrom: ItemStatus[], to: ItemStatus, now?: Date): { state: State; item: Item }` (throws `InvalidTransitionError` if the id is not found, or if the found item's current status is not in `allowedFrom`). All later command modules use these; none read or write the state file any other way.

- [ ] **Step 1: Write the failing tests**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `src/state.ts` does not exist yet.

- [ ] **Step 3: Implement `src/types.ts` and `src/state.ts`**

`src/types.ts` defines `ItemStatus = "pending_review" | "approved" | "rejected" | "executed"`, `Item`, and `State` exactly as specified in Interfaces above.

`src/state.ts` implements the functions above. `readState` reads the file at `getStateFilePath(dataDir)`; if it doesn't exist (`ENOENT`), return `createEmptyState()`. `writeState` creates `dataDir` recursively if needed and writes `JSON.stringify(state, null, 2)`. `addItem` reads `state.nextId` as the new item's id (as a string), builds the `Item` with `createdAt`/`updatedAt` set to `now.toISOString()` (default `new Date()`), appends it to a new `items` array, and returns `{ state: { nextId: state.nextId + 1, items: [...] }, item }`. `transitionItem` looks up the item via `findItem`; throws `InvalidTransitionError` with a message naming the id if not found; throws `InvalidTransitionError` with a message naming the id, its current status, and the allowed statuses if `allowedFrom` doesn't include it; otherwise returns a new state with that item replaced by a copy with `status: to` and `updatedAt: now.toISOString()`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all tests in `src/paths.test.ts` and `src/state.test.ts`).

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/state.ts src/state.test.ts
git commit -m "feat: add state module with read/write and transition guards"
```

---

### Task 3: Execution log module

**Files:**
- Create: `src/log.ts`
- Test: `src/log.test.ts`

**Interfaces:**
- Consumes: `getLogFilePath(dataDir?: string): string` from Task 1.
- Produces: `LogEntry { timestamp: string; id: string; message: string }`, `appendExecutionLog(dataDir: string, entry: LogEntry): Promise<void>` — appends one JSON-encoded line. Task 7 (`run` command) calls this once per executed item.

- [ ] **Step 1: Write the failing tests**

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `src/log.ts` does not exist yet.

- [ ] **Step 3: Implement `src/log.ts`**

Implement `LogEntry` type and `appendExecutionLog(dataDir, entry)`: create `dataDir` recursively if needed, then `fs.appendFile(getLogFilePath(dataDir), JSON.stringify(entry) + "\n")`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all tests so far).

- [ ] **Step 5: Commit**

```bash
git add src/log.ts src/log.test.ts
git commit -m "feat: add append-only execution log module"
```

---

### Task 4: `draft` command

**Files:**
- Create: `src/commands/draft.ts`
- Test: `src/commands/draft.test.ts`

**Interfaces:**
- Consumes: `readState`, `writeState`, `addItem` from Task 2 (`src/state.ts`); `Item` type from Task 2.
- Produces: `buildDraftMessage(id: string, now: Date): string`, `runDraft(dataDir: string, now?: Date): Promise<Item>`. Task 8 (`cli.ts`) calls `runDraft`.

- [ ] **Step 1: Write the failing tests**

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `src/commands/draft.ts` does not exist yet.

- [ ] **Step 3: Implement `src/commands/draft.ts`**

`buildDraftMessage(id, now)` returns a static template string embedding `id` and `now.toISOString()`, e.g. `` `Draft message #${id}: auto-generated at ${now.toISOString()}.` ``. `runDraft(dataDir, now = new Date())` reads state via `readState`, builds the message with `buildDraftMessage(String(state.nextId), now)`, calls `addItem(state, message, now)`, writes the returned state via `writeState`, and returns the new item.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all tests so far).

- [ ] **Step 5: Commit**

```bash
git add src/commands/draft.ts src/commands/draft.test.ts
git commit -m "feat: add draft command"
```

---

### Task 5: `list` command

**Files:**
- Create: `src/commands/list.ts`
- Test: `src/commands/list.test.ts`

**Interfaces:**
- Consumes: `readState` from Task 2; `Item` type from Task 2.
- Produces: `formatItems(items: Item[]): string`, `runList(dataDir: string): Promise<string>`. Task 8 (`cli.ts`) calls `runList` and prints the returned string to stdout.

- [ ] **Step 1: Write the failing tests**

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `src/commands/list.ts` does not exist yet.

- [ ] **Step 3: Implement `src/commands/list.ts`**

`formatItems(items)` returns `"No items."` when `items.length === 0`; otherwise one line per item in the form `` `[${id}] ${status} ${message}` `` joined with `"\n"`. `runList(dataDir)` calls `readState(dataDir)` and returns `formatItems(state.items)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all tests so far).

- [ ] **Step 5: Commit**

```bash
git add src/commands/list.ts src/commands/list.test.ts
git commit -m "feat: add list command"
```

---

### Task 6: `approve` / `reject` commands

**Files:**
- Create: `src/commands/decide.ts`
- Test: `src/commands/decide.test.ts`

**Interfaces:**
- Consumes: `readState`, `writeState`, `transitionItem`, `InvalidTransitionError` from Task 2; `Item` type from Task 2; `runDraft` from Task 4 (tests only).
- Produces: `runApprove(dataDir: string, id: string, now?: Date): Promise<Item>`, `runReject(dataDir: string, id: string, now?: Date): Promise<Item>` — each throws `InvalidTransitionError` on an invalid id or status, and otherwise persists the transition before returning. Task 8 (`cli.ts`) calls both.

- [ ] **Step 1: Write the failing tests**

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `src/commands/decide.ts` does not exist yet.

- [ ] **Step 3: Implement `src/commands/decide.ts`**

Both functions read state via `readState`, call `transitionItem(state, id, ["pending_review"], "approved" | "rejected", now)`, write the returned state via `writeState`, and return the updated item. Let `InvalidTransitionError` propagate uncaught — the caller (`cli.ts`) is responsible for turning it into a visible exit.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all tests so far).

- [ ] **Step 5: Commit**

```bash
git add src/commands/decide.ts src/commands/decide.test.ts
git commit -m "feat: add approve and reject commands"
```

---

### Task 7: `run` command

**Files:**
- Create: `src/commands/run.ts`
- Test: `src/commands/run.test.ts`

**Interfaces:**
- Consumes: `readState`, `writeState`, `transitionItem` from Task 2; `appendExecutionLog` from Task 3; `Item` type from Task 2; `runDraft` from Task 4 and `runApprove` from Task 6 (tests only).
- Produces: `runExecute(dataDir: string, now?: Date): Promise<Item[]>` — returns the list of items it just executed (empty array if none were approved). Task 8 (`cli.ts`) calls this.

- [ ] **Step 1: Write the failing tests**

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `src/commands/run.ts` does not exist yet.

- [ ] **Step 3: Implement `src/commands/run.ts`**

`runExecute(dataDir, now = new Date())` reads state; filters `state.items` for `status === "approved"`; if none, return `[]` immediately without calling `writeState` or `appendExecutionLog`. Otherwise, fold over the approved items, calling `transitionItem(current, item.id, ["approved"], "executed", now)` for each (threading the returned state through), calling `appendExecutionLog(dataDir, { timestamp: now.toISOString(), id: updated.id, message: updated.message })` for each, collecting the updated items; after the loop, `writeState(dataDir, finalState)` once; return the collected executed items.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all tests so far).

- [ ] **Step 5: Commit**

```bash
git add src/commands/run.ts src/commands/run.test.ts
git commit -m "feat: add run command"
```

---

### Task 8: CLI entrypoint and manual restart-safety check

**Files:**
- Create: `src/cli.ts`
- Test: `src/cli.test.ts`

**Interfaces:**
- Consumes: `runDraft` (Task 4), `runList` (Task 5), `runApprove`/`runReject` (Task 6), `runExecute` (Task 7), `InvalidTransitionError` (Task 2).
- Produces: `main(argv: string[]): Promise<void>` (exported for testing) and a `#!/usr/bin/env node` executable that calls `main(process.argv.slice(2))`, printing a usage error and exiting non-zero on an unknown command, a missing `<id>` argument, or a thrown `InvalidTransitionError`.

- [ ] **Step 1: Write the failing tests**

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `src/cli.ts` does not exist yet.

- [ ] **Step 3: Implement `src/cli.ts`**

`main(argv)` destructures `const [command, ...rest] = argv` and switches on `command`: `"draft"` calls `runDraft(getDataDir())` and `console.log`s the resulting item; `"list"` calls `runList(getDataDir())` and `console.log`s the returned string; `"approve"`/`"reject"` require `rest[0]` to be present (throw `new Error("Usage: approve <id>")` / reject equivalent otherwise), then call `runApprove`/`runReject`; `"run"` calls `runExecute(getDataDir())` and logs each executed item or `"No approved items to run."` if empty; `default` throws `new Error(\`Unknown command: ${command}\`)`. At the bottom of the file, guard top-level execution (e.g. check `import.meta.url === \`file://${process.argv[1]}\`` or just always run when not under the test runner) so that running `tsx src/cli.ts <command>` invokes `main(process.argv.slice(2))` and on a caught error prints `error.message` to `console.error` and calls `process.exit(1)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (full suite).

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/cli.ts src/cli.test.ts
git commit -m "feat: add CLI entrypoint wiring all commands"
```

- [ ] **Step 7: Manual restart-safety smoke test**

Per the spec, this is demonstrated manually, not with an automated kill-signal harness. In the real project directory (not a temp dir), run each command as a separate process and inspect `data/state.json` and `data/execution.log` between steps:

```bash
npm run cli -- draft
cat data/state.json        # confirm one pending_review item
npm run cli -- approve 1
cat data/state.json        # confirm item is now approved
npm run cli -- run
cat data/state.json        # confirm item is now executed
cat data/execution.log     # confirm one JSON line was appended
npm run cli -- run         # run again — confirm it reports nothing to do, log unchanged
npm run cli -- approve 1   # confirm this now throws a visible error (already executed)
```

No code changes result from this step — it's a verification checkpoint confirming the state machine behaves correctly across independent process invocations, which is the lab's core learning goal.
