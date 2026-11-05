import { mkdir, readFile, writeFile } from "node:fs/promises";
import { getStateFilePath } from "./paths.js";
import type { Item, ItemStatus, State } from "./types.js";

export class InvalidTransitionError extends Error {}

export function createEmptyState(): State {
  return { nextId: 1, items: [] };
}

export async function readState(dataDir: string): Promise<State> {
  try {
    const raw = await readFile(getStateFilePath(dataDir), "utf8");
    return JSON.parse(raw) as State;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return createEmptyState();
    }
    throw err;
  }
}

export async function writeState(dataDir: string, state: State): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  await writeFile(getStateFilePath(dataDir), JSON.stringify(state, null, 2));
}

export function addItem(
  state: State,
  message: string,
  now: Date = new Date(),
): { state: State; item: Item } {
  const timestamp = now.toISOString();
  const item: Item = {
    id: String(state.nextId),
    message,
    status: "pending_review",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const nextState: State = {
    nextId: state.nextId + 1,
    items: [...state.items, item],
  };
  return { state: nextState, item };
}

export function findItem(state: State, id: string): Item | undefined {
  return state.items.find((item) => item.id === id);
}

export function transitionItem(
  state: State,
  id: string,
  allowedFrom: ItemStatus[],
  to: ItemStatus,
  now: Date = new Date(),
): { state: State; item: Item } {
  const current = findItem(state, id);
  if (!current) {
    throw new InvalidTransitionError(`Item "${id}" not found`);
  }
  if (!allowedFrom.includes(current.status)) {
    throw new InvalidTransitionError(
      `Item "${id}" has status "${current.status}", expected one of [${allowedFrom.join(", ")}]`,
    );
  }
  const updated: Item = { ...current, status: to, updatedAt: now.toISOString() };
  const nextState: State = {
    nextId: state.nextId,
    items: state.items.map((item) => (item.id === id ? updated : item)),
  };
  return { state: nextState, item: updated };
}
