export const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

export const playEatSound = () => {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(800, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.1);
  
  gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
  
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.1);
};

export const playDeathSound = () => {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(100, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(10, audioCtx.currentTime + 0.5);
  
  gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
  
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.5);
};

let boostOsc: OscillatorNode | null = null;
let boostGain: GainNode | null = null;

export const startBoostSound = () => {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  if (boostOsc) return;
  
  boostOsc = audioCtx.createOscillator();
  boostGain = audioCtx.createGain();
  
  boostOsc.type = 'square';
  boostOsc.frequency.setValueAtTime(50, audioCtx.currentTime);
  
  boostGain.gain.setValueAtTime(0, audioCtx.currentTime);
  boostGain.gain.linearRampToValueAtTime(0.05, audioCtx.currentTime + 0.1);
  
  // Lowpass filter to make it sound like a rumble
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 400;
  
  boostOsc.connect(filter);
  filter.connect(boostGain);
  boostGain.connect(audioCtx.destination);
  
  boostOsc.start();
};

export const stopBoostSound = () => {
  if (boostGain && boostOsc) {
    boostGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.1);
    boostOsc.stop(audioCtx.currentTime + 0.1);
    boostOsc = null;
    boostGain = null;
  }
};
