import { difficultyMultiplier } from "@/lib/game/engine";
import type { Prediction, Side } from "@/lib/game/types";

export const FEATURED_REPLAY = {
  fixtureId: 18241006,
  title: "The late reversal",
  team1: "HOME 1888",
  team2: "AWAY 1489",
  startAtSeq: 500,
  pressureSeq: 520,
  firstGoalSeq: 540,
  finalSeq: 962,
  note: "Real TxLINE historical sequence · display names are not included in the replay payload",
};

export const FALLBACK_FIXTURES = [
  { fixtureId: 18257739, participant1: "Spain", participant2: "Argentina", startTime: 1784487600000 },
  { fixtureId: 18257865, participant1: "France", participant2: "England", startTime: 1784408400000 },
  { fixtureId: 18143850, participant1: "Vietnam", participant2: "Myanmar", startTime: 1784376000000 },
];

export function createPrediction(options: {
  id: string;
  creator: "user" | "rival";
  side?: Side;
  seq: number;
  clock: number;
  score: [number, number];
  probability: number;
  conviction: number;
  type?: Prediction["type"];
  deadlineSecond?: number;
}): Prediction {
  return {
    id: options.id,
    creator: options.creator,
    type: options.type ?? "NEXT_TEAM_TO_SCORE",
    side: options.side,
    deadlineSecond: options.deadlineSecond,
    lockedAtSeq: options.seq,
    lockedAtClock: options.clock,
    lockedAtScore: options.score,
    lockedProbability: options.probability,
    currentProbability: options.probability,
    conviction: options.conviction,
    rewardMultiplier: difficultyMultiplier(options.probability),
    pressureMultiplier: 1,
    status: "locked",
  };
}
