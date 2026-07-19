import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { NextResponse } from "next/server";
import { z } from "zod";

import { isReplayServerDemo } from "@/lib/replay/demo-mode";
import { getOpenAIKey } from "@/lib/server-env";

export const runtime = "nodejs";

const CallSchema = z.object({
  predictionType: z.enum([
    "NEXT_TEAM_TO_SCORE",
    "NEXT_CORNER",
    "GOAL_BEFORE",
    "NO_GOAL_WINDOW",
    "MATCH_RESULT",
  ]),
  side: z.union([z.literal(1), z.literal(2)]).nullable(),
  deadlineMatchSecond: z.number().int().nonnegative().nullable(),
  conviction: z.number().int().min(5).max(40),
  requiresConfirmation: z.literal(true),
  spokenSummary: z.string().max(140),
});

export async function POST(request: Request) {
  try {
    if (isReplayServerDemo()) {
      return NextResponse.json({ error: "AI interpretation is disabled in the public demo" }, { status: 403 });
    }
    const body = (await request.json()) as {
      transcript?: string;
      currentClock?: number;
      participant1?: string;
      participant2?: string;
    };
    if (!body.transcript?.trim()) {
      return NextResponse.json({ error: "Transcript is required" }, { status: 400 });
    }
    const openai = new OpenAI({ apiKey: getOpenAIKey() });
    const response = await openai.responses.parse({
      model: "gpt-5.6-luna",
      input: [
        {
          role: "system",
          content: `Interpret the fan's sentence as one supported RIVAL call. Side 1 is ${body.participant1 ?? "home"}; side 2 is ${body.participant2 ?? "away"}. Current clock is ${body.currentClock ?? 0} seconds. Do not invent player props or unsupported data.`,
        },
        { role: "user", content: body.transcript },
      ],
      text: { format: zodTextFormat(CallSchema, "rival_call") },
    });
    if (!response.output_parsed) throw new Error("No structured call returned");
    return NextResponse.json(response.output_parsed);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to interpret call" },
      { status: 500 },
    );
  }
}
