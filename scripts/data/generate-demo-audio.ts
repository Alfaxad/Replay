import fs from "node:fs";
import path from "node:path";

import OpenAI from "openai";

import { ASH_PERFORMANCE_DIRECTION, momentDirection } from "../../lib/ai/ash-speech";
import { createReplayStory, type ReplayScript } from "../../lib/ai/replay-story";
import { getArchiveCatalog, getRadioReplay, type RadioMoment } from "../../lib/replay/archive";
import { spokenClockLead, stripSpokenClockEcho } from "../../lib/replay/spoken-clock";

const projectRoot = path.resolve(import.meta.dirname, "../..");
const outputRoot = path.join(projectRoot, "public", "demo", "replays");
const force = process.argv.includes("--force");
const dryRun = process.argv.includes("--dry-run");

type DemoChapter = {
  id: string;
  audioPath: string;
  text: string;
  kind: string;
  intensity: number;
};

type DemoManifest = {
  fixtureId: number;
  matchNumber: number;
  generatedAt: string;
  model: "gpt-4o-mini-tts";
  storyModel: "gpt-5.6-luna";
  voice: "ash";
  script: ReplayScript;
  chapters: DemoChapter[];
};

function readEnvValue(text: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.match(new RegExp(`^\\s*${escaped}\\s*=\\s*["']?([^"'\\r\\n]+)["']?\\s*$`, "m"))?.[1]?.trim();
}

function openAIKey(): string {
  const existing = process.env.OPENAI_API_KEY ?? process.env.OPEN_AI_KEY;
  if (existing) return existing;
  for (const candidate of [path.resolve(projectRoot, "../../env.txt"), path.resolve(projectRoot, "../env.txt")]) {
    if (!fs.existsSync(candidate)) continue;
    const text = fs.readFileSync(candidate, "utf8");
    const value = readEnvValue(text, "OPENAI_API_KEY") ?? readEnvValue(text, "OPEN_AI_KEY");
    if (value) return value;
  }
  throw new Error("Missing OPENAI_API_KEY or OPEN_AI_KEY");
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "chapter";
}

async function retry<T>(label: string, operation: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      const delay = 900 * 2 ** (attempt - 1);
      console.warn(`${label} failed (${attempt}/${attempts}); retrying in ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

async function concurrentMap<T>(items: T[], limit: number, operation: (item: T, index: number) => Promise<void>): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await operation(items[index]!, index);
    }
  });
  await Promise.all(workers);
}

function storyRequest(replay: NonNullable<ReturnType<typeof getRadioReplay>>) {
  return {
    match: replay.match,
    moments: replay.moments.map(({ id, clockLabel, title, fact, importance }) => ({ id, clockLabel, title, fact, importance })),
  };
}

function narration(moment: RadioMoment, script: ReplayScript): string {
  const shaped = moment.importance >= 58 ? script.moments.find((item) => item.id === moment.id)?.spokenLine : undefined;
  return `${spokenClockLead(moment.clockLabel)} ${stripSpokenClockEcho(moment.clockLabel, shaped ?? moment.fact)}`;
}

async function main() {
  const catalog = getArchiveCatalog();
  const completed = catalog.matches.filter((match) => match.status === "complete");
  const replays = completed.map((match) => getRadioReplay(match.fixtureId)).filter((replay): replay is NonNullable<typeof replay> => Boolean(replay?.moments.length));
  const totalChapters = replays.reduce((sum, replay) => sum + replay.moments.length, 0);

  if (dryRun) {
    console.log(JSON.stringify({ matches: replays.length, chapters: totalChapters, upcoming: catalog.matches.length - completed.length }, null, 2));
    return;
  }

  fs.mkdirSync(outputRoot, { recursive: true });
  const openai = new OpenAI({ apiKey: openAIKey() });
  const summaries: Array<{ fixtureId: number; matchNumber: number; chapters: number }> = [];

  for (const [matchIndex, replay] of replays.entries()) {
    const fixtureDirectory = path.join(outputRoot, String(replay.match.fixtureId));
    const manifestPath = path.join(fixtureDirectory, "manifest.json");
    fs.mkdirSync(fixtureDirectory, { recursive: true });
    let existing: DemoManifest | undefined;
    if (!force && fs.existsSync(manifestPath)) {
      existing = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as DemoManifest;
    }

    console.log(`[${matchIndex + 1}/${replays.length}] M${replay.match.matchNumber} ${replay.match.home.name}–${replay.match.away.name}: ${replay.moments.length} chapters`);
    const script = existing?.script ?? await retry(`Story for M${replay.match.matchNumber}`, () => createReplayStory(openai, storyRequest(replay)));
    const chapters: DemoChapter[] = replay.moments.map((moment, index) => {
      const filename = `${String(index + 1).padStart(2, "0")}-${safeId(moment.id)}.mp3`;
      return {
        id: moment.id,
        audioPath: `/demo/replays/${replay.match.fixtureId}/${filename}`,
        text: narration(moment, script),
        kind: moment.kind,
        intensity: moment.importance,
      };
    });
    const existingText = new Map(existing?.chapters.map((chapter) => [chapter.id, chapter.text]) ?? []);

    await concurrentMap(chapters, 5, async (chapter) => {
      const destination = path.join(projectRoot, "public", chapter.audioPath.slice(1));
      if (!force && existingText.get(chapter.id) === chapter.text && fs.existsSync(destination) && fs.statSync(destination).size > 1_000) return;
      const audio = await retry(`Audio ${replay.match.matchNumber}/${chapter.id}`, () => openai.audio.speech.create({
        model: "gpt-4o-mini-tts",
        voice: "ash",
        input: chapter.text,
        instructions: `${ASH_PERFORMANCE_DIRECTION}\n\n# Direction for this moment\n${momentDirection(chapter.kind, chapter.intensity)}`,
        response_format: "mp3",
      }));
      fs.writeFileSync(destination, Buffer.from(await audio.arrayBuffer()));
    });

    const manifest: DemoManifest = {
      fixtureId: replay.match.fixtureId,
      matchNumber: replay.match.matchNumber,
      generatedAt: new Date().toISOString(),
      model: "gpt-4o-mini-tts",
      storyModel: "gpt-5.6-luna",
      voice: "ash",
      script,
      chapters,
    };
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    summaries.push({ fixtureId: replay.match.fixtureId, matchNumber: replay.match.matchNumber, chapters: chapters.length });
  }

  fs.writeFileSync(path.join(outputRoot, "index.json"), `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    mode: "offline-demo",
    modelsUsedAtGenerationTime: ["gpt-5.6-luna", "gpt-4o-mini-tts"],
    runtimeOpenAICalls: 0,
    completedMatches: summaries.length,
    chapters: summaries.reduce((sum, item) => sum + item.chapters, 0),
    matches: summaries,
  }, null, 2)}\n`);
  console.log(`Offline demo library ready: ${summaries.length} matches, ${totalChapters} MP3 chapters.`);
}

await main();
