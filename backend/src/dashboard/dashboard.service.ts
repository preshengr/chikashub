import { Inject, Injectable, Logger as NestLogger } from '@nestjs/common';
import { DATA_STORE, type DataStore } from '../database/data-store';
import { ApiException } from '../common/api-error';
import { loadProfile, type FullProfile } from '../users/profile.repository';
import { GameService, type GameProgressRow, type ProgressSummary } from '../game/game.service';
import {
  GAMES,
  GOAL_LABELS,
  filterGamesForChild,
  groupGamesByGoal,
  type ChildProfileLike,
  type GameDefinition,
  type LearningGoal,
  type TeamId,
} from '../game/catalog';

export interface DashboardGame extends GameDefinition {
  progress: GameProgressRow | null;
}

export interface DashboardSection {
  goal: LearningGoal;
  label: string;
  games: DashboardGame[];
}

export interface DashboardPayload {
  username: string;
  profile: FullProfile;
  child: FullProfile['child'];
  team: TeamId;
  teamLabel: string;
  serverTime: string;
  games: DashboardGame[];
  sections: DashboardSection[];
  progress: ProgressSummary;
  learningGoalLabels: Array<{ goal: LearningGoal; label: string }>;
  excluded: Array<{ id: string; reason: string }>;
}

/**
 * Assembles everything the Game Dashboard needs in one round trip:
 * profile + age/reading-level filtered catalogue + progress aggregates.
 *
 * The filtering/ranking rules live in `catalog.ts` (pure functions) so the
 * frontend can mirror them for optimistic rendering and unit tests can cover
 * them without a database.
 */
@Injectable()
export class DashboardService {
  private readonly logger = new NestLogger(DashboardService.name);

  constructor(
    @Inject(DATA_STORE) private readonly store: DataStore,
    private readonly games: GameService,
  ) {}

  async getDashboard(username: string): Promise<DashboardPayload> {
    const profile = await loadProfile(this.store, username);
    if (!profile || profile.status !== 'active') {
      this.logger.warn(`Dashboard requested for unknown/inactive username=${username}`);
      throw ApiException.userNotFound();
    }

    const child = profile.child;
    const childProfile: ChildProfileLike = {
      age: child.age,
      readingLevel: asReadingLevel(child.readingLevel),
      learningGoals: asLearningGoals(child.learningGoals),
      gameplayStyle: asGameplayStyle(child.gameplayStyle),
    };

    const filter = filterGamesForChild(GAMES, childProfile);
    const summary = await this.games.getProgressSummary(username, filter.games);
    const progressByGame = new Map(summary.byGame.map((row) => [row.gameId, row]));

    const games: DashboardGame[] = filter.games.map((game) => ({
      ...game,
      progress: progressByGame.get(game.id) ?? null,
    }));

    const sections: DashboardSection[] = groupGamesByGoal(
      games,
      childProfile.learningGoals,
    ).filter((section) => section.games.length > 0);

    return {
      username,
      profile,
      child,
      team: filter.team,
      teamLabel: filter.teamLabel,
      serverTime: new Date().toISOString(),
      games,
      sections,
      progress: summary,
      learningGoalLabels: childProfile.learningGoals.map((goal) => ({
        goal,
        label: GOAL_LABELS[goal],
      })),
      excluded: filter.excluded,
    };
  }
}

const READING_LEVEL_VALUES = ['pre_reader', 'early_reader', 'independent_reader'] as const;
const GAMEPLAY_STYLE_VALUES = ['story', 'action', 'relaxed'] as const;
const LEARNING_GOAL_VALUES = ['math', 'reading', 'science', 'creativity', 'coding'] as const;

function asReadingLevel(value: string): ChildProfileLike['readingLevel'] {
  return (READING_LEVEL_VALUES as readonly string[]).includes(value)
    ? (value as ChildProfileLike['readingLevel'])
    : 'pre_reader';
}

function asGameplayStyle(value: string): ChildProfileLike['gameplayStyle'] {
  return (GAMEPLAY_STYLE_VALUES as readonly string[]).includes(value)
    ? (value as ChildProfileLike['gameplayStyle'])
    : 'relaxed';
}

function asLearningGoals(values: string[]): LearningGoal[] {
  return values.filter((v): v is LearningGoal =>
    (LEARNING_GOAL_VALUES as readonly string[]).includes(v),
  );
}
