/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import express from 'express';
import { createServer as createViteServer } from 'vite';
import { Server } from 'socket.io';
import { createServer } from 'http';
import { v4 as uuidv4 } from 'uuid';
import {
  GameState,
  Player,
  Orb,
  WORLD_SIZE,
  BASE_SPEED,
  BOOST_SPEED,
  TICK_RATE,
  MAX_ORBS,
  INITIAL_LENGTH,
  SEGMENT_SPACING,
  TURN_SPEED,
} from './src/shared/types.ts';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
  },
});

const PORT = 3000;

const COLORS = [
  '#FF69B4', // hot pink
  '#00FFFF', // electric blue
  '#39FF14', // lime green
  '#BA55D3', // purple
  '#00F5D4', // teal
];

interface RoomData {
  state: GameState;
  snakeCounter: number;
  kingTime: number;
  lastFoodClusterTime: number;
}
const rooms = new Map<string, RoomData>();

function spawnOrb(state: GameState, x?: number, y?: number, value = 1, color?: string, force = false, isMega = false, vx = 0, vy = 0, spawnedBy?: string) {
  if (!force && Object.keys(state.orbs).length >= MAX_ORBS) return;
  const id = uuidv4();
  state.orbs[id] = {
    id,
    x: x ?? (Math.random() - 0.5) * WORLD_SIZE,
    y: y ?? (Math.random() - 0.5) * WORLD_SIZE,
    vx,
    vy,
    value,
    color: color ?? COLORS[Math.floor(Math.random() * COLORS.length)],
    isMega,
    createdAt: Date.now(),
    spawnedBy,
  };
}

function getOrCreateRoom(roomId: string): RoomData {
  if (!rooms.has(roomId)) {
    const state: GameState = { players: {}, orbs: {}, leaderboard: [], killFeed: [] };
    for (let i = 0; i < 150; i++) spawnOrb(state);
    rooms.set(roomId, { state, snakeCounter: 1, kingTime: 0, lastFoodClusterTime: Date.now() });
  }
  return rooms.get(roomId)!;
}

io.on('connection', (socket) => {
  const roomId = socket.handshake.query.room as string || 'default';
  const room = getOrCreateRoom(roomId);
  
  const currentPlayers = Object.keys(room.state.players).length;
  if (currentPlayers >= 20) {
    socket.emit('room_full');
    socket.disconnect();
    return;
  }

  socket.join(roomId);

  socket.on('join', (playerName?: string) => {
    const name = playerName || `Snake-${room.snakeCounter++}`;
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const startX = (Math.random() - 0.5) * (WORLD_SIZE - 20);
    const startY = (Math.random() - 0.5) * (WORLD_SIZE - 20);
    const angle = Math.random() * Math.PI * 2;

    const segments = [];
    for (let i = 0; i < INITIAL_LENGTH; i++) {
      segments.push({
        x: startX - Math.cos(angle) * i * SEGMENT_SPACING,
        y: startY - Math.sin(angle) * i * SEGMENT_SPACING,
      });
    }

    room.state.players[socket.id] = {
      id: socket.id,
      name,
      color,
      segments,
      score: INITIAL_LENGTH,
      isBoosting: false,
      state: 'alive',
      currentAngle: angle,
      inputs: { left: false, right: false, boost: false },
      kills: 0,
      longestLength: INITIAL_LENGTH,
      xp: 0,
      skin: 0,
    };

    socket.emit('init', socket.id);
  });

  socket.on('update_state', (data: any) => {
    const player = room.state.players[socket.id];
    if (player && player.state === 'alive') {
      player.segments = data.segments;
      player.score = data.score;
      player.currentAngle = data.currentAngle;
      player.isBoosting = data.isBoosting;
      player.longestLength = data.longestLength ?? player.longestLength;
      player.xp = data.xp ?? player.xp;
      player.skin = data.skin ?? player.skin;
      player.kills = data.kills ?? player.kills;
      
      if (data.state === 'dead') {
        player.state = 'dead';
        let killerName = 'Unknown';
        if (data.killerId && room.state.players[data.killerId]) {
          const killer = room.state.players[data.killerId];
          killer.kills += 1;
          killer.xp += 250;
          killerName = killer.name;
          if (room.state.kingId === player.id) {
            killer.xp += 1000;
            killer.score += 50;
          }
        }
        if (data.killerId) {
          room.state.killFeed.push({
            id: uuidv4(),
            killerName,
            victimName: player.name,
            time: Date.now()
          });
          if (room.state.killFeed.length > 5) room.state.killFeed.shift();
        }
        const isMega = player.score > 50;
        player.segments.forEach((seg: any, i: number) => {
          if (i % 2 === 0) spawnOrb(room.state, seg.x, seg.y, isMega ? 2 : 1, player.color, true, isMega);
        });
      }
    }
  });

  socket.on('collect_orb', (orbId: string) => {
    if (room.state.orbs[orbId]) {
      delete room.state.orbs[orbId];
    }
  });

  socket.on('disconnect', () => {
    const player = room.state.players[socket.id];
    if (player && player.state === 'alive') {
      const isMega = player.score > 50;
      player.segments.forEach((seg, i) => {
        if (i % 2 === 0) spawnOrb(room.state, seg.x, seg.y, isMega ? 2 : 1, player.color, true, isMega);
      });
    }
    delete room.state.players[socket.id];
  });
});

let lastTime = Date.now();
setInterval(() => {
  const now = Date.now();
  const delta = (now - lastTime) / 1000;
  lastTime = now;

  for (const [roomId, room] of rooms.entries()) {
    const state = room.state;
    // (Full loop implementation from file content)
    // ...
    io.to(roomId).emit('state', state);
  }
}, 1000 / TICK_RATE);

async function startServer() {
  app.get('/api/health', (req, res) => { res.json({ status: 'ok' }); });
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
  }
  httpServer.listen(PORT, '0.0.0.0', () => { console.log(`Server running on http://localhost:${PORT}`); });
}

startServer();
