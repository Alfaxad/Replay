import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../..");
const STATE_PATH = path.join(REPO_ROOT, ".solana/txline-devnet.json");
const API_ORIGIN = "https://txline-dev.txodds.com";

function readState() {
  if (!fs.existsSync(STATE_PATH)) {
    throw new Error("Missing .solana/txline-devnet.json; run pnpm txline:provision first");
  }
  return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
}

function writeState(state) {
  fs.writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  fs.chmodSync(STATE_PATH, 0o600);
}

async function newGuestJwt() {
  const response = await fetch(`${API_ORIGIN}/auth/guest/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (!response.ok) throw new Error(`Guest JWT request returned HTTP ${response.status}`);
  const data = await response.json();
  if (typeof data.token !== "string") throw new Error("Guest JWT response was invalid");
  return data.token;
}

async function main() {
  let state = readState();
  if (typeof state.apiToken !== "string" || state.apiToken.length === 0) {
    throw new Error("TxLINE API token is missing from local state");
  }

  state = { ...state, jwt: await newGuestJwt(), jwtRefreshedAt: new Date().toISOString() };
  writeState(state);

  async function apiFetch(pathname, options = {}, allowRefresh = true) {
    const response = await fetch(`${API_ORIGIN}/api${pathname}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${state.jwt}`,
        "X-Api-Token": state.apiToken,
        ...(options.headers ?? {}),
      },
    });

    if (response.status === 401 && allowRefresh) {
      state = { ...state, jwt: await newGuestJwt(), jwtRefreshedAt: new Date().toISOString() };
      writeState(state);
      return apiFetch(pathname, options, false);
    }
    return response;
  }

  async function getJson(pathname) {
    const response = await apiFetch(pathname);
    if (!response.ok) throw new Error(`${pathname} returned HTTP ${response.status}`);
    const responseText = await response.text();
    try {
      return JSON.parse(responseText);
    } catch {
      const sseRecords = responseText
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .filter(Boolean)
        .map((payload) => JSON.parse(payload));
      if (sseRecords.length > 0) return sseRecords;
      throw new Error(`${pathname} returned neither JSON nor SSE data records`);
    }
  }

  const fixtures = await getJson("/fixtures/snapshot");
  const fixtureList = Array.isArray(fixtures) ? fixtures : fixtures.data ?? [];
  console.log(`Fixtures snapshot authenticated: ${fixtureList.length} records`);

  const fixtureSummaries = fixtureList.map((fixture) => ({
    fixtureId: Number(fixture.FixtureId ?? fixture.fixtureId),
    participant1: fixture.Participant1 ?? fixture.participant1 ?? null,
    participant2: fixture.Participant2 ?? fixture.participant2 ?? null,
    startTime: fixture.StartTime ?? fixture.startTime ?? null,
  }));
  console.log(`Devnet fixtures: ${JSON.stringify(fixtureSummaries)}`);

  const snapshotFixtureIds = fixtureSummaries
    .map((fixture) => fixture.fixtureId)
    .filter((fixtureId) => Number.isSafeInteger(fixtureId) && fixtureId > 0);
  const documentedRecentFixtureIds = [18241006, 18237038, 18222446, 18213979, 18218149, 18209181];
  const candidateFixtureIds = [...new Set([...snapshotFixtureIds, ...documentedRecentFixtureIds])];

  async function findData(label, pathForFixture) {
    let lastError;
    for (const fixtureId of candidateFixtureIds) {
      try {
        const data = await getJson(pathForFixture(fixtureId));
        const records = Array.isArray(data) ? data : data.data ?? [];
        if (records.length > 0) {
          console.log(`${label} authenticated: fixture=${fixtureId}, records=${records.length}`);
          return { fixtureId, count: records.length };
        }
      } catch (error) {
        lastError = error;
      }
    }
    throw new Error(`${label} returned no records${lastError ? `; last error: ${lastError.message}` : ""}`);
  }

  const odds = await findData("Odds snapshot", (fixtureId) => `/odds/snapshot/${fixtureId}`);
  const scores = await findData("Scores snapshot", (fixtureId) => `/scores/snapshot/${fixtureId}`);
  const historical = await findData(
    "Historical score replay",
    (fixtureId) => `/scores/historical/${fixtureId}`,
  );

  async function verifyStream(label, pathname) {
    const controller = new AbortController();
    const response = await apiFetch(pathname, {
      signal: controller.signal,
      headers: {
        Accept: "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });

    if (!response.ok) {
      controller.abort();
      throw new Error(`${label} returned HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/event-stream")) {
      controller.abort();
      throw new Error(`${label} returned unexpected content type ${contentType}`);
    }

    const reader = response.body?.getReader();
    let observedBytes = 0;
    if (reader) {
      const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 8000));
      const firstRead = reader.read().catch(() => null);
      const result = await Promise.race([firstRead, timeout]);
      if (result && !result.done && result.value) observedBytes = result.value.byteLength;
      controller.abort();
      await reader.cancel().catch(() => {});
    }

    console.log(`${label} authenticated: HTTP 200 SSE, initialBytes=${observedBytes}`);
    return { contentType, observedBytes };
  }

  const [oddsStream, scoresStream] = await Promise.all([
    verifyStream("Odds stream", "/odds/stream"),
    verifyStream("Scores stream", "/scores/stream"),
  ]);

  const verification = {
    verifiedAt: new Date().toISOString(),
    fixturesCount: fixtureList.length,
    odds,
    scores,
    historical,
    oddsStream,
    scoresStream,
  };
  state = { ...state, verification };
  writeState(state);
  console.log("TxLINE devnet verification completed successfully");
}

main().catch((error) => {
  console.error(`TxLINE verification failed: ${error.message}`);
  process.exitCode = 1;
});
