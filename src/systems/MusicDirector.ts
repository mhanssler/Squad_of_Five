export type MusicSection = 'menu' | 'maneuver' | 'pressure' | 'finale';
export type MusicCadence = 'inspection' | 'patrol' | 'procession' | 'dirge' | 'advance' | 'siege' | 'assault';
export type MusicTexture = 'muted' | 'strings' | 'open';

export type MusicMotifNote = {
  bar: number;
  beat: number;
  semitones: number;
  durationBeats: number;
  accent: number;
};

export type MusicMovementPlan = {
  id: string;
  bpm: number;
  bars: number;
  rootHz: number;
  leadOctaves: number;
  cadence: MusicCadence;
  texture: MusicTexture;
  progression: readonly number[];
  motif: readonly MusicMotifNote[];
  brassLevel: number;
  stringLevel: number;
  percussionLevel: number;
  airLevel: number;
  alternateShift: number;
};

export type DirectedMusicMovement = MusicMovementPlan & {
  variation: number;
};

const movement = (
  plan: Omit<MusicMovementPlan, 'bars'> & { bars?: number },
): MusicMovementPlan => ({
  bars: 8,
  ...plan,
});

const MUSIC_LIBRARY: Record<MusicSection, readonly MusicMovementPlan[]> = {
  menu: [
    movement({
      id: 'briefing-room',
      bpm: 78,
      rootHz: 73.42,
      leadOctaves: 2,
      cadence: 'inspection',
      texture: 'muted',
      progression: [0, -2, 3, 0],
      motif: [
        { bar: 0, beat: 0.5, semitones: 0, durationBeats: 1.4, accent: 0.9 },
        { bar: 1, beat: 2.0, semitones: 3, durationBeats: 0.8, accent: 0.62 },
        { bar: 2, beat: 0.5, semitones: 5, durationBeats: 1.2, accent: 0.76 },
        { bar: 3, beat: 2.0, semitones: 3, durationBeats: 1.0, accent: 0.64 },
        { bar: 4, beat: 0.5, semitones: 0, durationBeats: 1.8, accent: 0.86 },
        { bar: 6, beat: 1.0, semitones: -2, durationBeats: 1.2, accent: 0.66 },
        { bar: 7, beat: 2.0, semitones: 0, durationBeats: 1.5, accent: 0.9 },
      ],
      brassLevel: 0.026,
      stringLevel: 0.035,
      percussionLevel: 0.72,
      airLevel: 0.012,
      alternateShift: 5,
    }),
    movement({
      id: 'convoy-at-dawn',
      bpm: 84,
      rootHz: 55,
      leadOctaves: 2,
      cadence: 'procession',
      texture: 'strings',
      progression: [0, 3, -2, 5],
      motif: [
        { bar: 0, beat: 1.0, semitones: 0, durationBeats: 1.0, accent: 0.78 },
        { bar: 1, beat: 0.5, semitones: 3, durationBeats: 1.25, accent: 0.72 },
        { bar: 2, beat: 2.0, semitones: 7, durationBeats: 0.9, accent: 0.74 },
        { bar: 3, beat: 2.5, semitones: 5, durationBeats: 0.8, accent: 0.58 },
        { bar: 4, beat: 0.5, semitones: 8, durationBeats: 1.35, accent: 0.82 },
        { bar: 5, beat: 2.0, semitones: 7, durationBeats: 0.9, accent: 0.65 },
        { bar: 7, beat: 1.0, semitones: 3, durationBeats: 1.7, accent: 0.86 },
      ],
      brassLevel: 0.021,
      stringLevel: 0.047,
      percussionLevel: 0.62,
      airLevel: 0.018,
      alternateShift: 3,
    }),
    movement({
      id: 'orders-sealed',
      bpm: 88,
      rootHz: 82.41,
      leadOctaves: 1,
      cadence: 'inspection',
      texture: 'open',
      progression: [0, -2, 0, 3],
      motif: [
        { bar: 0, beat: 0.25, semitones: 0, durationBeats: 0.8, accent: 0.88 },
        { bar: 0, beat: 2.0, semitones: 5, durationBeats: 0.75, accent: 0.65 },
        { bar: 1, beat: 1.0, semitones: 7, durationBeats: 1.2, accent: 0.78 },
        { bar: 3, beat: 0.5, semitones: 3, durationBeats: 1.4, accent: 0.72 },
        { bar: 4, beat: 0.25, semitones: 0, durationBeats: 1.0, accent: 0.82 },
        { bar: 5, beat: 2.0, semitones: 8, durationBeats: 1.0, accent: 0.74 },
        { bar: 7, beat: 0.5, semitones: 7, durationBeats: 1.6, accent: 0.92 },
      ],
      brassLevel: 0.028,
      stringLevel: 0.031,
      percussionLevel: 0.77,
      airLevel: 0.01,
      alternateShift: -2,
    }),
  ],
  maneuver: [
    movement({
      id: 'night-watch',
      bpm: 74,
      rootHz: 73.42,
      leadOctaves: 2,
      cadence: 'patrol',
      texture: 'strings',
      progression: [0, -2, 3, 0],
      motif: [
        { bar: 0, beat: 1.0, semitones: 0, durationBeats: 1.5, accent: 0.78 },
        { bar: 1, beat: 2.5, semitones: 3, durationBeats: 0.9, accent: 0.58 },
        { bar: 3, beat: 0.5, semitones: 5, durationBeats: 1.3, accent: 0.7 },
        { bar: 4, beat: 1.5, semitones: 0, durationBeats: 1.8, accent: 0.74 },
        { bar: 6, beat: 2.0, semitones: -2, durationBeats: 1.0, accent: 0.56 },
        { bar: 7, beat: 1.0, semitones: 0, durationBeats: 1.4, accent: 0.8 },
      ],
      brassLevel: 0.018,
      stringLevel: 0.052,
      percussionLevel: 0.46,
      airLevel: 0.027,
      alternateShift: 5,
    }),
    movement({
      id: 'long-road',
      bpm: 80,
      rootHz: 55,
      leadOctaves: 2,
      cadence: 'procession',
      texture: 'muted',
      progression: [0, 3, -2, 0],
      motif: [
        { bar: 0, beat: 0.5, semitones: 0, durationBeats: 1.1, accent: 0.76 },
        { bar: 1, beat: 1.5, semitones: 3, durationBeats: 1.1, accent: 0.64 },
        { bar: 2, beat: 2.5, semitones: 7, durationBeats: 0.7, accent: 0.56 },
        { bar: 4, beat: 0.5, semitones: 5, durationBeats: 1.5, accent: 0.72 },
        { bar: 5, beat: 2.0, semitones: 3, durationBeats: 1.0, accent: 0.6 },
        { bar: 7, beat: 0.75, semitones: 0, durationBeats: 1.7, accent: 0.82 },
      ],
      brassLevel: 0.023,
      stringLevel: 0.039,
      percussionLevel: 0.56,
      airLevel: 0.021,
      alternateShift: 3,
    }),
    movement({
      id: 'quiet-before',
      bpm: 68,
      rootHz: 82.41,
      leadOctaves: 1,
      cadence: 'dirge',
      texture: 'strings',
      progression: [0, 5, 3, -2],
      motif: [
        { bar: 0, beat: 1.5, semitones: 0, durationBeats: 2.0, accent: 0.72 },
        { bar: 2, beat: 0.5, semitones: 3, durationBeats: 1.7, accent: 0.64 },
        { bar: 3, beat: 2.5, semitones: 5, durationBeats: 0.9, accent: 0.54 },
        { bar: 5, beat: 0.5, semitones: 8, durationBeats: 1.8, accent: 0.7 },
        { bar: 7, beat: 1.0, semitones: 7, durationBeats: 1.6, accent: 0.74 },
      ],
      brassLevel: 0.015,
      stringLevel: 0.059,
      percussionLevel: 0.34,
      airLevel: 0.032,
      alternateShift: -2,
    }),
  ],
  pressure: [
    movement({
      id: 'contested-ground',
      bpm: 88,
      rootHz: 73.42,
      leadOctaves: 2,
      cadence: 'advance',
      texture: 'muted',
      progression: [0, -2, 3, 5],
      motif: [
        { bar: 0, beat: 0.5, semitones: 0, durationBeats: 0.9, accent: 0.86 },
        { bar: 1, beat: 1.0, semitones: 3, durationBeats: 0.8, accent: 0.72 },
        { bar: 2, beat: 0.5, semitones: 7, durationBeats: 1.2, accent: 0.82 },
        { bar: 3, beat: 2.0, semitones: 5, durationBeats: 0.9, accent: 0.68 },
        { bar: 4, beat: 0.5, semitones: 8, durationBeats: 1.3, accent: 0.88 },
        { bar: 6, beat: 1.0, semitones: 7, durationBeats: 1.0, accent: 0.74 },
        { bar: 7, beat: 2.0, semitones: 3, durationBeats: 1.2, accent: 0.84 },
      ],
      brassLevel: 0.029,
      stringLevel: 0.046,
      percussionLevel: 0.78,
      airLevel: 0.024,
      alternateShift: 5,
    }),
    movement({
      id: 'broken-column',
      bpm: 82,
      rootHz: 49,
      leadOctaves: 2,
      cadence: 'siege',
      texture: 'strings',
      progression: [0, 3, 5, -2],
      motif: [
        { bar: 0, beat: 1.0, semitones: 0, durationBeats: 1.4, accent: 0.78 },
        { bar: 1, beat: 2.5, semitones: 5, durationBeats: 0.7, accent: 0.62 },
        { bar: 2, beat: 0.5, semitones: 3, durationBeats: 1.1, accent: 0.7 },
        { bar: 4, beat: 1.0, semitones: 8, durationBeats: 1.4, accent: 0.82 },
        { bar: 5, beat: 2.0, semitones: 7, durationBeats: 0.9, accent: 0.7 },
        { bar: 7, beat: 0.5, semitones: 5, durationBeats: 1.8, accent: 0.86 },
      ],
      brassLevel: 0.024,
      stringLevel: 0.057,
      percussionLevel: 0.69,
      airLevel: 0.03,
      alternateShift: 3,
    }),
    movement({
      id: 'relay-under-fire',
      bpm: 92,
      rootHz: 55,
      leadOctaves: 2,
      cadence: 'advance',
      texture: 'open',
      progression: [0, -2, 0, 5],
      motif: [
        { bar: 0, beat: 0.25, semitones: 0, durationBeats: 0.75, accent: 0.9 },
        { bar: 0, beat: 2.0, semitones: 3, durationBeats: 0.65, accent: 0.68 },
        { bar: 1, beat: 1.0, semitones: 7, durationBeats: 1.0, accent: 0.82 },
        { bar: 3, beat: 0.5, semitones: 5, durationBeats: 1.2, accent: 0.74 },
        { bar: 4, beat: 0.25, semitones: 8, durationBeats: 0.9, accent: 0.9 },
        { bar: 5, beat: 2.0, semitones: 10, durationBeats: 0.8, accent: 0.76 },
        { bar: 7, beat: 0.5, semitones: 7, durationBeats: 1.5, accent: 0.88 },
      ],
      brassLevel: 0.032,
      stringLevel: 0.041,
      percussionLevel: 0.86,
      airLevel: 0.019,
      alternateShift: -2,
    }),
  ],
  finale: [
    movement({
      id: 'last-push',
      bpm: 98,
      rootHz: 73.42,
      leadOctaves: 2,
      cadence: 'assault',
      texture: 'open',
      progression: [0, 3, 5, -2],
      motif: [
        { bar: 0, beat: 0.25, semitones: 0, durationBeats: 0.8, accent: 0.94 },
        { bar: 0, beat: 1.75, semitones: 5, durationBeats: 0.65, accent: 0.76 },
        { bar: 1, beat: 0.5, semitones: 8, durationBeats: 1.0, accent: 0.9 },
        { bar: 2, beat: 2.0, semitones: 7, durationBeats: 0.8, accent: 0.78 },
        { bar: 4, beat: 0.25, semitones: 12, durationBeats: 1.1, accent: 0.98 },
        { bar: 5, beat: 1.5, semitones: 10, durationBeats: 0.7, accent: 0.8 },
        { bar: 6, beat: 0.5, semitones: 8, durationBeats: 1.0, accent: 0.86 },
        { bar: 7, beat: 2.0, semitones: 7, durationBeats: 1.2, accent: 0.92 },
      ],
      brassLevel: 0.038,
      stringLevel: 0.052,
      percussionLevel: 1,
      airLevel: 0.021,
      alternateShift: 5,
    }),
    movement({
      id: 'no-way-back',
      bpm: 94,
      rootHz: 82.41,
      leadOctaves: 1,
      cadence: 'siege',
      texture: 'open',
      progression: [0, -2, 3, 0],
      motif: [
        { bar: 0, beat: 0.5, semitones: 0, durationBeats: 1.0, accent: 0.9 },
        { bar: 1, beat: 1.5, semitones: 7, durationBeats: 0.8, accent: 0.76 },
        { bar: 2, beat: 0.5, semitones: 5, durationBeats: 1.2, accent: 0.82 },
        { bar: 3, beat: 2.0, semitones: 8, durationBeats: 0.8, accent: 0.72 },
        { bar: 4, beat: 0.5, semitones: 12, durationBeats: 1.4, accent: 0.94 },
        { bar: 6, beat: 1.0, semitones: 10, durationBeats: 0.9, accent: 0.78 },
        { bar: 7, beat: 1.5, semitones: 7, durationBeats: 1.4, accent: 0.9 },
      ],
      brassLevel: 0.035,
      stringLevel: 0.06,
      percussionLevel: 0.91,
      airLevel: 0.026,
      alternateShift: -2,
    }),
    movement({
      id: 'final-signal',
      bpm: 102,
      rootHz: 55,
      leadOctaves: 2,
      cadence: 'assault',
      texture: 'muted',
      progression: [0, 5, 3, 7],
      motif: [
        { bar: 0, beat: 0.0, semitones: 0, durationBeats: 0.7, accent: 0.96 },
        { bar: 0, beat: 1.5, semitones: 3, durationBeats: 0.6, accent: 0.74 },
        { bar: 1, beat: 0.5, semitones: 7, durationBeats: 0.9, accent: 0.88 },
        { bar: 2, beat: 2.0, semitones: 10, durationBeats: 0.7, accent: 0.8 },
        { bar: 4, beat: 0.0, semitones: 12, durationBeats: 0.9, accent: 1 },
        { bar: 5, beat: 1.5, semitones: 8, durationBeats: 0.75, accent: 0.84 },
        { bar: 6, beat: 0.5, semitones: 7, durationBeats: 1.0, accent: 0.86 },
        { bar: 7, beat: 2.0, semitones: 12, durationBeats: 1.0, accent: 0.98 },
      ],
      brassLevel: 0.04,
      stringLevel: 0.047,
      percussionLevel: 1,
      airLevel: 0.018,
      alternateShift: 3,
    }),
  ],
};

export function getMusicMovement(section: MusicSection, loopIndex: number): DirectedMusicMovement {
  const plans = MUSIC_LIBRARY[section];
  const safeIndex = Math.max(0, Math.floor(loopIndex));
  const plan = plans[safeIndex % plans.length];
  return {
    ...plan,
    variation: Math.floor(safeIndex / plans.length) % 3,
  };
}

export function getMusicMovementCount(section: MusicSection): number {
  return MUSIC_LIBRARY[section].length;
}

export function getBattleBaselineIntensity(section: Exclude<MusicSection, 'menu'>): number {
  if (section === 'finale') return 0.58;
  if (section === 'pressure') return 0.46;
  return 0.32;
}

export function transposeFrequency(rootHz: number, semitones: number, octaves = 0): number {
  return rootHz * Math.pow(2, octaves + semitones / 12);
}
