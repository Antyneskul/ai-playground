import { appendExecutionLog } from "../log.js";
import { readState, transitionItem, writeState } from "../state.js";
import type { Item } from "../types.js";

export async function runExecute(dataDir: string, now: Date = new Date()): Promise<Item[]> {
  const state = await readState(dataDir);
  const approved = state.items.filter((item) => item.status === "approved");
  if (approved.length === 0) {
    return [];
  }

  // At-least-once: state is persisted after each item so a crash mid-run can
  // duplicate at most one log entry on the next run, but never silently drops an item.
  let currentState = state;
  const executed: Item[] = [];
  for (const approvedItem of approved) {
    const { state: nextState, item: updated } = transitionItem(
      currentState,
      approvedItem.id,
      ["approved"],
      "executed",
      now,
    );
    currentState = nextState;
    await appendExecutionLog(dataDir, {
      timestamp: now.toISOString(),
      id: updated.id,
      message: updated.message,
    });
    await writeState(dataDir, currentState);
    executed.push(updated);
  }

  return executed;
}
