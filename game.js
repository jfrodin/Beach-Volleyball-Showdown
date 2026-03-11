// ============================================================
//  Beach Volleyball Showdown - game.js
// ============================================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const W = canvas.width;   // 900
const H = canvas.height;  // 550

// ── Layout constants ─────────────────────────────────────────
const GROUND_Y   = H - 80;   // sand surface
const NET_X      = W / 2;
const NET_H      = 120;
const NET_TOP_Y  = GROUND_Y - NET_H;
const GRAVITY    = 0.45;
const JUMP_VY    = -12;
const PLAYER_SPD = 4.5;
const BALL_R     = 14;
const PLAYER_R   = 22;

// ── Colour palette ───────────────────────────────────────────
const PALETTE = {
  skyTop:    '#1a6ba0',
  skyBot:    '#87CEEB',
  sun:       '#FFE44D',
  sandTop:   '#F5DEB3',
  sandBot:   '#C8A96A',
  netPole:   '#8B4513',
  netLine:   'rgba(255,255,255,0.9)',
  netShadow: 'rgba(0,0,0,0.3)',
  p1Body:    '#4682B4',
  p1Skin:    '#FFDAB9',
  p1Hair:    '#2C3E50',
  p2Body:    '#CC3333',
  p2Skin:    '#FFB347',
  p2Hair:    '#1a1a1a',
  ballBase:  '#F5F5F5',
  ballLine:  '#5599CC',
  shadow:    'rgba(0,0,0,0.25)',
};

// ── State ─────────────────────────────────────────────────────
let state = 'start';   // start | playing | point | gameover
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

const keys = {};

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
}

function resetGame() {
  scoreP1 = 0; scoreP2 = 0;
  setsP1 = 0;  setsP2 = 0;
  currentSet = 1;
  servingPlayer = 1;
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
    if ((e.code === 'KeyW') && p1.onGround) { p1.vy = JUMP_VY; p1.onGround = false; }
    if ((e.code === 'ArrowUp') && p2.onGround) { p2.vy = JUMP_VY; p2.onGround = false; }
    // Serve
    if (!ball.served) {
      if (e.code === 'KeyW' && servingPlayer === 1) serveBall();
      if (e.code === 'ArrowUp' && servingPlayer === 2) serveBall();
    }
  }
});
document.addEventListener('keyup', e => { keys[e.code] = false; });

document.getElementById('btn-start').addEventListener('click', startGame);
document.getElementById('btn-restart').addEventListener('click', () => {
  resetGame();
  startGame();
});

function startGame() {
  state = 'playing';
  showScreen('game');
  updateHUD();
}

