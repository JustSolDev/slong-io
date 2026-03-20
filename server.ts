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
  console.log(`Player ${socket.id} joined room ${roomId}`);

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
        
        // Award kill to the killer
        let killerName = 'Unknown';
        if (data.killerId && room.state.players[data.killerId]) {
          const killer = room.state.players[data.killerId];
          killer.kills += 1;
          killer.xp += 250; // 250 XP per kill
          killerName = killer.name;
          
          // Bonus for killing the King
          if (room.state.kingId === player.id) {
            killer.xp += 1000;
            killer.score += 50;
          }
        }

        // Add to kill feed
        if (data.killerId) {
          room.state.killFeed.push({
            id: uuidv4(),
            killerName,
            victimName: player.name,
            time: Date.now()
          });
          if (room.state.killFeed.length > 5) room.state.killFeed.shift();
        }

        // Drop orbs (Mega explosion if large)
        const isMega = player.score > 50;
        if (isMega) {
          room.state.announcement = { text: "MEGA FEAST!", time: Date.now() };
        }
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
    console.log(`Player ${socket.id} disconnected from room ${roomId}`);
    const player = room.state.players[socket.id];
    if (player && player.state === 'alive') {
      // Drop orbs
      const isMega = player.score > 50;
      player.segments.forEach((seg, i) => {
        if (i % 2 === 0) spawnOrb(room.state, seg.x, seg.y, isMega ? 2 : 1, player.color, true, isMega);
      });
    }
    delete room.state.players[socket.id];
  });
});

