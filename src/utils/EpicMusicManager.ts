type PlaylistMode = 'menu' | 'battle';
type PercussionStyle = 'march' | 'war' | 'sparse';

type TrackDefinition = {
  id: string;
  title: string;
  bpm: number;
  bars: number;
  progression: number[][];
  bass: number[];
  melody: Array<number | null>;
  intensity: number;
  percussion: PercussionStyle;
};

type AudioContextWithWebkit = typeof window & {
  webkitAudioContext?: typeof AudioContext;
};

const IRON_DAWN: TrackDefinition = {
  id: 'iron-dawn',
  title: 'Iron Dawn',
  bpm: 94,
  bars: 12,
  progression: [
    [50, 53, 57], // D minor
    [46, 50, 53], // B-flat major
    [53, 57, 60], // F major
    [48, 52, 55], // C major
  ],
  bass: [38, 34, 41, 36],
  melody: [
    62, null, 65, 64, 62, null, 57, null,
    58, null, 62, 60, 58, null, 53, null,
    65, null, 69, 67, 65, 64, 62, null,
    60, null, 64, 62, 60, 57, 55, null,
  ],
  intensity: 0.82,
  percussion: 'march',
};

const ASHES_AND_VALOR: TrackDefinition = {
  id: 'ashes-and-valor',
  title: 'Ashes and Valor',
  bpm: 74,
  bars: 12,
  progression: [
    [45, 48, 52], // A minor
    [41, 45, 48], // F major
    [48, 52, 55], // C major
    [43, 47, 50], // G major
  ],
  bass: [33, 29, 36, 31],
  melody: [
    57, null, null, 60, 64, null, 62, null,
    60, null, null, 57, 53, null, 57, null,
    60, null, 64, null, 67, null, 64, null,
    62, null, 59, null, 55, null, 52, null,
  ],
  intensity: 0.58,
  percussion: 'sparse',
};

const LAST_STAND: TrackDefinition = {
  id: 'last-stand',
  title: 'The Last Stand',
  bpm: 112,
  bars: 16,
  progression: [
    [40, 43, 47], // E minor
    [36, 40, 43], // C major
    [43, 47, 50], // G major
    [38, 42, 45], // D major
  ],
  bass: [28, 24, 31, 26],
  melody: [
    64, 67, 71, null, 69, 67, 64, null,
    67, 71, 72, null, 71, 67, 64, null,
    71, 74, 79, null, 76, 74, 71, null,
    69, 71, 74, 72, 71, 69, 67, null,
  ],
  intensity: 1,
  percussion: 'war',
};

const STEEL_HORIZON: TrackDefinition = {
  id: 'steel-horizon',
  title: 'Steel Horizon',
  bpm: 88,
  bars: 12,
  progression: [
    [43, 46, 50], // G minor
    [39, 43, 46], // E-flat major
    [46, 50, 53], // B-flat major
    [41, 45, 48], // F major
  ],
  bass: [31, 27, 34, 29],
  melody: [
    67, null, 70, 69, 67, null, 62, null,
    63, null, 67, 65, 63, null, 58, null,
    70, null, 74, 72, 70, 67, 65, null,
    69, null, 72, 70, 69, 65, 60, null,
  ],
  intensity: 0.76,
  percussion: 'march',
};

const MENU_PLAYLIST = [IRON_DAWN, ASHES_AND_VALOR];
const BATTLE_PLAYLIST = [LAST_STAND, STEEL_HORIZON, ASHES_AND_VALOR, IRON_DAWN];

class EpicMusicManagerClass {
  private context: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private dryInput: GainNode | null = null;
  private reverbInput: GainNode | null = null;
  private activeSources = new Set<AudioScheduledSourceNode>();
  private transitionTimer: number | null = null;
  private generation = 0;
  private playing = false;
  private mode: PlaylistMode | null = null;
  private lastTrackId: string | null = null;
  private volume = 0.5;

  public async startMenuPlaylist(): Promise<void> {
    await this.startPlaylist('menu');
  }

  public async startBattlePlaylist(): Promise<void> {
    await this.startPlaylist('battle');
  }

  public setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (!this.context || !this.musicGain) return;

