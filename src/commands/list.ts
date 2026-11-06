import { readState } from "../state.js";
import type { Item } from "../types.js";

export function formatItem(item: Item): string {
  return `[${item.id}] ${item.status} ${item.message}`;
}

export function formatItems(items: Item[]): string {
  if (items.length === 0) {
    return "No items.";
  }
  return items.map(formatItem).join("\n");
}

export async function runList(dataDir: string): Promise<string> {
  const state = await readState(dataDir);
  return formatItems(state.items);
}
