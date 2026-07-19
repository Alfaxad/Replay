export type Side = 1 | 2;

export type CanonicalEvent = {
  fixtureId: number;
  seq: number;
  timestamp: number;
  action: string;
  gameState: string;
  clockSeconds: number;
  clockRunning: boolean;
  confirmed: boolean;
  participant?: Side;
  score: [number, number];
  corners: [number, number];
};

export type MatchState = {
  fixtureId: number;
  latestSeq: number;
  timestamp: number;
  clockSeconds: number;
  phase: string;
  score: [number, number];
  corners: [number, number];
  final: boolean;
  recentEvents: CanonicalEvent[];
};

export type PredictionType =
  | "NEXT_TEAM_TO_SCORE"
  | "NEXT_CORNER"
  | "GOAL_BEFORE"
  | "NO_GOAL_WINDOW"
  | "MATCH_RESULT";

export type PredictionStatus = "locked" | "won" | "lost" | "folded" | "cancelled";

export type Prediction = {
  id: string;
  creator: "user" | "rival";
  type: PredictionType;
  side?: Side;
  deadlineSecond?: number;
  lockedAtSeq: number;
  lockedAtClock: number;
  lockedAtScore: [number, number];
  lockedProbability: number;
  currentProbability: number;
  conviction: number;
  rewardMultiplier: number;
  pressureMultiplier: number;
  status: PredictionStatus;
  settledAtSeq?: number;
  settlementReason?: string;
};

export type Settlement = {
  predictionId: string;
  status: Extract<PredictionStatus, "won" | "lost" | "cancelled">;
  seq: number;
  reason: string;
};
