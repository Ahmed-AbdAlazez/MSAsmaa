/**
 * anatomyScrollSection.js - scroll-built human anatomy section.
 *
 * The component renders one SVG anatomy scene into [data-anatomy-scroll-section]
 * and maps section scroll progress to layer opacity/transform custom properties.
 * Scroll listeners only schedule rAF work; the observer keeps the loop dormant
 * while the section is off-screen.
 */
(() => {
  const mount = document.querySelector('[data-anatomy-scroll-section]');
  if (!mount) return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  mount.innerHTML = `
    <section class="anatomy-scroll" aria-label="Scroll-driven layered anatomy illustration">
      <div class="anatomy-scroll__sticky">
        <div class="anatomy-scroll__stage">
          <div class="anatomy-scroll__halo" aria-hidden="true"></div>
          <svg class="anatomy-scroll__svg" viewBox="0 0 360 620" role="img" aria-labelledby="anatomy-title anatomy-desc">
            <title id="anatomy-title">Layered human anatomy illustration</title>
            <desc id="anatomy-desc">A flat vector human body builds from outline to skeleton, rib cage highlight, and heart as the page scrolls.</desc>

            <g class="anatomy-layer anatomy-layer--outline">
              <path class="anatomy-outline-fill" d="M180 39c35 0 62 27 62 62 0 24-13 45-32 55v35l43 18c22 9 39 27 46 50l28 91c5 16-4 33-20 38-15 5-31-3-37-18l-26-75-5 122 41 121c6 18-3 37-21 43-17 6-36-3-42-20l-37-101-37 101c-6 17-25 26-42 20-18-6-27-25-21-43l41-121-5-122-26 75c-6 15-22 23-37 18-16-5-25-22-20-38l28-91c7-23 24-41 46-50l43-18v-35c-19-10-32-31-32-55 0-35 27-62 62-62z"/>
              <path class="anatomy-outline-stroke" d="M180 39c35 0 62 27 62 62 0 24-13 45-32 55v35l43 18c22 9 39 27 46 50l28 91c5 16-4 33-20 38-15 5-31-3-37-18l-26-75-5 122 41 121c6 18-3 37-21 43-17 6-36-3-42-20l-37-101-37 101c-6 17-25 26-42 20-18-6-27-25-21-43l41-121-5-122-26 75c-6 15-22 23-37 18-16-5-25-22-20-38l28-91c7-23 24-41 46-50l43-18v-35c-19-10-32-31-32-55 0-35 27-62 62-62z"/>
            </g>

            <g class="anatomy-layer anatomy-layer--skeleton">
              <circle class="anatomy-bone anatomy-bone--filled" cx="180" cy="96" r="38"/>
              <path class="anatomy-bone anatomy-bone--line" d="M161 96h38M168 116h24M162 86c9-8 27-8 36 0M168 98c5 4 19 4 24 0"/>
              <path class="anatomy-bone anatomy-bone--line" d="M180 136v264"/>
              <path class="anatomy-bone anatomy-bone--line" d="M165 154c9 8 21 8 30 0M164 176c10 8 22 8 32 0M164 198c10 8 22 8 32 0M166 220c8 7 20 7 28 0M168 242c7 6 17 6 24 0"/>
              <path class="anatomy-bone anatomy-bone--line" d="M142 205l-47 40-29 100M218 205l47 40 29 100"/>
              <path class="anatomy-bone anatomy-bone--line" d="M116 270l-24 88M244 270l24 88"/>
              <path class="anatomy-bone anatomy-bone--line" d="M145 392l-28 146M215 392l28 146"/>
              <path class="anatomy-bone anatomy-bone--line" d="M165 405l-17 150M195 405l17 150"/>
              <path class="anatomy-bone anatomy-bone--line" d="M132 399h96M137 421h86"/>
              <circle class="anatomy-joint" cx="95" cy="245" r="9"/>
              <circle class="anatomy-joint" cx="265" cy="245" r="9"/>
              <circle class="anatomy-joint" cx="92" cy="358" r="8"/>
              <circle class="anatomy-joint" cx="268" cy="358" r="8"/>
              <circle class="anatomy-joint" cx="117" cy="538" r="9"/>
              <circle class="anatomy-joint" cx="243" cy="538" r="9"/>
            </g>

            <g class="anatomy-layer anatomy-layer--ribs">
              <path class="anatomy-rib anatomy-rib--sternum" d="M180 174v111"/>
              <path class="anatomy-rib" d="M180 182c-32-4-57 8-73 29M180 182c32-4 57 8 73 29"/>
              <path class="anatomy-rib" d="M180 205c-38-5-66 11-84 38M180 205c38-5 66 11 84 38"/>
              <path class="anatomy-rib" d="M180 229c-35-1-61 14-77 39M180 229c35-1 61 14 77 39"/>
              <path class="anatomy-rib" d="M180 253c-28 2-48 13-62 33M180 253c28 2 48 13 62 33"/>
            </g>

            <g class="anatomy-layer anatomy-layer--heart">
              <path class="anatomy-heart-shadow" d="M180 323c-34-24-57-45-57-75 0-23 16-41 38-41 10 0 18 3 24 9 6-6 14-9 24-9 22 0 38 18 38 41 0 30-23 51-57 75l-10 7-10-7z"/>
              <path class="anatomy-heart" d="M180 314c-30-22-50-40-50-66 0-19 13-34 31-34 10 0 18 4 24 12 6-8 14-12 24-12 18 0 31 15 31 34 0 26-20 44-50 66l-5 4-5-4z"/>
              <path class="anatomy-heart-line" d="M155 247c7-9 19-9 26 2"/>
            </g>
          </svg>
        </div>
      </div>
    </section>
  `;

  const section = mount.querySelector('.anatomy-scroll');
  if (!section) return;

  const setProgress = (outline, skeleton, ribs, heart) => {
    section.style.setProperty('--outline-p', outline.toFixed(4));
    section.style.setProperty('--skeleton-p', skeleton.toFixed(4));
    section.style.setProperty('--ribs-p', ribs.toFixed(4));
    section.style.setProperty('--heart-p', heart.toFixed(4));
    section.style.setProperty('--outline-opacity', (0.16 + outline * 0.42).toFixed(4));
    section.style.setProperty('--skeleton-opacity', (skeleton * 0.82).toFixed(4));
    section.style.setProperty('--ribs-opacity', (ribs * 0.94).toFixed(4));
    section.style.setProperty('--heart-opacity', heart.toFixed(4));
    section.style.setProperty('--halo-opacity', (0.22 + skeleton * 0.18).toFixed(4));
    section.style.setProperty('--outline-y', `${((1 - outline) * 14).toFixed(2)}px`);
    section.style.setProperty('--skeleton-y', `${((1 - skeleton) * 22).toFixed(2)}px`);
    section.style.setProperty('--ribs-y', `${((1 - ribs) * 12).toFixed(2)}px`);
    section.style.setProperty('--heart-y', `${((1 - heart) * 18).toFixed(2)}px`);
    section.style.setProperty('--outline-scale', (0.985 + outline * 0.015).toFixed(4));
    section.style.setProperty('--skeleton-scale', (0.97 + skeleton * 0.03).toFixed(4));
    section.style.setProperty('--ribs-scale', (0.96 + ribs * 0.04).toFixed(4));
    section.style.setProperty('--heart-scale', (0.72 + heart * 0.28).toFixed(4));
    section.style.setProperty('--halo-scale', (0.96 + outline * 0.04).toFixed(4));
    section.classList.toggle('is-complete', heart > 0.96);
  };

  if (prefersReducedMotion) {
    setProgress(1, 1, 1, 1);
    return;
  }

  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
  const smoothstep = (edge0, edge1, value) => {
    const t = clamp((value - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
  };

  let isVisible = false;
  let rafId = null;

  const computeProgress = () => {
    const rect = section.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const travel = rect.height + vh * 0.12;
    const raw = (vh * 0.86 - rect.top) / travel;
    return clamp(raw);
  };

  const update = () => {
    rafId = null;

    const p = computeProgress();
    const outline = smoothstep(0.02, 0.24, p);
    const skeleton = smoothstep(0.20, 0.54, p);
    const ribs = smoothstep(0.43, 0.72, p);
    const heart = smoothstep(0.66, 0.94, p);

    setProgress(outline, skeleton, ribs, heart);
  };

  const requestUpdate = () => {
    if (!isVisible && rafId === null) return;
    if (rafId !== null) return;
    rafId = requestAnimationFrame(update);
  };

  const observer = new IntersectionObserver((entries) => {
    isVisible = entries.some((entry) => entry.isIntersecting);
    if (isVisible) requestUpdate();
  }, { rootMargin: '18% 0px 18% 0px', threshold: 0 });

  observer.observe(section);
  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', requestUpdate);

  isVisible = true;
  update();
})();
