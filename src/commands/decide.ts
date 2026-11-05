import { readState, transitionItem, writeState } from "../state.js";
import type { Item } from "../types.js";

export async function runApprove(dataDir: string, id: string, now: Date = new Date()): Promise<Item> {
  return decide(dataDir, id, "approved", now);
}

export async function runReject(dataDir: string, id: string, now: Date = new Date()): Promise<Item> {
  return decide(dataDir, id, "rejected", now);
}

async function decide(
  dataDir: string,
  id: string,
  to: "approved" | "rejected",
  now: Date,
): Promise<Item> {
  const state = await readState(dataDir);
  const { state: nextState, item } = transitionItem(state, id, ["pending_review"], to, now);
  await writeState(dataDir, nextState);
  return item;
}
