import { NextResponse } from "next/server";

import { generatePressureProfile } from "@/lib/ai/rival-agent";
import { isReplayServerDemo } from "@/lib/replay/demo-mode";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (isReplayServerDemo()) {
      return NextResponse.json({ error: "AI profile generation is disabled in the public demo" }, { status: 403 });
    }
    const evidence = await request.json();
    return NextResponse.json(await generatePressureProfile(evidence));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to generate Pressure Profile" },
      { status: 500 },
    );
  }
}
