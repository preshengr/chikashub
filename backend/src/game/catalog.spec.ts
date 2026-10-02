import {
  GAMES,
  GOAL_LABELS,
  TEAM_LABELS,
  filterGamesForChild,
  getGameById,
  groupGamesByGoal,
  resolveTeam,
  type ChildProfileLike,
  type GameDefinition,
  type LearningGoal,
} from './catalog';

function child(overrides: Partial<ChildProfileLike> = {}): ChildProfileLike {
  return {
    age: 7,
    readingLevel: 'early_reader',
    learningGoals: ['math'],
    gameplayStyle: 'story',
    ...overrides,
  };
}

const ids = (games: GameDefinition[]) => games.map((g) => g.id);

describe('catalogue integrity', () => {
  it('exposes a unique id for every game', () => {
    const unique = new Set(GAMES.map((g) => g.id));
    expect(unique.size).toBe(GAMES.length);
    expect(GAMES.length).toBeGreaterThanOrEqual(10);
  });

  it('gives every game instructions, slides and a valid age window', () => {
    for (const game of GAMES) {
      expect(game.instructions.length).toBeGreaterThan(0);
      expect(game.slides.length).toBeGreaterThan(0);
      expect(game.minAge).toBeGreaterThanOrEqual(4);
      expect(game.maxAge).toBeLessThanOrEqual(12);
      expect(game.minAge).toBeLessThanOrEqual(game.maxAge);
      expect([1, 2, 3]).toContain(game.difficulty);
      expect(game.totalLevels).toBeGreaterThan(0);
      expect(game.goals.length).toBeGreaterThan(0);
    }
  });

  it('looks up games by id', () => {
    expect(getGameById('number-ninja')?.title).toBe('Number Ninja');
    expect(getGameById('missing-game')).toBeUndefined();
  });
});

describe('resolveTeam', () => {
  it.each([
    [4, 'pre_readers'],
    [6, 'pre_readers'],
    [7, 'mid_age'],
    [9, 'mid_age'],
    [10, 'puzzlers'],
    [12, 'puzzlers'],
  ] as const)('age %i joins the %s team', (age, team) => {
    expect(resolveTeam(age)).toBe(team);
    expect(TEAM_LABELS[resolveTeam(age)]).toBeTruthy();
  });
});

