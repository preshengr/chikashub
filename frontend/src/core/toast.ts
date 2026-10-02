export type ToastTone = 'info' | 'success' | 'error';

let region: HTMLElement | null = null;

function ensureRegion(): HTMLElement {
  if (region && document.body.contains(region)) return region;
  region = document.createElement('div');
  region.className = 'toast-region';
  region.setAttribute('role', 'status');
  region.setAttribute('aria-live', 'polite');
  document.body.appendChild(region);
  return region;
}

/**
 * Show an accessible toast message. Errors persist until dismissed;
 * info/success messages auto-dismiss.
 */
export function showToast(message: string, tone: ToastTone = 'info', timeoutMs?: number): void {
  const container = ensureRegion();
  const toast = document.createElement('div');
  toast.className = `toast toast--${tone}`;
  toast.innerHTML = `<span class="toast__message"></span><button type="button" class="toast__close" aria-label="Dismiss message">&times;</button>`;
  toast.querySelector('.toast__message')!.textContent = message;

  const dismiss = () => {
    toast.classList.add('toast--leaving');
    window.setTimeout(() => toast.remove(), 200);
  };

  toast.querySelector('.toast__close')?.addEventListener('click', dismiss);
  container.appendChild(toast);

  const ttl = timeoutMs ?? (tone === 'error' ? 0 : 4000);
  if (ttl > 0) window.setTimeout(dismiss, ttl);
}

export function clearToasts(): void {
  region?.querySelectorAll('.toast').forEach((node) => node.remove());
}
