/**
 * scrollProgress.js — thin fixed scroll-progress bar on the homepage.
 *
 * WHAT
 * ----
 * Reads the page's current scroll position and maps it to the filled width
 * of `#scroll-progress .scroll-progress-fill`:
 *
 *   p = scrollY / (document height - viewport height)
 *
 *   p = 0  -> very top of the page (bar empty, only the muted track shows)
 *   p = 1  -> scrolled all the way to the bottom (bar fully filled)
 *
 * It grows while scrolling down, shrinks back while scrolling up, and always
 * reflects the CURRENT position — no one-time animation, no easing drift.
 *
 * PERFORMANCE
 * -----------
 * - One passive `scroll` listener. A `ticking` flag coalesces work so the
 *   ratio is recomputed at most once per frame (rAF batch), matching the
 *   passive-listener + rAF pattern used by the other scroll components.
 * - Writes ONLY `transform` (+ the `--scroll-progress-p` custom property),
 *   never layout-affecting props. `will-change: transform` keeps the fill on
 *   its own compositor layer.
 * - Fully disabled when `prefers-reduced-motion: reduce`, and a no-op on any
 *   page that doesn't include `#scroll-progress`.
 */
(() => {
  const bar = document.querySelector('#scroll-progress .scroll-progress-fill');
  if (!bar) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const track = bar.closest('#scroll-progress');
    if (track) track.hidden = true;
    return;
  }

  let ticking = false;

  const update = () => {
    ticking = false;
    const docEl = document.documentElement;
    const max = docEl.scrollHeight - window.innerHeight;
    const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    // scaleX(0..1): "width" 0% at top, 100% at the bottom.
    bar.style.transform = `scaleX(${p})`;
    bar.style.setProperty('--scroll-progress-p', String(p));
  };

  const requestUpdate = () => {
    if (ticking) return; // already scheduled for this frame
    ticking = true;
    requestAnimationFrame(update);
  };

  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', requestUpdate);

  // Paint the correct start state for the initial load position (usually 0).
  update();
})();