import { NextResponse } from "next/server";

import { normalizeTxlineEvent } from "@/lib/game/engine";
import { getTxlineRecords } from "@/lib/txline/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ fixtureId: string }> },
) {
  const { fixtureId: fixtureValue } = await params;
  if (!/^\d{6,12}$/.test(fixtureValue)) {
    return NextResponse.json({ error: "Invalid fixture id" }, { status: 400 });
  }

  try {
    const raw = await getTxlineRecords(`/scores/historical/${fixtureValue}`);
    const events = raw
      .map(normalizeTxlineEvent)
      .filter((event) => Number.isSafeInteger(event.seq))
      .sort((a, b) => a.seq - b.seq);
    if (!events.length) {
      return NextResponse.json({ error: "Replay contains no events" }, { status: 404 });
    }
    const firstRaw = raw[0] ?? {};
    return NextResponse.json({
      source: "txline-historical",
      fixtureId: Number(fixtureValue),
      participant1Id: Number(firstRaw.Participant1Id ?? firstRaw.participant1Id ?? 0),
      participant2Id: Number(firstRaw.Participant2Id ?? firstRaw.participant2Id ?? 0),
      participant1IsHome: Boolean(firstRaw.Participant1IsHome ?? true),
      eventCount: events.length,
      events,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load TxLINE replay" },
      { status: 502 },
    );
  }
}
