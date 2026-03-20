/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { useEffect, useRef, useState, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGameStore, globalGameState } from '../store/gameStore';
import { WORLD_SIZE, TURN_SPEED, BOOST_SPEED, BASE_SPEED } from '../shared/types';
import * as THREE from 'three';
import { Sphere, Grid, Text } from '@react-three/drei';
import { playEatSound, playDeathSound, startBoostSound, stopBoostSound } from '../utils/audio';

const localCollectedOrbs = new Set<string>();

function Snake({ playerId, color, isLocal }: { playerId: string, color: string, isLocal: boolean }) {
  const bodyStemRef = useRef<THREE.InstancedMesh>(null);
  const bodyCapRef = useRef<THREE.InstancedMesh>(null);
  const headGroupRef = useRef<THREE.Group>(null);
  const tailBallsRef = useRef<THREE.Group>(null);
  const sporeRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const dummyCap = useMemo(() => new THREE.Object3D(), []);
  const dummySpore = useMemo(() => new THREE.Object3D(), []);
  const colorObj = useMemo(() => new THREE.Color(), []);
  const currentPositions = useRef<{x: number, y: number}[]>([]);
  const spores = useRef<{x: number, y: number, vx?: number, vy?: number, time: number, life: number}[]>([]);

  const getSkinColor = (baseColor: string, skinLevel: number) => {
    if (skinLevel === 1) return '#FFD700'; // Gold
    if (skinLevel === 2) return '#00FFFF'; // Diamond/Cyan
    if (skinLevel >= 3) return '#8A2BE2'; // Dark Matter/Purple
    return baseColor;
  };

  useFrame((state, delta) => {
    if (!bodyStemRef.current || !bodyCapRef.current || !headGroupRef.current || !sporeRef.current) return;
    const gs = globalGameState.current;
    if (!gs) return;
    
    const player = gs.players[playerId];
    if (!player || player.state === 'dead' || player.segments.length === 0) {
      bodyStemRef.current.count = 0;
      bodyCapRef.current.count = 0;
      sporeRef.current.count = 0;
      headGroupRef.current.visible = false;
      return;
    }
    
    headGroupRef.current.visible = true;
    const count = player.segments.length;
    bodyStemRef.current.count = Math.max(0, count - 1);
    bodyCapRef.current.count = Math.max(0, count - 1);
    
    while (currentPositions.current.length < count) {
      const idx = currentPositions.current.length;
      currentPositions.current.push({ 
        x: player.segments[idx]?.x || 0, 
        y: player.segments[idx]?.y || 0 
      });
    }

    const time = state.clock.elapsedTime;
    const skinLevel = player.skin || 0;
    const activeColor = getSkinColor(color, skinLevel);

    for (let i = 0; i < count; i++) {
      let targetX = player.segments[i].x;
      let targetY = player.segments[i].y;
      
      const curr = currentPositions.current[i];
      if (isLocal) {
        curr.x = targetX;
        curr.y = targetY;
      } else {
        const dist = Math.abs(targetX - curr.x) + Math.abs(targetY - curr.y);
        if (dist > 10) {
          curr.x = targetX;
          curr.y = targetY;
        } else {
          const lerpFactor = 15;
          curr.x += (targetX - curr.x) * lerpFactor * delta;
          curr.y += (targetY - curr.y) * lerpFactor * delta;
        }
      }
      
      if (i === 0) {
        headGroupRef.current.position.set(curr.x, curr.y, 0.5);
        headGroupRef.current.rotation.z = player.currentAngle - Math.PI / 2;
        
        // Wobble head cap slightly
        const headCap = headGroupRef.current.children[1];
        if (headCap) {
          headCap.rotation.y = Math.sin(time * 8) * 0.1;
          headCap.rotation.x = Math.PI/2 + Math.cos(time * 8) * 0.1;
        }
      } else {
        // Stem
        dummy.position.set(curr.x, curr.y, 0.3);
        // Cap
        dummyCap.position.set(curr.x, curr.y, 0.6);
        const wobbleX = Math.sin(time * 10 + i) * 0.08;
        const wobbleY = Math.cos(time * 10 + i) * 0.08;
        
        // Smoother ribbed scaling: use a tighter sin wave
        const ribScale = 1.0 + Math.sin(i * 2.5) * 0.12;
        dummyCap.scale.set(ribScale, ribScale, 1.0);
        
        dummyCap.rotation.set(Math.PI/2 + wobbleX, wobbleY, 0);
        dummyCap.updateMatrix();
        bodyCapRef.current.setMatrixAt(i - 1, dummyCap.matrix);

        // Stem matching rib scale and overlapping more for "ribbed" look
        dummy.position.copy(dummyCap.position);
        dummy.rotation.set(Math.PI/2, 0, 0);
        // Slightly taller cylinder to ensure overlap
        dummy.scale.set(ribScale * 0.95, 1.2, ribScale * 0.95);
        dummy.updateMatrix();
        bodyStemRef.current.setMatrixAt(i - 1, dummy.matrix);

        // Color: Vibrant Hot Pink
        colorObj.set("#ff1493");
        bodyCapRef.current.setColorAt(i - 1, colorObj);
        bodyStemRef.current.setColorAt(i - 1, colorObj);
      }
    }
    
    bodyStemRef.current.instanceMatrix.needsUpdate = true;
    bodyCapRef.current.instanceMatrix.needsUpdate = true;
    if (bodyCapRef.current.instanceColor) {
      bodyCapRef.current.instanceColor.needsUpdate = true;
    }
    if (bodyStemRef.current.instanceColor) {
      bodyStemRef.current.instanceColor.needsUpdate = true;
    }

    // Spores logic
    if (isLocal && player.isBoosting && Math.random() < 0.7) {
      const head = player.segments[0];
      // Wide explosive spread — shoots from the tip outward in a cone
      const spreadAngle = (Math.random() - 0.5) * Math.PI * 1.4; // ~250° cone
      const angle = player.currentAngle + spreadAngle;
      const shootSpeed = 45 + Math.random() * 80;
      // Spawn from well ahead of the tip
      const shootOffset = 3.5;
      // Random distance ahead so some shoot far, some closer
      const forwardBias = Math.cos(spreadAngle) * 20;
      spores.current.push({ 
        x: head.x + Math.cos(player.currentAngle) * shootOffset, 
        y: head.y + Math.sin(player.currentAngle) * shootOffset, 
        vx: Math.cos(angle) * (shootSpeed + forwardBias),
        vy: Math.sin(angle) * (shootSpeed + forwardBias),
        time, 
        life: 1.4
      });
    }
    
    let sporeIdx = 0;
    for (let i = spores.current.length - 1; i >= 0; i--) {
      const s = spores.current[i];
      s.life -= delta * 1.0; // slower decay so they travel further
      if (s.life <= 0) {
        spores.current.splice(i, 1);
      } else {
        if (s.vx !== undefined && s.vy !== undefined) {
          // Decelerate over time like real fluid
          s.vx *= 0.97;
          s.vy *= 0.97;
          s.x += s.vx * delta;
          s.y += s.vy * delta;
        }
        dummySpore.position.set(s.x, s.y, 0.2 + (1 - s.life) * 0.5);
        const scale = s.life * 0.75;
        dummySpore.scale.set(scale, scale, scale);
        dummySpore.updateMatrix();
        sporeRef.current.setMatrixAt(sporeIdx, dummySpore.matrix);
        
        colorObj.set(activeColor);
        sporeRef.current.setColorAt(sporeIdx, colorObj);
        sporeIdx++;
      }
    }
    sporeRef.current.count = sporeIdx;
    sporeRef.current.instanceMatrix.needsUpdate = true;
    if (sporeRef.current.instanceColor) sporeRef.current.instanceColor.needsUpdate = true;

    // Update Tail Balls Position & Rotation
    if (tailBallsRef.current && count > 2) {
      const tail = currentPositions.current[count - 1];
      const prevTail = currentPositions.current[count - 2];
      tailBallsRef.current.position.set(tail.x, tail.y, 0.5);
      tailBallsRef.current.rotation.z = Math.atan2(prevTail.y - tail.y, prevTail.x - tail.x) - Math.PI / 2;
      tailBallsRef.current.visible = true;
    } else if (tailBallsRef.current) {
      tailBallsRef.current.visible = false;
    }
  });

  const activeColor = globalGameState.current?.players[playerId] ? getSkinColor(color, globalGameState.current.players[playerId].skin || 0) : color;
  const skinLevel = globalGameState.current?.players[playerId]?.skin || 0;

  return (
    <group>
      <group ref={headGroupRef}>
        {/* Shaft base */}
        <mesh rotation={[Math.PI/2, 0, 0]} position={[0, 0, -0.4]} castShadow receiveShadow>
          <cylinderGeometry args={[0.85, 0.85, 1.2, 16]} />
          <meshStandardMaterial color="#ff1493" roughness={0.3} metalness={0.1} />
        </mesh>
        {/* Neck taper — narrower before flaring into glans */}
        <mesh rotation={[Math.PI/2, 0, 0]} position={[0, 0, 0.3]} castShadow receiveShadow>
          <cylinderGeometry args={[0.72, 0.85, 0.35, 16]} />
          <meshStandardMaterial color="#ff1493" roughness={0.3} metalness={0.1} />
        </mesh>
        {/* Corona ridge — pronounced flare */}
        <mesh rotation={[Math.PI/2, 0, 0]} position={[0, 0, 0.52]}>
           <torusGeometry args={[0.98, 0.22, 16, 32]} />
           <meshStandardMaterial color="#ff3fa8" roughness={0.1} metalness={0.1} />
        </mesh>
        {/* Glans dome — proper bullet/helmet shape */}
        <mesh rotation={[Math.PI/2, 0, 0]} position={[0, 0, 0.82]} scale={[1.15, 1.15, 1.6]} castShadow receiveShadow>
          <sphereGeometry args={[0.92, 32, 20, 0, Math.PI * 2, 0, Math.PI / 1.65]} />
          <meshStandardMaterial 
            color="#ff59bc" 
            emissive="#ff1493" 
            emissiveIntensity={skinLevel >= 2 || globalGameState.current?.kingId === playerId ? 0.3 : 0.08} 
            roughness={0.03}
            metalness={0.2}
            toneMapped={false} 
          />
        </mesh>
        {/* Glans tip cap to close the dome */}
        <mesh rotation={[Math.PI/2, 0, 0]} position={[0, 0, 1.78]} scale={[1.15, 1.15, 1.0]}>
          <sphereGeometry args={[0.28, 20, 12]} />
          <meshStandardMaterial color="#ff6ec9" roughness={0.05} metalness={0.2} toneMapped={false} />
        </mesh>
        {/* Meatus — vertical slit opening at the very tip */}
        <mesh position={[0, 0.01, 2.04]} rotation={[0, 0, 0]}>
           <boxGeometry args={[0.055, 0.32, 0.055]} />
           <meshBasicMaterial color="#3a0015" />
        </mesh>
        <mesh position={[0, 0.01, 2.05]} rotation={[0, 0, 0]}>
           <boxGeometry args={[0.03, 0.2, 0.03]} />
           <meshBasicMaterial color="#6b0028" transparent opacity={0.5} />
        </mesh>
        {/* Rim highlight ring around meatus */}
        <mesh position={[0, 0, 1.99]} rotation={[0, 0, 0]}>
           <torusGeometry args={[0.13, 0.025, 16, 32]} />
           <meshStandardMaterial color="#ff90d0" roughness={0.05} emissive="#ff1493" emissiveIntensity={0.35} transparent opacity={0.7} />
        </mesh>
        {/* Veins */}
        <mesh position={[0.42, 0.18, -0.15]} rotation={[0, 0.2, 0.35]}>
           <cylinderGeometry args={[0.045, 0.045, 1.3, 8]} />
           <meshStandardMaterial color="#ff4fb2" roughness={0.2} transparent opacity={0.65} />
        </mesh>
        <mesh position={[-0.42, -0.18, -0.05]} rotation={[0, -0.2, -0.28]}>
           <cylinderGeometry args={[0.035, 0.035, 1.1, 8]} />
           <meshStandardMaterial color="#ff4fb2" roughness={0.2} transparent opacity={0.65} />
        </mesh>
      </group>

      <group ref={tailBallsRef}>
        <mesh position={[-1.1, -0.8, 0]} castShadow receiveShadow>
          <sphereGeometry args={[1.5, 24, 24]} />
          <meshStandardMaterial color="#ff1493" roughness={0.3} metalness={0.1} />
        </mesh>
        <mesh position={[1.1, -0.8, 0]} castShadow receiveShadow>
          <sphereGeometry args={[1.5, 24, 24]} />
          <meshStandardMaterial color="#ff1493" roughness={0.3} metalness={0.1} />
        </mesh>
      </group>

      <instancedMesh ref={bodyStemRef} args={[null as any, null as any, 2000]} castShadow receiveShadow frustumCulled={false}>
        <cylinderGeometry args={[0.8, 0.8, 0.5, 16]} />
        <meshStandardMaterial color="#ff9a9e" roughness={0.4} />
      </instancedMesh>

      <instancedMesh ref={bodyCapRef} args={[null as any, null as any, 2000]} castShadow receiveShadow frustumCulled={false}>
        <sphereGeometry args={[1.0, 16, 16]} />
        <meshStandardMaterial
          color="#ff9a9e"
          roughness={0.4}
          metalness={0.1}
          toneMapped={false}
        />
      </instancedMesh>

      <instancedMesh ref={sporeRef} args={[null as any, null as any, 500]} frustumCulled={false}>
        <sphereGeometry args={[0.4, 8, 8]} />
        <meshStandardMaterial
          color="#ffffff"
          toneMapped={false}
          onBeforeCompile={(shader) => {
            shader.fragmentShader = shader.fragmentShader.replace(
              '#include <emissivemap_fragment>',
              `
              #include <emissivemap_fragment>
              totalEmissiveRadiance += diffuseColor.rgb * 3.0;
              `
            );
          }}
        />
      </instancedMesh>

      {/* Player Name & Crown */}
      {!isLocal && globalGameState.current?.players[playerId] && (
        <group position={[globalGameState.current.players[playerId].segments[0]?.x || 0, globalGameState.current.players[playerId].segments[0]?.y || 0, 2]}>
          <Text
            position={[0, 1.5, 0]}
            color="white"
            fontSize={0.8}
            maxWidth={10}
            lineHeight={1}
            letterSpacing={0.02}
            textAlign="center"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.1}
            outlineColor="black"
          >
            {globalGameState.current.players[playerId].name}
          </Text>
          {globalGameState.current?.kingId === playerId && (
            <Text
              position={[0, 2.5, 0]}
              color="#FFD700"
              fontSize={1.2}
              anchorX="center"
              anchorY="middle"
            >
              👑
            </Text>
          )}
        </group>
      )}
    </group>
  );
}

