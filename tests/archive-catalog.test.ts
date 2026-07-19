import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

type CatalogMatch = {
  matchNumber: number;
  fixtureId: number;
  status: "complete" | "upcoming";
  score: [number, number] | null;
  eventSource: "txline-historical" | "fifa-official-events" | "txline-live-ready";
  eventCount: number;
};

const dataRoot = path.resolve(process.cwd(), "data", "knockout");
const catalog = JSON.parse(fs.readFileSync(path.join(dataRoot, "catalog.json"), "utf8")) as {
  scope: string;
  matches: CatalogMatch[];
};

test("catalog contains exactly TxLINE's published 2026 World Cup coverage", () => {
  const expectedMatchNumbers = [69, 70, ...Array.from({ length: 32 }, (_, index) => index + 73)];
  assert.equal(catalog.scope, "FIFA World Cup 2026 · TxLINE published fixture coverage");
  assert.deepEqual(catalog.matches.map((match) => match.matchNumber), expectedMatchNumbers);
  assert.equal(new Set(catalog.matches.map((match) => match.fixtureId)).size, 34);
  assert.equal(catalog.matches.filter((match) => match.status === "complete").length, 33);
  assert.equal(catalog.matches.filter((match) => match.status === "upcoming").length, 1);
});

test("every completed catalog match has a score-consistent replay receipt", () => {
  for (const match of catalog.matches.filter((item) => item.status === "complete")) {
    const replayPath = path.join(dataRoot, "replays", `${match.fixtureId}.json`);
    assert.ok(fs.existsSync(replayPath), `missing replay ${match.fixtureId}`);
    const replay = JSON.parse(fs.readFileSync(replayPath, "utf8")) as {
      source: CatalogMatch["eventSource"];
      events: Array<{ action: string; score: [number, number] }>;
    };
    assert.equal(replay.source, match.eventSource);
    assert.equal(replay.events.length, match.eventCount);
    assert.ok(replay.events.some((event) => event.action === "kickoff"), `missing kickoff ${match.fixtureId}`);
    const finalEvent = replay.events.filter((event) => event.action === "game_finalised").at(-1);
    assert.ok(finalEvent, `missing finalization ${match.fixtureId}`);
    assert.deepEqual(finalEvent.score, match.score);
  }
});

test("no out-of-coverage replay files remain", () => {
  const expected = new Set(
    catalog.matches.filter((match) => match.eventCount > 0).map((match) => `${match.fixtureId}.json`),
  );
  const actual = fs.readdirSync(path.join(dataRoot, "replays")).filter((file) => file.endsWith(".json"));
  assert.deepEqual(new Set(actual), expected);
});
