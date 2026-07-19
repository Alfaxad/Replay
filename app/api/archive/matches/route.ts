import { NextResponse } from "next/server";

import { getArchiveCatalog } from "@/lib/replay/archive";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getArchiveCatalog());
}
