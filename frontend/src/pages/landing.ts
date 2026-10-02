import '../styles/base.css';
import '../styles/landing.css';
import { fetchCatalog, localCatalog } from '../core/catalog';
import { escapeHtml, qs, qsa, on } from '../core/dom';
import { createModal } from '../core/modal';
import { createSlides, type SlidesController } from '../core/slides';
import { showToast } from '../core/toast';
import type { GameDefinition } from '../core/types';
import { GOAL_LABELS } from '../core/types';

const SHOWCASE_INTERVAL_MS = 30_000;

interface SampleBuilders {
  [engine: string]: (game: GameDefinition) => string;
}

function hearts(): string {
  return `<span class="sample__hearts">♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥</span>`;
}

function hud(right: string): string {
  return `<div class="sample__hud"><span>${hearts()}</span><span>${right}</span></div>`;
}

const SAMPLE_BUILDERS: SampleBuilders = {
  arithmetic(game) {
    const bubbles = [3, 5, 8, 12]
      .map(
        (value, i) =>
          `<span class="sample-bubble${i === 2 ? ' is-correct' : ''}" style="left:${18 + i * 20}%;bottom:-70px;animation-delay:${i * 0.8}s">${value}</span>`,
      )
      .join('');
    return `${hud('Level 4 / 10')}<span class="sample-sum">7 + 5 = ?</span>${bubbles}`;
  },
  pattern(game) {
    const seq = ['🔴', '🔵', '🔴', '🔵'].map(
      (shape, i) => `<span class="sample-tile" style="animation-delay:${i * 0.2}s">${shape}</span>`,
    );
    return `${hud('Pattern Power')}<div class="sample-seq">${seq.join('')}<span class="sample-tile is-answer">?</span></div>`;
  },
  word(game) {
    const word = 'SUN';
    const letters = [...word]
      .map((letter, i) => `<span style="--i:${i}">${letter}</span>`)
      .join('');
    const masked = `<span class="sample-blank" style="--i:3">?</span>`;
    return `${hud('Sound It Out')}<div class="sample-word">${letters}${masked}</div>`;
  },
  quiz(game) {
    return `${hud('Question 6 / 10')}<div class="sample-question"><div class="sample-question__text">Which planet do we live on?</div><div class="sample-question__options"><span class="sample-option">Mars</span><span class="sample-option">Earth</span><span class="sample-option">Venus</span></div></div>`;
  },
  code(game) {
    const cells = Array.from({ length: 20 }, (_, i) => {
      const robot = i === 0 ? ' is-robot' : '';
      const target = i === 14 ? ' is-target' : '';
      return `<span class="sample-cell${robot}${target}"></span>`;
    }).join('');
    return `${hud('Program the Bot')}<div class="sample-grid">${cells}</div>`;
  },
  draw(game) {
    return `${hud('Free Draw')}<div class="sample-canvas"><span class="sample-brush">🖌️</span></div>`;
  },
};

function renderSampleScene(scene: HTMLElement, game: GameDefinition): void {
  const builder = SAMPLE_BUILDERS[game.engine] ?? SAMPLE_BUILDERS.quiz;
  scene.style.setProperty('--sample-accent', game.accent);
  scene.innerHTML = `<div class="sample" style="--sample-accent:${game.accent}">${builder(game)}</div>`;
}

function goalBadges(game: GameDefinition): string {
  return game.goals
    .map((goal) => `<span class="badge badge--goal">${escapeHtml(GOAL_LABELS[goal] ?? goal)}</span>`)
    .join('');
}

function renderGameCards(grid: HTMLElement, games: GameDefinition[]): void {
  if (!games.length) {
    grid.innerHTML = '<p class="empty-state">No games are available right now. Please try again soon.</p>';
    return;
  }
  grid.innerHTML = games
    .map(
      (game) => `
      <button type="button" class="game-card" data-game-id="${escapeHtml(game.id)}" style="--card-accent:${escapeHtml(game.accent)}" aria-haspopup="dialog">
        <span class="game-card__icon" aria-hidden="true">${game.icon}</span>
        <h3 class="game-card__title">${escapeHtml(game.title)}</h3>
        <p class="game-card__tagline">${escapeHtml(game.tagline)}</p>
        <span class="game-card__goals">${goalBadges(game)}</span>
        <span class="game-card__cta">Peek inside →</span>
      </button>`,
    )
    .join('');
}

interface GameModalRefs {
  overlay: HTMLElement;
  title: HTMLElement;
  tagline: HTMLElement;
  icon: HTMLElement;
  description: HTMLElement;
  meta: HTMLElement;
  stage: HTMLElement;
  dots: HTMLElement;
  slidesRoot: HTMLElement;
  play: HTMLAnchorElement;
}

