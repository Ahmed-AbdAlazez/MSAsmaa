/* Byte-level encoding diagnosis. Read-only: reports, never writes.
 * Usage: node src/scripts/diag_encoding.js [--head]
 *   --head : analyze git HEAD versions instead of working tree
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const HEAD = process.argv.includes('--head');

const EXTS = new Set(['.html', '.js', '.css', '.json', '.md']);
const SKIP_DIRS = new Set(['node_modules', '.git']);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), out);
    } else if (EXTS.has(path.extname(e.name))) {
      out.push(path.join(dir, e.name));
    }
  }
  return out;
}

function headContent(relPath) {
  try {
    return execFileSync('git', ['show', `HEAD:${relPath.replace(/\\/g, '/')}`], {
      cwd: ROOT, maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return null; // not in HEAD (new file)
  }
}

// Strict UTF-8 validation
function validateUtf8(buf) {
  let i = 0;
  while (i < buf.length) {
    const b = buf[i];
    let need;
    if (b < 0x80) { i++; continue; }
    else if ((b & 0xe0) === 0xc0) need = 1;
    else if ((b & 0xf0) === 0xe0) need = 2;
    else if ((b & 0xf8) === 0xf0) need = 3;
    else return { ok: false, at: i };
    if (i + need >= buf.length + 0 && i + need > buf.length - 1) return { ok: false, at: i };
    for (let k = 1; k <= need; k++) {
      if ((buf[i + k] & 0xc0) !== 0x80) return { ok: false, at: i };
    }
    // overlong / surrogate / max checks (basic)
    i += need + 1;
  }
  return { ok: true };
}

// Mojibake signatures:
//  - double-encoded Arabic read as cp1252/cp1256 then saved as utf8 shows
//    Latin-1 range chars Ø Ù Â Ã etc. adjacent to each other
//  - U+FFFD replacement chars
function analyzeText(s) {
  const arabic = (s.match(/[\u0600-\u06FF]/g) || []).length;
  const fffd = (s.match(/\uFFFD/g) || []).length;
  // Latin mojibake clusters: e.g. "Ø§Ù„Ø¹" or "Ã˜Â±"
  const dblEnc = (s.match(/[ØÙÃÂÎ][\u0080-\u00FF]/g) || []).length;
  const weirdOO = (s.match(/O[\u0300-\u036F\u00D8\u00DC]/g) || []).length;
  return { arabic, fffd, dblEnc, weirdOO };
}

const files = walk(ROOT);
console.log(`mode=${HEAD ? 'GIT-HEAD' : 'WORKTREE'}  files=${files.length}`);
console.log('status | BOM | utf8 | ar | fffd | dbl | file');
let bad = 0;

for (const f of files) {
  const rel = path.relative(ROOT, f);
  const buf = HEAD ? headContent(rel) : fs.readFileSync(f);
  if (buf === null) continue;
  const bom = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  const v = validateUtf8(buf);
  const s = buf.toString('utf8');
  const a = analyzeText(s);
  const suspicious = !v.ok || a.fffd > 0 || a.dblEnc > 5 || a.weirdOO > 5;
  if (suspicious || a.arabic > 20 || bom) {
    const st = suspicious ? 'BAD ' : 'ok  ';
    if (suspicious) bad++;
    console.log(
      `${st} | ${bom ? 'Y' : '-'}   | ${v.ok ? 'yes' : 'NO!'}` +
      ` | ${String(a.arabic).padStart(4)} | ${String(a.fffd).padStart(3)}` +
      ` | ${String(a.dblEnc).padStart(4)} | ${rel}`
    );
  }
}
console.log(`\nsuspicious files: ${bad}`);
