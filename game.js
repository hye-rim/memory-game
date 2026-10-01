'use strict';

// 기억력 짝맞추기: 화면·입력·흐름. 판 규칙은 logic.js (LOGIC) 에 있다.
(() => {
const L = LOGIC;

// ---------- 모양 ----------
const W = 400, H = 600;
const TOP = 88, BOTTOM = H - 14;                   // 카드 판이 들어가는 세로 범위
const SIDE = 14, GAP = 10;
const INK = '#2b1d52';
const FONT = '"Jua", "Apple SD Gothic Neo", sans-serif';
const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

const START_TIME = 60;
const WRONG_TIME = 1;
const COMBO_WINDOW = 4;
const SHOW_PAIR = 0.45;       // 두 장을 뒤집은 뒤 맞았는지 보여 주는 시간
const FLIP_T = 0.16;          // 카드 한 번 뒤집히는 시간

// ---------- 캔버스 ----------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = (id) => document.getElementById(id);

function fit() {
  const hudH = 62;
  const scale = Math.min((innerWidth - 24) / W, (innerHeight - 28 - hudH) / H);
  const cssW = Math.floor(W * scale), cssH = Math.floor(H * scale);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  $('col').style.width = Math.max(cssW, Math.min(innerWidth - 20, 340)) + 'px';
  $('wrap').style.width = cssW + 'px';
  $('wrap').style.margin = '0 auto';
}
addEventListener('resize', fit);

function roundRect(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

// ---------- 저장·소리 ----------
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
};
let muted = store.get('memoryMuted') === '1';
let audio = null;
function tone(freq, dur, type = 'sine', vol = 0.12, slide = 0) {
  if (muted) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const t = audio.currentTime, o = audio.createOscillator(), g = audio.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(audio.destination); o.start(t); o.stop(t + dur);
  } catch (_) {}
}
const sfx = {
  flip: () => tone(520, 0.05, 'triangle', 0.08, 160),
  match: (n) => { tone(660 + Math.min(n, 10) * 50, 0.08, 'sine', 0.12, 220); setTimeout(() => tone(990 + Math.min(n, 10) * 50, 0.1, 'sine', 0.1), 70); },
  wrong: () => tone(170, 0.16, 'square', 0.06, -50),
  hide: () => [0, 1, 2].forEach((k) => setTimeout(() => tone(700 - k * 120, 0.05, 'triangle', 0.06), k * 40)),
  clear: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.16, 'triangle', 0.1), i * 100)),
  tick: () => tone(1000, 0.05, 'square', 0.05),
  end: () => [784, 659, 523, 392].forEach((f, i) => setTimeout(() => tone(f, 0.2, 'triangle', 0.1), i * 140)),
};

// ---------- 상태 ----------
let state = 'title';          // title | play | paused | over
let phase = 'preview';        // preview(다 보여 줌) | play | clear(다음 라운드 준비)
let round = 1, spec = L.roundSpec(1);
let cards = [];               // { e, x, y, w, h, up, gone, flip(0=뒷면 1=앞면), pop, shake }
let open = [];                // 지금 앞면인 카드 번호 (최대 2)
let judgeT = 0;               // 두 장 뒤집은 뒤 흐른 시간
let phaseT = 0;
let score = 0, best = Number(store.get('memoryBest')) || 0;
let time = START_TIME, combo = 0, maxCombo = 0, lastMatch = -99;
let pairsFound = 0, tries = 0, roundMistakes = 0;
let particles = [], texts = [], banner = null;
let clock = 0;

function layout() {
  spec = L.roundSpec(round);
  const deck = L.deal(round);
  const cw = (W - SIDE * 2 - GAP * (spec.cols - 1)) / spec.cols;
  const ch = Math.min(cw * 1.2, (BOTTOM - TOP - GAP * (spec.rows - 1)) / spec.rows);
  const top = TOP + (BOTTOM - TOP - (ch * spec.rows + GAP * (spec.rows - 1))) / 2;
  cards = deck.map((e, i) => {
    const r = Math.floor(i / spec.cols), c = i % spec.cols;
    return { e, x: SIDE + c * (cw + GAP), y: top + r * (ch + GAP), w: cw, h: ch, up: true, gone: false, flip: 1, pop: 0, shake: 0 };
  });
  open = []; judgeT = 0; roundMistakes = 0;
  phase = 'preview'; phaseT = spec.preview;
  banner = null;              // 외우는 동안 카드를 가리지 않게 가운데 글자는 띄우지 않는다
}

function startGame() {
  round = 1; score = 0; time = START_TIME; combo = 0; maxCombo = 0; lastMatch = -99;
  pairsFound = 0; tries = 0; particles = []; texts = [];
  layout();
  state = 'play';
  hideOverlay();
  updateHud();
}