// ── Serve ─────────────────────────────────────────────────────
function serveBall() {
  ball.served = true;
  const dir = servingPlayer === 1 ? 1 : -1;
  ball.vx = dir * (3 + Math.random());
  ball.vy = -10;
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
  // Point screen timeout — must run even when state === 'point'
  if (state === 'point') {
    pointTimer--;
    if (pointTimer <= 0) {
      state = 'playing';
      showScreen('game');
      resetRound();
    }
    return;
  }

  if (state !== 'playing') return;

  bgTime += 0.01;

  // Move clouds
  clouds.forEach(c => {
    c.x += c.speed;
    if (c.x > W + c.w) c.x = -c.w;
  });

  // Move seagulls
  seagulls.forEach(s => {
    s.x += s.speed;
    s.wingPhase += 0.08;
    if (s.x > W + 30) s.x = -30;
  });

  // ── Player 1 movement ──────────────────────────────────────
  p1.vx = 0;
  if (keys['KeyA']) { p1.vx = -PLAYER_SPD; p1.facing = -1; }
  if (keys['KeyD']) { p1.vx =  PLAYER_SPD; p1.facing =  1; }
  p1.vy += GRAVITY;
  p1.x += p1.vx;
  p1.y += p1.vy;
  if (p1.vx !== 0) p1.walkAnim += 0.15;

  // ── Player 2 movement ──────────────────────────────────────
  p2.vx = 0;
  if (keys['ArrowLeft'])  { p2.vx = -PLAYER_SPD; p2.facing = -1; }
  if (keys['ArrowRight']) { p2.vx =  PLAYER_SPD; p2.facing =  1; }
  p2.vy += GRAVITY;
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
    // Side walls
    p.x = Math.max(PLAYER_R, Math.min(W - PLAYER_R, p.x));
    // Net collision: keep players on their side
    if (p.side === 1) p.x = Math.min(NET_X - PLAYER_R - 5, p.x);
    if (p.side === 2) p.x = Math.max(NET_X + PLAYER_R + 5, p.x);
    // Cooldowns
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

    // Trail
    ball.trailPoints.push({ x: ball.x, y: ball.y });
    if (ball.trailPoints.length > 8) ball.trailPoints.shift();

    // Net collision
    if (ball.x > NET_X - 8 && ball.x < NET_X + 8 && ball.y > NET_TOP_Y && ball.y < GROUND_Y) {
      ball.vx *= -0.6;
      ball.x = ball.vx > 0 ? NET_X + 9 : NET_X - 9;
      ball.vy *= 0.5;
      spawnParticles(ball.x, ball.y, 5, 'rgba(255,255,255,0.6)');
    }

    // Side walls
    if (ball.x < BALL_R) { ball.x = BALL_R; ball.vx = Math.abs(ball.vx) * 0.7; }
    if (ball.x > W - BALL_R) { ball.x = W - BALL_R; ball.vx = -Math.abs(ball.vx) * 0.7; }

    // Player hit detection
    [p1, p2].forEach(p => {
      if (p.hitCooldown > 0) return;
      if (circleHit(ball.x, ball.y, BALL_R, p.x, p.y - 10, PLAYER_R + 5)) {
        hitBallByPlayer(p);
      }
    });

    // Ground — point scored!
    if (ball.y > GROUND_Y - BALL_R) {
      ball.y = GROUND_Y - BALL_R;
      if (ball.x < NET_X) {
        // Landed on P1's side → P2 scores
        awardPoint(2);
      } else {
        // Landed on P2's side → P1 scores
        awardPoint(1);
      }
    }
  } else {
    // Ball rides above serving player
    const server = servingPlayer === 1 ? p1 : p2;
    ball.x = server.x;
    ball.y = server.y - PLAYER_R - BALL_R - 5;
  }

  // Update particles
  particles.forEach(pt => {
    pt.x += pt.vx;
    pt.y += pt.vy;
    pt.vy += 0.15;
    pt.life--;
    pt.alpha = pt.life / pt.maxLife;
  });
  particles = particles.filter(p => p.life > 0);

  // Update confetti
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

  // Reflect + boost towards opponent side
  const spd = 10 + Math.random() * 3;
  ball.vx = (dx / d) * spd + (p.side === 1 ? 3 : -3);
  ball.vy = (dy / d) * spd - 8;

  // Clamp so it always goes to opponent side
  if (p.side === 1 && ball.vx < 2)  ball.vx = 2;
  if (p.side === 2 && ball.vx > -2) ball.vx = -2;

  ball.lastHit = p.side;
  spawnParticles(ball.x, ball.y, 8, 'rgba(255,220,100,0.7)');
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
  spawnParticles(ball.x, ball.y, 20, winner === 1 ? 'rgba(100,160,255,0.8)' : 'rgba(255,100,100,0.8)');
  spawnConfetti(winner === 1 ? W * 0.25 : W * 0.75, GROUND_Y - 150);

  if (winner === 1) scoreP1++; else scoreP2++;
  updateHUD();
  servingPlayer = winner;

  let setOver = false;
  if (scoreP1 >= 7 && scoreP1 - scoreP2 >= 2) { setsP1++; setOver = true; }
  else if (scoreP2 >= 7 && scoreP2 - scoreP1 >= 2) { setsP2++; setOver = true; }
  else if (scoreP1 >= 7 || scoreP2 >= 7) {
    // Deuce-like: need 2 ahead
  }

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
  const color = winner === 1 ? '#6EA8FF' : '#FF7070';
  document.getElementById('winner-text').innerHTML =
    `<span style="color:${color}">Player ${winner} Wins!</span>`;
  document.getElementById('final-score').textContent =
    `Sets: ${setsP1} – ${setsP2}`;
  showScreen('gameover');
  spawnConfetti(W / 2, H / 2);
}

// ── Drawing ───────────────────────────────────────────────────

