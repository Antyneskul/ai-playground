#!/usr/bin/env node
import { getDataDir } from "./paths.js";
import { runDraft } from "./commands/draft.js";
import { runList } from "./commands/list.js";
import { runApprove, runReject } from "./commands/decide.js";
import { runExecute } from "./commands/run.js";
import type { Item } from "./types.js";

function formatItem(item: Item): string {
  return `[${item.id}] ${item.status} ${item.message}`;
}

export async function main(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;
  const dataDir = getDataDir();

  switch (command) {
    case "draft": {
      const item = await runDraft(dataDir);
      console.log(formatItem(item));
      break;
    }
    case "list": {
      const output = await runList(dataDir);
      console.log(output);
      break;
    }
    case "approve": {
      const id = rest[0];
      if (!id) {
        throw new Error("Usage: approve <id>");
      }
      const item = await runApprove(dataDir, id);
      console.log(formatItem(item));
      break;
    }
    case "reject": {
      const id = rest[0];
      if (!id) {
        throw new Error("Usage: reject <id>");
      }
      const item = await runReject(dataDir, id);
      console.log(formatItem(item));
      break;
    }
    case "run": {
      const executed = await runExecute(dataDir);
      if (executed.length === 0) {
        console.log("No approved items to run.");
      } else {
        for (const item of executed) {
          console.log(formatItem(item));
        }
      }
      break;
    }
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
