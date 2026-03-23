// ============================================================
//  Beach Volleyball Showdown - game.js
// ============================================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const W = canvas.width;   // 1350
const H = canvas.height;  // 600

// ── Layout constants ─────────────────────────────────────────
const GROUND_Y    = H - 80;   // sand surface
const NET_X       = W / 2;
const NET_H       = 120;
const NET_TOP_Y   = GROUND_Y - NET_H;
const COURT_LEFT  = 140;      // left sideline (ball going past = out)
const COURT_RIGHT = W - 140;  // right sideline
const GRAVITY     = 0.45;
const JUMP_VY     = -12;
const PLAYER_SPD  = 4.5;
const BALL_R      = 14;
const PLAYER_R    = 22;

// ── Colour palette (Miami Vice / Synthwave) ───────────────────
const PALETTE = {
  neonCyan:  '#00f5ff',
  neonPink:  '#ff2d78',
  neonPurp:  '#b300ff',
  // defaults (overridden by playerColors)
  p1Body:    '#00f5ff',
  p1Skin:    '#FFDAB9',
  p1Hair:    '#1a1a1a',
  p2Body:    '#ff2d78',
  p2Skin:    '#D4956A',
  p2Hair:    '#1a1a1a',
  shadow:    'rgba(0,0,0,0.5)',
};

// ── Customization presets (neon palette) ─────────────────────
const SKIN_PRESETS   = ['#FFDAB9','#D4956A','#A0522D','#6B3A2A','#8B7355','#F4A7B9'];
const HAIR_PRESETS   = ['#1a1a1a','#6B3A2A','#D4A843','#ff2d78','#C0C0C0','#00f5ff'];
const OUTFIT_PRESETS = ['#00f5ff','#ff2d78','#aaff00','#b300ff','#ff8800','#00ff9d'];

// ── Player colors (live, read by drawPlayer) ─────────────────
let playerColors = {
  p1: { skin: PALETTE.p1Skin, hair: PALETTE.p1Hair, body: PALETTE.p1Body },
  p2: { skin: PALETTE.p2Skin, hair: PALETTE.p2Hair, body: PALETTE.p2Body },
};

// ── Player build stats ────────────────────────────────────────
const STAT_POOL = 10;
const STAT_MIN  = 1;
const STAT_MAX  = 6;

let playerBuildStats = {
  p1: { speed: 3, power: 3, jump: 4 },
  p2: { speed: 3, power: 3, jump: 4 },
};

function loadPlayerColors() {
  const p1skin   = localStorage.getItem('p1_skin');
  const p1hair   = localStorage.getItem('p1_hair');
  const p1outfit = localStorage.getItem('p1_outfit');
  const p2skin   = localStorage.getItem('p2_skin');
  const p2hair   = localStorage.getItem('p2_hair');
  const p2outfit = localStorage.getItem('p2_outfit');
  if (p1skin)   playerColors.p1.skin = p1skin;
  if (p1hair)   playerColors.p1.hair = p1hair;
  if (p1outfit) playerColors.p1.body = p1outfit;
  if (p2skin)   playerColors.p2.skin = p2skin;
  if (p2hair)   playerColors.p2.hair = p2hair;
  if (p2outfit) playerColors.p2.body = p2outfit;
}

function savePlayerColors() {
  localStorage.setItem('p1_skin',   playerColors.p1.skin);
  localStorage.setItem('p1_hair',   playerColors.p1.hair);
  localStorage.setItem('p1_outfit', playerColors.p1.body);
  localStorage.setItem('p2_skin',   playerColors.p2.skin);
  localStorage.setItem('p2_hair',   playerColors.p2.hair);
  localStorage.setItem('p2_outfit', playerColors.p2.body);
}

function loadPlayerBuildStats() {
  ['p1', 'p2'].forEach(pKey => {
    try {
      const raw = localStorage.getItem(`${pKey}_build`);
      if (raw) Object.assign(playerBuildStats[pKey], JSON.parse(raw));
    } catch {}
  });
}

function savePlayerBuildStats() {
  ['p1', 'p2'].forEach(pKey => {
    localStorage.setItem(`${pKey}_build`, JSON.stringify(playerBuildStats[pKey]));
  });
}

// ── Stat-to-gameplay helpers ──────────────────────────────────
function getPlayerSpeed(pKey) {
  // stat 1→0.70x, stat 3→1.00x, stat 6→1.45x of base speed
  return PLAYER_SPD * (0.55 + playerBuildStats[pKey].speed * 0.15);
}

function getPlayerJump(pKey) {
  // stat 1→0.67x, stat 4→1.03x, stat 6→1.27x of base jump
  return JUMP_VY * (0.55 + playerBuildStats[pKey].jump * 0.12);
}

function getPlayerPower(pKey) {
  // stat 1→7, stat 3→10 (base), stat 6→13.5
  return 10 + (playerBuildStats[pKey].power - 3) * 1.5;
}

// ── Stats ─────────────────────────────────────────────────────
function defaultStats() {
  return { wins: 0, losses: 0, setsWon: 0, setsLost: 0, pointsScored: 0 };
}

function loadStats(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? Object.assign(defaultStats(), JSON.parse(raw)) : defaultStats();
  } catch { return defaultStats(); }
}

function saveStats(key, stats) {
  localStorage.setItem(key, JSON.stringify(stats));
}

function recordGameStats(winner) {
  // winner = 1 or 2
  const s1 = loadStats('stats_p1');
  const s2 = loadStats('stats_p2');

  if (winner === 1) {
    s1.wins++;    s1.setsWon   += setsP1; s1.setsLost  += setsP2;
    s2.losses++;  s2.setsWon   += setsP2; s2.setsLost  += setsP1;
  } else {
    s2.wins++;    s2.setsWon   += setsP2; s2.setsLost  += setsP1;
    s1.losses++;  s1.setsWon   += setsP1; s1.setsLost  += setsP2;
  }
  // points scored across the whole game — we track final set scores
  // by adding the per-set points at game end (scoreP1/scoreP2 hold last set's pts)
  s1.pointsScored += scoreP1;
  s2.pointsScored += scoreP2;

  saveStats('stats_p1', s1);
  saveStats('stats_p2', s2);
}

// ── State ─────────────────────────────────────────────────────
let state = 'start';   // start | customize | stats | playing | point | gameover
let scoreP1 = 0, scoreP2 = 0;
let setsP1 = 0, setsP2 = 0;
let currentSet = 1;
let servingPlayer = 1;
let pointTimer = 0;
let pointWinner = 0;
let confetti = [];
let particles = [];
let clouds = [];
let seagulls = [];
let bgTime = 0;

// Tracks where we came from when entering customize (for back-button routing)
let customizeOrigin = 'local'; // 'local' | 'online' | 'tournament'

const keys = {};

// ── Online multiplayer ────────────────────────────────────────
let onlineMode = null;  // null | 'host' | 'guest'
let netSocket  = null;
const guestKeys = {};   // host mirrors guest's held keys here

// ── Online control scheme (per device) ───────────────────────
let onlineControls = localStorage.getItem('online_controls') || 'wasd';
function saveOnlineControls() { localStorage.setItem('online_controls', onlineControls); }

// ── Gamepad ───────────────────────────────────────────────────
const gamepadPrev = [{ jump: false }, { jump: false }];

function readPad(idx) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const p = pads[idx];
  if (!p || !p.connected) return null;
  const ax = p.axes[0] ?? 0;
  const DEAD = 0.25;
  return {
    left:  ax < -DEAD || (p.buttons[14]?.pressed ?? false),
    right: ax >  DEAD || (p.buttons[15]?.pressed ?? false),
    // Any face button (Cross/A, Circle/B, Square/X, Triangle/Y) or D-pad Up
    jump: (p.buttons[0]?.pressed ?? false) || (p.buttons[1]?.pressed ?? false) ||
          (p.buttons[2]?.pressed ?? false) || (p.buttons[3]?.pressed ?? false) ||
          (p.buttons[12]?.pressed ?? false),
  };
}

// Show gamepad connection status in HUD
window.addEventListener('gamepadconnected',    () => updateGamepadHUD());
window.addEventListener('gamepaddisconnected', () => updateGamepadHUD());

function updateGamepadHUD() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const el = document.getElementById('gamepad-status');
  if (!el) return;
  el.innerHTML = [0, 1].map(i =>
    pads[i]?.connected ? `<span class="gp-dot connected" title="P${i+1} gamepad">🎮</span>` : ''
  ).join('');
}

// ── Bot ───────────────────────────────────────────────────────
let botMode = false;
let botDifficulty = 'medium';
let botServeDelay = 0;

// ── Tournament ────────────────────────────────────────────────
// tournamentData = null | { players:[{name,colors,build}], matches:[{a,b,winner}], current:0 }
let tournamentData = null;

// ── Customize tab (for local/tournament player-by-player) ─────
let customizeTab  = 1;
let customizeStep = 0; // 0 = LOOK (colors), 1 = BUILD (stats)

// ── Entity factories ─────────────────────────────────────────
function makePlayer(side) {
  const x = side === 1 ? W * 0.25 : W * 0.75;
  return {
    x, y: GROUND_Y - PLAYER_R,
    vx: 0, vy: 0,
    side,
    onGround: true,
    hitCooldown: 0,
    swingAnim: 0,
    walkAnim: 0,
    facing: side === 1 ? 1 : -1,
  };
}

function makeBall() {
  const sx = servingPlayer === 1 ? W * 0.25 : W * 0.75;
  return {
    x: sx,
    y: GROUND_Y - PLAYER_R * 2 - BALL_R - 30,
    vx: 0,
    vy: 0,
    spin: 0,
    angle: 0,
    served: false,
    lastHit: 0, // player side
    trailPoints: [],
  };
}

let p1, p2, ball;

function resetRound() {
  p1 = makePlayer(1);
  p2 = makePlayer(2);
  ball = makeBall();
  particles = [];
  if (botMode) botServeDelay = 60 + Math.random() * 90;
  touchMove.p1 = 0; touchMove.p2 = 0;
  activeTouches.clear();
}

function resetGame() {
  scoreP1 = 0; scoreP2 = 0;
  setsP1 = 0;  setsP2 = 0;
  currentSet = 1;
  servingPlayer = 1;
  touchMove.p1 = 0; touchMove.p2 = 0;
  activeTouches.clear();
  resetRound();
  updateHUD();
}

