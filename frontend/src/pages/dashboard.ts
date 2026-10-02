import '../styles/base.css';
import '../styles/dashboard.css';
import { api, ApiError } from '../core/api';
import { filterGamesForChild, groupGamesByGoal, localCatalog } from '../core/catalog';
import { escapeHtml, formatClock, formatLongDate, qs } from '../core/dom';
import { createModal } from '../core/modal';
import { clearSession, getToken, loadSession, requireSession } from '../core/session';
import { formatBytes, getQuota, loadProgress, resetAllProgress } from '../core/storage';
import { showToast } from '../core/toast';
import type {
  DashboardGame,
  DashboardPayload,
  DashboardSection,
  GameDefinition,
  GameProgressRow,
} from '../core/types';
import { GOAL_LABELS } from '../core/types';
import { startGame, type GameSession } from '../game/index';

let session = loadSession();
let activeGame: GameSession | null = null;
let pendingGame: GameDefinition | null = null;
let offlineMode = false;
let clockTimer: number | undefined;

function requireAuth(): void {
  if (!requireSession('login.html')) throw new Error('redirected');
}

function startClock(): void {
  const tick = (): void => {
    const now = new Date();
    const clock = document.getElementById('live-clock');
    const date = document.getElementById('today-date');
    if (clock) clock.textContent = formatClock(now);
    if (date) date.textContent = formatLongDate(now);
  };
  tick();
  clockTimer = window.setInterval(tick, 15_000);
}

function localProgressRow(game: GameDefinition): GameProgressRow | null {
  if (!session) return null;
  const stored = loadProgress(session.username).games[game.id];
  if (!stored) return null;
  return {
    gameId: game.id,
    title: game.title,
    icon: game.icon,
    accent: game.accent,
    started: true,
    maxLevel: Math.min(stored.maxLevel, game.totalLevels),
    totalLevels: game.totalLevels,
    bestScore: stored.bestScore,
    failures: stored.failures,
    completions: stored.completions,
    completed: stored.completions > 0 || stored.maxLevel >= game.totalLevels,
    percent: Math.round((Math.min(stored.maxLevel, game.totalLevels) / game.totalLevels) * 100),
    lastEventAt: stored.lastPlayedAt ?? null,
  };
}

function fallbackPayload(): DashboardPayload {
  const child = session!.profile.child;
  const filtered = filterGamesForChild(localCatalog(), child);
  const sections = groupGamesByGoal(filtered.games, child.learningGoals);
  const games: DashboardGame[] = filtered.games.map((game) => ({
    ...game,
    progress: localProgressRow(game),
  }));
  const hydrated: DashboardSection[] = sections.map((section) => ({
    ...section,
    games: section.games.map((game) => ({
      ...game,
      progress: games.find((entry) => entry.id === game.id)?.progress ?? null,
    })),
  }));
  const rows = games.map((game) => game.progress).filter((row): row is GameProgressRow => row !== null);
  const levelsCompleted = rows.reduce((sum, row) => sum + row.maxLevel, 0);
  const totalLevels = games.reduce((sum, game) => sum + game.totalLevels, 0);
  return {
    username: session!.username,
    profile: session!.profile,
    child,
    team: filtered.team,
    teamLabel: filtered.teamLabel,
    serverTime: new Date().toISOString(),
    games,
    sections: hydrated,
    progress: {
      byGame: rows,
      overall: {
        gamesStarted: rows.length,
        gamesCompleted: rows.filter((row) => row.completed).length,
        levelsCompleted,
        totalLevels,
        percent: totalLevels ? Math.round((levelsCompleted / totalLevels) * 100) : 0,
        bestScore: rows.reduce((best, row) => Math.max(best, row.bestScore), 0),
        failures: rows.reduce((sum, row) => sum + row.failures, 0),
      },
    },
    learningGoalLabels: child.learningGoals.map((goal) => ({ goal, label: GOAL_LABELS[goal] })),
    excluded: filtered.excluded,
  };
}

function renderHeader(payload: DashboardPayload): void {
  const child = payload.child;
  const initial = child.firstName.trim().charAt(0).toUpperCase() || 'P';
  const avatar = document.getElementById('avatar');
  if (avatar) avatar.textContent = initial;
  const greeting = document.getElementById('dash-greeting');
  if (greeting) greeting.textContent = `Hi, ${child.firstName}!`;
  const meta = document.getElementById('player-meta');
  if (meta) meta.textContent = `Age ${child.age} · ${payload.username}`;
  const badge = document.getElementById('team-badge');
  if (badge) {
    badge.textContent = payload.teamLabel;
    badge.className = `badge badge--${payload.team}`;
  }
  const goals = document.getElementById('player-goals');
  if (goals) {
    goals.innerHTML = payload.child.learningGoals
      .map((goal) => `<span class="badge badge--goal">${escapeHtml(GOAL_LABELS[goal] ?? goal)}</span>`)
      .join('');
  }
  const navPlayer = document.getElementById('nav-player');
  if (navPlayer) navPlayer.textContent = child.firstName;
}

