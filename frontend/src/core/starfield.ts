export interface StarfieldHandle {
  destroy(): void;
}

interface Star {
  x: number;
  y: number;
  r: number;
  twinkle: number;
  speed: number;
  hue: number;
}

interface ShootingStar {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

const HUES = [315, 187, 275, 55, 145];

/**
 * Neon star backdrop: twinkling stars plus occasional shooting stars.
 * Respects prefers-reduced-motion (draws one static frame instead).
 */
export function createStarfield(canvas: HTMLCanvasElement): StarfieldHandle {
  const context = canvas.getContext('2d');
  if (!context) return { destroy() {} };

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let stars: Star[] = [];
  let shooting: ShootingStar[] = [];
  let frame = 0;
  let raf = 0;
  let running = true;

  const resize = (): void => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
  };

  const seed = (): void => {
    const count = Math.min(180, Math.floor((window.innerWidth * window.innerHeight) / 9000));
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: Math.random() * 1.8 + 0.4,
      twinkle: Math.random() * Math.PI * 2,
      speed: Math.random() * 0.03 + 0.01,
      hue: HUES[Math.floor(Math.random() * HUES.length)],
    }));
  };

  const maybeSpawnShooter = (): void => {
    if (shooting.length >= 3 || Math.random() > 0.02) return;
    const fromLeft = Math.random() > 0.5;
    shooting.push({
      x: fromLeft ? -40 : Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight * 0.5,
      vx: (fromLeft ? 1 : -1) * (Math.random() * 4 + 6),
      vy: Math.random() * 2 + 1.5,
      life: 1,
    });
  };

  const draw = (): void => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    context.clearRect(0, 0, width, height);

    for (const star of stars) {
      const alpha = 0.35 + Math.abs(Math.sin(star.twinkle)) * 0.65;
      context.beginPath();
      context.fillStyle = `hsla(${star.hue}, 100%, 78%, ${alpha})`;
      context.shadowColor = `hsla(${star.hue}, 100%, 70%, 0.9)`;
      context.shadowBlur = 8;
      context.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      context.fill();
    }
    context.shadowBlur = 0;

    for (const shooter of shooting) {
      const gradient = context.createLinearGradient(
        shooter.x,
        shooter.y,
        shooter.x - shooter.vx * 12,
        shooter.y - shooter.vy * 12,
      );
      gradient.addColorStop(0, `rgba(255, 255, 255, ${shooter.life})`);
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      context.strokeStyle = gradient;
      context.lineWidth = 2.5;
      context.beginPath();
      context.moveTo(shooter.x, shooter.y);
      context.lineTo(shooter.x - shooter.vx * 12, shooter.y - shooter.vy * 12);
      context.stroke();
    }
  };

  const tick = (): void => {
    if (!running) return;
    frame += 1;
    for (const star of stars) star.twinkle += star.speed;

    shooting = shooting.filter((shooter) => shooter.life > 0 && shooter.x < window.innerWidth + 60);
    for (const shooter of shooting) {
      shooter.x += shooter.vx;
      shooter.y += shooter.vy;
      shooter.life -= 0.01;
    }
    maybeSpawnShooter();
    draw();
    raf = window.requestAnimationFrame(tick);
  };

  resize();
  window.addEventListener('resize', resize);

  if (reducedMotion) {
    for (const star of stars) star.twinkle = Math.PI / 3;
    draw();
  } else {
    raf = window.requestAnimationFrame(tick);
  }

  return {
    destroy(): void {
      running = false;
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    },
  };
}
