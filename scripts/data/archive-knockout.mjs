import fs from "node:fs/promises";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "../..");
const outputRoot = path.join(projectRoot, "data", "knockout");
const replayRoot = path.join(outputRoot, "replays");
const txlineStatePath = path.join(projectRoot, ".solana", "txline-devnet.json");
const txlineOrigin = process.env.TXLINE_API_ORIGIN ?? "https://txline-dev.txodds.com";

// TxLINE currently publishes coverage for two late group games and every knockout game.
// Earlier group-stage matches use FIFA's official event record as a labelled fallback.
const txlineByMatchNumber = new Map([
  [69, 17588326],
  [70, 17588325],
  [73, 18167317],
  [74, 18175983],
  [75, 18172260],
  [76, 18172489],
  [77, 18175981],
  [78, 18175397],
  [79, 18179759],
  [80, 18179764],
  [81, 18172379],
  [82, 18179550],
  [83, 18179763],
  [84, 18179551],
  [85, 18179552],
  [86, 18175918],
  [87, 18179549],
  [88, 18176123],
  [89, 18188721],
  [90, 18185036],
  [91, 18187298],
  [92, 18192996],
  [93, 18198205],
  [94, 18193785],
  [95, 18202701],
  [96, 18202783],
  [97, 18209181],
  [98, 18218149],
  [99, 18213979],
  [100, 18222446],
  [101, 18237038],
  [102, 18241006],
  [103, 18257865],
  [104, 18257739],
]);

const calendarUrl = new URL("https://api.fifa.com/api/v3/calendar/matches");
calendarUrl.search = new URLSearchParams({
  from: "2026-06-11T00:00:00Z",
  to: "2026-07-20T23:59:59Z",
  language: "en",
  count: "200",
  idSeason: "285023",
}).toString();

function localized(value, fallback = "") {
  return Array.isArray(value)
    ? value.find((entry) => entry?.Locale?.toLowerCase().startsWith("en"))?.Description
      ?? value[0]?.Description
      ?? fallback
    : fallback;
}

function minuteNumber(value) {
  const parts = String(value ?? "0").match(/(\d+)'(?:\+(\d+)')?/);
  return parts ? Number(parts[1]) + Number(parts[2] ?? 0) : 0;
}

