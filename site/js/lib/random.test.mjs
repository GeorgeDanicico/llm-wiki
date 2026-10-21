import assert from "node:assert/strict";
import { test } from "node:test";

import { hashString, mulberry32, randomId, seededShuffle } from "./random.js";

test("hashString is stable and spreads nearby strings", () => {
  assert.equal(hashString("2026-10-21"), hashString("2026-10-21"));
  assert.notEqual(hashString("2026-10-21"), hashString("2026-10-22"));
});

test("mulberry32 repeats for a seed and stays in [0, 1)", () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 100; i++) {
    const value = a();
    assert.equal(value, b());
    assert.ok(value >= 0 && value < 1);
  }
});

test("seededShuffle is a deterministic permutation", () => {
  const items = Array.from({ length: 20 }, (_, i) => i);
  const once = seededShuffle(items, "seed");
  assert.deepEqual(once, seededShuffle(items, "seed"));
  assert.deepEqual([...once].sort((x, y) => x - y), items);
  assert.notDeepEqual(once, seededShuffle(items, "other seed"));
});

test("randomId has the requested length", () => {
  assert.match(randomId(), /^[a-z0-9]{12}$/);
  assert.notEqual(randomId(), randomId());
});