// 미리 보기 끝: 전부 뒤집는다
function hideAll() {
  for (const c of cards) c.up = false;
  phase = 'play';
  sfx.hide();
}

// ---------- 흐름 ----------
function tapCard(i) {
  const c = cards[i];
  if (!c || c.gone) return;
  if (phase === 'preview') { hideAll(); return; }   // 다 외웠으면 눌러서 바로 시작
  if (phase !== 'play' || c.up) return;
  // 틀린 두 장을 보여 주는 중에 다른 카드를 누르면 바로 덮고 넘어간다 (빠르게 치는 사람 배려)
  if (open.length === 2) resolve();
  c.up = true;
  open.push(i);
  sfx.flip();
  if (open.length === 2) {
    judgeT = 0;
    tries++;
    const [a, b] = open.map((k) => cards[k]);
    if (a.e === b.e) resolve();                     // 맞으면 바로 없앤다
  }
}

// 뒤집힌 두 장 판정
function resolve() {
  if (open.length < 2) return;
  const [ia, ib] = open;
  const a = cards[ia], b = cards[ib];
  open = [];
  if (a.e === b.e) {
    a.gone = b.gone = true; a.pop = b.pop = 0.001;
    pairsFound++;
    combo = clock - lastMatch <= COMBO_WINDOW ? combo + 1 : 1;
    lastMatch = clock;
    maxCombo = Math.max(maxCombo, combo);
    const gain = L.matchScore(combo);
    addScore(gain);
    texts.push({ text: `+${gain}`, x: (a.x + b.x + a.w) / 2, y: (a.y + b.y + a.h) / 2, t: 0, big: combo >= 5 });
    for (const c of [a, b]) burst(c.x + c.w / 2, c.y + c.h / 2);
    sfx.match(combo);
    if (cards.every((c) => c.gone)) roundClear();
  } else {
    a.up = b.up = false;
    a.shake = b.shake = 0.3;
    combo = 0;
    roundMistakes++;
    time = Math.max(0, time - WRONG_TIME);
    texts.push({ text: `-${WRONG_TIME}초`, x: (a.x + b.x + a.w) / 2, y: (a.y + b.y + a.h) / 2, t: 0, bad: true });
    sfx.wrong();
  }
}

function roundClear() {
  const perfect = roundMistakes === 0;
  const bonus = L.clearBonus(round, perfect), add = L.clearTime(perfect);
  addScore(bonus);
  time += add;
  phase = 'clear'; phaseT = 1.3;
  banner = { text: perfect ? '퍼펙트!' : '클리어!', sub: `+${bonus} · ⏰ +${add}초`, t: 0 };
  sfx.clear();
}

function burst(x, y) {
  for (let i = 0; i < 8; i++) {
    const ang = Math.random() * Math.PI * 2, s = 60 + Math.random() * 140;
    particles.push({ x, y, vx: Math.cos(ang) * s, vy: Math.sin(ang) * s - 60, life: 0.55, col: ['#ffd23f', '#ff5fa2', '#7ee39a', '#8fd3ff'][i % 4] });
  }
}

function addScore(n) {
  score += n;
  if (score > best) { best = score; store.set('memoryBest', String(best)); }
  updateHud();
}

function gameOver() {
  state = 'over';
  open = [];
  for (const c of cards) if (!c.gone) c.up = true;     // 남은 카드는 정답 공개
  sfx.end();
  const isBest = score >= best && score > 0;
  setTimeout(() => showOverlay(`
    <h2 class="inked">시간 끝!</h2>
    <div class="big inked">${score.toLocaleString()}</div>
    <span class="tag">${isBest ? '🏆 최고 기록!' : `최고 기록 ${best.toLocaleString()}`}</span>
    <div class="card"><dl class="stats">
      <dt>도달한 라운드</dt><dd>${round}라운드</dd>
      <dt>찾은 짝</dt><dd>${pairsFound}쌍</dd>
      <dt>정확도</dt><dd>${tries ? Math.round((pairsFound / tries) * 100) + '%' : '-'}</dd>
      <dt>최대 콤보</dt><dd>${maxCombo}</dd>
    </dl></div>
    <button id="startBtn">한 번 더</button>`), 900);
}

