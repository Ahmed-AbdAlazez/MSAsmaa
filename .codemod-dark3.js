/* Dark-mode codemod v3 — regex-free, idempotent, EOL-preserving.
   Ops are [from, to, expectedCount?] tuples applied on LF-normalized text. */
const fs = require('fs');

function apply(file, ops) {
  const raw = fs.readFileSync(file, 'utf8');
  const hadCR = raw.includes('\r\n');
  let src = hadCR ? raw.split('\r\n').join('\n') : raw;

  for (const [from, to, count] of ops) {
    if (src.includes(to)) { console.log(`SKIP ${file}: already -> [${to.slice(0, 44)}]`); continue; }
    const n = src.split(from).length - 1;
    if (n === 0) { console.log(`MISS ${file}: [${JSON.stringify(from.slice(0, 64))}]`); continue; }
    if (count !== undefined && n !== count) {
      console.log(`COUNT-MISMATCH ${file}: expected ${count} got ${n} for [${from.slice(0, 50)}]`);
      continue;
    }
    src = src.split(from).join(to);
    console.log(`APPLY x${n} ${file}: [${from.slice(0, 48)}]`);
  }

  fs.writeFileSync(file, hadCR ? src.split('\n').join('\r\n') : src);
}

/* ============================ HTML pages ================================= */
const THEME_BOOT = [
  '  <script>',
  '    // Theme bootstrap: runs before first paint so there is no flash of the',
  '    // wrong theme. Stored choice wins; otherwise follow the OS preference.',
  '    (function () {',
  '      try {',
  "        var t = localStorage.getItem('theme');",
  "        if (t !== 'light' && t !== 'dark') {",
  "          t = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';",
  '        }',
  "        document.documentElement.setAttribute('data-theme', t);",
  '      } catch (e) {',
  "        document.documentElement.setAttribute('data-theme', 'light');",
  '      }',
  '    })();',
  '  </script>',
].join('\n');

const TOGGLE =
  '<button class="theme-toggle" type="button" aria-label="تبديل الوضع الليلي" title="تبديل الوضع الليلي/النهاري">' +
  '<span class="ti-sun">☀️</span><span class="ti-moon">🌙</span></button>';

for (const page of [
  'index.html', 'course-biology.html', 'assignments.html', 'chatbots.html',
  'dashboard-student.html', 'dashboard-teacher.html', 'lesson-view.html',
  'assignment-view.html', 'lessons.html',
]) {
  apply(page, [
    ['<meta name="viewport" content="width=device-width, initial-scale=1.0">',
     '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' + THEME_BOOT],
    ['<div class="nav-actions">',
     '<div class="nav-actions">\n        ' + TOGGLE],
    ['<button class="mobile-drawer-close">✕</button>',
     TOGGLE + '\n      <button class="mobile-drawer-close">✕</button>'],
  ]);
}

