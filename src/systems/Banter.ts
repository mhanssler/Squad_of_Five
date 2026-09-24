// Soldier chatter that reacts to what just happened. Pure data + selection so it can be tested.

// Kill lines, near misses and supply pickups use the soldier's own quips (Soldier.sayQuip);
// these cover the situations those don't.
export const BANTER = {
  multiKill: ['Two for one!', 'Bulk discount!', 'Did everyone see that?!', 'Efficiency award, please!', 'Bowling, but louder!'],
  bigHit: ['That one landed!', 'Feel that?', 'Math works!', 'Special delivery!', "That'll leave paperwork!"],
  miss: ['Warning shot!', 'Meant to do that.', 'The wind did it!', 'Calibrating...', 'Next one counts.', 'Scared them, though.'],
  selfHit: ['Ow! My own shot!', 'Did anyone see that?', 'Totally intended.', 'Friendly fire, very friendly.'],
  teamHit: ['Sorry! Sorry!', 'That was the wind!', 'My bad, buddy!', 'Aiming is hard!'],
  teamKill: ['I... uh...', 'Nobody saw that.', 'That goes in no report.'],
  enemyTaunt: ['Ha! Missed me!', 'You call that aiming?', 'Nice try, rookie!', 'My grandma shoots better!', 'Over here!'],
  hitReaction: ['Check your fire!', 'Whose side are you on?!', 'I felt that, pal!', 'HEY!'],
  allyDown: ['That was {name}!', 'Keep moving for {name}!', 'We lost {name}!', 'I liked {name}!', 'For {name}!'],
  enemyDown: ['One less to worry about.', "That's what you get!", 'Who is next?'],
  promotion: ['Promoted!', 'Call me sir!', 'Earned it!', 'Pay raise, please!'],
} as const;

export type BanterCategory = keyof typeof BANTER;

export function pickLine(category: BanterCategory, vars: Record<string, string> = {}, rand: () => number = Math.random): string {
  const lines = BANTER[category];
  const line: string = lines[Math.floor(rand() * lines.length)];
  return line.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? key);
}

/** What happened during one shot/action, from the shooter's point of view. */
export interface ShotStats {
  enemyDamage: number;
  allyDamage: number;
  selfDamage: number;
  enemyKills: number;
  allyKills: number;
}

export function emptyShotStats(): ShotStats {
  return { enemyDamage: 0, allyDamage: 0, selfDamage: 0, enemyKills: 0, allyKills: 0 };
}

export interface ShotBanter {
  /** Line for the shooter (if still alive). */
  shooter: BanterCategory | null;
  /** Line for a nearby enemy of the shooter. */
  enemy: BanterCategory | null;
  /** Line for a teammate who got hit. */
  ally: BanterCategory | null;
}

/** Choose who says what after a shot resolves. Per-kill lines are spoken at kill time, not here. */
export function pickShotBanter(stats: ShotStats): ShotBanter {
  if (stats.allyKills > 0) return { shooter: 'teamKill', enemy: 'enemyDown', ally: null };
  if (stats.enemyKills >= 2) return { shooter: 'multiKill', enemy: null, ally: null };
  if (stats.enemyKills === 1) return { shooter: null, enemy: null, ally: null };
  if (stats.allyDamage > 0) return { shooter: 'teamHit', enemy: null, ally: 'hitReaction' };
  if (stats.selfDamage > 0 && stats.enemyDamage === 0) return { shooter: 'selfHit', enemy: 'enemyTaunt', ally: null };
  if (stats.enemyDamage >= 45) return { shooter: 'bigHit', enemy: null, ally: null };
  if (stats.enemyDamage === 0) return { shooter: 'miss', enemy: 'enemyTaunt', ally: null };
  return { shooter: null, enemy: null, ally: null };
}
