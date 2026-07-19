import "server-only";

import { Agent, run, setDefaultOpenAIKey, setTracingDisabled } from "@openai/agents";
import { z } from "zod";

import { getOpenAIKey } from "@/lib/server-env";

export const PressureProfileSchema = z.object({
  archetype: z.string().max(60),
  summary: z.string().max(280),
  strongestTrait: z.enum(["calibration", "conviction", "nerve", "timing", "composure"]),
  weakestTrait: z.enum(["calibration", "conviction", "nerve", "timing", "composure"]),
  definingDecision: z.string().max(180),
  rivalLine: z.string().max(140),
  traits: z.object({
    calibration: z.number().min(0).max(100),
    conviction: z.number().min(0).max(100),
    nerve: z.number().min(0).max(100),
    timing: z.number().min(0).max(100),
    composure: z.number().min(0).max(100),
  }),
});

const pressureProfileAgent = new Agent({
  name: "The Quant",
  model: "gpt-5.6-luna",
  instructions: `You are The Quant, the single AI rival in RIVAL, a football decision game.
Produce a concise entertainment profile from only the supplied immutable prediction evidence.
Profile only predictions whose creator is "user". Rival predictions are comparison context only.
The definingDecision must describe a user call, never the rival's call. If the user lost, say so plainly.
Never invent a match event, probability, result, or user action. Never make clinical claims.
Sound controlled, sharp, and impressed only when evidence warrants it.
Conviction points have no monetary value. Do not use gambling, profit, cash-out, buy, or sell language.`,
  outputType: PressureProfileSchema,
});

export async function generatePressureProfile(evidence: unknown) {
  setDefaultOpenAIKey(getOpenAIKey());
  setTracingDisabled(true);
  const result = await run(
    pressureProfileAgent,
    `Create the full-time Pressure Profile from this server-produced evidence:\n${JSON.stringify(evidence)}`,
    { maxTurns: 2 },
  );
  if (!result.finalOutput) throw new Error("The rival agent returned no profile");
  return PressureProfileSchema.parse(result.finalOutput);
}
