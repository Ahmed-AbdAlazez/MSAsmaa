/* v4 fix-up: applies the ops v3's naive skip-check wrongly skipped.
   Every op asserts completion afterwards. */
const fs = require('fs');
const file = 'css/style.css';
const raw = fs.readFileSync(file, 'utf8');
const hadCR = raw.includes('\r\n');
let src = hadCR ? raw.split('\r\n').join('\n') : raw;
let fail = false;

function rep(from, to, label) {
  const n = src.split(from).length - 1;
  if (n === 0) { console.log('FAIL(not found): ' + label); fail = true; return; }
  src = src.split(from).join(to);
  if (src.split(from).length - 1 !== 0) { console.log('FAIL(leftover): ' + label); fail = true; return; }
  console.log('ok x' + n + ': ' + label);
}

rep('linear-gradient(135deg, rgba(255, 255, 255, 0.96) 0%, rgba(241, 253, 250, 0.92) 100%);',
    'var(--surface-glass);', 'quiz-workspace bg');
rep('linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, rgba(247, 255, 251, 0.95) 100%)',
    'var(--surface-glass)', 'teacher-bio-card bg');
rep(`radial-gradient(circle at top right, rgba(16, 185, 129, 0.08) 0%, transparent 35%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 255, 250, 0.98) 100%)`,
    'var(--surface-glass)', 'welcome-modal bg');

// Round icon buttons (notification + login): white bg + light border
{
  const before = src;
  src = src.split(`background: rgba(255, 255, 255, 0.9);`).join(`background: var(--surface-solid);`);
  src = src.split(`border: 1px solid rgba(226, 232, 240, 0.95);`).join(`border: 1px solid var(--color-border);`);
  console.log(src === before ? 'FAIL: round-btn pair untouched' : 'ok: round-btn pair');
}

rep('background: rgba(255, 255, 255, 0.98);', 'background: var(--surface-solid);', 'notification-menu bg');
rep('rgba(226, 232, 240, 0.85)', 'var(--color-border)', 'contact-item border');
{
  const b = src;
  src = src.split('rgba(255, 255, 255, 0.82)').join('var(--surface-glass)');
  src = src.split('rgba(226, 232, 240, 0.9)').join('var(--color-border)');
  console.log(src === b ? 'FAIL: teacher-grid pair untouched' : 'ok: teacher-grid pair');
}
rep('rgba(226, 232, 240, 0.5)', 'var(--color-border)', 'sidebar-item border');
{
  const b = src;
  src = src.split('rgba(226, 232, 240, 0.95)').join('var(--color-border)');   // chatbot panel border
  src = src.split('linear-gradient(180deg, rgba(248, 250, 252, 0.96), rgba(255, 255, 255, 0.94))')
           .join('var(--surface-solid)');                                       // chatbot topbar
  src = src.split('linear-gradient(180deg, rgba(248, 250, 252, 0.64), rgba(255, 255, 255, 0.82))')
           .join('transparent');                                                // chatbot messages bg
  src = src.split('rgba(226, 232, 240, 0.86)').join('var(--color-border)');     // chat bubble border
  console.log(src === b ? 'FAIL: chat surfaces untouched' : 'ok: chat surfaces');
}
rep('background: white;', 'background: var(--color-surface);', 'white bubbles/icons');

fs.writeFileSync(file, hadCR ? src.split('\n').join('\r\n') : src);

// Final audit: no light-only literals may remain outside the :root/dark token blocks.
const bodyOnly = src.slice(src.indexOf('[data-theme="dark"]'));
const head = src.slice(0, src.indexOf('--color-heading:'));
const offenders = [];
for (const p of ['rgba(255, 255, 255', 'rgba(248, 250, 252', 'rgba(226, 232, 240', '#fffaf0', 'background: white;']) {
  let i = -1;
  while ((i = src.indexOf(p, i + 1)) !== -1) {
    if (i > head.length && i < src.indexOf('[data-theme="dark"]')) {
      offenders.push(src.slice(0, i).split('\n').length + ': ' + src.slice(i, i + 60).split('\n')[0]);
    }
  }
}
console.log(offenders.length ? 'REMAINING:\n' + offenders.join('\n') : 'AUDIT CLEAN (component rules converted)');
console.log(fail ? 'SOME OPS FAILED' : 'ALL OPS OK');
