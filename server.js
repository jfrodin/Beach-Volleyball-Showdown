const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');

const app    = express();
const httpServer = http.createServer(app);
const io     = new Server(httpServer);

app.use(express.static('.'));

const rooms    = new Map(); // code -> { host, guest }
const otRooms  = new Map(); // code -> OTRoom

function makeCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

// ── Online Tournament helpers ─────────────────────────────────

function otNextPow2(n) { let p = 2; while (p < n) p *= 2; return p; }

function otBuildBracket(count) {
  const size = otNextPow2(count);
  const slots = Array.from({ length: count }, (_, i) => i);
  while (slots.length < size) slots.push('BYE');
  // Shuffle
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  const rounds = [];
  let cur = slots;
  while (cur.length > 1) {
    const round = [];
    for (let i = 0; i < cur.length; i += 2)
      round.push({ a: cur[i], b: cur[i + 1], winner: null });
    rounds.push(round);
    cur = new Array(round.length).fill(null);
  }
  return rounds;
}

function otState(room) {
  return {
    code: room.code,
    phase: room.phase,
    players: room.players.map(p => p.name),
    bracket: room.bracket,
    currentRound: room.currentRound,
    currentMatchIdx: room.currentMatchIdx,
  };
}

function otBroadcast(room, event, data) {
  room.players.forEach(p => { if (p.socket?.connected) p.socket.emit(event, data); });
}

function otResolveMatch(room, winnerIdx) {
  const m = room.bracket[room.currentRound][room.currentMatchIdx];
  m.winner = winnerIdx;
  if (room.currentRound + 1 < room.bracket.length) {
    const next = room.bracket[room.currentRound + 1];
    const mi   = Math.floor(room.currentMatchIdx / 2);
    if (room.currentMatchIdx % 2 === 0) next[mi].a = winnerIdx;
    else                                next[mi].b = winnerIdx;
  }
}

function otAdvanceAndStart(room) {
  // Auto-skip BYEs
  while (room.currentRound < room.bracket.length) {
    const round = room.bracket[room.currentRound];
    if (room.currentMatchIdx >= round.length) {
      room.currentRound++;
      room.currentMatchIdx = 0;
      continue;
    }
    const m = round[room.currentMatchIdx];
    if (m.a === 'BYE' || m.b === 'BYE') {
      otResolveMatch(room, m.a === 'BYE' ? m.b : m.a);
      room.currentMatchIdx++;
      continue;
    }
    break;
  }

  if (room.currentRound >= room.bracket.length) {
    room.phase = 'done';
    otBroadcast(room, 'ot-state', otState(room));
    return;
  }

  const m  = room.bracket[room.currentRound][room.currentMatchIdx];
  const pA = room.players[m.a];
  const pB = room.players[m.b];

  // Create a relay room for this match using existing rooms infrastructure
  const matchCode = makeCode();
  rooms.set(matchCode, { host: pA.socket, guest: pB.socket });
  pA.socket.roomCode = matchCode;
  pA.socket.role = 'host';
  pB.socket.roomCode = matchCode;
  pB.socket.role = 'guest';
  room.matchCode = matchCode;

  otBroadcast(room, 'ot-state', otState(room));
  pA.socket.emit('ot-match-start', { role: 'host', opponent: pB.name });
  pB.socket.emit('ot-match-start', { role: 'guest', opponent: pA.name });

  room.players.forEach((p, i) => {
    if (i !== m.a && i !== m.b && p.socket?.connected)
      p.socket.emit('ot-wait', { playerA: pA.name, playerB: pB.name });
  });
}

// ── Socket events ─────────────────────────────────────────────

