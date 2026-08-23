/* Pure-JS source scan for manual Content-Type usage + double-encoding hazards. */
const fs = require('fs');
const path = require('path');

const ROOTS = ['src', 'api', 'public/js'];
const FILES = ['app.js', 'server.js'];
const SKIP = new Set(['node_modules', '.git', 'dist']);

function walk(dir, out = []) {
  const abs = path.join(process.cwd(), dir);
  if (!fs.existsSync(abs)) return out;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP.has(e.name)) walk(p, out);
    } else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

let files = [...FILES, ...ROOTS.flatMap((r) => walk(r))].filter((f) => fs.existsSync(f));

const PATTERNS = [
  [/writeHead\s*\(/, 'res.writeHead('],
  [/setHeader\(\s*['"]Content-Type['"]/i, 'setHeader Content-Type'],
  [/\.set\(\s*['"]Content-Type['"]/i, '.set Content-Type'],
  [/toString\(\s*['"](?:binary|latin1|ascii)['"]\s*\)/, 'lossy toString'],
  [/Buffer\.from\([^)]*['"](?:base64|binary|latin1)['"]/, 'Buffer.from base64/binary'],
  [/decodeURIComponent\(\s*escape/, 'decodeURIComponent(escape(...))'],
  [/\bunescape\s*\(/, 'unescape('],
  [/new TextEncoder/, 'TextEncoder'],
];

for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  lines.forEach((ln, i) => {
    for (const [re, label] of PATTERNS) {
      if (re.test(ln)) console.log(`${f}:${i + 1}  [${label}]  ${ln.trim().slice(0, 110)}`);
    }
  });
}
console.log(`\nscanned ${files.length} files`);
