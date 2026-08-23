/**
 * samaMascot.js — "Sama", the Samasemo platform mascot.
 *
 * Flat, vector (SVG) character (v2 design):
 *  - outer shape: a plain circle in the site's primary brand green
 *    (exact color via CSS var --color-primary — see css/mascot.css)
 *  - inner: a friendly white doctor figure clipped inside the disc,
 *    with a white coat, V-collar and a teal stethoscope loop across
 *    the chest (accessory detail, NOT the mouth)
 *  - face: simple round eyes + a small smile line
 *  - two round eyes with pupils that other modules can move
 *
 * This file only RENDERS the mascot and exposes a tiny API
 * (window.SamaMascot) used by the nav-hover effect.
 * Eye-tracking, navigation reactions and scroll decor live in
 * their own files so each piece can be edited/removed alone.
 */
(() => {
  const MOUNT_SELECTOR = '[data-sama-mascot]';

  /* ------------------------------------------------------------------ */
  /* Accessory icons shown next to the mascot when hovering nav links.   */
  /* Keyed by the value of data-mascot-icon on <a class="nav-link">.     */
  /* Add a new entry here + data attributes in HTML to add new sections. */
  /* ------------------------------------------------------------------ */
  const ACCESSORY_ICONS = {
    leaf: `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2C20 6 21 16 12 22C3 16 4 6 12 2Z"></path>
        <path d="M12 5v15"></path>
      </svg>`,
    dna: `
      <svg viewBox="0 0 24 40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M6 2c12 6 12 12 0 18s-12 12 0 18"></path>
        <path d="M18 2C6 8 6 14 18 20s12 12 0 18"></path>
        <path d="M8 7h8M8 33h8M9 14h6M9 26h6"></path>
      </svg>`,
    microscope: `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M6 18h12"></path>
        <path d="M3 22h18"></path>
        <path d="M14 4l-6 6 4 4 6-6z"></path>
        <path d="M9 13l-3 5h10"></path>
        <path d="M17 10c1.5 1.5 1.5 4 0 6"></path>
      </svg>`,
    chat: `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5z"></path>
        <circle cx="9" cy="12" r="0.5"></circle>
        <circle cx="13" cy="12" r="0.5"></circle>
        <circle cx="17" cy="12" r="0.5"></circle>
      </svg>`,
    chart: `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 21h18"></path>
        <path d="M7 21V11"></path>
        <path d="M12 21V4"></path>
        <path d="M17 21v-7"></path>
      </svg>`,
    cap: `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 9l10-5 10 5-10 5z"></path>
        <path d="M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"></path>
        <path d="M22 9v6"></path>
      </svg>`
  };

  /* The full mascot markup. Colors come from CSS custom properties
     (--sama-body, --sama-line ...) declared in css/mascot.css, so
     re-theming never requires touching this file.                     */
  const MASCOT_HTML = `
    <div class="sama-stage">
      <!-- Speech bubble: filled by mascotNavHover.js -->
      <div class="sama-bubble" role="status" aria-live="polite">
        <span class="sama-bubble-text"></span>
      </div>

      <!-- Accessory badge: icon swapped by mascotNavHover.js -->
      <div class="sama-accessory" aria-hidden="true"></div>

      <!--
        SVG structure (flat / no gradients so it scales crisply):
          circle.sama-body -> brand-green disc (the outer shape)
          white group      -> doctor figure clipped inside the disc
          .sama-eye        -> one eye (blinks via CSS, unchanged)
          .sama-pupil      -> pupil group; eye-tracking moves THIS only
      -->
      <svg class="sama-svg" viewBox="0 0 220 220" role="img" aria-label="ساما، تميمة منصة المرسال">
        <defs>
          <clipPath id="sama-circle-clip">
            <circle cx="110" cy="110" r="100"/>
          </clipPath>
        </defs>

        <!-- Outer body: a plain circle in the site's primary brand green.
             Fill comes from --sama-body (mapped to var(--color-primary)
             in css/mascot.css), so it matches the site exactly. -->
        <circle class="sama-body" cx="110" cy="110" r="100"/>

        <!-- White doctor character, clipped so nothing pokes outside -->
        <g clip-path="url(#sama-circle-clip)">
          <!-- White coat: rounded-torso arch across the bottom of the disc -->
          <path fill="#FFFFFF"
            d="M46 226 V196 C46 170 68 153 94 151 H126 C152 153 174 170 174 196 V226 Z"/>
          <!-- V collar notch: green shows through to suggest lapels -->
          <path fill="var(--sama-body)" d="M95 151 L110 171 L125 151 Z"/>

          <!-- Stethoscope draped around the neck across the chest,
               ending in the chest piece (separate accessory detail) -->
          <g fill="none" stroke="var(--sama-tube)" stroke-width="5.5" stroke-linecap="round">
            <path d="M94 154 C86 192 134 192 126 154"/>
            <path d="M110 186 C112 193 116 195 121 196"/>
          </g>
          <circle cx="127" cy="197" r="7.5" fill="#FFFFFF" stroke="var(--sama-tube)" stroke-width="4.5"/>
          <circle cx="127" cy="197" r="2.6" fill="var(--sama-tube)"/>
        </g>

        <!-- Face: kept minimal and flat on a round white head -->
        <circle cx="110" cy="92" r="46" fill="#FFFFFF"/>

        <!-- Eyes: ringed sclera so they read against the white head;
             same class hooks as before (blink + pupil tracking) -->
        <g class="sama-eye">
          <circle cx="93" cy="87" r="12.5" fill="#FFFFFF"
                  stroke="var(--sama-line)" stroke-opacity="0.18" stroke-width="1.5"/>
          <g class="sama-pupil">
            <circle cx="93" cy="87" r="5.8" fill="var(--sama-pupil-color)"/>
            <circle cx="90.6" cy="84.6" r="2" fill="#FFFFFF"/>
          </g>
        </g>
        <g class="sama-eye">
          <circle cx="127" cy="87" r="12.5" fill="#FFFFFF"
                  stroke="var(--sama-line)" stroke-opacity="0.18" stroke-width="1.5"/>
          <g class="sama-pupil">
            <circle cx="127" cy="87" r="5.8" fill="var(--sama-pupil-color)"/>
            <circle cx="124.6" cy="84.6" r="2" fill="#FFFFFF"/>
          </g>
        </g>

        <!-- Soft blush + small friendly mouth line -->
        <ellipse cx="79" cy="105" rx="6.5" ry="4" fill="var(--sama-cheek-color)"/>
        <ellipse cx="141" cy="105" rx="6.5" ry="4" fill="var(--sama-cheek-color)"/>
        <path d="M101 111 Q110 120 119 111" fill="none"
              stroke="var(--sama-line)" stroke-width="4" stroke-linecap="round"/>
      </svg>
    </div>`;

  const mount = document.querySelector(MOUNT_SELECTOR);
  if (!mount) return;

  mount.classList.add('sama-mascot');
  mount.innerHTML = MASCOT_HTML;

  const stage = mount.querySelector('.sama-stage');
  const bubble = mount.querySelector('.sama-bubble');
  const bubbleText = mount.querySelector('.sama-bubble-text');
  const accessory = mount.querySelector('.sama-accessory');
  let hideTimer = null;

  /**
   * Show an accessory icon + caption near the mascot.
   * Called by mascotNavHover.js while a nav item is hovered/focused.
   * @param {string} iconKey  key inside ACCESSORY_ICONS
   * @param {string} caption  short one-line Arabic caption
   */
  const reveal = (iconKey, caption) => {
    clearTimeout(hideTimer);

    // Swap the accessory icon with a small springy "pop".
    if (iconKey && ACCESSORY_ICONS[iconKey]) {
      accessory.innerHTML = ACCESSORY_ICONS[iconKey];
      accessory.hidden = false;
      accessory.classList.remove('pop');
      void accessory.offsetWidth; // force reflow so the animation restarts
      accessory.classList.add('pop');
    }

    if (caption) {
      bubbleText.textContent = caption;
      bubble.hidden = false;
      requestAnimationFrame(() => bubble.classList.add('show'));
    }

    stage.classList.add('is-engaged'); // lets CSS do a happy little bounce
  };

  /** Reverse everything cleanly when hovering stops. */
  const hide = () => {
    bubble.classList.remove('show');
    stage.classList.remove('is-engaged');
    // Keep elements in the DOM until the CSS transition ends,
    // otherwise the fade-out would be cut off abruptly.
    hideTimer = setTimeout(() => {
      bubble.hidden = true;
      accessory.hidden = true;
    }, 350);
  };

  window.SamaMascot = { reveal, hide };
})();
