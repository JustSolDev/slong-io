/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { useGameStore } from '../store/gameStore';
import { motion, AnimatePresence } from 'framer-motion';
import { ExternalLink, Trophy } from 'lucide-react';
import { useState, useEffect } from 'react';

const DEATH_MESSAGES = [
  "You got folded",
  "Outplayed",
  "Too slow",
  "Skill issue",
  "Slonged",
  "Rest in pieces",
  "Should have boosted",
  "Oof.",
  "That was embarrassing",
  "Try turning next time"
];

export function UI() {
  const { gameState, playerId, joinGame, error, roomId, inLobby, createRoom, joinRoom } = useGameStore();
  const [deathMessage, setDeathMessage] = useState("");
  const [playerName, setPlayerName] = useState("");

  const player = playerId && gameState ? gameState.players[playerId] : null;
  const isAlive = player?.state === 'alive';
  const isDead = player?.state === 'dead';
  
  useEffect(() => {
    if (isDead) {
      setDeathMessage(DEATH_MESSAGES[Math.floor(Math.random() * DEATH_MESSAGES.length)]);
    }
  }, [isDead]);
  
  // Calculate boost meter (based on score > 10)
  const boostPercentage = player ? Math.min(100, Math.max(0, ((player.score - 10) / 40) * 100)) : 0;
  
  // Calculate XP progress to next skin
  const xpProgress = player ? (player.xp % 500) / 500 * 100 : 0;

  if (inLobby) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm z-50 pointer-events-auto">
        <div className="bg-zinc-900/90 p-8 rounded-3xl border border-white/10 shadow-2xl max-w-md w-full flex flex-col items-center gap-6">
          <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-500 via-cyan-400 to-lime-400 tracking-tighter" style={{ filter: 'drop-shadow(0 0 10px rgba(0,255,255,0.8))' }}>
            SLONG.XYZ
          </h1>
          
          <div className="w-full space-y-4 mt-4">
            <div className="flex gap-2">
              <input 
                type="text" 
                id="nameInput"
                placeholder="YOUR NAME" 
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="flex-grow bg-black/50 border border-white/20 rounded-xl px-4 text-white uppercase outline-none focus:border-cyan-400 font-mono text-center"
                maxLength={12}
              />
            </div>

            <button 
              onClick={() => joinRoom('PUBLIC', playerName)}
              className="w-full py-4 bg-white text-black font-black rounded-xl hover:bg-gray-200 transition-colors text-lg shadow-[0_0_15px_rgba(255,255,255,0.3)]"
            >
              PLAY PUBLIC MATCH
            </button>

            <button 
              onClick={createRoom}
              className="w-full py-4 bg-gradient-to-r from-pink-500 to-purple-500 text-white font-bold rounded-xl hover:opacity-90 transition-opacity shadow-[0_0_15px_rgba(236,72,153,0.3)]"
            >
              CREATE PRIVATE ROOM
            </button>
            
            <div className="relative flex items-center py-2">
              <div className="flex-grow border-t border-white/10"></div>
              <span className="flex-shrink-0 mx-4 text-white/40 text-xs font-bold tracking-widest">OR JOIN WITH CODE</span>
              <div className="flex-grow border-t border-white/10"></div>
            </div>

            <div className="flex gap-2">
              <input 
                type="text" 
                id="roomInput"
                placeholder="6-DIGIT CODE" 
                className="flex-grow bg-black/50 border border-white/20 rounded-xl px-4 text-white uppercase outline-none focus:border-cyan-400 font-mono text-center"
                maxLength={6}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const val = (e.target as HTMLInputElement).value;
                    if (val) joinRoom(val);
                  }
                }}
              />
              <button 
                onClick={() => {
                  const val = (document.getElementById('roomInput') as HTMLInputElement).value;
                  if(val) joinRoom(val);
                }}
                className="px-6 py-3 bg-white/10 text-white font-bold rounded-xl hover:bg-white/20 transition-colors"
              >
                JOIN
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black/90 backdrop-blur-md z-50">
        <div className="bg-zinc-900 p-8 rounded-3xl border border-red-500/50 shadow-2xl max-w-md w-full text-center">
          <h2 className="text-3xl font-black text-red-500 mb-4">SESSION FULL</h2>
          <p className="text-white/80 mb-6">{error}</p>
          <button 
            onClick={() => { window.location.href = '/'; }}
            className="px-6 py-3 bg-white text-black font-bold rounded-xl hover:bg-gray-200 transition-colors"
          >
            CREATE NEW ROOM
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4">
      {/* Top Bar */}
      <div className="flex justify-between items-start pointer-events-auto relative">
        <div className="flex flex-col gap-2 z-10">
          <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-500 via-cyan-400 to-lime-400 tracking-tighter" style={{ filter: 'drop-shadow(0 0 10px rgba(0,255,255,0.8))' }}>
            SLONG.XYZ
          </h1>
          {isAlive && (
            <div className="flex flex-col gap-2 mt-2">
              <div className="bg-black/40 backdrop-blur-md rounded-xl p-3 border border-white/10 text-sm font-mono text-white/80 w-56">
                <div className="flex justify-between gap-4 mb-1">
                  <span className="text-white/50">LENGTH</span>
                  <span className="text-white font-bold text-lg">{Math.floor(player.score)}</span>
                </div>
                <div className="flex justify-between gap-4 mb-1">
                  <span className="text-white/50">KILLS</span>
                  <span className="text-red-400 font-bold">{player.kills || 0}</span>
                </div>
                <div className="flex justify-between gap-4 mb-1">
                  <span className="text-white/50">MAX LEN</span>
                  <span className="text-cyan-400 font-bold">{Math.floor(player.longestLength || 0)}</span>
                </div>
                <div className="flex justify-between gap-4 mb-2">
                  <span className="text-white/50">SKIN</span>
                  <span className="text-pink-400 font-bold">LVL {player.skin || 0}</span>
                </div>
                
                {/* XP Bar */}
                <div className="w-full bg-black/50 rounded-full h-2 mb-1 overflow-hidden border border-white/5">
                  <div className="bg-lime-400 h-full transition-all duration-300" style={{ width: `${xpProgress}%` }}></div>
                </div>
                <div className="text-[10px] text-right text-white/40">XP: {player.xp || 0} / {((player.skin || 0) + 1) * 500}</div>
              </div>
            </div>
          )}
        </div>
        
        {/* Controls Hint */}
        <div className="absolute left-1/2 -translate-x-1/2 top-0 flex gap-2 opacity-80 pointer-events-none hidden sm:flex">
          <div className="flex items-center gap-2 text-xs font-mono text-white bg-white/5 px-3 py-1.5 rounded-full backdrop-blur-sm border border-white/10">
            <span className="font-bold bg-white/20 px-1.5 py-0.5 rounded text-white">A</span>
            <span className="font-bold bg-white/20 px-1.5 py-0.5 rounded text-white">D</span>
            <span className="text-white/70 uppercase tracking-wider text-[10px]">Turn</span>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-white bg-white/5 px-3 py-1.5 rounded-full backdrop-blur-sm border border-white/10">
            <span className="font-bold bg-white/20 px-1.5 py-0.5 rounded text-white">SPACE</span>
            <span className="text-white/70 uppercase tracking-wider text-[10px]">Boost</span>
          </div>
        </div>

        <div className="flex gap-2 z-10">
          <div className="flex items-center gap-2 px-4 py-2 bg-black/40 backdrop-blur-md rounded-full border border-white/10 text-white text-sm font-bold">
            <span className="text-white/50">ROOM:</span>
            <span className="text-pink-400">{roomId}</span>
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(window.location.href);
              alert('Invite link copied to clipboard!');
            }}
            className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full text-white text-sm font-bold transition-colors"
          >
            <ExternalLink size={16} />
            <span className="hidden sm:inline">Copy Invite</span>
          </button>
        </div>
      </div>

      {/* Kill Feed */}
      {gameState && gameState.killFeed && gameState.killFeed.length > 0 && (
        <div className="absolute top-4 right-4 flex flex-col items-end gap-1 pointer-events-none z-20">
          <AnimatePresence>
            {gameState.killFeed.map(kill => (
              <motion.div
                key={kill.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 text-xs font-mono text-white/80 flex items-center gap-2"
              >
                <span className="text-white font-bold">{kill.killerName}</span>
                <span className="text-red-400">eliminated</span>
                <span className="text-white/60">{kill.victimName}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Announcements */}
      <AnimatePresence>
        {gameState?.announcement && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.5 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 1.5 }}
            className="absolute top-32 left-1/2 -translate-x-1/2 pointer-events-none z-30"
          >
            <h2 className="text-4xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-yellow-600 filter drop-shadow-[0_0_20px_rgba(253,224,71,0.8)] text-center uppercase tracking-widest">
              {gameState.announcement.text}
            </h2>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Leaderboard */}
      {gameState && gameState.leaderboard.length > 0 && (
        <div className="absolute top-24 right-4 w-64 bg-black/40 backdrop-blur-md rounded-2xl p-4 border border-white/10 pointer-events-auto z-10 hidden sm:block">
          <div className="flex items-center gap-2 mb-4 text-white/80 font-semibold">
            <Trophy size={18} className="text-yellow-400" />
            <h2>LEADERBOARD</h2>
          </div>
          <div className="flex flex-col gap-2">
            {gameState.leaderboard.map((entry, i) => {
              const isKing = gameState.kingId === entry.id;
              return (
                <div key={entry.id} className={`flex justify-between items-center text-sm ${entry.id === playerId ? 'bg-white/10 rounded px-1 -mx-1' : ''}`}>
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-white/40 w-4">{i + 1}.</span>
                    <span style={{ color: entry.color }} className={`font-medium truncate max-w-[120px] ${isKing ? 'text-yellow-400 drop-shadow-[0_0_5px_rgba(250,204,21,0.8)]' : ''}`}>
                      {isKing && '👑 '}
                      {entry.name}
                    </span>
                  </div>
                  <span className="font-mono text-white/80">{entry.score}</span>
                </div>
              );
            })}
            
            {/* Show player rank if outside top 10 */}
            {player && !gameState.leaderboard.find(e => e.id === playerId) && (
              <>
                <div className="border-t border-white/10 my-1"></div>
                <div className="flex justify-between items-center text-sm bg-white/10 rounded px-1 -mx-1">
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-white/40 w-4">?</span>
                    <span style={{ color: player.color }} className="font-medium truncate max-w-[120px]">
                      {player.name}
                    </span>
                  </div>
                  <span className="font-mono text-white/80">{Math.floor(player.score)}</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Menus */}
      <AnimatePresence>
        {(!player || isDead) && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-auto bg-black/60 backdrop-blur-sm"
          >
            <div className="bg-zinc-900/90 p-8 rounded-3xl border border-white/10 shadow-2xl max-w-md w-full flex flex-col items-center gap-6">
              {isDead && (
                <div className="text-center">
                  <h2 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-500 mb-2 filter drop-shadow-[0_0_10px_rgba(239,68,68,0.8)]">ELIMINATED</h2>
                  <p className="text-pink-400 font-bold mb-4 italic">"{deathMessage}"</p>
                  <p className="text-white/80 text-lg mb-4">Final Length: <span className="font-bold text-white">{Math.floor(player.score)}</span></p>
                  <div className="flex justify-center gap-4 text-sm font-mono text-white/60 mb-6">
                    <div>Kills: <span className="text-red-400">{player.kills}</span></div>
                    <div>XP Gained: <span className="text-lime-400">+{player.xp}</span></div>
                  </div>
                </div>
              )}
              
              {!isDead && (
                <div className="text-center">
                  <h2 className="text-3xl font-black text-white mb-2">JOIN ARENA</h2>
                  <p className="text-white/60 text-sm">Steer with A/D or Left/Right. Space to boost.</p>
                </div>
              )}
              
              {roomId !== 'PUBLIC' && (
                <div className="w-full bg-black/50 rounded-xl p-4 border border-white/10 text-center">
                  <p className="text-white/60 text-xs font-bold mb-2 uppercase">Invite Friends to this Room</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-grow bg-black px-3 py-2 rounded-lg text-pink-400 font-mono text-xs sm:text-sm border border-white/5 overflow-hidden text-ellipsis whitespace-nowrap">
                      {window.location.href}
                    </code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(window.location.href);
                        alert('Invite link copied!');
                      }}
                      className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-white shrink-0"
                      title="Copy Link"
                    >
                      <ExternalLink size={18} />
                    </button>
                  </div>
                </div>
              )}

              <button
                onClick={() => joinGame(playerName)}
                className="w-full py-4 bg-white text-black font-bold rounded-xl hover:bg-gray-200 transition-colors active:scale-95"
              >
                {isDead ? 'RESPAWN' : 'PLAY'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom UI Elements */}
      {isAlive && (
        <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end pointer-events-none">
          
          {/* Minimap */}
          <div className="w-32 h-32 bg-black/40 backdrop-blur-md rounded-xl border border-white/10 relative overflow-hidden hidden sm:block">
            {gameState && Object.values(gameState.players).map(p => {
              if (p.state !== 'alive' || p.segments.length === 0) return null;
              const head = p.segments[0];
              // Map WORLD_SIZE (-75 to 75) to 0-100%
              const x = ((head.x + 75) / 150) * 100;
              const y = ((head.y + 75) / 150) * 100;
              return (
                <div 
                  key={p.id}
                  className={`absolute w-1.5 h-1.5 rounded-full ${p.id === playerId ? 'bg-white z-10 scale-150' : 'bg-red-500'}`}
                  style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}
                />
              );
            })}
          </div>

          {/* Boost Meter */}
          <div className="flex flex-col items-center gap-2 mx-auto sm:mx-0">
            <div className="text-white/60 font-mono text-xs font-bold tracking-widest">BOOST ENERGY</div>
            <div className="w-48 sm:w-64 h-4 bg-black/50 rounded-full border border-white/10 overflow-hidden p-0.5">
              <div 
                className={`h-full rounded-full transition-all duration-100 ${boostPercentage > 20 ? 'bg-gradient-to-r from-pink-500 to-purple-500' : 'bg-red-500 animate-pulse'}`}
                style={{ width: `${boostPercentage}%` }}
              />
            </div>
          </div>
          
          {/* Empty div for flex spacing on desktop */}
          <div className="w-32 hidden sm:block"></div>
        </div>
      )}

      {/* Mobile Controls */}
      {isAlive && (
        <div className="absolute bottom-8 left-0 right-0 flex justify-between px-6 sm:hidden pointer-events-auto select-none" style={{ touchAction: 'none' }}>
          <div className="flex gap-4">
            <button 
              className="w-16 h-16 bg-white/10 backdrop-blur-md rounded-full text-white font-bold border border-white/20 active:bg-white/30 flex items-center justify-center text-2xl"
              onPointerDown={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent('game-input', { detail: { key: 'left', value: true } })); }}
              onPointerUp={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent('game-input', { detail: { key: 'left', value: false } })); }}
              onPointerLeave={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent('game-input', { detail: { key: 'left', value: false } })); }}
            >
              ←
            </button>
            <button 
              className="w-16 h-16 bg-white/10 backdrop-blur-md rounded-full text-white font-bold border border-white/20 active:bg-white/30 flex items-center justify-center text-2xl"
              onPointerDown={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent('game-input', { detail: { key: 'right', value: true } })); }}
              onPointerUp={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent('game-input', { detail: { key: 'right', value: false } })); }}
              onPointerLeave={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent('game-input', { detail: { key: 'right', value: false } })); }}
            >
              →
            </button>
          </div>
          <button 
            className="w-16 h-16 bg-pink-500/40 backdrop-blur-md rounded-full text-white font-bold border border-pink-500/50 active:bg-pink-500/60 flex items-center justify-center text-xs"
            onPointerDown={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent('game-input', { detail: { key: 'boost', value: true } })); }}
            onPointerUp={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent('game-input', { detail: { key: 'boost', value: false } })); }}
            onPointerLeave={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent('game-input', { detail: { key: 'boost', value: false } })); }}
          >
            BOOST
          </button>
        </div>
      )}
    </div>
  );
}