// ── Clouds & seagulls (background life) ─────────────────────
function initBgElements() {
  clouds = [];
  for (let i = 0; i < 5; i++) {
    clouds.push({
      x: Math.random() * W,
      y: 40 + Math.random() * 80,
      w: 80 + Math.random() * 100,
      speed: 0.15 + Math.random() * 0.2,
      opacity: 0.6 + Math.random() * 0.4,
    });
  }
  seagulls = [];
  for (let i = 0; i < 3; i++) {
    seagulls.push({
      x: Math.random() * W,
      y: 60 + Math.random() * 100,
      speed: 0.4 + Math.random() * 0.4,
      wingPhase: Math.random() * Math.PI * 2,
      scale: 0.6 + Math.random() * 0.6,
    });
  }
}

// ── HUD helpers ──────────────────────────────────────────────
function updateHUD() {
  document.getElementById('score-p1').textContent = scoreP1;
  document.getElementById('score-p2').textContent = scoreP2;
  document.getElementById('set-label').textContent = `Set ${currentSet}`;
  ['p1','p2'].forEach(pid => {
    const el = document.getElementById(`sets-${pid}`);
    el.innerHTML = '';
    const won = pid === 'p1' ? setsP1 : setsP2;
    for (let i = 0; i < 3; i++) {
      const d = document.createElement('div');
      d.className = 'set-dot' + (i < won ? ' won' : '');
      el.appendChild(d);
    }
  });
}

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(`screen-${name}`);
  if (el) el.classList.add('active');
}

// ── Input ─────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (state === 'playing') {
    if (onlineMode === 'guest') return;
    const p1JumpKey = (onlineMode === 'host' && onlineControls === 'arrows') ? 'ArrowUp' : 'KeyW';
    if (e.code === p1JumpKey && p1.onGround) { p1.vy = getPlayerJump('p1'); p1.onGround = false; }
    if (!onlineMode && e.code === 'ArrowUp' && p2.onGround) { p2.vy = getPlayerJump('p2'); p2.onGround = false; }
    if (!ball.served) {
      if (e.code === p1JumpKey && servingPlayer === 1) serveBall();
      if (!onlineMode && e.code === 'ArrowUp' && servingPlayer === 2) serveBall();
    }
  }
});
document.addEventListener('keyup', e => { keys[e.code] = false; });

// ── Touch controls ────────────────────────────────────────────
// Drag left/right = move, tap (no/small drag) = jump
// In 2-player local: left half = P1, right half = P2
// In bot/online: full screen = P1

const touchMove = { p1: 0, p2: 0 }; // -1 left, 0 still, 1 right
const activeTouches = new Map();     // touchId → { player, startX, moved }

const TOUCH_DEAD = 20; // px drag threshold before counting as movement

function touchPlayerFor(clientX) {
  if (botMode || onlineMode) return 'p1';
  return clientX < window.innerWidth / 2 ? 'p1' : 'p2';
}

function doTouchJump(player) {
  if (state !== 'playing') return;
  if (player === 'p1') {
    if (p1.onGround) { p1.vy = getPlayerJump('p1'); p1.onGround = false; }
    if (!ball.served && servingPlayer === 1) serveBall();
  } else if (player === 'p2' && !botMode && onlineMode !== 'guest') {
    if (p2.onGround) { p2.vy = getPlayerJump('p2'); p2.onGround = false; }
    if (!ball.served && servingPlayer === 2) serveBall();
  }
}

// Ensure music on any touch (passive — never blocks buttons)
document.addEventListener('touchstart', () => ensureMusic(), { passive: true });

// Game touch controls live on the canvas only — menu buttons are never affected
canvas.addEventListener('touchstart', e => {
  if (state !== 'playing') return;
  e.preventDefault();
  for (const t of e.changedTouches) {
    const player = touchPlayerFor(t.clientX);
    activeTouches.set(t.identifier, { player, startX: t.clientX, moved: false });
  }
}, { passive: false });

canvas.addEventListener('touchmove', e => {
  if (state !== 'playing') return;
  e.preventDefault();
  for (const t of e.changedTouches) {
    const info = activeTouches.get(t.identifier);
    if (!info) continue;
    const dx = t.clientX - info.startX;
    if (Math.abs(dx) > TOUCH_DEAD) info.moved = true;
    touchMove[info.player] = dx > TOUCH_DEAD ? 1 : dx < -TOUCH_DEAD ? -1 : 0;
  }
}, { passive: false });

function touchEndOrCancel(e) {
  // Always clear movement state regardless of game state to prevent stuck movement
  for (const t of e.changedTouches) {
    const info = activeTouches.get(t.identifier);
    if (!info) continue;
    activeTouches.delete(t.identifier);
    const stillActive = [...activeTouches.values()].some(i => i.player === info.player);
    if (!stillActive) touchMove[info.player] = 0;
  }
  if (state === 'playing') e.preventDefault();
}
canvas.addEventListener('touchend',    touchEndOrCancel, { passive: false });
canvas.addEventListener('touchcancel', touchEndOrCancel, { passive: false });

// Jump buttons for mobile
const jumpBtnsEl = document.getElementById('mobile-jump-btns');
function isTouchDevice() { return 'ontouchstart' in window || navigator.maxTouchPoints > 0; }

function updateJumpBtns() {
  if (!jumpBtnsEl) return;
  const show = isTouchDevice() && state === 'playing';
  jumpBtnsEl.style.display = show ? 'flex' : 'none';
  // In single-player modes (bot/online) hide P2 button
  const p2btn = document.getElementById('jump-btn-p2');
  if (p2btn) p2btn.style.visibility = (botMode || onlineMode) ? 'hidden' : 'visible';
}

document.getElementById('jump-btn-p1')?.addEventListener('touchstart', e => {
  e.preventDefault(); e.stopPropagation();
  doTouchJump('p1');
}, { passive: false });

document.getElementById('jump-btn-p2')?.addEventListener('touchstart', e => {
  e.preventDefault(); e.stopPropagation();
  doTouchJump('p2');
}, { passive: false });

// Show touch hint briefly when a touch game starts on a touch device
let touchHintTimer = null;
function showTouchHint() {
  if (!('ontouchstart' in window)) return;
  const el = document.getElementById('touch-hint');
  if (!el) return;
  // Single player modes only show left hint
  const sides = el.querySelectorAll('.touch-hint-side');
  if (botMode || onlineMode) {
    sides[0].style.visibility = 'visible';
    sides[1].style.visibility = 'hidden';
  } else {
    sides[0].style.visibility = 'visible';
    sides[1].style.visibility = 'visible';
  }
  el.classList.add('visible');
  clearTimeout(touchHintTimer);
  touchHintTimer = setTimeout(() => el.classList.remove('visible'), 3000);
}

// ── Button wiring ─────────────────────────────────────────────

// Start music on first interaction (browser requires user gesture)
let musicMuted = false;

function ensureMusic() {
  if (musicMuted) return; // user explicitly muted — don't restart
  if (!AudioEngine.isPlaying()) AudioEngine.start();
}

// Autostart music on very first interaction anywhere on the page
function onFirstInteraction() {
  ensureMusic();
  document.removeEventListener('click', onFirstInteraction);
  document.removeEventListener('keydown', onFirstInteraction);
}
document.addEventListener('click', onFirstInteraction);
document.addEventListener('keydown', onFirstInteraction);

document.getElementById('btn-start').addEventListener('click', () => {
  ensureMusic();
  onlineMode = null;
  customizeOrigin = 'local';
  resetGame();
  startGame();
});

document.getElementById('btn-restart').addEventListener('click', () => {
  botMode = false;
  customizeOrigin = 'local';
  openCustomize();
});

document.getElementById('btn-customize-menu').addEventListener('click', () => {
  ensureMusic();
  botMode = false;
  customizeTab = 1;
  customizeOrigin = 'local';
  openCustomize();
});

document.getElementById('btn-vs-bot').addEventListener('click', () => {
  ensureMusic();
  showScreen('bot');
});

document.getElementById('btn-back-bot').addEventListener('click', () => showScreen('start'));

document.querySelectorAll('.diff-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    botDifficulty = btn.dataset.diff;
    botMode = true;
    onlineMode = null;
    customizeOrigin = 'local';
    customizeTab = 1;
    openCustomize();
  });
});

document.getElementById('btn-tournament').addEventListener('click', () => {
  ensureMusic();
  renderTournamentSetup();
  showScreen('tournament');
});

document.getElementById('btn-stats').addEventListener('click', () => { ensureMusic(); openStats(); });
document.getElementById('btn-back-stats').addEventListener('click', () => showScreen('start'));
document.getElementById('btn-reset-stats').addEventListener('click', () => {
  saveStats('stats_p1', defaultStats());
  saveStats('stats_p2', defaultStats());
  renderStats();
});

document.getElementById('btn-mute').addEventListener('click', () => {
  musicMuted = !musicMuted;
  if (musicMuted) {
    AudioEngine.stop();
  } else {
    AudioEngine.start();
  }
  document.getElementById('btn-mute').textContent = musicMuted ? '🔇' : '🔊';
});

// Customize back button
document.getElementById('btn-back-customize').addEventListener('click', () => {
  if (customizeOrigin === 'online') {
    showScreen('online');
  } else if (customizeOrigin === 'tournament') {
    // If we're still in the initial setup phase, go back to tournament setup
    // If the tournament bracket already has matches played, go to bracket
    const td = tournamentData;
    if (td && (td.currentRound > 0 || td.currentMatchIdx > 0)) {
      showTournamentBracket();
    } else {
      renderTournamentSetup();
      showScreen('tournament');
    }
  } else {
    showScreen('start');
  }
});

// Start game from customize screen
document.getElementById('btn-start-game').addEventListener('click', () => {
  savePlayerColors();
  savePlayerBuildStats();
  if (customizeOrigin === 'tournament') {
    const td = tournamentData;
    const idx = td.customizeIdx;
    td.players[idx].colors = { ...playerColors.p1 };
    td.players[idx].build  = { ...playerBuildStats.p1 };
    if (idx + 1 < td.players.length) {
      openTournamentCustomize(idx + 1);
    } else {
      showTournamentBracket();
    }
    return;
  }
  if (customizeOrigin === 'online') {
    // Guest sends their build to host so physics apply correctly
    if (onlineMode === 'guest' && netSocket) {
      netSocket.emit('guest-build', { ...playerBuildStats.p2 });
    }
    resetGame();
    startGame();
  } else {
    onlineMode = null;
    resetGame();
    startGame();
  }
});

document.getElementById('btn-save-build').addEventListener('click', () => {
  savePlayerColors();
  savePlayerBuildStats();
  const btn = document.getElementById('btn-save-build');
  btn.textContent = 'SAVED ✓';
  btn.style.background = 'linear-gradient(135deg, #00a86b, #007a4d)';
  setTimeout(() => {
    btn.textContent = 'SAVE BUILD';
    btn.style.background = '';
  }, 1500);
});

