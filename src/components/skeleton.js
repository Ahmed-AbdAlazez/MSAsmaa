/**
 * skeleton.js — reusable pulsing placeholder component.
 *
 * Vanilla-JS friendly (this project is a plain-JS + Vite multi-page app, no
 * component framework). Exports a tiny factory that returns HTML string for
 * a shimmering skeleton shape, plus helpers that compose rows/lists so every
 * loading state across the app shares ONE design.
 *
 * Usage:
 *   import { skeleton, skeletonRows, skeletonCards } from "./components/skeleton.js";
 *
 *   container.innerHTML = skeletonRows(3);            // 3 notification-like rows
 *   container.innerHTML = skeletonCards(2);           // 2 card-shaped blocks
 *   container.innerHTML = skeleton({ width: 40 });    // one inline rectangle
 *
 * All shapes are generic gray blocks that adapt to light/dark via the
 * --skeleton-* tokens in style.css.
 */

function shapeAttr({ width = "100%", height = 16, circle = false, radius }) {
  const styleParts = [];
  if (width !== undefined) styleParts.push(`width:${width}`);
  if (height !== undefined) styleParts.push(`height:${height}`);
  if (circle) styleParts.push("border-radius:50%");
  else if (radius) styleParts.push(`border-radius:${radius}`);
  return `class="skeleton-shape${circle ? " skeleton-circle" : ""}" style="${styleParts.join(";")}"`;
}

/**
 * A single skeleton shape (rectangle, circle, or text-line).
 * @param {object} opts { width, height, circle, radius }
 */
export function skeleton(opts = {}) {
  return `<span ${shapeAttr(opts)}></span>`;
}

/**
 * A row mimicking a list of icon + two text lines (used for notification
 * menus and similar item lists).
 * @param {object} opts { count }
 */
export function skeletonListRow(opts = {}) {
  const { count = 1 } = opts;
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    rows.push(`
      <div class="skeleton-list-row">
        ${skeleton({ width: 40, height: 40, circle: true })}
        <div class="skeleton-list-lines">
          ${skeleton({ height: 14, width: "70%" })}
          ${skeleton({ height: 11, width: "100%" })}
        </div>
      </div>
    `);
  }
  return `<div class="skeleton-block">${rows.join("")}</div>`;
}

/**
 * N list rows (delegates to skeletonListRow with count).
 */
export function skeletonRows(count = 3) {
  return skeletonListRow({ count });
}

/**
 * A card-shaped placeholder block (used for exam cards, dashboard cards…).
 * @param {object} opts { count, headerLines }
 */
export function skeletonCards(count = 2) {
  const cards = [];
  for (let i = 0; i < count; i += 1) {
    cards.push(`
      <div class="skeleton-card">
        ${skeleton({ height: 18, width: "60%" })}
        ${skeleton({ height: 12, width: "100%" })}
        ${skeleton({ height: 12, width: "85%" })}
        <div style="height:10px"></div>
        ${skeleton({ height: 34, width: "45%", radius: "8px" })}
      </div>
    `);
  }
  return `<div class="skeleton-grid">${cards.join("")}</div>`;
}

/**
 * A simple full-width block of N stacked lines. Useful for tables/lists.
 */
export function skeletonLines(count = 4) {
  const lines = [];
  for (let i = 0; i < count; i += 1) {
    const width = `${92 - i * 9}%`;
    lines.push(skeleton({ height: 13, width }));
  }
  return `<div class="skeleton-block">${lines.join("")}</div>`;
}

/**
 * Standard inline error + retry state shown INSIDE an already-open panel
 * when the data fetch fails. Returns HTML string; wire the optional
 * onRetry() callback yourself via .skeleton-retry-btn.
 */
export function skeletonError(message = "تعذر تحميل البيانات، حاولي مرة أخرى.", retryLabel = "إعادة المحاولة") {
  const safe = String(message)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return `
    <div class="skeleton-error" role="alert">
      <p>${safe}</p>
      <button type="button" class="btn btn-secondary btn-sm skeleton-retry-btn">${retryLabel}</button>
    </div>
  `;
}

export default { skeleton, skeletonRows, skeletonCards, skeletonLines, skeletonError, skeletonListRow };
