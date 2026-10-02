import { describe, expect, it } from 'vitest';
import {
  filterGamesForChild,
  groupGamesByGoal,
  localCatalog,
  teamForAge,
} from '../src/core/catalog';
import type { GameDefinition } from '../src/core/types';

const games = localCatalog();

function child(overrides: Partial<{ age: number; readingLevel: GameDefinition['readingLevel']; learningGoals: GameDefinition['goals']; gameplayStyle: GameDefinition['gameplayStyle'] }> = {}) {
  return {
    age: overrides.age ?? 7,
    readingLevel: overrides.readingLevel ?? 'early_reader',
    learningGoals: (overrides.learningGoals ?? ['math']) as GameDefinition['goals'],
    gameplayStyle: overrides.gameplayStyle ?? 'story',
  } as Parameters<typeof filterGamesForChild>[1];
}

const ids = (list: GameDefinition[]): string[] => list.map((game) => game.id);

describe('catalogue fallback', () => {
  it('ships every game with slides and instructions', () => {
    expect(games.length).toBeGreaterThanOrEqual(10);
    for (const game of games) {
      expect(game.slides.length).toBeGreaterThanOrEqual(4);
      expect(game.instructions.length).toBeGreaterThanOrEqual(3);
      expect(game.totalLevels).toBeGreaterThan(0);
      expect(game.accent).toMatch(/^#/);
    }
  });
});

describe('teamForAge', () => {
  it('maps ages onto the three teams', () => {
    expect(teamForAge(4)).toBe('pre_readers');
    expect(teamForAge(6)).toBe('pre_readers');
    expect(teamForAge(7)).toBe('mid_age');
    expect(teamForAge(9)).toBe('mid_age');
    expect(teamForAge(10)).toBe('puzzlers');
    expect(teamForAge(12)).toBe('puzzlers');
  });
});

describe('filterGamesForChild (mirrors the API)', () => {
  it('excludes games outside the age window with the right reason', () => {
    const result = filterGamesForChild(games, child({ age: 4 }));
    expect(result.excluded.some((entry) => entry.reason.startsWith('age_out_of_range_'))).toBe(true);
    expect(result.games.every((game) => game.minAge <= 4 && game.maxAge >= 4)).toBe(true);
  });

  it('never shows text-heavy games to a pre-reader', () => {
    const result = filterGamesForChild(games, child({ age: 6, readingLevel: 'pre_reader' }));
    expect(
      result.excluded.some(
        (entry) => entry.id === 'word-wonders' && entry.reason === 'reading_level_too_high',
      ),
    ).toBe(true);
    expect(
      result.games.every((game) => game.readingLevel !== 'independent_reader'),
    ).toBe(true);
  });

  it('drops too-easy games from the puzzlers team', () => {
    const result = filterGamesForChild(games, child({ age: 11, readingLevel: 'independent_reader' }));
    expect(result.team).toBe('puzzlers');
    expect(result.excluded.some((entry) => entry.reason === 'too_easy_for_team')).toBe(true);
    expect(result.games.every((game) => game.difficulty >= 2)).toBe(true);
  });

  it('ranks games matching the primary goal first', () => {
    const result = filterGamesForChild(
      games,
      child({ age: 9, learningGoals: ['creativity', 'math'] }),
    );
    const top = result.games.slice(0, 3);
    expect(top.some((game) => game.goals.includes('creativity'))).toBe(true);
    const firstNonMatching = result.games.findIndex((game) => !game.goals.includes('creativity'));
    if (firstNonMatching !== -1) {
      expect(result.games.slice(0, firstNonMatching).every((game) => game.goals.includes('creativity'))).toBe(true);
    }
  });

  it('is deterministic for the same profile', () => {
    const profile = child({ age: 8, learningGoals: ['science', 'coding'] });
    expect(ids(filterGamesForChild(games, profile).games)).toEqual(
      ids(filterGamesForChild(games, profile).games),
    );
  });
});

describe('groupGamesByGoal (mirrors the API)', () => {
  it('places every game exactly once', () => {
    const sections = groupGamesByGoal(games, ['math', 'reading']);
    const placed = sections.flatMap((section) => section.games.map((game) => game.id));
    expect(placed.length).toBe(new Set(placed).size);
    expect(placed.length).toBe(games.length);
  });

  it('orders sections by the child goals first', () => {
    const sections = groupGamesByGoal(games, ['creativity', 'math']);
    expect(sections[0]?.goal).toBe('creativity');
    expect(sections[1]?.goal).toBe('math');
  });

  it('keeps an empty list empty', () => {
    expect(groupGamesByGoal([], ['math'])).toEqual([]);
  });
});
