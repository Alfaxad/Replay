import { NextResponse } from "next/server";

import { subscribeTxlineStream } from "@/lib/txline/live-hub";
import type { TxlineStreamKind } from "@/lib/txline/client";
import { isReplayServerDemo } from "@/lib/replay/demo-mode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ kind: string }> },
) {
  if (isReplayServerDemo()) {
    return NextResponse.json({ error: "Live TxLINE streams are disabled in the public demo" }, { status: 403 });
  }

  const { kind } = await params;
  if (kind !== "scores" && kind !== "odds") {
    return NextResponse.json({ error: "Stream kind must be scores or odds" }, { status: 400 });
  }

  try {
    return new Response(subscribeTxlineStream(kind as TxlineStreamKind), {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch {
    return NextResponse.json({ error: "TxLINE stream capacity reached" }, { status: 503 });
  }
}
