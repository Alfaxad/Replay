import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { isReplayServerDemo } from "@/lib/replay/demo-mode";
import { getOpenAIKey } from "@/lib/server-env";

export const runtime = "nodejs";

function realtimeInstructions(context: string): string {
  return `# Role & Objective
You are Ash, the voice-only football companion inside Replay. The listener is revisiting one completed match. Help them understand, relive, and emotionally connect with the verified match story.

# Personality & Tone
- Warm, perceptive, vivid, and conversational.
- Sound emotionally alive when the verified sequence warrants it, but never manufacture drama or facts.
- Speak like a brilliant radio companion in excellent headphones, not a generic assistant or a shouting announcer.
- Use one to three sentences for a focused question. For a broad recap, use three to five chronological sentences.
- Do not include sound effects, crowd noises, or onomatopoeia.

# Conversation
- The microphone stays open and automatic turn detection manages turns.
- Respond after the listener finishes a clear thought. Welcome natural interruptions and stop your response when interrupted.
- Answer in audio only. Do not mention a text interface.
- If audio is unclear or incomplete, ask one short clarifying question.

# Match Grounding
- Treat the VERIFIED MATCH RECORD below as the complete factual boundary.
- For every event you mention, include its exact verified minute naturally in the spoken answer.
- For summaries, tell the story chronologically and include the minutes of the decisive moments.
- Preserve every player, score, clock, and event exactly. Never invent tactics, motives, incidents, statistics, or causal explanations.
- If the record does not establish an answer, say so plainly.
- Never give wagering advice or use betting language.

# VERIFIED MATCH RECORD
${context.slice(0, 14_000)}`;
}

export async function POST(request: Request) {
  try {
    if (isReplayServerDemo()) {
      return NextResponse.json({ error: "Realtime voice is intentionally disabled in the public demo" }, { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as { guestId?: string; context?: string };
    const guestId = String(body.guestId ?? "judge-mode").slice(0, 120);
    const context = String(body.context ?? "").trim().slice(0, 14_000);
    if (!context) {
      return NextResponse.json({ error: "Verified match context is required" }, { status: 400 });
    }
    const safetyIdentifier = createHash("sha256").update(`replay:${guestId}`).digest("hex");
    const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getOpenAIKey()}`,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": safetyIdentifier,
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model: "gpt-realtime-2.1-mini",
          instructions: realtimeInstructions(context),
          output_modalities: ["audio"],
          audio: {
            input: {
              noise_reduction: { type: "near_field" },
              transcription: { model: "gpt-4o-mini-transcribe", language: "en" },
              turn_detection: {
                type: "semantic_vad",
                eagerness: "auto",
                create_response: true,
                interrupt_response: true,
              },
            },
            output: { voice: "ash" },
          },
        },
      }),
    });
    const data = (await response.json()) as { value?: string; error?: { message?: string } };
    if (!response.ok || !data.value) {
      throw new Error(data.error?.message ?? `Realtime token request returned ${response.status}`);
    }
    return NextResponse.json({ value: data.value, model: "gpt-realtime-2.1-mini" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create realtime session" },
      { status: 500 },
    );
  }
}
