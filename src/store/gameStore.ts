/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { GameState, Player } from '../shared/types';

interface GameStore {
  socket: Socket | null;
  gameState: GameState | null;
  playerId: string | null;
  roomId: string;
  error: string | null;
  inLobby: boolean;
  createRoom: () => void;
  joinRoom: (roomId: string) => void;
  connect: (roomId: string) => void;
  joinGame: () => void;
  sendPlayerState: (data: any) => void;
  sendCollectOrb: (orbId: string) => void;
}

export const globalGameState: { current: GameState | null } = { current: null };
let lastUiUpdate = 0;

export const useGameStore = create<GameStore>((set, get) => ({
  socket: null,
  gameState: null,
  playerId: null,
  roomId: '',
  error: null,
  inLobby: true,
  createRoom: () => {
    const newRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    window.history.pushState({}, '', '?room=' + newRoomId);
    set({ inLobby: false, roomId: newRoomId });
    get().connect(newRoomId);
  },
  joinRoom: (id: string) => {
    const upperId = id.toUpperCase();
    window.history.pushState({}, '', '?room=' + upperId);
    set({ inLobby: false, roomId: upperId });
    get().connect(upperId);
  },
  connect: (roomId: string) => {
    if (get().socket) return;
    
    set({ roomId, inLobby: false });
    const socket = io({ query: { room: roomId } });

    socket.on('connect', () => {
      console.log('Connected to server');
    });

    socket.on('room_full', () => {
      set({ error: 'Room is full! Max 20 players allowed.' });
    });

    socket.on('init', (id: string) => {
      set({ playerId: id });
    });

    socket.on('state', (state: GameState) => {
      globalGameState.current = state;
      const now = Date.now();
      if (now - lastUiUpdate > 100) { // Throttle React updates to 10Hz
        set({ gameState: state });
        lastUiUpdate = now;
      }
    });

    set({ socket });
  },
  joinGame: () => {
    const { socket } = get();
    if (socket) {
      socket.emit('join');
    }
  },
  sendPlayerState: (data) => {
    const { socket } = get();
    if (socket) {
      socket.emit('update_state', data);
    }
  },
  sendCollectOrb: (orbId) => {
    const { socket } = get();
    if (socket) {
      socket.emit('collect_orb', orbId);
    }
  },
}));
