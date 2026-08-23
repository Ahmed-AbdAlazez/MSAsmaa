/* Layer audits 2/3/5 — read-only checks, prints a compact report. */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('=== app.js Arabic strings (ground truth via Node) ===');
{
  const s = fs.readFileSync('app.js', 'utf8');
  const strs = s.match(/"[^"\n]*[\u0600-\u06FF][^"\n]*"/g) || [];
  [...new Set(strs)].slice(0, 6).forEach((x) => console.log('  ', x.trim()));
}

function grep(pattern, label) {
  console.log(`\n=== ${label} ===`);
  try {
    const out = execSync(
      `git grep -nIE "${pattern}" -- "src/**/*.js" "app.js" "server.js" "api/*.js" "public/js/**"`,
      { encoding: 'utf8', maxBuffer: 4e6 }
    ).trim();
    console.log(out ? out.split('\n').slice(0, 15).join('\n') : '  (none)');
  } catch (e) {
    console.log('  (none)');
  }
}

grep("writeHead\\(|setHeader\\(['\\\"]Content-Type|res\\.set\\(['\\\"]Content-Type", 'manual Content-Type usage');
grep("toString\\(['\\\"](binary|latin1|ascii)['\\\"]|Buffer\\.from\\([^)]*['\\\"](base64|binary|latin1)['\\\"]|decodeURIComponent\\(escape|unescape\\(|new TextEncoder", 'double-encoding hazards');

console.log('\n=== Prisma datasource ===');
try {
  const schema = execSync('git ls-files "*schema.prisma"', { encoding: 'utf8' }).trim().split('\n')[0];
  if (schema) {
    const t = fs.readFileSync(schema, 'utf8');
    const ds = t.match(/datasource[\s\S]*?}/);
    console.log(schema + '\n' + (ds ? ds[0] : '  datasource block not found'));
  } else console.log('  no schema.prisma tracked');
} catch {
  console.log('  no schema.prisma');
}

console.log('\n=== DATABASE_URL params (credentials redacted) ===');
for (const f of ['.env', '.env.example']) {
  if (!fs.existsSync(f)) continue;
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  for (const ln of lines) {
    const m = ln.match(/^(DATABASE_URL\s*=\s*)(.*)$/);
    if (!m) continue;
    let url = m[2].trim();
    try {
      const u = new URL(url.replace(/^['"]|["']$/g, ''));
      const redacted = `${u.protocol}//${u.username}:***@${u.host}${u.pathname}${u.search}`;
      console.log(`  ${f}: ${redacted || '(empty)'}`);
    } catch {
      console.log(`  ${f}: ${url ? '(unparseable/redacted)' : '(empty)'}`);
    }
  }
}
console.log('\n=== PGCLIENTENCODING / client_encoding overrides ===');
try {
  const out = execSync('git grep -nIiE "client_encoding|PGCLIENTENCODING"', { encoding: 'utf8' }).trim();
  console.log(out || '  (none)');
} catch {
  console.log('  (none)');
}