// Game Loop
let lastTime = Date.now();
setInterval(() => {
  const now = Date.now();
  const delta = (now - lastTime) / 1000;
  lastTime = now;

  for (const [roomId, room] of rooms.entries()) {
    const state = room.state;
    
    const connectedSockets = io.sockets.adapter.rooms.get(roomId)?.size || 0;
    if (connectedSockets === 0) {
      rooms.delete(roomId);
      continue;
    }

    // Bot logic
    const players = Object.values(state.players);
    const humanCount = players.filter(p => !p.isBot && p.state === 'alive').length;
    const botCount = players.filter(p => p.isBot && p.state === 'alive').length;
    
    // Spawn bots if needed (up to 5 bots if few humans)
    if (humanCount > 0 && humanCount + botCount < 10 && Math.random() < 0.05) {
      const id = 'bot-' + uuidv4();
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
      state.players[id] = {
        id,
        name: `Bot-${Math.floor(Math.random() * 1000)}`,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        segments,
        score: INITIAL_LENGTH,
        isBoosting: false,
        state: 'alive',
        currentAngle: angle,
        inputs: { left: false, right: false, boost: false },
        kills: 0,
        longestLength: INITIAL_LENGTH,
        xp: 0,
        skin: Math.floor(Math.random() * 3),
        isBot: true
      };
    }

    // Food Cluster Event
    if (now - room.lastFoodClusterTime > 45000) {
      room.lastFoodClusterTime = now;
      state.announcement = { text: "FOOD RUSH!", time: Date.now() };
      const clusterX = (Math.random() - 0.5) * (WORLD_SIZE - 40);
      const clusterY = (Math.random() - 0.5) * (WORLD_SIZE - 40);
      for (let i = 0; i < 50; i++) {
        spawnOrb(state, clusterX + (Math.random() - 0.5) * 20, clusterY + (Math.random() - 0.5) * 20, 1, undefined, true, true);
      }
    }

    // Update bots
    for (const id in state.players) {
      const player = state.players[id];
      if (player.state === 'alive' && player.isBot) {
        // AI Logic
        let targetAngle = player.currentAngle;
        
        // Find nearest food
        let nearestOrb = null;
        let minDist = 30; // Vision range
        for (const orbId in state.orbs) {
          const orb = state.orbs[orbId];
          const dist = Math.hypot(orb.x - player.segments[0].x, orb.y - player.segments[0].y);
          if (dist < minDist) {
            minDist = dist;
            nearestOrb = orb;
          }
        }

        // Avoid larger snakes
        let dangerAngle = null;
        for (const otherId in state.players) {
          if (otherId === id) continue;
          const other = state.players[otherId];
          if (other.state !== 'alive') continue;
          
          for (const seg of other.segments) {
            const dist = Math.hypot(seg.x - player.segments[0].x, seg.y - player.segments[0].y);
            if (dist < 10) {
              dangerAngle = Math.atan2(player.segments[0].y - seg.y, player.segments[0].x - seg.x);
              break;
            }
          }
          if (dangerAngle !== null) break;
        }

        if (dangerAngle !== null) {
          targetAngle = dangerAngle;
          player.isBoosting = true;
        } else if (nearestOrb) {
          targetAngle = Math.atan2(nearestOrb.y - player.segments[0].y, nearestOrb.x - player.segments[0].x);
          player.isBoosting = minDist > 5 && minDist < 15 && player.score > 15;
        } else {
          player.isBoosting = false;
          if (Math.random() < 0.02) targetAngle += (Math.random() - 0.5) * Math.PI;
        }

        // Move bot
        const sizePenalty = Math.max(0.6, 1 - (player.score / 2000));
        
        // Smooth turn
        let diff = targetAngle - player.currentAngle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        
        const turnSpeed = TURN_SPEED * sizePenalty * delta;
        if (Math.abs(diff) < turnSpeed) {
          player.currentAngle = targetAngle;
        } else {
          player.currentAngle += Math.sign(diff) * turnSpeed;
        }

        const baseSpeed = BASE_SPEED * sizePenalty;
        const speed = player.isBoosting ? baseSpeed * 1.5 : baseSpeed;
        
        const head = { ...player.segments[0] };
        head.x += Math.cos(player.currentAngle) * speed * delta;
        head.y += Math.sin(player.currentAngle) * speed * delta;

        // Boundary check
        const boundary = WORLD_SIZE / 2;
        if (head.x < -boundary) { head.x = -boundary; player.currentAngle += Math.PI; }
        if (head.x > boundary) { head.x = boundary; player.currentAngle += Math.PI; }
        if (head.y < -boundary) { head.y = -boundary; player.currentAngle += Math.PI; }
        if (head.y > boundary) { head.y = boundary; player.currentAngle += Math.PI; }

        player.segments.unshift(head);

        if (player.isBoosting) {
          player.score -= 15 * delta;
          if (player.score <= 10) {
            player.isBoosting = false;
            player.score = 10;
          }
        }

        const targetLength = Math.floor(player.score);
        while (player.segments.length > targetLength) {
          player.segments.pop();
        }

        // Bot collisions with orbs
        const now = Date.now();
        for (const orbId in state.orbs) {
          const orb = state.orbs[orbId];
          if (orb.spawnedBy === id && orb.createdAt && now - orb.createdAt < 1000) continue;
          const dx = head.x - orb.x;
          const dy = head.y - orb.y;
          const collisionRadius = orb.isMega ? 16 : 4;
          if (dx * dx + dy * dy < collisionRadius) {
            player.score += orb.value;
            player.xp += orb.isMega ? 50 : 10;
            delete state.orbs[orbId];
          }
        }

        // Bot collisions with other snakes
        let collided = false;
        let killerId = null;
        for (const otherId in state.players) {
          if (otherId === id) continue;
          const other = state.players[otherId];
          if (other.state !== 'alive') continue;
          for (const seg of other.segments) {
            const dx = head.x - seg.x;
            const dy = head.y - seg.y;
            if (dx * dx + dy * dy < 2.25) {
              collided = true;
              killerId = otherId;
              break;
            }
          }
          if (collided) break;
        }

        if (collided) {
          player.state = 'dead';
          let killerName = 'Unknown';
          if (killerId && state.players[killerId]) {
            const killer = state.players[killerId];
            killer.kills += 1;
            killer.xp += 250;
            killerName = killer.name;
            
            if (state.kingId === player.id) {
              killer.xp += 1000;
              killer.score += 50;
            }
          }
          
          if (killerId) {
            state.killFeed.push({
              id: uuidv4(),
              killerName,
              victimName: player.name,
              time: Date.now()
            });
            if (state.killFeed.length > 5) state.killFeed.shift();
          }

          const isMega = player.score > 50;
          if (isMega) {
            state.announcement = { text: "MEGA FEAST!", time: Date.now() };
          }
          player.segments.forEach((seg: any, i: number) => {
            if (i % 2 === 0) spawnOrb(state, seg.x, seg.y, isMega ? 2 : 1, player.color, true, isMega);
          });
        }
        
        if (player.score > player.longestLength) player.longestLength = player.score;
        player.skin = Math.floor(player.xp / 500);
      }
    }

    // Update players (boost drops from the tip)
    for (const id in state.players) {
      const player = state.players[id];
      if (player.state === 'alive' && player.isBoosting) {
        if (Math.random() < 0.4 && player.segments.length > 0) {
          const head = player.segments[0];
          const spreadAngle = (Math.random() - 0.5) * Math.PI * 1.5; 
          const angle = player.currentAngle + spreadAngle; 
          const speed = 60 + Math.random() * 40;
          const vx = Math.cos(angle) * speed;
          const vy = Math.sin(angle) * speed;
          const startX = head.x + Math.cos(player.currentAngle) * 8;
          const startY = head.y + Math.sin(player.currentAngle) * 8;
          spawnOrb(state, startX, startY, 1, player.color, true, false, vx, vy, id);
        }
      }
    }

    // Spawn random orbs
    if (Math.random() < 0.2) {
      spawnOrb(state);
    }

    // Update orb physics
    for (const id in state.orbs) {
      const orb = state.orbs[id];
      if (orb.vx || orb.vy) {
        orb.x += (orb.vx ?? 0) * delta;
        orb.y += (orb.vy ?? 0) * delta;
        // Friction
        orb.vx = (orb.vx ?? 0) * 0.95;
        orb.vy = (orb.vy ?? 0) * 0.95;
        // Stop if too slow
        if (Math.abs(orb.vx) < 0.1 && Math.abs(orb.vy) < 0.1) {
          orb.vx = 0;
          orb.vy = 0;
        }
        
        // Boundary check
        const boundary = WORLD_SIZE / 2;
        if (orb.x < -boundary || orb.x > boundary || orb.y < -boundary || orb.y > boundary) {
          delete state.orbs[id];
        }
      }
    }

    // Update leaderboard
    const alivePlayers = Object.values(state.players).filter(p => p.state === 'alive');
    const sortedPlayers = alivePlayers.sort((a, b) => b.score - a.score);
    
    state.leaderboard = sortedPlayers
      .slice(0, 10)
      .map(p => ({ id: p.id, name: p.name, score: Math.floor(p.score), color: p.color }));
      
    // King Logic
    if (sortedPlayers.length > 0) {
      const currentLeader = sortedPlayers[0];
      if (state.kingId !== currentLeader.id) {
        state.kingId = currentLeader.id;
        room.kingTime = now;
      } else if (now - room.kingTime > 60000 && !state.announcement) {
        state.announcement = { text: `${currentLeader.name} IS THE KING!`, time: Date.now() };
        room.kingTime = now + 999999;
      }
    } else {
      state.kingId = undefined;
    }

    // Clean up old kill feed and announcements
    state.killFeed = state.killFeed.filter(k => now - k.time < 5000);
    if (state.announcement && now - state.announcement.time > 3000) {
      state.announcement = undefined;
    }

    // Broadcast state
    io.to(roomId).emit('state', state);
  }
}, 1000 / TICK_RATE);

async function startServer() {
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
