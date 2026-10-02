import '../styles/base.css';
import '../styles/login.css';
import { api, ApiError } from '../core/api';
import { qs } from '../core/dom';
import { createModal } from '../core/modal';
import { isAuthenticated, isPersistentStorageAvailable, saveSession } from '../core/session';
import { formatBytes, getQuota, listProgressKeys, resetAllProgress } from '../core/storage';
import { showToast } from '../core/toast';
import type { AuthResult } from '../core/types';
import { validateUsername } from '../core/validate';

function showLoginError(message: string): void {
  const summary = qs('#login-summary');
  summary.textContent = message;
  summary.classList.add('is-visible', 'is-error');
}

function clearLoginError(): void {
  const summary = qs('#login-summary');
  summary.textContent = '';
  summary.classList.remove('is-visible', 'is-error');
  qs('#err-username').textContent = '';
  qs<HTMLInputElement>('#username').removeAttribute('aria-invalid');
}

async function refreshStoragePanel(): Promise<void> {
  const quota = await getQuota();
  const keys = listProgressKeys();
  const fill = qs<HTMLElement>('#storage-fill');
  const bar = qs('#storage-bar');
  const readout = qs('#storage-readout');
  const stats = qs('#storage-stats');

  fill.style.width = `${Math.max(quota.percent, keys.length ? 2 : 0)}%`;
  bar.setAttribute(
    'aria-label',
    `Storage used: ${quota.percent} percent, ${formatBytes(quota.usedBytes)} of ${formatBytes(quota.quotaBytes)}`,
  );
  readout.textContent = `${quota.percent}% of local storage used (${formatBytes(quota.usedBytes)} of ${formatBytes(quota.quotaBytes)})`;

  const children = keys.map((key) => key.replace('chika.progress.', ''));
  stats.innerHTML = [
    `<li><strong>${keys.length}</strong> saved player profile${keys.length === 1 ? '' : 's'} on this device</li>`,
    children.length
      ? `<li>Saved for: ${children.map((name) => `<strong>${escapeText(name)}</strong>`).join(', ')}</li>`
      : '<li>No game progress saved yet — go play!</li>',
    `<li>Measurement source: <strong>${quota.source === 'navigator' ? 'browser storage estimate' : 'app-level estimate'}</strong></li>`,
  ].join('');
}

function escapeText(value: string): string {
  const node = document.createElement('span');
  node.textContent = value;
  return node.innerHTML;
}

async function handleLogin(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  clearLoginError();

  const input = qs<HTMLInputElement>('#username');
  const username = input.value.trim().toLowerCase();
  const errors = validateUsername(username);
  if (errors.username) {
    input.setAttribute('aria-invalid', 'true');
    qs('#err-username').textContent = errors.username;
    showLoginError(errors.username);
    input.focus();
    return;
  }

  const button = qs<HTMLButtonElement>('#login-btn');
  button.disabled = true;
  button.classList.add('is-loading');
  const spinner = document.createElement('span');
  spinner.className = 'btn__spinner';
  button.prepend(spinner);

  try {
    const result = await api.post<AuthResult>('/auth/login', { username });
    saveSession({
      username: result.username,
      token: result.token,
      expiresAt: result.expiresAt,
      profile: result.profile,
    });
    showToast(`Welcome back, ${result.profile.child.firstName}!`, 'success');
    window.location.assign('dashboard.html');
  } catch (error) {
    if (error instanceof ApiError) {
      const message = error.isNetwork
        ? error.message
        : error.code === 'USER_NOT_FOUND'
          ? 'User Does Not Exist - Try Again'
          : error.message;
      input.setAttribute('aria-invalid', 'true');
      qs('#err-username').textContent = message;
      showLoginError(message);
      input.focus();
      if (error.status === 429) {
        showToast('Too many tries — please wait a moment before trying again.', 'error');
      }
    } else {
      showLoginError('Something unexpected happened. Please try again.');
    }
  } finally {
    spinner.remove();
    button.disabled = false;
    button.classList.remove('is-loading');
  }
}

function initResetFlow(): void {
  const overlay = qs('#reset-modal');
  const modal = createModal(overlay, { closeOnBackdrop: false });
  qs('#reset-btn').addEventListener('click', () => modal.open());
  qs('#reset-cancel').addEventListener('click', () => modal.close());
  qs('#reset-keep').addEventListener('click', () => modal.close());
  qs('#reset-confirm').addEventListener('click', () => {
    const removed = resetAllProgress();
    modal.close();
    void refreshStoragePanel();
    showToast(
      removed.length
        ? `Reset complete — ${removed.length} saved profile${removed.length === 1 ? '' : 's'} cleared.`
        : 'Nothing was stored, but you are all reset.',
      'success',
    );
  });
}

async function boot(): Promise<void> {
  qs('#year').textContent = String(new Date().getFullYear());

  // Already signed in? Straight back to the arcade.
  if (isAuthenticated()) {
    window.location.replace('dashboard.html');
    return;
  }

  qs<HTMLFormElement>('#login-form').addEventListener('submit', (event) => {
    void handleLogin(event);
  });

  qs('#refresh-quota').addEventListener('click', () => void refreshStoragePanel());
  initResetFlow();

  if (!isPersistentStorageAvailable()) {
    qs('#storage-warning').hidden = false;
    qs<HTMLInputElement>('#username').setAttribute('aria-describedby', 'hint-username');
  }

  await refreshStoragePanel();
}

void boot().catch((error: unknown) => {
  console.error(error);
  showToast('The page hit an unexpected problem.', 'error');
});

export { refreshStoragePanel };
