/**
 * SoundManager - Procedural sound effects using Web Audio API
 * and voice announcements using Web Speech API
 */

import { WeaponType } from '../systems/WeaponTypes';

type FlightSoundHandle = {
  update: (vx: number, vy: number) => void;
  stop: () => void;
};

class SoundManagerClass {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private initialized = false;
  private speechSynth: SpeechSynthesis | null = null;
  private volume = 0.5;
  private musicGain: GainNode | null = null;
  private musicPlaying = false;
  private musicOscillators: OscillatorNode[] = [];

  // Initialize audio context (must be called after user interaction)
  public init(): void {
    if (this.initialized) return;
    
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.connect(this.audioContext.destination);
      this.masterGain.gain.value = this.volume;
      
      // Separate gain for music (lower volume)
      this.musicGain = this.audioContext.createGain();
      this.musicGain.connect(this.audioContext.destination);
      this.musicGain.gain.value = this.volume * 0.3;
      
      this.speechSynth = window.speechSynthesis;
      this.initialized = true;
    } catch (e) {
      console.warn('Web Audio API not supported:', e);
    }
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain) {
      this.masterGain.gain.value = this.volume;
    }
  }

  // Resume audio context if suspended (browser autoplay policy)
  private async ensureContext(): Promise<boolean> {
    if (!this.audioContext) {
      this.init();
    }
    if (this.audioContext?.state === 'suspended') {
      await this.audioContext.resume();
    }
    return this.audioContext !== null;
  }

  // Synchronous variant for cases where callers can't await (e.g., per-frame updates).
  private ensureContextSync(): boolean {
    if (!this.audioContext || !this.masterGain) {
      this.init();
    }
    if (!this.audioContext || !this.masterGain) return false;
    if (this.audioContext.state === 'suspended') {
      // Best-effort resume. If the browser blocks it, we just won't hear sound until user interaction.
      this.audioContext.resume().catch(() => { /* ignored */ });
    }
    return true;
  }

  // ============ VOICE ANNOUNCEMENTS ============
  
  public async announceUnit(unitType: string): Promise<void> {
    if (!this.speechSynth) {
      this.init();
    }
    if (!this.speechSynth) return;

    // Cancel any ongoing speech
    this.speechSynth.cancel();

    const utterance = new SpeechSynthesisUtterance(unitType);
    utterance.rate = 1.1; // Slightly faster
    utterance.pitch = 0.9; // Slightly deeper
    utterance.volume = this.volume;
    
    // Try to find a good English voice
    const voices = this.speechSynth.getVoices();
    const englishVoice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Male')) 
      || voices.find(v => v.lang.startsWith('en'))
      || voices[0];
    if (englishVoice) {
      utterance.voice = englishVoice;
    }

    this.speechSynth.speak(utterance);
  }

  // ============ GUN SOUNDS ============

  // Generic gunshot - creates a burst of noise with pitch envelope
  private async playGunshot(
    duration: number,
    pitchStart: number,
    pitchEnd: number,
    noiseAmount: number,
    attack: number = 0.01
  ): Promise<void> {
    if (!await this.ensureContext() || !this.audioContext || !this.masterGain) return;

    const ctx = this.audioContext;
    const now = ctx.currentTime;

    // White noise for the "crack"
    const bufferSize = ctx.sampleRate * duration;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * noiseAmount;
    }

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;

    // Bandpass filter for character
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(pitchStart, now);
    filter.frequency.exponentialRampToValueAtTime(pitchEnd, now + duration);
    filter.Q.value = 1;

    // Envelope
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.8, now + attack);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + duration);

    // Low frequency thump
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(50, now + duration * 0.5);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.3, now);
    oscGain.gain.exponentialRampToValueAtTime(0.01, now + duration * 0.5);

    // Connect
    noiseSource.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.masterGain);

    osc.connect(oscGain);
    oscGain.connect(this.masterGain);

    // Play
    noiseSource.start(now);
    noiseSource.stop(now + duration);
    osc.start(now);
    osc.stop(now + duration);
  }

  public async playRifleShot(): Promise<void> {
    await this.playGunshot(0.15, 2000, 400, 0.8, 0.005);
  }

  public async playPistolShot(): Promise<void> {
    await this.playGunshot(0.1, 2500, 600, 0.6, 0.005);
  }

  public async playSMGShot(): Promise<void> {
    await this.playGunshot(0.08, 2200, 500, 0.5, 0.003);
  }

  public async playMinigunShot(): Promise<void> {
    await this.playGunshot(0.05, 1800, 400, 0.4, 0.002);
  }

  public async playShotgunBlast(): Promise<void> {
    if (!await this.ensureContext() || !this.audioContext || !this.masterGain) return;

    const ctx = this.audioContext;
    const now = ctx.currentTime;
    const duration = 0.3;

    // Heavy noise burst
    const bufferSize = ctx.sampleRate * duration;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1);
    }

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;

    // Low-pass for bassy boom
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3000, now);
    filter.frequency.exponentialRampToValueAtTime(200, now + duration);

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(1, now + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + duration);

    // Bass thump
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(100, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.5, now);
    oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

    noiseSource.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.masterGain);
    osc.connect(oscGain);
    oscGain.connect(this.masterGain);

    noiseSource.start(now);
    noiseSource.stop(now + duration);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  public async playSniperShot(): Promise<void> {
    if (!await this.ensureContext() || !this.audioContext || !this.masterGain) return;

    // Sharp crack
    await this.playGunshot(0.08, 4000, 1000, 0.9, 0.002);

    // Echo/reverb effect
    setTimeout(async () => {
      if (!this.audioContext || !this.masterGain) return;
      const ctx = this.audioContext;
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(200, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.3);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.3);
    }, 50);
  }

  // ============ EXPLOSIONS ============

  public async playExplosion(size: 'small' | 'medium' | 'large' = 'medium'): Promise<void> {
    if (!await this.ensureContext() || !this.audioContext || !this.masterGain) return;

    const ctx = this.audioContext;
    const now = ctx.currentTime;

    const params = {
      small: { duration: 0.4, freq: 100, noiseVol: 0.6, bassVol: 0.4 },
      medium: { duration: 0.6, freq: 80, noiseVol: 0.8, bassVol: 0.6 },
      large: { duration: 1.0, freq: 60, noiseVol: 1.0, bassVol: 0.8 },
    }[size];

    // Explosion noise
    const bufferSize = ctx.sampleRate * params.duration;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      // Shaped noise - louder at start
      const envelope = Math.exp(-i / (bufferSize * 0.2));
      data[i] = (Math.random() * 2 - 1) * envelope * params.noiseVol;
    }

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;

    // Low-pass filter
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2000, now);
    filter.frequency.exponentialRampToValueAtTime(100, now + params.duration);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(params.noiseVol, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + params.duration);

    // Deep bass thump
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(params.freq, now);
    osc.frequency.exponentialRampToValueAtTime(20, now + params.duration * 0.5);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(params.bassVol, now);
    oscGain.gain.exponentialRampToValueAtTime(0.01, now + params.duration * 0.6);

    // Sub-bass rumble
    const subOsc = ctx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(30, now);
    subOsc.frequency.exponentialRampToValueAtTime(15, now + params.duration);

    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(params.bassVol * 0.5, now);
    subGain.gain.exponentialRampToValueAtTime(0.01, now + params.duration);

    // Connect all
    noiseSource.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterGain);

    osc.connect(oscGain);
    oscGain.connect(this.masterGain);

    subOsc.connect(subGain);
    subGain.connect(this.masterGain);

    // Play
    noiseSource.start(now);
    noiseSource.stop(now + params.duration);
    osc.start(now);
    osc.stop(now + params.duration * 0.6);
    subOsc.start(now);
    subOsc.stop(now + params.duration);
  }

  public async playGrenadeExplosion(): Promise<void> {
    await this.playExplosion('medium');
  }

  public async playRocketExplosion(): Promise<void> {
    await this.playExplosion('large');
  }

  public async playMortarExplosion(): Promise<void> {
    await this.playExplosion('large');
  }

  // ============ PROJECTILE FLIGHT SOUNDS ============

  public startProjectileFlightSound(type: WeaponType): FlightSoundHandle | null {
    if (!this.ensureContextSync() || !this.audioContext || !this.masterGain) return null;

    const ctx = this.audioContext;
    const out = this.masterGain;
    const now = ctx.currentTime;

    const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));
    const norm = (v: number, inMin: number, inMax: number): number => {
      if (inMax <= inMin) return 0;
      return clamp((v - inMin) / (inMax - inMin), 0, 1);
    };

    const makeLoopNoise = (seconds: number): AudioBufferSourceNode => {
      const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * seconds));
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1);
      }

      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer;
      src.loop = true;
      return src;
    };

    let stopped = false;
    const stopNodes = (nodes: Array<AudioNode & { disconnect: () => void }>): void => {
      for (const n of nodes) {
        try { n.disconnect(); } catch (e) { /* ignored */ }
      }
    };

    if (type === WeaponType.ROCKET) {
      const mainGain = ctx.createGain();
      // Start audible immediately; we still ramp to avoid clicks.
      mainGain.gain.setValueAtTime(0.08, now);
      mainGain.connect(out);

      const motorOsc = ctx.createOscillator();
      motorOsc.type = 'triangle';
      motorOsc.frequency.setValueAtTime(85, now);

      const motorFilter = ctx.createBiquadFilter();
      motorFilter.type = 'lowpass';
      motorFilter.frequency.setValueAtTime(240, now);
      motorFilter.Q.value = 1.2;

      const motorGain = ctx.createGain();
      motorGain.gain.setValueAtTime(0.19, now);

      const hiss = makeLoopNoise(0.18);
      const hissFilter = ctx.createBiquadFilter();
      hissFilter.type = 'bandpass';
      hissFilter.frequency.setValueAtTime(850, now);
      hissFilter.Q.value = 0.7;

      const hissGain = ctx.createGain();
      hissGain.gain.setValueAtTime(0.12, now);

      motorOsc.connect(motorFilter);
      motorFilter.connect(motorGain);
      motorGain.connect(mainGain);

      hiss.connect(hissFilter);
      hissFilter.connect(hissGain);
      hissGain.connect(mainGain);

      motorOsc.start(now);
      hiss.start(now);

      const update = (vx: number, vy: number): void => {
        if (stopped) return;
        const t = ctx.currentTime;
        const speed = Math.hypot(vx, vy);
        const s = norm(speed, 200, 1400);

        // More speed => more hiss + slightly higher motor "chug"
        motorOsc.frequency.setTargetAtTime(75 + s * 35, t, 0.06);
        motorFilter.frequency.setTargetAtTime(210 + s * 180, t, 0.06);
        hissFilter.frequency.setTargetAtTime(700 + s * 900, t, 0.06);

        mainGain.gain.setTargetAtTime(0.15 + s * 0.18, t, 0.06);
      };

      const stop = (): void => {
        if (stopped) return;
        stopped = true;
        const t = ctx.currentTime;

        mainGain.gain.cancelScheduledValues(t);
        mainGain.gain.setTargetAtTime(0.0001, t, 0.04);

        try { hiss.stop(t + 0.12); } catch (e) { /* ignored */ }
        try { motorOsc.stop(t + 0.12); } catch (e) { /* ignored */ }

        setTimeout(() => stopNodes([hiss, motorOsc, mainGain, motorFilter, motorGain, hissFilter, hissGain]), 250);
      };

      return { update, stop };
    }

    if (type === WeaponType.MORTAR) {
      const mainGain = ctx.createGain();
      mainGain.gain.setValueAtTime(0.04, now);
      mainGain.connect(out);

      const whistle = ctx.createOscillator();
      whistle.type = 'sine';
      whistle.frequency.setValueAtTime(650, now);

      const whistleFilter = ctx.createBiquadFilter();
      whistleFilter.type = 'bandpass';
      whistleFilter.frequency.setValueAtTime(900, now);
      whistleFilter.Q.value = 2.2;

      const whistleGain = ctx.createGain();
      whistleGain.gain.setValueAtTime(0.22, now);

      const air = makeLoopNoise(0.14);
      const airFilter = ctx.createBiquadFilter();
      airFilter.type = 'highpass';
      airFilter.frequency.setValueAtTime(600, now);

      const airGain = ctx.createGain();
      airGain.gain.setValueAtTime(0.10, now);

      whistle.connect(whistleFilter);
      whistleFilter.connect(whistleGain);
      whistleGain.connect(mainGain);

      air.connect(airFilter);
      airFilter.connect(airGain);
      airGain.connect(mainGain);

      whistle.start(now);
      air.start(now);

      const update = (vx: number, vy: number): void => {
        if (stopped) return;
        const t = ctx.currentTime;
        const speed = Math.hypot(vx, vy);
        const falling = Math.max(0, vy); // Phaser: +Y is down
        const s = norm(speed, 150, 1400);
        const f = norm(falling, 50, 900);

        // Mortar whistle mostly on descent; soften on ascent.
        const level = 0.02 + f * 0.34;
        mainGain.gain.setTargetAtTime(level, t, 0.04);

        const freq = 650 + f * 1100;
        whistle.frequency.setTargetAtTime(freq, t, 0.05);
        whistleFilter.frequency.setTargetAtTime(900 + f * 900, t, 0.05);
        airFilter.frequency.setTargetAtTime(500 + s * 1100, t, 0.05);
      };

      const stop = (): void => {
        if (stopped) return;
        stopped = true;
        const t = ctx.currentTime;

        mainGain.gain.cancelScheduledValues(t);
        mainGain.gain.setTargetAtTime(0.0001, t, 0.03);

        try { air.stop(t + 0.12); } catch (e) { /* ignored */ }
        try { whistle.stop(t + 0.12); } catch (e) { /* ignored */ }

        setTimeout(() => stopNodes([air, whistle, mainGain, whistleFilter, whistleGain, airFilter, airGain]), 250);
      };

      return { update, stop };
    }

    if (type === WeaponType.GRENADE) {
      const mainGain = ctx.createGain();
      mainGain.gain.setValueAtTime(0.025, now);
      mainGain.connect(out);

      const whoosh = makeLoopNoise(0.12);
      const whooshFilter = ctx.createBiquadFilter();
      whooshFilter.type = 'bandpass';
      whooshFilter.frequency.setValueAtTime(600, now);
      whooshFilter.Q.value = 0.9;

      const whooshGain = ctx.createGain();
      whooshGain.gain.setValueAtTime(0.11, now);

      whoosh.connect(whooshFilter);
      whooshFilter.connect(whooshGain);
      whooshGain.connect(mainGain);

      whoosh.start(now);

      const update = (vx: number, vy: number): void => {
        if (stopped) return;
        const t = ctx.currentTime;
        const speed = Math.hypot(vx, vy);
        const s = norm(speed, 120, 900);

        whooshFilter.frequency.setTargetAtTime(450 + s * 900, t, 0.06);
        mainGain.gain.setTargetAtTime(0.02 + s * 0.12, t, 0.06);
      };

      const stop = (): void => {
        if (stopped) return;
        stopped = true;
        const t = ctx.currentTime;

        mainGain.gain.cancelScheduledValues(t);
        mainGain.gain.setTargetAtTime(0.0001, t, 0.03);

        try { whoosh.stop(t + 0.12); } catch (e) { /* ignored */ }
        setTimeout(() => stopNodes([whoosh, mainGain, whooshFilter, whooshGain]), 220);
      };

      return { update, stop };
    }

    return null;
  }

  // ============ OTHER SOUNDS ============

  public async playFlamethrower(): Promise<void> {
    if (!await this.ensureContext() || !this.audioContext || !this.masterGain) return;

    const ctx = this.audioContext;
    const now = ctx.currentTime;
    const duration = 1.0;

    // Rushing air/fire noise
    const bufferSize = ctx.sampleRate * duration;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      // Modulated noise for whooshing effect
      const mod = Math.sin(i / ctx.sampleRate * 20 * Math.PI * 2) * 0.3 + 0.7;
      data[i] = (Math.random() * 2 - 1) * mod;
    }

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800, now);
    filter.Q.value = 2;

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.4, now + 0.1);
    gainNode.gain.setValueAtTime(0.4, now + duration - 0.2);
    gainNode.gain.linearRampToValueAtTime(0, now + duration);

    noiseSource.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.masterGain);

    noiseSource.start(now);
    noiseSource.stop(now + duration);
  }

  public async playBulletImpact(): Promise<void> {
    if (!await this.ensureContext() || !this.audioContext || !this.masterGain) return;

    const ctx = this.audioContext;
    const now = ctx.currentTime;

    // Quick thud
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(50, now + 0.05);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  public async playDeath(): Promise<void> {
    if (!await this.ensureContext() || !this.audioContext || !this.masterGain) return;

    const ctx = this.audioContext;
    const now = ctx.currentTime;

    // Descending tone
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.5);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1000;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.5);
  }

  public async playSelect(): Promise<void> {
    if (!await this.ensureContext() || !this.audioContext || !this.masterGain) return;

    const ctx = this.audioContext;
    const now = ctx.currentTime;

    // Quick blip
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.setValueAtTime(800, now + 0.05);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  // ============ MILITARY MUSIC ============
  
  public async startMilitaryMusic(): Promise<void> {
    if (!await this.ensureContext() || !this.audioContext || !this.musicGain) return;
    if (this.musicPlaying) return;
    
    this.musicPlaying = true;

    // Fade in so the first drum hits don't feel abrupt.
    const now = this.audioContext.currentTime;
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setValueAtTime(0.0001, now);
    this.musicGain.gain.linearRampToValueAtTime(this.volume * 0.34, now + 0.8);
    
    // Play a simple military march pattern in a loop
    this.playMarchLoop();
  }

  // Classical in-game music (cello-forward, procedural).
  public async startCelloMusic(): Promise<void> {
    if (!await this.ensureContext() || !this.audioContext || !this.musicGain) return;
    if (this.musicPlaying) return;

    this.musicPlaying = true;

    const now = this.audioContext.currentTime;
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setValueAtTime(0.0001, now);
    this.musicGain.gain.linearRampToValueAtTime(this.volume * 0.28, now + 1.2);

    this.playCelloLoop();
  }
  
  private async playMarchLoop(): Promise<void> {
    if (!this.musicPlaying || !this.audioContext || !this.musicGain) return;
    
    const ctx = this.audioContext;
    const now = ctx.currentTime + 0.02;

    // Notes stop on their own; keep only the current loop's oscillators so this doesn't grow unbounded.
    this.musicOscillators = [];
    
    // Drum-forward march with a subdued brass-like line.
    // (Less synthy than the previous sawtooth melody.)
    const melody = [
      { freq: 164.81, dur: 0.25 }, // E3
      { freq: 196.00, dur: 0.25 }, // G3
      { freq: 246.94, dur: 0.25 }, // B3
      { freq: 329.63, dur: 0.25 }, // E4
      { freq: 293.66, dur: 0.25 }, // D4
      { freq: 246.94, dur: 0.25 }, // B3
      { freq: 196.00, dur: 0.25 }, // G3
      { freq: 164.81, dur: 0.25 }, // E3

      { freq: 196.00, dur: 0.25 }, // G3
      { freq: 246.94, dur: 0.25 }, // B3
      { freq: 329.63, dur: 0.25 }, // E4
      { freq: 392.00, dur: 0.25 }, // G4
      { freq: 329.63, dur: 0.25 }, // E4
      { freq: 246.94, dur: 0.25 }, // B3
      { freq: 196.00, dur: 0.25 }, // G3
      { freq: 164.81, dur: 0.25 }, // E3
    ];
    
    let time = now;
    
    melody.forEach(note => {
      // Main melody oscillator (brass-like)
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = note.freq;
      
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 950;
      filter.Q.value = 1.6;
      
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, time);
      // Keep melody subtle; drums carry the track.
      gain.gain.linearRampToValueAtTime(0.035, time + 0.015);
      gain.gain.setValueAtTime(0.025, time + note.dur - 0.03);
      gain.gain.linearRampToValueAtTime(0, time + note.dur);
      
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicGain!);
      
      osc.start(time);
      osc.stop(time + note.dur);
      this.musicOscillators.push(osc);
      
      time += note.dur;
    });
    
    // Add drum beats
    const loopDuration = melody.reduce((sum, n) => sum + n.dur, 0);
    this.playDrumBeat(now, loopDuration);
    
    // Loop the melody
    setTimeout(() => {
      if (this.musicPlaying) {
        this.playMarchLoop();
      }
    }, loopDuration * 1000);
  }

  private async playCelloLoop(): Promise<void> {
    if (!this.musicPlaying || !this.audioContext || !this.musicGain) return;

    const ctx = this.audioContext;
    const out = this.musicGain;
    const now = ctx.currentTime + 0.02;

    // Notes stop on their own; keep only the current loop's oscillators so this doesn't grow unbounded.
    this.musicOscillators = [];

    const bpm = 68;
    const beat = 60 / bpm;
    const bar = beat * 4;

    type Chord = { bass: number; tones: number[] };

    // D minor -> Bb major -> G minor -> A major (classical cadence-ish loop).
    const progression: Chord[] = [
      { bass: 73.42, tones: [146.83, 174.61, 220.0] }, // Dm (D3, F3, A3)
      { bass: 58.27, tones: [116.54, 146.83, 174.61] }, // Bb (Bb2, D3, F3)
      { bass: 98.0, tones: [196.0, 146.83, 116.54] }, // Gm (G3, D3, Bb2)
      { bass: 110.0, tones: [220.0, 164.81, 138.59] }, // A (A3, E3, C#3)
    ];

    const scheduleBowed = (freq: number, start: number, dur: number, level: number, brightness: number): void => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, start);

      // Gentle vibrato.
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(5.2, start);
      const lfoGain = ctx.createGain();
      lfoGain.gain.setValueAtTime(3.0, start); // +/- Hz
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 0.9;
      filter.frequency.setValueAtTime(brightness, start);
      filter.frequency.exponentialRampToValueAtTime(Math.max(180, brightness * 0.65), start + dur);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(level, start + 0.035);
      gain.gain.setValueAtTime(level * 0.9, start + Math.max(0.05, dur - 0.12));
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(out);

      lfo.start(start);
      osc.start(start);
      const stopAt = start + dur + 0.02;
      lfo.stop(stopAt);
      osc.stop(stopAt);

      this.musicOscillators.push(lfo, osc);
    };

    let time = now;
    const loopBars = 8; // 2 bars per chord (lush, slower movement)
    const chordsInLoop = progression.length;
    const totalBars = loopBars;
    const barsPerChord = totalBars / chordsInLoop; // 2

    for (let i = 0; i < chordsInLoop; i++) {
      const chord = progression[i];
      const chordStart = time;
      const chordDur = bar * barsPerChord;

      // Low cello drone (bowed bass).
      scheduleBowed(chord.bass, chordStart, chordDur, 0.06, 420);

      // Mid cello arpeggio (quarter notes).
      const arp = chord.tones;
      for (let b = 0; b < barsPerChord * 4; b++) {
        const t = chordStart + b * beat;
        const note = arp[b % arp.length];
        scheduleBowed(note, t, beat * 0.92, 0.032, 640);
      }

      // Simple lyrical "cello melody" (half notes near the top tone).
      for (let h = 0; h < barsPerChord * 2; h++) {
        const t = chordStart + h * (beat * 2);
        const note = arp[(h + 1) % arp.length] * 1.0;
        scheduleBowed(note, t, beat * 1.85, 0.018, 820);
      }

      time += chordDur;
    }

    const loopDuration = bar * totalBars;
    setTimeout(() => {
      if (this.musicPlaying) this.playCelloLoop();
    }, loopDuration * 1000);
  }
  
  private async playDrumBeat(startTime: number, duration: number): Promise<void> {
    if (!this.audioContext || !this.musicGain) return;
    
    const ctx = this.audioContext;
    // 120 BPM march feel (quarter = 0.5s, eighth = 0.25s)
    const q = 0.5;
    const e = q / 2;

    // Reusable noise buffers for snare/hat.
    const makeNoiseBuffer = (seconds: number, decay: number): AudioBuffer => {
      const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * seconds));
      const b = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = b.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        const env = Math.exp(-i / (bufferSize * decay));
        data[i] = (Math.random() * 2 - 1) * env;
      }
      return b;
    };

    const snareBuf = makeNoiseBuffer(0.12, 0.18);
    const hatBuf = makeNoiseBuffer(0.05, 0.08);

    const scheduleKick = (t: number, accent: number): void => {
      const kick = ctx.createOscillator();
      kick.type = 'sine';
      kick.frequency.setValueAtTime(160, t);
      kick.frequency.exponentialRampToValueAtTime(45, t + 0.11);

      const kickGain = ctx.createGain();
      kickGain.gain.setValueAtTime(0.45 * accent, t);
      kickGain.gain.exponentialRampToValueAtTime(0.01, t + 0.16);

      kick.connect(kickGain);
      kickGain.connect(this.musicGain!);
      kick.start(t);
      kick.stop(t + 0.16);
    };

    const scheduleSnare = (t: number, accent: number): void => {
      const noise = ctx.createBufferSource();
      noise.buffer = snareBuf;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(2000, t);
      filter.Q.value = 0.9;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.22 * accent, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.14);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicGain!);
      noise.start(t);
      noise.stop(t + 0.14);
    };

    const scheduleHat = (t: number, accent: number): void => {
      const noise = ctx.createBufferSource();
      noise.buffer = hatBuf;

      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(5000, t);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.065 * accent, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.06);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicGain!);
      noise.start(t);
      noise.stop(t + 0.06);
    };

    const scheduleSnareRoll = (t0: number): void => {
      // Quick roll in the last eighth before the bar repeats.
      const hits = 5;
      const dt = e / hits;
      for (let i = 0; i < hits; i++) {
        scheduleSnare(t0 + i * dt, 0.4);
      }
    };

    const end = startTime + duration;
    for (let t = startTime; t < end - 0.0001; t += e) {
      const step = Math.round((t - startTime) / e);
      const inBar = step % 8; // 8 eighth-notes per bar (4/4)

      // Hats on every eighth, accent the offbeats.
      scheduleHat(t, inBar % 2 === 1 ? 1.1 : 0.85);

      // Kick on 1 and 3.
      if (inBar === 0 || inBar === 4) {
        scheduleKick(t, inBar === 0 ? 1.2 : 1.0);
      }

      // Snare on 2 and 4.
      if (inBar === 2 || inBar === 6) {
        scheduleSnare(t, 1.1);
      }

      // Ghost notes for marching feel.
      if (inBar === 1 || inBar === 5) {
        scheduleSnare(t, 0.35);
      }

      // Roll at the end of every bar.
      if (inBar === 7) {
        scheduleSnareRoll(t + e * 0.35);
      }
    }
  }
  
  public stopMusic(): void {
    this.musicPlaying = false;
    this.musicOscillators.forEach(osc => {
      try { osc.stop(); } catch (e) { /* already stopped */ }
    });
    this.musicOscillators = [];
    
    // Fade out music gain
    if (this.musicGain && this.audioContext) {
      this.musicGain.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.5);
    }
  }
  
  // ============ PLANE SOUNDS ============
  
  public async playPlaneEngine(duration: number = 3): Promise<void> {
    if (!await this.ensureContext() || !this.audioContext || !this.masterGain) return;
    
    const ctx = this.audioContext;
    const now = ctx.currentTime;
    
    // Propeller engine sound (low rumble + higher whine)
    // Low rumble
    const rumble = ctx.createOscillator();
    rumble.type = 'sawtooth';
    rumble.frequency.setValueAtTime(80, now);
    rumble.frequency.setValueAtTime(85, now + duration * 0.5);
    rumble.frequency.setValueAtTime(75, now + duration);
    
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.setValueAtTime(0, now);
    rumbleGain.gain.linearRampToValueAtTime(0.15, now + 0.3);
    rumbleGain.gain.setValueAtTime(0.15, now + duration - 0.5);
    rumbleGain.gain.linearRampToValueAtTime(0, now + duration);
    
    const rumbleFilter = ctx.createBiquadFilter();
    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.value = 200;
    
    rumble.connect(rumbleFilter);
    rumbleFilter.connect(rumbleGain);
    rumbleGain.connect(this.masterGain);
    
    // Propeller whine
    const prop = ctx.createOscillator();
    prop.type = 'sawtooth';
    prop.frequency.setValueAtTime(220, now);
    // Doppler effect - pitch changes as plane passes
    prop.frequency.linearRampToValueAtTime(260, now + duration * 0.3);
    prop.frequency.linearRampToValueAtTime(180, now + duration);
    
    const propGain = ctx.createGain();
    propGain.gain.setValueAtTime(0, now);
    propGain.gain.linearRampToValueAtTime(0.08, now + 0.5);
    propGain.gain.setValueAtTime(0.08, now + duration - 0.8);
    propGain.gain.linearRampToValueAtTime(0, now + duration);
    
    const propFilter = ctx.createBiquadFilter();
    propFilter.type = 'bandpass';
    propFilter.frequency.value = 400;
    propFilter.Q.value = 2;
    
    prop.connect(propFilter);
    propFilter.connect(propGain);
    propGain.connect(this.masterGain);
    
    rumble.start(now);
    rumble.stop(now + duration);
    prop.start(now);
    prop.stop(now + duration);
  }
  
  public async playBombWhistle(duration: number = 1.5): Promise<void> {
    if (!await this.ensureContext() || !this.audioContext || !this.masterGain) return;
    
    const ctx = this.audioContext;
    const now = ctx.currentTime;
    
    // Descending whistle
    const whistle = ctx.createOscillator();
    whistle.type = 'sine';
    whistle.frequency.setValueAtTime(1200, now);
    whistle.frequency.exponentialRampToValueAtTime(200, now + duration);
    
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.1);
    gain.gain.setValueAtTime(0.25, now + duration - 0.1);
    gain.gain.linearRampToValueAtTime(0, now + duration);
    
    // Add some noise for realism
    const bufferSize = ctx.sampleRate * duration;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.1;
    }
    
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.05, now);
    noiseGain.gain.linearRampToValueAtTime(0.15, now + duration);
    
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(1000, now);
    noiseFilter.frequency.exponentialRampToValueAtTime(300, now + duration);
    
    whistle.connect(gain);
    gain.connect(this.masterGain);
    
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.masterGain);
    
    whistle.start(now);
    whistle.stop(now + duration);
    noise.start(now);
    noise.stop(now + duration);
  }
  
  // ============ CHURCHILL-STYLE QUOTE READING ============
  
  public async speakQuote(text: string, author: string): Promise<void> {
    if (!this.speechSynth) {
      this.init();
    }
    if (!this.speechSynth) return;
    
    // Cancel any ongoing speech
    this.speechSynth.cancel();
    
    // Speak the quote with Churchill-like delivery
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.75; // Slow, deliberate
    utterance.pitch = 0.7; // Deep voice
    utterance.volume = this.volume * 1.2;
    
    // Try to find a deep British English voice
    const voices = this.speechSynth.getVoices();
    const britishVoice = voices.find(v => 
      v.lang === 'en-GB' && (v.name.toLowerCase().includes('male') || v.name.includes('Daniel') || v.name.includes('George'))
    ) || voices.find(v => v.lang === 'en-GB')
      || voices.find(v => v.lang.startsWith('en') && v.name.toLowerCase().includes('male'))
      || voices.find(v => v.lang.startsWith('en'))
      || voices[0];
    
    if (britishVoice) {
      utterance.voice = britishVoice;
    }
    
    // Add dramatic pauses by breaking into sentences
    this.speechSynth.speak(utterance);
    
    // Speak author after a pause
    setTimeout(() => {
      if (!this.speechSynth) return;
      const authorUtterance = new SpeechSynthesisUtterance(author);
      authorUtterance.rate = 0.85;
      authorUtterance.pitch = 0.8;
      authorUtterance.volume = this.volume * 0.8;
      if (britishVoice) {
        authorUtterance.voice = britishVoice;
      }
      this.speechSynth.speak(authorUtterance);
    }, (text.length * 80) + 500); // Estimate speech duration + pause
  }
}

// Export singleton instance
export const SoundManager = new SoundManagerClass();
