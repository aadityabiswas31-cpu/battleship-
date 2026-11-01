/* ==========================================================================
   BATTLESHIP — 2D ARCADE NAVAL COMBAT (Two Players, One Device)
   - Visuals from reference images: Custom 2D SVG ships, cyan bodies, navy outlines,
     curved rotation arrows, 2D cannon turret aiming/recoil, diamond fire sparks,
     soft thick "✕" miss marks, Fredoka arcade typography, cartoon 3D buttons.
   - Complete game structure, controls, and rules preserved:
     Side-by-side locked boards (Left = P1, Right = P2), targeting highlight,
     placement side-panel controls (Rotate, Random, Reset, Continue),
     action bar (aim lock + FIRE button), stats, cloaked fleet privacy.
   ========================================================================== */

(() => {
'use strict';

/* ---------- Rules / Pure Logic ---------- */
const COLS_COUNT = 7, ROWS_COUNT = 9;
const TOTAL_CELLS = COLS_COUNT * ROWS_COUNT;
const COLS = 'ABCDEFG';

// Classic 5-Warship Fleet matching references
const SHIPS = [
  { name: 'Carrier', size: 5 },
  { name: 'Battleship', size: 4 },
  { name: 'Cruiser', size: 3 },
  { name: 'Submarine', size: 3 },
  { name: 'Patrol Boat', size: 2 },
];

const coord = i => COLS[i % COLS_COUNT] + (Math.floor(i / COLS_COUNT) + 1);
const validCell = i => Number.isInteger(i) && i >= 0 && i < TOTAL_CELLS;

function shipCells(start, size, horizontal) {
  if (!validCell(start)) return null;
  const r = Math.floor(start / COLS_COUNT), c = start % COLS_COUNT;
  if (horizontal ? c + size > COLS_COUNT : r + size > ROWS_COUNT) return null;
  return Array.from({ length: size }, (_, k) => start + (horizontal ? k : k * COLS_COUNT));
}

function placementStatus(ships, size, start, horizontal) {
  const cells = shipCells(start, size, horizontal);
  if (!cells) return { ok: false, reason: 'That ship would extend past the edge of the board.' };
  if (cells.some(c => ships.some(s => s.cells.includes(c)))) {
    return { ok: false, reason: 'That ship would overlap another ship.' };
  }
  return { ok: true, cells };
}

const isSunk = (ship, shots) => ship.cells.every(c => shots[c] === 'hit');

function resolveAttack(fleet, shots, cell) {
  if (!validCell(cell)) return { ok: false, reason: 'That is not a square on the board.' };
  if (shots[cell]) return { ok: false, reason: 'You already fired at that square.' };
  const ship = fleet.find(s => s.cells.includes(cell));
  shots[cell] = ship ? 'hit' : 'miss';
  return {
    ok: true,
    hit: !!ship,
    ship: ship || null,
    sunk: !!ship && isSunk(ship, shots),
    allSunk: fleet.every(s => isSunk(s, shots))
  };
}

function randomFleet() {
  const ships = [];
  for (const def of SHIPS) {
    for (let attempt = 0; attempt < 500; attempt++) {
      const st = placementStatus(ships, def.size, Math.floor(Math.random() * TOTAL_CELLS), Math.random() < 0.5);
      if (st.ok) {
        ships.push({ name: def.name, size: def.size, cells: st.cells });
        break;
      }
    }
  }
  return ships;
}

/* ---------- WebAudio (Synthesized Arcade Audio) ---------- */
let muted = false, ac = null;
function ctx() {
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
    return ac;
  } catch (e) {
    return null;
  }
}

function tone(f, dur, type = 'sine', vol = 0.12, delay = 0, slide = 0) {
  const a = !muted && ctx();
  if (!a) return;
  const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur);
}

function noise(dur, vol, freq, delay = 0) {
  const a = !muted && ctx();
  if (!a) return;
  const buf = a.createBuffer(1, a.sampleRate * dur, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(), t = a.currentTime + delay;
  s.buffer = buf;
  f.type = 'lowpass';
  f.frequency.value = freq;
  g.gain.setValueAtTime(vol, t);
  s.connect(f).connect(g).connect(a.destination);
  s.start(t);
}

const sfx = {
  place: () => tone(540, 0.08, 'triangle', 0.12),
  aim: () => tone(750, 0.04, 'square', 0.04),
  fire: () => { tone(280, 0.22, 'sawtooth', 0.15, 0, -220); noise(0.2, 0.2, 400); },
  miss: () => noise(0.4, 0.18, 1600, 0.05),
  hit: () => { noise(0.5, 0.35, 600, 0.05); tone(110, 0.45, 'sawtooth', 0.18, 0.05, -50); },
  sunk: () => { sfx.hit(); [440, 330, 220, 160].forEach((f, k) => tone(f, 0.25, 'triangle', 0.15, 0.35 + k * 0.15)); },
  win: () => [523, 659, 784, 1047].forEach((f, k) => tone(f, 0.3, 'triangle', 0.18, k * 0.15)),
  ready: () => tone(660, 0.1, 'triangle', 0.1),
};

const buzz = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };

