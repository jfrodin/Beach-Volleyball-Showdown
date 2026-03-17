const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');

const app    = express();
const httpServer = http.createServer(app);
const io     = new Server(httpServer);

app.use(express.static('.'));

const rooms = new Map(); // code -> { host, guest }

function makeCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

io.on('connection', socket => {

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

  // Host → Guest: full game state every frame
  socket.on('game-state', packet => {
    const room = rooms.get(socket.roomCode);
    if (room && room.guest) room.guest.emit('game-state', packet);
  });

  // Guest → Host: key inputs
  socket.on('keys', keyState => {
    const room = rooms.get(socket.roomCode);
    if (room && room.host) room.host.emit('keys', keyState);
  });

  socket.on('disconnect', () => {
    const code = socket.roomCode;
    const room = rooms.get(code);
    if (!room) return;
    if (socket.role === 'host') {
      if (room.guest) room.guest.emit('opponent-left');
      rooms.delete(code);
    } else {
      room.guest = null;
      room.host.emit('opponent-left');
    }
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
