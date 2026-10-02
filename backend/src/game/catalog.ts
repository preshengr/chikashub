/**
 * Canonical game catalogue + the pure filtering/sorting algorithm used by
 * GET /dashboard. Keeping this logic dependency-free makes it unit-testable
 * and lets the frontend mirror the exact same rules for optimistic rendering.
 */

export const LEARNING_GOALS = [
  'math',
  'reading',
  'science',
  'creativity',
  'coding',
] as const;
export type LearningGoal = (typeof LEARNING_GOALS)[number];

export const READING_LEVELS = ['pre_reader', 'early_reader', 'independent_reader'] as const;
export type ReadingLevel = (typeof READING_LEVELS)[number];

export const GAMEPLAY_STYLES = ['story', 'action', 'relaxed'] as const;
export type GameplayStyle = (typeof GAMEPLAY_STYLES)[number];

export type GameEngine = 'arithmetic' | 'pattern' | 'word' | 'quiz' | 'code' | 'draw';

export type TeamId = 'pre_readers' | 'mid_age' | 'puzzlers';

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

const READING_RANK: Record<ReadingLevel, number> = {
  pre_reader: 0,
  early_reader: 1,
  independent_reader: 2,
};

export const TEAM_LABELS: Record<TeamId, string> = {
  pre_readers: 'Pre-readers Team',
  mid_age: 'Mid Age Team',
  puzzlers: 'Puzzlers Team',
};

/** Ages 4-6 -> Pre-readers Team, 7-9 -> Mid Age Team, 10-12 -> Puzzlers Team. */
export function resolveTeam(age: number): TeamId {
  if (age <= 6) return 'pre_readers';
  if (age <= 9) return 'mid_age';
  return 'puzzlers';
}

/** Highest content reading level a team can comfortably handle. */
function teamReadingCap(team: TeamId): number {
  switch (team) {
    case 'pre_readers':
      return READING_RANK.early_reader; // text-heavy (independent) games filtered out
    case 'mid_age':
      return READING_RANK.independent_reader;
    case 'puzzlers':
      return READING_RANK.independent_reader;
  }
}

/** Minimum difficulty a team should be offered. */
function teamMinDifficulty(team: TeamId): number {
  switch (team) {
    case 'pre_readers':
      return 1;
    case 'mid_age':
      return 1;
    case 'puzzlers':
      return 2; // advanced puzzles / coding / text-heavy emphasis
  }
}

export interface ChildProfileLike {
  age: number;
  readingLevel: ReadingLevel;
  learningGoals: LearningGoal[];
  gameplayStyle: GameplayStyle;
}

export interface FilterResult {
  team: TeamId;
  teamLabel: string;
  games: GameDefinition[];
  excluded: Array<{ id: string; reason: string }>;
}

/**
 * Filter + rank games for a child.
 *
 * Inclusion rules:
 *  1. age must fall inside [minAge, maxAge]
 *  2. game reading level <= child reading level (never show text above ability)
 *  3. game reading level <= team reading cap (4-6 exclude text-heavy games)
 *  4. difficulty >= team minimum (10-12 get advanced puzzles/coding emphasis)
 *
 * Ranking rules (stable sort, higher first):
 *  - matches primary learning goal > secondary goal > other goal
 *  - preferred gameplay style bonus
 *  - exact reading-level match bonus
 *  - age-window fit bonus
 */