function baseMinute(value) {
  return Number(String(value ?? "0").match(/(\d+)'/)?.[1] ?? 0);
}

async function json(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`${url} returned ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 300));
    }
  }
  throw lastError;
}

async function mapWithConcurrency(values, concurrency, worker) {
  const results = new Array(values.length);
  let cursor = 0;
  async function run() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, run));
  return results;
}

function playerMap(team) {
  return new Map((team?.Players ?? []).map((player) => [
    String(player.IdPlayer),
    localized(player.ShortName ?? player.PlayerName, `Player ${player.IdPlayer}`),
  ]));
}

function officialMoments(live) {
  if (!live) return [];
  const moments = [];
  for (const [side, team] of [[1, live.HomeTeam], [2, live.AwayTeam]]) {
    const players = playerMap(team);
    for (const goal of team?.Goals ?? []) {
      moments.push({
        kind: "goal",
        minute: minuteNumber(goal.Minute),
        clock: goal.Minute,
        side,
        player: players.get(String(goal.IdPlayer)) ?? `Player ${goal.IdPlayer}`,
        assist: goal.IdAssistPlayer ? players.get(String(goal.IdAssistPlayer)) ?? null : null,
      });
    }
    for (const booking of team?.Bookings ?? []) {
      moments.push({
        kind: Number(booking.Card) === 1 ? "yellow_card" : "red_card",
        minute: minuteNumber(booking.Minute),
        clock: booking.Minute,
        side,
        player: players.get(String(booking.IdPlayer)) ?? `Player ${booking.IdPlayer}`,
      });
    }
    for (const substitution of team?.Substitutions ?? []) {
      moments.push({
        kind: "substitution",
        minute: minuteNumber(substitution.Minute),
        clock: substitution.Minute,
        side,
        player: localized(substitution.PlayerOnName, `Player ${substitution.IdPlayerOn}`),
        playerOff: localized(substitution.PlayerOffName, `Player ${substitution.IdPlayerOff}`),
      });
    }
  }
  return moments.sort((a, b) => a.minute - b.minute || (a.kind === "goal" ? -1 : 1));
}

function canonicalFallback(match, moments, fixtureId) {
  let seq = 0;
  const score = [0, 0];
  const startedAt = Date.parse(match.Date);
  const events = [{
    fixtureId,
    seq: seq++,
    timestamp: startedAt,
    action: "kickoff",
    gameState: "inplay",
    clockSeconds: 0,
    clockRunning: true,
    confirmed: true,
    score: [...score],
    corners: [0, 0],
  }];
  let halftimeAdded = false;
  for (const moment of moments) {
    if (baseMinute(moment.clock) > 45 && !halftimeAdded) {
      events.push({
        fixtureId, seq: seq++, timestamp: startedAt + 45 * 60_000,
        action: "halftime_finalised", gameState: "halftime", clockSeconds: 45 * 60,
        clockRunning: false, confirmed: true, score: [...score], corners: [0, 0],
      });
      halftimeAdded = true;
    }
    if (moment.kind === "goal") score[moment.side - 1] += 1;
    events.push({
      fixtureId, seq: seq++, timestamp: startedAt + moment.minute * 60_000,
      action: moment.kind, gameState: "inplay", clockSeconds: moment.minute * 60,
      clockRunning: true, confirmed: true, participant: moment.side,
      score: [...score], corners: [0, 0],
    });
  }
  if (!halftimeAdded) {
    events.push({
      fixtureId, seq: seq++, timestamp: startedAt + 45 * 60_000,
      action: "halftime_finalised", gameState: "halftime", clockSeconds: 45 * 60,
      clockRunning: false, confirmed: true, score: [...score], corners: [0, 0],
    });
  }
  const finalScore = [Number(match.HomeTeamScore ?? score[0]), Number(match.AwayTeamScore ?? score[1])];
  events.push({
    fixtureId, seq, timestamp: startedAt + 120 * 60_000, action: "game_finalised",
    gameState: "final", clockSeconds: 90 * 60, clockRunning: false,
    confirmed: true, score: finalScore, corners: [0, 0],
  });
  return events;
}

function parseRecords(text) {
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.data)) return parsed.data;
    return parsed ? [parsed] : [];
  } catch {
    return text
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }
}

function numberValue(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeTxlineEvent(raw) {
  const stats = raw.Stats ?? raw.stats ?? {};
  const clock = raw.Clock ?? raw.clock ?? {};
  const participant = numberValue(raw.Participant ?? raw.participant, -1);
  const confirmed = raw.Confirmed ?? raw.confirmed;
  return {
    fixtureId: numberValue(raw.FixtureId ?? raw.fixtureId),
    seq: numberValue(raw.Seq ?? raw.seq),
    timestamp: numberValue(raw.Ts ?? raw.ts ?? Date.now()),
    action: String(raw.Action ?? raw.action ?? "update").toLowerCase(),
    gameState: String(raw.GameState ?? raw.gameState ?? "unknown"),
    clockSeconds: numberValue(clock.Seconds ?? clock.seconds),
    clockRunning: Boolean(clock.Running ?? clock.running),
    confirmed: confirmed === undefined ? true : Boolean(confirmed),
    ...(participant === 1 || participant === 2 ? { participant } : {}),
    score: [numberValue(stats["1"]), numberValue(stats["2"])],
    corners: [numberValue(stats["7"]), numberValue(stats["8"])],
  };
}

async function createTxlineClient() {
  let state;
  try {
    state = JSON.parse(await fs.readFile(txlineStatePath, "utf8"));
  } catch {
    return null;
  }
  if (typeof state.apiToken !== "string" || !state.apiToken) return null;
  let jwt = typeof state.jwt === "string" ? state.jwt : null;

  async function refreshJwt() {
    const response = await fetch(`${txlineOrigin}/auth/guest/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (!response.ok) throw new Error(`TxLINE guest session returned ${response.status}`);
    const data = await response.json();
    if (typeof data.token !== "string") throw new Error("TxLINE guest session returned no token");
    jwt = data.token;
  }

  return async function getHistorical(fixtureId, retry = true) {
    if (!jwt) await refreshJwt();
    const response = await fetch(`${txlineOrigin}/api/scores/historical/${fixtureId}`, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        "X-Api-Token": state.apiToken,
        Accept: "application/json, text/event-stream",
      },
    });
    if (response.status === 401 && retry) {
      await refreshJwt();
      return getHistorical(fixtureId, false);
    }
    if (!response.ok) return null;
    const records = parseRecords(await response.text());
    const events = records
      .filter((record) => record && typeof record === "object")
      .map(normalizeTxlineEvent)
      .filter((event) => Number.isSafeInteger(event.seq))
      .sort((a, b) => a.seq - b.seq);
    return events.length ? events : null;
  };
}

async function existingTxlineReplay(fixtureId) {
  try {
    const replay = JSON.parse(await fs.readFile(path.join(replayRoot, `${fixtureId}.json`), "utf8"));
    return replay.source === "txline-historical" && Array.isArray(replay.events) && replay.events.length
      ? replay.events
      : null;
  } catch {
    return null;
  }
}

await fs.mkdir(replayRoot, { recursive: true });
const calendar = await json(calendarUrl);
const matches = calendar.Results
  .filter((match) => match.IdCompetition === "17" && txlineByMatchNumber.has(match.MatchNumber))
  .sort((a, b) => a.MatchNumber - b.MatchNumber);