function startGame() {
  state = 'playing';
  showScreen('game');
  updateHUD();
  ensureMusic();
  updateJumpBtns();
  showTouchHint();
}

// ── Customize screen ─────────────────────────────────────────
function openCustomize() {
  customizeStep = 0;
  renderCustomize();
  showScreen('customize');
}

function renderCustomize() {
  const panelsEl = document.getElementById('customize-panels');
  panelsEl.innerHTML = '';

  const isOnlineGuest = onlineMode === 'guest';
  const isOnlineHost  = onlineMode === 'host';
  const isTournament  = customizeOrigin === 'tournament';
  const useTabs = !onlineMode && !botMode && !isTournament;
  const playersToShow = isOnlineGuest ? [2] : (isOnlineHost || botMode || isTournament) ? [1] : [customizeTab];

  // ── Player tabs (local 2-player only) ───────────────────────
  if (useTabs) {
    const tabBar = document.createElement('div');
    tabBar.className = 'customize-tabs';
    [1, 2].forEach(n => {
      const btn = document.createElement('button');
      btn.className = 'customize-tab-btn' + (customizeTab === n ? ' active' : '');
      btn.textContent = `PLAYER ${n}`;
      btn.addEventListener('click', () => { customizeTab = n; customizeStep = 0; renderCustomize(); });
      tabBar.appendChild(btn);
    });
    panelsEl.appendChild(tabBar);
  }

  // ── Step pills: LOOK / BUILD ─────────────────────────────────
  const stepBar = document.createElement('div');
  stepBar.className = 'customize-step-bar';
  [['LOOK', 0], ['BUILD', 1]].forEach(([label, idx]) => {
    const pill = document.createElement('button');
    pill.className = 'customize-step-pill' + (customizeStep === idx ? ' active' : '');
    pill.textContent = label;
    pill.addEventListener('click', () => { customizeStep = idx; renderCustomize(); });
    stepBar.appendChild(pill);
  });
  panelsEl.appendChild(stepBar);

  // ── Step content ─────────────────────────────────────────────
  playersToShow.forEach(playerNum => {
    const pKey = `p${playerNum}`;
    const panel = document.createElement('div');
    panel.className = 'customize-step-content';
    panel.id = `customize-panel-${pKey}`;

    if (customizeStep === 0) {
      // LOOK: big avatar + color swatches
      panel.innerHTML = `
        <div class="look-layout">
          <canvas class="customize-avatar-large" id="avatar-${pKey}" width="110" height="124"></canvas>
          <div class="color-rows">
            <div class="color-row-compact">
              <span class="color-row-label">SKIN</span>
              <div class="swatch-row" id="${pKey}-skin-swatches"></div>
            </div>
            <div class="color-row-compact">
              <span class="color-row-label">HAIR</span>
              <div class="swatch-row" id="${pKey}-hair-swatches"></div>
            </div>
            <div class="color-row-compact">
              <span class="color-row-label">KIT</span>
              <div class="swatch-row" id="${pKey}-outfit-swatches"></div>
            </div>
          </div>
        </div>
      `;
    } else {
      // BUILD: small avatar + stat sliders + optional controls
      const isMyPanel = (onlineMode === 'host' && playerNum === 1) || (onlineMode === 'guest' && playerNum === 2);
      const ctrlHtml = (onlineMode && isMyPanel) ? `
        <div class="controls-picker" style="margin-top:14px">
          <div class="color-section-label" style="margin-bottom:8px">CONTROLS</div>
          <div style="display:flex;gap:8px">
            <button class="ctrl-btn${onlineControls === 'wasd'   ? ' selected' : ''}" data-scheme="wasd">WASD</button>
            <button class="ctrl-btn${onlineControls === 'arrows' ? ' selected' : ''}" data-scheme="arrows">ARROWS</button>
          </div>
        </div>` : '';

      panel.innerHTML = `
        <div class="build-layout">
          <canvas class="customize-avatar-small" id="avatar-${pKey}" width="80" height="90"></canvas>
          <div class="stat-builder">
            <div class="stat-builder-header">
              <span class="color-section-label">STATS</span>
              <span class="stat-pool" id="${pKey}-pool"></span>
            </div>
            ${['speed','power','jump'].map(s => `
            <div class="stat-row-ui">
              <span class="stat-label-ui">${s === 'speed' ? 'SPD' : s === 'power' ? 'PWR' : 'JMP'}</span>
              <button class="stat-btn stat-btn-minus" data-p="${pKey}" data-s="${s}">−</button>
              <div class="stat-bar-track"><div class="stat-bar-fill" id="${pKey}-${s}-bar"></div></div>
              <button class="stat-btn stat-btn-plus" data-p="${pKey}" data-s="${s}">+</button>
              <span class="stat-val-ui" id="${pKey}-${s}-val"></span>
            </div>`).join('')}
            ${ctrlHtml}
          </div>
        </div>
      `;

      if (onlineMode && isMyPanel) {
        panel.querySelectorAll('.ctrl-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            onlineControls = btn.dataset.scheme;
            saveOnlineControls();
            panel.querySelectorAll('.ctrl-btn').forEach(b => b.classList.toggle('selected', b.dataset.scheme === onlineControls));
          });
        });
      }
      setupStatButtons(pKey);
    }

    panelsEl.appendChild(panel);

    if (customizeStep === 0) {
      buildSwatchRow(`${pKey}-skin-swatches`,   SKIN_PRESETS,   pKey, 'skin');
      buildSwatchRow(`${pKey}-hair-swatches`,   HAIR_PRESETS,   pKey, 'hair');
      buildSwatchRow(`${pKey}-outfit-swatches`, OUTFIT_PRESETS, pKey, 'body');
    }
    drawAvatarPreview(pKey);
    updateStatDisplay(pKey);
  });

  // ── Step navigation arrows ───────────────────────────────────
  const nav = document.createElement('div');
  nav.className = 'customize-step-nav';

  const prevBtn = document.createElement('button');
  prevBtn.className = 'step-nav-btn';
  prevBtn.textContent = '← LOOK';
  prevBtn.style.visibility = customizeStep === 0 ? 'hidden' : 'visible';
  prevBtn.addEventListener('click', () => { customizeStep = 0; renderCustomize(); });

  const nextBtn = document.createElement('button');
  nextBtn.className = 'step-nav-btn';
  nextBtn.textContent = 'BUILD →';
  nextBtn.style.visibility = customizeStep === 1 ? 'hidden' : 'visible';
  nextBtn.addEventListener('click', () => { customizeStep = 1; renderCustomize(); });

  nav.appendChild(prevBtn);
  nav.appendChild(nextBtn);
  panelsEl.appendChild(nav);
}

function updateStatDisplay(pKey) {
  const bs = playerBuildStats[pKey];
  const pool = STAT_POOL - bs.speed - bs.power - bs.jump;
  const poolEl = document.getElementById(`${pKey}-pool`);
  if (poolEl) poolEl.textContent = pool > 0 ? `${pool} pts left` : 'BUILD FULL';
  ['speed', 'power', 'jump'].forEach(stat => {
    const barEl = document.getElementById(`${pKey}-${stat}-bar`);
    const valEl = document.getElementById(`${pKey}-${stat}-val`);
    if (barEl) barEl.style.width = (bs[stat] / STAT_MAX * 100) + '%';
    if (valEl) valEl.textContent = bs[stat];
  });
}

function setupStatButtons(pKey) {
  const panel = document.getElementById(`customize-panel-${pKey}`);
  if (!panel) return;
  panel.querySelectorAll('.stat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = btn.dataset.p;
      const s = btn.dataset.s;
      const delta = btn.classList.contains('stat-btn-plus') ? 1 : -1;
      const bs = playerBuildStats[p];
      const pool = STAT_POOL - bs.speed - bs.power - bs.jump;
      const newVal = bs[s] + delta;
      if (newVal < STAT_MIN || newVal > STAT_MAX) return;
      if (delta > 0 && pool <= 0) return;
      bs[s] = newVal;
      updateStatDisplay(p);
    });
  });
}

function buildSwatchRow(containerId, presets, pKey, colorProp) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  presets.forEach(color => {
    const sw = document.createElement('div');
    sw.className = 'swatch' + (playerColors[pKey][colorProp] === color ? ' selected' : '');
    sw.style.background = color;
    sw.title = color;
    sw.addEventListener('click', () => {
      playerColors[pKey][colorProp] = color;
      // Update selected state in this row
      container.querySelectorAll('.swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
      drawAvatarPreview(pKey);
      // If online host, broadcast color choice to guest
      if (onlineMode === 'host' && netSocket) {
        netSocket.emit('colors', { playerColors });
      }
    });
    container.appendChild(sw);
  });
}

function drawAvatarPreview(pKey) {
  const cvs = document.getElementById(`avatar-${pKey}`);
  if (!cvs) return;
  const c = cvs.getContext('2d');
  const cw = cvs.width, ch = cvs.height;
  c.clearRect(0, 0, cw, ch);

  const col = playerColors[pKey];
  const cx = cw / 2;
  const baseY = ch - 12; // feet level

  // Legs
  c.strokeStyle = col.skin;
  c.lineWidth = 5;
  c.lineCap = 'round';
  c.beginPath(); c.moveTo(cx - 7, baseY - 28); c.lineTo(cx - 9, baseY); c.stroke();
  c.beginPath(); c.moveTo(cx + 7, baseY - 28); c.lineTo(cx + 9, baseY); c.stroke();

  // Shorts / body
  c.fillStyle = col.body;
  c.fillRect(cx - 10, baseY - 40, 20, 14);
  c.beginPath();
  if (c.roundRect) {
    c.roundRect(cx - 10, baseY - 58, 20, 20, 3);
  } else {
    c.rect(cx - 10, baseY - 58, 20, 20);
  }
  c.fill();

  // Number on shirt
  c.fillStyle = 'rgba(255,255,255,0.7)';
  c.font = 'bold 9px sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(pKey === 'p1' ? '1' : '2', cx, baseY - 48);

  // Arms
  c.strokeStyle = col.skin;
  c.lineWidth = 4;
  c.beginPath(); c.moveTo(cx - 10, baseY - 55); c.lineTo(cx - 18, baseY - 42); c.stroke();
  c.beginPath(); c.moveTo(cx + 10, baseY - 55); c.lineTo(cx + 18, baseY - 42); c.stroke();

  // Head
  c.fillStyle = col.skin;
  c.beginPath();
  c.arc(cx, baseY - 70, 11, 0, Math.PI * 2);
  c.fill();

  // Hair
  c.fillStyle = col.hair;
  c.beginPath();
  c.ellipse(cx, baseY - 76, 9, 7, 0, Math.PI, 0);
  c.fill();

  // Eye
  c.fillStyle = '#333';
  c.beginPath();
  c.arc(cx + 3, baseY - 70, 1.5, 0, Math.PI * 2);
  c.fill();
}

