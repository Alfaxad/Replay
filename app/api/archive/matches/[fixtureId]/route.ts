import { NextResponse } from "next/server";

import { getRadioReplay } from "@/lib/replay/archive";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ fixtureId: string }> },
) {
  const { fixtureId: value } = await params;
  if (!/^\d{6,12}$/.test(value)) return NextResponse.json({ error: "Invalid fixture id" }, { status: 400 });
  const replay = getRadioReplay(Number(value));
  if (!replay) return NextResponse.json({ error: "Match not found" }, { status: 404 });
  return NextResponse.json(replay);
}