/* ============================ style.css ================================== */
apply('css/style.css', [
  /* --- semantic text colors ------------------------------------------- */
  ['color: var(--color-primary-dark);', 'color: var(--color-heading);', undefined], // all text usages
  ['color: var(--color-primary);', 'color: var(--color-primary-ink);', undefined],
  ['background-color: var(--color-primary);', 'background-color: var(--color-primary-ink);', undefined], // nav/tab underline bars
  ['border-color: var(--color-primary);', 'border-color: var(--color-primary-ink);', undefined],

  /* --- page canvas / big sections ------------------------------------- */
  [`  background:
    radial-gradient(circle at 15% 10%, rgba(20, 184, 166, 0.12) 0, transparent 28%),
    radial-gradient(circle at 85% 15%, rgba(16, 185, 129, 0.12) 0, transparent 26%),
    radial-gradient(circle at 70% 85%, rgba(6, 182, 212, 0.1) 0, transparent 22%),
    linear-gradient(180deg, #f4fffb 0%, #f8fafc 18%, #f7fbf7 100%);`,
   '  background: var(--bg-canvas);'],
  [`    linear-gradient(135deg, rgba(255, 255, 255, 0.82) 0%, rgba(247, 255, 251, 0.96) 45%, rgba(241, 253, 250, 0.88) 100%);`,
   '    var(--hero-bg);'],
  [`    linear-gradient(180deg, rgba(255, 255, 255, 0.9) 0%, rgba(247, 252, 249, 0.96) 100%);`,
   '    var(--section-alt-bg);'],
  [`    radial-gradient(circle at 35% 35%, rgba(255, 255, 255, 0.88) 0%, rgba(240, 255, 249, 0.8) 22%, rgba(255, 255, 255, 0.94) 58%, rgba(16, 185, 129, 0.03) 100%);
  border: 1px solid rgba(15, 76, 58, 0.12);`,
   `    var(--cell-art-bg);
  border: 1px solid var(--cell-art-border);`],

  /* --- glassy surfaces ------------------------------------------------- */
  ['linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, rgba(255, 255, 255, 0.92) 100%)', 'var(--surface-glass)'],
  ['linear-gradient(135deg, rgba(255, 255, 255, 0.96) 0%, rgba(241, 253, 250, 0.92) 100%)', 'var(--surface-glass)'],
  ['linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, rgba(247, 255, 251, 0.95) 100%)', 'var(--surface-glass)'],
  [`radial-gradient(circle at top right, rgba(16, 185, 129, 0.08) 0%, transparent 35%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 255, 250, 0.98) 100%)`, 'var(--surface-glass)'],
  ['rgba(255, 255, 255, 0.82)', 'var(--surface-glass)', undefined],
  ['rgba(255, 255, 255, 0.92);', 'var(--surface-glass);'],               // chatbot panel bg
  ['rgba(255, 255, 255, 0.88);', 'var(--surface-glass-strong);'],        // hero badge bg
  ['rgba(255, 255, 255, 0.9);', 'var(--surface-solid);'],                // notification btn bg
  ['rgba(255, 255, 255, 0.98);', 'var(--surface-solid);'],               // notification menu bg
  ['rgba(248, 250, 252, 0.72);', 'var(--row-hover);'],                   // contact item bg
  ['rgba(248, 250, 252, 0.8);', 'var(--row-hover);'],                    // table row hover
  ['rgba(255, 255, 255, 0.94);', 'var(--input-bg);', undefined],
  ['rgba(226, 232, 240, 0.95);', 'var(--color-border);', undefined],
  ['rgba(226, 232, 240, 0.86);', 'var(--color-border);'],                // chat bubble border
  ['rgba(226, 232, 240, 0.5);', 'var(--color-border);'],                 // sidebar item border

  /* --- navbar ----------------------------------------------------------- */
  [`  background: rgba(255, 255, 255, 0.8);
  border-bottom: 1px solid rgba(226, 232, 240, 0.9);`,
   `  background: var(--navbar-bg);
  border-bottom: 1px solid var(--navbar-border);`],

  /* --- chat page --------------------------------------------------------- */
  ['linear-gradient(180deg, rgba(248, 250, 252, 0.96), rgba(255, 255, 255, 0.94))', 'var(--surface-solid)'],
  ['linear-gradient(180deg, rgba(248, 250, 252, 0.64), rgba(255, 255, 255, 0.82))', 'transparent'],
  ['background: white;', 'background: var(--color-surface);', undefined],
  ['#fffaf0', 'var(--bubble-warm)'],
  ['rgba(255, 255, 255, 0.94);\n}\n\n.chatbot-input', 'var(--surface-glass);\n}\n\n.chatbot-input'],

  /* --- misc tints -------------------------------------------------------- */
  ['linear-gradient(135deg, rgba(15, 76, 58, 0.07), rgba(6, 182, 212, 0.07))', 'var(--soft-tint)'],
  ['rgba(15, 76, 58, 0.15);', 'var(--progress-track);'],

  /* --- tokens + dark theme block + toggle styles ------------------------- */
  [`  --transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}`,
  `  --transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

  /* Semantic aliases — text/surfaces that must adapt between themes.
     Light values mirror the hardcoded colors they replace. */
  --color-heading: #093327;            /* headings / deep-green text */
  --color-primary-ink: #0F4C3A;        /* brand green used as text/icons/bars */
  --navbar-bg: rgba(255, 255, 255, 0.8);
  --navbar-border: rgba(226, 232, 240, 0.9);
  --surface-glass: rgba(255, 255, 255, 0.92);
  --surface-glass-strong: rgba(255, 255, 255, 0.88);
  --surface-solid: #FFFFFF;
  --input-bg: rgba(255, 255, 255, 0.94);
  --row-hover: rgba(248, 250, 252, 0.8);
  --bubble-warm: #FFFAF0;              /* warm teacher-chat bubble */
  --soft-tint: linear-gradient(135deg, rgba(15, 76, 58, 0.07), rgba(6, 182, 212, 0.07));
  --progress-track: rgba(15, 76, 58, 0.15);
  --bg-canvas:
    radial-gradient(circle at 15% 10%, rgba(20, 184, 166, 0.12) 0, transparent 28%),
    radial-gradient(circle at 85% 15%, rgba(16, 185, 129, 0.12) 0, transparent 26%),
    radial-gradient(circle at 70% 85%, rgba(6, 182, 212, 0.1) 0, transparent 22%),
    linear-gradient(180deg, #f4fffb 0%, #f8fafc 18%, #f7fbf7 100%);
  --hero-bg: linear-gradient(135deg, rgba(255, 255, 255, 0.82) 0%, rgba(247, 255, 251, 0.96) 45%, rgba(241, 253, 250, 0.88) 100%);
  --section-alt-bg: linear-gradient(180deg, rgba(255, 255, 255, 0.9) 0%, rgba(247, 252, 249, 0.96) 100%);
  --cell-art-bg: radial-gradient(circle at 35% 35%, rgba(255, 255, 255, 0.88) 0%, rgba(240, 255, 249, 0.8) 22%, rgba(255, 255, 255, 0.94) 58%, rgba(16, 185, 129, 0.03) 100%);
  --cell-art-border: rgba(15, 76, 58, 0.12);
}

/* ==========================================================================
   DARK THEME — swaps token values only; components never duplicate styles.
   Accent greens shift lighter here so they stay legible on dark surfaces.
   ========================================================================== */
[data-theme="dark"] {
  color-scheme: dark;

  --color-bg: #0C1420;
  --color-surface: #14212F;
  --color-text-main: #E6EDF5;
  --color-text-muted: #9DB0C3;
  --color-border: #263B52;

  --color-heading: #D6F5E8;            /* mint-white headings */
  --color-primary-ink: #5EEAD4;        /* teal-mint brand text */
  --color-accent-dark: #34D399;        /* brighter green for small text */
  --color-warning: #FBBF24;            /* amber that reads on dark */

  --navbar-bg: rgba(12, 20, 32, 0.82);
  --navbar-border: rgba(38, 59, 82, 0.9);
  --surface-glass: rgba(20, 33, 47, 0.92);
  --surface-glass-strong: rgba(20, 33, 47, 0.88);
  --surface-solid: #16273A;
  --input-bg: rgba(9, 16, 25, 0.65);
  --row-hover: rgba(36, 54, 76, 0.55);
  --bubble-warm: #2E2718;
  --soft-tint: linear-gradient(135deg, rgba(110, 231, 183, 0.1), rgba(6, 182, 212, 0.12));
  --progress-track: rgba(110, 231, 183, 0.22);

  --bg-canvas:
    radial-gradient(circle at 15% 10%, rgba(20, 184, 166, 0.14) 0, transparent 28%),
    radial-gradient(circle at 85% 15%, rgba(16, 185, 129, 0.1) 0, transparent 26%),
    radial-gradient(circle at 70% 85%, rgba(6, 182, 212, 0.08) 0, transparent 22%),
    linear-gradient(180deg, #0C1420 0%, #0D1622 55%, #0C141F 100%);
  --hero-bg: linear-gradient(135deg, rgba(12, 20, 32, 0.72) 0%, rgba(13, 26, 34, 0.92) 45%, rgba(11, 25, 30, 0.88) 100%);
  --section-alt-bg: linear-gradient(180deg, rgba(12, 20, 32, 0.55) 0%, rgba(14, 26, 36, 0.92) 100%);
  --cell-art-bg: radial-gradient(circle at 35% 35%, rgba(33, 51, 70, 0.95) 0%, rgba(21, 36, 52, 0.9) 30%, rgba(14, 25, 37, 0.96) 70%, rgba(16, 185, 129, 0.05) 100%);
  --cell-art-border: rgba(110, 231, 183, 0.28);

  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.4);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.45), 0 2px 4px -2px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -4px rgba(0, 0, 0, 0.45);
}

/* Theme toggle button (desktop nav + mobile drawer) */
.theme-toggle {
  width: 2.65rem;
  height: 2.65rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border);
  border-radius: 50%;
  background: var(--surface-glass-strong);
  color: var(--color-primary-ink);
  font-size: 1.05rem;
  cursor: pointer;
  transition: var(--transition);
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.06);
}

.theme-toggle:hover {
  transform: scale(1.06);
  border-color: rgba(16, 185, 129, 0.4);
}

.theme-toggle .ti-moon { display: none; }
[data-theme="dark"] .theme-toggle .ti-sun { display: none; }
[data-theme="dark"] .theme-toggle .ti-moon { display: inline; }

@media (max-width: 480px) {
  .theme-toggle {
    width: 2.5rem;
    height: 2.5rem;
    flex: 0 0 auto;
  }
}` ],
]);

console.log('ALL DONE');