function initGameModal(refs: GameModalRefs): {
  show: (game: GameDefinition) => void;
  close: () => void;
  destroy: () => void;
} {
  const modal = createModal(refs.overlay);
  let slides: SlidesController | null = null;

  refs.overlay.querySelectorAll<HTMLElement>('[data-close]').forEach((button) => {
    button.addEventListener('click', () => modal.close());
  });

  return {
    show(game: GameDefinition): void {
      slides?.destroy();
      refs.icon.textContent = game.icon;
      refs.title.textContent = game.title;
      refs.tagline.textContent = game.tagline;
      refs.description.textContent = game.description;
      refs.meta.innerHTML = [
        `<span class="badge badge--goal">Ages ${game.minAge}–${game.maxAge}</span>`,
        `<span class="badge badge--goal">${game.totalLevels} levels</span>`,
        ...game.goals.map(
          (goal) => `<span class="badge badge--goal">${escapeHtml(GOAL_LABELS[goal] ?? goal)}</span>`,
        ),
      ].join('');

      refs.stage.innerHTML = game.slides
        .map(
          (slide, i) => `
          <div class="slides__slide${i === 0 ? ' is-active' : ''}" style="background:radial-gradient(70% 90% at 50% 120%, ${escapeHtml(game.accent)}55, transparent 70%)">
            <span style="font-size:64px" aria-hidden="true">${game.icon}</span>
            <span class="slides__slide-title">${escapeHtml(slide.title)}</span>
            <span class="slides__caption">${escapeHtml(slide.caption)}</span>
          </div>`,
        )
        .join('');
      refs.dots.innerHTML = game.slides
        .map(
          (_, i) =>
            `<button type="button" class="slides__dot" aria-label="Show slide ${i + 1}"${i === 0 ? ' aria-current="true"' : ''}></button>`,
        )
        .join('');

      refs.play.href = 'register.html';
      modal.open();
      slides = createSlides(refs.slidesRoot, { budgetMs: 30_000 });
    },
    close(): void {
      modal.close();
    },
    destroy(): void {
      slides?.destroy();
    },
  };
}

function initShowcase(games: GameDefinition[]): void {
  const scene = qs('#showcase-scene');
  const title = qs('#showcase-title-text');
  const caption = qs('#showcase-caption');
  const counter = qs('#showcase-counter');
  const fill = qs<HTMLElement>('#showcase-timer-fill');
  const prev = qs('#showcase-prev');
  const next = qs('#showcase-next');
  if (!games.length) {
    title.textContent = 'Games coming soon';
    caption.textContent = 'The arcade shelf is being restocked.';
    return;
  }

  let index = 0;
  let timer: number | undefined;
  let progressTimer: number | undefined;
  let startedAt = Date.now();

  const paint = (): void => {
    const game = games[index];
    scene.classList.add('is-fading');
    window.setTimeout(() => {
      renderSampleScene(scene, game);
      scene.classList.remove('is-fading');
      title.textContent = `${game.icon} ${game.title}`;
      caption.textContent = game.slides[0]?.caption ?? game.tagline;
      counter.textContent = `${index + 1} / ${games.length}`;
      startedAt = Date.now();
    }, 180);
  };

  const stop = (): void => {
    window.clearTimeout(timer);
    window.clearInterval(progressTimer);
  };

  const schedule = (): void => {
    stop();
    timer = window.setTimeout(() => advance(1), SHOWCASE_INTERVAL_MS);
    progressTimer = window.setInterval(() => {
      const percent = Math.min(100, ((Date.now() - startedAt) / SHOWCASE_INTERVAL_MS) * 100);
      fill.style.width = `${percent}%`;
    }, 200);
  };

  const advance = (delta: number): void => {
    index = (index + delta + games.length) % games.length;
    paint();
    schedule();
  };

  on(prev, 'click', () => advance(-1));
  on(next, 'click', () => advance(1));
  scene.addEventListener('mouseenter', stop);
  scene.addEventListener('mouseleave', schedule);

  paint();
  schedule();
}

function initSubscribe(): void {
  const form = qs<HTMLFormElement>('#subscribe-form');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = qs<HTMLInputElement>('#subscribe-email');
    const email = input.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      input.setAttribute('aria-invalid', 'true');
      showToast('Please enter a valid email address.', 'error');
      input.focus();
      return;
    }
    input.removeAttribute('aria-invalid');
    input.value = '';
    showToast('Preview only - no email was sent. Nothing to unsubscribe from!', 'success');
  });
}

async function boot(): Promise<void> {
  qs('#year').textContent = String(new Date().getFullYear());
  initSubscribe();

  const grid = qs('#games-grid');
  const status = qs('#games-status');
  const offlineNote = qs('#offline-note');
  const retry = qs('#retry-catalog');

  const refs: GameModalRefs = {
    overlay: qs('#game-modal'),
    title: qs('#game-modal-title'),
    tagline: qs('#game-modal-tagline'),
    icon: qs('#game-modal-icon'),
    description: qs('#game-modal-description'),
    meta: qs('#game-modal-meta'),
    stage: qs('#game-modal-slide-stage'),
    dots: qs('#game-modal-dots'),
    slidesRoot: qs('#game-modal-slides'),
    play: qs<HTMLAnchorElement>('#game-modal-play'),
  };
  const modalApi = initGameModal(refs);

  const attachCards = (games: GameDefinition[]): void => {
    qsa<HTMLButtonElement>('.game-card', grid).forEach((card) =>
      card.addEventListener('click', () => {
        const game = games.find((candidate) => candidate.id === card.dataset.gameId);
        if (game) modalApi.show(game);
      }),
    );
  };

  let showcaseReady = false;

  const load = async (): Promise<void> => {
    status.textContent = 'Loading the game shelf…';
    try {
      const { games, offline } = await fetchCatalog();
      status.textContent = offline
        ? `${games.length} games in the bundled shelf`
        : `${games.length} neon-powered games are waiting for you`;
      offlineNote.hidden = !offline;
      renderGameCards(grid, games);
      attachCards(games);
      if (!showcaseReady) {
        initShowcase(games);
        showcaseReady = true;
      }
      if (offline) showToast('Showing the offline game shelf.', 'error');
    } catch {
      const games = localCatalog();
      renderGameCards(grid, games);
      attachCards(games);
      offlineNote.hidden = false;
      status.textContent = 'Showing the bundled game shelf';
      if (!showcaseReady) {
        initShowcase(games);
        showcaseReady = true;
      }
    }
  };

  on(retry, 'click', () => void load());
  await load();
}

void boot().catch((error: unknown) => {
  console.error(error);
  showToast('Something went wrong loading the page.', 'error');
});

export { SAMPLE_BUILDERS, SHOWCASE_INTERVAL_MS };
