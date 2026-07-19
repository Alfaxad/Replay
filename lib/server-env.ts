import "server-only";

export function getOpenAIKey(): string {
  const value =
    process.env.OPENAI_API_KEY ??
    process.env.OPEN_AI_KEY;

  if (!value) {
    throw new Error("Missing OPENAI_API_KEY or OPEN_AI_KEY");
  }
  return value;
}