describe('filterGamesForChild', () => {
  it('hides text-heavy games from the pre-readers team', () => {
    const result = filterGamesForChild(GAMES, child({ age: 6, readingLevel: 'pre_reader' }));
    expect(result.team).toBe('pre_readers');
    for (const game of result.games) {
      expect(game.readingLevel).not.toBe('independent_reader');
    }
    expect(ids(result.games)).not.toContain('story-stitch');
    expect(ids(result.games)).not.toContain('word-wonders');
    expect(result.excluded.some((e) => e.id === 'word-wonders' && e.reason === 'reading_level_too_high')).toBe(true);
  });

  it('hides games above the child reading level', () => {
    const early = filterGamesForChild(GAMES, child({ age: 8, readingLevel: 'early_reader' }));
    expect(ids(early.games)).not.toContain('story-stitch');
    expect(ids(early.games)).not.toContain('robot-route');
    expect(early.excluded.some((e) => e.id === 'story-stitch' && e.reason === 'reading_level_too_high')).toBe(true);

    const independent = filterGamesForChild(
      GAMES,
      child({ age: 11, readingLevel: 'independent_reader' }),
    );
    expect(ids(independent.games)).toContain('story-stitch');
    expect(ids(independent.games)).toContain('robot-route');
  });

  it('filters by the age window', () => {
    const four = filterGamesForChild(GAMES, child({ age: 4, readingLevel: 'pre_reader' }));
    expect(ids(four.games)).not.toContain('robot-route');
    expect(four.excluded.some((e) => e.reason === 'age_out_of_range_10_12')).toBe(true);

    const twelve = filterGamesForChild(
      GAMES,
      child({ age: 12, readingLevel: 'independent_reader' }),
    );
    expect(ids(twelve.games)).toContain('robot-route');
    expect(ids(twelve.games)).not.toContain('pattern-peacock');
    expect(ids(twelve.games)).not.toContain('doodle-dash');
  });

  it('pushes the puzzlers team towards advanced challenges', () => {
    const result = filterGamesForChild(
      GAMES,
      child({ age: 11, readingLevel: 'independent_reader', learningGoals: ['coding'] }),
    );
    expect(result.team).toBe('puzzlers');
    expect(result.excluded.some((e) => e.reason === 'too_easy_for_team')).toBe(true);
    for (const game of result.games) {
      expect(game.difficulty).toBeGreaterThanOrEqual(2);
    }
    expect(ids(result.games)).toContain('robot-route');
    expect(ids(result.games)).toContain('logic-lantern');
  });

  it('ranks games matching the primary learning goal first', () => {
    const result = filterGamesForChild(
      GAMES,
      child({ age: 9, readingLevel: 'independent_reader', learningGoals: ['creativity'] }),
    );
    expect(result.games.slice(0, 3).every((g) => g.goals.includes('creativity'))).toBe(true);
    expect(result.games[3].goals).not.toContain('creativity');
  });

  it('keeps the secondary goal ahead of unrelated games', () => {
    const result = filterGamesForChild(
      GAMES,
      child({ age: 9, readingLevel: 'independent_reader', learningGoals: ['creativity', 'reading'] }),
    );
    const goals = result.games.map((g) => g.goals);
    const lastMatchedIndex = goals.reduce(
      (last, gameGoals, index) => (gameGoals.some((g) => g === 'creativity' || g === 'reading') ? index : last),
      -1,
    );
    expect(lastMatchedIndex).toBeGreaterThan(0);
    expect(result.games[0].goals.some((g) => g === 'creativity' || g === 'reading')).toBe(true);
  });

  it('prefers the preferred gameplay style when goals tie', () => {
    const story = filterGamesForChild(
      GAMES,
      child({ age: 8, readingLevel: 'independent_reader', learningGoals: ['math'], gameplayStyle: 'story' }),
    );
    const relaxed = filterGamesForChild(
      GAMES,
      child({ age: 8, readingLevel: 'independent_reader', learningGoals: ['math'], gameplayStyle: 'relaxed' }),
    );
    expect(story.games[0].id).not.toBe(relaxed.games[0].id);
    expect(story.games[0].gameplayStyle).toBe('story');
    expect(relaxed.games[0].gameplayStyle).toBe('relaxed');
  });

  it('returns a stable, fully deterministic order', () => {
    const profile = child({ age: 8, learningGoals: ['math', 'coding'] });
    const first = ids(filterGamesForChild(GAMES, profile).games);
    const second = ids(filterGamesForChild(GAMES, profile).games);
    expect(first).toEqual(second);
  });

  it('never returns duplicates', () => {
    const result = filterGamesForChild(GAMES, child({ age: 10, readingLevel: 'independent_reader' }));
    expect(new Set(ids(result.games)).size).toBe(result.games.length);
  });
});

describe('groupGamesByGoal', () => {
  const selected: LearningGoal[] = ['creativity', 'reading'];

  it('puts the selected learning goals first, primary first', () => {
    const sections = groupGamesByGoal(GAMES, selected);
    expect(sections[0].goal).toBe('creativity');
    expect(sections[1].goal).toBe('reading');
    expect(sections[0].label).toBe(GOAL_LABELS.creativity);
  });

  it('covers every game exactly once', () => {
    const sections = groupGamesByGoal(GAMES, selected);
    const all = sections.flatMap((s) => s.games.map((g) => g.id));
    expect(new Set(all).size).toBe(GAMES.length);
    expect(all.sort()).toEqual(ids(GAMES).sort());
  });

  it('orders unselected goals after the selected ones', () => {
    const goals = groupGamesByGoal(GAMES, selected).map((s) => s.goal);
    expect(goals.indexOf('creativity')).toBeLessThan(goals.indexOf('math'));
    expect(goals.indexOf('reading')).toBeLessThan(goals.indexOf('science'));
  });

  it('returns an empty list when there are no games', () => {
    expect(groupGamesByGoal([], selected)).toEqual([]);
  });

  it('preserves the input ordering inside each section', () => {
    const ranked = filterGamesForChild(GAMES, child({ age: 9, learningGoals: selected }));
    const sections = groupGamesByGoal(ranked.games, selected);
    for (const section of sections) {
      const order = section.games.map((g) => ranked.games.findIndex((r) => r.id === g.id));
      expect([...order].sort((a, b) => a - b)).toEqual(order);
    }
  });
});