    const now = this.context.currentTime;
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setTargetAtTime(this.targetGain(), now, 0.08);
  }

  public stop(): void {
    this.generation++;
    this.playing = false;
    this.mode = null;
    this.lastTrackId = null;

    if (this.transitionTimer !== null) {
      window.clearTimeout(this.transitionTimer);
      this.transitionTimer = null;
    }

    if (!this.context) return;
    const now = this.context.currentTime;

    if (this.musicGain) {
      this.musicGain.gain.cancelScheduledValues(now);
      this.musicGain.gain.setValueAtTime(Math.max(0.0001, this.musicGain.gain.value), now);
      this.musicGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
    }

    for (const source of this.activeSources) {
      try {
        source.stop(now + 0.85);
      } catch {
        // A source may already have completed naturally.
      }
    }
    this.activeSources.clear();
  }

  private async startPlaylist(mode: PlaylistMode): Promise<void> {
    if (this.playing && this.mode === mode) return;
    if (!await this.ensureContext() || !this.context || !this.musicGain) return;

    this.stop();
    this.playing = true;
    this.mode = mode;
    const token = ++this.generation;
    const now = this.context.currentTime;

    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setValueAtTime(0.0001, now);
    this.musicGain.gain.exponentialRampToValueAtTime(this.targetGain(), now + 1.2);

    this.scheduleNextTrack(token, true);
  }

  private targetGain(): number {
    return Math.max(0.0001, this.volume * 0.34);
  }

  private async ensureContext(): Promise<boolean> {
    if (!this.context) {
      const audioWindow = window as AudioContextWithWebkit;
      const AudioContextConstructor = window.AudioContext ?? audioWindow.webkitAudioContext;
      if (!AudioContextConstructor) return false;

      this.context = new AudioContextConstructor();
      this.buildAudioGraph(this.context);
    }

    if (this.context.state === 'suspended') {
      try {
        await this.context.resume();
      } catch {
        return false;
      }
    }

    return true;
  }

  private buildAudioGraph(context: AudioContext): void {
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 16;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.02;
    compressor.release.value = 0.35;
    compressor.connect(context.destination);

    this.musicGain = context.createGain();
    this.musicGain.gain.value = 0.0001;
    this.musicGain.connect(compressor);

    this.dryInput = context.createGain();
    this.dryInput.gain.value = 0.82;
    this.dryInput.connect(this.musicGain);

    const convolver = context.createConvolver();
    convolver.buffer = this.createImpulseResponse(context, 2.8, 2.4);

    this.reverbInput = context.createGain();
    this.reverbInput.gain.value = 0.28;
    this.reverbInput.connect(convolver);
    convolver.connect(this.musicGain);
  }

  private createImpulseResponse(context: AudioContext, seconds: number, decay: number): AudioBuffer {
    const length = Math.floor(context.sampleRate * seconds);
    const buffer = context.createBuffer(2, length, context.sampleRate);

    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      for (let sample = 0; sample < length; sample++) {
        const envelope = Math.pow(1 - sample / length, decay);
        data[sample] = (Math.random() * 2 - 1) * envelope;
      }
    }

    return buffer;
  }

  private scheduleNextTrack(token: number, firstTrack: boolean): void {
    if (!this.playing || token !== this.generation || !this.context || !this.mode) return;

    const playlist = this.mode === 'menu' ? MENU_PLAYLIST : BATTLE_PLAYLIST;
    const track = this.chooseTrack(playlist, firstTrack);
    const startTime = this.context.currentTime + 0.08;
    const duration = this.scheduleTrack(track, startTime);

    this.lastTrackId = track.id;
    console.info(`[music] Now playing: ${track.title}`);

    const transitionLeadSeconds = 1.6;
    this.transitionTimer = window.setTimeout(() => {
      this.scheduleNextTrack(token, false);
    }, Math.max(1000, (duration - transitionLeadSeconds) * 1000));
  }

  private chooseTrack(playlist: TrackDefinition[], firstTrack: boolean): TrackDefinition {
    if (firstTrack) return playlist[0];

    const choices = playlist.filter(track => track.id !== this.lastTrackId);
    const pool = choices.length > 0 ? choices : playlist;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  private scheduleTrack(track: TrackDefinition, startTime: number): number {
    if (!this.context || !this.dryInput || !this.reverbInput) return 0;

    const context = this.context;
    const beat = 60 / track.bpm;
    const barDuration = beat * 4;
    const duration = barDuration * track.bars;

    const trackBus = context.createGain();
    trackBus.gain.setValueAtTime(0.0001, startTime);
    trackBus.gain.exponentialRampToValueAtTime(1, startTime + 1.2);
    trackBus.gain.setValueAtTime(1, startTime + Math.max(1.3, duration - 2.1));
    trackBus.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    trackBus.connect(this.dryInput);
    trackBus.connect(this.reverbInput);

    for (let bar = 0; bar < track.bars; bar++) {
      const chordIndex = bar % track.progression.length;
      const chord = track.progression[chordIndex];
      const bass = track.bass[chordIndex];
      const barStart = startTime + bar * barDuration;

      this.scheduleStringChord(chord, barStart, barDuration * 0.98, track.intensity, trackBus);
      this.scheduleBass(bass, barStart, barDuration * 0.96, track.intensity, trackBus);
      this.scheduleOstinato(chord, barStart, beat, track.intensity, trackBus, bar);
      this.scheduleMelody(track, bar, barStart, beat, trackBus);
      this.schedulePercussion(track.percussion, barStart, beat, track.intensity, trackBus, bar);
    }

    this.scheduleCymbalSwell(startTime + duration - beat * 2, beat * 1.8, track.intensity, trackBus);
    return duration;
  }

  private scheduleStringChord(
    chord: number[],
    start: number,
    duration: number,
    intensity: number,
    destination: AudioNode,
  ): void {
    if (!this.context) return;

    for (const note of chord) {
      for (const detune of [-7, 7]) {
        const oscillator = this.context.createOscillator();
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(this.midiToFrequency(note), start);
        oscillator.detune.setValueAtTime(detune, start);

        const filter = this.context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(820 + intensity * 520, start);
        filter.Q.value = 0.7;

        const gain = this.context.createGain();
        const level = 0.012 + intensity * 0.008;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(level, start + 0.24);
        gain.gain.setValueAtTime(level * 0.8, start + Math.max(0.3, duration - 0.3));
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

        oscillator.connect(filter);
        filter.connect(gain);
        gain.connect(destination);
        this.startSource(oscillator, start, start + duration + 0.02);
      }
    }
  }

  private scheduleBass(
    note: number,
    start: number,
    duration: number,
    intensity: number,
    destination: AudioNode,
  ): void {
    if (!this.context) return;

    const fundamental = this.context.createOscillator();
    fundamental.type = 'triangle';
    fundamental.frequency.setValueAtTime(this.midiToFrequency(note), start);

    const sub = this.context.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(this.midiToFrequency(note - 12), start);

    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 260;

    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.055 + intensity * 0.025, start + 0.08);
    gain.gain.setValueAtTime(0.045, start + Math.max(0.1, duration - 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    fundamental.connect(filter);
    sub.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    this.startSource(fundamental, start, start + duration + 0.02);
    this.startSource(sub, start, start + duration + 0.02);
  }

  private scheduleOstinato(
    chord: number[],
    barStart: number,
    beat: number,
    intensity: number,
    destination: AudioNode,
    bar: number,
  ): void {
    if (!this.context) return;

    const pattern = [0, 1, 2, 1, 0, 1, 2, 1];
    for (let step = 0; step < pattern.length; step++) {
      if (intensity < 0.65 && step % 2 === 1) continue;

      const start = barStart + step * beat * 0.5;
      const note = chord[pattern[(step + bar) % pattern.length]] + 12;
      const oscillator = this.context.createOscillator();
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(this.midiToFrequency(note), start);

      const filter = this.context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1500;

      const gain = this.context.createGain();
      const level = 0.012 + intensity * 0.014;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(level, start + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + beat * 0.42);

      oscillator.connect(filter);
      filter.connect(gain);
      gain.connect(destination);
      this.startSource(oscillator, start, start + beat * 0.45);
    }
  }

  private scheduleMelody(
    track: TrackDefinition,
    bar: number,
    barStart: number,
    beat: number,
    destination: AudioNode,
  ): void {
    if (!this.context) return;

    for (let step = 0; step < 8; step++) {
      const melodyIndex = (bar * 8 + step) % track.melody.length;
      const note = track.melody[melodyIndex];
      if (note === null) continue;

      const start = barStart + step * beat * 0.5;
      const duration = beat * (step % 4 === 3 ? 0.85 : 0.43);

      const brass = this.context.createOscillator();
      brass.type = 'sawtooth';
      brass.frequency.setValueAtTime(this.midiToFrequency(note), start);

      const body = this.context.createOscillator();
      body.type = 'triangle';
      body.frequency.setValueAtTime(this.midiToFrequency(note), start);
      body.detune.value = -5;

      const filter = this.context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1250 + track.intensity * 850, start);
      filter.Q.value = 1.3;

      const gain = this.context.createGain();
      const level = 0.022 + track.intensity * 0.022;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(level, start + 0.025);
      gain.gain.setValueAtTime(level * 0.75, start + Math.max(0.03, duration - 0.06));
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      brass.connect(filter);
      body.connect(filter);
      filter.connect(gain);
      gain.connect(destination);
      this.startSource(brass, start, start + duration + 0.02);
      this.startSource(body, start, start + duration + 0.02);
    }
  }

  private schedulePercussion(
    style: PercussionStyle,
    barStart: number,
    beat: number,
    intensity: number,
    destination: AudioNode,
    bar: number,
  ): void {
    if (style === 'sparse') {
      this.scheduleTimpani(barStart, 1 + intensity * 0.2, destination);
      this.scheduleTimpani(barStart + beat * 2.5, 0.65, destination);
      if (bar % 4 === 3) this.scheduleCymbalSwell(barStart + beat * 3, beat, 0.55, destination);
      return;
    }

    this.scheduleTimpani(barStart, 1.05 + intensity * 0.25, destination);
    this.scheduleTimpani(barStart + beat * 2, 0.8 + intensity * 0.2, destination);
    this.scheduleSnare(barStart + beat, 0.7 + intensity * 0.25, destination);
    this.scheduleSnare(barStart + beat * 3, 0.82 + intensity * 0.28, destination);

    if (style === 'war') {
      this.scheduleTimpani(barStart + beat * 1.5, 0.55, destination);
      this.scheduleTimpani(barStart + beat * 3.5, 0.65, destination);
      for (let step = 0; step < 8; step++) {
        this.scheduleHat(barStart + step * beat * 0.5, step % 2 === 0 ? 0.32 : 0.5, destination);
      }
      if (bar % 4 === 3) this.scheduleCymbalSwell(barStart + beat * 3, beat, 0.9, destination);
    }
  }

  private scheduleTimpani(start: number, accent: number, destination: AudioNode): void {
    if (!this.context) return;

    const oscillator = this.context.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(105, start);
    oscillator.frequency.exponentialRampToValueAtTime(48, start + 0.28);

    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.11 * accent, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.42);

    oscillator.connect(gain);
    gain.connect(destination);
    this.startSource(oscillator, start, start + 0.45);
  }

  private scheduleSnare(start: number, accent: number, destination: AudioNode): void {
    if (!this.context) return;

    const source = this.context.createBufferSource();
    source.buffer = this.createNoiseBuffer(0.16, 7);

    const filter = this.context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1900;
    filter.Q.value = 0.8;

    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.045 * accent, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.15);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    this.startSource(source, start, start + 0.17);
  }

  private scheduleHat(start: number, accent: number, destination: AudioNode): void {
    if (!this.context) return;

    const source = this.context.createBufferSource();
    source.buffer = this.createNoiseBuffer(0.055, 11);

    const filter = this.context.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 5200;

    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.018 * accent, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.05);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    this.startSource(source, start, start + 0.06);
  }

  private scheduleCymbalSwell(
    start: number,
    duration: number,
    accent: number,
    destination: AudioNode,
  ): void {
    if (!this.context) return;

    const source = this.context.createBufferSource();
    source.buffer = this.createNoiseBuffer(duration, 1.2);

    const filter = this.context.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 2400;

    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.035 * accent, start + duration * 0.82);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    this.startSource(source, start, start + duration + 0.02);
  }

  private createNoiseBuffer(seconds: number, decay: number): AudioBuffer {
    if (!this.context) throw new Error('Audio context is not initialized');

    const length = Math.max(1, Math.floor(this.context.sampleRate * seconds));
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);

    for (let sample = 0; sample < length; sample++) {
      const envelope = Math.pow(1 - sample / length, decay);
      data[sample] = (Math.random() * 2 - 1) * envelope;
    }

    return buffer;
  }

  private startSource(source: AudioScheduledSourceNode, start: number, stop: number): void {
    this.activeSources.add(source);
    source.addEventListener('ended', () => this.activeSources.delete(source), { once: true });
    source.start(start);
    source.stop(stop);
  }

  private midiToFrequency(note: number): number {
    return 440 * Math.pow(2, (note - 69) / 12);
  }
}

export const EpicMusicManager = new EpicMusicManagerClass();

type CompatibleSoundManager = {
  startMilitaryMusic(): Promise<void>;
  startCelloMusic(): Promise<void>;
  stopMusic(): void;
  setVolume(volume: number): void;
};

/**
 * Keeps the existing scene API intact while replacing only the old music
 * implementation. Weapon effects and speech remain handled by SoundManager.
 */
export function installEpicMusic(soundManager: CompatibleSoundManager): void {
  const originalSetVolume = soundManager.setVolume.bind(soundManager);

  soundManager.startMilitaryMusic = () => EpicMusicManager.startMenuPlaylist();
  soundManager.startCelloMusic = () => EpicMusicManager.startBattlePlaylist();
  soundManager.stopMusic = () => EpicMusicManager.stop();
  soundManager.setVolume = (volume: number) => {
    originalSetVolume(volume);
    EpicMusicManager.setVolume(volume);
  };
}
