import type { GameDefinition } from '../core/types';

export interface Question {
  prompt: string;
  speak?: string;
  choices: string[];
  answerIndex: number;
  visual?: string;
  kind?: 'choice' | 'grid' | 'draw';
}

const SHAPES = ['🔴', '🔵', '🟣', '🟢', '🟡', '🟠'];
const GRID_COLS = 5;
const GRID_ROWS = 4;
type Move = 'U' | 'D' | 'L' | 'R';

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildChoice(prompt: string, answer: string, distractors: string[], extra: Partial<Question> = {}): Question {
  const unique = [...new Set(distractors.filter((value) => value !== answer))];
  const fallbacks = ['7', '12', '18'].filter((value) => value !== answer);
  while (unique.length < 2) unique.push(fallbacks[unique.length] ?? `x${unique.length}`);
  const choices = shuffle([answer, ...unique.slice(0, 3)]);
  return {
    prompt,
    choices,
    answerIndex: choices.indexOf(answer),
    ...extra,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/* ------------------------------ arithmetic ------------------------------ */

function arithmeticQuestion(game: GameDefinition, age: number, level: number): Question {
  if (game.id === 'fraction-forest') {
    const denominator = [2, 4][level % 2];
    const a = 1 + (level % (denominator - 1 || 1));
    const b = 1 + ((level * 2) % (denominator - 1 || 1));
    const total = a + b;
    const answer = `${total}/${denominator}`;
    const wrongTotals = [total - 1, total + 1, clamp(total + 2, 1, denominator * 2)];
    const distractors = wrongTotals
      .filter((value) => value !== total)
      .map((value) => `${clamp(value, 1, denominator * 2)}/${denominator}`);
    return buildChoice(`What is ${a}/${denominator} + ${b}/${denominator}?`, answer, distractors, {
      speak: `${a} over ${denominator} plus ${b} over ${denominator}`,
    });
  }

  if (age <= 6) {
    const max = clamp(3 + level, 3, 9);
    const a = 1 + Math.floor(Math.random() * max);
    const b = 1 + Math.floor(Math.random() * max);
    const subtract = level % 3 === 2 && a >= b;
    const answer = String(subtract ? a - b : a + b);
    const distractors = [
      String((subtract ? a - b : a + b) + 1),
      String(Math.abs((subtract ? a - b : a + b) - 2)),
      String(a + b + (subtract ? 1 : 2)),
    ];
    return buildChoice(`${a} ${subtract ? '−' : '+'} ${b} = ?`, answer, distractors, {
      speak: `${a} ${subtract ? 'minus' : 'plus'} ${b}`,
    });
  }

  if (age <= 9) {
    const max = clamp(8 + level * 5, 8, 50);
    const a = 2 + Math.floor(Math.random() * max);
    const b = 2 + Math.floor(Math.random() * Math.min(max, 25));
    const subtract = level % 2 === 1;
    const first = subtract ? Math.max(a, b) : a;
    const second = subtract ? Math.min(a, b) : b;
    const value = subtract ? first - second : first + second;
    const answer = String(value);
    const distractors = [value + 1, value - 1, value + 10].map(String);
    return buildChoice(`${first} ${subtract ? '−' : '+'} ${second} = ?`, answer, distractors, {
      speak: `${first} ${subtract ? 'minus' : 'plus'} ${second}`,
    });
  }

  const max = clamp(25 + level * 8, 25, 99);
  const a = 12 + Math.floor(Math.random() * max);
  const b = 6 + Math.floor(Math.random() * Math.min(max, 40));
  const subtract = level % 3 === 0;
  const first = subtract ? Math.max(a, b) : a;
  const second = subtract ? Math.min(a, b) : b;
  const value = subtract ? first - second : first + second;
  const answer = String(value);
  const distractors = [value + 1, value - 10, value + 9].map(String);
  return buildChoice(`${first} ${subtract ? '−' : '+'} ${second} = ?`, answer, distractors, {
    speak: `${first} ${subtract ? 'minus' : 'plus'} ${second}`,
  });
}

/* -------------------------------- pattern ------------------------------- */

function patternQuestion(level: number): Question {
  const patternLength = 2 + (level % 3);
  const pool = shuffle(SHAPES).slice(0, Math.min(4, Math.max(patternLength, 3)));
  const pattern = pool.slice(0, patternLength);
  const sequence: string[] = [];
  const turns = 4 + (level % 3);
  for (let i = 0; i < turns; i++) sequence.push(pattern[i % pattern.length]);
  const answer = pattern[sequence.length % pattern.length];
  const distractors = shuffle(SHAPES.filter((shape) => shape !== answer)).slice(0, 3);
  return buildChoice(`What comes next? ${sequence.join(' ')} ❓`, answer, distractors, {
    speak: 'What shape comes next in the pattern?',
  });
}

/* --------------------------------- word --------------------------------- */

interface WordPuzzle {
  word: string;
  missingIndex: number;
}

const SIMPLE_WORDS: WordPuzzle[] = [
  { word: 'SUN', missingIndex: 1 },
  { word: 'CAT', missingIndex: 1 },
  { word: 'DOG', missingIndex: 2 },
  { word: 'BED', missingIndex: 1 },
  { word: 'MAP', missingIndex: 2 },
  { word: 'FISH', missingIndex: 1 },
  { word: 'BIRD', missingIndex: 2 },
  { word: 'STAR', missingIndex: 3 },
  { word: 'MOON', missingIndex: 1 },
  { word: 'TREE', missingIndex: 3 },
];

const START_WORDS: Array<{ word: string; letter: string }> = [
  { word: 'BALL', letter: 'B' },
  { word: 'FROG', letter: 'F' },
  { word: 'KITE', letter: 'K' },
  { word: 'RAIN', letter: 'R' },
  { word: 'SHIP', letter: 'S' },
  { word: 'LION', letter: 'L' },
];

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function wordQuestion(child: { age: number; readingLevel: string }, level: number): Question {
  if (child.readingLevel === 'pre_reader') {
    const entry = START_WORDS[level % START_WORDS.length];
    const answer = entry.word;
    const others = shuffle(START_WORDS.filter((candidate) => candidate.word !== answer))
      .slice(0, 3)
      .map((candidate) => candidate.word);
    return buildChoice(
      `Which word starts with the letter ${entry.letter}?`,
      answer,
      others,
      { speak: `Which word starts with the letter ${entry.letter}?` },
    );
  }

  const puzzle = SIMPLE_WORDS[(level + (child.age ?? 7)) % SIMPLE_WORDS.length];
  const masked = [...puzzle.word].map((letter, index) => (index === puzzle.missingIndex ? '_' : letter)).join(' ');
  const answer = puzzle.word[puzzle.missingIndex];
  const wrong = shuffle(
    [...LETTERS].filter((letter) => letter !== answer),
  ).slice(0, 3);
  return buildChoice(`Which letter is missing? ${masked}`, answer, wrong, {
    speak: `Which letter is missing in the word ${puzzle.word.split('').join(' ')}`,
  });
}

/* --------------------------------- quiz --------------------------------- */

interface Fact {
  question: string;
  correct: string;
  wrong: string[];
}

const FACTS: Fact[] = [
  { question: 'Which planet do we live on?', correct: 'Earth', wrong: ['Mars', 'Venus', 'Saturn'] },
  { question: 'What do plants need to grow?', correct: 'Sunlight', wrong: ['Chocolate', 'Sand', 'Socks'] },
  { question: 'How many legs does a spider have?', correct: '8', wrong: ['6', '10', '4'] },
  { question: 'What is the closest star to Earth?', correct: 'The Sun', wrong: ['Sirius', 'Polaris', 'The Moon'] },
  { question: 'Which animal is a mammal?', correct: 'Dolphin', wrong: ['Shark', 'Tuna', 'Octopus'] },
  { question: 'What gas do we breathe in to live?', correct: 'Oxygen', wrong: ['Helium', 'Smoke', 'Steam'] },
  { question: 'How many days are in a week?', correct: '7', wrong: ['5', '6', '10'] },
  { question: 'What color do you get mixing blue and yellow?', correct: 'Green', wrong: ['Purple', 'Orange', 'Brown'] },
  { question: 'Which part of your body helps you hear?', correct: 'Ears', wrong: ['Knees', 'Elbows', 'Toes'] },
  { question: 'What do bees make?', correct: 'Honey', wrong: ['Milk', 'Jam', 'Bread'] },
  { question: 'How many wheels does a tricycle have?', correct: '3', wrong: ['2', '4', '5'] },
  { question: 'Which season is the coldest?', correct: 'Winter', wrong: ['Summer', 'Spring', 'Autumn'] },
  { question: 'What shape has three sides?', correct: 'Triangle', wrong: ['Square', 'Circle', 'Hexagon'] },
  { question: 'Where do penguins live?', correct: 'Antarctica', wrong: ['Jungle', 'Desert', 'Moon'] },
  { question: 'What is H₂O commonly called?', correct: 'Water', wrong: ['Salt', 'Sugar', 'Air'] },
  { question: 'How many minutes are in an hour?', correct: '60', wrong: ['100', '30', '120'] },
  { question: 'Which sense uses your nose?', correct: 'Smell', wrong: ['Taste', 'Touch', 'Sight'] },
  { question: 'What do caterpillars turn into?', correct: 'Butterflies', wrong: ['Frogs', 'Birds', 'Fish'] },
  { question: 'How many zeros are in one hundred?', correct: '2', wrong: ['1', '3', '4'] },
  { question: 'Which tool measures how hot something is?', correct: 'Thermometer', wrong: ['Ruler', 'Compass', 'Microscope'] },
  { question: 'What is the largest land animal?', correct: 'Elephant', wrong: ['Giraffe', 'Lion', 'Hippo'] },
  { question: 'How many colors are in a rainbow?', correct: '7', wrong: ['5', '6', '9'] },
  { question: 'Which animal lays eggs in water?', correct: 'Frog', wrong: ['Cat', 'Dog', 'Cow'] },
  { question: 'What comes after the number 19?', correct: '20', wrong: ['18', '21', '90'] },
  { question: 'Which instrument has keys and strings?', correct: 'Piano', wrong: ['Drum', 'Flute', 'Trumpet'] },
];

function quizQuestion(level: number): Question {
  const fact = FACTS[level % FACTS.length];
  return buildChoice(fact.question, fact.correct, fact.wrong, { speak: fact.question });
}

/* --------------------------------- code --------------------------------- */

function executeMoves(start: { x: number; y: number }, moves: Move[]): { x: number; y: number } {
  let { x, y } = start;
  for (const move of moves) {
    if (move === 'R') x = clamp(x + 1, 0, GRID_COLS - 1);
    if (move === 'L') x = clamp(x - 1, 0, GRID_COLS - 1);
    if (move === 'D') y = clamp(y + 1, 0, GRID_ROWS - 1);
    if (move === 'U') y = clamp(y - 1, 0, GRID_ROWS - 1);
  }
  return { x, y };
}

function movesDiffer(a: Move[], b: Move[]): boolean {
  if (a.length !== b.length) return true;
  return a.some((move, index) => move !== b[index]);
}

function codeQuestion(level: number): Question {
  const start = { x: 0, y: 0 };
  const pathLength = clamp(3 + (level % 4), 3, 6);
  const target = { x: 0, y: 0 };
  const correct: Move[] = [];
  for (let i = 0; i < pathLength; i++) {
    const preferRight = target.x < GRID_COLS - 1 && (i % 2 === 0 || target.y >= GRID_ROWS - 1);
    if (preferRight) {
      correct.push('R');
      target.x = clamp(target.x + 1, 0, GRID_COLS - 1);
    } else if (target.y < GRID_ROWS - 1) {
      correct.push('D');
      target.y = clamp(target.y + 1, 0, GRID_ROWS - 1);
    } else {
      correct.push('R');
      target.x = clamp(target.x + 1, 0, GRID_COLS - 1);
    }
  }

  const answer = correct.join(' ');
  const distractorPool: Move[] = ['U', 'D', 'L', 'R'];
  const distractors: string[] = [];
  let guard = 0;
  while (distractors.length < 3 && guard < 60) {
    guard += 1;
    const variant = [...correct];
    const position = Math.floor(Math.random() * variant.length);
    const replacement = shuffle(distractorPool.filter((move) => move !== variant[position]))[0];
    variant[position] = replacement;
    const asText = variant.join(' ');
    if (asText === answer || distractors.includes(asText)) continue;
    if (!movesDiffer(variant, correct)) continue;
    const landing = executeMoves(start, variant);
    if (landing.x === target.x && landing.y === target.y) continue;
    distractors.push(asText);
  }
  const rotations: Move[][] = [
    ['L', 'U', 'R', 'D'],
    ['U', 'L', 'D', 'R'],
    ['D', 'R', 'U', 'L'],
    ['R', 'D', 'L', 'U'],
  ];
  let rotationIndex = 0;
  while (distractors.length < 3 && rotationIndex < rotations.length) {
    const rotation = rotations[rotationIndex];
    rotationIndex += 1;
    const filler = Array.from({ length: correct.length }, (_, i) => rotation[i % rotation.length]).join(' ');
    const landing = executeMoves(
      start,
      filler.split(' ') as Move[],
    );
    if (filler === answer || distractors.includes(filler)) continue;
    if (landing.x === target.x && landing.y === target.y) continue;
    distractors.push(filler);
  }

  return buildChoice(
    `Robot starts at ⭐ and must reach 🎯. Which command list works?`,
    answer,
    distractors,
    {
      kind: 'grid',
      speak: 'Choose the command list that moves the robot to the target',
      visual: JSON.stringify({
        cols: GRID_COLS,
        rows: GRID_ROWS,
        start: { x: start.x, y: start.y },
        target,
        path: correct,
      }),
    },
  );
}

/* --------------------------------- draw --------------------------------- */

const DRAW_TOPICS = [
  'a bright star',
  'a happy house',
  'a smiling sun',
  'a friendly robot',
  'a big red apple',
  'a butterfly',
  'a rainbow',
  'a rocket ship',
];

function drawQuestion(level: number): Question {
  const topic = DRAW_TOPICS[level % DRAW_TOPICS.length];
  return {
    prompt: `Draw ${topic}!`,
    speak: `Draw ${topic}`,
    choices: ['Done!'],
    answerIndex: 0,
    kind: 'draw',
  };
}

/* --------------------------------- main --------------------------------- */

export function buildQuestions(
  game: GameDefinition,
  child: { age: number; readingLevel: string },
  totalLevels: number,
): Question[] {
  const questions: Question[] = [];
  for (let level = 0; level < totalLevels; level++) {
    switch (game.engine) {
      case 'arithmetic':
        questions.push(arithmeticQuestion(game, child.age, level));
        break;
      case 'pattern':
        questions.push(patternQuestion(level));
        break;
      case 'word':
        questions.push(wordQuestion(child, level));
        break;
      case 'quiz':
        questions.push(quizQuestion(level));
        break;
      case 'code':
        questions.push(codeQuestion(level));
        break;
      case 'draw':
        questions.push(drawQuestion(level));
        break;
      default:
        questions.push(quizQuestion(level));
    }
  }
  return questions;
}

export const GRID_SIZE = { cols: GRID_COLS, rows: GRID_ROWS };

export { executeMoves };
