'use strict';

// 기억력 짝맞추기: 판 규칙만 모아 둔 파일 (그리기·입력 없음). 브라우저와 테스트(Node)가 같이 쓴다.
//
// 라운드마다 카드를 잠깐 다 보여 주고 뒤집는다. 같은 그림 둘을 차례로 뒤집으면 없어진다.

// 서로 확실히 달라 보이는 그림
const EASY = ['🐶', '🐱', '🐰', '🐻', '🐼', '🐸', '🐷', '🐵', '🐥', '🐙',
              '🍎', '🍋', '🍉', '🍇', '🍓', '🍑', '🌻', '⭐', '🚗', '🎈'];
// 헷갈리게 비슷한 그림 묶음 (뒤 라운드에서 섞는다)
const LOOKALIKE = [
  ['🍎', '🍅', '🍒', '🍓'],
  ['🐶', '🐺', '🦊', '🐯'],
  ['🌙', '⭐', '☀️', '🌟'],
  ['🍋', '🍌', '🌽', '🧀'],
  ['🐳', '🐬', '🐟', '🐠'],
  ['🚗', '🚕', '🚙', '🚌'],
];

// 라운드 설정: 카드 수, 미리 보여 주는 시간, 비슷한 그림 섞는 수
function roundSpec(n) {
  const rows = n <= 3 ? 3 : n <= 6 ? 4 : 5;          // 4열 × 3·4·5행 = 12·16·20장
  const preview = Math.max(1.2, 3.2 - (n - 1) * 0.2);
  const lookalike = n <= 3 ? 0 : n <= 6 ? 1 : 2;        // 비슷한 그림 묶음 몇 개를 넣을지
  return { cols: 4, rows, pairs: rows * 2, preview, lookalike };
}

function shuffled(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}

// 라운드 카드 배치: 그림 목록(짝마다 두 장)을 섞어 돌려준다
function deal(n, rng = Math.random) {
  const spec = roundSpec(n);
  const kinds = [];
  for (const group of shuffled(LOOKALIKE.slice(), rng).slice(0, spec.lookalike)) {
    for (const e of shuffled(group.slice(), rng).slice(0, 3)) if (!kinds.includes(e)) kinds.push(e);
  }
  for (const e of shuffled(EASY.slice(), rng)) {
    if (kinds.length >= spec.pairs) break;
    if (!kinds.includes(e)) kinds.push(e);
  }
  return shuffled(kinds.slice(0, spec.pairs).flatMap((e) => [e, e]), rng);
}

// 점수: 짝 하나에 100 + 콤보 보너스(최대 +200), 라운드를 비우면 보너스
const matchScore = (combo) => 100 + Math.min(combo - 1, 10) * 20;
const clearBonus = (n, perfect) => 200 + n * 50 + (perfect ? 300 : 0);
const clearTime = (perfect) => (perfect ? 8 : 5);        // 라운드를 비우면 늘어나는 시간(초)

const LOGIC = { EASY, LOOKALIKE, roundSpec, deal, matchScore, clearBonus, clearTime };
if (typeof module !== 'undefined') module.exports = LOGIC;
