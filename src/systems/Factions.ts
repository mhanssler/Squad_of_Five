export type Alliance = 'allies' | 'axis';

export type FactionId =
  | 'united-states'
  | 'british-commonwealth'
  | 'soviet-union'
  | 'free-france'
  | 'germany'
  | 'japan'
  | 'italy';

export type HeadgearStyle =
  | 'm1'
  | 'brodie'
  | 'pilotka'
  | 'adrian'
  | 'stahlhelm'
  | 'type90'
  | 'm33';

export interface SkinPalette {
  base: number;
  shadow: number;
  highlight: number;
}

export interface FactionPalette {
  uniform: number;
  uniformLight: number;
  uniformDark: number;
  helmet: number;
  helmetLight: number;
  helmetDark: number;
  webbing: number;
  webbingDark: number;
  pouch: number;
  boots: number;
  bootsLight: number;
  accent: number;
}

export interface FactionDefinition {
  id: FactionId;
  name: string;
  shortName: string;
  tag: string;
  alliance: Alliance;
  headgear: HeadgearStyle;
  palette: FactionPalette;
  skinPalettes: readonly SkinPalette[];
  soldierNames: readonly [string, string, string, string, string];
  flavor: string;
}

export interface FactionMatchup {
  red: FactionId;
  blue: FactionId;
}

export const FACTIONS: readonly FactionDefinition[] = [
  {
    id: 'united-states',
    name: 'United States Army',
    shortName: 'U.S. Army',
    tag: 'USA',
    alliance: 'allies',
    headgear: 'm1',
    palette: {
      uniform: 0x52613a,
      uniformLight: 0x748356,
      uniformDark: 0x2f3b24,
      helmet: 0x465437,
      helmetLight: 0x687a4c,
      helmetDark: 0x273020,
      webbing: 0xb09a6a,
      webbingDark: 0x766340,
      pouch: 0x9b895f,
      boots: 0x3a2419,
      bootsLight: 0x58392a,
      accent: 0xe9e6d3,
    },
    skinPalettes: [
      { base: 0xe0b08a, shadow: 0xb97f60, highlight: 0xf0c5a2 },
      { base: 0x9b6549, shadow: 0x704431, highlight: 0xbf8767 },
      { base: 0xc68d68, shadow: 0x945f45, highlight: 0xe4ae88 },
    ],
    soldierNames: ['Walker', 'Kelly', 'Jackson', 'Reyes', 'Murphy'],
    flavor: 'Mobile firepower and improvised field kit',
  },
  {
    id: 'british-commonwealth',
    name: 'British Commonwealth',
    shortName: 'Commonwealth',
    tag: 'UK',
    alliance: 'allies',
    headgear: 'brodie',
    palette: {
      uniform: 0x736c46,
      uniformLight: 0x958c5f,
      uniformDark: 0x46422c,
      helmet: 0x55583a,
      helmetLight: 0x747952,
      helmetDark: 0x303224,
      webbing: 0xc1b78b,
      webbingDark: 0x827958,
      pouch: 0xaaa178,
      boots: 0x34251c,
      bootsLight: 0x554033,
      accent: 0xc94b43,
    },
    skinPalettes: [
      { base: 0xe4b894, shadow: 0xbc8668, highlight: 0xf2cbaa },
      { base: 0x8c5a40, shadow: 0x603a2a, highlight: 0xb47b5b },
      { base: 0xb97854, shadow: 0x855036, highlight: 0xd99c78 },
    ],
    soldierNames: ['Harris', 'Clarke', 'Bennett', 'Davies', 'Singh'],
    flavor: 'Disciplined sections with hard-wearing web equipment',
  },
  {
    id: 'soviet-union',
    name: 'Soviet Red Army',
    shortName: 'Red Army',
    tag: 'USSR',
    alliance: 'allies',
    headgear: 'pilotka',
    palette: {
      uniform: 0x777044,
      uniformLight: 0x99915e,
      uniformDark: 0x48432a,
      helmet: 0x4f5833,
      helmetLight: 0x71804a,
      helmetDark: 0x2c321e,
      webbing: 0x6b492e,
      webbingDark: 0x422b1d,
      pouch: 0x75553a,
      boots: 0x241b17,
      bootsLight: 0x45342b,
      accent: 0xd33c32,
    },
    skinPalettes: [
      { base: 0xe1b18d, shadow: 0xb67d60, highlight: 0xf0c6a4 },
      { base: 0xc88f6b, shadow: 0x966044, highlight: 0xe3ad88 },
    ],
    soldierNames: ['Ivanov', 'Petrova', 'Sokolov', 'Morozov', 'Kozlov'],
    flavor: 'Practical field gear with bold unit markings',
  },
  {
    id: 'free-france',
    name: 'Free French Forces',
    shortName: 'Free French',
    tag: 'FR',
    alliance: 'allies',
    headgear: 'adrian',
    palette: {
      uniform: 0x56636a,
      uniformLight: 0x788990,
      uniformDark: 0x333e43,
      helmet: 0x465f70,
      helmetLight: 0x688195,
      helmetDark: 0x293b49,
      webbing: 0x866649,
      webbingDark: 0x563e2c,
      pouch: 0x957454,
      boots: 0x39261e,
      bootsLight: 0x5a3e32,
      accent: 0x4e8ed0,
    },
    skinPalettes: [
      { base: 0xdfad87, shadow: 0xb8795b, highlight: 0xefc29e },
      { base: 0xa76c4e, shadow: 0x754631, highlight: 0xca8d6a },
    ],
    soldierNames: ['Moreau', 'Laurent', 'Dubois', 'Lefevre', 'Roux'],
    flavor: 'Mixed campaign kit and unmistakable Adrian helmets',
  },
  {
    id: 'germany',
    name: 'German Wehrmacht',
    shortName: 'Germany',
    tag: 'GER',
    alliance: 'axis',
    headgear: 'stahlhelm',
    palette: {
      uniform: 0x566054,
      uniformLight: 0x778277,
      uniformDark: 0x303a32,
      helmet: 0x3f4b45,
      helmetLight: 0x5e6a63,
      helmetDark: 0x242c28,
      webbing: 0x3a3029,
      webbingDark: 0x201b18,
      pouch: 0x51443a,
      boots: 0x211b18,
      bootsLight: 0x41352f,
      accent: 0xd4d5ce,
    },
    skinPalettes: [
      { base: 0xdfad88, shadow: 0xb7795b, highlight: 0xefc29f },
      { base: 0xc98f6b, shadow: 0x985f44, highlight: 0xe3ac88 },
    ],
    soldierNames: ['Weber', 'Fischer', 'Bauer', 'Klein', 'Wagner'],
    flavor: 'Field-grey layers and angular steel helmet profiles',
  },
  {
    id: 'japan',
    name: 'Imperial Japanese Army',
    shortName: 'Imperial Japan',
    tag: 'JPN',
    alliance: 'axis',
    headgear: 'type90',
    palette: {
      uniform: 0x887044,
      uniformLight: 0xaa8e5d,
      uniformDark: 0x534329,
      helmet: 0x65583b,
      helmetLight: 0x897751,
      helmetDark: 0x3a3224,
      webbing: 0x59422c,
      webbingDark: 0x34271c,
      pouch: 0x6f5438,
      boots: 0x30231b,
      bootsLight: 0x513b2f,
      accent: 0xc83b32,
    },
    skinPalettes: [
      { base: 0xd5a071, shadow: 0xa66f4b, highlight: 0xe9b98a },
      { base: 0xbd835a, shadow: 0x8c563b, highlight: 0xdba078 },
    ],
    soldierNames: ['Sato', 'Tanaka', 'Nakamura', 'Ito', 'Kobayashi'],
    flavor: 'Khaki field dress with star helmets and neck curtains',
  },
  {
    id: 'italy',
    name: 'Royal Italian Army',
    shortName: 'Italy',
    tag: 'ITA',
    alliance: 'axis',
    headgear: 'm33',
    palette: {
      uniform: 0x68725f,
      uniformLight: 0x899480,
      uniformDark: 0x3c4639,
      helmet: 0x515d50,
      helmetLight: 0x748070,
      helmetDark: 0x2e372e,
      webbing: 0x694733,
      webbingDark: 0x402a20,
      pouch: 0x79553e,
      boots: 0x34241d,
      bootsLight: 0x553b30,
      accent: 0xb9d6c1,
    },
    skinPalettes: [
      { base: 0xdca47c, shadow: 0xae704f, highlight: 0xefbd98 },
      { base: 0xc28760, shadow: 0x92573d, highlight: 0xdda17d },
    ],
    soldierNames: ['Rossi', 'Bianchi', 'Romano', 'Esposito', 'Conti'],
    flavor: 'Grey-green tailoring and distinctive feathered helmets',
  },
] as const;

