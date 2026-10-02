import { trapFocus } from './dom';

export interface ModalController {
  open(): void;
  close(): void;
  readonly isOpen: boolean;
}

/**
 * Accessible dialog helper: overlay + focus trap + Escape/backdrop close.
 * The markup lives in the page; this only wires behaviour.
 */
export function createModal(
  overlay: HTMLElement,
  options: { onClose?: () => void; closeOnBackdrop?: boolean; closeOnEscape?: boolean } = {},
): ModalController {
  const closeOnBackdrop = options.closeOnBackdrop ?? true;
  const closeOnEscape = options.closeOnEscape ?? true;
  let releaseFocus: (() => void) | null = null;
  let open = false;

  const close = (): void => {
    if (!open) return;
    open = false;
    overlay.hidden = true;
    document.body.style.removeProperty('overflow');
    releaseFocus?.();
    releaseFocus = null;
    options.onClose?.();
  };

  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && open && closeOnEscape) close();
  };

  const onOverlayClick = (event: MouseEvent): void => {
    if (closeOnBackdrop && event.target === overlay) close();
  };

  overlay.addEventListener('click', onOverlayClick);
  document.addEventListener('keydown', onKey);

  const onOverlayEscape = (): void => {
    if (closeOnEscape) close();
  };
  overlay.addEventListener('modal:escape', onOverlayEscape);

  return {
    open(): void {
      if (open) return;
      open = true;
      overlay.hidden = false;
      document.body.style.overflow = 'hidden';
      releaseFocus = trapFocus(overlay);
    },
    close,
    get isOpen() {
      return open;
    },
  };
}
