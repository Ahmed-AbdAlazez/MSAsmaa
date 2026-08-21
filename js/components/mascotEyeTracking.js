/**
 * mascotEyeTracking.js — Effect 1: pupils follow the mouse cursor.
 *
 * How it works
 * ------------
 * 1. Only enabled on devices with a real hover-capable pointer
 *    (desktop). On touch devices we do nothing here — the mascot
 *    falls back to a CSS idle "wander + blink" animation defined in
 *    css/mascot.css.
 * 2. A single passive `pointermove` listener records the cursor
 *    position; all math happens inside one requestAnimationFrame loop,
 *    so at most one style write happens per frame.
 * 3. Pupils move TOWARD the cursor with simple easing (lerp), capped
 *    at MAX_OFFSET px so the motion always stays subtle.
 * 4. Only `transform` is written → no layout, no reflow, cheap.
 */
(() => {
  const MAX_OFFSET = 4;   // px — keep small so it feels alive, not silly
  const LERP = 0.16;      // 0..1 — how fast pupils chase the cursor

  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  if (!finePointer.matches || reducedMotion.matches) return; // mobile / a11y: skip

  const svg = document.querySelector('.sama-svg');
  const pupils = svg ? Array.from(svg.querySelectorAll('.sama-pupil')) : [];
  if (!pupils.length) return;

  // Flag used by css/mascot.css to pause the idle wander animation.
  document.body.classList.add('sama-eyes-live');

  let pointerX = window.innerWidth / 2;
  let pointerY = window.innerHeight / 2;
  let rafId = null;

  // Viewport-space center of each pupil's parent <g>. Cached because
  // getBoundingClientRect forces layout; refreshed on scroll/resize only.
  let centers = [];

  const measureCenters = () => {
    centers = pupils.map((p) => {
      const r = p.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
  };

  const tick = () => {
    let stillMoving = false;

    pupils.forEach((pupil, i) => {
      const c = centers[i];
      if (!c) return;

      // Direction vector pupil -> cursor, normalized, clamped to MAX_OFFSET.
      const dx = pointerX - c.x;
      const dy = pointerY - c.y;
      const dist = Math.hypot(dx, dy) || 1;
      const targetX = (dx / dist) * MAX_OFFSET;
      const targetY = (dy / dist) * MAX_OFFSET;

      // Read current transform (we wrote it ourselves, so parsing is safe).
      const match = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(pupil.style.transform || '');
      const curX = match ? parseFloat(match[1]) : 0;
      const curY = match ? parseFloat(match[2]) : 0;

      // Ease toward the target; stop when close enough to save CPU.
      const nextX = curX + (targetX - curX) * LERP;
      const nextY = curY + (targetY - curY) * LERP;

      if (Math.abs(targetX - nextX) > 0.05 || Math.abs(targetY - nextY) > 0.05) {
        stillMoving = true;
      }

      pupil.style.transform = `translate(${nextX}px, ${nextY}px)`;
    });

    rafId = stillMoving ? requestAnimationFrame(tick) : null;
  };

  const wake = () => {
    if (rafId === null) rafId = requestAnimationFrame(tick);
  };

  document.addEventListener('pointermove', (e) => {
    pointerX = e.clientX;
    pointerY = e.clientY;
    wake();
  }, { passive: true });

  // Keep cached eye centers accurate without measuring every frame.
  window.addEventListener('scroll', () => { measureCenters(); wake(); }, { passive: true });
  window.addEventListener('resize', measureCenters);

  measureCenters();
})();