function Orbs() {
  const stemRef = useRef<THREE.InstancedMesh>(null);
  const capRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colorObj = useMemo(() => new THREE.Color(), []);

  useFrame((state) => {
    if (!stemRef.current || !capRef.current) return;
    const gs = globalGameState.current;
    if (!gs) return;

    let i = 0;
    const time = state.clock.elapsedTime;
    for (const orbId in gs.orbs) {
      if (localCollectedOrbs.has(orbId)) continue;
      const orb = gs.orbs[orbId];
      
      const bob = Math.sin(time * 3 + orb.x) * 0.1;
      const scale = orb.isMega ? 2.5 : 1;
      
      dummy.position.set(orb.x, orb.y, 0.15 + bob);
      dummy.rotation.set(Math.PI/2, 0, 0);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      stemRef.current.setMatrixAt(i, dummy.matrix);
      
      dummy.position.set(orb.x, orb.y, (0.3 * scale) + bob);
      dummy.rotation.set(Math.PI/2 + Math.sin(time*2+orb.y)*0.2, Math.cos(time*2+orb.x)*0.2, 0);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      capRef.current.setMatrixAt(i, dummy.matrix);
      
      colorObj.set(orb.color);
      capRef.current.setColorAt(i, colorObj);

      i++;
    }
    
    stemRef.current.count = i;
    stemRef.current.instanceMatrix.needsUpdate = true;
    
    capRef.current.count = i;
    capRef.current.instanceMatrix.needsUpdate = true;
    if (capRef.current.instanceColor) {
      capRef.current.instanceColor.needsUpdate = true;
    }
  });

  return (
    <group>
      <instancedMesh ref={stemRef} args={[null as any, null as any, 1000]} castShadow receiveShadow frustumCulled={false}>
        <cylinderGeometry args={[0.1, 0.1, 0.3, 8]} />
        <meshStandardMaterial color="#dddddd" roughness={0.6} />
      </instancedMesh>
      <instancedMesh ref={capRef} args={[null as any, null as any, 1000]} castShadow receiveShadow frustumCulled={false}>
        <sphereGeometry args={[0.3, 16, 16, 0, Math.PI*2, 0, Math.PI/2]} />
        <meshStandardMaterial
          roughness={0.2}
          metalness={0.1}
          toneMapped={false}
          onBeforeCompile={(shader) => {
            shader.fragmentShader = shader.fragmentShader.replace(
              '#include <emissivemap_fragment>',
              `
              #include <emissivemap_fragment>
              totalEmissiveRadiance += diffuseColor.rgb * 2.5;
              `
            );
          }}
        />
      </instancedMesh>
    </group>
  );
}

