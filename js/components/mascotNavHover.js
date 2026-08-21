/**
 * mascotNavHover.js — Effect 2: mascot reacts to nav item hovering.
 *
 * Wiring (see MASCOT_DESIGN_README.md):
 *   Any element matching NAV_LINK_SELECTOR that carries
 *     data-mascot-icon="leaf | dna | microscope | chat | chart | cap"
 *     data-mascot-caption="short one-line caption"
 *   will make Sama show that accessory icon + speech-bubble caption
 *   while hovered (or keyboard-focused), and revert on leave.
 *
 * All motion is CSS transitions (css/mascot.css) — this file only
 * toggles classes/content, so it stays smooth and cheap.
 */
(() => {
  const NAV_LINK_SELECTOR = '.navbar .nav-link[data-mascot-icon]';
  const sama = window.SamaMascot;
  if (!sama) return; // mascot component missing — fail silently

  const links = document.querySelectorAll(NAV_LINK_SELECTOR);

  links.forEach((link) => {
    const iconKey = link.dataset.mascotIcon;
    const caption = link.dataset.mascotCaption;

    // pointerenter/leave cover mouse; focusin/focusout cover keyboard tabbing.
    link.addEventListener('pointerenter', () => sama.reveal(iconKey, caption));
    link.addEventListener('focus', () => sama.reveal(iconKey, caption));
    link.addEventListener('pointerleave', () => sama.hide());
    link.addEventListener('blur', () => sama.hide());
  });
})();
