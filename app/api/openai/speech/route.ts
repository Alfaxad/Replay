import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { ASH_PERFORMANCE_DIRECTION, momentDirection } from "@/lib/ai/ash-speech";
import { isReplayServerDemo } from "@/lib/replay/demo-mode";
import { getOpenAIKey } from "@/lib/server-env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (isReplayServerDemo()) {
      return NextResponse.json({ error: "Live speech generation is disabled in the public demo" }, { status: 403 });
    }
    const body = (await request.json()) as { text?: unknown; kind?: unknown; intensity?: unknown };
    const text = String(body.text ?? "").trim().slice(0, 4096);
    const kind = String(body.kind ?? "moment").slice(0, 40);
    const intensity = Number.isFinite(Number(body.intensity)) ? Number(body.intensity) : 65;

    if (!text) return NextResponse.json({ error: "Narration text is required" }, { status: 400 });

    const safetyIdentifier = createHash("sha256").update(`replay-speech:${text.slice(0, 160)}`).digest("hex");
    const upstream = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getOpenAIKey()}`,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": safetyIdentifier,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: "ash",
        input: text,
        instructions: `${ASH_PERFORMANCE_DIRECTION}\n\n# Direction for this moment\n${momentDirection(kind, intensity)}`,
        response_format: "pcm",
      }),
      cache: "no-store",
    });

    if (!upstream.ok || !upstream.body) {
      const data = (await upstream.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(data.error?.message ?? `Speech request returned ${upstream.status}`);
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "audio/pcm;rate=24000;encoding=signed-integer;bits=16;channels=1",
        "Cache-Control": "no-store, max-age=0",
        "X-Replay-Voice": "ash",
        "X-Replay-Model": "gpt-4o-mini-tts",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to stream Ash narration" },
      { status: 500 },
    );
  }
}