function update(dt) {
  clock += dt;
  for (const p of particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 500 * dt; }
  particles = particles.filter((p) => p.life > 0);
  for (const t of texts) { t.t += dt; t.y -= 30 * dt; }
  texts = texts.filter((t) => t.t < 0.9);
  if (banner) { banner.t += dt; if (banner.t > 1.3) banner = null; }
  // 카드 뒤집기 애니메이션
  for (const c of cards) {
    const target = c.up ? 1 : 0;
    c.flip += Math.sign(target - c.flip) * Math.min(Math.abs(target - c.flip), dt / FLIP_T);
    if (c.pop) c.pop += dt;
    c.shake = Math.max(0, c.shake - dt);
  }
  if (state !== 'play') return;

  if (phase === 'preview') {
    phaseT -= dt;
    if (phaseT <= 0) hideAll();
    return;                      // 미리 보는 동안은 시간이 안 흐른다
  }
  if (phase === 'clear') {
    phaseT -= dt;
    if (phaseT <= 0) { round++; layout(); }
    return;
  }
  if (open.length === 2) {
    judgeT += dt;
    if (judgeT >= SHOW_PAIR) resolve();
  }
  const prev = Math.ceil(time);
  time = Math.max(0, time - dt);
  if (time < 10 && Math.ceil(time) < prev && time > 0) sfx.tick();
  if (clock - lastMatch > COMBO_WINDOW) combo = 0;
  if (time <= 0) gameOver();
}

// ---------- 그리기 ----------
function label(text, x, y, size, fill = '#fff', align = 'center') {
  ctx.font = `${size}px ${FONT}`;
  ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, size * 0.22); ctx.strokeStyle = INK; ctx.strokeText(text, x, y);
  ctx.fillStyle = fill; ctx.fillText(text, x, y);
}
function panel(x, y, w, h, r, fill, lift = 4) {
  ctx.fillStyle = INK; roundRect(ctx, x, y + lift, w, h, r); ctx.fill();
  ctx.fillStyle = fill; roundRect(ctx, x, y, w, h, r); ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = INK; roundRect(ctx, x, y, w, h, r); ctx.stroke();
}