export const ALLIED_FACTIONS = FACTIONS.filter(faction => faction.alliance === 'allies');
export const AXIS_FACTIONS = FACTIONS.filter(faction => faction.alliance === 'axis');

const FACTION_BY_ID = new Map<FactionId, FactionDefinition>(
  FACTIONS.map(faction => [faction.id, faction]),
);

const WEAPON_TEXTURE_ALIASES: Readonly<Record<string, string>> = {
  carbine: 'rifle',
  slug: 'shotgun',
  demo: 'grenade',
};

export const FACTION_BASE_SPRITES = [
  'rifle',
  'grenade',
  'rocket',
  'shotgun',
  'sniper',
  'mortar',
  'flamer',
  'pistol',
  'smg',
  'minigun',
] as const;

export function getFaction(id: FactionId): FactionDefinition {
  const faction = FACTION_BY_ID.get(id);
  if (!faction) {
    throw new Error(`Unknown faction: ${id}`);
  }
  return faction;
}

export function getFactionSpriteTextureKey(factionId: FactionId, weaponId: string): string {
  const baseWeaponId = WEAPON_TEXTURE_ALIASES[weaponId] ?? weaponId;
  return `soldier-${factionId}-${baseWeaponId}`;
}

function pickFrom<T>(items: readonly T[], random: () => number): T {
  const roll = Math.min(0.999999, Math.max(0, random()));
  return items[Math.floor(roll * items.length)];
}

export function createFactionMatchup(random: () => number = Math.random): FactionMatchup {
  const allied = pickFrom(ALLIED_FACTIONS, random);
  const axis = pickFrom(AXIS_FACTIONS, random);
  const alliesOnRed = random() < 0.5;

  return alliesOnRed
    ? { red: allied.id, blue: axis.id }
    : { red: axis.id, blue: allied.id };
}

export function isAxisVsAllies(matchup: FactionMatchup): boolean {
  return getFaction(matchup.red).alliance !== getFaction(matchup.blue).alliance;
}
