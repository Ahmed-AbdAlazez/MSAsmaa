/**
 * anatomyScrollSection.js - GSAP ScrollTrigger anatomy build.
 *
 * Renders a single SVG scene into [data-anatomy-scroll-section], then drives
 * one scrubbed GSAP timeline with ScrollTrigger. No Intersection Observer or
 * hand-built scroll percentage logic is used for the layer reveal.
 */
(() => {
  const mount = document.querySelector('[data-anatomy-scroll-section]');
  if (!mount) return;

  mount.innerHTML = `
    <section class="anatomy-scroll" aria-label="Scroll-driven layered anatomy illustration">
      <div class="anatomy-scroll__sticky">
        <div class="anatomy-scroll__stage">
          <div class="anatomy-scroll__halo" aria-hidden="true"></div>
          <svg class="anatomy-scroll__svg" viewBox="0 0 360 620" role="img" aria-labelledby="anatomy-title anatomy-desc">
            <title id="anatomy-title">Layered human anatomy illustration</title>
            <desc id="anatomy-desc">A flat vector human body builds from outline to skeleton, rib cage highlight, and heart as the page scrolls.</desc>

            <g class="anatomy-hospital" aria-hidden="true">
              <rect class="anatomy-room-wall" x="18" y="18" width="324" height="584" rx="28"/>
              <rect class="anatomy-room-window" x="52" y="54" width="86" height="74" rx="14"/>
              <path class="anatomy-room-window-line" d="M95 58v66M56 91h78"/>
              <rect class="anatomy-room-chart" x="232" y="56" width="62" height="78" rx="14"/>
              <path class="anatomy-room-cross" d="M263 75v39M244 95h38"/>
              <rect class="anatomy-room-monitor" x="232" y="172" width="72" height="54" rx="12"/>
              <path class="anatomy-room-pulse" d="M244 200h13l8-15 11 29 8-14h8"/>
              <path class="anatomy-room-rail" d="M47 416h266"/>
              <path class="anatomy-room-floor" d="M37 514c48-28 238-28 286 0v44H37z"/>
              <rect class="anatomy-room-bed" x="72" y="405" width="216" height="36" rx="18"/>
              <path class="anatomy-room-bed-leg" d="M105 437v48M255 437v48"/>
            </g>

            <g class="anatomy-layer anatomy-layer--outline">
              <path class="anatomy-outline-fill" d="M180 39c35 0 62 27 62 62 0 24-13 45-32 55v35l43 18c22 9 39 27 46 50l28 91c5 16-4 33-20 38-15 5-31-3-37-18l-26-75-5 122 41 121c6 18-3 37-21 43-17 6-36-3-42-20l-37-101-37 101c-6 17-25 26-42 20-18-6-27-25-21-43l41-121-5-122-26 75c-6 15-22 23-37 18-16-5-25-22-20-38l28-91c7-23 24-41 46-50l43-18v-35c-19-10-32-31-32-55 0-35 27-62 62-62z"/>
              <path class="anatomy-outline-stroke" d="M180 39c35 0 62 27 62 62 0 24-13 45-32 55v35l43 18c22 9 39 27 46 50l28 91c5 16-4 33-20 38-15 5-31-3-37-18l-26-75-5 122 41 121c6 18-3 37-21 43-17 6-36-3-42-20l-37-101-37 101c-6 17-25 26-42 20-18-6-27-25-21-43l41-121-5-122-26 75c-6 15-22 23-37 18-16-5-25-22-20-38l28-91c7-23 24-41 46-50l43-18v-35c-19-10-32-31-32-55 0-35 27-62 62-62z"/>
              <path class="anatomy-lung anatomy-lung--left" d="M169 182c-30 14-45 47-39 91 3 22 16 36 34 34 15-2 22-17 20-39-3-35-1-61 7-81-5-5-12-6-22-5z"/>
              <path class="anatomy-lung anatomy-lung--right" d="M191 182c30 14 45 47 39 91-3 22-16 36-34 34-15-2-22-17-20-39 3-35 1-61-7-81 5-5 12-6 22-5z"/>
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

  if (!window.gsap || !window.ScrollTrigger) {
    mount.querySelector('.anatomy-scroll')?.classList.add('anatomy-scroll--static');
    return;
  }

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;
  gsap.registerPlugin(ScrollTrigger);

  const section = mount.querySelector('.anatomy-scroll');
  const pinTarget = mount.querySelector('.anatomy-scroll__sticky');
  const halo = mount.querySelector('.anatomy-scroll__halo');
  const hospital = mount.querySelector('.anatomy-hospital');
  const outline = mount.querySelector('.anatomy-layer--outline');
  const skeleton = mount.querySelector('.anatomy-layer--skeleton');
  const ribs = mount.querySelector('.anatomy-layer--ribs');
  const heart = mount.querySelector('.anatomy-layer--heart');

  if (!section || !pinTarget || !outline || !skeleton || !ribs || !heart) return;

  if (prefersReducedMotion) {
    section.classList.add('anatomy-scroll--static');
    return;
  }

  gsap.set([outline, skeleton, ribs, heart, halo, hospital], {
    transformOrigin: '50% 50%',
    force3D: true,
  });

  gsap.set(outline, { autoAlpha: 0.16, y: 14, scale: 0.985 });
  gsap.set(skeleton, { autoAlpha: 0, y: 22, scale: 0.97 });
  gsap.set(ribs, { autoAlpha: 0, y: 12, scale: 0.96 });
  gsap.set(heart, { autoAlpha: 0, y: 18, scale: 0.72 });
  gsap.set(halo, { autoAlpha: 0.22, scale: 0.96 });
  gsap.set(hospital, { autoAlpha: 0.82 });

  const heartPulse = gsap.to(heart, {
    scale: 1.045,
    duration: 0.72,
    repeat: -1,
    yoyo: true,
    ease: 'sine.inOut',
    paused: true,
    transformOrigin: '50% 50%',
  });

  const stopHeartPulse = () => {
    heartPulse.pause(0);
    gsap.set(heart, { scale: 1 });
  };

  const timeline = gsap.timeline({
    defaults: { ease: 'power2.inOut' },
    scrollTrigger: {
      trigger: section,
      pin: pinTarget,
      pinSpacing: true,
      start: 'top top',
      end: () => (window.matchMedia('(max-width: 600px)').matches ? '+=85%' : '+=115%'),
      scrub: 1,
      invalidateOnRefresh: true,
      anticipatePin: 1,
      onLeave: () => heartPulse.play(),
      onEnterBack: stopHeartPulse,
      onLeaveBack: stopHeartPulse,
    },
  });

  timeline
    .addLabel('outline')
    .to(halo, { autoAlpha: 0.4, scale: 1, duration: 0.9 }, 'outline')
    .to(hospital, { autoAlpha: 1, duration: 0.8 }, 'outline')
    .to(outline, { autoAlpha: 0.58, y: 0, scale: 1, duration: 1 }, 'outline')
    .addLabel('skeleton', 0.72)
    .to(skeleton, { autoAlpha: 0.82, y: 0, scale: 1, duration: 1.15 }, 'skeleton')
    .to(outline, { autoAlpha: 0.44, duration: 0.75 }, 'skeleton+=0.35')
    .addLabel('ribs', 1.45)
    .to(ribs, { autoAlpha: 0.98, y: 0, scale: 1.025, duration: 0.8 }, 'ribs')
    .to(ribs, { scale: 1, duration: 0.35 }, 'ribs+=0.8')
    .addLabel('heart', 2.06)
    .to(heart, { autoAlpha: 1, y: 0, scale: 1, duration: 1 }, 'heart')
    .to(ribs, { autoAlpha: 0.9, duration: 0.45 }, 'heart+=0.2')
    .addLabel('complete', 3.15);

  window.addEventListener('load', () => ScrollTrigger.refresh(), { once: true });
})();
