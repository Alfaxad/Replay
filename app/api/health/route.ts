import { NextResponse } from "next/server";

import { isReplayServerDemo } from "@/lib/replay/demo-mode";
import { getOpenAIKey } from "@/lib/server-env";
import { txlineOrigin } from "@/lib/txline/client";
import { txlineLiveStatus } from "@/lib/txline/live-hub";

export const runtime = "nodejs";

export async function GET() {
  const demo = isReplayServerDemo();
  let openai = "missing";
  if (demo) {
    openai = "disabled";
  } else {
    try {
      openai = getOpenAIKey() ? "configured" : "missing";
    } catch {
      openai = "missing";
    }
  }
  return NextResponse.json({
    ok: true,
    service: "replay",
    mode: demo ? "public-offline-demo" : "full",
    openai,
    txlineOrigin: txlineOrigin(),
    liveChannels: txlineLiveStatus(),
    timestamp: new Date().toISOString(),
  });
}
