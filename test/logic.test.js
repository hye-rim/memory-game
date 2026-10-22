'use strict';
// 기억력 짝맞추기 규칙 시험. 실행: node test/logic.test.js
const test = require('node:test');
const assert = require('node:assert');
const L = require('../logic.js');

function rng(seed) {                                   // mulberry32 (시험용 고정 난수)
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('rounds grow from 12 to 16 to 20 cards and preview time shrinks to a floor', () => {
  assert.strictEqual(L.roundSpec(1).pairs * 2, 12);
  assert.strictEqual(L.roundSpec(4).pairs * 2, 16);
  assert.strictEqual(L.roundSpec(7).pairs * 2, 20);
  assert.strictEqual(L.roundSpec(30).pairs * 2, 20);
  for (let n = 1; n <= 30; n++) {
    const s = L.roundSpec(n);
    assert.strictEqual(s.cols * s.rows, s.pairs * 2);
    assert.ok(s.preview >= 1.2 && s.preview <= 3.2);
    if (n > 1) assert.ok(s.preview <= L.roundSpec(n - 1).preview);
  }
});

test('every deal has exactly two of each picture and the right number of pictures', () => {
  for (let n = 1; n <= 12; n++) {
    for (let s = 1; s <= 50; s++) {
      const cards = L.deal(n, rng(n * 1000 + s));
      const spec = L.roundSpec(n);
      assert.strictEqual(cards.length, spec.pairs * 2);
      const count = new Map();
      for (const e of cards) count.set(e, (count.get(e) || 0) + 1);
      assert.strictEqual(count.size, spec.pairs, `round ${n} seed ${s}`);
      for (const v of count.values()) assert.strictEqual(v, 2);
    }
  }
});

test('later rounds mix in look-alike pictures', () => {
  const lookalikeKinds = (cards) => {
    const kinds = new Set(cards);
    return L.LOOKALIKE.reduce((best, g) => Math.max(best, g.filter((e) => kinds.has(e)).length), 0);
  };
  for (let s = 1; s <= 20; s++) {
    assert.ok(lookalikeKinds(L.deal(5, rng(s))) >= 3, 'round 5 has a group of three look-alikes');
    assert.ok(lookalikeKinds(L.deal(9, rng(s))) >= 3);
  }
});

test('score: combo bonus is capped, perfect clears pay more', () => {
  assert.strictEqual(L.matchScore(1), 100);
  assert.strictEqual(L.matchScore(3), 140);
  assert.strictEqual(L.matchScore(50), 300);
  assert.ok(L.clearBonus(3, true) > L.clearBonus(3, false));
  assert.ok(L.clearTime(true) > L.clearTime(false));
});
