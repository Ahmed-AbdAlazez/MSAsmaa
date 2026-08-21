/**
 * samaMascot.js — "Sama", the Samasemo platform mascot.
 *
 * A flat, vector (SVG) character:
 *  - rounded cell-like blob body (biology nod)
 *  - a stethoscope loop drawn as the mouth/smile (medical nod)
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
          .sama-body       -> the blob
          .sama-eye        -> white of one eye (blinks via CSS)
          .sama-pupil      -> pupil group; eye-tracking moves THIS only
      -->
      <svg class="sama-svg" viewBox="0 0 220 220" role="img" aria-label="ساما، تميمة منصة المرسال">
        <!-- Body: rounded cell-like blob -->
        <path class="sama-body"
          d="M55 30 C85 8 135 8 165 30 C195 52 205 95 192 130 C179 165 145 190 110 192 C75 194 38 172 25 137 C12 102 25 52 55 30 Z"/>
        <!-- soft membrane highlight (kept flat, low opacity) -->
        <path d="M60 34 C86 16 128 14 154 28 C130 22 90 26 68 44 C58 52 52 62 50 74 C46 58 50 42 60 34 Z"
              fill="rgba(255,255,255,0.22)"/>
        <!-- membrane dots like organelles -->
        <circle cx="63" cy="63" r="6" fill="rgba(255,255,255,0.30)"/>
        <circle cx="163" cy="72" r="5" fill="rgba(255,255,255,0.30)"/>
        <circle cx="48" cy="150" r="4" fill="rgba(255,255,255,0.22)"/>

        <!-- Eyes -->
        <g class="sama-eye">
          <circle cx="82" cy="95" r="20" fill="#FFFFFF"/>
          <g class="sama-pupil">
            <circle cx="82" cy="95" r="8.5" fill="var(--sama-pupil-color)"/>
            <circle cx="79" cy="92" r="2.6" fill="#FFFFFF"/>
          </g>
        </g>
        <g class="sama-eye">
          <circle cx="138" cy="95" r="20" fill="#FFFFFF"/>
          <g class="sama-pupil">
            <circle cx="138" cy="95" r="8.5" fill="var(--sama-pupil-color)"/>
            <circle cx="135" cy="92" r="2.6" fill="#FFFFFF"/>
          </g>
        </g>

        <!-- Blush cheeks -->
        <ellipse cx="60" cy="126" rx="10" ry="6" fill="var(--sama-cheek-color)"/>
        <ellipse cx="160" cy="126" rx="10" ry="6" fill="var(--sama-cheek-color)"/>

        <!-- Stethoscope smile:
             main arc = the tube held like a grin,
             it continues down into the chest-piece (diaphragm). -->
        <g fill="none" stroke="var(--sama-line)" stroke-width="7" stroke-linecap="round">
          <path d="M70 132 Q110 162 150 132"/>
          <path d="M70 132 Q64 128 61 122"/>          <!-- left ear-tip stub -->
          <path d="M150 132 Q161 143 157 155"/>       <!-- tube to chest piece -->
        </g>
        <circle cx="60" cy="119" r="4.5" fill="var(--sama-line)"/>
        <circle cx="157" cy="166" r="11" fill="var(--sama-chest-inner)" stroke="var(--sama-line)" stroke-width="5"/>
        <circle cx="157" cy="166" r="3.2" fill="var(--sama-line)"/>
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
