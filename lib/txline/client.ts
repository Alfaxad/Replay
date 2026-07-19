import "server-only";

import fs from "node:fs";
import path from "node:path";

const DEFAULT_ORIGIN = "https://txline-dev.txodds.com";
const LOCAL_STATE_PATH = path.resolve(process.cwd(), ".solana/txline-devnet.json");

type LocalState = {
  apiToken?: string;
  jwt?: string;
};

let cachedJwt: string | undefined;

function localState(): LocalState {
  if (!fs.existsSync(LOCAL_STATE_PATH)) return {};
  return JSON.parse(fs.readFileSync(LOCAL_STATE_PATH, "utf8")) as LocalState;
}

function credentials() {
  const state = localState();
  const apiToken = process.env.TXLINE_API_TOKEN ?? state.apiToken;
  const jwt = process.env.TXLINE_GUEST_JWT ?? cachedJwt ?? state.jwt;
  if (!apiToken) throw new Error("Missing TxLINE API token");
  return { apiToken, jwt };
}

async function newGuestJwt(): Promise<string> {
  const origin = process.env.TXLINE_API_ORIGIN ?? DEFAULT_ORIGIN;
  const response = await fetch(`${origin}/auth/guest/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`TxLINE guest session returned ${response.status}`);
  const data = (await response.json()) as { token?: string };
  if (!data.token) throw new Error("TxLINE guest session did not return a token");
  cachedJwt = data.token;
  return data.token;
}

async function txlineFetch(
  pathname: string,
  retry = true,
  signal?: AbortSignal,
): Promise<Response> {
  const origin = process.env.TXLINE_API_ORIGIN ?? DEFAULT_ORIGIN;
  const current = credentials();
  const jwt = current.jwt ?? (await newGuestJwt());
  const response = await fetch(`${origin}/api${pathname}`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      "X-Api-Token": current.apiToken,
      Accept: "application/json, text/event-stream",
    },
    cache: "no-store",
    signal,
  });

  if (response.status === 401 && retry) {
    await newGuestJwt();
    return txlineFetch(pathname, false, signal);
  }
  return response;
}

function parseSseOrJson(text: string): unknown[] {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object" && "data" in parsed) {
      const data = (parsed as { data?: unknown }).data;
      return Array.isArray(data) ? data : [];
    }
    return parsed ? [parsed] : [];
  } catch {
    return text
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as unknown);
  }
}

export async function getTxlineRecords(pathname: string): Promise<Record<string, unknown>[]> {
  const response = await txlineFetch(pathname);
  if (!response.ok) throw new Error(`TxLINE ${pathname} returned ${response.status}`);
  return parseSseOrJson(await response.text()).filter(
    (value): value is Record<string, unknown> => Boolean(value && typeof value === "object"),
  );
}

export function txlineOrigin(): string {
  return process.env.TXLINE_API_ORIGIN ?? DEFAULT_ORIGIN;
}

export type TxlineStreamKind = "scores" | "odds";

export async function openTxlineStream(
  kind: TxlineStreamKind,
  signal: AbortSignal,
): Promise<Response> {
  const response = await txlineFetch(`/${kind}/stream`, true, signal);
  if (!response.ok) throw new Error(`TxLINE ${kind} stream returned ${response.status}`);
  if (!response.body) throw new Error(`TxLINE ${kind} stream returned no body`);
  return response;
}
