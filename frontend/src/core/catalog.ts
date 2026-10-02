import fallbackCatalog from './catalog-fallback.json';
import { api, ApiError } from './api';
import type {
  DashboardSection,
  GameDefinition,
  GameplayStyle,
  LearningGoal,
  ReadingLevel,
  TeamId,
} from './types';
import { GOAL_LABELS, LEARNING_GOALS, TEAM_LABELS } from './types';

const READING_RANK: Record<ReadingLevel, number> = {
  pre_reader: 0,
  early_reader: 1,
  independent_reader: 2,
};

export interface ChildProfileLike {
  age: number;
  readingLevel: ReadingLevel;
  learningGoals: LearningGoal[];
  gameplayStyle: GameplayStyle;
}

let cachedGames: GameDefinition[] | null = null;

export function localCatalog(): GameDefinition[] {
  return (fallbackCatalog as GameDefinition[]).map((game) => ({ ...game }));
}

/**
 * Fetch the game catalogue from the API, falling back to the bundled copy
 * when the network is unavailable so the landing page still renders.
 */
export async function fetchCatalog(): Promise<{ games: GameDefinition[]; offline: boolean }> {
  if (cachedGames) return { games: cachedGames, offline: false };
  try {
    const payload = await api.get<{ games: GameDefinition[] }>('/games');
    if (payload?.games?.length) {
      cachedGames = payload.games;
      return { games: cachedGames, offline: false };
    }
    throw new ApiError(502, 'EMPTY_CATALOG', 'The game catalogue was empty');
  } catch (err) {
    if (err instanceof ApiError && err.isAuthError) throw err;
    return { games: localCatalog(), offline: true };
  }
}

export function clearCatalogCache(): void {
  cachedGames = null;
}

/** Mirrors backend `resolveTeam`. */
export function teamForAge(age: number): TeamId {
  if (age <= 6) return 'pre_readers';
  if (age <= 9) return 'mid_age';
  return 'puzzlers';
}

function teamReadingCap(team: TeamId): number {
  return team === 'pre_readers' ? READING_RANK.early_reader : READING_RANK.independent_reader;
}

function teamMinDifficulty(team: TeamId): number {
  return team === 'puzzlers' ? 2 : 1;
}

export interface ExclusionReason {
  id: string;
  reason: string;
}

/**
 * Mirrors backend `filterGamesForChild` (inclusion rules + scoring) so the
 * dashboard keeps working offline or on first paint before the API responds.
 */
export function filterGamesForChild(
  games: GameDefinition[],
  child: ChildProfileLike,
): { games: GameDefinition[]; team: TeamId; teamLabel: string; excluded: ExclusionReason[] } {
  const team = teamForAge(child.age);
  const readingCap = Math.min(teamReadingCap(team), READING_RANK[child.readingLevel] ?? 0);
  const minDifficulty = teamMinDifficulty(team);
  const excluded: ExclusionReason[] = [];
  const included: GameDefinition[] = [];

  for (const game of games) {
    if (child.age < game.minAge || child.age > game.maxAge) {
      excluded.push({ id: game.id, reason: `age_out_of_range_${game.minAge}_${game.maxAge}` });
      continue;
    }
    if (READING_RANK[game.readingLevel] > readingCap) {
      excluded.push({ id: game.id, reason: 'reading_level_too_high' });
      continue;
    }
    if (game.difficulty < minDifficulty) {
      excluded.push({ id: game.id, reason: 'too_easy_for_team' });
      continue;
    }
    included.push(game);
  }

  const ranked = included
    .map((game) => ({ game, score: scoreGame(game, child, child.learningGoals) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.game.title.localeCompare(b.game.title);
    })
    .map((entry) => entry.game);

  return { team, teamLabel: TEAM_LABELS[team], games: ranked, excluded };
}

function scoreGame(game: GameDefinition, child: ChildProfileLike, goals: LearningGoal[]): number {
  let score = 0;
  const primary = goals[0];
  const secondary = goals[1];

  if (primary && game.goals.includes(primary)) score += 40;
  if (secondary && game.goals.includes(secondary)) score += 25;
  for (const goal of game.goals) {
    if (goal !== primary && goal !== secondary && goals.includes(goal)) score += 12;
  }
  if (game.gameplayStyle === child.gameplayStyle) score += 8;
  if (game.readingLevel === child.readingLevel) score += 4;
  const center = (game.minAge + game.maxAge) / 2;
  score += Math.max(0, 3 - Math.abs(center - child.age) * 0.5);
  score += game.difficulty;
  return score;
}

/** Mirrors backend `groupGamesByGoal` (first matching section wins, leftovers kept). */
export function groupGamesByGoal(
  games: GameDefinition[],
  learningGoals: LearningGoal[],
): DashboardSection[] {
  const orderedGoals: LearningGoal[] = [
    ...learningGoals.filter((goal) => LEARNING_GOALS.includes(goal)),
    ...LEARNING_GOALS.filter((goal) => !learningGoals.includes(goal)),
  ];

  const assigned = new Set<string>();
  const sections: DashboardSection[] = [];

  for (const goal of orderedGoals) {
    const sectionGames = games.filter((game) => !assigned.has(game.id) && game.goals.includes(goal));
    if (sectionGames.length === 0) continue;
    for (const game of sectionGames) assigned.add(game.id);
    sections.push({
      goal,
      label: GOAL_LABELS[goal],
      games: sectionGames.map((game) => ({ ...game, progress: null })),
    });
  }

  const leftovers = games.filter((game) => !assigned.has(game.id));
  if (leftovers.length > 0) {
    sections.push({
      goal: 'math',
      label: 'More Games',
      games: leftovers.map((game) => ({ ...game, progress: null })),
    });
  }

  return sections;
}