/* ---------- Custom 2D SVG Ship Artwork ---------- */
function getShipSvgString(name, isSunk = false, isCoral = false, isVertical = false) {
  const fill = isSunk ? '#222930' : isCoral ? '#E65A46' : '#05B8DB';
  const stroke = isSunk ? '#11151A' : isCoral ? '#3D0F0A' : '#003B4B';
  const detailColor = isSunk ? '#11151A' : isCoral ? '#3D0F0A' : '#003B4B';
  const highlight = isSunk ? '#2D353F' : isCoral ? '#FF8170' : '#4DE2FD';

  let size = 3;
  let body = '';

  switch (name) {
    case 'Carrier': {
      size = 5;
      body = `
        <path d="M 12 12 Q 4 20 12 28 L 130 28 L 155 35 L 192 35 Q 198 35 198 28 L 198 12 Q 198 5 192 5 L 80 5 L 60 12 Z" 
              fill="${fill}" stroke="${stroke}" stroke-width="3" stroke-linejoin="round" />
        <path d="M 16 14 L 62 14 L 80 7 L 190 7" fill="none" stroke="${highlight}" stroke-width="2" opacity="0.6"/>
        <path d="M 152 24 L 160 21 L 162 25 L 158 27 Z" fill="${detailColor}"/>
        <path d="M 166 24 L 174 21 L 176 25 L 172 27 Z" fill="${detailColor}"/>
        <path d="M 180 24 L 188 21 L 190 25 L 186 27 Z" fill="${detailColor}"/>
        <line x1="95" y1="16" x2="135" y2="16" stroke="${detailColor}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="95" y1="20" x2="135" y2="20" stroke="${detailColor}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="95" y1="24" x2="135" y2="24" stroke="${detailColor}" stroke-width="2.5" stroke-linecap="round"/>
      `;
      break;
    }
    case 'Battleship': {
      size = 4;
      body = `
        <path d="M 8 20 Q 24 6 50 6 L 145 6 Q 155 6 155 20 Q 155 34 145 34 L 50 34 Q 24 34 8 20 Z" 
              fill="${fill}" stroke="${stroke}" stroke-width="3" stroke-linejoin="round"/>
        <circle cx="45" cy="20" r="5" fill="${detailColor}"/>
        <circle cx="45" cy="20" r="2.5" fill="${fill}"/>
        <line x1="75" y1="13" x2="75" y2="27" stroke="${detailColor}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="83" y1="13" x2="83" y2="27" stroke="${detailColor}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="91" y1="13" x2="91" y2="27" stroke="${detailColor}" stroke-width="2.5" stroke-linecap="round"/>
        <circle cx="120" cy="20" r="4.5" fill="${detailColor}"/>
      `;
      break;
    }
    case 'Cruiser': {
      size = 3;
      body = `
        <path d="M 10 20 Q 22 7 45 7 L 105 7 Q 115 7 115 20 Q 115 33 105 33 L 45 33 Q 22 33 10 20 Z" 
              fill="${fill}" stroke="${stroke}" stroke-width="3" stroke-linejoin="round"/>
        <circle cx="36" cy="20" r="4" fill="${detailColor}"/>
        <line x1="60" y1="14" x2="60" y2="26" stroke="${detailColor}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="68" y1="14" x2="68" y2="26" stroke="${detailColor}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="76" y1="14" x2="76" y2="26" stroke="${detailColor}" stroke-width="2.5" stroke-linecap="round"/>
      `;
      break;
    }
    case 'Submarine': {
      size = 3;
      body = `
        <path d="M 12 20 Q 12 9 28 9 L 32 9 L 32 4 Q 32 2 34 2 L 40 2 Q 42 2 42 4 L 42 9 L 95 9 L 95 3 Q 95 1 97 1 L 104 1 Q 106 1 106 3 L 106 9 Q 114 9 114 20 Q 114 31 106 31 L 106 37 Q 106 39 104 39 L 97 39 Q 95 39 95 37 L 95 31 L 42 31 L 42 36 Q 42 38 40 38 L 34 38 Q 32 38 32 36 L 32 31 L 28 31 Q 12 31 12 20 Z" 
              fill="${fill}" stroke="${stroke}" stroke-width="3" stroke-linejoin="round"/>
        <rect x="52" y="14" width="22" height="12" rx="6" fill="${detailColor}"/>
        <line x1="58" y1="17" x2="58" y2="23" stroke="${fill}" stroke-width="2" stroke-linecap="round"/>
        <line x1="63" y1="17" x2="63" y2="23" stroke="${fill}" stroke-width="2" stroke-linecap="round"/>
        <line x1="68" y1="17" x2="68" y2="23" stroke="${fill}" stroke-width="2" stroke-linecap="round"/>
      `;
      break;
    }
    case 'Patrol Boat': {
      size = 2;
      body = `
        <path d="M 8 20 Q 8 8 20 8 L 65 8 Q 74 8 74 20 Q 74 32 65 32 L 20 32 Q 8 32 8 20 Z" 
              fill="${fill}" stroke="${stroke}" stroke-width="3" stroke-linejoin="round"/>
        <circle cx="22" cy="15" r="3.5" fill="${detailColor}"/>
        <circle cx="22" cy="25" r="3.5" fill="${detailColor}"/>
        <line x1="42" y1="13" x2="42" y2="27" stroke="${detailColor}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="50" y1="13" x2="50" y2="27" stroke="${detailColor}" stroke-width="2.5" stroke-linecap="round"/>
      `;
      break;
    }
    default:
      return '';
  }

  const length = size * 40;
  if (isVertical) {
    return `<svg viewBox="0 0 40 ${length}" class="ship-svg vertical" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;">
      <g transform="rotate(90) translate(0, -40)">
        ${body}
      </g>
    </svg>`;
  }

  return `<svg viewBox="0 0 ${length} 40" class="ship-svg horizontal" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;">
    ${body}
  </svg>`;
}