// ── Stats screen ──────────────────────────────────────────────
function openStats() {
  renderStats();
  showScreen('stats');
}

function renderStats() {
  const panelsEl = document.getElementById('stats-panels');
  panelsEl.innerHTML = '';

  [1, 2].forEach(playerNum => {
    const pKey = `p${playerNum}`;
    const stats = loadStats(`stats_${pKey}`);

    const panel = document.createElement('div');
    panel.className = `stats-panel ${pKey}-stats`;

    const wl = stats.wins + stats.losses > 0
      ? ((stats.wins / (stats.wins + stats.losses)) * 100).toFixed(0) + '%'
      : '—';

    panel.innerHTML = `
      <h3>Player ${playerNum}</h3>
      <canvas class="stats-avatar" id="stats-avatar-${pKey}" width="72" height="82"></canvas>
      <div class="stats-row">
        <span class="stats-label">Wins</span>
        <span class="stats-value">${stats.wins}</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">Losses</span>
        <span class="stats-value">${stats.losses}</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">Win %</span>
        <span class="stats-value" style="font-size:1.1rem">${wl}</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">Sets Won</span>
        <span class="stats-value">${stats.setsWon}</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">Sets Lost</span>
        <span class="stats-value">${stats.setsLost}</span>
      </div>
      <div class="stats-row">
        <span class="stats-label">Points</span>
        <span class="stats-value">${stats.pointsScored}</span>
      </div>
    `;
    panelsEl.appendChild(panel);

    // Draw the mini-avatar with current colors
    drawStatsAvatar(pKey);
  });
}

function drawStatsAvatar(pKey) {
  const cvs = document.getElementById(`stats-avatar-${pKey}`);
  if (!cvs) return;
  const c = cvs.getContext('2d');
  const cw = cvs.width, ch = cvs.height;
  c.clearRect(0, 0, cw, ch);

  const col = playerColors[pKey];
  const cx = cw / 2;
  const baseY = ch - 10;

  c.strokeStyle = col.skin;
  c.lineWidth = 5;
  c.lineCap = 'round';
  c.beginPath(); c.moveTo(cx - 6, baseY - 26); c.lineTo(cx - 8, baseY); c.stroke();
  c.beginPath(); c.moveTo(cx + 6, baseY - 26); c.lineTo(cx + 8, baseY); c.stroke();

  c.fillStyle = col.body;
  c.fillRect(cx - 9, baseY - 37, 18, 13);
  c.beginPath();
  if (c.roundRect) { c.roundRect(cx - 9, baseY - 53, 18, 18, 3); } else { c.rect(cx - 9, baseY - 53, 18, 18); }
  c.fill();

  c.fillStyle = 'rgba(255,255,255,0.7)';
  c.font = 'bold 8px sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(pKey === 'p1' ? '1' : '2', cx, baseY - 44);

  c.strokeStyle = col.skin;
  c.lineWidth = 4;
  c.beginPath(); c.moveTo(cx - 9, baseY - 50); c.lineTo(cx - 16, baseY - 38); c.stroke();
  c.beginPath(); c.moveTo(cx + 9, baseY - 50); c.lineTo(cx + 16, baseY - 38); c.stroke();

  c.fillStyle = col.skin;
  c.beginPath();
  c.arc(cx, baseY - 63, 10, 0, Math.PI * 2);
  c.fill();

  c.fillStyle = col.hair;
  c.beginPath();
  c.ellipse(cx, baseY - 68, 8, 6, 0, Math.PI, 0);
  c.fill();

  c.fillStyle = '#333';
  c.beginPath();
  c.arc(cx + 3, baseY - 63, 1.4, 0, Math.PI * 2);
  c.fill();
}

// ── Bot AI ────────────────────────────────────────────────────
function getBotTargetX() {
  if (!ball.served) return (NET_X + COURT_RIGHT) * 0.5;
  // Predict ball landing on bot's side
  let bx = ball.x, by = ball.y, bvx = ball.vx, bvy = ball.vy;
  const steps = botDifficulty === 'hard' ? 120 : botDifficulty === 'medium' ? 60 : 30;
  for (let i = 0; i < steps; i++) {
    bvy += GRAVITY * 0.9;
    bx += bvx; by += bvy;
    if (by >= GROUND_Y - BALL_R) break;
    if (bx > NET_X - 18 && bx < NET_X + 18 && by > NET_TOP_Y) { bvx *= -0.55; bvy *= 0.45; }
  }
  const error = botDifficulty === 'hard' ? 8 : botDifficulty === 'medium' ? 28 : 60;
  return bx + (Math.random() - 0.5) * error;
}

function updateBot() {
  if (!botMode) return;

  // Serve
  if (!ball.served && servingPlayer === 2) {
    botServeDelay--;
    if (botServeDelay <= 0) serveBall();
    return;
  }

  if (!ball.served) return;

  const target = getBotTargetX();
  const spd = getPlayerSpeed('p2');

  p2.vx = 0;
  if (p2.x < target - 12) { p2.vx = spd;  p2.facing =  1; }
  else if (p2.x > target + 12) { p2.vx = -spd; p2.facing = -1; }
  if (p2.vx !== 0) p2.walkAnim += 0.15;

  // Jump when ball is on bot's side and within range
  if (ball.x > NET_X && p2.onGround) {
    const d = dist(ball.x, ball.y, p2.x, p2.y - 10);
    const threshold = botDifficulty === 'hard' ? 160 : botDifficulty === 'medium' ? 110 : 70;
    if (d < threshold) { p2.vy = getPlayerJump('p2'); p2.onGround = false; }
  }
}

// ── Tournament ────────────────────────────────────────────────
// ── Tournament: core bracket engine ──────────────────────────
function tNextPow2(n) { let p = 4; while (p < n) p *= 2; return p; }

function tBuildRounds(playerCount) {
  const size = tNextPow2(playerCount);
  const slots = [...Array(playerCount).keys(), ...Array(size - playerCount).fill('BYE')];
  const rounds = [];
  const r0 = [];
  for (let i = 0; i < size; i += 2) r0.push({ a: slots[i], b: slots[i+1], winner: null });
  rounds.push(r0);
  let prev = size / 2;
  while (prev > 1) {
    prev /= 2;
    rounds.push(Array.from({ length: prev }, () => ({ a: null, b: null, winner: null })));
  }
  return rounds;
}

function tRoundLabel(roundIdx, total) {
  const fromEnd = total - 1 - roundIdx;
  return ['FINAL', 'SEMIFINAL', 'QUARTERFINAL', 'ROUND OF 16'][fromEnd] ?? `ROUND ${roundIdx + 1}`;
}

function tPlayerName(idx) {
  if (idx === 'BYE') return 'BYE';
  if (idx === null)  return '?';
  return tournamentData.players[idx].name;
}

function tResolveMatch(round, mi, winnerIdx) {
  const td = tournamentData;
  td.rounds[round][mi].winner = winnerIdx;
  if (round + 1 < td.rounds.length) {
    const slot = mi % 2 === 0 ? 'a' : 'b';
    td.rounds[round + 1][Math.floor(mi / 2)][slot] = winnerIdx;
  }
}

function tAdvanceByes() {
  const td = tournamentData;
  let changed = true;
  while (changed) {
    changed = false;
    if (td.currentRound >= td.rounds.length) break;
    const round = td.rounds[td.currentRound];
    if (td.currentMatchIdx >= round.length) {
      td.currentRound++; td.currentMatchIdx = 0; changed = true; continue;
    }
    const m = round[td.currentMatchIdx];
    if (m.a === 'BYE' || m.b === 'BYE') {
      tResolveMatch(td.currentRound, td.currentMatchIdx, m.a === 'BYE' ? m.b : m.a);
      td.currentMatchIdx++; changed = true;
    }
  }
}

function initTournament(names) {
  tournamentData = {
    players: names.map((name, i) => ({
      name,
      colors: { skin: SKIN_PRESETS[0], hair: HAIR_PRESETS[0], body: OUTFIT_PRESETS[i % OUTFIT_PRESETS.length] },
      build: { speed: 3, power: 3, jump: 4 },
    })),
    rounds: tBuildRounds(names.length),
    currentRound: 0,
    currentMatchIdx: 0,
    customizeIdx: 0,
  };
  tAdvanceByes();
}

function loadTournamentMatch() {
  const td = tournamentData;
  const m = td.rounds[td.currentRound][td.currentMatchIdx];
  const pa = td.players[m.a], pb = td.players[m.b];
  Object.assign(playerColors.p1, pa.colors);      Object.assign(playerColors.p2, pb.colors);
  Object.assign(playerBuildStats.p1, pa.build);   Object.assign(playerBuildStats.p2, pb.build);
}

function finishTournamentMatch(winner) {
  const td = tournamentData;
  const m = td.rounds[td.currentRound][td.currentMatchIdx];
  tResolveMatch(td.currentRound, td.currentMatchIdx, winner === 1 ? m.a : m.b);
  td.currentMatchIdx++;
  tAdvanceByes();
  showTournamentBracket();
}

function showTournamentBracket() { renderBracketScreen(); showScreen('tournament'); }

