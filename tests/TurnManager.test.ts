import { beforeEach, describe, expect, it } from 'vitest';
import {
  Team,
  TurnManager,
  type TurnParticipant,
} from '../src/systems/TurnManager';

class MockSoldier implements TurnParticipant {
  constructor(
    public team: Team,
    public name: string,
    private alive: boolean = true,
  ) {}

  public isAlive(): boolean {
    return this.alive;
  }

  public kill(): void {
    this.alive = false;
  }
}

describe('TurnManager', () => {
  let redOne: MockSoldier;
  let redTwo: MockSoldier;
  let blueOne: MockSoldier;
  let blueTwo: MockSoldier;
  let manager: TurnManager<MockSoldier>;

  beforeEach(() => {
    redOne = new MockSoldier(Team.RED, 'Red One');
    redTwo = new MockSoldier(Team.RED, 'Red Two');
    blueOne = new MockSoldier(Team.BLUE, 'Blue One');
    blueTwo = new MockSoldier(Team.BLUE, 'Blue Two');
    manager = new TurnManager([redOne, redTwo, blueOne, blueTwo]);
  });

  it('starts on red team with the expected initial state', () => {
    expect(manager.getCurrentTeam()).toBe(Team.RED);
    expect(manager.getCurrentSoldier()).toBeNull();
    expect(manager.getTurnInfo()).toEqual({
      currentTeam: Team.RED,
      currentSoldierName: 'None',
      turnNumber: 1,
      redTeamAlive: 2,
      blueTeamAlive: 2,
      roundNumber: 1,
      redActedThisRound: 0,
      blueActedThisRound: 0,
    });
  });

  it('tracks the selected soldier', () => {
    manager.setCurrentSoldier(redOne);

    expect(manager.getCurrentSoldier()).toBe(redOne);
    expect(manager.getTurnInfo().currentSoldierName).toBe('Red One');
  });

  it('marks a soldier as acted and alternates teams', () => {
    manager.setCurrentSoldier(redOne);
    manager.nextTurn();

    expect(manager.hasActedThisRound(redOne)).toBe(true);
    expect(manager.getCurrentSoldier()).toBeNull();
    expect(manager.getCurrentTeam()).toBe(Team.BLUE);
    expect(manager.getTurnInfo().turnNumber).toBe(2);
    expect(manager.getAvailableSoldiers(Team.RED)).toEqual([redTwo]);
  });

  it('excludes dead and already-acted soldiers from availability', () => {
    redTwo.kill();
    manager.setCurrentSoldier(redOne);
    manager.markSoldierActed();

    expect(manager.getAvailableSoldiers(Team.RED)).toEqual([]);
    expect(manager.getAvailableSoldiers(Team.BLUE)).toEqual([blueOne, blueTwo]);
  });

  it('lets a team finish its remaining soldiers when the other team is exhausted', () => {
    const unevenManager = new TurnManager([redOne, blueOne, blueTwo]);

    unevenManager.setCurrentSoldier(redOne);
    unevenManager.nextTurn();
    unevenManager.setCurrentSoldier(blueOne);
    unevenManager.nextTurn();

    expect(unevenManager.getCurrentTeam()).toBe(Team.BLUE);
    expect(unevenManager.getAvailableSoldiers(Team.BLUE)).toEqual([blueTwo]);
  });

  it('starts a new round after every living soldier has acted', () => {
    manager.setCurrentSoldier(redOne);
    manager.nextTurn();
    manager.setCurrentSoldier(blueOne);
    manager.nextTurn();
    manager.setCurrentSoldier(redTwo);
    manager.nextTurn();
    manager.setCurrentSoldier(blueTwo);
    manager.nextTurn();

    const info = manager.getTurnInfo();
    expect(info.roundNumber).toBe(2);
    expect(info.turnNumber).toBe(5);
    expect(info.currentTeam).toBe(Team.RED);
    expect(info.redActedThisRound).toBe(0);
    expect(info.blueActedThisRound).toBe(0);
    expect(manager.getAvailableSoldiers(Team.RED)).toEqual([redOne, redTwo]);
    expect(manager.getAvailableSoldiers(Team.BLUE)).toEqual([blueOne, blueTwo]);
  });

  it('removes stale state when the soldier roster is replaced', () => {
    manager.setCurrentSoldier(redOne);
    manager.markSoldierActed();
    manager.setSoldiers([redTwo, blueOne, blueTwo]);

    expect(manager.getCurrentSoldier()).toBeNull();
    expect(manager.hasActedThisRound(redOne)).toBe(false);
    expect(manager.getAvailableSoldiers(Team.RED)).toEqual([redTwo]);
  });

  it('reports an active game while both teams have survivors', () => {
    expect(manager.checkGameOver()).toEqual({ isOver: false, winner: null });
  });

  it('reports a red victory when blue has no survivors', () => {
    blueOne.kill();
    blueTwo.kill();

    expect(manager.checkGameOver()).toEqual({ isOver: true, winner: Team.RED });
  });

  it('reports a blue victory when red has no survivors', () => {
    redOne.kill();
    redTwo.kill();

    expect(manager.checkGameOver()).toEqual({ isOver: true, winner: Team.BLUE });
  });

  it('reports a draw when no soldiers survive', () => {
    redOne.kill();
    redTwo.kill();
    blueOne.kill();
    blueTwo.kill();

    expect(manager.checkGameOver()).toEqual({ isOver: true, winner: null });
  });

  it('resets turn, round, selection, and acted state', () => {
    manager.setCurrentSoldier(redOne);
    manager.nextTurn();
    manager.reset();

    expect(manager.getTurnInfo()).toEqual({
      currentTeam: Team.RED,
      currentSoldierName: 'None',
      turnNumber: 1,
      redTeamAlive: 2,
      blueTeamAlive: 2,
      roundNumber: 1,
      redActedThisRound: 0,
      blueActedThisRound: 0,
    });
    expect(manager.getAvailableSoldiers(Team.RED)).toEqual([redOne, redTwo]);
  });
});