// Curved Rotation Arrow SVG
function getRotationArrowSvg() {
  return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#000000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <path d="M 21.5 2 v 6 h -6"/>
    <path d="M 21.34 15.57 A 10 10 0 1 1 19.46 7.07 L 21.5 2"/>
  </svg>`;
}

/* ---------- State ---------- */
const S = { MENU: 'MAIN_MENU', PLACE: 'PLACEMENT', PRIVACY: 'PRIVACY_HANDOFF', TURN: 'TURN', OVER: 'GAME_OVER' };
const MISS_DELAY_MS = 1000;
let missDelayTimer = null;
let pendingMissTransition = null;

function clearMissDelay() {
  if (missDelayTimer) {
    clearTimeout(missDelayTimer);
    missDelayTimer = null;
  }
  pendingMissTransition = null;
}

function flushMissTransition() {
  if (pendingMissTransition) {
    const fn = pendingMissTransition;
    clearMissDelay();
    fn();
  }
}

/* Player-Turn HUD Notification */
const TURN_NOTIFICATION_MS = 1000;
let turnNotificationTimer = null;

function clearTurnNotification() {
  if (turnNotificationTimer) {
    clearTimeout(turnNotificationTimer);
    turnNotificationTimer = null;
  }
}

function showTurnNotification(player) {
  clearTurnNotification();
  state.turnNotification = player;
  turnNotificationTimer = setTimeout(() => {
    turnNotificationTimer = null;
    if (state && state.turnNotification === player) {
      state.turnNotification = null;
      render();
    }
  }, TURN_NOTIFICATION_MS);
}

let state = freshState();

function freshState() {
  clearMissDelay();
  clearTurnNotification();
  return {
    screen: S.MENU,
    player: 0,
    fleets: [null, null],
    draft: { ships: [], selected: 0, horizontal: true },
    shots: [Array(TOTAL_CELLS).fill(null), Array(TOTAL_CELLS).fill(null)],
    stats: [{ hits: 0, misses: 0 }, { hits: 0, misses: 0 }],
    next: null,
    privacy: null,
    turnDone: false,
    transitioning: false,
    target: null,
    last: null,
    msg: '',
    msgKind: '',
    fx: null,
    sideMessage: null,
    turnNotification: null,
    confirmExit: false,
    confirmRestart: false,
    winner: null,
    lastPlayerTurn: null,
  };
}

const name = p => `Player ${p + 1}`;
const firstFree = () => SHIPS.findIndex(s => !state.draft.ships.some(d => d.name === s.name));
const resetDraft = () => { state.draft = { ships: [], selected: 0, horizontal: true }; state.msg = ''; };

/* ---------- Actions ---------- */
function startGame() {
  state = freshState();
  state.screen = S.PLACE;
  sfx.ready();
  render();
}

function goPrivacy(next, text, button) {
  clearMissDelay();
  clearTurnNotification();
  resetDraft();
  state.confirmRestart = false;
  state.confirmExit = false;
  state.target = null;
  state.fx = null;
  state.sideMessage = null;
  state.turnNotification = null;
  state.lastPlayerTurn = null;
  state.transitioning = false;
  state.next = next;
  state.privacy = { text, button };
  state.screen = S.PRIVACY;
  render();
}

function finishPlacement() {
  const p = state.player;
  if (state.screen !== S.PLACE || state.draft.ships.length !== SHIPS.length) return;
  state.fleets[p] = state.draft.ships;
  if (p === 0) {
    goPrivacy(
      { screen: S.PLACE, player: 1 },
      `Player 1 has finished setup. Please pass the device to Player 2.`,
      `Player 2 Ready`
    );
  } else {
    goPrivacy(
      { screen: S.TURN, player: 0 },
      `Player 2 has finished setup. Please pass the device to Player 1.`,
      `Player 1 Ready`
    );
  }
}

function confirmReady() {
  clearMissDelay();
  clearTurnNotification();
  if (state.sideMessage) {
    state.sideMessage = null;
    sfx.ready();
    render();
    return;
  }
  if (state.screen !== S.PRIVACY || !state.next) return;
  state.screen = state.next.screen;
  state.player = state.next.player;
  state.next = null;
  state.privacy = null;
  state.turnDone = false;
  state.transitioning = false;
  state.target = null;
  state.sideMessage = null;
  state.msg = '';
  state.msgKind = '';
  state.fx = null;

  if (state.screen === S.TURN) {
    showTurnNotification(state.player);
  }

  const l = state.last;
  if (state.screen === S.TURN && l && l.by !== state.player) {
    state.fx = { kind: l.sunk ? 'in-sunk' : l.hit ? 'in-hit' : 'in-miss', ship: l.ship, cell: l.cell, by: l.by };
    (l.hit ? (l.sunk ? sfx.sunk : sfx.hit) : sfx.miss)();
    if (l.hit) buzz(200);
  } else {
    sfx.ready();
  }
  render();
}

function selectTarget(i) {
  if (state.screen !== S.TURN || state.turnDone) return;
  if (state.transitioning) {
    flushMissTransition();
    return;
  }
  if (state.shots[1 - state.player][i]) return;
  state.sideMessage = null;
  state.target = i;
  const barrel = document.getElementById('cannon-barrel');
  if (barrel) {
    barrel.classList.add('firing');
    setTimeout(() => barrel.classList.remove('firing'), 300);
  }
  attack(i);
}

function attack(cell) {
  const p = state.player, d = 1 - p;
  if (state.screen !== S.TURN || state.turnDone || state.transitioning) return;
  const res = resolveAttack(state.fleets[d], state.shots[d], cell);
  if (!res.ok) {
    state.msg = res.reason;
    state.msgKind = '';
    render();
    return;
  }

  state.stats[p][res.hit ? 'hits' : 'misses']++;
  state.target = null;
  state.last = { by: p, cell, hit: res.hit, ship: res.ship && res.ship.name, sunk: res.sunk };
  const kind = res.sunk ? 'sunk' : res.hit ? 'hit' : 'miss';
  state.msg = `${coord(cell)}: ` + (res.sunk ? `Hit! You sank their ${res.ship.name}!` : res.hit ? `Hit! You struck a ship!` : `Miss — only open ocean.`);
  state.msgKind = kind;
  state.fx = { kind, ship: res.ship && res.ship.name, cell };

  sfx.fire();
  (res.hit ? (res.sunk ? sfx.sunk : sfx.hit) : sfx.miss)();
  if (res.hit) buzz(120);

  if (res.allSunk) {
    clearTurnNotification();
    state.winner = p;
    state.screen = S.OVER;
    setTimeout(sfx.win, 700);
    render();
  } else if (res.hit) {
    state.turnDone = false;
    state.transitioning = false;
    state.sideMessage = null;
    showTurnNotification(p);
    render();
  } else {
    state.turnDone = true;
    state.transitioning = true;
    state.sideMessage = null;
    state.target = null;
    render();

    clearMissDelay();
    pendingMissTransition = () => {
      pendingMissTransition = null;
      missDelayTimer = null;
      if (state.screen !== S.TURN) return;
      state.turnDone = false;
      state.transitioning = false;
      state.player = d;
      state.target = null;
      state.fx = null;
      state.sideMessage = null;
      showTurnNotification(d);
      sfx.ready();
      render();
    };
    missDelayTimer = setTimeout(pendingMissTransition, MISS_DELAY_MS);
  }
}

/* Rotate a placed ship in place or shift within bounds */
function rotatePlacedShip(s) {
  const d = state.draft;
  const otherShips = d.ships.filter(x => x.name !== s.name);
  const isHoriz = s.cells.length > 1 && (s.cells[1] - s.cells[0] === 1);
  const newHoriz = !isHoriz;
  const start = s.cells[0];

  // Try rotating directly at current start
  let st = placementStatus(otherShips, s.size, start, newHoriz);

  // If extends past edge, attempt to shift within valid bounds
  if (!st.ok) {
    const r = Math.floor(start / COLS_COUNT), c = start % COLS_COUNT;
    if (newHoriz && c + s.size > COLS_COUNT) {
      const shifted = r * COLS_COUNT + (COLS_COUNT - s.size);
      const test = placementStatus(otherShips, s.size, shifted, newHoriz);
      if (test.ok) st = test;
    } else if (!newHoriz && r + s.size > ROWS_COUNT) {
      const shifted = (ROWS_COUNT - s.size) * COLS_COUNT + c;
      const test = placementStatus(otherShips, s.size, shifted, newHoriz);
      if (test.ok) st = test;
    }
  }

  if (st.ok) {
    s.cells = st.cells;
    sfx.place();
    state.msg = `${s.name} rotated.`;
    render();
  } else {
    state.msg = `Cannot rotate ${s.name}: ${st.reason}`;
    render();
  }
}

function placeAt(i) {
  const d = state.draft;
  if (state.screen !== S.PLACE) return;
  if (d.selected == null) {
    const s = d.ships.find(s => s.cells.includes(i));
    if (s) {
      const sIndex = SHIPS.findIndex(x => x.name === s.name);
      d.selected = sIndex;
      state.msg = `${s.name} selected. Tap rotation arrow or press R to rotate.`;
      render();
    }
    return;
  }

  // If currently selected ship is already placed, check if clicking another placed ship
  const existingPlaced = d.ships.find(s => s.name === SHIPS[d.selected].name);
  if (existingPlaced) {
    const otherClicked = d.ships.find(s => s.cells.includes(i));
    if (otherClicked) {
      d.selected = SHIPS.findIndex(x => x.name === otherClicked.name);
      state.msg = `${otherClicked.name} selected.`;
      render();
      return;
    }
    // If clicking an empty square, move this placed ship to the clicked square
    const otherShips = d.ships.filter(s => s !== existingPlaced);
    const isHoriz = existingPlaced.cells.length > 1 && (existingPlaced.cells[1] - existingPlaced.cells[0] === 1);
    const st = placementStatus(otherShips, existingPlaced.size, i, isHoriz);
    if (!st.ok) {
      state.msg = st.reason;
      render();
      return;
    }
    existingPlaced.cells = st.cells;
    sfx.place();
    state.msg = `${existingPlaced.name} moved.`;
    render();
    return;
  }

  const def = SHIPS[d.selected], st = placementStatus(d.ships, def.size, i, d.horizontal);
  if (!st.ok) {
    state.msg = st.reason;
    render();
    return;
  }

  d.ships.push({ name: def.name, size: def.size, cells: st.cells });
  d.selected = firstFree() < 0 ? null : firstFree();
  sfx.place();
  state.msg = `${def.name} placed.` + (d.selected == null ? ' Fleet complete — press Continue.' : '');
  render();
}

function selectShip(idx) {
  const d = state.draft, def = SHIPS[idx];
  d.selected = idx;
  const isPlaced = d.ships.some(s => s.name === def.name);
  state.msg = isPlaced ? `${def.name} selected. Tap rotate or press R.` : `${def.name} selected. Click a square to place it.`;
  render();
}

/* ---------- DOM Helpers ---------- */
function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid != null && kid !== false) n.append(kid);
  }
  return n;
}

const badge = (p, xl) => el('div', { class: 'badge' + (xl ? ' xl' : ''), 'aria-hidden': 'true', text: `P${p + 1}` });

/* Exit Confirmation Modal */
function exitModal() {
  return el('div', { class: 'confirm-modal-overlay' },
    el('div', { class: 'confirm', role: 'alertdialog', 'aria-label': 'Exit game' },
      el('h2', { text: 'Exit Match?' }),
      el('p', { text: 'Return to main menu? Current match progress will be lost.' }),
      el('div', { class: 'row', style: 'display:flex;justify-content:center;gap:12px;margin-top:16px;' },
        el('button', { class: 'btn sm danger', id: 'exit-confirm', onclick: () => { state = freshState(); render(); }, text: 'EXIT' }),
        el('button', { class: 'btn sm primary', id: 'exit-cancel', onclick: () => { state.confirmExit = false; render(); }, text: 'RESUME' })
      )
    )
  );
}

/* Semicircular White EXIT Tab (Compatibility helper, real button lives in top bar) */
function exitTab() {
  return el('button', {
    class: 'exit-tab exit-btn',
    id: 'exit-tab-inline',
    type: 'button',
    'aria-label': 'Exit match',
    onclick: () => { state.confirmExit = true; render(); }
  }, el('span', { text: 'EXIT' }));
}

/* Grid Builder */
function grid(id, label, info, onCell, disabledFn) {
  const isCoral = (id === 'place' && state.player === 1) || (id === 'fleet' && state.player === 1) || (id === 'attack' && state.player === 0);
  const isDefenseGrid = (id === 'fleet');
  const g = el('div', {
    class: 'grid' + (isCoral ? ' coral-ocean' : '') + (isDefenseGrid ? ' defense-grid' : ''),
    role: 'group',
    'aria-label': label,
    'data-grid': id
  });

  for (let r = 0; r < ROWS_COUNT; r++) {
    for (let c = 0; c < COLS_COUNT; c++) {
      const i = r * COLS_COUNT + c, f = info(i), aria = `${coord(i)}: ${f.aria}`;
      const cellProps = {
        class: 'cell ' + (f.cls || ''),
        'data-idx': String(i),
        'aria-label': aria,
      };

      if (onCell) {
        cellProps.type = 'button';
        cellProps.disabled = disabledFn ? disabledFn(i) : false;
        cellProps.onclick = () => onCell(i);
        g.append(el('button', cellProps, f.text || ''));
      } else {
        cellProps.role = 'img';
        g.append(el('span', cellProps, f.text || ''));
      }
    }
  }

  return el('div', { class: 'board' }, g);
}

/* Sleek Horizontal Fleet Status Tracker */
function healthList(ships, shots, own) {
  return el('div', { class: 'fleet-tracker', 'aria-label': own ? 'Defense fleet status' : 'Target fleet status' },
    ships.map(s => {
      const hitsCount = s.cells.filter(c => shots[c] === 'hit').length;
      const sk = isSunk(s, shots), dmg = own && hitsCount > 0;
      const code = s.name.slice(0, 3).toUpperCase();
      return el('div', {
        class: 'fleet-pip' + (sk ? ' is-sunk' : dmg ? ' damaged' : ''),
        title: `${s.name} (${s.size}): ${sk ? 'Sunk' : dmg ? `${hitsCount}/${s.size} Hit` : 'Afloat'}`
      },
        el('span', { class: 'pip-text', text: code }),
        el('span', { class: 'pip-hull', text: sk ? '✕' : `${s.size}` })
      );
    })
  );
}

const FX = {
  hit: ['💥', 'DIRECT HIT!', 'Target hit at sector '],
  miss: ['💧', 'SPLASH — MISS', 'No vessel located at sector '],
  sunk: ['🔥', 'SHIP SUNK!', 'You destroyed their '],
  'in-hit': ['⚠️', 'YOUR SHIP WAS HIT!', ''],
  'in-sunk': ['💀', 'SHIP LOST!', ''],
  'in-miss': ['🌊', 'ENEMY MISSED', ''],
};

function callout(fx) {
  const [icon, title, sub0] = FX[fx.kind];
  let sub = sub0;
  if (fx.kind === 'sunk') sub += fx.ship + '!';
  else if (fx.kind === 'hit' || fx.kind === 'miss') sub += coord(fx.cell);
  else if (fx.kind === 'in-hit') sub = `${name(fx.by)} hit your ${fx.ship} at ${coord(fx.cell)}`;
  else if (fx.kind === 'in-sunk') sub = `${name(fx.by)} sank your ${fx.ship} at ${coord(fx.cell)}`;
  else if (fx.kind === 'in-miss') sub = `${name(fx.by)} fired at ${coord(fx.cell)} and missed`;

  return el('div', { class: 'callout ' + fx.kind, 'aria-hidden': 'true' },
    el('div', { class: 'callout-box' },
      el('span', { class: 'big-icon', text: icon }),
      el('b', { class: 'callout-title', text: title }),
      el('small', { class: 'callout-sub', text: sub })
    )
  );
}

/* "YOUR TURN" HUD Overlay */
function yourTurnOverlay(playerIndex) {
  const isP1 = playerIndex === 0;
  return el('div', {
    class: 'your-turn-hud ' + (isP1 ? 'p1-turn' : 'p2-turn'),
    id: 'your-turn-overlay',
    'data-player': String(playerIndex + 1),
    'data-grid': isP1 ? 'p1' : 'p2',
    'aria-live': 'polite',
    role: 'status'
  },
    el('span', { class: 'your-turn-icon', 'aria-hidden': 'true', text: isP1 ? '⚓' : '⚡' }),
    el('span', { class: 'your-turn-text', text: 'YOUR TURN' })
  );
}

/* ==========================================================================
   SCREENS
   ========================================================================== */

/* 1. Main Menu Screen */
function menuScreen() {
  return el('section', { class: 'screen menu-screen', 'aria-labelledby': 'ttl' },
    state.confirmExit && exitModal(),
    el('div', { class: 'menu-center-box' },
      el('span', { class: 'menu-ship-icon', 'aria-hidden': 'true', text: '🚢' }),
      el('h1', { id: 'ttl', tabindex: '-1', class: 'menu-title', text: 'BATTLESHIP' }),
      el('p', { class: 'menu-tagline', text: 'TWO PLAYERS • ONE DEVICE • 2D NAVAL COMBAT' }),
      el('button', { class: 'btn primary big glow', id: 'new-game', onclick: startGame, text: 'START MATCH' }),
      el('div', { class: 'menu-quick-rules' },
        el('span', { text: '⚓ Hidden Fleet Placement' }),
        el('span', { class: 'dot-sep', text: '•' }),
        el('span', { text: '💥 Direct Hit = Strike Again' }),
        el('span', { class: 'dot-sep', text: '•' }),
        el('span', { text: '💧 Miss = Pass Device' })
      )
    )
  );
}

/* 2. Privacy / Handover Screen */
function privacyScreen() {
  const n = state.next.player;

  return el('section', { class: 'screen privacy', 'aria-labelledby': 'ttl' },
    state.confirmExit && exitModal(),
    badge(n, true),
    el('h1', { id: 'ttl', tabindex: '-1', class: 'privacy-title', text: state.privacy.text }),
    el('p', { class: 'privacy-sub', text: `Boards are hidden. Everyone else, look away — only press the button when ${name(n)} is holding the device.` }),
    el('div', { class: 'privacy-card' },
      el('button', {
        class: 'btn primary big glow',
        id: 'ready',
        onclick: confirmReady,
        text: state.privacy.button
      })
    )
  );
}

/* 3. Ship Placement Screen */
function placementScreen() {
  const d = state.draft, p = state.player, done = d.ships.length === SHIPS.length;
  const isCoral = (p === 1);

  const info = i => {
    const s = d.ships.find(s => s.cells.includes(i));
    return s ? { cls: 'ship', aria: `${s.name} (placed)` } : { cls: '', aria: 'empty water' };
  };

  const board = grid('place', `${name(p)} placement grid`, info, placeAt);
  const g = board.querySelector('.grid');

  const cellElements = Array.from(g.querySelectorAll('.cell'));
  const clearPv = () => {
    cellElements.forEach(c => c.classList.remove('pv-ok', 'pv-bad'));
  };
  const preview = e => {
    clearPv();
    const b = e.target ? e.target.closest('.cell') : null;
    if (!b || d.selected == null) return;
    // Don't show placement ghost if the selected ship is already placed
    const isAlreadyPlaced = d.ships.some(s => s.name === SHIPS[d.selected].name);
    if (isAlreadyPlaced) return;

    const i = +b.dataset.idx, def = SHIPS[d.selected], st = placementStatus(d.ships, def.size, i, d.horizontal);
    const r = Math.floor(i / COLS_COUNT), c = i % COLS_COUNT;
    for (let k = 0; k < def.size; k++) {
      const rr = r + (d.horizontal ? 0 : k), cc = c + (d.horizontal ? k : 0);
      if (rr < ROWS_COUNT && cc < COLS_COUNT) {
        const targetCell = cellElements[rr * COLS_COUNT + cc];
        if (targetCell) targetCell.classList.add(st.ok ? 'pv-ok' : 'pv-bad');
      }
    }
    const hint = document.getElementById('hint');
    if (hint) {
      hint.textContent = st.ok ? `${def.name} at ${coord(i)} — click to place.` : st.reason;
      hint.className = 'hint' + (st.ok ? '' : ' bad');
    }
  };

  g.addEventListener('pointerover', preview);
  g.addEventListener('pointerdown', preview);
  g.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') {
      const elAt = document.elementFromPoint(e.clientX, e.clientY);
      const cell = elAt ? elAt.closest('.cell') : null;
      if (cell) preview({ target: cell });
    }
  });
  g.addEventListener('pointerleave', clearPv);

  // Overlay custom SVG artwork & single rotation control (Bug 4 fix: ONLY on currently selected ship)
  const shipsOverlay = el('div', {
    class: 'ships-placement-overlay',
    style: `position:absolute;inset:3px;display:grid;grid-template-columns:repeat(${COLS_COUNT},var(--cell));grid-template-rows:repeat(${ROWS_COUNT},var(--cell));gap:2px;pointer-events:none;z-index:10;`
  });

  d.ships.forEach(s => {
    const start = s.cells[0];
    const isHoriz = s.cells.length > 1 && (s.cells[1] - s.cells[0] === 1);
    const r = Math.floor(start / COLS_COUNT), c = start % COLS_COUNT;
    const isSelected = d.selected != null && SHIPS[d.selected].name === s.name;

    const shipBox = el('div', {
      class: 'placed-ship-box' + (isSelected ? ' selected' : ''),
      style: `grid-column:${c + 1}/span ${isHoriz ? s.size : 1};grid-row:${r + 1}/span ${isHoriz ? 1 : s.size};position:relative;display:flex;align-items:center;justify-content:center;pointer-events:auto;cursor:pointer;width:100%;height:100%;`
    });

    const svgWrap = el('div', {
      style: 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;',
      html: getShipSvgString(s.name, false, isCoral, !isHoriz)
    });
    shipBox.append(svgWrap);

    // Tap placed ship to select it
    shipBox.addEventListener('click', (e) => {
      e.stopPropagation();
      const sIndex = SHIPS.findIndex(def => def.name === s.name);
      selectShip(sIndex);
    });

    // Bug 4 Fix: ONLY the selected ship shows ONE rotation control, anchored INSIDE the ship bounds
    if (isSelected) {
      const singleRotateBtn = el('button', {
        type: 'button',
        class: 'single-rotate-btn rotation-arrow',
        'aria-label': 'Rotate ship',
        title: 'Rotate ship (R)',
        html: getRotationArrowSvg(),
        onclick: (e) => {
          e.stopPropagation();
          rotatePlacedShip(s);
        }
      });
      shipBox.append(singleRotateBtn);
    }

    shipsOverlay.append(shipBox);
  });

  g.append(shipsOverlay);

  const selectedPlaced = d.selected != null && d.ships.find(s => s.name === SHIPS[d.selected].name);
  const selectedHoriz = selectedPlaced
    ? (selectedPlaced.cells.length > 1 && selectedPlaced.cells[1] - selectedPlaced.cells[0] === 1)
    : d.horizontal;

  const hint = el('p', {
    class: 'hint' + (state.msg && /would|Cannot/.test(state.msg) ? ' bad' : ''),
    id: 'hint',
    'aria-live': 'polite',
    text: state.msg || (done ? 'Fleet complete — press Continue.' : `Place your ${SHIPS[d.selected].name} (${SHIPS[d.selected].size} squares). Tap grid to place.`)
  });

  return el('section', { class: 'screen place-screen' + (p === 1 ? ' p2-place' : ''), 'aria-labelledby': 'ttl' },
    state.confirmExit && exitModal(),
    el('div', { class: 'cols place-cols' },
      el('div', { class: 'grid-col place-grid-col' }, board),
      el('div', { class: 'side place-side' },
        el('div', { class: 'card compact-card' },
          el('ul', { class: 'ships compact-ships' }, SHIPS.map((s, idx) => {
            const placed = d.ships.some(x => x.name === s.name);
            return el('li', {},
              el('button', {
                type: 'button',
                class: 'ship-btn' + (placed ? ' placed' : '') + (d.selected === idx ? ' selected' : ''),
                'aria-pressed': d.selected === idx ? 'true' : 'false',
                onclick: () => selectShip(idx)
              },
                el('b', { text: `${s.name} (${s.size})` }),
                el('span', { style: 'width:36px;height:12px;display:inline-block;', html: getShipSvgString(s.name, false, isCoral) }),
                el('span', { class: 'note', text: placed ? '✔' : d.selected === idx ? '▶' : '' })
              )
            );
          }))
        ),
        el('div', { class: 'row compact-btn-row' },
          el('button', {
            class: 'btn sm action-blue',
            id: 'rotate',
            onclick: () => {
              if (selectedPlaced) {
                rotatePlacedShip(selectedPlaced);
              } else {
                d.horizontal = !d.horizontal;
                render();
              }
            },
            text: `Rotate: ${selectedHoriz ? 'Horiz ↔' : 'Vert ↕'} (R)`
          }),
          el('button', {
            class: 'btn sm action-blue',
            id: 'random',
            onclick: () => {
              d.ships = randomFleet();
              d.selected = null;
              sfx.place();
              state.msg = 'Random fleet placed. Press Continue.';
              render();
            },
            text: '🎲 Random'
          }),
          el('button', { class: 'btn sm danger', id: 'reset', onclick: () => { resetDraft(); render(); }, text: 'Reset' })
        ),
        hint,
        el('button', {
          class: 'btn primary big' + (done ? ' glow' : ''),
          id: 'continue',
          disabled: !done,
          onclick: finishPlacement,
          text: 'CONFIRM & CONTINUE'
        })
      )
    )
  );
}

/* 4. Battle Screen */
function battleScreen() {
  const p = state.player;
  const d = 1 - p;
  const enemyFleet = state.fleets[d];
  const myFleet = state.fleets[p];
  const enemyShots = state.shots[d];
  const myShots = state.shots[p];

  const sunkEnemy = enemyFleet.filter(s => isSunk(s, enemyShots));
  const sunkCells = new Set(sunkEnemy.flatMap(s => s.cells));

  // TARGET BOARD: Defender's waters (Unhit ships hidden)
  const attackInfo = i => {
    if (enemyShots[i] === 'hit') {
      return { cls: sunkCells.has(i) ? 'sunk hit' : 'hit', aria: `hit on ${name(d)} ship, vessel sunk` };
    }
    if (enemyShots[i] === 'miss') {
      return { cls: 'miss', aria: `miss on ${name(d)} waters` };
    }
    return i === state.target
      ? { cls: 'target', aria: `targeted sector on ${name(d)} waters` }
      : { cls: '', aria: `unscouted ${name(d)} waters` };
  };

  // DEFENSE BOARD: Friendly radar
  const mySunk = new Set(myFleet.filter(s => isSunk(s, myShots)).flatMap(s => s.cells));
  const fleetInfo = i => {
    const shot = myShots[i];
    if (shot === 'hit') {
      return { cls: mySunk.has(i) ? 'sunk hit' : 'hit', aria: `your vessel damaged at this sector` };
    }
    if (shot === 'miss') {
      return { cls: 'miss', aria: `${name(d)} missed here` };
    }
    return { cls: '', aria: 'open ocean' };
  };

  const fx = state.fx;
  state.fx = null;

  const aimBoard = grid(
    'attack',
    `${name(d)}'s fleet board (target grid)`,
    attackInfo,
    selectTarget,
    i => !!enemyShots[i]
  );

  // Sunk Ship Overlays for Target Board
  const sunkOverlay = el('div', {
    style: `position:absolute;inset:3px;display:grid;grid-template-columns:repeat(${COLS_COUNT},var(--cell));grid-template-rows:repeat(${ROWS_COUNT},var(--cell));gap:2px;pointer-events:none;z-index:8;`
  });

  sunkEnemy.forEach(s => {
    const start = s.cells[0];
    const isHoriz = s.cells.length > 1 && (s.cells[1] - s.cells[0] === 1);
    const r = Math.floor(start / COLS_COUNT), c = start % COLS_COUNT;
    const box = el('div', {
      class: 'sunk-ship-overlay',
      style: `grid-column:${c + 1}/span ${isHoriz ? s.size : 1};grid-row:${r + 1}/span ${isHoriz ? 1 : s.size};position:relative;width:100%;height:100%;`
    });
    box.append(el('div', {
      style: 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;',
      html: getShipSvgString(s.name, true, d === 1, !isHoriz)
    }));
    sunkOverlay.append(box);
  });
  aimBoard.querySelector('.grid').append(sunkOverlay);

  // 2D Cannon Turret
  const cannonTurret = el('div', {
    class: 'cannon-turret-wrap ' + (p === 1 ? 'p2-firing' : 'p1-firing'),
    id: 'cannon-turret',
    style: 'display:none;'
  },
    el('div', { class: 'cannon-base-ring' },
      el('div', { class: 'cannon-colored-ring' })
    ),
    el('div', { class: 'cannon-barrel', id: 'cannon-barrel' },
      el('div', { class: 'cannon-muzzle' })
    )
  );
  aimBoard.append(cannonTurret);

  const aimAtCell = (idx) => {
    const r = Math.floor(idx / COLS_COUNT), c = idx % COLS_COUNT;
    cannonTurret.style.display = 'flex';
    const centerR = (ROWS_COUNT - 1) / 2, centerC = (COLS_COUNT - 1) / 2;
    const angle = Math.atan2(r - centerR, c - centerC) * (180 / Math.PI) + 90;
    cannonTurret.style.transform = `rotate(${angle}deg)`;
  };

  if (state.target != null) {
    aimAtCell(state.target);
  }

  const handleAimPointer = (e) => {
    const cell = e.target ? e.target.closest('.cell') : null;
    if (!cell) return;
    aimAtCell(+cell.dataset.idx);
  };

  aimBoard.addEventListener('mouseover', handleAimPointer);
  aimBoard.addEventListener('pointerdown', handleAimPointer);
  aimBoard.addEventListener('mouseleave', () => {
    if (state.target != null) {
      aimAtCell(state.target);
    } else {
      cannonTurret.style.display = 'none';
    }
  });

  const isNewPlayerTurn = state.lastPlayerTurn !== p;
  state.lastPlayerTurn = p;
  if (isNewPlayerTurn && state.turnNotification !== p) {
    showTurnNotification(p);
  }

  // Player Column Builder
  const buildPlayerCol = k => {
    const isTarget = (k === d);
    const isTurnForThisPlayer = (state.turnNotification === k);
    if (isTarget) {
      if (isTurnForThisPlayer) {
        aimBoard.append(yourTurnOverlay(k));
      }
      return el('div', {
        class: 'grid-col target-col enemy-col is-targeted ' + (k === 0 ? 'p1-col top-grid' : 'p2-col bottom-grid'),
        id: k === 0 ? 'p1-board-container' : 'p2-board-container',
        'data-board': 'target',
        'data-target-player': String(k + 1),
        'data-attacking-player': String(p + 1),
        'aria-label': `${name(k)} target grid (active)`
      },
        el('div', { class: 'board-top-label target-label' },
          el('span', { class: 'grid-status-badge active', text: '🎯 TARGET' }),
          el('h2', { id: 'target-board-heading', text: `${name(k)}'s Fleet` })
        ),
        aimBoard,
        healthList(enemyFleet, enemyShots, false)
      );
    } else {
      const defBoard = grid('fleet', `${name(k)}'s defense radar`, fleetInfo, null);
      if (isTurnForThisPlayer) {
        defBoard.append(yourTurnOverlay(k));
      }
      return el('div', {
        class: 'grid-col defense-col friendly-col is-inactive ' + (k === 0 ? 'p1-col top-grid' : 'p2-col bottom-grid'),
        id: k === 0 ? 'p1-board-container' : 'p2-board-container',
        'data-board': 'defense',
        'data-player': String(k + 1),
        'aria-label': `${name(k)} defense radar (inactive)`,
        'aria-hidden': 'true'
      },
        el('div', { class: 'board-top-label defense-label' },
          el('span', { class: 'grid-status-badge inactive', text: '🚢 DEFENSE' }),
          el('h2', { id: 'defense-board-heading', text: `${name(k)}'s Radar` })
        ),
        defBoard,
        healthList(myFleet, myShots, true)
      );
    }
  };

  return el('section', { class: 'screen battle-screen' + (fx ? ' fx-' + fx.kind : ''), 'aria-labelledby': 'ttl' },
    state.confirmExit && exitModal(),
    el('div', { class: 'battle-bg-blur', 'aria-hidden': 'true' }),

    state.confirmRestart && el('div', { class: 'confirm-modal-overlay' },
      el('div', { class: 'confirm', role: 'alertdialog', 'aria-label': 'Confirm restart' },
        el('h2', { text: 'Restart Match?' }),
        el('p', { text: 'Restart the game? All progress will be erased.' }),
        el('div', { class: 'row', style: 'display:flex;justify-content:center;gap:12px;margin-top:16px;' },
          el('button', { class: 'btn sm danger', id: 'restart-yes', onclick: () => { state = freshState(); render(); }, text: 'Yes, Restart' }),
          el('button', { class: 'btn sm primary', id: 'restart-no', onclick: () => { state.confirmRestart = false; render(); }, text: 'Cancel' })
        )
      )
    ),

    // Dual-Grid Battle Arena
    el('div', { class: 'cols battle-cols dual-vertical' },
      buildPlayerCol(0),
      buildPlayerCol(1)
    ),

    fx && callout(fx)
  );
}

