/**
 * scrollBiology.js — Effect 3: scroll-linked biology decorations.
 *
 * WHAT
 * ----
 * Small decorative shapes (cells, DNA strands, leaves, molecules)
 * inside the `[data-samascroll]` wrapper (CTA banner + footer area of
 * index.html) drift up/down and rotate as the user scrolls, then
 * reverse when scrolling back up. They live in their own absolutely-
 * positioned layer with `overflow: hidden`, so they can never overlap
 * main content or the navbar.
 *
 * HOW (the math — read this before tweaking!)
 * -------------------------------------------
 * For the wrapper we compute a progress value p:
 *
 *            viewportHeight - rect.top
 *   p = 0.5 + -------------------------      (clamped to 0..1... see below)
 *            rect.height + viewportHeight
 *
 * Intuitively: p = 0 when the wrapper's top edge first enters at the
 * bottom of the viewport, p = 1 when its bottom edge leaves through
 * the top. Because the wrapper sits at the end of the page you rarely
 * reach exactly 0/1 — that's fine, everything is relative.
 *
 * Each shape reads three numbers from data-attributes:
 *   data-drift-y : px to travel vertically across the full p range
 *                  (negative = moves UP while scrolling down)
 *   data-drift-x : px to travel horizontally (keep small)
 *   data-spin    : degrees of rotation across the range
 *
 * We convert progress to a centered value c = p - 0.5 (range -0.5..+0.5)
 * so shapes start mid-way and move symmetrically in both directions:
 *
 *   translateY = c * driftY * INTENSITY
 *   translateX = c * driftX * INTENSITY
 *   rotate     = c * spin  * INTENSITY
 *
 * PERFORMANCE
 * -----------
 * - One passive `scroll` listener; work is coalesced into
 *   requestAnimationFrame so we never write twice per frame.
 * - Only ONE layout read per frame (getBoundingClientRect on the
 *   wrapper) followed by pure transform writes — no layout thrash.
 * - Shapes get `will-change: transform` from CSS so they stay on
 *   their own compositor layer.
 * - Fully disabled when `prefers-reduced-motion: reduce`.
 */
(() => {
  const zone = document.querySelector('[data-samascroll]');
  if (!zone) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // GLOBAL tuning knobs ---------------------------------------------------
  const INTENSITY = 1.0; // raise to 1.5 for stronger motion, 0.5 for calmer

  const shapes = Array.from(zone.querySelectorAll('.scroll-shape'));
  if (!shapes.length) return;

  let ticking = false; // true while an rAF callback is scheduled

  const update = () => {
    ticking = false;

    const rect = zone.getBoundingClientRect();
    const vh = window.innerHeight;

    // Progress of the wrapper through the viewport (0 -> enters, 1 -> exits).
    let progress = (vh - rect.top) / (rect.height + vh);
    progress = Math.min(1, Math.max(0, progress));

    // Center around 0 so motion reverses cleanly at the midpoint.
    const centered = (progress - 0.5) * INTENSITY;

    for (const shape of shapes) {
      const driftY = parseFloat(shape.dataset.driftY || '0');
      const driftX = parseFloat(shape.dataset.driftX || '0');
      const spin = parseFloat(shape.dataset.spin || '0');

      shape.style.transform =
        `translate3d(${centered * driftX}px, ${centered * driftY}px, 0) rotate(${centered * spin}deg)`;
    }
  };

  const requestUpdate = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  };

  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', requestUpdate);

  update(); // set initial position on load
})();
