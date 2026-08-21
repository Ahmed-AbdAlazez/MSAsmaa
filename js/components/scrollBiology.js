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
 * v2 FIX — why the old version showed no visible movement
 * -------------------------------------------------------
 * The previous progress formula divided by (rect.height + vh), which
 * describes a zone traveling all the way THROUGH the viewport. This
 * zone sits at the very END of the page, so it can never leave through
 * the top: progress saturated around 0.5 while the user was still
 * scrolling, and the tiny drift values were smeared over ~1700px of
 * scroll — effectively frozen shapes.
 *
 * The fixed mapping measures how far the footer has been REVEALED:
 *
 *   p = clamp( (viewportHeight - rect.top) / rect.height , 0 , 1 )
 *
 *   p = 0  -> the zone's top edge first appears at the viewport bottom
 *   p = 1  -> the zone's bottom edge reaches the viewport bottom,
 *             i.e. the page is scrolled to its very end (true because
 *             this zone is the LAST element on the page).
 *
 * So every remaining pixel of scroll changes p — the motion stays live
 * the whole way down AND reverses exactly when scrolling up.
 *
 * SMOOTHNESS (fast vs slow scrolling)
 * -----------------------------------
 * Scroll events only update a TARGET value. A requestAnimationFrame
 * chase loop eases the applied progress toward that target:
 *
 *   current += (target - current) * EASE
 *
 * Fast flicks therefore glide instead of teleporting (no erratic
 * jumps), slow scrolls track almost 1:1, and because lerp approaches
 * the target asymptotically the shapes can never overshoot. The loop
 * stops itself once settled (< 0.1% away), so no idle CPU burn.
 *
 * PERFORMANCE
 * -----------
 * - One passive `scroll` listener; work coalesced via rAF (the
 *   `pendingScroll` flag guarantees at most one target recompute per
 *   frame even if the browser fires scroll faster than vsync).
 * - One getBoundingClientRect per recompute, then PURE transform
 *   writes — no layout-triggering properties are touched.
 * - Shapes have `will-change: transform` (css/mascot.css) so each one
 *   lives on its own compositor layer.
 * - Fully disabled when `prefers-reduced-motion: reduce`.
 */
(() => {
  const zone = document.querySelector('[data-samascroll]');
  if (!zone) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // TUNING KNOBS -----------------------------------------------------------
  // Raise INTENSITY above 1.0 for stronger travel, lower for calmer.
  const INTENSITY = 1.4;
  // Chase easing per frame (0..1). Higher = snappier, lower = dreamier.
  const EASE = 0.18;

  const shapes = Array.from(zone.querySelectorAll('.scroll-shape'));
  if (!shapes.length) return;

  let targetP = 0.5;    // where the shapes SHOULD be for current scroll pos
  let currentP = null;  // where they currently are (eased toward target)
  let rafId = null;     // id of the running chase-loop frame
  let pendingScroll = false; // a scroll arrived but hasn't been read yet

  /** Read scroll position ONCE and convert it to the target progress. */
  const computeTarget = () => {
    pendingScroll = false;

    const rect = zone.getBoundingClientRect();
    const vh = window.innerHeight;
    if (rect.height <= 0) return; // hidden layout — keep last state

    // Footer-reveal progress (see header comment for the geometry).
    let p = (vh - rect.top) / rect.height;
    targetP = Math.min(1, Math.max(0, p));
  };

  /** Write transforms from a centered progress value c (-0.5 .. +0.5). */
  const apply = (p) => {
    const centered = (p - 0.5) * INTENSITY;

    for (const shape of shapes) {
      const driftY = parseFloat(shape.dataset.driftY || '0');
      const driftX = parseFloat(shape.dataset.driftX || '0');
      const spin = parseFloat(shape.dataset.spin || '0');

      shape.style.transform =
        `translate3d(${centered * driftX}px, ${centered * driftY}px, 0) rotate(${centered * spin}deg)`;
    }
  };

  /**
   * Chase loop: ease currentP toward targetP every frame until settled.
   * Runs only while there is movement left, then cancels itself.
   */
  const frame = () => {
    rafId = null;

    if (currentP === null) currentP = targetP; // first run: no intro sweep

    const delta = targetP - currentP;
    if (Math.abs(delta) < 0.001) {
      currentP = targetP;      // snap exactly onto target (no drift residue)
      apply(currentP);
      return;                  // settled — stop the loop
    }

    currentP += delta * EASE;
    apply(currentP);
    rafId = requestAnimationFrame(frame); // keep chasing
  };

  const requestUpdate = () => {
    if (pendingScroll) return;          // already queued this frame
    pendingScroll = true;
    requestAnimationFrame(() => {       // batch: read once, then animate
      computeTarget();
      if (rafId === null) rafId = requestAnimationFrame(frame);
    });
  };

  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', requestUpdate);

  // Initial paint: place shapes at the correct spot for the load position
  // without animating in from an arbitrary midpoint.
  computeTarget();
  currentP = targetP;
  apply(currentP);
})();
