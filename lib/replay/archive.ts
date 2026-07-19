import fs from "node:fs";
import path from "node:path";

import type { CanonicalEvent, Side } from "@/lib/game/types";

export type OfficialMoment = {
  kind: string;
  minute: number;
  clock: string;
  side: Side;
  player?: string;
  assist?: string | null;
  playerOff?: string;
};

export type ArchiveMatch = {
  matchNumber: number;
  fixtureId: number;
  fifaMatchId: string;
  fifaStageId: string;
  stage: string;
  group: string | null;
  date: string;
  status: "complete" | "upcoming";
  home: { name: string; code: string };
  away: { name: string; code: string };
  score: [number, number] | null;
  penalties: [number, number] | null;
  stadium: string;
  attendance: number | null;
  eventSource: "txline-historical" | "txline-snapshot" | "fifa-official-events" | "txline-live-ready";
  eventCount: number;
  officialMoments: OfficialMoment[];
};

export type RadioMoment = {
  id: string;
  seq: number;
  kind: string;
  clockSeconds: number;
  clockLabel: string;
  side?: Side;
  score: [number, number];
  corners: [number, number];
  title: string;
  fact: string;
  importance: number;
  source: "txline-historical" | "txline-snapshot" | "fifa-official-events";
};

type Catalog = {
  generatedAt: string;
  scope: string;
  sources: { id: string; label: string; url: string }[];
  matches: ArchiveMatch[];
};

const dataRoot = path.resolve(process.cwd(), "data", "knockout");

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

export function getArchiveCatalog(): Catalog {
  return readJson<Catalog>(path.join(dataRoot, "catalog.json"));
}

export function getArchiveMatch(fixtureId: number): ArchiveMatch | undefined {
  return getArchiveCatalog().matches.find((match) => match.fixtureId === fixtureId);
}

function clockLabel(seconds: number, action: string): string {
  if (action === "game_finalised") return "FT";
  if (action === "halftime_finalised") return "HT";
  if (seconds <= 0) return "00'";
  return `${Math.max(1, Math.floor(seconds / 60))}'`;
}

function teamName(match: ArchiveMatch, side?: Side): string {
  return side === 1 ? match.home.name : side === 2 ? match.away.name : "the match";
}

function matchStage(match: ArchiveMatch): string {
  return match.group ? `${match.group} of the World Cup group stage` : `the ${match.stage.toLowerCase()}`;
}

function scorerAt(match: ArchiveMatch, event: CanonicalEvent): OfficialMoment | undefined {
  const minute = Math.floor(event.clockSeconds / 60);
  return match.officialMoments.find(
    (moment) => moment.kind === "goal" && moment.side === event.participant && Math.abs(moment.minute - minute) <= 2,
  );
}

function eventCopy(event: CanonicalEvent, match: ArchiveMatch, source: RadioMoment["source"]): RadioMoment | undefined {
  const side = event.participant;
  const label = clockLabel(event.clockSeconds, event.action);
  const team = teamName(match, side);
  const scorer = event.action === "goal" ? scorerAt(match, event) : undefined;
  if (event.action === "kickoff") {
    return {
      id: `kickoff-${event.seq}`, seq: event.seq, kind: "kickoff", clockSeconds: 0,
      clockLabel: "00'", side, score: event.score, corners: event.corners,
      title: "The replay is under way",
      fact: `${match.home.name} meet ${match.away.name} in ${matchStage(match)} at ${match.stadium}.`,
      importance: 72, source,
    };
  }
  if (event.action === "goal") {
    const player = scorer?.player ? `${scorer.player} scores for ${team}` : `${team} score`;
    return {
      id: `goal-${event.seq}`, seq: event.seq, kind: "goal", clockSeconds: event.clockSeconds,
      clockLabel: scorer?.clock ?? label, side, score: event.score, corners: event.corners,
      title: `GOAL · ${team}`,
      fact: `${player}. The verified score moves to ${event.score[0]}–${event.score[1]}.`,
      importance: 100, source,
    };
  }
  if (event.action === "extra_time_start") {
    return {
      id: `extra-time-${event.seq}`, seq: event.seq, kind: "extra_time", clockSeconds: event.clockSeconds,
      clockLabel: "ET", score: event.score, corners: event.corners,
      title: "Extra time",
      fact: `${match.home.name} and ${match.away.name} are locked at ${event.score[0]}–${event.score[1]} after ninety minutes. The World Cup final continues.`,
      importance: 90, source,
    };
  }
  if (event.action === "var_review" || event.action === "var_overturned") {
    const reviewMinute = `${Math.floor(event.clockSeconds / 60) + 1}'`;
    const overturned = event.action === "var_overturned";
    return {
      id: `${event.action}-${event.seq}`, seq: event.seq, kind: "var", clockSeconds: event.clockSeconds,
      clockLabel: reviewMinute, side, score: event.score, corners: event.corners,
      title: overturned ? "VAR overturn" : `VAR review · ${team}`,
      fact: overturned
        ? `The VAR review overturns the possible goal. ${match.home.name} remain ${event.score[0]}–${event.score[1]} ahead.`
        : `TxLINE records a VAR review after a possible ${team} goal with the score at ${event.score[0]}–${event.score[1]}.`,
      importance: overturned ? 91 : 86, source,
    };
  }
  if (event.action === "corner") {
    return {
      id: `corner-${event.seq}`, seq: event.seq, kind: "corner", clockSeconds: event.clockSeconds,
      clockLabel: label, side, score: event.score, corners: event.corners,
      title: `Corner · ${team}`,
      fact: `${team} win a confirmed corner. The corner count is ${event.corners[0]}–${event.corners[1]}.`,
      importance: 48, source,
    };
  }
  if (event.action === "yellow_card" || event.action === "red_card") {
    const official = match.officialMoments.find(
      (moment) => moment.kind === event.action && moment.side === side && Math.abs(moment.minute - Math.floor(event.clockSeconds / 60)) <= 2,
    );
    return {
      id: `${event.action}-${event.seq}`, seq: event.seq, kind: event.action, clockSeconds: event.clockSeconds,
      clockLabel: official?.clock ?? label, side, score: event.score, corners: event.corners,
      title: `${event.action === "red_card" ? "Red" : "Yellow"} card · ${team}`,
      fact: official?.player ? `${official.player} is shown a card for ${team}.` : `${team} receive a confirmed card.`,
      importance: event.action === "red_card" ? 92 : 58, source,
    };
  }
  if (event.action === "halftime_finalised") {
    return {
      id: `halftime-${event.seq}`, seq: event.seq, kind: "halftime", clockSeconds: event.clockSeconds,
      clockLabel: "HT", score: event.score, corners: event.corners,
      title: "Half-time",
      fact: `${match.home.name} ${event.score[0]}–${event.score[1]} ${match.away.name} at the interval.`,
      importance: 78, source,
    };
  }
  if (event.action === "game_finalised") {
    const penalties = match.penalties ? ` ${match.penalties[0]}–${match.penalties[1]} on penalties.` : "";
    return {
      id: `fulltime-${event.seq}`, seq: event.seq, kind: "fulltime", clockSeconds: event.clockSeconds,
      clockLabel: "FT", score: event.score, corners: event.corners,
      title: "Full time",
      fact: `${match.home.name} ${event.score[0]}–${event.score[1]} ${match.away.name}.${penalties}`,
      importance: 98, source,
    };
  }
  return undefined;
}

