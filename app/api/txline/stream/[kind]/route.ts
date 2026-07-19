import { NextResponse } from "next/server";

import { subscribeTxlineStream } from "@/lib/txline/live-hub";
import type { TxlineStreamKind } from "@/lib/txline/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ kind: string }> },
) {
  const { kind } = await params;
  if (kind !== "scores" && kind !== "odds") {
    return NextResponse.json({ error: "Stream kind must be scores or odds" }, { status: 400 });
  }

  return new Response(subscribeTxlineStream(kind as TxlineStreamKind), {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
