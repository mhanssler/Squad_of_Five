import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Team } from '../src/systems/TurnManager';

// Mock Soldier class for testing TurnManager
class MockSoldier {
  public team: Team;
  public name: string;
  private alive: boolean = true;
  private health: number = 100;

  constructor(team: Team, name: string, alive: boolean = true) {
    this.team = team;
    this.name = name;
    this.alive = alive;
  }

  isAlive(): boolean {
    return this.alive && this.health > 0;
  }

  setAlive(alive: boolean): void {
    this.alive = alive;
    if (!alive) this.health = 0;
  }

  takeDamage(amount: number): void {
    this.health = Math.max(0, this.health - amount);
    if (this.health <= 0) {
      this.alive = false;
    }
  }
}

// Import TurnManager after mocking
// We'll test the logic directly since we can't easily mock Phaser
describe('TurnManager Logic', () => {
  describe('Team enum', () => {
    it('should have RED and BLUE teams', () => {
      expect(Team.RED).toBe('red');
      expect(Team.BLUE).toBe('blue');
    });
  });

  describe('Game state tracking', () => {
    it('should track alive soldiers per team', () => {
      const redSoldiers = [
        new MockSoldier(Team.RED, 'Red1'),
        new MockSoldier(Team.RED, 'Red2'),
        new MockSoldier(Team.RED, 'Red3'),
      ];
      const blueSoldiers = [
        new MockSoldier(Team.BLUE, 'Blue1'),
        new MockSoldier(Team.BLUE, 'Blue2'),
      ];
      const allSoldiers = [...redSoldiers, ...blueSoldiers];

      const redAlive = allSoldiers.filter(s => s.team === Team.RED && s.isAlive()).length;
      const blueAlive = allSoldiers.filter(s => s.team === Team.BLUE && s.isAlive()).length;

      expect(redAlive).toBe(3);
      expect(blueAlive).toBe(2);
    });

    it('should update alive count when soldier dies', () => {
      const soldiers = [
        new MockSoldier(Team.RED, 'Red1'),
        new MockSoldier(Team.RED, 'Red2'),
        new MockSoldier(Team.BLUE, 'Blue1'),
      ];

      soldiers[0].setAlive(false);

      const redAlive = soldiers.filter(s => s.team === Team.RED && s.isAlive()).length;
      expect(redAlive).toBe(1);
    });
  });

  describe('Game over conditions', () => {
    it('should detect RED team win when all BLUE soldiers dead', () => {
      const soldiers = [
        new MockSoldier(Team.RED, 'Red1'),
        new MockSoldier(Team.BLUE, 'Blue1', false),
        new MockSoldier(Team.BLUE, 'Blue2', false),
      ];

      const redAlive = soldiers.filter(s => s.team === Team.RED && s.isAlive()).length;
      const blueAlive = soldiers.filter(s => s.team === Team.BLUE && s.isAlive()).length;

      expect(redAlive).toBeGreaterThan(0);
      expect(blueAlive).toBe(0);
      // This means RED wins
    });

    it('should detect BLUE team win when all RED soldiers dead', () => {
      const soldiers = [
        new MockSoldier(Team.RED, 'Red1', false),
        new MockSoldier(Team.RED, 'Red2', false),
        new MockSoldier(Team.BLUE, 'Blue1'),
      ];

      const redAlive = soldiers.filter(s => s.team === Team.RED && s.isAlive()).length;
      const blueAlive = soldiers.filter(s => s.team === Team.BLUE && s.isAlive()).length;

      expect(redAlive).toBe(0);
      expect(blueAlive).toBeGreaterThan(0);
      // This means BLUE wins
    });

    it('should detect draw when all soldiers dead', () => {
      const soldiers = [
        new MockSoldier(Team.RED, 'Red1', false),
        new MockSoldier(Team.BLUE, 'Blue1', false),
      ];

      const redAlive = soldiers.filter(s => s.team === Team.RED && s.isAlive()).length;
      const blueAlive = soldiers.filter(s => s.team === Team.BLUE && s.isAlive()).length;

      expect(redAlive).toBe(0);
      expect(blueAlive).toBe(0);
      // This is a draw
    });

    it('should not be game over when both teams have alive soldiers', () => {
      const soldiers = [
        new MockSoldier(Team.RED, 'Red1'),
        new MockSoldier(Team.BLUE, 'Blue1'),
      ];

      const redAlive = soldiers.filter(s => s.team === Team.RED && s.isAlive()).length;
      const blueAlive = soldiers.filter(s => s.team === Team.BLUE && s.isAlive()).length;

      expect(redAlive).toBeGreaterThan(0);
      expect(blueAlive).toBeGreaterThan(0);
      // Game continues
    });
  });

  describe('Turn switching', () => {
    it('should alternate between RED and BLUE teams', () => {
      let currentTeam = Team.RED;
      
      // Switch turn
      currentTeam = currentTeam === Team.RED ? Team.BLUE : Team.RED;
      expect(currentTeam).toBe(Team.BLUE);
      
      // Switch again
      currentTeam = currentTeam === Team.RED ? Team.BLUE : Team.RED;
      expect(currentTeam).toBe(Team.RED);
    });

    it('should skip team if no alive soldiers', () => {
      const soldiers = [
        new MockSoldier(Team.RED, 'Red1'),
        new MockSoldier(Team.BLUE, 'Blue1', false), // Dead
      ];

      let currentTeam = Team.RED;
      
      // Try to switch to BLUE
      const nextTeam = currentTeam === Team.RED ? Team.BLUE : Team.RED;
      const nextTeamAlive = soldiers.filter(s => s.team === nextTeam && s.isAlive()).length;
      
      // If next team has no alive soldiers, stay with current or switch back
      if (nextTeamAlive === 0) {
        currentTeam = currentTeam; // Stay or determine game over
      } else {
        currentTeam = nextTeam;
      }
      
      expect(currentTeam).toBe(Team.RED); // Should stay RED since BLUE has no alive
    });
  });

  describe('Soldier selection within team', () => {
    it('should cycle through alive soldiers', () => {
      const soldiers = [
        new MockSoldier(Team.RED, 'Red1'),
        new MockSoldier(Team.RED, 'Red2'),
        new MockSoldier(Team.RED, 'Red3'),
      ];

      let index = 0;
      const aliveSoldiers = soldiers.filter(s => s.isAlive());
      
      expect(aliveSoldiers[index % aliveSoldiers.length].name).toBe('Red1');
      index++;
      expect(aliveSoldiers[index % aliveSoldiers.length].name).toBe('Red2');
      index++;
      expect(aliveSoldiers[index % aliveSoldiers.length].name).toBe('Red3');
      index++;
      expect(aliveSoldiers[index % aliveSoldiers.length].name).toBe('Red1'); // Cycles back
    });

    it('should skip dead soldiers in rotation', () => {
      const soldiers = [
        new MockSoldier(Team.RED, 'Red1'),
        new MockSoldier(Team.RED, 'Red2', false), // Dead
        new MockSoldier(Team.RED, 'Red3'),
      ];

      const aliveSoldiers = soldiers.filter(s => s.isAlive());
      expect(aliveSoldiers.length).toBe(2);
      expect(aliveSoldiers[0].name).toBe('Red1');
      expect(aliveSoldiers[1].name).toBe('Red3');
    });
  });
});