function renderBracketScreen() {
  const td = tournamentData;
  const el = document.getElementById('tournament-content');
  const lastRound = td.rounds[td.rounds.length - 1];
  const champion = lastRound[0].winner;

  let html = '';
  if (champion !== null) {
    html += `<div class="bracket-champion">🏆 ${tPlayerName(champion)} WINS!</div>`;
  } else {
    const m = td.rounds[td.currentRound]?.[td.currentMatchIdx];
    if (m) html += `<div class="bracket-next">▶ ${tPlayerName(m.a)} vs ${tPlayerName(m.b)}</div>`;
  }

  html += `<div class="bracket-rounds">`;
  td.rounds.forEach((round, ri) => {
    html += `<div class="bracket-round"><div class="bracket-round-label">${tRoundLabel(ri, td.rounds.length)}</div>`;
    round.forEach((m, mi) => {
      const isActive = !champion && ri === td.currentRound && mi === td.currentMatchIdx;
      const wc = (idx) => m.winner !== null ? (m.winner === idx ? 'winner' : 'loser') : '';
      html += `<div class="bracket-match${isActive ? ' active' : ''}">
        <div class="bracket-player ${wc(m.a)}">${tPlayerName(m.a)}</div>
        <div class="bracket-player ${wc(m.b)}">${tPlayerName(m.b)}</div>
      </div>`;
    });
    html += `</div>`;
  });
  html += `</div>`;

  if (!champion) {
    const m = td.rounds[td.currentRound]?.[td.currentMatchIdx];
    if (m) html += `<button id="btn-play-match" class="btn-primary" style="margin-top:18px;padding:11px 36px">
      ▶ PLAY: ${tPlayerName(m.a)} vs ${tPlayerName(m.b)}</button>`;
  }
  html += `<button id="btn-tournament-back" class="btn-back">← Main Menu</button>`;

  el.innerHTML = html;
  document.getElementById('btn-play-match')?.addEventListener('click', () => {
    loadTournamentMatch(); botMode = false; onlineMode = null; resetGame(); startGame();
  });
  document.getElementById('btn-tournament-back')?.addEventListener('click', () => {
    tournamentData = null; showScreen('start');
  });
}

// ── Tournament: setup screen ──────────────────────────────────
let tournamentPlayerCount = 4;

function renderTournamentSetup() {
  const el = document.getElementById('tournament-content');
  const count = tournamentPlayerCount;
  el.innerHTML = `
    <h2 class="tournament-title">TOURNAMENT</h2>
    <div class="t-count-row">
      <button class="stat-btn" id="t-count-minus">−</button>
      <span class="t-count-val">${count} PLAYERS</span>
      <button class="stat-btn" id="t-count-plus">+</button>
    </div>
    <div class="tournament-names" id="t-names-list">
      ${Array.from({length: count}, (_,i) => `
        <div class="t-name-row">
          <span class="t-name-label">P${i+1}</span>
          <input class="t-name-input" id="t-name-${i+1}" maxlength="12" placeholder="Player ${i+1}" value="Player ${i+1}" />
        </div>`).join('')}
    </div>
    <button id="btn-start-tournament" class="btn-primary" style="margin-top:20px;padding:11px 40px">CUSTOMIZE &amp; START</button>
    <button id="btn-back-tournament" class="btn-back">← Back</button>
  `;
  document.getElementById('t-count-minus').addEventListener('click', () => {
    if (tournamentPlayerCount > 4) { tournamentPlayerCount--; renderTournamentSetup(); }
  });
  document.getElementById('t-count-plus').addEventListener('click', () => {
    if (tournamentPlayerCount < 16) { tournamentPlayerCount++; renderTournamentSetup(); }
  });
  document.getElementById('btn-start-tournament').addEventListener('click', () => {
    const names = Array.from({length: count}, (_,i) =>
      (document.getElementById(`t-name-${i+1}`)?.value.trim() || `Player ${i+1}`));
    initTournament(names);
    openTournamentCustomize(0);
  });
  document.getElementById('btn-back-tournament').addEventListener('click', () => showScreen('start'));
}

// ── Tournament: per-player sequential customization ───────────
function openTournamentCustomize(idx) {
  const td = tournamentData;
  const p = td.players[idx];
  // Load this player's current data into the p1 slot for editing
  Object.assign(playerColors.p1, p.colors);
  Object.assign(playerBuildStats.p1, p.build);
  customizeTab = 1;
  customizeOrigin = 'tournament';
  td.customizeIdx = idx;
  renderCustomize();
  // Override the title and button text
  const title = document.querySelector('.customize-title');
  if (title) title.textContent = `${p.name.toUpperCase()} — CUSTOMIZE`;
  const btn = document.getElementById('btn-start-game');
  const isLast = idx === td.players.length - 1;
  if (btn) btn.textContent = isLast ? 'START TOURNAMENT' : 'NEXT PLAYER →';
  showScreen('customize');
}

// ── Serve ─────────────────────────────────────────────────────
function serveBall() {
  ball.served = true;
  const dir = servingPlayer === 1 ? 1 : -1;
  ball.vx = dir * (3 + Math.random());
  ball.vy = -10;
  AudioEngine.sfxServe();
}

// ── Collision helpers ─────────────────────────────────────────
function dist(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

function circleHit(bx, by, br, px, py, pr) {
  return dist(bx, by, px, py) < br + pr;
}

// ── Physics update ─────────────────────────────────────────────
function update() {
  if (state === 'point') {
    pointTimer--;
    if (pointTimer <= 0) {
      state = 'playing';
      showScreen('game');
      resetRound();
      updateJumpBtns();
    }
    return;
  }

  if (state !== 'playing') return;

  // Guest: only advance background visuals — physics run on host
  if (onlineMode === 'guest') {
    bgTime += 0.01;
    clouds.forEach(c => { c.x += c.speed; if (c.x > W + c.w) c.x = -c.w; });
    seagulls.forEach(s => { s.x += s.speed; s.wingPhase += 0.08; if (s.x > W + 30) s.x = -30; });
    particles.forEach(pt => { pt.x += pt.vx; pt.y += pt.vy; pt.vy += 0.15; pt.life--; pt.alpha = pt.life / pt.maxLife; });
    particles = particles.filter(p => p.life > 0);
    confetti.forEach(c => { c.x += c.vx; c.y += c.vy; c.vy += 0.12; c.rot += c.rotV; c.life--; c.alpha = Math.min(1, c.life / 20); });
    confetti = confetti.filter(c => c.life > 0);
    return;
  }

  bgTime += 0.01;

  clouds.forEach(c => {
    c.x += c.speed;
    if (c.x > W + c.w) c.x = -c.w;
  });

  seagulls.forEach(s => {
    s.x += s.speed;
    s.wingPhase += 0.08;
    if (s.x > W + 30) s.x = -30;
  });

  // ── Player 1 movement ──────────────────────────────────────
  const gp1 = onlineMode !== 'guest' ? readPad(0) : null;
  const p1LeftKey  = (onlineMode === 'host' && onlineControls === 'arrows') ? 'ArrowLeft'  : 'KeyA';
  const p1RightKey = (onlineMode === 'host' && onlineControls === 'arrows') ? 'ArrowRight' : 'KeyD';
  p1.vx = 0;
  if (keys[p1LeftKey]  || gp1?.left  || touchMove.p1 < 0) { p1.vx = -getPlayerSpeed('p1'); p1.facing = -1; }
  if (keys[p1RightKey] || gp1?.right || touchMove.p1 > 0) { p1.vx =  getPlayerSpeed('p1'); p1.facing =  1; }
  // Gamepad jump/serve for P1 (keyboard jump handled in keydown)
  if (gp1?.jump && !gamepadPrev[0].jump) {
    if (p1.onGround) { p1.vy = getPlayerJump('p1'); p1.onGround = false; }
    if (!ball.served && servingPlayer === 1) serveBall();
  }
  gamepadPrev[0].jump = gp1?.jump ?? false;
  p1.vy += GRAVITY;
  p1.x += p1.vx;
  p1.y += p1.vy;
  if (p1.vx !== 0) p1.walkAnim += 0.15;

  // ── Player 2 movement ──────────────────────────────────────
  p2.vy += GRAVITY;
  if (botMode) {
    updateBot(); // sets p2.vx directly
  } else {
    const gp2 = (!onlineMode) ? readPad(1) : null;
    const p2k = onlineMode === 'host' ? guestKeys : keys;
    p2.vx = 0;
    if (p2k['ArrowLeft']  || gp2?.left  || touchMove.p2 < 0) { p2.vx = -getPlayerSpeed('p2'); p2.facing = -1; }
    if (p2k['ArrowRight'] || gp2?.right || touchMove.p2 > 0) { p2.vx =  getPlayerSpeed('p2'); p2.facing =  1; }
    // Gamepad jump/serve for P2
    if (gp2?.jump && !gamepadPrev[1].jump) {
      if (p2.onGround) { p2.vy = getPlayerJump('p2'); p2.onGround = false; }
      if (!ball.served && servingPlayer === 2) serveBall();
    }
    gamepadPrev[1].jump = gp2?.jump ?? false;
  }
  p2.x += p2.vx;
  p2.y += p2.vy;
  if (p2.vx !== 0) p2.walkAnim += 0.15;

  // ── Ground collision ──────────────────────────────────────
  [p1, p2].forEach(p => {
    if (p.y >= GROUND_Y - PLAYER_R) {
      p.y = GROUND_Y - PLAYER_R;
      p.vy = 0;
      p.onGround = true;
    }
    p.x = Math.max(COURT_LEFT + PLAYER_R, Math.min(COURT_RIGHT - PLAYER_R, p.x));
    if (p.side === 1) p.x = Math.min(NET_X - PLAYER_R - 5, p.x);
    if (p.side === 2) p.x = Math.max(NET_X + PLAYER_R + 5, p.x);
    if (p.hitCooldown > 0) p.hitCooldown--;
    if (p.swingAnim > 0) p.swingAnim -= 0.15;
  });

  // ── Ball physics ─────────────────────────────────────────
  if (ball.served) {
    ball.vy += GRAVITY * 0.9;
    ball.x  += ball.vx;
    ball.y  += ball.vy;
    ball.angle += ball.vx * 0.05;
    ball.spin  *= 0.99;

    ball.trailPoints.push({ x: ball.x, y: ball.y });
    if (ball.trailPoints.length > 8) ball.trailPoints.shift();

    const NET_HALF_COL = 18;
    if (ball.x > NET_X - NET_HALF_COL && ball.x < NET_X + NET_HALF_COL && ball.y > NET_TOP_Y && ball.y < GROUND_Y) {
      ball.vx *= -0.55;
      ball.vy *= 0.45;
      ball.x = ball.vx > 0 ? NET_X + NET_HALF_COL + 1 : NET_X - NET_HALF_COL - 1;
      spawnParticles(ball.x, ball.y, 6, 'rgba(0,245,255,0.8)');
      AudioEngine.sfxNet();
    }

    [p1, p2].forEach(p => {
      if (p.hitCooldown > 0) return;
      if (circleHit(ball.x, ball.y, BALL_R, p.x, p.y - 10, PLAYER_R + 5)) {
        hitBallByPlayer(p);
      }
    });

    if (ball.y > GROUND_Y - BALL_R) {
      ball.y = GROUND_Y - BALL_R;
      if (ball.x < COURT_LEFT || ball.x > COURT_RIGHT) {
        const hitter = ball.lastHit;
        awardPoint(hitter === 1 ? 2 : 1);
      } else if (ball.x < NET_X) {
        awardPoint(2);
      } else {
        awardPoint(1);
      }
    }
  } else {
    const server = servingPlayer === 1 ? p1 : p2;
    ball.x = server.x;
    ball.y = server.y - PLAYER_R - BALL_R - 5;
  }

  particles.forEach(pt => {
    pt.x += pt.vx;
    pt.y += pt.vy;
    pt.vy += 0.15;
    pt.life--;
    pt.alpha = pt.life / pt.maxLife;
  });
  particles = particles.filter(p => p.life > 0);

  confetti.forEach(c => {
    c.x += c.vx;
    c.y += c.vy;
    c.vy += 0.12;
    c.rot += c.rotV;
    c.life--;
    c.alpha = Math.min(1, c.life / 20);
  });
  confetti = confetti.filter(c => c.life > 0);
}

function hitBallByPlayer(p) {
  p.hitCooldown = 15;
  p.swingAnim = 1;

  const dx = ball.x - p.x;
  const dy = ball.y - (p.y - 10);
  const d  = Math.sqrt(dx * dx + dy * dy) || 1;

  const pKey = p.side === 1 ? 'p1' : 'p2';
  const spd = getPlayerPower(pKey) + Math.random() * 3;
  ball.vx = (dx / d) * spd + (p.side === 1 ? 3 : -3);
  ball.vy = (dy / d) * spd - 8;

  if (p.side === 1 && ball.vx < 2)  ball.vx = 2;
  if (p.side === 2 && ball.vx > -2) ball.vx = -2;

  ball.lastHit = p.side;
  spawnParticles(ball.x, ball.y, 8, p.side === 1 ? 'rgba(0,245,255,0.8)' : 'rgba(255,45,120,0.8)');
  AudioEngine.sfxHit();
}

function spawnParticles(x, y, count, color) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const spd = 1 + Math.random() * 3;
    particles.push({
      x, y,
      vx: Math.cos(a) * spd,
      vy: Math.sin(a) * spd - 2,
      color,
      life: 20 + Math.random() * 20,
      maxLife: 40,
      alpha: 1,
      r: 2 + Math.random() * 3,
    });
  }
}

