import assert from "node:assert/strict";
import test from "node:test";

import {
  applySettlement,
  evaluatePrediction,
  initialMatchState,
  normalizeTxlineEvent,
  reduceMatchState,
} from "../lib/game/engine";
import { createPrediction } from "../lib/game/demo";

test("duplicate or older sequences are ignored", () => {
  const first = normalizeTxlineEvent({ FixtureId: 1, Seq: 10, Action: "kickoff", Clock: { Seconds: 1 } });
  const older = normalizeTxlineEvent({ FixtureId: 1, Seq: 9, Action: "goal", Stats: { 1: 1, 2: 0 } });
  const state = reduceMatchState(initialMatchState(1), first);
  assert.equal(reduceMatchState(state, older), state);
});

test("next scorer settles from the first score delta, not duplicate goal confirmations", () => {
  const before = { ...initialMatchState(1), latestSeq: 20, clockSeconds: 100, score: [0, 0] as [number, number] };
  const event = normalizeTxlineEvent({
    FixtureId: 1,
    Seq: 30,
    Action: "goal",
    Confirmed: true,
    Participant: 2,
    Clock: { Seconds: 120 },
    Stats: { 1: 0, 2: 1 },
  });
  const after = reduceMatchState(before, event);
  const call = createPrediction({
    id: "p1",
    creator: "user",
    side: 2,
    seq: 20,
    clock: 100,
    score: [0, 0],
    probability: 0.3,
    conviction: 10,
  });
  const settlement = evaluatePrediction(call, before, after, event);
  assert.equal(settlement?.status, "won");
  assert.equal(applySettlement(call, settlement!).status, "won");

  const duplicate = normalizeTxlineEvent({ ...event, Seq: 31 });
  const duplicateState = reduceMatchState(after, duplicate);
  assert.equal(evaluatePrediction(applySettlement(call, settlement!), after, duplicateState, duplicate), undefined);
});

test("next corner uses confirmed totals and identical rules for user and rival", () => {
  const before = { ...initialMatchState(1), latestSeq: 70, corners: [0, 0] as [number, number] };
  const event = normalizeTxlineEvent({
    FixtureId: 1,
    Seq: 77,
    Action: "corner",
    Confirmed: true,
    Participant: 1,
    Stats: { 7: 1, 8: 0 },
  });
  const after = reduceMatchState(before, event);
  for (const creator of ["user", "rival"] as const) {
    const call = createPrediction({
      id: creator,
      creator,
      side: 1,
      seq: 70,
      clock: 0,
      score: [0, 0],
      probability: 0.5,
      conviction: 10,
      type: "NEXT_CORNER",
    });
    assert.equal(evaluatePrediction(call, before, after, event)?.status, "won");
  }
});