/* 5. Game Over Screen */
function gameOverScreen() {
  const w = state.winner, shots = state.stats[w].hits + state.stats[w].misses;
  return el('section', { class: 'screen winner center-screen', 'aria-labelledby': 'ttl' },
    state.confirmExit && exitModal(),
    el('div', { class: 'winner-card' },
      el('span', { class: 'trophy', 'aria-hidden': 'true', text: '🏆' }),
      el('h1', { id: 'ttl', tabindex: '-1', text: `${name(w).toUpperCase()} WINS!` }),
      el('p', { class: 'sub', id: 'final', text: `All 5 enemy ships have been sunk.` }),
      el('div', { class: 'stats', style: 'display:flex;justify-content:center;gap:12px;margin:16px 0;' },
        el('span', { class: 'chip', text: `Shots: ${shots}` }),
        el('span', { class: 'chip', text: `Hits: ${state.stats[w].hits}` }),
        el('span', { class: 'chip', text: `Accuracy: ${shots ? Math.round(100 * state.stats[w].hits / shots) : 0}%` })
      ),
      el('div', { class: 'row', style: 'display:flex;justify-content:center;margin-top:16px;gap:12px;' },
        el('button', { class: 'btn primary big glow', id: 'play-again', onclick: startGame, text: 'Play Again' }),
        el('button', { class: 'btn sm', id: 'to-menu', onclick: () => { state = freshState(); render(); }, text: 'Main Menu' })
      )
    )
  );
}

