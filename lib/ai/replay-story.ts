import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

export const ReplayScriptSchema = z.object({
  arcTitle: z.string().max(80),
  openingLine: z.string().max(260),
  moments: z.array(z.object({
    id: z.string().max(80),
    spokenLine: z.string().max(360),
    explainer: z.string().max(260),
  })).max(36),
});

export type ReplayScript = z.infer<typeof ReplayScriptSchema>;

export type ReplayStoryRequest = {
  match?: {
    fixtureId?: number;
    stage?: string;
    home?: { name?: string };
    away?: { name?: string };
    score?: [number, number] | null;
  };
  moments?: Array<{
    id?: string;
    clockLabel?: string;
    title?: string;
    fact?: string;
    importance?: number;
  }>;
};

export async function createReplayStory(openai: OpenAI, body: ReplayStoryRequest): Promise<ReplayScript> {
  const moments = (body.moments ?? []).slice(0, 36);
  if (!body.match?.home?.name || !body.match.away?.name || !moments.length) {
    throw new Error("Match and moments are required");
  }
  if (moments.some((moment) => !moment.id)) {
    throw new Error("Every moment requires an id");
  }

  const allowedIds = new Set(moments.map((moment) => String(moment.id)));
  const response = await openai.responses.parse({
    model: "gpt-5.6-luna",
    input: [
      {
        role: "system",
        content: `You write the short chapters of Replay, a personal audio journey through a completed football match. Ash will perform each chapter with a warm, vivid, vintage-radio sensibility.
Use only the verified facts supplied. Never add a player, incident, score, minute, motive, statistic, or causal claim that is not in the facts.
Sound vivid and exhilarating at goals and decisive swings, but intimate and reflective at checkpoints. Explain why a moment matters using only score and flow evidence in the input.
The application deterministically speaks each moment's verified clock immediately before spokenLine. Do not repeat or paraphrase the minute inside spokenLine.
Each spokenLine must stand alone after that clock introduction, begin naturally, and take under 14 seconds to say. Do not use markdown, emojis, odds, betting language, or visual-only phrases.
Every number or named person in a spokenLine must appear in that moment's verified fact. State each score or count once; never use a rhetorical false number and then correct it.
Return exactly one entry for every supplied moment, preserving every id exactly.`,
      },
      {
        role: "user",
        content: JSON.stringify({ match: body.match, verifiedMoments: moments }),
      },
    ],
    text: { format: zodTextFormat(ReplayScriptSchema, "replay_story_script") },
  });

  if (!response.output_parsed) throw new Error("No commentary script returned");
  const parsed = ReplayScriptSchema.parse(response.output_parsed);
  const returnedIds = new Set(parsed.moments.map((moment) => moment.id));
  if (parsed.moments.some((moment) => !allowedIds.has(moment.id)) || [...allowedIds].some((id) => !returnedIds.has(id))) {
    throw new Error("Commentary script did not preserve the verified moment set");
  }
  return parsed;
}