function spawnConfetti(cx, cy) {
  const colors = ['#FFD700','#FF6B35','#4ECDC4','#FF3E96','#7BFF4F','#FFFFFF'];
  for (let i = 0; i < 60; i++) {
    const a = Math.random() * Math.PI * 2;
    const spd = 3 + Math.random() * 6;
    confetti.push({
      x: cx + (Math.random() - 0.5) * 80,
      y: cy,
      vx: Math.cos(a) * spd,
      vy: Math.sin(a) * spd - 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * Math.PI * 2,
      rotV: (Math.random() - 0.5) * 0.3,
      w: 6 + Math.random() * 6,
      h: 3 + Math.random() * 3,
      life: 80 + Math.random() * 40,
      alpha: 1,
    });
  }
}

function awardPoint(winner) {
  spawnParticles(ball.x, ball.y, 20, winner === 1 ? 'rgba(0,245,255,0.9)' : 'rgba(255,45,120,0.9)');
  AudioEngine.sfxPoint();
  spawnConfetti(winner === 1 ? W * 0.25 : W * 0.75, GROUND_Y - 150);

  if (winner === 1) scoreP1++; else scoreP2++;
  updateHUD();
  servingPlayer = winner;

  let setOver = false;
  if (scoreP1 >= 7 && scoreP1 - scoreP2 >= 2) { setsP1++; setOver = true; }
  else if (scoreP2 >= 7 && scoreP2 - scoreP1 >= 2) { setsP2++; setOver = true; }

  if (setOver) {
    updateHUD();
    if (setsP1 >= 2 || setsP2 >= 2) {
      endGame(setsP1 > setsP2 ? 1 : 2);
      return;
    }
    scoreP1 = 0; scoreP2 = 0;
    currentSet++;
    updateHUD();
    showPointScreen(winner, true);
  } else {
    showPointScreen(winner, false);
  }
}

function showPointScreen(winner, setEnd) {
  state = 'point';
  updateJumpBtns();
  pointWinner = winner;
  const color = winner === 1 ? '#6EA8FF' : '#FF7070';
  const msg = setEnd
    ? `Player ${winner} wins the set!`
    : `Player ${winner} scores!`;
  const sub = setEnd ? 'Next set starting...' : 'Next serve...';

  document.getElementById('point-message').innerHTML =
    `<span style="color:${color}">${msg}</span>`;
  document.getElementById('point-sub').textContent = sub;
  showScreen('point');
  pointTimer = setEnd ? 180 : 100;
}

function endGame(winner) {
  state = 'gameover';
  updateJumpBtns();
  AudioEngine.sfxGameOver();

  // Record stats locally — both local and online games count
  // In online mode the host records stats here; guest records when it receives winner via state
  if (!onlineMode || onlineMode === 'host') {
    recordGameStats(winner);
  }

  // Tournament: advance bracket instead of normal gameover screen
  if (tournamentData) {
    finishTournamentMatch(winner);
    return;
  }

  const pName = botMode && winner === 2 ? 'Bot' : `Player ${winner}`;
  const color = winner === 1 ? '#6EA8FF' : '#FF7070';
  document.getElementById('winner-text').innerHTML =
    `<span style="color:${color}">${pName} Wins!</span>`;
  document.getElementById('final-score').textContent =
    `Sets: ${setsP1} – ${setsP2}`;
  showScreen('gameover');
  spawnConfetti(W / 2, H / 2);
}

// ── Drawing ───────────────────────────────────────────────────