/* ---------- Top Bar Dynamic Renderer ---------- */
function renderTopBar() {
  const topBarCenter = document.getElementById('top-bar-center');
  const exitBtn = document.getElementById('exit-tab');
  if (!topBarCenter) return;

  const p = state.player;
  const d = 1 - p;

  topBarCenter.replaceChildren();

  if (state.screen === S.MENU) {
    if (exitBtn) exitBtn.classList.add('hidden');
    return;
  }

  if (exitBtn) exitBtn.classList.remove('hidden');

  if (state.screen === S.PRIVACY) {
    // Keep privacy top bar clean
    return;
  }

  if (state.screen === S.PLACE) {
    const draft = state.draft;
    topBarCenter.append(
      el('div', { class: 'top-bar-title-row' },
        badge(p),
        el('h1', { id: 'ttl', tabindex: '-1', text: `${name(p)}: Place Your Fleet` }),
        el('span', { class: 'chip sm' }, el('span', { text: `Ships placed: ${draft.ships.length}/5` }))
      ),
      el('div', { class: 'top-bar-sub', text: 'Select a ship, rotate with (R), then click a square to station.' })
    );
    return;
  }

  if (state.screen === S.TURN) {
    const enemyFleet = state.fleets[d] || [];
    const myFleet = state.fleets[p] || [];
    const enemyShots = state.shots[d] || [];
    const myShots = state.shots[p] || [];
    const l = state.last;

    const sunkEnemyCount = enemyFleet.filter(s => isSunk(s, enemyShots)).length;
    const myLeftCount = myFleet.filter(s => !isSunk(s, myShots)).length;
    const enemyLeftCount = enemyFleet.length - sunkEnemyCount;

    let status = state.msg;
    if (!status) {
      status = l && l.by === d
        ? `${name(d)} fired at ${coord(l.cell)}: ` + (l.sunk ? `your ${l.ship} was SUNK!` : l.hit ? `your ${l.ship} was HIT!` : 'missed.') + ` Your turn to attack, ${name(p)}!`
        : `${name(p)}, select target coordinates on ${name(d)}'s board.`;
    }

    topBarCenter.append(
      el('div', { class: 'top-bar-title-row' },
        badge(p),
        el('h1', { id: 'ttl', tabindex: '-1', text: `${name(p)}'s Turn` })
      ),
      el('div', { class: 'top-bar-status-row' },
        el('div', { class: 'status-inline s-' + state.msgKind, id: 'status', role: 'status', 'aria-live': 'polite', text: status })
      ),
      el('div', { class: 'top-bar-stats-row' },
        el('div', { class: 'compact-stats' },
          el('span', { class: 'chip sm' }, el('span', { text: `Target: ${enemyLeftCount}/${enemyFleet.length}` })),
          el('span', { class: 'chip sm' }, el('span', { text: `Defense: ${myLeftCount}/${myFleet.length}` })),
          el('button', { class: 'btn sm danger', id: 'restart', onclick: () => { state.confirmRestart = true; render(); }, text: 'Restart' })
        )
      )
    );
    return;
  }

  if (state.screen === S.OVER) {
    topBarCenter.append(
      el('div', { class: 'top-bar-title-row' },
        el('h1', { text: 'Match Complete' })
      )
    );
  }
}

