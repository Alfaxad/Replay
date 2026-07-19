import OpenAI from "openai";
import { NextResponse } from "next/server";

import { isReplayServerDemo } from "@/lib/replay/demo-mode";
import { getOpenAIKey } from "@/lib/server-env";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(request: Request) {
  try {
    if (isReplayServerDemo()) {
      return NextResponse.json({ error: "Image generation is disabled in the public demo" }, { status: 403 });
    }
    const body = (await request.json()) as { archetype?: string; winner?: string; definingDecision?: string };
    const openai = new OpenAI({ apiKey: getOpenAIKey() });
    const result = await openai.images.generate({
      model: "gpt-image-2",
      size: "1024x1536",
      quality: "medium",
      output_format: "webp",
      prompt: `Create an original portrait screen-printed editorial football duel poster at night. A faceless adult supporter faces a precise amber dot-matrix analytical rival. The visual outcome should favor ${body.winner ?? "the winner"}. Express the archetype ${body.archetype ?? "The Measured Challenger"} through posture and abstract geometric marks. Represent this defining decision symbolically: ${body.definingDecision ?? "holding conviction under pressure"}. Near-black, warm ivory, muted terracotta, restrained amber, tactile paper grain, strong negative space. No text, letters, numbers, logos, flags, crests, official branding, trophy likeness, watermark, money, chips, casino imagery, or betting slips.`,
    });
    const image = result.data?.[0]?.b64_json;
    if (!image) throw new Error("Poster generation returned no image");
    return NextResponse.json({ image: `data:image/webp;base64,${image}`, model: "gpt-image-2" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to generate poster" },
      { status: 500 },
    );
  }
}
