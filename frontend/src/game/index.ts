import '../styles/game.css';
import type { GameDefinition, GameEventType } from '../core/types';
import { escapeHtml } from '../core/dom';
import { createStarfield, type StarfieldHandle } from '../core/starfield';
import {
  recordCompletion,
  recordFailure,
  recordLevelComplete,
  recordStart,
} from '../core/storage';
import { buildQuestions, type Question } from './questions';

export interface GameEventRecord {
  type: GameEventType;
  gameId: string;
  level: number;
  score: number;
  maxLevel: number;
}

export interface GameSessionOptions {
  container: HTMLElement;
  game: GameDefinition;
  child: { firstName: string; age: number; readingLevel: string; learningGoals: string[] };
  username: string;
  onEvent: (record: GameEventRecord) => void;
  onExit: () => void;
}

export interface GameSession {
  destroy(): void;
}

const CORRECT_POINTS = 10;
const COMBO_BONUS = 5;
const COMBO_EVERY = 3;
const MAX_HEARTS = 10;

export function startGame(options: GameSessionOptions): GameSession {
  const { container, game, child, username, onEvent, onExit } = options;
  const totalLevels = game.totalLevels;
  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;

  let questions = buildQuestions(game, child, totalLevels);
  let level = 0;
  let score = 0;
  let hearts = MAX_HEARTS;
  let combo = 0;
  let maxLevel = 0;
  let finished = false;
  let speechEnabled =
    canSpeak && (child.readingLevel === 'pre_reader' || child.readingLevel === 'early_reader');
  let strokes = 0;
  const timers = new Set<number>();
  let starfield: StarfieldHandle | null = null;
  let release: Array<() => void> = [];

  container.innerHTML = `
    <div class="game" style="--game-accent:${escapeHtml(game.accent)}">
      <canvas class="game-stars" aria-hidden="true"></canvas>
      <div class="game__frame">
        <header class="game__hud">
          <button type="button" class="btn btn--ghost btn--small" data-game="exit">← Back to Dashboard</button>
          <div class="game__identity">
            <span class="game__icon" aria-hidden="true">${game.icon}</span>
            <div>
              <p class="game__title">${escapeHtml(game.title)}</p>
              <p class="game__player">${escapeHtml(child.firstName)}</p>
            </div>
          </div>
          <div class="game__stats">
            <span class="game__hearts" data-game="hearts" role="img" aria-label="${MAX_HEARTS} hearts remaining"></span>
            <span class="game__score">Score <strong data-game="score">0</strong></span>
            <button type="button" class="game__speaker" data-game="speaker" aria-pressed="${speechEnabled}" title="Read the question aloud">${speechEnabled ? '🔊' : '🔇'}</button>
          </div>
        </header>

        <div class="game__progress-row">
          <span class="game__level" data-game="level-label">Level 1 / ${totalLevels}</span>
          <div class="progress game__progress" role="progressbar" aria-valuemin="0" aria-valuemax="${totalLevels}" aria-valuenow="1" aria-label="Level progress">
            <span class="progress__fill" data-game="progress-fill" style="width:10%"></span>
          </div>
        </div>

        <main class="game__stage">
          <p class="game__feedback" data-game="feedback" role="status" aria-live="polite"></p>
          <div class="game__prompt-wrap">
            <p class="game__prompt" data-game="prompt"></p>
            <div class="game__visual" data-game="visual"></div>
          </div>
          <div class="game__answers" data-game="answers"></div>
          <div class="game__drawpad" data-game="drawpad" hidden>
            <canvas class="game__canvas" data-game="canvas" width="560" height="360" aria-label="Drawing area"></canvas>
            <div class="game__tools">
              <div class="game__swatches" data-game="swatches" role="radiogroup" aria-label="Brush colour"></div>
              <button type="button" class="btn btn--ghost btn--small" data-game="clear-pad">Clear</button>
              <button type="button" class="btn btn--lime" data-game="finish-draw">Done!</button>
            </div>
          </div>
        </main>
      </div>

      <div class="game__overlay" data-game="gameover" hidden>
        <div class="game__overlay-card card">
          <h2>Game Over 💔</h2>
          <p>All ${MAX_HEARTS} hearts are gone — that happens to every champion!</p>
          <p class="game__overlay-score">Score: <strong data-game="final-score">0</strong></p>
          <div class="modal__actions">
            <button type="button" class="btn btn--primary" data-game="restart">Restart from Level 1</button>
            <button type="button" class="btn btn--ghost" data-game="exit-2">Back to Dashboard</button>
          </div>
        </div>
      </div>

      <div class="game__overlay" data-game="celebrate" hidden>
        <div class="game__overlay-card card">
          <span class="game__trophy" aria-hidden="true">🏆</span>
          <h2>You finished ${escapeHtml(game.title)}!</h2>
          <p data-game="celebrate-msg"></p>
          <div class="modal__actions">
            <button type="button" class="btn btn--lime" data-game="play-again">Play again</button>
            <button type="button" class="btn btn--ghost" data-game="exit-3">Back to Dashboard</button>
          </div>
        </div>
      </div>
    </div>`;

  const root = container.querySelector<HTMLElement>('.game');
  if (!root) throw new Error('Game mount failed');

  const el = <T extends HTMLElement = HTMLElement>(name: string): T => {
    const node = root.querySelector<T>(`[data-game="${name}"]`);
    if (!node) throw new Error(`Missing game node: ${name}`);
    return node;
  };

  const canvas = root.querySelector<HTMLCanvasElement>('.game-stars');
  if (canvas) starfield = createStarfield(canvas);

  const feedback = el('feedback');
  const promptNode = el('prompt');
  const visualNode = el('visual');
  const answersNode = el('answers');
  const drawpad = el('drawpad');
  const drawCanvas = el<HTMLCanvasElement>('canvas');
  const drawContext = drawCanvas.getContext('2d');

  const speak = (text: string): void => {
    if (!speechEnabled || !text) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      utterance.pitch = 1.1;
      window.speechSynthesis.speak(utterance);
    } catch {
      /* speech is a bonus, never a blocker */
    }
  };

  const renderHearts = (): void => {
    const node = el('hearts');
    node.innerHTML = Array.from(
      { length: MAX_HEARTS },
      (_, index) =>
        `<span class="${index < hearts ? 'heart heart--full' : 'heart heart--empty'}" aria-hidden="true">♥</span>`,
    ).join('');
    node.setAttribute('aria-label', `${hearts} of ${MAX_HEARTS} hearts remaining`);
  };

  const renderStats = (): void => {
    el('score').textContent = String(score);
    el('level-label').textContent = `Level ${Math.min(level + 1, totalLevels)} / ${totalLevels}`;
    const fill = el<HTMLElement>('progress-fill');
    fill.style.width = `${Math.round((Math.min(level + 1, totalLevels) / totalLevels) * 100)}%`;
    fill.parentElement?.setAttribute('aria-valuenow', String(Math.min(level + 1, totalLevels)));
  };

  const setFeedback = (message: string, tone: 'good' | 'bad' | 'info'): void => {
    feedback.textContent = message;
    feedback.dataset.tone = tone;
  };

  const schedule = (fn: () => void, delay: number): void => {
    const id = window.setTimeout(() => {
      timers.delete(id);
      fn();
    }, delay);
    timers.add(id);
  };

  const emit = (type: GameEventType, eventLevel: number): void => {
    onEvent({ type, gameId: game.id, level: eventLevel, score, maxLevel });
  };

  const shuffleChoices = (question: Question): Question => {
    const answerText = question.choices[question.answerIndex];
    const choices = [...question.choices];
    for (let i = choices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [choices[i], choices[j]] = [choices[j], choices[i]];
    }
    return { ...question, choices, answerIndex: choices.indexOf(answerText) };
  };

  const renderGrid = (question: Question): void => {
    if (!question.visual) return;
    const data = JSON.parse(question.visual) as {
      cols: number;
      rows: number;
      start: { x: number; y: number };
      target: { x: number; y: number };
    };
    const cells: string[] = [];
    for (let y = 0; y < data.rows; y++) {
      for (let x = 0; x < data.cols; x++) {
        const isStart = x === data.start.x && y === data.start.y;
        const isTarget = x === data.target.x && y === data.target.y;
        const classes = ['game__cell'];
        if (isTarget) classes.push('is-target');
        if (isStart) classes.push('is-start');
        cells.push(
          `<span class="${classes.join(' ')}">${isStart ? '⭐' : isTarget ? '🎯' : ''}</span>`,
        );
      }
    }
    visualNode.innerHTML = `<div class="game__grid" style="grid-template-columns:repeat(${data.cols},1fr)">${cells.join('')}</div>`;
  };

  const handleAnswer = (correct: boolean, button: HTMLElement | null): void => {
    if (finished) return;
    const attemptLevel = level + 1;
    const question = questions[level];

    if (correct) {
      combo += 1;
      const bonus = combo % COMBO_EVERY === 0 ? COMBO_BONUS : 0;
      score += CORRECT_POINTS + bonus;
      maxLevel = Math.max(maxLevel, attemptLevel);
      recordLevelComplete(username, game.id, attemptLevel, score);
      button?.classList.add('is-correct');
      visualNode.querySelector('.game__grid')?.classList.add('is-solved');
      setFeedback(
        bonus ? `Amazing! +${CORRECT_POINTS + bonus} points` : `Great job! +${CORRECT_POINTS} points`,
        'good',
      );
      speak(bonus ? `Amazing! ${CORRECT_POINTS + bonus} points` : 'Great job!');
      level += 1;
      renderStats();
      emit('level_complete', attemptLevel);

      if (level >= totalLevels) {
        finished = true;
        recordCompletion(username, game.id, score);
        emit('game_complete', attemptLevel);
        schedule(() => {
          el('celebrate-msg').textContent = `${child.firstName} scored ${score} points across ${totalLevels} levels!`;
          el('celebrate').hidden = false;
          el<HTMLButtonElement>('play-again').focus();
        }, 700);
        return;
      }

      schedule(renderLevel, 900);
      return;
    }

    if (question?.kind === 'draw') {
      setFeedback('Add a few more strokes first, then press Done!', 'info');
      return;
    }

    combo = 0;
    hearts -= 1;
    recordFailure(username, game.id);
    emit('failure', attemptLevel);
    button?.classList.add('is-wrong');
    const correctButton = [...answersNode.querySelectorAll<HTMLButtonElement>('.game__answer')].find(
      (node) => node.dataset.index === String(question?.answerIndex ?? -1),
    );
    correctButton?.classList.add('is-revealed');
    setFeedback(
      hearts > 0 ? `Not quite — ${hearts} heart${hearts === 1 ? '' : 's'} left. Try again!` : 'Out of hearts!',
      'bad',
    );
    speak(hearts > 0 ? 'Not quite. Try again!' : 'Out of hearts!');
    renderHearts();

    if (hearts <= 0) {
      finished = true;
      schedule(() => {
        el('final-score').textContent = String(score);
        el('gameover').hidden = false;
        el<HTMLButtonElement>('restart').focus();
      }, 900);
      return;
    }

    schedule(() => {
      const replacement = buildQuestions(game, child, level + 1)[level];
      if (replacement) questions[level] = shuffleChoices(replacement);
      renderLevel();
    }, 1200);
  };

  function renderLevel(): void {
    if (finished) return;
    const question = questions[level] ?? questions[questions.length - 1];
    if (!question) return;

    drawpad.hidden = question.kind !== 'draw';
    answersNode.hidden = question.kind === 'draw';
    visualNode.innerHTML = '';
    visualNode.querySelector('.game__grid')?.classList.remove('is-solved');
    promptNode.textContent = question.prompt;
    renderStats();
    setFeedback(
      question.kind === 'draw' ? 'Take your time and draw!' : 'Pick the right answer.',
      'info',
    );
    speak(question.speak ?? question.prompt);

    if (question.kind === 'grid') renderGrid(question);

    if (question.kind === 'draw') {
      if (drawContext) drawContext.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
      strokes = 0;
      return;
    }

    answersNode.innerHTML = question.choices
      .map(
        (choice, index) =>
          `<button type="button" class="game__answer" data-index="${index}">${escapeHtml(choice)}</button>`,
      )
      .join('');

    answersNode.querySelectorAll<HTMLButtonElement>('.game__answer').forEach((button) => {
      const handler = (): void => handleAnswer(Number(button.dataset.index) === question.answerIndex, button);
      button.addEventListener('click', handler);
      release.push(() => button.removeEventListener('click', handler));
    });
  }

  const exit = (): void => {
    destroySession();
    onExit();
  };

  const wire = (name: string, handler: () => void): void => {
    const node = el(name);
    node.addEventListener('click', handler);
    release.push(() => node.removeEventListener('click', handler));
  };

  wire('exit', exit);
  wire('exit-2', exit);
  wire('exit-3', exit);
  wire('restart', () => resetSession());
  wire('play-again', () => resetSession());

  wire('speaker', () => {
    speechEnabled = !speechEnabled;
    const button = el('speaker');
    button.textContent = speechEnabled ? '🔊' : '🔇';
    button.setAttribute('aria-pressed', String(speechEnabled));
    if (!speechEnabled) {
      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* ignore */
      }
    }
  });

  /* ---------- drawing pad (wired once) ---------- */

  const colours = ['#ff2fd6', '#22e6ff', '#39ff88', '#ffe93c', '#8b5cff', '#ffffff'];
  let colour = colours[0];
  let drawing = false;
  let lastPoint: { x: number; y: number } | null = null;

  if (drawContext) {
    drawContext.lineWidth = 8;
    drawContext.lineCap = 'round';
    drawContext.lineJoin = 'round';
  }

  const swatches = el('swatches');
  swatches.innerHTML = colours
    .map(
      (value, index) =>
        `<button type="button" class="game__swatch${index === 0 ? ' is-active' : ''}" style="--swatch:${value}" data-colour="${value}" aria-label="Colour ${index + 1}" aria-pressed="${index === 0}"></button>`,
    )
    .join('');

  swatches.querySelectorAll<HTMLButtonElement>('.game__swatch').forEach((button) => {
    const handler = (): void => {
      colour = button.dataset.colour ?? colours[0];
      swatches.querySelectorAll('.game__swatch').forEach((node) => {
        node.classList.toggle('is-active', node === button);
        node.setAttribute('aria-pressed', String(node === button));
      });
    };
    button.addEventListener('click', handler);
    release.push(() => button.removeEventListener('click', handler));
  });

  const canvasPoint = (event: PointerEvent): { x: number; y: number } => {
    const rect = drawCanvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * drawCanvas.width,
      y: ((event.clientY - rect.top) / rect.height) * drawCanvas.height,
    };
  };

  const onPointerDown = (event: PointerEvent): void => {
    drawing = true;
    lastPoint = canvasPoint(event);
    drawCanvas.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent): void => {
    if (!drawing || !lastPoint || !drawContext) return;
    const next = canvasPoint(event);
    drawContext.strokeStyle = colour;
    drawContext.beginPath();
    drawContext.moveTo(lastPoint.x, lastPoint.y);
    drawContext.lineTo(next.x, next.y);
    drawContext.stroke();
    lastPoint = next;
  };
  const onPointerUp = (): void => {
    if (drawing) strokes += 1;
    drawing = false;
    lastPoint = null;
  };

  drawCanvas.addEventListener('pointerdown', onPointerDown);
  drawCanvas.addEventListener('pointermove', onPointerMove);
  drawCanvas.addEventListener('pointerup', onPointerUp);
  drawCanvas.addEventListener('pointerleave', onPointerUp);
  release.push(() => {
    drawCanvas.removeEventListener('pointerdown', onPointerDown);
    drawCanvas.removeEventListener('pointermove', onPointerMove);
    drawCanvas.removeEventListener('pointerup', onPointerUp);
    drawCanvas.removeEventListener('pointerleave', onPointerUp);
  });

  wire('clear-pad', () => {
    drawContext?.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    strokes = 0;
  });

  wire('finish-draw', () => handleAnswer(strokes >= 3, el('finish-draw')));

  /* ---------- session lifecycle ---------- */

  function resetSession(): void {
    level = 0;
    score = 0;
    hearts = MAX_HEARTS;
    combo = 0;
    maxLevel = 0;
    finished = false;
    questions = buildQuestions(game, child, totalLevels);
    el('gameover').hidden = true;
    el('celebrate').hidden = true;
    renderHearts();
    renderStats();
    emit('start', 1);
    renderLevel();
  }

  function destroySession(): void {
    timers.forEach((id) => window.clearTimeout(id));
    timers.clear();
    release.forEach((fn) => fn());
    release = [];
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
    starfield?.destroy();
    starfield = null;
    container.innerHTML = '';
  }

  renderHearts();
  renderStats();
  recordStart(username, game.id);
  emit('start', 1);
  renderLevel();
  el<HTMLButtonElement>('exit').focus();

  return { destroy: destroySession };
}
