import { NextResponse } from "next/server";

import { FALLBACK_FIXTURES, FEATURED_REPLAY } from "@/lib/game/demo";
import { getTxlineRecords, txlineOrigin } from "@/lib/txline/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Fixture = {
  fixtureId: number;
  participant1: string;
  participant2: string;
  startTime: number;
};

function textValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function fixtureFromRaw(raw: Record<string, unknown>): Fixture | undefined {
  const fixtureId = Number(raw.FixtureId ?? raw.fixtureId);
  if (!Number.isSafeInteger(fixtureId) || fixtureId <= 0) return undefined;
  return {
    fixtureId,
    participant1: textValue(raw.Participant1 ?? raw.participant1, `Home ${raw.Participant1Id ?? ""}`.trim()),
    participant2: textValue(raw.Participant2 ?? raw.participant2, `Away ${raw.Participant2Id ?? ""}`.trim()),
    startTime: Number(raw.StartTime ?? raw.startTime ?? 0),
  };
}

export async function GET(request: Request) {
  try {
    const requestedDay = new URL(request.url).searchParams.get("startEpochDay");
    const startEpochDay = requestedDay && /^\d{5}$/.test(requestedDay) ? Number(requestedDay) : undefined;
    const pathname = startEpochDay
      ? `/fixtures/snapshot?startEpochDay=${startEpochDay}`
      : "/fixtures/snapshot";
    const raw = await getTxlineRecords(pathname);
    const fixtures = raw.map(fixtureFromRaw).filter((value): value is Fixture => Boolean(value));
    return NextResponse.json({
      source: "txline-devnet",
      origin: txlineOrigin(),
      liveReady: true,
      fixtures,
      featuredReplay: FEATURED_REPLAY,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({
      source: "documented-fallback",
      liveReady: false,
      fixtures: FALLBACK_FIXTURES,
      featuredReplay: FEATURED_REPLAY,
      warning: error instanceof Error ? error.message : "TxLINE unavailable",
      updatedAt: new Date().toISOString(),
    });
  }
}
