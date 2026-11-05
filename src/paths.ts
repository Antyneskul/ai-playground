import path from "node:path";

// Read the env var on every call (never cache): tests set/unset it per-test in one process.
export function getDataDir(): string {
  return process.env.APPROVAL_AGENT_DATA_DIR ?? path.join(process.cwd(), "data");
}

export function getStateFilePath(dataDir: string = getDataDir()): string {
  return path.join(dataDir, "state.json");
}

export function getLogFilePath(dataDir: string = getDataDir()): string {
  return path.join(dataDir, "execution.log");
}
