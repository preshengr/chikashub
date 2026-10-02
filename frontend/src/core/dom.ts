export type Markup = string;

/** Tiny typed query helper that fails loudly when an element is missing. */
export function qs<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error(`Missing required element: ${selector}`);
  return node;
}

export function qsa<T extends Element = HTMLElement>(
  selector: string,
  root: ParentNode = document,
): T[] {
  return [...root.querySelectorAll<T>(selector)];
}

export function on<K extends keyof HTMLElementEventMap>(
  target: EventTarget | null,
  type: K,
  handler: (event: HTMLElementEventMap[K]) => void,
  options?: AddEventListenerOptions,
): void {
  target?.addEventListener(type, handler as EventListener, options);
}

export function onSubmit(form: HTMLFormElement, handler: (event: SubmitEvent) => void): void {
  form.addEventListener('submit', handler as EventListener);
}

export function setText(root: ParentNode, selector: string, text: string): void {
  const node = root.querySelector(selector);
  if (node) node.textContent = text;
}

export function toggleHidden(element: Element | null, hidden: boolean): void {
  if (element instanceof HTMLElement) element.hidden = hidden;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatClock(date: Date = new Date()): string {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function formatLongDate(date: Date = new Date()): string {
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function todayISODate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export function debounce<T extends (...args: never[]) => void>(fn: T, waitMs: number): T {
  let timer: number | undefined;
  return ((...args: never[]) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), waitMs);
  }) as T;
}

/** Focus trap + Escape handling for accessible modals. */
export function trapFocus(container: HTMLElement): () => void {
  const selector =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      container.dispatchEvent(new CustomEvent('modal:escape', { bubbles: true }));
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...container.querySelectorAll<HTMLElement>(selector)].filter(
      (node) => node.offsetParent !== null,
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  container.addEventListener('keydown', onKeyDown);
  const previous = document.activeElement as HTMLElement | null;
  container.querySelector<HTMLElement>(selector)?.focus();

  return () => {
    container.removeEventListener('keydown', onKeyDown);
    previous?.focus?.();
  };
}
