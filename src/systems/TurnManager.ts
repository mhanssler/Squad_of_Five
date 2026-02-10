import { Soldier } from '../entities/Soldier';

export enum Team {
  RED = 'red',
  BLUE = 'blue',
}

interface TurnInfo {
  currentTeam: Team;
  currentSoldierName: string;
  turnNumber: number;
  redTeamAlive: number;
  blueTeamAlive: number;
  roundNumber: number;
  redActedThisRound: number;
  blueActedThisRound: number;
}

interface GameOverState {
  isOver: boolean;
  winner: Team | null;
}

export class TurnManager {
  private soldiers: Soldier[];
  private currentTeam: Team = Team.RED;
  private turnNumber: number = 1;
  private roundNumber: number = 1;
  private currentSoldier: Soldier | null = null;
  
  // Track which soldiers have acted this round
  private actedThisRound: Set<Soldier> = new Set();

  constructor(soldiers: Soldier[]) {
    this.soldiers = soldiers;
  }

  public setSoldiers(soldiers: Soldier[]): void {
    this.soldiers = soldiers;
  }

  public getCurrentTeam(): Team {
    return this.currentTeam;
  }

  public setCurrentSoldier(soldier: Soldier): void {
    this.currentSoldier = soldier;
  }

  public getCurrentSoldier(): Soldier | null {
    return this.currentSoldier;
  }
  
  // Get soldiers that can still act this round (alive and haven't acted)
  public getAvailableSoldiers(team: Team): Soldier[] {
    return this.soldiers.filter(s => 
      s.team === team && 
      s.isAlive() && 
      !this.actedThisRound.has(s)
    );
  }
  
  // Check if a soldier has acted this round
  public hasActedThisRound(soldier: Soldier): boolean {
    return this.actedThisRound.has(soldier);
  }
  
  // Mark the current soldier as having acted
  public markSoldierActed(): void {
    if (this.currentSoldier) {
      this.actedThisRound.add(this.currentSoldier);
    }
  }

  public nextTurn(): void {
    // Mark current soldier as having acted
    this.markSoldierActed();
    
    // Clear current soldier selection
    this.currentSoldier = null;
    
    // Increment turn number
    this.turnNumber++;

    // Switch teams
    this.currentTeam = this.currentTeam === Team.RED ? Team.BLUE : Team.RED;
    
    // Check if new team has any available soldiers (alive and haven't acted)
    let availableSoldiers = this.getAvailableSoldiers(this.currentTeam);
    
    if (availableSoldiers.length === 0) {
      // No available soldiers on this team, try the other team
      this.currentTeam = this.currentTeam === Team.RED ? Team.BLUE : Team.RED;
      availableSoldiers = this.getAvailableSoldiers(this.currentTeam);
      
      if (availableSoldiers.length === 0) {
        // No available soldiers on either team - start new round
        this.startNewRound();
      }
    }
  }
  
  private startNewRound(): void {
    this.roundNumber++;
    this.actedThisRound.clear();
    
    // Red team always starts each round
    this.currentTeam = Team.RED;
    
    // Check if red team has alive soldiers, if not switch to blue
    const redAlive = this.getTeamSoldiers(Team.RED).filter(s => s.isAlive());
    if (redAlive.length === 0) {
      this.currentTeam = Team.BLUE;
    }
  }

  public getTurnInfo(): TurnInfo {
    const currentSoldier = this.getCurrentSoldier();
    const redAlive = this.getTeamSoldiers(Team.RED).filter(s => s.isAlive());
    const blueAlive = this.getTeamSoldiers(Team.BLUE).filter(s => s.isAlive());
    const redActed = redAlive.filter(s => this.actedThisRound.has(s)).length;
    const blueActed = blueAlive.filter(s => this.actedThisRound.has(s)).length;
    
    return {
      currentTeam: this.currentTeam,
      currentSoldierName: currentSoldier?.name || 'None',
      turnNumber: this.turnNumber,
      redTeamAlive: redAlive.length,
      blueTeamAlive: blueAlive.length,
      roundNumber: this.roundNumber,
      redActedThisRound: redActed,
      blueActedThisRound: blueActed,
    };
  }

  public checkGameOver(): GameOverState {
    const redAlive = this.getTeamSoldiers(Team.RED).filter(s => s.isAlive()).length;
    const blueAlive = this.getTeamSoldiers(Team.BLUE).filter(s => s.isAlive()).length;

    if (redAlive === 0 && blueAlive === 0) {
      return { isOver: true, winner: null }; // Draw
    }

    if (redAlive === 0) {
      return { isOver: true, winner: Team.BLUE };
    }

    if (blueAlive === 0) {
      return { isOver: true, winner: Team.RED };
    }

    return { isOver: false, winner: null };
  }

  private getTeamSoldiers(team: Team): Soldier[] {
    return this.soldiers.filter(s => s.team === team);
  }
  
  // Reset for new game
  public reset(): void {
    this.currentTeam = Team.RED;
    this.turnNumber = 1;
    this.roundNumber = 1;
    this.currentSoldier = null;
    this.actedThisRound.clear();
  }
}
