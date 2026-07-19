export const REPLAY_PUBLIC_DEMO = process.env.NEXT_PUBLIC_REPLAY_DEMO === "1";

export function isReplayServerDemo(): boolean {
  return process.env.REPLAY_DEMO_MODE === "1" || process.env.VERCEL === "1";
}