function drawBackground() {
  // Sky gradient
  const skyGrad = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  skyGrad.addColorStop(0, '#0d4f80');
  skyGrad.addColorStop(1, '#87CEEB');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, W, GROUND_Y);

  // Sun
  ctx.save();
  const sunX = W * 0.12, sunY = 70;
  // Sun glow
  const sunGlow = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 70);
  sunGlow.addColorStop(0, 'rgba(255,230,80,0.4)');
  sunGlow.addColorStop(1, 'rgba(255,230,80,0)');
  ctx.fillStyle = sunGlow;
  ctx.beginPath(); ctx.arc(sunX, sunY, 70, 0, Math.PI * 2); ctx.fill();
  // Sun body
  ctx.fillStyle = '#FFE44D';
  ctx.beginPath(); ctx.arc(sunX, sunY, 28, 0, Math.PI * 2); ctx.fill();
  // Sun rays
  ctx.strokeStyle = 'rgba(255,230,80,0.5)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + bgTime * 0.3;
    ctx.beginPath();
    ctx.moveTo(sunX + Math.cos(a) * 34, sunY + Math.sin(a) * 34);
    ctx.lineTo(sunX + Math.cos(a) * 46, sunY + Math.sin(a) * 46);
    ctx.stroke();
  }
  ctx.restore();

  // Clouds
  clouds.forEach(c => {
    ctx.save();
    ctx.globalAlpha = c.opacity * 0.85;
    ctx.fillStyle = '#ffffff';
    drawCloud(c.x, c.y, c.w);
    ctx.restore();
  });

  // Seagulls
  seagulls.forEach(s => {
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1.5 * s.scale;
    ctx.scale(s.scale, s.scale);
    const sx = s.x / s.scale, sy = s.y / s.scale;
    const wing = Math.sin(s.wingPhase) * 8;
    ctx.beginPath();
    ctx.moveTo(sx - 10, sy);
    ctx.quadraticCurveTo(sx - 5, sy - wing, sx, sy + 1);
    ctx.quadraticCurveTo(sx + 5, sy - wing, sx + 10, sy);
    ctx.stroke();
    ctx.restore();
  });

  // Ocean sparkles far
  ctx.save();
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 8; i++) {
    const ox = (i * 130 + bgTime * 20) % W;
    const oy = GROUND_Y - 40 + Math.sin(bgTime + i) * 5;
    ctx.beginPath(); ctx.arc(ox, oy, 2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  // Sand
  const sandGrad = ctx.createLinearGradient(0, GROUND_Y, 0, H);
  sandGrad.addColorStop(0, '#F5DEB3');
  sandGrad.addColorStop(1, '#C8A96A');
  ctx.fillStyle = sandGrad;
  ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);

  // Sand texture
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = '#8B6914';
  for (let i = 0; i < 60; i++) {
    const tx = (i * 53 + 7) % W;
    const ty = GROUND_Y + 5 + (i * 17) % (H - GROUND_Y - 10);
    ctx.beginPath(); ctx.arc(tx, ty, 1.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  // Sand line highlight
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, GROUND_Y); ctx.lineTo(W, GROUND_Y); ctx.stroke();
  ctx.restore();
}

function drawCloud(x, y, w) {
  const h = w * 0.4;
  ctx.beginPath();
  ctx.ellipse(x, y, w * 0.5, h * 0.5, 0, 0, Math.PI * 2);
  ctx.ellipse(x + w * 0.2, y - h * 0.3, w * 0.3, h * 0.4, 0, 0, Math.PI * 2);
  ctx.ellipse(x - w * 0.2, y - h * 0.2, w * 0.25, h * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawNet() {
  const poleW = 8;
  const poleH = NET_H + 20;

  // Left pole
  ctx.save();
  const poleGrad = ctx.createLinearGradient(NET_X - NET_H*1.3 - poleW, 0, NET_X - NET_H*1.3 + poleW, 0);
  poleGrad.addColorStop(0, '#5a2d00');
  poleGrad.addColorStop(0.5, '#a0522d');
  poleGrad.addColorStop(1, '#5a2d00');
  ctx.fillStyle = poleGrad;
  const lp = NET_X - 200;
  ctx.fillRect(lp - poleW/2, GROUND_Y - poleH, poleW, poleH);
  ctx.fillStyle = '#c0703a';
  ctx.fillRect(lp - poleW/2 - 3, GROUND_Y - poleH - 6, poleW + 6, 10);

  // Right pole
  const rp = NET_X + 200;
  ctx.fillStyle = poleGrad;
  ctx.fillRect(rp - poleW/2, GROUND_Y - poleH, poleW, poleH);
  ctx.fillStyle = '#c0703a';
  ctx.fillRect(rp - poleW/2 - 3, GROUND_Y - poleH - 6, poleW + 6, 10);
  ctx.restore();

  // Shadow under net top rope
  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(lp, NET_TOP_Y + 4);
  ctx.lineTo(rp, NET_TOP_Y + 4);
  ctx.stroke();
  ctx.restore();

  // Net grid
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1;
  const netLeft = lp;
  const netRight = rp;
  const netW = netRight - netLeft;
  const cols = 14;
  const rows = 7;
  for (let c = 0; c <= cols; c++) {
    const nx = netLeft + (c / cols) * netW;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(nx, NET_TOP_Y);
    ctx.lineTo(nx, GROUND_Y);
    ctx.stroke();
  }
  for (let r = 0; r <= rows; r++) {
    const ny = NET_TOP_Y + (r / rows) * NET_H;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(netLeft, ny);
    ctx.lineTo(netRight, ny);
    ctx.stroke();
  }

  // Top tape (white/blue alternating)
  const tapeH = 8;
  const segments = 10;
  for (let i = 0; i < segments; i++) {
    const tx = netLeft + (i / segments) * netW;
    const tw = netW / segments;
    ctx.globalAlpha = 1;
    ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#3377CC';
    ctx.fillRect(tx, NET_TOP_Y - tapeH / 2, tw, tapeH);
  }

  // Bottom tape
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.8;
  ctx.fillRect(netLeft, GROUND_Y - 6, netW, 6);

  ctx.restore();
}

function drawPlayer(p) {
  ctx.save();
  ctx.translate(p.x, p.y);

  const isP1 = p.side === 1;
  const body   = isP1 ? PALETTE.p1Body : PALETTE.p2Body;
  const skin   = isP1 ? PALETTE.p1Skin : PALETTE.p2Skin;
  const hair   = isP1 ? PALETTE.p1Hair : PALETTE.p2Hair;
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

  // Walk/swing animation
  const walk = Math.sin(p.walkAnim) * (p.onGround ? 1 : 0);
  const swing = p.swingAnim;

  // Legs
  const legLen = 16;
  const legSep = 7;
  ctx.strokeStyle = skin;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  // Left leg
  ctx.beginPath();
  ctx.moveTo(-legSep, 5);
  ctx.lineTo(-legSep + walk * 5, legLen);
  ctx.stroke();
  // Right leg
  ctx.beginPath();
  ctx.moveTo(legSep, 5);
  ctx.lineTo(legSep - walk * 5, legLen);
  ctx.stroke();

  // Shorts
  ctx.fillStyle = body;
  ctx.fillRect(-legSep - 3, 0, (legSep + 3) * 2, 12);

  // Body (torso)
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
  // Left arm
  ctx.save();
  ctx.translate(-12, -12);
  ctx.rotate((-0.3 + walk * 0.3) * facing);
  ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0, 14); ctx.stroke();
  ctx.restore();
  // Right arm (hits)
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
  // Trail
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

  // Shadow
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

  // Ball base
  const ballGrad = ctx.createRadialGradient(-4, -4, 2, 0, 0, BALL_R);
  ballGrad.addColorStop(0, '#ffffff');
  ballGrad.addColorStop(0.4, '#F0F0F0');
  ballGrad.addColorStop(1, '#CCCCCC');
  ctx.fillStyle = ballGrad;
  ctx.beginPath();
  ctx.arc(0, 0, BALL_R, 0, Math.PI * 2);
  ctx.fill();

  // Volleyball seam lines
  ctx.strokeStyle = '#5599CC';
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.7;

  // Horizontal curve
  ctx.beginPath();
  ctx.ellipse(0, 0, BALL_R * 0.9, BALL_R * 0.35, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Vertical curve
  ctx.beginPath();
  ctx.ellipse(0, 0, BALL_R * 0.35, BALL_R * 0.9, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Diagonal seams
  ctx.save();
  ctx.rotate(Math.PI / 4);
  ctx.beginPath();
  ctx.ellipse(0, 0, BALL_R * 0.9, BALL_R * 0.35, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Shine
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

  requestAnimationFrame(gameLoop);
}

// ── Boot ──────────────────────────────────────────────────────
initBgElements();
resetGame();
showScreen('start');
gameLoop();
