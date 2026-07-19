import OpenAI from "openai";
import { NextResponse } from "next/server";

import { createReplayStory, type ReplayStoryRequest } from "@/lib/ai/replay-story";
import { isReplayServerDemo } from "@/lib/replay/demo-mode";
import { getOpenAIKey } from "@/lib/server-env";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (isReplayServerDemo()) {
      return NextResponse.json({ error: "Live story generation is disabled in the public demo" }, { status: 403 });
    }
    const body = (await request.json()) as ReplayStoryRequest;
    const openai = new OpenAI({ apiKey: getOpenAIKey() });
    return NextResponse.json(await createReplayStory(openai, body));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to prepare Replay story" },
      { status: 500 },
    );
  }
}
