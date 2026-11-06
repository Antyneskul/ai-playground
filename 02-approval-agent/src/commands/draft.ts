import { addItem, readState, writeState } from "../state.js";
import type { Item } from "../types.js";

export function buildDraftMessage(id: string, now: Date): string {
  return `Draft message #${id}: auto-generated at ${now.toISOString()}.`;
}

export async function runDraft(dataDir: string, now: Date = new Date()): Promise<Item> {
  const state = await readState(dataDir);
  const message = buildDraftMessage(String(state.nextId), now);
  const { state: nextState, item } = addItem(state, message, now);
  await writeState(dataDir, nextState);
  return item;
}
