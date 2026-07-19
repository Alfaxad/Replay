import type {
  CanonicalEvent,
  MatchState,
  Prediction,
  Settlement,
  Side,
} from "@/lib/game/types";

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sideValue(value: unknown): Side | undefined {
  const parsed = numberValue(value, -1);
  return parsed === 1 || parsed === 2 ? parsed : undefined;
}

export function normalizeTxlineEvent(raw: Record<string, unknown>): CanonicalEvent {
  const stats = (raw.Stats ?? raw.stats ?? {}) as Record<string, unknown>;
  const clock = (raw.Clock ?? raw.clock ?? {}) as Record<string, unknown>;
  const action = String(raw.Action ?? raw.action ?? "update").toLowerCase();
  const confirmedValue = raw.Confirmed ?? raw.confirmed;

  return {
    fixtureId: numberValue(raw.FixtureId ?? raw.fixtureId),
    seq: numberValue(raw.Seq ?? raw.seq),
    timestamp: numberValue(raw.Ts ?? raw.ts ?? Date.now()),
    action,
    gameState: String(raw.GameState ?? raw.gameState ?? "unknown"),
    clockSeconds: numberValue(clock.Seconds ?? clock.seconds),
    clockRunning: Boolean(clock.Running ?? clock.running),
    confirmed: confirmedValue === undefined ? true : Boolean(confirmedValue),
    participant: sideValue(raw.Participant ?? raw.participant),
    score: [numberValue(stats["1"]), numberValue(stats["2"])],
    corners: [numberValue(stats["7"]), numberValue(stats["8"])],
  };
}

export function initialMatchState(fixtureId = 0): MatchState {
  return {
    fixtureId,
    latestSeq: -1,
    timestamp: 0,
    clockSeconds: 0,
    phase: "PRE-MATCH",
    score: [0, 0],
    corners: [0, 0],
    final: false,
    recentEvents: [],
  };
}

function inferredPhase(event: CanonicalEvent): string {
  if (event.action === "game_finalised") return "FULL TIME";
  if (event.action === "halftime_finalised") return "HALFTIME";
  if (event.clockSeconds >= 2700) return "SECOND HALF";
  if (event.action === "kickoff" || event.clockSeconds > 0) return "FIRST HALF";
  return event.gameState === "scheduled" ? "PRE-MATCH" : event.gameState.toUpperCase();
}

export function reduceMatchState(state: MatchState, event: CanonicalEvent): MatchState {
  if (event.seq <= state.latestSeq) return state;
  const meaningful = ["goal", "corner", "shot", "possible", "halftime_finalised", "game_finalised"];
  const recentEvents = meaningful.includes(event.action)
    ? [...state.recentEvents, event].slice(-8)
    : state.recentEvents;

  return {
    fixtureId: event.fixtureId || state.fixtureId,
    latestSeq: event.seq,
    timestamp: event.timestamp,
    clockSeconds: Math.max(state.clockSeconds, event.clockSeconds),
    phase: inferredPhase(event),
    score: event.score,
    corners: event.corners,
    final: state.final || event.action === "game_finalised",
    recentEvents,
  };
}

function scoreDelta(before: MatchState, after: MatchState): Side | undefined {
  if (after.score[0] > before.score[0]) return 1;
  if (after.score[1] > before.score[1]) return 2;
  return undefined;
}

function cornerDelta(before: MatchState, after: MatchState): Side | undefined {
  if (after.corners[0] > before.corners[0]) return 1;
  if (after.corners[1] > before.corners[1]) return 2;
  return undefined;
}

export function evaluatePrediction(
  prediction: Prediction,
  before: MatchState,
  after: MatchState,
  event: CanonicalEvent,
): Settlement | undefined {
  if (prediction.status !== "locked" || event.seq <= prediction.lockedAtSeq) return undefined;
  const scoredSide = scoreDelta(before, after);
  const cornerSide = cornerDelta(before, after);

  if (prediction.type === "NEXT_TEAM_TO_SCORE" && scoredSide) {
    return {
      predictionId: prediction.id,
      status: scoredSide === prediction.side ? "won" : "lost",
      seq: event.seq,
      reason: `Participant ${scoredSide} scored next at ${formatClock(after.clockSeconds)}.`,
    };
  }

  if (prediction.type === "NEXT_CORNER" && cornerSide) {
    return {
      predictionId: prediction.id,
      status: cornerSide === prediction.side ? "won" : "lost",
      seq: event.seq,
      reason: `Participant ${cornerSide} earned the next confirmed corner.`,
    };
  }

  if (prediction.type === "GOAL_BEFORE") {
    if (scoredSide && after.clockSeconds <= (prediction.deadlineSecond ?? 0)) {
      return {
        predictionId: prediction.id,
        status: prediction.side && scoredSide !== prediction.side ? "lost" : "won",
        seq: event.seq,
        reason: `A qualifying goal arrived at ${formatClock(after.clockSeconds)}.`,
      };
    }
    if (after.clockSeconds > (prediction.deadlineSecond ?? 0)) {
      return {
        predictionId: prediction.id,
        status: "lost",
        seq: event.seq,
        reason: `The ${formatClock(prediction.deadlineSecond ?? 0)} deadline passed.`,
      };
    }
  }

  if (prediction.type === "NO_GOAL_WINDOW") {
    if (scoredSide && after.clockSeconds <= (prediction.deadlineSecond ?? 0)) {
      return {
        predictionId: prediction.id,
        status: "lost",
        seq: event.seq,
        reason: `The no-goal window was broken at ${formatClock(after.clockSeconds)}.`,
      };
    }
    if (after.clockSeconds >= (prediction.deadlineSecond ?? 0)) {
      return {
        predictionId: prediction.id,
        status: "won",
        seq: event.seq,
        reason: `No confirmed goal arrived before ${formatClock(prediction.deadlineSecond ?? 0)}.`,
      };
    }
  }

  if (prediction.type === "MATCH_RESULT" && after.final) {
    const winner: Side | undefined = after.score[0] === after.score[1] ? undefined : after.score[0] > after.score[1] ? 1 : 2;
    return {
      predictionId: prediction.id,
      status: winner === prediction.side ? "won" : "lost",
      seq: event.seq,
      reason: winner ? `Participant ${winner} won ${after.score[0]}–${after.score[1]}.` : "The match finished level.",
    };
  }

  return undefined;
}

export function applySettlement(prediction: Prediction, settlement: Settlement): Prediction {
  if (prediction.status !== "locked" || prediction.id !== settlement.predictionId) return prediction;
  return {
    ...prediction,
    status: settlement.status,
    settledAtSeq: settlement.seq,
    settlementReason: settlement.reason,
  };
}

export function difficultyMultiplier(probability: number): number {
  if (probability >= 0.7) return 1.1;
  if (probability >= 0.5) return 1.3;
  if (probability >= 0.3) return 1.6;
  if (probability >= 0.15) return 2.1;
  return 2.8;
}

export function convictionDelta(prediction: Prediction): number {
  if (prediction.status === "won") {
    return Math.round(
      prediction.conviction * prediction.rewardMultiplier * prediction.pressureMultiplier,
    );
  }
  if (prediction.status === "lost") return -prediction.conviction;
  return 0;
}

export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}