function dedupeMoments(moments: RadioMoment[]): RadioMoment[] {
  const seen = new Set<string>();
  return moments.filter((moment) => {
    const key = ["kickoff", "halftime", "fulltime"].includes(moment.kind)
      ? moment.kind
      : `${moment.kind}:${moment.clockSeconds}:${moment.side ?? 0}:${moment.score.join("-")}:${moment.corners.join("-")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function pressureMoments(events: CanonicalEvent[], match: ArchiveMatch, source: RadioMoment["source"]): RadioMoment[] {
  const windows = new Map<number, { danger: number; shots: number; attacks: number; seq: number; side1: number; side2: number; score: [number, number]; corners: [number, number] }>();
  for (const event of events) {
    if (!event.confirmed || !["high_danger_possession", "danger_possession", "shot"].includes(event.action)) continue;
    const bucket = Math.floor(event.clockSeconds / 600);
    const current = windows.get(bucket) ?? { danger: 0, shots: 0, attacks: 0, seq: event.seq, side1: 0, side2: 0, score: event.score, corners: event.corners };
    if (event.action === "shot") current.shots += 1;
    if (event.action === "high_danger_possession") current.danger += 1;
    if (event.action === "danger_possession") current.attacks += 1;
    if (event.participant === 1) current.side1 += 1;
    if (event.participant === 2) current.side2 += 1;
    current.seq = event.seq;
    current.score = event.score;
    current.corners = event.corners;
    windows.set(bucket, current);
  }
  return [...windows.entries()]
    .map(([bucket, value]) => ({ bucket, value, heat: value.danger * 3 + value.shots * 4 + value.attacks }))
    .filter(({ heat, bucket }) => heat >= 18 && bucket !== 4)
    .sort((a, b) => b.heat - a.heat)
    .slice(0, 3)
    .map(({ bucket, value }) => {
      const side: Side = value.side1 >= value.side2 ? 1 : 2;
      const team = teamName(match, side);
      return {
        id: `pressure-${value.seq}`, seq: value.seq, kind: "pressure", clockSeconds: (bucket + 1) * 600,
        clockLabel: `${bucket * 10}'–${bucket * 10 + 10}'`, side, score: value.score, corners: value.corners,
        title: `Pressure surge · ${team}`,
        fact: `${team} drive a sustained spell: ${value.shots} shots and ${value.danger + value.attacks} dangerous actions across this ten-minute passage.`,
        importance: Math.min(88, 62 + value.shots * 3), source,
      } satisfies RadioMoment;
    });
}

export function getRadioReplay(fixtureId: number): { match: ArchiveMatch; moments: RadioMoment[]; rawEventCount: number } | undefined {
  const match = getArchiveMatch(fixtureId);
  if (!match) return undefined;
  if (match.status === "upcoming") return { match, moments: [], rawEventCount: 0 };
  const replayPath = path.join(dataRoot, "replays", `${fixtureId}.json`);
  if (!fs.existsSync(replayPath)) return { match, moments: [], rawEventCount: 0 };
  const replay = readJson<{ source: RadioMoment["source"]; rawEventCount?: number; events: CanonicalEvent[] }>(replayPath);
  const source = replay.source;
  const core = replay.events
    .filter((event) => event.confirmed && ["kickoff", "goal", "corner", "yellow_card", "red_card", "halftime_finalised", "extra_time_start", "var_review", "var_overturned", "game_finalised"].includes(event.action))
    .map((event) => eventCopy(event, match, source))
    .filter((moment): moment is RadioMoment => Boolean(moment));
  const moments = dedupeMoments([...core, ...pressureMoments(replay.events, match, source)])
    .sort((a, b) => a.seq - b.seq);
  return { match, moments, rawEventCount: replay.rawEventCount ?? replay.events.length };
}
