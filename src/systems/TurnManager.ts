import type { Soldier } from '../entities/Soldier';

export enum Team {
  RED = 'red',
  BLUE = 'blue',
}

/**
 * Minimal contract required by the turn system.
 *
 * Keeping the turn manager dependent on this interface instead of Phaser-backed
 * Soldier objects makes the core game rules deterministic and easy to test.
 */
export interface TurnParticipant {
  team: Team;
  name: string;
  isAlive(): boolean;
}

export interface TurnInfo {
  currentTeam: Team;
  currentSoldierName: string;
  turnNumber: number;
  redTeamAlive: number;
  blueTeamAlive: number;
  roundNumber: number;
  redActedThisRound: number;
  blueActedThisRound: number;
}

export interface GameOverState {
  isOver: boolean;
  winner: Team | null;
}

export class TurnManager<TSoldier extends TurnParticipant = Soldier> {
  private soldiers: TSoldier[];
  private currentTeam: Team = Team.RED;
  private turnNumber: number = 1;
  private roundNumber: number = 1;
  private currentSoldier: TSoldier | null = null;

  // Track which soldiers have acted this round.
  private actedThisRound: Set<TSoldier> = new Set();

  constructor(soldiers: TSoldier[]) {
    this.soldiers = soldiers;
  }

  public setSoldiers(soldiers: TSoldier[]): void {
    this.soldiers = soldiers;

    // Avoid retaining stale object references when a game is rebuilt in place.
    for (const soldier of this.actedThisRound) {
      if (!soldiers.includes(soldier)) {
        this.actedThisRound.delete(soldier);
      }
    }

    if (this.currentSoldier && !soldiers.includes(this.currentSoldier)) {
      this.currentSoldier = null;
    }
  }

  public getCurrentTeam(): Team {
    return this.currentTeam;
  }

  public setCurrentSoldier(soldier: TSoldier): void {
    this.currentSoldier = soldier;
  }

  public getCurrentSoldier(): TSoldier | null {
    return this.currentSoldier;
  }

  // Get soldiers that can still act this round (alive and not already used).
  public getAvailableSoldiers(team: Team): TSoldier[] {
    return this.soldiers.filter(
      soldier =>
        soldier.team === team &&
        soldier.isAlive() &&
        !this.actedThisRound.has(soldier),
    );
  }

  public hasActedThisRound(soldier: TSoldier): boolean {
    return this.actedThisRound.has(soldier);
  }

  public markSoldierActed(): void {
    if (this.currentSoldier) {
      this.actedThisRound.add(this.currentSoldier);
    }
  }

  public nextTurn(): void {
    this.markSoldierActed();
    this.currentSoldier = null;
    this.turnNumber++;

    // Prefer alternating teams. If that team is exhausted, let the other team
    // finish its remaining soldiers before beginning a new round.
    this.currentTeam = this.currentTeam === Team.RED ? Team.BLUE : Team.RED;
    let availableSoldiers = this.getAvailableSoldiers(this.currentTeam);

    if (availableSoldiers.length === 0) {
      this.currentTeam = this.currentTeam === Team.RED ? Team.BLUE : Team.RED;
      availableSoldiers = this.getAvailableSoldiers(this.currentTeam);

      if (availableSoldiers.length === 0) {
        this.startNewRound();
      }
    }
  }

  private startNewRound(): void {
    this.roundNumber++;
    this.actedThisRound.clear();

    // Red normally opens a round; blue starts only if red has no survivors.
    this.currentTeam = Team.RED;
    const redAlive = this.getTeamSoldiers(Team.RED).filter(soldier => soldier.isAlive());
    if (redAlive.length === 0) {
      this.currentTeam = Team.BLUE;
    }
  }

  public getTurnInfo(): TurnInfo {
    const currentSoldier = this.getCurrentSoldier();
    const redAlive = this.getTeamSoldiers(Team.RED).filter(soldier => soldier.isAlive());
    const blueAlive = this.getTeamSoldiers(Team.BLUE).filter(soldier => soldier.isAlive());
    const redActed = redAlive.filter(soldier => this.actedThisRound.has(soldier)).length;
    const blueActed = blueAlive.filter(soldier => this.actedThisRound.has(soldier)).length;

    return {
      currentTeam: this.currentTeam,
      currentSoldierName: currentSoldier?.name ?? 'None',
      turnNumber: this.turnNumber,
      redTeamAlive: redAlive.length,
      blueTeamAlive: blueAlive.length,
      roundNumber: this.roundNumber,
      redActedThisRound: redActed,
      blueActedThisRound: blueActed,
    };
  }

  public checkGameOver(): GameOverState {
    const redAlive = this.getTeamSoldiers(Team.RED).filter(soldier => soldier.isAlive()).length;
    const blueAlive = this.getTeamSoldiers(Team.BLUE).filter(soldier => soldier.isAlive()).length;

    if (redAlive === 0 && blueAlive === 0) {
      return { isOver: true, winner: null };
    }

    if (redAlive === 0) {
      return { isOver: true, winner: Team.BLUE };
    }

    if (blueAlive === 0) {
      return { isOver: true, winner: Team.RED };
    }

    return { isOver: false, winner: null };
  }

  private getTeamSoldiers(team: Team): TSoldier[] {
    return this.soldiers.filter(soldier => soldier.team === team);
  }

  public reset(): void {
    this.currentTeam = Team.RED;
    this.turnNumber = 1;
    this.roundNumber = 1;
    this.currentSoldier = null;
    this.actedThisRound.clear();
  }
}