function renderStats(payload: DashboardPayload): void {
  const overall = payload.progress.overall;
  const set = (id: string, value: string): void => {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  };
  set('stat-started', String(overall.gamesStarted));
  set('stat-completed', String(overall.gamesCompleted));
  set('stat-levels', String(overall.levelsCompleted));
  set('stat-percent', `${overall.percent}%`);
  const fill = document.getElementById('overall-fill');
  if (fill instanceof HTMLElement) fill.style.width = `${overall.percent}%`;
}

function cardMarkup(game: DashboardGame): string {
  const progress = game.progress;
  const percent = progress?.percent ?? 0;
  const best = progress?.bestScore ?? 0;
  const stateLabel = progress?.completed
    ? 'Finished!'
    : progress?.started
      ? `Level ${progress.maxLevel} / ${progress.totalLevels}`
      : 'Not started';
  return `
    <article class="dash-card" style="--card-accent:${escapeHtml(game.accent)}" data-game-id="${escapeHtml(game.id)}">
      <div class="dash-card__top">
        <span class="dash-card__icon" aria-hidden="true">${game.icon}</span>
        <div>
          <h3 class="dash-card__title">${escapeHtml(game.title)}</h3>
          <p class="dash-card__tagline">${escapeHtml(game.tagline)}</p>
        </div>
      </div>
      <div class="dash-card__badges">
        ${game.goals.map((goal) => `<span class="badge badge--goal">${escapeHtml(GOAL_LABELS[goal] ?? goal)}</span>`).join('')}
        <span class="badge badge--goal">${game.totalLevels} levels</span>
      </div>
      <div class="dash-card__progress">
        <div class="dash-card__progress-meta">
          <span>${stateLabel}</span>
          <span>Best ${best}</span>
        </div>
        <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}" aria-label="${escapeHtml(game.title)} progress">
          <span class="progress__fill" style="width:${percent}%"></span>
        </div>
      </div>
      <button type="button" class="btn btn--primary btn--block dash-card__play" data-play="${escapeHtml(game.id)}">
        ${percent > 0 && percent < 100 ? 'Keep playing' : percent >= 100 ? 'Play again' : 'Play'} ▶
      </button>
    </article>`;
}

function renderSections(payload: DashboardPayload): void {
  const container = document.getElementById('sections');
  if (!container) return;
  if (!payload.sections.length) {
    container.innerHTML =
      '<p class="dash-status">No games match these settings yet — try different learning goals.</p>';
    return;
  }
  container.innerHTML = payload.sections
    .map(
      (section) => `
      <section class="dash-section" aria-labelledby="section-${escapeHtml(section.goal)}">
        <div class="dash-section__head">
          <h2 class="dash-section__title" id="section-${escapeHtml(section.goal)}">${escapeHtml(section.label)}</h2>
          <span class="dash-section__count">${section.games.length} game${section.games.length === 1 ? '' : 's'}</span>
        </div>
        <div class="dash-grid">
          ${section.games.map(cardMarkup).join('')}
        </div>
      </section>`,
    )
    .join('');

  container.querySelectorAll<HTMLButtonElement>('[data-play]').forEach((button) => {
    button.addEventListener('click', () => {
      const gameId = button.dataset.play;
      const game = payload.games.find((candidate) => candidate.id === gameId);
      if (game) openInstructions(game);
    });
  });
}

function setStatus(message: string, isError = false): void {
  const status = document.getElementById('dash-status');
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('is-error', isError);
}

/* ---------- instructions modal ---------- */

const instructionsOverlay = qs('#instructions-modal');
const instructionsModal = createModal(instructionsOverlay);
const instructionsPlay = qs<HTMLButtonElement>('#instructions-play');

function openInstructions(game: GameDefinition): void {
  pendingGame = game;
  qs('#instructions-icon').textContent = game.icon;
  qs('#instructions-title').textContent = game.title;
  qs('#instructions-tagline').textContent = game.tagline;
  qs('#instructions-list').innerHTML = game.instructions
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join('');
  qs('#instructions-meta').innerHTML = [
    `<span class="badge badge--goal">Ages ${game.minAge}–${game.maxAge}</span>`,
    `<span class="badge badge--goal">${game.totalLevels} levels</span>`,
    ...game.goals.map(
      (goal) => `<span class="badge badge--goal">${escapeHtml(GOAL_LABELS[goal] ?? goal)}</span>`,
    ),
  ].join('');
  instructionsPlay.disabled = false;
  instructionsModal.open();
}

function closeInstructions(): void {
  instructionsModal.close();
  pendingGame = null;
}

qs('#instructions-close').addEventListener('click', closeInstructions);
qs('#instructions-cancel').addEventListener('click', closeInstructions);
instructionsOverlay.addEventListener('modal:escape', () => {
  pendingGame = null;
});

/* ---------- game mounting ---------- */

