/* Repairs cp1252 double-encoded UTF-8 files in place. v2
 *
 * Transformation being reversed:
 *   orig_utf8_bytes --read as cp1252--> mojibake string --saved as utf8--> current file
 *
 * .NET cp1252 decoding preserves ALL byte values losslessly:
 *   - printable specials (0x80=A?EUR etc.) become their Unicode equivalents
 *   - the five "hole" bytes (0x81 0x8D 0x8F 0x90 0x9D) become the matching
 *     C1 control codepoints U+0081..U+009D
 * so a strict inverse mapping exists for every character the corruption
 * could have produced. Characters outside the cp1252 product set (fresh
 * Arabic edits, real emoji typed after the corruption) are unmappable;
 * any run containing one is kept verbatim.
 *
 * Backups are written before modification.
 * Usage: node src/scripts/repair_encoding.js            (dry run)
 *        node src/scripts/repair_encoding.js --write    (apply)
 */
const fs = require('fs');
const path = require('path');
const { TextDecoder } = require('util');

const WRITE = process.argv.includes('--write');
const ROOT = path.resolve(__dirname, '..', '..');
const BACKUP_DIR = path.join(__dirname, 'encoding-backups');

const FILES = [
  'index.html',
  'lessons.html',
  'course-biology.html',
  'dashboard-teacher.html',
  'src/routes/quizzes/quizCreation.routes.js',
  'src/routes/quizzes/quizTaking.routes.js',
];

const strictUtf8 = new TextDecoder('utf-8', { fatal: true });

// cp1252 high-byte -> unicode char
const CP1252_HIGH = {
  0x80: '\u20AC', 0x82: '\u201A', 0x83: '\u0192', 0x84: '\u201E',
  0x85: '\u2026', 0x86: '\u2020', 0x87: '\u2021', 0x88: '\u02C6',
  0x89: '\u2030', 0x8A: '\u0160', 0x8B: '\u2039', 0x8C: '\u0152',
  0x8E: '\u017D', 0x91: '\u2018', 0x92: '\u2019', 0x93: '\u201C',
  0x94: '\u201D', 0x95: '\u2022', 0x96: '\u2013', 0x97: '\u2014',
  0x98: '\u02DC', 0x99: '\u2122', 0x9A: '\u0161', 0x9B: '\u203A',
  0x9C: '\u0153', 0x9E: '\u017E', 0x9F: '\u0178',
};
const UNI_TO_BYTE = new Map(Object.entries(CP1252_HIGH).map(([b, u]) => [u.codePointAt(0), Number(b)]));

// strict inverse of .NET cp1252 decoding; throws on unmappable chars
function encodeCp1252Strict(s) {
  const out = Buffer.alloc(s.length); // 1 char <-> 1 byte for everything mappable
  for (let i = 0; i < s.length; i++) {
    const cp = s.charCodeAt(i);
    let b;
    if (cp <= 0xff) b = cp;              // ASCII + Latin-1 + C1 holes: identity
    else if (UNI_TO_BYTE.has(cp)) b = UNI_TO_BYTE.get(cp);
    else throw new Error(`unmappable U+${cp.toString(16)} at ${i}`);
    out[i] = b;
  }
  return out;
}

const ACCEPTABLE =
  /[\u0600-\u06FF]|[\u2190-\u27BF]|[\u{1F000}-\u{1FAFF}]/u;

// short symbol-only results (e.g. run "Â©" -> "(c)") from an explicit
// high lead are always corruption of a lone Latin-1 symbol
const SYMBOLS_OK = /^[\u0020-\u00FF\u2010-\u2027\u060C\u061B\u061F\u0640]{1,4}$/;
const SUSPICIOUS_LEAD = /^[ÂÃ]/;

// Reverse one run repeatedly (handles double/triple encoding), returning
// null if nothing valid was produced.
function reverseRun(run) {
  let cur = run;
  let changed = false;
  for (let depth = 0; depth < 4; depth++) {
    let txt;
    try {
      txt = strictUtf8.decode(encodeCp1252Strict(cur));
    } catch {
      break; // unmappable char or invalid utf8
    }
    if (txt === cur) break;
    cur = txt;
    changed = true;
    // stop early once human-readable
    if (ACCEPTABLE.test(txt)) break;
    if (!/[ÃÂØÙÎÏ\u0080-\u00FF]/.test(txt)) break;
  }
  if (!changed) return null;
  return cur;
}

let totalFixedRuns = 0;
let totalKeptRuns = 0;

function stripBom(buf) {
  return buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf ? buf.slice(3) : buf;
}

function repairText(s) {
  let out = '';
  let run = '';
  let fixed = 0;
  let kept = 0;
  const flush = () => {
    if (!run) return;
    let done = false;
    try {
      const txt = reverseRun(run);
      if (txt !== null && (ACCEPTABLE.test(txt) || (SYMBOLS_OK.test(txt) && SUSPICIOUS_LEAD.test(run)))) {
        out += txt;
        fixed++;
        done = true;
      }
    } catch {
      /* keep original */
    }
    if (!done) {
      out += run;
      kept++;
    }
    run = '';
  };
  for (const ch of s) {
    if (ch.codePointAt(0) < 0x80) {
      flush();
      out += ch;
    } else {
      run += ch;
    }
  }
  flush();
  totalFixedRuns += fixed;
  totalKeptRuns += kept;
  return { text: out, fixed, kept };
}

fs.mkdirSync(BACKUP_DIR, { recursive: true });

for (const rel of FILES) {
  const abs = path.join(ROOT, rel);
  const origBuf = fs.readFileSync(abs);
  const hadBom = origBuf[0] === 0xef && origBuf[1] === 0xbb && origBuf[2] === 0xbf;
  const body = stripBom(origBuf).toString('utf8');

  const { text, fixed, kept } = repairText(body);

  const arBefore = (body.match(/[\u0600-\u06FF]/g) || []).length;
  const arAfter = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const dblAfter = (text.match(/[\u00D8\u00D9][\u0080-\u00FF\u2018-\u2026\u0081]/g) || []).length;

  console.log(
    `${rel}\n` +
    `  bom:${hadBom ? 'Y->strip' : 'n'}  fixed:${fixed} kept:${kept}` +
    `  arabic ${arBefore}->${arAfter}  mojibake-left:${dblAfter}`
  );

  if (arAfter < arBefore) {
    console.log('  !! REFUSING to write: arabic count decreased');
    continue;
  }

  if (WRITE) {
    fs.writeFileSync(path.join(BACKUP_DIR, rel.replace(/[\\/]/g, '__') + '.corrupt.bak'), origBuf);
    fs.writeFileSync(abs, text, 'utf8'); // BOM-free
  }
}

console.log(`\ntotals: ${totalFixedRuns} repaired, ${totalKeptRuns} kept. mode=${WRITE ? 'WRITE' : 'DRY-RUN'}`);