/* ---------- Dynamic Responsive Cell Sizer ---------- */
let resizeRaf = null;
function updateCellDimensions() {
  const content = document.getElementById('screen-content');
  if (!content) return;

  const w = content.clientWidth;
  const h = content.clientHeight;
  if (!w || !h) return;

  const isLandscape = w > h;

  if (state.screen === S.TURN) {
    if (isLandscape) {
      // Boards side by side
      const overheadH = h <= 340 ? 44 : 58;
      const gridGapsAndPad = h <= 340 ? 16 : 22;
      const availH = Math.max(80, h - overheadH);
      const cellByH = Math.floor((availH - gridGapsAndPad) / ROWS_COUNT);

      const availWPerBoard = Math.floor((w - 24) / 2) - 6;
      const cellByW = Math.floor((availWPerBoard - gridGapsAndPad) / COLS_COUNT);

      const cell = Math.max(18, Math.min(cellByH, cellByW, 36));
      document.documentElement.style.setProperty('--cell', `${cell}px`);
      document.documentElement.style.setProperty('--def-cell', `${cell}px`);
    } else {
      // Boards stacked vertically: Target active, Defense scaled
      // Overhead for 2 labels + 2 trackers + 2 grids gap/padding + margins: ~118px
      const availH = Math.max(100, h - 118);
      const cellByW = Math.floor((w - 20) / COLS_COUNT);

      // Target board takes ~60% of available cell height, Defense takes ~40%
      let targetCell = Math.floor((availH * 0.60) / ROWS_COUNT);
      let defCell = Math.floor((availH * 0.40) / ROWS_COUNT);

      targetCell = Math.max(22, Math.min(targetCell, cellByW, 36));
      defCell = Math.max(12, Math.min(defCell, Math.floor(targetCell * 0.72), 22));

      // Strictly enforce total height fits available space
      while ((targetCell * 9 + defCell * 9 > availH) && (targetCell > 20 || defCell > 11)) {
        if (targetCell * 9 + defCell * 9 - availH > 9 && targetCell > 20) {
          targetCell--;
        } else if (defCell > 11) {
          defCell--;
        } else {
          targetCell--;
        }
      }

      document.documentElement.style.setProperty('--cell', `${targetCell}px`);
      document.documentElement.style.setProperty('--def-cell', `${defCell}px`);
    }
  } else if (state.screen === S.PLACE) {
    if (isLandscape) {
      // Grid on left, side panel on right
      const overheadH = h <= 340 ? 20 : 30;
      const availH = Math.max(80, h - overheadH);
      const cellByH = Math.floor((availH - 22) / ROWS_COUNT);
      const panel = document.querySelector('.place-side');
      const panelWidth = panel ? Math.min(340, panel.offsetWidth) : Math.min(320, Math.floor(w * 0.44));
      const availW = w - panelWidth - 24;
      const cellByW = Math.floor((availW - 20) / COLS_COUNT);
      const cell = Math.max(18, Math.min(cellByH, cellByW, 36));
      document.documentElement.style.setProperty('--cell', `${cell}px`);
    } else {
      // Grid on top, compact panel below
      const side = document.querySelector('.place-side');
      const sideH = side ? side.offsetHeight : 185;
      const availH = Math.max(100, h - sideH - 14);
      const cellByH = Math.floor((availH - 22) / ROWS_COUNT);
      const cellByW = Math.floor((w - 20) / COLS_COUNT);
      // On tall phones, give board more of free height (Item 6)
      const maxCell = (w >= 360 && h >= 740) ? 40 : 34;
      const cell = Math.max(18, Math.min(cellByH, cellByW, maxCell));
      document.documentElement.style.setProperty('--cell', `${cell}px`);
    }
  }
}

