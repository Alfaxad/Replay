import assert from "node:assert/strict";
import test from "node:test";

import { spokenClockLead, stripSpokenClockEcho } from "../lib/replay/spoken-clock";

test("regular match minutes become natural spoken ordinals", () => {
  assert.equal(spokenClockLead("3'"), "In the 3rd minute,");
  assert.equal(spokenClockLead("11'"), "In the 11th minute,");
  assert.equal(spokenClockLead("22'"), "In the 22nd minute,");
});

test("stripSpokenClockEcho removes duplicated checkpoint wording", () => {
  assert.equal(stripSpokenClockEcho("HT", "At half-time, Algeria and Austria are level at 1–1."), "Algeria and Austria are level at 1–1.");
  assert.equal(stripSpokenClockEcho("HT", "England trail 0–1 at the interval."), "England trail 0–1.");
  assert.equal(stripSpokenClockEcho("FT", "Full time: France 4–6 England."), "France 4–6 England.");
});

test("stoppage time identifies the correct match period", () => {
  assert.equal(spokenClockLead("45'+1'"), "In the 1st minute of first-half stoppage time,");
  assert.equal(spokenClockLead("90'+6'"), "In the 6th minute of second-half stoppage time,");
});

test("checkpoints and pressure ranges are narrated clearly", () => {
  assert.equal(spokenClockLead("HT"), "At half-time,");
  assert.equal(spokenClockLead("FT"), "At full-time,");
  assert.equal(spokenClockLead("60'–70'"), "Between the 60th and 70th minutes,");
});
