import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { getRadioReplay } from "../lib/replay/archive";

type DemoIndex = {
  runtimeOpenAICalls: number;
  completedMatches: number;
  chapters: number;
  matches: Array<{ fixtureId: number; chapters: number }>;
};

type DemoManifest = {
  fixtureId: number;
  voice: string;
  chapters: Array<{ id: string; audioPath: string; text: string }>;
};

const projectRoot = path.resolve(import.meta.dirname, "..");
const demoRoot = path.join(projectRoot, "public", "demo", "replays");

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

test("offline demo covers every completed archive replay without runtime AI calls", () => {
  const index = readJson<DemoIndex>(path.join(demoRoot, "index.json"));
  assert.equal(index.runtimeOpenAICalls, 0);
  assert.equal(index.completedMatches, 33);
  assert.equal(index.chapters, 471);
  assert.equal(index.matches.length, 33);
});

test("every cached chapter matches the deterministic replay and has a playable MP3 asset", () => {
  const index = readJson<DemoIndex>(path.join(demoRoot, "index.json"));
  for (const item of index.matches) {
    const replay = getRadioReplay(item.fixtureId);
    assert.ok(replay, `missing replay ${item.fixtureId}`);
    const manifest = readJson<DemoManifest>(path.join(demoRoot, String(item.fixtureId), "manifest.json"));
    assert.equal(manifest.voice, "ash");
    assert.equal(manifest.chapters.length, replay.moments.length);
    assert.deepEqual(manifest.chapters.map((chapter) => chapter.id), replay.moments.map((moment) => moment.id));
    for (const chapter of manifest.chapters) {
      assert.ok(chapter.text.trim().length > 12, `empty narration ${item.fixtureId}/${chapter.id}`);
      const audioFile = path.join(projectRoot, "public", chapter.audioPath.slice(1));
      assert.ok(fs.statSync(audioFile).size > 1_000, `invalid MP3 ${chapter.audioPath}`);
    }
  }
});