if (matches.length !== 34) throw new Error(`Expected 34 TxLINE-covered World Cup matches, received ${matches.length}`);

const completedMatches = matches.filter((match) => Number(match.MatchStatus) === 0 && match.HomeTeamScore != null);
console.log(`FIFA calendar: ${matches.length} fixtures · ${completedMatches.length} complete`);
const liveRecords = await mapWithConcurrency(completedMatches, 6, async (match) => {
  const liveUrl = `https://api.fifa.com/api/v3/live/football/17/285023/${match.IdStage}/${match.IdMatch}?language=en`;
  const live = await json(liveUrl);
  return [match.MatchNumber, live];
});
const liveByMatchNumber = new Map(liveRecords);
console.log(`FIFA official events: ${liveByMatchNumber.size} completed matches`);

const getTxlineHistorical = await createTxlineClient();
let txlineCount = 0;
let fifaCount = 0;
const catalog = [];
for (const match of matches) {
  const txlineFixtureId = txlineByMatchNumber.get(match.MatchNumber);
  const fixtureId = txlineFixtureId ?? Number(match.IdMatch);
  const completed = Number(match.MatchStatus) === 0 && match.HomeTeamScore != null;
  const moments = officialMoments(liveByMatchNumber.get(match.MatchNumber));
  let txlineEvents = completed && txlineFixtureId ? await existingTxlineReplay(txlineFixtureId) : null;
  if (completed && txlineFixtureId && !txlineEvents && getTxlineHistorical) {
    try {
      txlineEvents = await getTxlineHistorical(txlineFixtureId);
    } catch {
      txlineEvents = null;
    }
  }
  const events = txlineEvents ?? (completed ? canonicalFallback(match, moments, fixtureId) : []);
  const eventSource = txlineEvents
    ? "txline-historical"
    : completed
      ? "fifa-official-events"
      : "txline-live-ready";
  if (events.length) {
    await fs.writeFile(
      path.join(replayRoot, `${fixtureId}.json`),
      `${JSON.stringify({ fixtureId, source: eventSource, events }, null, 2)}\n`,
    );
  }
  if (eventSource === "txline-historical") txlineCount += 1;
  if (eventSource === "fifa-official-events") fifaCount += 1;
  const homeName = match.Home?.ShortClubName ?? localized(match.Home?.TeamName, "Home");
  const awayName = match.Away?.ShortClubName ?? localized(match.Away?.TeamName, "Away");
  catalog.push({
    matchNumber: match.MatchNumber,
    fixtureId,
    fifaMatchId: match.IdMatch,
    fifaStageId: match.IdStage,
    stage: match.MatchNumber <= 72 ? "Group stage" : localized(match.StageName, "Knockout"),
    group: match.MatchNumber <= 72 ? localized(match.GroupName, null) : null,
    date: match.Date,
    status: completed ? "complete" : "upcoming",
    home: { name: homeName, code: match.Home?.Abbreviation ?? "HOM" },
    away: { name: awayName, code: match.Away?.Abbreviation ?? "AWY" },
    score: completed ? [Number(match.HomeTeamScore), Number(match.AwayTeamScore)] : null,
    penalties: match.HomeTeamPenaltyScore != null
      ? [Number(match.HomeTeamPenaltyScore), Number(match.AwayTeamPenaltyScore)]
      : null,
    stadium: localized(match.Stadium?.Name, "Venue TBC"),
    attendance: match.Attendance ? Number(match.Attendance) : null,
    eventSource,
    eventCount: events.length,
    officialMoments: moments,
  });
  console.log(`Match ${String(match.MatchNumber).padStart(3, "0")}: ${homeName} v ${awayName} · ${events.length} records · ${eventSource}`);
}

await fs.writeFile(path.join(outputRoot, "catalog.json"), `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  scope: "FIFA World Cup 2026 · TxLINE published fixture coverage",
  sources: [
    { id: "txline", label: "TxLINE historical scores", url: "https://txline.txodds.com/documentation/scores/overview" },
    { id: "fifa", label: "FIFA official match calendar and live records", url: "https://api.fifa.com/api/v3" },
  ],
  matches: catalog,
}, null, 2)}\n`);

const expectedReplayFiles = new Set(catalog.filter((match) => match.eventCount > 0).map((match) => `${match.fixtureId}.json`));
const replayFiles = (await fs.readdir(replayRoot)).filter((file) => file.endsWith(".json"));
let removed = 0;
for (const file of replayFiles) {
  if (expectedReplayFiles.has(file)) continue;
  await fs.unlink(path.join(replayRoot, file));
  removed += 1;
}

console.log(`Archived ${catalog.length} TxLINE-covered World Cup fixtures: ${txlineCount} TxLINE histories · ${fifaCount} FIFA official replays · ${catalog.length - completedMatches.length} upcoming · ${removed} out-of-coverage replay files removed`);
