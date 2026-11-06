import "dotenv/config";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const config = {
  anthropicApiKey: requireEnv("ANTHROPIC_API_KEY"),
  openaiApiKey: requireEnv("OPENAI_API_KEY"),
  generatorModel: "gpt-4o-mini",
  judgeModel: "claude-haiku-5-5",
};
