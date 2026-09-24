/**
 * SoundManager - Procedural sound effects using Web Audio API
 * and voice announcements using Web Speech API
 */

import { WeaponType } from '../systems/WeaponTypes';
import {
  getBattleBaselineIntensity,
  getMusicMovement,
  transposeFrequency,
  type DirectedMusicMovement,
  type MusicSection,
} from '../systems/MusicDirector';

type FlightSoundHandle = {
  update: (vx: number, vy: number) => void;
  stop: () => void;
};

export type BattleMusicPhase = Exclude<MusicSection, 'menu'>;

class SoundManagerClass {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private initialized = false;
  private speechSynth: SpeechSynthesis | null = null;
  private speechToken = 0;
  private volume = 0.5;
  private musicGain: GainNode | null = null;
  private musicCompressor: DynamicsCompressorNode | null = null;
  private musicPlaying = false;
  private musicSources: AudioScheduledSourceNode[] = [];
  private musicLoopTimer: number | null = null;
  private musicSessionId = 0;
  private musicIntensityTimeout: number | null = null;
  private musicIntensity = 0.32;
  private battleMusicPhase: BattleMusicPhase = 'maneuver';
  private battleLoopCount: number = 0;
  private menuLoopCount: number = 0;

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
      this.musicCompressor = this.audioContext.createDynamicsCompressor();
      this.musicCompressor.threshold.value = -18;
      this.musicCompressor.knee.value = 16;
      this.musicCompressor.ratio.value = 4;
      this.musicCompressor.attack.value = 0.012;
      this.musicCompressor.release.value = 0.24;
      this.musicGain.connect(this.musicCompressor);
      this.musicCompressor.connect(this.audioContext.destination);
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
    if (this.musicGain && this.audioContext && this.musicPlaying) {
      const now = this.audioContext.currentTime;
      this.musicGain.gain.setTargetAtTime(
        this.volume * (0.17 + this.musicIntensity * 0.15),
        now,
        0.08,
      );
    }
  }

  public setMusicIntensity(intensity: number, rampSeconds: number = 0.45): void {
    this.musicIntensity = Math.max(0, Math.min(1, intensity));
    if (!this.audioContext || !this.musicGain || !this.musicPlaying) return;
    const now = this.audioContext.currentTime;
    const target = this.volume * (0.17 + this.musicIntensity * 0.15);
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setValueAtTime(Math.max(0.0001, this.musicGain.gain.value), now);
    this.musicGain.gain.linearRampToValueAtTime(target, now + Math.max(0.05, rampSeconds));
  }

  public pulseMusicIntensity(intensity: number, holdSeconds: number = 1.2): void {
    if (this.musicIntensityTimeout !== null) {
      window.clearTimeout(this.musicIntensityTimeout);
      this.musicIntensityTimeout = null;
    }
    this.setMusicIntensity(intensity, 0.16);
    this.musicIntensityTimeout = window.setTimeout(() => {
      this.musicIntensityTimeout = null;
      this.settleBattleMusic(1.1);
    }, Math.max(200, holdSeconds * 1000));
  }

  public settleBattleMusic(rampSeconds: number = 0.8): void {
    this.setMusicIntensity(getBattleBaselineIntensity(this.battleMusicPhase), rampSeconds);
  }

  public setBattleMusicPhase(phase: BattleMusicPhase): void {
    if (phase === this.battleMusicPhase) return;
    this.battleMusicPhase = phase;
    this.playMusicPhaseStinger(phase);
    this.settleBattleMusic(0.9);
  }

  private playMusicPhaseStinger(phase: BattleMusicPhase): void {
    if (!this.audioContext || !this.musicGain || !this.musicPlaying) return;
    const ctx = this.audioContext;
    const now = ctx.currentTime + 0.02;
    const notes = phase === 'finale'
      ? [146.83, 174.61, 220]
      : phase === 'pressure'
        ? [110, 130.81]
        : [82.41, 110];

    notes.forEach((frequency, index) => {
      const start = now + index * 0.16;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(frequency, start);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(520, start);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.035, start + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.48);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicGain!);
      osc.start(start);
      osc.stop(start + 0.5);
      this.musicSources.push(osc);
    });
  }

  public async playDig(): Promise<void> {
    if (!await this.ensureContext() || !this.audioContext || !this.masterGain) return;
    const ctx = this.audioContext;
    const now = ctx.currentTime;

    for (let i = 0; i < 3; i++) {
      const t = now + i * 0.13;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(92 - i * 9, t);
      osc.frequency.exponentialRampToValueAtTime(48, t + 0.11);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.1, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.15);
    }
  }

  public async playObjectiveStinger(team: 'red' | 'blue'): Promise<void> {
    if (!await this.ensureContext() || !this.audioContext || !this.masterGain) return;
    const ctx = this.audioContext;
    const now = ctx.currentTime;
    const notes = team === 'red' ? [196, 233.08, 293.66] : [220, 261.63, 329.63];

    notes.forEach((frequency, index) => {
      const start = now + index * 0.12;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(frequency, start);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(950, start);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.08, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.45);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(start);
      osc.stop(start + 0.48);
    });
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
      mainGain.gain.setValueAtTime(0.0001, now);
      mainGain.connect(out);

      const whistle = ctx.createOscillator();
      whistle.type = 'sine';
      whistle.frequency.setValueAtTime(1050, now);

      const whistleFilter = ctx.createBiquadFilter();
      whistleFilter.type = 'bandpass';
      whistleFilter.frequency.setValueAtTime(900, now);
      whistleFilter.Q.value = 0.65;

      const whistleGain = ctx.createGain();
      whistleGain.gain.setValueAtTime(0.10, now);

      const air = makeLoopNoise(0.14);
      const airFilter = ctx.createBiquadFilter();
      airFilter.type = 'bandpass';
      airFilter.Q.value = 0.6;
      airFilter.frequency.setValueAtTime(600, now);

      const airGain = ctx.createGain();
      airGain.gain.setValueAtTime(0.035, now);

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
        const level = vy > 40 ? 0.05 + f * 0.12 : 0.0001;
        mainGain.gain.setTargetAtTime(level, t, 0.16);

        const freq = 1050 - f * 430;
        whistle.frequency.setTargetAtTime(freq, t, 0.16);
        whistleFilter.frequency.setTargetAtTime(freq, t, 0.16);
        airFilter.frequency.setTargetAtTime(850 + s * 200, t, 0.16);
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
    this.menuLoopCount = 0;
    this.musicIntensity = 0.36;
    const sessionId = ++this.musicSessionId;

    // Fade in so the first drum hits don't feel abrupt.
    const now = this.audioContext.currentTime;
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setValueAtTime(0.0001, now);
    this.musicGain.gain.linearRampToValueAtTime(
      this.volume * (0.17 + this.musicIntensity * 0.15),
      now + 1.0,
    );
    
    this.playMarchLoop(sessionId);
  }

  // Tactical in-game score with phase-directed procedural movements.
  public async startBattleMusic(): Promise<void> {
    if (!await this.ensureContext() || !this.audioContext || !this.musicGain) return;
    if (this.musicPlaying) return;

    this.musicPlaying = true;
    this.battleLoopCount = 0;
    this.musicIntensity = getBattleBaselineIntensity(this.battleMusicPhase);
    const sessionId = ++this.musicSessionId;

    const now = this.audioContext.currentTime;
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setValueAtTime(0.0001, now);
    this.musicGain.gain.linearRampToValueAtTime(
      this.volume * (0.17 + this.musicIntensity * 0.15),
      now + 1.6,
    );

    this.playBattleScoreLoop(sessionId);
  }

  private scheduleNextMusicLoop(
    sessionId: number,
    durationSeconds: number,
    callback: () => void,
  ): void {
    if (this.musicLoopTimer !== null) {
      window.clearTimeout(this.musicLoopTimer);
    }
    this.musicLoopTimer = window.setTimeout(() => {
      this.musicLoopTimer = null;
      if (!this.musicPlaying || sessionId !== this.musicSessionId) return;
      callback();
    }, Math.max(50, (durationSeconds - 0.03) * 1000));
  }
  
  private async playMarchLoop(sessionId: number): Promise<void> {
    if (
      !this.musicPlaying ||
      sessionId !== this.musicSessionId ||
      !this.audioContext ||
      !this.musicGain
    ) return;
    
    const ctx = this.audioContext;
    const now = ctx.currentTime + 0.02;
    const plan = getMusicMovement('menu', this.menuLoopCount++);
    const beat = 60 / plan.bpm;
    const bar = beat * 4;
    const loopDuration = bar * plan.bars;
    const variationShift = plan.variation === 1
      ? plan.alternateShift
      : plan.variation === 2
        ? -2
        : 0;

    this.musicSources = [];

    for (let segment = 0; segment < plan.progression.length; segment++) {
      const start = now + segment * bar * 2;
      const duration = bar * 2;
      const frequency = transposeFrequency(
        plan.rootHz,
        plan.progression[segment] + variationShift,
      );
      const drone = ctx.createOscillator();
      drone.type = plan.texture === 'strings' ? 'sawtooth' : 'triangle';
      drone.frequency.setValueAtTime(frequency, start);

      const droneFilter = ctx.createBiquadFilter();
      droneFilter.type = 'lowpass';
      droneFilter.frequency.setValueAtTime(plan.texture === 'open' ? 340 : 230, start);
      const droneGain = ctx.createGain();
      droneGain.gain.setValueAtTime(0.0001, start);
      droneGain.gain.linearRampToValueAtTime(plan.stringLevel, start + beat * 0.75);
      droneGain.gain.setValueAtTime(plan.stringLevel * 0.85, start + duration - beat * 0.6);
      droneGain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      drone.connect(droneFilter);
      droneFilter.connect(droneGain);
      droneGain.connect(this.musicGain);
      drone.start(start);
      drone.stop(start + duration + 0.02);
      this.musicSources.push(drone);
    }

    for (const note of plan.motif) {
      const start = now + note.bar * bar + note.beat * beat;
      const duration = Math.max(0.18, note.durationBeats * beat);
      const frequency = transposeFrequency(
        plan.rootHz,
        note.semitones + variationShift,
        plan.leadOctaves,
      );
      const primary = ctx.createOscillator();
      primary.type = 'triangle';
      primary.frequency.setValueAtTime(frequency, start);
      primary.detune.setValueAtTime(-3, start);
      const harmonic = ctx.createOscillator();
      harmonic.type = 'sawtooth';
      harmonic.frequency.setValueAtTime(frequency * 2, start);
      harmonic.detune.setValueAtTime(4, start);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(
        plan.texture === 'muted' ? 560 : plan.texture === 'open' ? 920 : 680,
        start,
      );
      filter.Q.value = 1.6;

      const gain = ctx.createGain();
      const level = plan.brassLevel * note.accent;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(level, start + 0.055);
      gain.gain.setValueAtTime(level * 0.7, start + Math.max(0.08, duration - 0.16));
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      const harmonicGain = ctx.createGain();
      harmonicGain.gain.setValueAtTime(0.16, start);
      primary.connect(filter);
      harmonic.connect(harmonicGain);
      harmonicGain.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicGain);
      primary.start(start);
      harmonic.start(start);
      primary.stop(start + duration + 0.02);
      harmonic.stop(start + duration + 0.02);
      this.musicSources.push(primary, harmonic);
    }

    this.playDrumBeat(now, loopDuration, plan);
    this.scheduleNextMusicLoop(
      sessionId,
      loopDuration,
      () => this.playMarchLoop(sessionId),
    );
  }

  private async playBattleScoreLoop(sessionId: number): Promise<void> {
    if (
      !this.musicPlaying ||
      sessionId !== this.musicSessionId ||
      !this.audioContext ||
      !this.musicGain
    ) return;

    const ctx = this.audioContext;
    const out = this.musicGain;
    const now = ctx.currentTime + 0.02;

    const phase = this.battleMusicPhase;
    const plan = getMusicMovement(phase, this.battleLoopCount++);
    const beat = 60 / plan.bpm;
    const bar = beat * 4;
    const variationShift = plan.variation === 1
      ? plan.alternateShift
      : plan.variation === 2
        ? -2
        : 0;

    this.musicSources = [];

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

    const snareBuf = makeNoiseBuffer(0.16, 0.16);
    const airBuf = makeNoiseBuffer(3.2, 0.95);

    const scheduleDrone = (freq: number, start: number, dur: number, level: number): void => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, start);

      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(3.8, start);
      const lfoGain = ctx.createGain();
      lfoGain.gain.setValueAtTime(1.4, start);
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 0.7;
      const droneCutoff = plan.texture === 'open' ? 310 : plan.texture === 'muted' ? 205 : 250;
      filter.frequency.setValueAtTime(droneCutoff, start);
      filter.frequency.linearRampToValueAtTime(droneCutoff * 0.76, start + dur);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(level, start + 0.3);
      gain.gain.setValueAtTime(level * 0.92, start + Math.max(0.4, dur - 0.5));
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(out);

      lfo.start(start);
      osc.start(start);
      const stopAt = start + dur + 0.02;
      lfo.stop(stopAt);
      osc.stop(stopAt);

      this.musicSources.push(lfo, osc);
    };

    const scheduleHorn = (freq: number, start: number, dur: number, level: number): void => {
      const primary = ctx.createOscillator();
      primary.type = 'triangle';
      primary.frequency.setValueAtTime(freq, start);
      primary.detune.setValueAtTime(-4, start);
      const harmonic = ctx.createOscillator();
      harmonic.type = 'sawtooth';
      harmonic.frequency.setValueAtTime(freq * 2, start);
      harmonic.detune.setValueAtTime(5, start);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 1.8;
      filter.frequency.setValueAtTime(
        plan.texture === 'muted' ? 540 : plan.texture === 'open' ? 940 : 680,
        start,
      );

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(level, start + 0.08);
      gain.gain.setValueAtTime(level * 0.75, start + Math.max(0.1, dur - 0.18));
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);

      const harmonicGain = ctx.createGain();
      harmonicGain.gain.setValueAtTime(plan.texture === 'open' ? 0.2 : 0.13, start);
      primary.connect(filter);
      harmonic.connect(harmonicGain);
      harmonicGain.connect(filter);
      filter.connect(gain);
      gain.connect(out);
      primary.start(start);
      harmonic.start(start);
      primary.stop(start + dur + 0.02);
      harmonic.stop(start + dur + 0.02);
      this.musicSources.push(primary, harmonic);
    };

    const scheduleSnare = (t: number, accent: number): void => {
      const noise = ctx.createBufferSource();
      noise.buffer = snareBuf;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1450, t);
      filter.Q.value = 1.1;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.12 * accent * plan.percussionLevel, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(out);
      noise.start(t);
      noise.stop(t + 0.18);
      this.musicSources.push(noise);
    };

    const scheduleKick = (t: number, accent: number): void => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(82, t);
      osc.frequency.exponentialRampToValueAtTime(38, t + 0.16);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.11 * accent * plan.percussionLevel, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);

      osc.connect(gain);
      gain.connect(out);
      osc.start(t);
      osc.stop(t + 0.2);
      this.musicSources.push(osc);
    };

    const scheduleAir = (start: number, dur: number): void => {
      const air = ctx.createBufferSource();
      air.buffer = airBuf;
      air.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(310, start);
      filter.Q.value = 0.45;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(plan.airLevel, start + 0.8);
      gain.gain.setValueAtTime(plan.airLevel * 0.84, start + dur - 0.5);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);

      air.connect(filter);
      filter.connect(gain);
      gain.connect(out);
      air.start(start);
      air.stop(start + dur);
      this.musicSources.push(air);
    };

    const loopDuration = bar * plan.bars;
    scheduleAir(now, loopDuration);

    const harmonicSegmentDuration = loopDuration / plan.progression.length;
    plan.progression.forEach((semitones, index) => {
      scheduleDrone(
        transposeFrequency(plan.rootHz, semitones + variationShift),
        now + index * harmonicSegmentDuration,
        harmonicSegmentDuration,
        plan.stringLevel * (index === 0 ? 1 : 0.86),
      );
    });

    for (let barIndex = 0; barIndex < plan.bars; barIndex++) {
      const t = now + barIndex * bar;
      const strongBar = barIndex % 4 === 0 ? 1.25 : 1;

      if (plan.cadence === 'dirge') {
        scheduleKick(t, strongBar);
        scheduleSnare(t + beat * 3, 0.48);
      } else if (plan.cadence === 'patrol') {
        scheduleKick(t, strongBar);
        if (barIndex % 2 === 0) scheduleKick(t + beat * 2.5, 0.52);
        scheduleSnare(t + beat * 2, 0.62);
      } else if (plan.cadence === 'procession' || plan.cadence === 'inspection') {
        scheduleKick(t, strongBar);
        scheduleKick(t + beat * 2, 0.7);
        scheduleSnare(t + beat, 0.72);
        scheduleSnare(t + beat * 3, 0.66);
      } else if (plan.cadence === 'advance') {
        scheduleKick(t, strongBar);
        scheduleKick(t + beat * 2, 0.82);
        scheduleSnare(t + beat, 0.86);
        scheduleSnare(t + beat * 3, 0.8);
        if (barIndex % 2 === 1) scheduleKick(t + beat * 3.5, 0.42);
      } else if (plan.cadence === 'siege') {
        scheduleKick(t, strongBar * 1.08);
        scheduleKick(t + beat * 2.5, 0.76);
        scheduleSnare(t + beat * 1.5, 0.62);
        scheduleSnare(t + beat * 3, 0.84);
      } else {
        scheduleKick(t, strongBar * 1.12);
        scheduleKick(t + beat * 1.5, 0.66);
        scheduleKick(t + beat * 2.75, 0.78);
        scheduleSnare(t + beat, 0.92);
        scheduleSnare(t + beat * 2, 0.72);
        scheduleSnare(t + beat * 3, 0.94);
      }

      const fillBar = barIndex === plan.bars - 1 ||
        (plan.variation === 2 && barIndex === Math.floor(plan.bars / 2) - 1);
      if (fillBar && plan.cadence !== 'dirge') {
        scheduleSnare(t + beat * 3.5, 0.45);
        scheduleSnare(t + beat * 3.68, 0.35);
        scheduleSnare(t + beat * 3.84, 0.32);
      }
    }

    for (const note of plan.motif) {
      const harmonicShift = plan.progression[
        Math.min(
          plan.progression.length - 1,
          Math.floor(note.bar / (plan.bars / plan.progression.length)),
        )
      ];
      const frequency = transposeFrequency(
        plan.rootHz,
        note.semitones + harmonicShift + variationShift,
        plan.leadOctaves,
      );
      scheduleHorn(
        frequency,
        now + note.bar * bar + note.beat * beat,
        Math.max(0.18, note.durationBeats * beat),
        plan.brassLevel * note.accent,
      );
    }

    this.scheduleNextMusicLoop(
      sessionId,
      loopDuration,
      () => this.playBattleScoreLoop(sessionId),
    );
  }
  
  private async playDrumBeat(
    startTime: number,
    duration: number,
    plan: DirectedMusicMovement,
  ): Promise<void> {
    if (!this.audioContext || !this.musicGain) return;
    
    const ctx = this.audioContext;
    const q = 60 / plan.bpm;
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
      kickGain.gain.setValueAtTime(0.17 * accent * plan.percussionLevel, t);
      kickGain.gain.exponentialRampToValueAtTime(0.01, t + 0.16);

      kick.connect(kickGain);
      kickGain.connect(this.musicGain!);
      kick.start(t);
      kick.stop(t + 0.16);
      this.musicSources.push(kick);
    };

    const scheduleSnare = (t: number, accent: number): void => {
      const noise = ctx.createBufferSource();
      noise.buffer = snareBuf;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(2000, t);
      filter.Q.value = 0.9;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.14 * accent * plan.percussionLevel, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.14);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicGain!);
      noise.start(t);
      noise.stop(t + 0.14);
      this.musicSources.push(noise);
    };

    const scheduleHat = (t: number, accent: number): void => {
      const noise = ctx.createBufferSource();
      noise.buffer = hatBuf;

      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(5000, t);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.045 * accent * plan.percussionLevel, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.06);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicGain!);
      noise.start(t);
      noise.stop(t + 0.06);
      this.musicSources.push(noise);
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
      const barIndex = Math.floor(step / 8);

      if (inBar % 2 === 1 && (plan.cadence === 'inspection' || plan.cadence === 'procession')) {
        scheduleHat(t, plan.cadence === 'inspection' ? 0.42 : 0.3);
      }

      if (inBar === 0 || inBar === 4) {
        scheduleKick(t, inBar === 0 ? (barIndex % 4 === 0 ? 1.25 : 1.05) : 0.78);
      }

      if (inBar === 2 || inBar === 6) {
        scheduleSnare(t, inBar === 2 ? 0.82 : 0.74);
      }

      if (plan.variation > 0 && (inBar === 1 || inBar === 5) && barIndex % 2 === 1) {
        scheduleSnare(t, 0.22);
      }

      if (inBar === 7 && (barIndex + 1) % 4 === 0) {
        scheduleSnareRoll(t + e * 0.35);
      }
    }
  }
  
  public stopMusic(): void {
    this.musicPlaying = false;
    this.musicSessionId++;
    if (this.musicLoopTimer !== null) {
      window.clearTimeout(this.musicLoopTimer);
      this.musicLoopTimer = null;
    }
    if (this.musicIntensityTimeout !== null) {
      window.clearTimeout(this.musicIntensityTimeout);
      this.musicIntensityTimeout = null;
    }
    this.musicSources.forEach(source => {
      try { source.stop(); } catch (e) { /* already stopped */ }
    });
    this.musicSources = [];
    
    if (this.musicGain && this.audioContext) {
      const now = this.audioContext.currentTime;
      this.musicGain.gain.cancelScheduledValues(now);
      this.musicGain.gain.setValueAtTime(Math.max(0.0001, this.musicGain.gain.value), now);
      this.musicGain.gain.linearRampToValueAtTime(0.0001, now + 0.35);
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
  
  // Cancels in-progress narration and any scheduled follow-up (e.g. when the intro is skipped).
  public stopSpeech(): void {
    this.speechToken++;
    if (this.speechSynth) {
      this.speechSynth.cancel();
    }
  }

  public async speakQuote(text: string, author: string): Promise<void> {
    if (!this.speechSynth) {
      this.init();
    }
    if (!this.speechSynth) return;

    // Cancel any ongoing speech
    this.speechSynth.cancel();
    const token = ++this.speechToken;
    
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
      if (token !== this.speechToken) return;
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
