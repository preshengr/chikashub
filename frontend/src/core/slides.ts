import { on, qsa } from './dom';

export interface SlidesController {
  destroy(): void;
  goTo(index: number): void;
}

export interface SlidesOptions {
  /** Total auto-advance budget across all slides (spec: 30 seconds). */
  budgetMs?: number;
  /** Disable auto-advance (manual only). */
  manualOnly?: boolean;
}

/**
 * Slide deck controller: manual prev/next/dots navigation plus optional
 * time-boxed auto-advance. Manual interaction pauses the auto timer.
 */
export function createSlides(root: HTMLElement, options: SlidesOptions = {}): SlidesController {
  const budgetMs = options.budgetMs ?? 30_000;
  const slides = qsa<HTMLElement>('.slides__slide', root);
  const dots = qsa<HTMLButtonElement>('.slides__dot', root);
  const prev = root.querySelector<HTMLButtonElement>('[data-slides="prev"]');
  const next = root.querySelector<HTMLButtonElement>('[data-slides="next"]');
  if (!slides.length) throw new Error('Slides markup requires at least one .slides__slide');

  let index = 0;
  let timer: number | undefined;
  const perSlide = Math.max(1_500, budgetMs / slides.length);
  let paused = false;

  const render = (): void => {
    slides.forEach((slide, i) => slide.classList.toggle('is-active', i === index));
    dots.forEach((dot, i) => {
      if (i === index) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });
  };

  const stopAuto = (): void => {
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timer = undefined;
    }
  };

  const scheduleAuto = (): void => {
    stopAuto();
    if (options.manualOnly || paused) return;
    timer = window.setTimeout(() => {
      index = (index + 1) % slides.length;
      render();
      scheduleAuto();
    }, perSlide);
  };

  const goTo = (target: number): void => {
    index = (target + slides.length) % slides.length;
    render();
    scheduleAuto();
  };

  const pause = (): void => {
    paused = true;
    stopAuto();
  };

  on(prev, 'click', () => goTo(index - 1));
  on(next, 'click', () => goTo(index + 1));
  dots.forEach((dot, i) => on(dot, 'click', () => goTo(i)));

  root.addEventListener('mouseenter', stopAuto);
  root.addEventListener('mouseleave', () => scheduleAuto());
  root.addEventListener('focusin', stopAuto);
  root.addEventListener('focusout', (event) => {
    if (!root.contains(event.target as Node)) scheduleAuto();
  });
  root.addEventListener('touchstart', pause, { passive: true });

  render();
  scheduleAuto();

  return {
    goTo,
    destroy(): void {
      stopAuto();
    },
  };
}