function queueResize() {
  if (resizeRaf) cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(updateCellDimensions);
}

/* ---------- Render Engine ---------- */
let lastKey = '';
function render() {
  const content = document.getElementById('screen-content');
  if (!content) return;

  document.body.classList.toggle('neutral', state.screen === S.PRIVACY);
  document.body.dataset.p = state.screen === S.PRIVACY ? state.next.player : state.screen === S.OVER ? state.winner : state.player;

  // Render top bar
  renderTopBar();

  const build = {
    [S.MENU]: menuScreen,
    [S.PLACE]: placementScreen,
    [S.PRIVACY]: privacyScreen,
    [S.TURN]: battleScreen,
    [S.OVER]: gameOverScreen
  }[state.screen];

  const sec = build();
  const key = state.screen + state.player + (state.next ? 'n' : '');
  const entering = key !== lastKey;
  if (entering) sec.classList.add('enter');

  content.replaceChildren(sec);

  if (entering) {
    lastKey = key;
    const h = document.querySelector('h1');
    if (h) h.focus({ preventScroll: true });
  }

  queueResize();
}

document.addEventListener('keydown', e => {
  if ((e.key === 'r' || e.key === 'R') && state.screen === S.PLACE && !e.ctrlKey && !e.metaKey) {
    const d = state.draft;
    const selectedPlaced = d.selected != null && d.ships.find(s => s.name === SHIPS[d.selected].name);
    if (selectedPlaced) {
      rotatePlacedShip(selectedPlaced);
    } else {
      d.horizontal = !d.horizontal;
      render();
    }
  }
});