function drawBackground() {
  // ── Night sky ───────────────────────────────────────────────
  const skyGrad = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  skyGrad.addColorStop(0,    '#05001a');
  skyGrad.addColorStop(0.55, '#1a0035');
  skyGrad.addColorStop(0.85, '#4a0060');
  skyGrad.addColorStop(1,    '#8b0060');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, W, GROUND_Y);

  // ── Stars ───────────────────────────────────────────────────
  ctx.save();
  for (let i = 0; i < 90; i++) {
    const sx = (i * 173 + 31) % W;
    const sy = (i * 97  + 17) % (GROUND_Y * 0.72);
    const twinkle = 0.25 + 0.75 * Math.abs(Math.sin(bgTime * 1.2 + i * 0.7));
    ctx.globalAlpha = twinkle * 0.85;
    ctx.fillStyle   = '#ffffff';
    ctx.beginPath();
    ctx.arc(sx, sy, 0.8 + (i % 3) * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // ── Synthwave sun (half-circle at horizon, with stripe cutouts) ─
  ctx.save();
  const sunX = NET_X, sunY = GROUND_Y, sunR = 155;
  // Outer glow
  const glow = ctx.createRadialGradient(sunX, sunY, sunR * 0.4, sunX, sunY, sunR * 2.2);
  glow.addColorStop(0, 'rgba(255,45,120,0.22)');
  glow.addColorStop(1, 'rgba(255,45,120,0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(sunX, sunY, sunR * 2.2, Math.PI, 0); ctx.fill();
  // Sun body
  const sunGrad = ctx.createLinearGradient(sunX, sunY - sunR, sunX, sunY);
  sunGrad.addColorStop(0,   '#ff9500');
  sunGrad.addColorStop(0.3, '#ff2d78');
  sunGrad.addColorStop(0.7, '#c800ff');
  sunGrad.addColorStop(1,   '#6600cc');
  ctx.beginPath(); ctx.arc(sunX, sunY, sunR, Math.PI, 0);
  ctx.fillStyle = sunGrad; ctx.fill();
  // Horizontal stripe cutouts (dark bars cut into the sun)
  const stripes = 10;
  for (let i = 0; i < stripes; i++) {
    const t  = i / stripes;
    const sy2 = (sunY - sunR) + t * sunR;
    const sh  = Math.pow(1 - t, 1.2) * 8 + 1;
    ctx.save();
    ctx.beginPath(); ctx.arc(sunX, sunY, sunR, Math.PI, 0); ctx.clip();
    // Approximate sky colour at this height
    const lum = Math.round(2 + t * 8);
    ctx.fillStyle = `hsl(285, 100%, ${lum}%)`;
    ctx.fillRect(sunX - sunR, sy2, sunR * 2, sh);
    ctx.restore();
  }
  // Horizon neon glow line
  ctx.shadowColor = '#ff2d78'; ctx.shadowBlur = 20;
  ctx.strokeStyle = '#ff2d78'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, GROUND_Y); ctx.lineTo(W, GROUND_Y); ctx.stroke();
  ctx.restore();

  // ── Seagulls (dark silhouettes) ─────────────────────────────
  seagulls.forEach(s => {
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = '#1a0035';
    ctx.lineWidth   = 1.5 * s.scale;
    ctx.scale(s.scale, s.scale);
    const sx2 = s.x / s.scale, sy2 = s.y / s.scale;
    const wing = Math.sin(s.wingPhase) * 8;
    ctx.beginPath();
    ctx.moveTo(sx2 - 10, sy2);
    ctx.quadraticCurveTo(sx2 - 5, sy2 - wing, sx2, sy2 + 1);
    ctx.quadraticCurveTo(sx2 + 5, sy2 - wing, sx2 + 10, sy2);
    ctx.stroke();
    ctx.restore();
  });

  // ── Dark ground base ────────────────────────────────────────
  const gndGrad = ctx.createLinearGradient(0, GROUND_Y, 0, H);
  gndGrad.addColorStop(0, '#1a0a2e');
  gndGrad.addColorStop(1, '#0a0518');
  ctx.fillStyle = gndGrad;
  ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);

  // ── Perspective grid ────────────────────────────────────────
  ctx.save();
  // Horizontal lines (denser near horizon)
  for (let i = 1; i <= 14; i++) {
    const t = i / 14;
    const gy = GROUND_Y + (H - GROUND_Y) * Math.pow(t, 0.38);
    ctx.globalAlpha = t * 0.65;
    ctx.strokeStyle = '#ff2d78';
    ctx.shadowColor = '#ff2d78'; ctx.shadowBlur = 5;
    ctx.lineWidth   = 0.6 + t * 0.8;
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
  }
  // Vertical lines converging to NET_X (vanishing point)
  ctx.shadowColor = '#00f5ff'; ctx.shadowBlur = 5;
  ctx.strokeStyle = '#00f5ff'; ctx.lineWidth = 0.6;
  for (let i = 0; i <= 26; i++) {
    const t = i / 26;
    ctx.globalAlpha = 0.18 + Math.abs(0.5 - t) * 0.25;
    ctx.beginPath();
    ctx.moveTo(NET_X, GROUND_Y);
    ctx.lineTo(W * t, H);
    ctx.stroke();
  }
  ctx.restore();

  // ── Palm trees (silhouettes) ─────────────────────────────────
  drawPalmTree(COURT_LEFT  - 70, GROUND_Y,  1);
  drawPalmTree(COURT_RIGHT + 70, GROUND_Y, -1);

  // ── Out-of-bounds darkening ──────────────────────────────────
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.fillRect(0,           GROUND_Y, COURT_LEFT,           H - GROUND_Y);
  ctx.fillRect(COURT_RIGHT, GROUND_Y, W - COURT_RIGHT,      H - GROUND_Y);
  ctx.restore();

  // ── Court zone tints ────────────────────────────────────────
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = '#00f5ff';
  ctx.fillRect(COURT_LEFT, GROUND_Y, NET_X - COURT_LEFT, H - GROUND_Y);
  ctx.fillStyle = '#ff2d78';
  ctx.fillRect(NET_X, GROUND_Y, COURT_RIGHT - NET_X, H - GROUND_Y);
  ctx.restore();

  // ── Sideline flags (neon pink) ───────────────────────────────
  function drawFlag(fx) {
    ctx.save();
    ctx.shadowColor = '#ff2d78'; ctx.shadowBlur = 10;
    ctx.fillStyle   = '#ff2d78';
    ctx.fillRect(fx - 2, GROUND_Y - 44, 3, 44);
    ctx.beginPath();
    ctx.moveTo(fx + 1, GROUND_Y - 44);
    ctx.lineTo(fx + 18, GROUND_Y - 36);
    ctx.lineTo(fx + 1,  GROUND_Y - 28);
    ctx.fill();
    ctx.restore();
  }
  drawFlag(COURT_LEFT);
  drawFlag(COURT_RIGHT);

  // ── Court lines (neon cyan) ──────────────────────────────────
  ctx.save();
  ctx.shadowColor = '#00f5ff'; ctx.shadowBlur = 8;
  ctx.strokeStyle = '#00f5ff'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(COURT_LEFT,  GROUND_Y); ctx.lineTo(COURT_LEFT,  H - 6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(COURT_RIGHT, GROUND_Y); ctx.lineTo(COURT_RIGHT, H - 6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(COURT_LEFT,  H - 6);    ctx.lineTo(NET_X,       H - 6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(NET_X,       H - 6);    ctx.lineTo(COURT_RIGHT, H - 6); ctx.stroke();
  const attackOff = (NET_X - COURT_LEFT) * 0.38;
  ctx.setLineDash([8, 6]); ctx.globalAlpha = 0.45;
  ctx.beginPath(); ctx.moveTo(NET_X - attackOff, GROUND_Y); ctx.lineTo(NET_X - attackOff, H - 6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(NET_X + attackOff, GROUND_Y); ctx.lineTo(NET_X + attackOff, H - 6); ctx.stroke();
  ctx.restore();

  // ── Zone labels ──────────────────────────────────────────────
  if (state === 'playing' || state === 'point') {
    ctx.save();
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#00f5ff';
    ctx.fillText('P1', (COURT_LEFT + NET_X) / 2, GROUND_Y + 20);
    ctx.fillStyle = '#ff2d78';
    ctx.fillText('P2', (NET_X + COURT_RIGHT) / 2, GROUND_Y + 20);
    ctx.restore();
  }
}

function drawPalmTree(x, groundY, dir) {
  ctx.save();
  ctx.globalAlpha = 0.75;
  // Trunk
  ctx.strokeStyle = '#0a0518'; ctx.lineWidth = 9; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, groundY);
  ctx.bezierCurveTo(x + dir * 12, groundY - 45, x + dir * 22, groundY - 85, x + dir * 14, groundY - 125);
  ctx.stroke();
  // Fronds
  const tip = { x: x + dir * 14, y: groundY - 125 };
  const fronds = [
    [dir * 45, -28], [dir * 55, -5], [dir * 38, 15],
    [-dir * 32, -22], [-dir * 42, 2], [dir * 18, -50],
  ];
  ctx.fillStyle = '#0a0518';
  fronds.forEach(([dx, dy]) => {
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.bezierCurveTo(
      tip.x + dx * 0.4, tip.y + dy * 0.5,
      tip.x + dx * 0.8, tip.y + dy,
      tip.x + dx,       tip.y + dy
    );
    ctx.bezierCurveTo(
      tip.x + dx * 0.7, tip.y + dy + 14,
      tip.x + dx * 0.3, tip.y + dy * 0.3 + 10,
      tip.x, tip.y
    );
    ctx.fill();
  });
  ctx.restore();
}

function drawNet() {
  const netHalf = 18;
  const netLeft  = NET_X - netHalf;
  const netRight = NET_X + netHalf;
  const poleW    = 9;
  const poleTop  = GROUND_Y - NET_H - 16;

  ctx.save();

  function drawPole(px) {
    ctx.shadowColor = '#00f5ff'; ctx.shadowBlur = 12;
    const g = ctx.createLinearGradient(px - poleW, 0, px + poleW, 0);
    g.addColorStop(0, '#1a3a4a'); g.addColorStop(0.4, '#00c8d8'); g.addColorStop(1, '#0a2a3a');
    ctx.fillStyle = g;
    ctx.fillRect(px - poleW/2, poleTop, poleW, GROUND_Y - poleTop);
    ctx.fillStyle = '#00f5ff';
    ctx.beginPath();
    ctx.roundRect(px - poleW/2 - 1, poleTop - 4, poleW + 2, 8, 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  drawPole(netLeft  - poleW/2);
  drawPole(netRight + poleW/2);

  // Net body
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(netLeft, NET_TOP_Y, netHalf * 2, NET_H);

  // Neon rope lines
  ctx.shadowColor = '#00f5ff'; ctx.shadowBlur = 6;
  ctx.strokeStyle = 'rgba(0,245,255,0.55)'; ctx.lineWidth = 1;
  const rowCount = 8;
  for (let r = 0; r <= rowCount; r++) {
    const ny = NET_TOP_Y + (r / rowCount) * NET_H;
    ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.moveTo(netLeft, ny); ctx.lineTo(netRight, ny); ctx.stroke();
  }
  ctx.globalAlpha = 0.3;
  ctx.beginPath(); ctx.moveTo(NET_X, NET_TOP_Y); ctx.lineTo(NET_X, GROUND_Y); ctx.stroke();

  // Bottom band
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(0,245,255,0.25)';
  ctx.fillRect(netLeft, GROUND_Y - 8, netHalf * 2, 8);

  // Top tape (neon pink / white)
  ctx.shadowColor = '#ff2d78'; ctx.shadowBlur = 8;
  const tapeH = 10, segs = 5;
  for (let i = 0; i < segs; i++) {
    const tx = netLeft + (i / segs) * (netHalf * 2);
    const tw = (netHalf * 2) / segs;
    ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#ff2d78';
    ctx.fillRect(tx, NET_TOP_Y - tapeH / 2, tw, tapeH);
  }
  ctx.shadowBlur = 0;

  ctx.restore();
}

function drawPlayer(p) {
  ctx.save();
  ctx.translate(p.x, p.y);

  const isP1 = p.side === 1;
  const pKey = isP1 ? 'p1' : 'p2';
  const body   = playerColors[pKey].body;
  const skin   = playerColors[pKey].skin;
  const hair   = playerColors[pKey].hair;
  const facing = p.facing;

  // Shadow
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = '#000';
  ctx.scale(1, 0.3);
  ctx.translate(0, (GROUND_Y - p.y) / 0.3);
  ctx.beginPath();
  ctx.ellipse(0, 0, PLAYER_R * 0.9, PLAYER_R * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const walk = Math.sin(p.walkAnim) * (p.onGround ? 1 : 0);
  const swing = p.swingAnim;

  // Legs
  const legLen = 16;
  const legSep = 7;
  ctx.strokeStyle = skin;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-legSep, 5);
  ctx.lineTo(-legSep + walk * 5, legLen);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(legSep, 5);
  ctx.lineTo(legSep - walk * 5, legLen);
  ctx.stroke();

  // Shorts
  ctx.fillStyle = body;
  ctx.fillRect(-legSep - 3, 0, (legSep + 3) * 2, 12);

  // Torso
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.roundRect(-10, -18, 20, 22, 4);
  ctx.fill();

  // Number on shirt
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(isP1 ? '1' : '2', 0, -7);

  // Arms
  ctx.strokeStyle = skin;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  const armSwing = swing * 20;
  ctx.save();
  ctx.translate(-12, -12);
  ctx.rotate((-0.3 + walk * 0.3) * facing);
  ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0, 14); ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.translate(12, -12);
  ctx.rotate((0.3 - walk * 0.3 - armSwing * 0.05 * facing) * facing);
  ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0, 14); ctx.stroke();
  ctx.restore();

  // Head
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(0, -26, 12, 0, Math.PI * 2);
  ctx.fill();

  // Hair
  ctx.fillStyle = hair;
  ctx.beginPath();
  ctx.ellipse(0, -32, 10, 8, 0, Math.PI, 0);
  ctx.fill();

  // Eyes
  const eyeOffX = facing * 4;
  ctx.fillStyle = '#333';
  ctx.beginPath();
  ctx.arc(eyeOffX, -26, 1.5, 0, Math.PI * 2);
  ctx.fill();

  // Hit flash ring
  if (p.swingAnim > 0.5) {
    ctx.save();
    ctx.globalAlpha = p.swingAnim * 0.5;
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, -15, PLAYER_R + 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

function drawBall() {
  ball.trailPoints.forEach((pt, i) => {
    const alpha = (i / ball.trailPoints.length) * 0.3;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#5599CC';
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, BALL_R * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  ctx.save();
  ctx.translate(ball.x, ball.y);
  ctx.rotate(ball.angle);

  ctx.save();
  const shadowY = GROUND_Y - ball.y;
  const shadowScale = Math.max(0.2, 1 - shadowY / 300);
  ctx.globalAlpha = 0.2 * shadowScale;
  ctx.fillStyle = '#000';
  ctx.scale(1, 0.4);
  ctx.translate(0, shadowY / 0.4);
  ctx.beginPath();
  ctx.ellipse(0, 0, BALL_R * shadowScale, BALL_R * 0.5 * shadowScale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.shadowColor = '#00f5ff'; ctx.shadowBlur = 18;
  const ballGrad = ctx.createRadialGradient(-4, -4, 2, 0, 0, BALL_R);
  ballGrad.addColorStop(0,   '#ffffff');
  ballGrad.addColorStop(0.5, '#d0f8ff');
  ballGrad.addColorStop(1,   '#80e8ff');
  ctx.fillStyle = ballGrad;
  ctx.beginPath();
  ctx.arc(0, 0, BALL_R, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#5599CC';
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.7;

  ctx.beginPath();
  ctx.ellipse(0, 0, BALL_R * 0.9, BALL_R * 0.35, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(0, 0, BALL_R * 0.35, BALL_R * 0.9, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.save();
  ctx.rotate(Math.PI / 4);
  ctx.beginPath();
  ctx.ellipse(0, 0, BALL_R * 0.9, BALL_R * 0.35, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.5;
  const shine = ctx.createRadialGradient(-5, -5, 0, -5, -5, 8);
  shine.addColorStop(0, 'rgba(255,255,255,0.9)');
  shine.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = shine;
  ctx.beginPath(); ctx.arc(-5, -5, 8, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  ctx.restore();
}

function drawParticles() {
  particles.forEach(p => {
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function drawConfetti() {
  confetti.forEach(c => {
    ctx.save();
    ctx.globalAlpha = c.alpha;
    ctx.fillStyle = c.color;
    ctx.translate(c.x, c.y);
    ctx.rotate(c.rot);
    ctx.fillRect(-c.w/2, -c.h/2, c.w, c.h);
    ctx.restore();
  });
}

function drawServePrompt() {
  if (ball.served) return;
  const server = servingPlayer === 1 ? p1 : p2;
  const key = servingPlayer === 1 ? 'W' : '↑';
  const col = servingPlayer === 1 ? '#6EA8FF' : '#FF7070';

  ctx.save();
  const pulse = 0.7 + Math.sin(bgTime * 5) * 0.3;
  ctx.globalAlpha = pulse;
  ctx.fillStyle = col;
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`Press ${key} to serve`, server.x, server.y - PLAYER_R - BALL_R - 20);
  ctx.restore();
}

function drawCenterLine() {
  ctx.save();
  ctx.setLineDash([6, 6]);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(NET_X, 0);
  ctx.lineTo(NET_X, NET_TOP_Y);
  ctx.stroke();
  ctx.restore();
}

// ── Main loop ─────────────────────────────────────────────────
function gameLoop() {
  update();

  ctx.clearRect(0, 0, W, H);
  drawBackground();
  drawCenterLine();
  drawNet();

  if (state === 'playing' || state === 'point') {
    drawPlayer(p1);
    drawPlayer(p2);
    drawBall();
    drawParticles();
    drawConfetti();
    if (state === 'playing') drawServePrompt();
  }

  if (state === 'gameover') {
    drawPlayer(p1);
    drawPlayer(p2);
    drawConfetti();
  }

  // Host broadcasts state every frame
  if (onlineMode === 'host' && netSocket) {
    netSocket.emit('game-state', captureState());
  }

  requestAnimationFrame(gameLoop);
}

// ── Online: state capture / apply ────────────────────────────
function captureState() {
  return {
    gs: state, scoreP1, scoreP2, setsP1, setsP2, currentSet, servingPlayer, pointTimer,
    winner: state === 'gameover' ? (setsP1 > setsP2 ? 1 : 2) : 0,
    p1: { x: p1.x, y: p1.y, vy: p1.vy, facing: p1.facing, onGround: p1.onGround, swingAnim: p1.swingAnim, walkAnim: p1.walkAnim },
    p2: { x: p2.x, y: p2.y, vy: p2.vy, facing: p2.facing, onGround: p2.onGround, swingAnim: p2.swingAnim, walkAnim: p2.walkAnim },
    ball: { x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy, angle: ball.angle, served: ball.served, lastHit: ball.lastHit, trailPoints: ball.trailPoints.slice(-6) },
    particles: particles.map(p => ({...p})),
    confetti:  confetti.map(c => ({...c})),
    pointMsg:  document.getElementById('point-message').innerHTML,
    pointSub:  document.getElementById('point-sub').textContent,
    winnerTxt: document.getElementById('winner-text').innerHTML,
    finalScr:  document.getElementById('final-score').textContent,
    // Broadcast current player colors so guest renders them correctly
    playerColors: {
      p1: { ...playerColors.p1 },
      p2: { ...playerColors.p2 },
    },
    playerBuildStats: {
      p1: { ...playerBuildStats.p1 },
      p2: { ...playerBuildStats.p2 },
    },
  };
}

function applyState(s) {
  const prevGs = state;
  state = s.gs;
  scoreP1 = s.scoreP1; scoreP2 = s.scoreP2;
  setsP1  = s.setsP1;  setsP2  = s.setsP2;
  currentSet = s.currentSet; servingPlayer = s.servingPlayer; pointTimer = s.pointTimer;

  Object.assign(p1,   s.p1);
  Object.assign(p2,   s.p2);
  Object.assign(ball, s.ball);
  particles = s.particles;
  confetti  = s.confetti;

  // Apply colors sent from host
  if (s.playerColors) {
    Object.assign(playerColors.p1, s.playerColors.p1);
    Object.assign(playerColors.p2, s.playerColors.p2);
  }
  if (s.playerBuildStats) {
    Object.assign(playerBuildStats.p1, s.playerBuildStats.p1);
    Object.assign(playerBuildStats.p2, s.playerBuildStats.p2);
  }

  document.getElementById('point-message').innerHTML  = s.pointMsg  || '';
  document.getElementById('point-sub').textContent    = s.pointSub  || '';
  document.getElementById('winner-text').innerHTML    = s.winnerTxt || '';
  document.getElementById('final-score').textContent  = s.finalScr  || '';

  updateHUD();
  if (state !== prevGs) {
    if      (state === 'playing')  showScreen('game');
    else if (state === 'point')    showScreen('point');
    else if (state === 'gameover') {
      showScreen('gameover');
      // Guest records their own stats when the host confirms game over
      if (onlineMode === 'guest' && s.winner) recordGameStats(s.winner);
    }
  }
}

// ── Online: start as host or guest ───────────────────────────
function initOnlineMode(role) {
  onlineMode = role;

  if (role === 'host') {
    netSocket.on('keys', keyState => {
      Object.assign(guestKeys, keyState);
      if (keyState['ArrowUp'] && !guestKeys['_upPrev'] && state === 'playing') {
        if (p2.onGround) { p2.vy = getPlayerJump('p2'); p2.onGround = false; }
        if (!ball.served && servingPlayer === 2) serveBall();
      }
      guestKeys['_upPrev'] = keyState['ArrowUp'];
    });

    // Guest sends their build stats before game starts — apply to P2 physics
    netSocket.on('guest-build', build => {
      Object.assign(playerBuildStats.p2, build);
    });

    // Host goes to customize (both panels) then starts game
    customizeOrigin = 'online';
    openCustomize();
  }

  if (role === 'guest') {
    let prevUp = false;
    const sendKeys = () => {
      const lk = onlineControls === 'wasd' ? 'KeyA'    : 'ArrowLeft';
      const rk = onlineControls === 'wasd' ? 'KeyD'    : 'ArrowRight';
      const uk = onlineControls === 'wasd' ? 'KeyW'    : 'ArrowUp';
      const gp = readPad(0); // Guest uses gamepad 0 on their own machine
      const up = !!keys[uk] || (gp?.jump ?? false);
      netSocket.emit('keys', {
        ArrowLeft:  !!keys[lk] || (gp?.left  ?? false),
        ArrowRight: !!keys[rk] || (gp?.right ?? false),
        ArrowUp:    up,
        _upPrev:    prevUp,
      });
      prevUp = up;
      requestAnimationFrame(sendKeys);
    };
    sendKeys();

    netSocket.on('game-state', applyState);

    // Guest goes to customize (own panel only) then waits for host state
    customizeOrigin = 'online';
    openCustomize();
  }
}

// ── Online: lobby UI ─────────────────────────────────────────
function getSocket() {
  if (!netSocket) {
    netSocket = io(window.location.origin);
    netSocket.on('opponent-left', () => {
      onlineMode = null;
      netSocket = null;
      resetGame();
      showScreen('start');
      alert('Opponent disconnected.');
    });
    // Guest receives color update from host during customize
    netSocket.on('colors', ({ playerColors: remoteColors }) => {
      if (remoteColors) {
        Object.assign(playerColors.p1, remoteColors.p1);
        Object.assign(playerColors.p2, remoteColors.p2);
      }
    });
  }
  return netSocket;
}

document.getElementById('btn-online').addEventListener('click', () => {
  ensureMusic();
  getSocket();
  document.getElementById('online-status').textContent = '';
  showScreen('online');
});

document.getElementById('btn-back-local').addEventListener('click', () => showScreen('start'));

document.getElementById('btn-create-room').addEventListener('click', () => {
  const sock = getSocket();
  sock.emit('create-room');
  sock.once('room-created', ({ code }) => {
    document.getElementById('online-status').innerHTML =
      `Room code: <strong style="color:#fff;font-size:1.4rem;letter-spacing:6px">${code}</strong><br><span style="font-size:0.8rem;color:#aaa">Waiting for opponent…</span>`;
  });
  sock.once('guest-joined', () => {
    document.getElementById('online-status').textContent = 'Opponent joined! Starting…';
    setTimeout(() => initOnlineMode('host'), 500);
  });
});

document.getElementById('btn-join-room').addEventListener('click', () => {
  const code = document.getElementById('room-code-input').value.trim().toUpperCase();
  if (code.length < 6) { document.getElementById('online-status').textContent = 'Enter a 6-character code.'; return; }
  const sock = getSocket();
  sock.emit('join-room', { code });
  sock.once('room-joined', () => {
    document.getElementById('online-status').textContent = 'Joined! Starting…';
    setTimeout(() => initOnlineMode('guest'), 500);
  });
  sock.once('join-error', ({ msg }) => {
    document.getElementById('online-status').textContent = `Error: ${msg}`;
  });
});

// ── Responsive scaling ────────────────────────────────────────
function scaleGame() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const scale = Math.min(vw / 1350, vh / 600);
  const app = document.getElementById('app');
  app.style.transform = `scale(${scale})`;
  app.style.left = Math.round((vw  - 1350 * scale) / 2) + 'px';
  app.style.top  = Math.round((vh - 600  * scale) / 2) + 'px';
}
window.addEventListener('resize', scaleGame);
// Also re-scale when device orientation changes (mobile)
window.addEventListener('orientationchange', () => setTimeout(scaleGame, 150));
scaleGame();

// ── Boot ──────────────────────────────────────────────────────
loadPlayerColors();
loadPlayerBuildStats();
initBgElements();
resetGame();
showScreen('start');
gameLoop();