function drawCard(c) {
  if (c.pop > 0.35) return;
  const k = c.pop ? c.pop / 0.35 : 0;
  // 뒤집기: 가로로 납작해졌다가 반대 면으로 펼쳐진다
  const sx = Math.max(0.04, Math.abs(Math.cos(Math.PI * (1 - c.flip))));
  const front = c.flip > 0.5;
  const shake = c.shake > 0 ? Math.sin(c.shake * 70) * 5 : 0;
  ctx.save();
  ctx.globalAlpha = 1 - k;
  ctx.translate(c.x + c.w / 2 + shake, c.y + c.h / 2);
  ctx.scale(sx * (1 + k * 0.3), 1 + k * 0.3);
  const x = -c.w / 2, y = -c.h / 2, w = c.w, h = c.h - 5;
  ctx.fillStyle = INK; roundRect(ctx, x, y + 5, w, h, 14); ctx.fill();
  if (front) {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#fffdf6'); g.addColorStop(1, '#fbeed2');
    ctx.fillStyle = g; roundRect(ctx, x, y, w, h, 14); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    ctx.font = `${Math.min(w, h) * 0.52}px ${EMOJI}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#000';
    ctx.fillText(c.e, 0, 2);
  } else {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#ff9ecb'); g.addColorStop(1, '#ff5fa2');
    ctx.fillStyle = g; roundRect(ctx, x, y, w, h, 14); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    // 뒷면 무늬: 안쪽 흰 점선 테두리 + 물음표
    ctx.setLineDash([5, 5]); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,.7)';
    roundRect(ctx, x + 7, y + 7, w - 14, h - 14, 9); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,255,255,.45)'; roundRect(ctx, x + 10, y + 9, w - 34, 6, 3); ctx.fill();
    label('?', 0, 2, Math.min(w, h) * 0.42, '#fff');
  }
  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, W, H);

  // 시간 막대 (미리 보기 중에는 멈춰 있다)
  panel(6, 10, W - 12, 28, 14, '#ffffff', 4);
  const tr = Math.min(1, time / START_TIME), low = time < 10;
  const g = ctx.createLinearGradient(0, 13, 0, 35);
  g.addColorStop(0, low ? '#ff8a8a' : '#7dffb0'); g.addColorStop(1, low ? '#ff3b5c' : '#1fc46b');
  ctx.fillStyle = g; roundRect(ctx, 9, 13, Math.max(18, (W - 18) * tr), 22, 11); ctx.fill();
  ctx.font = `17px ${EMOJI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#000'; ctx.fillText('⏰', 23, 24);
  label(`${Math.ceil(time)}`, W - 26, 24, 17, low && Math.sin(clock * 12) > 0 ? '#ff3b5c' : '#fff');

  const previewing = state === 'play' && phase === 'preview';
  if (!previewing) {
    label(`${round}라운드`, 10, 62, 18, '#ffd23f', 'left');
    label(`남은 짝 ${cards.filter((c) => !c.gone).length / 2}`, W - 10, 62, 16, '#fff', 'right');
    if (combo >= 2) label(`${combo} 콤보`, W / 2, 62, 18, '#ff9ecb');
  }

  for (const c of cards) drawCard(c);

  // 미리 보기: 라운드 줄 자리에 남은 시간 막대 + 안내 (카드를 가리지 않게)
  if (previewing) {
    const k = phaseT / spec.preview;
    panel(W / 2 - 120, 48, 240, 28, 14, '#ffd23f', 3);
    ctx.fillStyle = 'rgba(255,255,255,.7)'; roundRect(ctx, W / 2 - 116, 52, 232 * k, 20, 10); ctx.fill();
    label(`👀 ${round}라운드 · 외우세요!`, W / 2, 62, 17, '#fff');
  }

  for (const p of particles) {
    ctx.globalAlpha = Math.min(1, p.life * 3);
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(p.x, p.y + 1, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const t of texts) {
    ctx.globalAlpha = Math.min(1, (0.9 - t.t) * 3);
    label(t.text, t.x, t.y, t.big ? 26 : 20, t.bad ? '#ff5a6e' : t.big ? '#ffd23f' : '#fff');
  }
  ctx.globalAlpha = 1;
  if (banner && state === 'play') {
    const s = 1 + Math.max(0, 0.25 - banner.t) * 1.6;
    ctx.save(); ctx.globalAlpha = Math.min(1, (1.3 - banner.t) * 3);
    ctx.translate(W / 2, (TOP + BOTTOM) / 2); ctx.scale(s, s);
    label(banner.text, 0, banner.sub ? -18 : 0, banner.small ? 30 : 46, '#ffd23f');
    if (banner.sub) label(banner.sub, 0, 30, 22, '#fff');
    ctx.restore();
  }
}

function updateHud() {
  $('score').textContent = score.toLocaleString();
  $('best').textContent = best.toLocaleString();
}

// ---------- 루프 ----------
let last = performance.now();
function frame(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  if (state !== 'paused') update(dt);
  draw();
  requestAnimationFrame(frame);
}

// ---------- 오버레이 ----------
function showOverlay(html) {
  const o = $('overlay'); o.innerHTML = html; o.classList.remove('hidden');
  const b = $('startBtn'); if (b) b.onclick = onOverlayButton;
}
function hideOverlay() { $('overlay').classList.add('hidden'); }
function onOverlayButton() { state === 'paused' ? resume() : startGame(); }
function pause() {
  if (state !== 'play') return;
  state = 'paused';
  showOverlay(`<h2 class="inked">일시정지</h2><button id="startBtn">계속하기</button>`);
}
function resume() { if (state !== 'paused') return; state = 'play'; hideOverlay(); }

// ---------- 입력 ----------
// 누르는 순간 바로 뒤집는다 (떼기를 기다리지 않아서 아이폰에서 탭이 씹히지 않는다)
canvas.addEventListener('pointerdown', (e) => {
  if (state !== 'play') return;
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (W / rect.width), y = (e.clientY - rect.top) * (H / rect.height);
  if (phase === 'preview') { hideAll(); return; }
  const i = cards.findIndex((c) => !c.gone && x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h);
  if (i >= 0) tapCard(i);
});
canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });

addEventListener('keydown', (e) => {
  if (e.code === 'KeyP' || e.code === 'Escape') state === 'paused' ? resume() : pause();
  if (e.code === 'KeyM') toggleMute();
  if ((e.code === 'Enter' || e.code === 'Space') && !$('overlay').classList.contains('hidden')) { e.preventDefault(); onOverlayButton(); }
  else if (e.code === 'Space' && state === 'play' && phase === 'preview') { e.preventDefault(); hideAll(); }
});
addEventListener('blur', pause);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

function toggleMute() {
  muted = !muted;
  store.set('memoryMuted', muted ? '1' : '0');
  $('muteBtn').textContent = muted ? '🔇' : '🔊';
}
$('muteBtn').onclick = (e) => { e.currentTarget.blur(); toggleMute(); };
$('pauseBtn').onclick = (e) => { e.currentTarget.blur(); state === 'paused' ? resume() : pause(); };
$('startBtn').onclick = onOverlayButton;
$('muteBtn').textContent = muted ? '🔇' : '🔊';

layout();
updateHud();
fit();
requestAnimationFrame(frame);

// 테스트용
window.__mem = { get cards() { return cards; }, get state() { return state; }, get phase() { return phase; }, get round() { return round; },
  get score() { return score; }, get time() { return time; }, get open() { return open; }, tapCard, update, draw, startGame, W, H };
})();
