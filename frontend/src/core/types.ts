export const RELATIONSHIPS = ['mother', 'father', 'legal_guardian', 'other'] as const;
export type Relationship = (typeof RELATIONSHIPS)[number];

export const RELATIONSHIP_LABELS: Record<Relationship, string> = {
  mother: 'Mother',
  father: 'Father',
  legal_guardian: 'Legal Guardian',
  other: 'Other',
};

export const GRADES = [
  'pre_k',
  'kindergarten',
  'grade_1',
  'grade_2',
  'grade_3',
  'grade_4',
  'grade_5',
] as const;
export type Grade = (typeof GRADES)[number];

export const GRADE_LABELS: Record<Grade, string> = {
  pre_k: 'Pre-K',
  kindergarten: 'Kindergarten',
  grade_1: '1st Grade',
  grade_2: '2nd Grade',
  grade_3: '3rd Grade',
  grade_4: '4th Grade',
  grade_5: '5th Grade',
};

export const LEARNING_GOALS = ['math', 'reading', 'science', 'creativity', 'coding'] as const;
export type LearningGoal = (typeof LEARNING_GOALS)[number];

export const GOAL_LABELS: Record<LearningGoal, string> = {
  math: 'Mathematics & Logic',
  reading: 'Reading & Literacy',
  science: 'Science & Exploration',
  creativity: 'Creativity & Art',
  coding: 'Critical Thinking & Coding',
};

export const READING_LEVELS = ['pre_reader', 'early_reader', 'independent_reader'] as const;
export type ReadingLevel = (typeof READING_LEVELS)[number];

export const READING_LEVEL_LABELS: Record<ReadingLevel, string> = {
  pre_reader: 'Pre-reader (audio/visuals primary)',
  early_reader: 'Early Reader (short, simple words)',
  independent_reader: 'Independent Reader (full sentences/instructions)',
};

export const GAMEPLAY_STYLES = ['story', 'action', 'relaxed'] as const;
export type GameplayStyle = (typeof GAMEPLAY_STYLES)[number];

export const GAMEPLAY_STYLE_LABELS: Record<GameplayStyle, string> = {
  story: 'Story-driven / Adventure',
  action: 'Action / Arcade puzzles',
  relaxed: 'Relaxed / Free-play',
};

export type TeamId = 'pre_readers' | 'mid_age' | 'puzzlers';

export const TEAM_LABELS: Record<TeamId, string> = {
  pre_readers: 'Pre-readers Team',
  mid_age: 'Mid Age Team',
  puzzlers: 'Puzzlers Team',
};

export type GameEngine = 'arithmetic' | 'pattern' | 'word' | 'quiz' | 'code' | 'draw';

export interface GameSlide {
  title: string;
  caption: string;
}

export interface GameDefinition {
  id: string;
  title: string;
  tagline: string;
  description: string;
  instructions: string[];
  goals: LearningGoal[];
  readingLevel: ReadingLevel;
  minAge: number;
  maxAge: number;
  difficulty: 1 | 2 | 3;
  gameplayStyle: GameplayStyle;
  engine: GameEngine;
  accent: string;
  icon: string;
  totalLevels: number;
  slides: GameSlide[];
}

export interface ProfileChild {
  id: string;
  firstName: string;
  age: number;
  grade: Grade;
  readingLevel: ReadingLevel;
  learningGoals: LearningGoal[];
  gameplayStyle: GameplayStyle;
}

export interface ProfileParent {
  firstName: string;
  lastName: string;
  relationship: Relationship;
  email: string;
  phone: string | null;
}

export interface FullProfile {
  username: string;
  status: 'pending' | 'active';
  createdAt: string;
  child: ProfileChild;
  parent: ProfileParent;
}

export interface RegisterPayload {
  parent: {
    firstName: string;
    lastName: string;
    relationship: Relationship;
    email: string;
    phone?: string;
  };
  child: {
    firstName: string;
    age: number;
    grade: Grade;
  };
  preferences: {
    learningGoals: LearningGoal[];
    readingLevel: ReadingLevel;
    gameplayStyle: GameplayStyle;
  };
  consent: {
    consentData: boolean;
    termsConsent: boolean;
    signatureFullName: string;
    signatureDate: string;
  };
}

export interface RegisterResult {
  username: string;
  expiresAt: string;
  expiresInMinutes: number;
  childFirstName: string;
}

export interface AuthResult {
  username: string;
  token: string;
  expiresIn: number;
  expiresAt: string;
  profile: FullProfile;
}

export interface GameProgressRow {
  gameId: string;
  title: string;
  icon: string;
  accent: string;
  started: boolean;
  maxLevel: number;
  totalLevels: number;
  bestScore: number;
  failures: number;
  completions: number;
  completed: boolean;
  percent: number;
  lastEventAt: string | null;
}

export interface ProgressSummary {
  byGame: GameProgressRow[];
  overall: {
    gamesStarted: number;
    gamesCompleted: number;
    levelsCompleted: number;
    totalLevels: number;
    percent: number;
    bestScore: number;
    failures: number;
  };
}

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
  child: ProfileChild;
  team: TeamId;
  teamLabel: string;
  serverTime: string;
  games: DashboardGame[];
  sections: DashboardSection[];
  progress: ProgressSummary;
  learningGoalLabels: Array<{ goal: LearningGoal; label: string }>;
  excluded: Array<{ id: string; reason: string }>;
}

export type GameEventType = 'start' | 'level_complete' | 'failure' | 'game_complete';

export interface ValidationDetail {
  field: string;
  message: string;
}