// Setup top bar buttons
const muteBtn = document.getElementById('mute');
if (muteBtn) {
  muteBtn.addEventListener('click', () => {
    muted = !muted;
    muteBtn.textContent = muted ? '🔇' : '🔊';
    muteBtn.setAttribute('aria-pressed', muted);
    muteBtn.setAttribute('aria-label', muted ? 'Sound off' : 'Sound on');
  });
}

const exitBtn = document.getElementById('exit-tab');
if (exitBtn) {
  exitBtn.addEventListener('click', () => {
    state.confirmExit = true;
    render();
  });
}

// Window & container resize observers
window.addEventListener('resize', queueResize);
window.addEventListener('orientationchange', queueResize);

const screenContentEl = document.getElementById('screen-content');
if (screenContentEl && typeof ResizeObserver !== 'undefined') {
  const ro = new ResizeObserver(queueResize);
  ro.observe(screenContentEl);
}

// Global test exports
if (typeof window !== 'undefined') {
  window.BattleshipGame = {
    getState: () => state,
    startGame,
    placeAt,
    finishPlacement,
    attack,
    confirmReady,
    flushMissTransition,
    clearMissDelay,
    MISS_DELAY_MS,
    showTurnNotification,
    clearTurnNotification,
    TURN_NOTIFICATION_MS,
    SHIPS,
    COLS_COUNT,
    ROWS_COUNT,
    TOTAL_CELLS,
    coord
  };
  window.BattleshipLogic = {
    shipCells,
    placementStatus,
    resolveAttack,
    isSunk,
    coord,
    randomFleet,
    SHIPS,
    COLS_COUNT,
    ROWS_COUNT,
    TOTAL_CELLS
  };
}

render();
})();
