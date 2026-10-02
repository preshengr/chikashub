import { describe, expect, it } from 'vitest';
import fallbackCatalog from '../src/core/catalog-fallback.json';
import { buildQuestions, executeMoves, type Question } from '../src/game/questions';
import type { GameDefinition } from '../src/core/types';

const games = fallbackCatalog as GameDefinition[];

function gameById(id: string): GameDefinition {
  const game = games.find((candidate) => candidate.id === id);
  if (!game) throw new Error(`Missing game ${id}`);
  return game;
}

function movesOf(text: string): Array<'U' | 'D' | 'L' | 'R'> {
  return text.split(' ').filter(Boolean) as Array<'U' | 'D' | 'L' | 'R'>;
}

function gridOf(question: Question): {
  start: { x: number; y: number };
  target: { x: number; y: number };
} {
  if (!question.visual) throw new Error('grid question needs visual data');
  return JSON.parse(question.visual) as { start: { x: number; y: number }; target: { x: number; y: number } };
}

describe('buildQuestions', () => {
  it('produces a full level set for every engine', () => {
    const engineGames = ['number-ninja', 'pattern-peacock', 'word-wonders', 'science-station', 'code-crayon', 'doodle-dash'];
    for (const id of engineGames) {
      const game = gameById(id);
      const questions = buildQuestions(game, { age: 8, readingLevel: 'early_reader' }, game.totalLevels);
      expect(questions).toHaveLength(game.totalLevels);
      expect(questions.every((question) => question.prompt.length > 0)).toBe(true);
    }
  });

  it('always answers correctly with unique choices', () => {
    for (const game of games.slice(0, 8)) {
      const questions = buildQuestions(game, { age: 9, readingLevel: 'early_reader' }, game.totalLevels);
      for (const question of questions) {
        expect(question.choices.length).toBeGreaterThanOrEqual(2);
        expect(question.choices.length).toBeLessThanOrEqual(4);
        expect(new Set(question.choices).size).toBe(question.choices.length);
        expect(question.answerIndex).toBeGreaterThanOrEqual(0);
        expect(question.answerIndex).toBeLessThan(question.choices.length);
        expect(question.choices[question.answerIndex]).toBeTruthy();
      }
    }
  });

  it('scales arithmetic difficulty with age', () => {
    const game = gameById('number-ninja');
    const easy = buildQuestions(game, { age: 5, readingLevel: 'pre_reader' }, 10);
    const hard = buildQuestions(game, { age: 11, readingLevel: 'independent_reader' }, 10);
    const maxOperand = (questions: Question[]): number =>
      Math.max(
        ...questions.map((question) =>
          Math.max(...(question.prompt.match(/\d+/g) ?? ['0']).map(Number)),
        ),
      );
    expect(maxOperand(easy)).toBeLessThan(maxOperand(hard));
  });

  it('keeps code puzzles solvable and the distractors wrong', () => {
    const game = gameById('code-crayon');
    const questions = buildQuestions(game, { age: 10, readingLevel: 'independent_reader' }, 10);
    for (const question of questions) {
      expect(question.kind).toBe('grid');
      const { start, target } = gridOf(question);
      const answer = question.choices[question.answerIndex];
      expect(executeMoves(start, movesOf(answer))).toEqual(target);
      for (const distractor of question.choices.filter((_, index) => index !== question.answerIndex)) {
        expect(executeMoves(start, movesOf(distractor))).not.toEqual(target);
      }
    }
  });

  it('offers a single "Done!" choice for drawing games', () => {
    const game = gameById('doodle-dash');
    const questions = buildQuestions(game, { age: 6, readingLevel: 'pre_reader' }, 4);
    for (const question of questions) {
      expect(question.kind).toBe('draw');
      expect(question.choices).toEqual(['Done!']);
      expect(question.answerIndex).toBe(0);
    }
  });
});
