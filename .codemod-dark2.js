/* Codemod v2 — no regex anywhere. Idempotent: skips ops already applied. */
const fs = require('fs');

function apply(file, ops) {
  let src = fs.readFileSync(file, 'utf8');
  let changed = 0;
  for (const [from, to, all] of ops) {
    if (src.includes(to)) { console.log(`SKIP ${file}: already has [${to.slice(0, 44)}]`); continue; }
    const n = src.split(from).length - 1;
    if (n === 0) { console.log(`MISS ${file}: [${from.slice(0, 60)}]`); continue; }
    src = all ? src.split(from).join(to) : src.replace(from, to);
    changed++;
    console.log(`APPLY x${all ? n : 1} ${file}: [${from.slice(0, 50)}] -> [${to.slice(0, 40)}]`);
  }
  if (changed) fs.writeFileSync(file, src);
  console.log(`DONE ${file} (${changed} ops)`);
}

const NL = '\r\n';
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
].join(NL);

const TOGGLE =
  '<button class="theme-toggle" type="button" aria-label="تبديل الوضع الليلي" title="تبديل الوضع الليلي/النهاري">' +
  '<span class="ti-sun">☀️</span><span class="ti-moon">🌙</span></button>';

const pages = [
  'index.html', 'course-biology.html', 'assignments.html', 'chatbots.html',
  'dashboard-student.html', 'dashboard-teacher.html', 'lesson-view.html',
  'assignment-view.html', 'lessons.html',
];

for (const page of pages) {
  apply(page, [
    ['<meta name="viewport" content="width=device-width, initial-scale=1.0">',
     '<meta name="viewport" content="width=device-width, initial-scale=1.0">' + NL + THEME_BOOT],
    ['<div class="nav-actions">',
     '<div class="nav-actions">' + NL + '        ' + TOGGLE],
    ['<button class="mobile-drawer-close">✕</button>',
     TOGGLE + NL + '      <button class="mobile-drawer-close">✕</button>'],
  ]);
}

/* ------------------------- style.css ------------------------------------- */
apply('css/style.css', [
  // Page canvas / sections
  ['radial-gradient(circle at 15% 10%, rgba(20, 184, 166, 0.12) 0, transparent 28%),',
   '--bg-canvas-placeholder'],
  ['linear-gradient(180deg, #f4fffb 0%, #f8fafc 18%, #f7fbf7 100%);', 'background: var(--bg-canvas);'],
]);
console.log('phase A complete');