function DeathBurst({ position, color }: { position: {x: number, y: number}, color: string }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const particles = useRef(Array.from({ length: 30 }).map(() => ({
    x: position.x,
    y: position.y,
    vx: (Math.random() - 0.5) * 20,
    vy: (Math.random() - 0.5) * 20,
    vz: Math.random() * 10,
    life: 1.0
  })));

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    let i = 0;
    for (const p of particles.current) {
      p.life -= delta * 1.5;
      if (p.life > 0) {
        p.x += p.vx * delta;
        p.y += p.vy * delta;
        p.vz += p.vz * delta;
        dummy.position.set(p.x, p.y, p.vz);
        const scale = p.life * 0.5;
        dummy.scale.set(scale, scale, scale);
        dummy.updateMatrix();
        meshRef.current.setMatrixAt(i, dummy.matrix);
        i++;
      }
    }
    meshRef.current.count = i;
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[null as any, null as any, 30]}>
      <sphereGeometry args={[0.5, 8, 8]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2} toneMapped={false} />
    </instancedMesh>
  );
}

export function GameScene() {
  const { gameState, playerId, sendPlayerState, sendCollectOrb } = useGameStore();
  const { camera } = useThree();
  const inputs = useRef({ mouseX: 1, mouseY: 0, boost: false });
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const [lightTarget] = useState(() => new THREE.Object3D());
  const [deathBursts, setDeathBursts] = useState<{id: string, position: {x: number, y: number}, color: string, time: number}[]>([]);
  const recentDeaths = useRef<Set<string>>(new Set());
  
  const shakeTime = useRef(0);
  const slowMoTime = useRef(0);

  const localPlayerRef = useRef<{
    active: boolean;
    state: 'alive' | 'dead';
    segments: {x: number, y: number}[];
    score: number;
    currentAngle: number;
    isBoosting: boolean;
    lastSendTime: number;
    kills: number;
    longestLength: number;
    xp: number;
    skin: number;
    wallHugTime: number;
  }>({
    active: false,
    state: 'alive',
    segments: [],
    score: 10,
    currentAngle: 0,
    isBoosting: false,
    lastSendTime: 0,
    kills: 0,
    longestLength: 10,
    xp: 0,
    skin: 0,
    wallHugTime: 0,
  });

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      inputs.current.mouseX = e.clientX - window.innerWidth / 2;
      inputs.current.mouseY = window.innerHeight / 2 - e.clientY;
    };
    
    const handlePointerDown = (e: PointerEvent) => {
      // Left click boosts
      if (e.button === 0) inputs.current.boost = true;
    };
    
    const handlePointerUp = (e: PointerEvent) => {
      if (e.button === 0) inputs.current.boost = false;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === ' ' || e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') && !inputs.current.boost) { inputs.current.boost = true; }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if ((e.key === ' ' || e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') && inputs.current.boost) { inputs.current.boost = false; }
    };

    const handleBlur = () => {
      inputs.current.boost = false;
    };

    const handleGameInput = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { key, value } = customEvent.detail;
      if (key === 'boost') inputs.current.boost = value;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('game-input', handleGameInput);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('game-input', handleGameInput);
    };
  }, []);

  useFrame((state, delta) => {
    const gs = globalGameState.current;
    if (!gs || !playerId) return;
    
    const serverPlayer = gs.players[playerId];
    if (serverPlayer && serverPlayer.state === 'alive') {
      
      // Check for new deaths to spawn bursts
      for (const id in gs.players) {
        const p = gs.players[id];
        if (p.state === 'dead' && p.segments.length > 0) {
          if (!recentDeaths.current.has(id)) {
            recentDeaths.current.add(id);
            setDeathBursts(prev => [...prev.filter(b => Date.now() - b.time < 2000), {
              id,
              position: { x: p.segments[0].x, y: p.segments[0].y },
              color: p.color,
              time: Date.now()
            }]);
            
            // Play death sound if it's nearby
            const dist = Math.hypot(p.segments[0].x - localPlayerRef.current.segments[0].x, p.segments[0].y - localPlayerRef.current.segments[0].y);
            if (dist < 30) {
              playDeathSound();
              if (dist < 15) shakeTime.current = 0.3; // Shake screen for nearby deaths
            }
            
            // Remove from recent deaths after 2 seconds
            setTimeout(() => {
              recentDeaths.current.delete(id);
            }, 2000);
          }
        }
      }

      // Initialize from server if not active
      if (!localPlayerRef.current.active && serverPlayer.segments.length > 0) {
        localPlayerRef.current.active = true;
        localPlayerRef.current.state = 'alive';
        localPlayerRef.current.segments = [...serverPlayer.segments];
        localPlayerRef.current.score = serverPlayer.score;
        localPlayerRef.current.currentAngle = serverPlayer.currentAngle;
        localPlayerRef.current.kills = serverPlayer.kills || 0;
        localPlayerRef.current.longestLength = serverPlayer.longestLength || 10;
        localPlayerRef.current.xp = serverPlayer.xp || 0;
        localPlayerRef.current.skin = serverPlayer.skin || 0;
      } else if (localPlayerRef.current.active) {
        if (serverPlayer.kills > localPlayerRef.current.kills) {
          localPlayerRef.current.kills = serverPlayer.kills;
          localPlayerRef.current.xp = serverPlayer.xp;
          // Trigger slow-mo and heavy screen shake on kill
          slowMoTime.current = 0.5;
          shakeTime.current = 0.5;
        }
      }

      if (!localPlayerRef.current.active) return;
      
      // Apply slow motion effect to delta
      let effectiveDelta = delta;
      if (slowMoTime.current > 0) {
        slowMoTime.current -= delta;
        effectiveDelta *= 0.3; // 30% speed
      }

      // Local movement logic
      const sizePenalty = Math.max(0.6, 1 - (localPlayerRef.current.score / 2000));
      const currentTurnSpeed = TURN_SPEED * sizePenalty;

      // Calculate target angle towards mouse cursor
      const targetAngle = Math.atan2(inputs.current.mouseY, inputs.current.mouseX);
      
      let angleDiff = targetAngle - localPlayerRef.current.currentAngle;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      
      const turnStep = currentTurnSpeed * effectiveDelta;
      if (Math.abs(angleDiff) < turnStep) {
        localPlayerRef.current.currentAngle = targetAngle;
      } else {
        localPlayerRef.current.currentAngle += Math.sign(angleDiff) * turnStep;
      }
      
      localPlayerRef.current.isBoosting = inputs.current.boost && localPlayerRef.current.score > 10;
      
      if (localPlayerRef.current.isBoosting) {
        startBoostSound();
      } else {
        stopBoostSound();
      }
      
      const baseSpeed = BASE_SPEED * sizePenalty;
      const speed = localPlayerRef.current.isBoosting ? baseSpeed * 1.5 : baseSpeed;
      
      const head = { ...localPlayerRef.current.segments[0] };
      head.x += Math.cos(localPlayerRef.current.currentAngle) * speed * effectiveDelta;
      head.y += Math.sin(localPlayerRef.current.currentAngle) * speed * effectiveDelta;

      // Boundary check
      const boundary = WORLD_SIZE / 2;
      let huggingWall = false;
      if (head.x < -boundary) { head.x = -boundary; huggingWall = true; }
      if (head.x > boundary) { head.x = boundary; huggingWall = true; }
      if (head.y < -boundary) { head.y = -boundary; huggingWall = true; }
      if (head.y > boundary) { head.y = boundary; huggingWall = true; }

      if (huggingWall) {
        // Only increase time if pushing against the wall
        localPlayerRef.current.wallHugTime += delta;
      } else {
        localPlayerRef.current.wallHugTime = 0;
      }

      localPlayerRef.current.segments.unshift(head);

      if (localPlayerRef.current.isBoosting) {
        localPlayerRef.current.score -= 15 * effectiveDelta; // Increased from 2 to 15 to prevent infinite growth exploit
        if (localPlayerRef.current.score <= 10) {
          localPlayerRef.current.isBoosting = false;
          localPlayerRef.current.score = 10;
          stopBoostSound();
        }
      }

      const targetLength = Math.floor(localPlayerRef.current.score);
      while (localPlayerRef.current.segments.length > targetLength) {
        localPlayerRef.current.segments.pop();
      }

      const nowTime = Date.now();
      for (const orbId in gs.orbs) {
        if (localCollectedOrbs.has(orbId)) continue;
        const orb = gs.orbs[orbId];
        // Skip collection for own orbs for 1 second
        if (orb.spawnedBy === playerId && orb.createdAt && nowTime - orb.createdAt < 1000) continue;
        const dx = head.x - orb.x;
        const dy = head.y - orb.y;
        const collisionRadius = orb.isMega ? 16 : 4; 
        if (dx * dx + dy * dy < collisionRadius) {
          localPlayerRef.current.score += orb.value;
          localPlayerRef.current.xp += orb.isMega ? 50 : 10;
          localCollectedOrbs.add(orbId);
          delete gs.orbs[orbId]; // predict locally
          sendCollectOrb(orbId);
          playEatSound();
        }
      }

      // Cleanup localCollectedOrbs occasionally
      if (Math.random() < 0.05) {
        for (const id of localCollectedOrbs) {
          if (!gs.orbs[id]) localCollectedOrbs.delete(id);
        }
      }

      // Check player collisions
      let collided = false;
      let killerId = null;
      for (const otherId in gs.players) {
        if (otherId === playerId) continue;
        const other = gs.players[otherId];
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

      // Check wall hug death
      if (localPlayerRef.current.wallHugTime > 2.0) {
        collided = true;
        killerId = null; // Died to environment
      }

      if (collided) {
        localPlayerRef.current.active = false;
        stopBoostSound();
        playDeathSound();
        shakeTime.current = 0.5;
        sendPlayerState({
          segments: localPlayerRef.current.segments,
          score: localPlayerRef.current.score,
          currentAngle: localPlayerRef.current.currentAngle,
          isBoosting: localPlayerRef.current.isBoosting,
          state: 'dead',
          killerId: killerId
        });
        return;
      }

      // Update progression stats
      if (localPlayerRef.current.score > localPlayerRef.current.longestLength) {
        localPlayerRef.current.longestLength = localPlayerRef.current.score;
      }
      localPlayerRef.current.skin = Math.floor(localPlayerRef.current.xp / 500);

      // Overwrite global state for local rendering
      gs.players[playerId].segments = localPlayerRef.current.segments;
      gs.players[playerId].score = localPlayerRef.current.score;
      gs.players[playerId].currentAngle = localPlayerRef.current.currentAngle;
      gs.players[playerId].isBoosting = localPlayerRef.current.isBoosting;
      gs.players[playerId].kills = localPlayerRef.current.kills;
      gs.players[playerId].longestLength = localPlayerRef.current.longestLength;
      gs.players[playerId].xp = localPlayerRef.current.xp;
      gs.players[playerId].skin = localPlayerRef.current.skin;

      // Send state to server at 20Hz
      const now = Date.now();
      if (now - localPlayerRef.current.lastSendTime > 50) {
        sendPlayerState({
          segments: localPlayerRef.current.segments,
          score: localPlayerRef.current.score,
          currentAngle: localPlayerRef.current.currentAngle,
          isBoosting: localPlayerRef.current.isBoosting,
          state: 'alive',
          kills: localPlayerRef.current.kills,
          longestLength: localPlayerRef.current.longestLength,
          xp: localPlayerRef.current.xp,
          skin: localPlayerRef.current.skin,
        });
        localPlayerRef.current.lastSendTime = now;
      }

      const targetZ = Math.min(45, Math.max(20, 20 + localPlayerRef.current.score * 0.2));
      
      // Smooth camera follow predicted head
      const camLerpSpeed = localPlayerRef.current.isBoosting ? 15 : 10;
      camera.position.x += (head.x - camera.position.x) * camLerpSpeed * delta;
      camera.position.y += (head.y - camera.position.y) * camLerpSpeed * delta;
      camera.position.z += (targetZ - camera.position.z) * 4 * delta;
      
      // Apply screen shake
      if (shakeTime.current > 0) {
        shakeTime.current -= delta;
        const intensity = shakeTime.current * 2;
        camera.position.x += (Math.random() - 0.5) * intensity;
        camera.position.y += (Math.random() - 0.5) * intensity;
      }
      
      camera.lookAt(camera.position.x, camera.position.y, 0);

      // Make the directional light follow the camera to keep shadows crisp
      if (lightRef.current) {
        lightRef.current.position.set(camera.position.x + 10, camera.position.y - 10, 30);
        lightTarget.position.set(camera.position.x, camera.position.y, 0);
      }
    } else {
      localPlayerRef.current.active = false;
    }
  });

  if (!gameState) return null;

  return (
    <>
      <ambientLight intensity={0.4} />
      
      <directionalLight
        ref={lightRef}
        target={lightTarget}
        castShadow
        intensity={2}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
        shadow-camera-near={0.1}
        shadow-camera-far={100}
        shadow-bias={-0.001}
      />
      <primitive object={lightTarget} />

      {/* Ground plane to receive shadows */}
      <mesh receiveShadow position={[0, 0, -0.2]}>
        <planeGeometry args={[WORLD_SIZE, WORLD_SIZE]} />
        <meshStandardMaterial color="#0a0a0a" />
      </mesh>

      <Grid
        position={[0, 0, -0.1]}
        rotation={[Math.PI / 2, 0, 0]}
        args={[WORLD_SIZE, WORLD_SIZE]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#1e3a8a"
        sectionSize={10}
        sectionThickness={1}
        sectionColor="#3b82f6"
        fadeDistance={50}
        fadeStrength={1}
      />

      <Orbs />

      {deathBursts.map(burst => (
        <DeathBurst key={`${burst.id}-${burst.time}`} position={burst.position} color={burst.color} />
      ))}

      {Object.values(gameState.players).map((player) => {
        if (player.state !== 'alive' || player.segments.length === 0) return null;
        return (
          <Snake
            key={player.id}
            playerId={player.id}
            color={player.color}
            isLocal={player.id === playerId}
          />
        );
      })}
    </>
  );
}