function mountGame(game: GameDefinition): void {
  if (!session) return;
  closeInstructions();
  const mount = document.getElementById('game-mount');
  if (!mount) return;
  mount.hidden = false;
  document.body.classList.add('is-playing');

  activeGame = startGame({
    container: mount,
    game,
    child: {
      firstName: session.profile.child.firstName,
      age: session.profile.child.age,
      readingLevel: session.profile.child.readingLevel,
      learningGoals: session.profile.child.learningGoals,
    },
    username: session.username,
    onEvent: (record) => {
      const payload = {
        gameId: record.gameId,
        eventType: record.type,
        level: record.type === 'start' ? 0 : record.level,
        score: record.score,
      };
      api
        .post('/game/event', payload, getToken())
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.isAuthError) {
            showToast('Your session expired — progress is saved on this device.', 'error');
          }
        });
    },
    onExit: () => {
      activeGame = null;
      document.body.classList.remove('is-playing');
      mount.hidden = true;
      mount.innerHTML = '';
      void refreshDashboard();
    },
  });
}

instructionsPlay.addEventListener('click', () => {
  if (pendingGame) mountGame(pendingGame);
});

/* ---------- storage modal ---------- */

const storageOverlay = qs('#storage-modal');
const storageModal = createModal(storageOverlay);
let resetArmed = false;
let resetArmTimer: number | undefined;

async function openStorageModal(): Promise<void> {
  const quota = await getQuota();
  const keys = Object.keys(window.localStorage ?? {}).filter((key) =>
    key.startsWith('chika.progress.'),
  );
  qs('#storage-modal-readout').textContent = `${quota.percent}% used — ${formatBytes(quota.usedBytes)} of ${formatBytes(quota.quotaBytes)} · ${keys.length} saved profile${keys.length === 1 ? '' : 's'} on this device.`;
  resetArmed = false;
  const resetButton = qs<HTMLButtonElement>('#storage-reset');
  resetButton.textContent = 'Reset progress';
  storageModal.open();
}

qs('#footer-storage').addEventListener('click', () => void openStorageModal());
qs('#storage-modal-close').addEventListener('click', () => storageModal.close());
qs('#storage-cancel').addEventListener('click', () => storageModal.close());
qs('#storage-reset').addEventListener('click', () => {
  const button = qs<HTMLButtonElement>('#storage-reset');
  if (!resetArmed) {
    resetArmed = true;
    button.textContent = 'Tap again to confirm';
    window.clearTimeout(resetArmTimer);
    resetArmTimer = window.setTimeout(() => {
      resetArmed = false;
      button.textContent = 'Reset progress';
    }, 4000);
    return;
  }
  const removed = resetAllProgress();
  resetArmed = false;
  button.textContent = 'Reset progress';
  storageModal.close();
  showToast(
    removed.length ? `Cleared ${removed.length} saved profile${removed.length === 1 ? '' : 's'}.` : 'Nothing was stored.',
    'success',
  );
  void refreshDashboard();
});

/* ---------- logout ---------- */

qs('#logout-btn').addEventListener('click', () => {
  const token = getToken();
  const finish = (): void => {
    activeGame?.destroy();
    activeGame = null;
    if (clockTimer !== undefined) window.clearInterval(clockTimer);
    clearSession();
    window.location.assign('login.html');
  };
  if (!token) {
    finish();
    return;
  }
  api.post('/auth/logout', undefined, token).catch(() => undefined).finally(finish);
});

/* ---------- data loading ---------- */

async function refreshDashboard(): Promise<void> {
  if (!session) return;
  setStatus(offlineMode ? 'Reconnecting…' : 'Picking your games…');
  try {
    const payload = await api.get<DashboardPayload>('/dashboard', getToken());
    offlineMode = false;
    renderDashboard(payload);
  } catch (error) {
    if (error instanceof ApiError && error.isAuthError) {
      clearSession();
      window.location.assign('login.html?reason=auth');
      return;
    }
    offlineMode = true;
    const fallback = fallbackPayload();
    renderDashboard(fallback);
    setStatus(
      'Offline mode — showing progress saved on this device. Scores will sync when you reconnect.',
      true,
    );
    if (error instanceof ApiError && !error.isNetwork) {
      showToast(error.message, 'error');
    } else {
      showToast('Could not reach the game server — playing offline.', 'error');
    }
  }
}

function renderDashboard(payload: DashboardPayload): void {
  renderHeader(payload);
  renderStats(payload);
  renderSections(payload);
  document.getElementById('main')?.removeAttribute('hidden');
  if (!offlineMode) setStatus('Pick a game and press play!');
}

async function boot(): Promise<void> {
  requireAuth();
  session = loadSession();
  if (!session) return;
  qs('#year').textContent = String(new Date().getFullYear());
  startClock();
  await refreshDashboard();
}

void boot().catch((error: unknown) => {
  console.error(error);
});

export { fallbackPayload, cardMarkup };