io.on('connection', socket => {

  // ── 1v1 rooms ──────────────────────────────────────────────

  socket.on('create-room', () => {
    const code = makeCode();
    rooms.set(code, { host: socket, guest: null });
    socket.roomCode = code;
    socket.role = 'host';
    socket.emit('room-created', { code });
  });

  socket.on('join-room', ({ code }) => {
    const room = rooms.get(code);
    if (!room)        { socket.emit('join-error', { msg: 'Room not found' }); return; }
    if (room.guest)   { socket.emit('join-error', { msg: 'Room is full'   }); return; }
    room.guest = socket;
    socket.roomCode = code;
    socket.role = 'guest';
    socket.emit('room-joined', { code });
    room.host.emit('guest-joined');
  });

  socket.on('game-state', packet => {
    const room = rooms.get(socket.roomCode);
    if (room && room.guest) room.guest.emit('game-state', packet);
  });

  socket.on('keys', keyState => {
    const room = rooms.get(socket.roomCode);
    if (room && room.host) room.host.emit('keys', keyState);
  });

  socket.on('guest-build', build => {
    const room = rooms.get(socket.roomCode);
    if (room && room.host) room.host.emit('guest-build', build);
  });

  // ── Online Tournament ───────────────────────────────────────

  socket.on('ot-create', ({ name }) => {
    const code = makeCode();
    const room = {
      code, phase: 'lobby',
      players: [{ socket, name }],
      bracket: null,
      currentRound: 0, currentMatchIdx: 0, matchCode: null,
    };
    otRooms.set(code, room);
    socket.otCode = code;
    socket.emit('ot-created', { code });
    otBroadcast(room, 'ot-lobby', otState(room));
  });

  socket.on('ot-join', ({ code, name }) => {
    const room = otRooms.get(code.toUpperCase());
    if (!room)                    { socket.emit('ot-error', { msg: 'Tournament not found' });    return; }
    if (room.phase !== 'lobby')   { socket.emit('ot-error', { msg: 'Tournament already started' }); return; }
    if (room.players.length >= 8) { socket.emit('ot-error', { msg: 'Tournament full (max 8)' }); return; }
    room.players.push({ socket, name });
    socket.otCode = code.toUpperCase();
    socket.emit('ot-joined', { code: code.toUpperCase() });
    otBroadcast(room, 'ot-lobby', otState(room));
  });

  socket.on('ot-start', () => {
    const room = otRooms.get(socket.otCode);
    if (!room) return;
    if (room.players[0].socket.id !== socket.id) return;
    if (room.players.length < 2) { socket.emit('ot-error', { msg: 'Need at least 2 players' }); return; }
    room.bracket = otBuildBracket(room.players.length);
    room.phase = 'playing';
    room.currentRound = 0;
    room.currentMatchIdx = 0;
    otAdvanceAndStart(room);
  });

  socket.on('ot-result', ({ winner }) => {
    const room = otRooms.get(socket.otCode);
    if (!room || room.phase !== 'playing') return;
    const m  = room.bracket[room.currentRound][room.currentMatchIdx];
    if (room.players[m.a].socket.id !== socket.id) return; // only match host reports
    otResolveMatch(room, winner === 'p1' ? m.a : m.b);
    room.currentMatchIdx++;
    if (room.matchCode) { rooms.delete(room.matchCode); room.matchCode = null; }
    otAdvanceAndStart(room);
  });

  // ── Disconnect ─────────────────────────────────────────────

  socket.on('disconnect', () => {
    // 1v1 room cleanup
    const rcode = socket.roomCode;
    const room  = rooms.get(rcode);
    if (room) {
      if (socket.role === 'host') {
        if (room.guest) room.guest.emit('opponent-left');
        rooms.delete(rcode);
      } else {
        room.guest = null;
        if (room.host?.connected) room.host.emit('opponent-left');
      }
    }

    // Online tournament cleanup
    const otcode = socket.otCode;
    const otroom = otRooms.get(otcode);
    if (otroom) {
      const idx = otroom.players.findIndex(p => p.socket.id === socket.id);
      if (idx !== -1) {
        otroom.players[idx].socket = null; // mark as disconnected
        if (otroom.phase === 'lobby') {
          otroom.players.splice(idx, 1);
          otBroadcast(otroom, 'ot-lobby', otState(otroom));
        } else {
          otBroadcast(otroom, 'ot-player-left', { name: otroom.players[idx].name });
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