export function filterGamesForChild(games: GameDefinition[], child: ChildProfileLike): FilterResult {
  const team = resolveTeam(child.age);
  const readingCap = Math.min(
    teamReadingCap(team),
    READING_RANK[child.readingLevel] ?? 0,
  );
  const minDifficulty = teamMinDifficulty(team);
  const excluded: Array<{ id: string; reason: string }> = [];
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

  const goals = child.learningGoals;
  const ranked = included
    .map((game) => ({ game, score: scoreGame(game, child, goals) }))
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

  if (game.goals.includes(primary)) score += 40;
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

export const GAMES: GameDefinition[] = [
  {
    id: 'number-ninja',
    title: 'Number Ninja',
    tagline: 'Slice through sums at lightning speed!',
    description:
      'A fast-paced arithmetic arcade where number blasts fly across the neon sky and the ninja chops the correct answers.',
    instructions: [
      'Read the sum at the top of the arena.',
      'Tap or click the correct answer before it zooms past.',
      'Each correct slice builds your combo score.',
      'A wrong slice costs one heart - you have 10 hearts!',
    ],
    goals: ['math'],
    readingLevel: 'pre_reader',
    minAge: 4,
    maxAge: 12,
    difficulty: 1,
    gameplayStyle: 'action',
    engine: 'arithmetic',
    accent: '#ff2fd6',
    icon: '🥷',
    totalLevels: 10,
    slides: [
      { title: 'Neon Arena', caption: 'Sums fly across a starry neon battlefield.' },
      { title: 'Combo Slash', caption: 'Chain correct answers to grow your combo.' },
      { title: 'Boss Round', caption: 'Tougher sums appear every third level.' },
      { title: 'High Score', caption: 'Beat your best score and climb the team board.' },
    ],
  },
  {
    id: 'fraction-forest',
    title: 'Fraction Forest',
    tagline: 'Share magical fruit to wake the forest.',
    description:
      'A story-led adventure where friendly forest creatures ask you to split pies, fruit and treasure into equal parts.',
    instructions: [
      'Listen or read what the forest friend needs.',
      'Choose the picture that shows the correct fraction.',
      'Finish all 10 levels to light up the whole forest.',
    ],
    goals: ['math', 'science'],
    readingLevel: 'early_reader',
    minAge: 7,
    maxAge: 12,
    difficulty: 2,
    gameplayStyle: 'story',
    engine: 'arithmetic',
    accent: '#39ff88',
    icon: '🥧',
    totalLevels: 10,
    slides: [
      { title: 'Meet Maple', caption: 'A hungry fox needs half of every pie.' },
      { title: 'Split It Up', caption: 'Pick the picture that shows the right fraction.' },
      { title: 'Forest Lights', caption: 'Each level you finish lights a lantern.' },
      { title: 'Golden Grove', caption: 'Complete every level to unlock the grove.' },
    ],
  },
  {
    id: 'pattern-peacock',
    title: 'Pattern Peacock',
    tagline: 'Spot the pattern, show the feathers!',
    description:
      'Colourful feather sequences appear on the peacock tail - choose what comes next to make the tail bloom.',
    instructions: [
      'Look at the sequence of feathers.',
      'Work out what comes next.',
      'Tap the feather that continues the pattern.',
    ],
    goals: ['math', 'coding'],
    readingLevel: 'pre_reader',
    minAge: 4,
    maxAge: 9,
    difficulty: 1,
    gameplayStyle: 'relaxed',
    engine: 'pattern',
    accent: '#00e5ff',
    icon: '🦚',
    totalLevels: 10,
    slides: [
      { title: 'Feather Parade', caption: 'Sequences bloom across the tail.' },
      { title: 'What Next?', caption: 'Choose the feather that continues the pattern.' },
      { title: 'Growing Tail', caption: 'Every right answer adds new feathers.' },
      { title: 'Full Fan', caption: 'Fill the whole tail to finish.' },
    ],
  },
  {
    id: 'word-wonders',
    title: 'Word Wonders',
    tagline: 'Fill the missing letters and free the words.',
    description:
      'Glowing words float by with missing letters. Tap the right letter tile to complete each word.',
    instructions: [
      'Look at the word with empty letter spaces.',
      'Choose the letter tile that completes it.',
      'Use the speaker button to hear the word.',
    ],
    goals: ['reading'],
    readingLevel: 'early_reader',
    minAge: 6,
    maxAge: 12,
    difficulty: 2,
    gameplayStyle: 'story',
    engine: 'word',
    accent: '#ffe600',
    icon: '✨',
    totalLevels: 10,
    slides: [
      { title: 'Floating Words', caption: 'Words drift in with missing letters.' },
      { title: 'Letter Tiles', caption: 'Tap the glowing tile that fits.' },
      { title: 'Hear It', caption: 'Every word can be read aloud.' },
      { title: 'Wonder Book', caption: 'Collect every word into your book.' },
    ],
  },
  {
    id: 'rhyme-time',
    title: 'Rhyme Time Rockets',
    tagline: 'Blast off with rhyming pairs!',
    description:
      'Pick the picture word that rhymes with the word at the launch pad and send the rocket sky-high.',
    instructions: [
      'Listen to the word on the launch pad.',
      'Choose the option that rhymes with it.',
      'Ten correct launches complete the mission.',
    ],
    goals: ['reading'],
    readingLevel: 'pre_reader',
    minAge: 4,
    maxAge: 8,
    difficulty: 1,
    gameplayStyle: 'action',
    engine: 'word',
    accent: '#ff6b00',
    icon: '🚀',
    totalLevels: 10,
    slides: [
      { title: 'Launch Pad', caption: 'A rhyming word lights up the pad.' },
      { title: 'Pick A Rhyme', caption: 'Tap the picture that rhymes.' },
      { title: 'Blast Off', caption: 'Correct rhymes send the rocket flying.' },
      { title: 'Moon Base', caption: 'Ten launches build your moon base.' },
    ],
  },
  {
    id: 'story-stitch',
    title: 'Story Stitch',
    tagline: 'Sew sentences into a shining story.',
    description:
      'Sentences from a tale are shuffled - arrange them in the right order to stitch the story back together.',
    instructions: [
      'Read each sentence card.',
      'Drag or tap them into the correct order.',
      'Finish the story to earn a star.',
    ],
    goals: ['reading', 'creativity'],
    readingLevel: 'independent_reader',
    minAge: 7,
    maxAge: 12,
    difficulty: 2,
    gameplayStyle: 'story',
    engine: 'word',
    accent: '#9d4dff',
    icon: '📖',
    totalLevels: 10,
    slides: [
      { title: 'Shuffled Pages', caption: 'Sentence cards tumble out of the book.' },
      { title: 'Order Up', caption: 'Place them in the order that makes sense.' },
      { title: 'Stitch Together', caption: 'Watch the story sew itself together.' },
      { title: 'Shining Tale', caption: 'Complete the tale to earn a star.' },
    ],
  },
  {
    id: 'science-station',
    title: 'Science Station',
    tagline: 'Run experiments in a neon lab.',
    description:
      'A friendly lab assistant poses real science questions - choose the right answer to power the machines.',
    instructions: [
      'Read or listen to the experiment question.',
      'Pick one of the three answers.',
      'Correct answers charge the neon batteries.',
    ],
    goals: ['science'],
    readingLevel: 'early_reader',
    minAge: 7,
    maxAge: 12,
    difficulty: 2,
    gameplayStyle: 'story',
    engine: 'quiz',
    accent: '#00ffcc',
    icon: '🔬',
    totalLevels: 10,
    slides: [
      { title: 'The Lab', caption: 'Neon machines hum around the assistant.' },
      { title: 'Experiment Card', caption: 'Real science questions, read aloud.' },
      { title: 'Power Up', caption: 'Right answers charge the batteries.' },
      { title: 'Full Power', caption: 'Charge everything to complete the lab.' },
    ],
  },
  {
    id: 'space-safari',
    title: 'Space Safari',
    tagline: 'Zip between planets and meet the animals of space.',
    description:
      'An audio-first adventure through the solar system: listen to a clue and choose the matching planet or space fact.',
    instructions: [
      'Listen to the clue (tap the speaker to replay).',
      'Choose the matching picture.',
      'Visit all 10 stops on your safari map.',
    ],
    goals: ['science', 'reading'],
    readingLevel: 'pre_reader',
    minAge: 4,
    maxAge: 9,
    difficulty: 1,
    gameplayStyle: 'action',
    engine: 'quiz',
    accent: '#4d79ff',
    icon: '🪐',
    totalLevels: 10,
    slides: [
      { title: 'Blast Off', caption: 'The safari ship leaves the neon pad.' },
      { title: 'Planet Stop', caption: 'Listen to a clue about the planet.' },
      { title: 'Pick The Match', caption: 'Tap the picture that fits the clue.' },
      { title: 'Safari Map', caption: 'Every stop stamps your map.' },
    ],
  },
  {
    id: 'color-castle',
    title: 'Colour Castle',
    tagline: 'Paint a neon castle, your way.',
    description:
      'A relaxed creative canvas: paint glowing shapes onto the castle, then show your masterpiece to the kingdom.',
    instructions: [
      'Choose a neon colour from the palette.',
      'Paint inside (or outside!) the lines however you like.',
      'Press Finish when your artwork is done to save it as a level.',
    ],
    goals: ['creativity'],
    readingLevel: 'pre_reader',
    minAge: 4,
    maxAge: 12,
    difficulty: 1,
    gameplayStyle: 'relaxed',
    engine: 'draw',
    accent: '#ff4dd2',
    icon: '🎨',
    totalLevels: 10,
    slides: [
      { title: 'Blank Castle', caption: 'A grey castle waiting for colour.' },
      { title: 'Neon Palette', caption: 'Eight glowing colours to play with.' },
      { title: 'Free Paint', caption: 'No rules - paint anywhere you like.' },
      { title: 'Gallery Wall', caption: 'Finished art joins the royal gallery.' },
    ],
  },
  {
    id: 'doodle-dash',
    title: 'Doodle Dash',
    tagline: 'Draw the shape before the clock runs out!',
    description:
      'A speedy sketching game: a shape pops up and you doodle it in neon before the timer bar empties.',
    instructions: [
      'Look at the shape on the card.',
      'Draw it on the canvas with your chosen colour.',
      'Finish before the timer bar empties to score big.',
    ],
    goals: ['creativity', 'coding'],
    readingLevel: 'pre_reader',
    minAge: 5,
    maxAge: 10,
    difficulty: 2,
    gameplayStyle: 'action',
    engine: 'draw',
    accent: '#c6ff00',
    icon: '✏️',
    totalLevels: 10,
    slides: [
      { title: 'Shape Card', caption: 'A glowing shape appears.' },
      { title: 'Dash Draw', caption: 'Sketch it fast in neon ink.' },
      { title: 'Timer Bar', caption: 'Beat the clock for bonus points.' },
      { title: 'Doodle Wall', caption: 'Every dash lands on the wall.' },
    ],
  },
  {
    id: 'code-crayon',
    title: 'Code Crayon',
    tagline: 'Draw a path the robot can follow.',
    description:
      'Give simple step-by-step instructions - up, down, left, right - and the robot crayon follows your code to the star.',
    instructions: [
      'Look at where the robot starts and where the star is.',
      'Tap arrow tiles to build your instruction list.',
      'Press Run to watch the robot follow your code.',
    ],
    goals: ['coding', 'math'],
    readingLevel: 'early_reader',
    minAge: 7,
    maxAge: 12,
    difficulty: 2,
    gameplayStyle: 'relaxed',
    engine: 'code',
    accent: '#ff9500',
    icon: '🤖',
    totalLevels: 10,
    slides: [
      { title: 'Grid Start', caption: 'Robot and star appear on the grid.' },
      { title: 'Arrow Tiles', caption: 'Build a chain of direction commands.' },
      { title: 'Run It', caption: 'Watch the robot follow your code.' },
      { title: 'Star Reached', caption: 'Collect the star to complete the level.' },
    ],
  },
  {
    id: 'robot-route',
    title: 'Robot Route',
    tagline: 'Plan the cleverest route through the maze.',
    description:
      'Advanced grid puzzles: sequence turns, loops of movement and obstacle avoidance to guide the rover home.',
    instructions: [
      'Study the maze and the obstacles.',
      'Build a command sequence with arrows.',
      'Shorter, correct sequences earn higher scores.',
    ],
    goals: ['coding', 'math'],
    readingLevel: 'independent_reader',
    minAge: 10,
    maxAge: 12,
    difficulty: 3,
    gameplayStyle: 'story',
    engine: 'code',
    accent: '#ff1744',
    icon: '🛰️',
    totalLevels: 10,
    slides: [
      { title: 'Maze Map', caption: 'Walls and obstacles glow on the grid.' },
      { title: 'Sequence Builder', caption: 'Order your commands carefully.' },
      { title: 'Rover Launch', caption: 'The rover follows your plan step by step.' },
      { title: 'Home Base', caption: 'Shorter correct routes score higher.' },
    ],
  },
  {
    id: 'logic-lantern',
    title: 'Logic Lanterns',
    tagline: 'Switch the lights on with pure logic.',
    description:
      'Grid-based logic puzzles: work out which lantern to switch next using clues and deduction.',
    instructions: [
      'Read the clue for the level.',
      'Tap the lantern you think the clue points to.',
      'Solve all clues to light the festival.',
    ],
    goals: ['coding', 'math'],
    readingLevel: 'early_reader',
    minAge: 7,
    maxAge: 12,
    difficulty: 3,
    gameplayStyle: 'relaxed',
    engine: 'pattern',
    accent: '#ffd600',
    icon: '🏮',
    totalLevels: 10,
    slides: [
      { title: 'Dark Festival', caption: 'The lantern street waits for light.' },
      { title: 'Clue Card', caption: 'One clue points to the right lantern.' },
      { title: 'Switch On', caption: 'Tap to light it up with a neon burst.' },
      { title: 'Full Street', caption: 'Light them all to finish the festival.' },
    ],
  },
];

export function getGameById(id: string): GameDefinition | undefined {
  return GAMES.find((g) => g.id === id);
}

export const GOAL_LABELS: Record<LearningGoal, string> = {
  math: 'Mathematics & Logic',
  reading: 'Reading & Literacy',
  science: 'Science & Exploration',
  creativity: 'Creativity & Art',
  coding: 'Critical Thinking & Coding',
};

export interface GameSection<T extends GameDefinition = GameDefinition> {
  goal: LearningGoal;
  label: string;
  games: T[];
}

/**
 * Group games into learning-goal sections for the dashboard.
 *
 * Sections are ordered by the child's selected goals first (primary goal
 * before secondary), then every remaining goal in canonical order, so the
 * top-selected learning goals always appear first. Each game is placed in
 * the FIRST section whose goal it matches - no duplicates.
 */
export function groupGamesByGoal<T extends GameDefinition>(
  games: T[],
  learningGoals: LearningGoal[],
): GameSection<T>[] {
  const orderedGoals: LearningGoal[] = [
    ...learningGoals.filter((g) => LEARNING_GOALS.includes(g)),
    ...LEARNING_GOALS.filter((g) => !learningGoals.includes(g)),
  ];

  const assigned = new Set<string>();
  const sections: GameSection<T>[] = [];

  for (const goal of orderedGoals) {
    const sectionGames = games.filter(
      (game) => !assigned.has(game.id) && game.goals.includes(goal),
    );
    if (sectionGames.length === 0) continue;
    for (const game of sectionGames) assigned.add(game.id);
    sections.push({ goal, label: GOAL_LABELS[goal], games: sectionGames });
  }

  // Safety net: never drop a game that has no recognised goal.
  const leftovers = games.filter((game) => !assigned.has(game.id));
  if (leftovers.length > 0) {
    sections.push({ goal: 'math', label: 'More Games', games: leftovers });
  }

  return sections;
}
