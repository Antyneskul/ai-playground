import { appendFile, mkdir } from "node:fs/promises";
import { getLogFilePath } from "./paths.js";

export interface LogEntry {
  timestamp: string;
  id: string;
  message: string;
}

export async function appendExecutionLog(dataDir: string, entry: LogEntry): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  await appendFile(getLogFilePath(dataDir), JSON.stringify(entry) + "\n", "utf8");
}
