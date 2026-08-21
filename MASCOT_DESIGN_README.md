# Sama — Mascot & Homepage Effects

"Sama" is the friendly mascot of منصة المرسال: a flat, teal, cell-like blob whose
smile is drawn as a stethoscope. She lives in the hero section of the homepage
and powers three lightweight effects inspired by Duolingo / Brilliant.org.

All files are **frontend-only** (no backend/API changes) and each effect lives in
its own file so any piece can be edited or deleted independently:

| File | Purpose |
|---|---|
| `js/components/samaMascot.js` | Renders Sama's SVG + speech bubble + accessory badge |
| `js/components/mascotEyeTracking.js` | Effect 1 — pupils follow the mouse cursor |
| `js/components/mascotNavHover.js` | Effect 2 — mascot reacts to nav item hover |
| `js/components/scrollBiology.js` | Effect 3 — scroll-linked biology decorations |
| `css/mascot.css` | All mascot/effect styling, animations & theme tokens |

Load order matters only for the first two: the mascot script must run before the
effects that attach to it (`index.html`, bottom of `<body>`).

---

## 1. The mascot component

**Where it lives:** `js/components/samaMascot.js` renders the whole SVG into the
mount element in `index.html` (hero section):

```html
<div class="cell-art">
  <div data-sama-mascot></div>   <!-- Sama appears here -->
  ...
</div>
```

**Changing colors:** open `css/mascot.css` and edit the theme tokens at the top
(no SVG knowledge needed):

```css
.sama-mascot {
  --sama-body: #26a183;         /* main blob fill */
  --sama-line: #0f4c3a;         /* stethoscope tube + outlines */
  --sama-pupil-color: #123b31;
  --sama-cheek-color: rgba(9, 51, 39, 0.16);
  --sama-chest-inner: #9fe8d0;  /* stethoscope chest piece */
}
```

**Changing the shape:** the blob is a single SVG `<path>` inside
`samaMascot.js` (search for `class="sama-body"`). Replace that `d="..."`
with any closed path on a `220x220` viewBox and the eyes/stethoscope keep
working since they are separate elements.

---

## 2. Hover-reveal navigation effect (Effect 2)

The effect is **fully data-driven from HTML**. Any `.nav-link` with two data
attributes participates automatically — no JS edits needed:

```html
<a href="assignments.html" class="nav-link"
   data-mascot-icon="microscope"
   data-mascot-caption="بنك أسئلة واجبات تحاكي نظام الامتحان">
   الواجبات
</a>
```

- `data-mascot-icon` → key of an icon in `ACCESSORY_ICONS` at the top of
  `js/components/samaMascot.js` (`leaf`, `dna`, `microscope`, `chat`,
  `chart`, `cap`). Add a new SVG string there to create new keys.
- `data-mascot-caption` → the one-line text shown in the speech bubble.

**To add a fourth/fifth nav section later:** just add those same two data
attributes to the new link (and optionally register a new icon key). The hover,
keyboard-focus and reverse-on-leave behavior is handled generically by
`mascotNavHover.js`.

Motion (fade/pop of bubble & badge) is pure CSS transitions in
`css/mascot.css` (`.sama-bubble`, `.sama-accessory`) — tweak durations there.

---

## 3. Scroll-linked biology decorations (Effect 3)

**Where:** the bottom of `index.html`. The CTA banner + footer are wrapped in a
scope element:

```html
<div class="bottom-zone" data-samascroll>
  <div class="scroll-decor" aria-hidden="true">
    <div class="scroll-shape shape-cell"
         data-drift-y="-70" data-drift-x="22" data-spin="16"
         style="top:6%; left:5%; width:72px;"></div>
    ...
  </div>
  <section class="cta-banner">...</section>
  <footer class="footer">...</footer>
</div>
```

**How it works** (`js/components/scrollBiology.js`): on each animation frame
while scrolling, the wrapper's position is converted into a progress value
`p = 0..1` (0 = zone entering the viewport, 1 = leaving). That becomes a
centered value `c = p - 0.5` which drives, per shape:

```
translate3d(c × driftX, c × driftY) rotate(c × spin)
```

Negative values move opposite to positive ones, so shapes drift apart/in
together as you scroll down and perfectly reverse when scrolling up.
Only `transform` is ever written (one passive scroll listener + rAF), so there
is no layout thrash. The layer sits above section backgrounds but below real
content, has `pointer-events: none`, and is clipped by `overflow: hidden` so it
can never cover main content or the navbar.

**Tuning intensity/speed once you see it live:**

| What feels off | Change |
|---|---|
| Everything too fast/subtle overall | `INTENSITY` constant at top of `scrollBiology.js` (`1.0` → try `1.4` or `0.6`) |
| One shape travels too far | its `data-drift-y` px value in `index.html` |
| Rotation distracting | set `data-spin="0"` on that shape |
| Too many shapes on phones | add/remove the `hide-mobile` class (shapes with it disappear under 600px) |
| Shape position/size | the inline `style="top/left/right/width"` on each shape |

Everything also switches itself off automatically for users with
`prefers-reduced-motion: reduce`, and eye-tracking disables itself on touch
devices where Sama instead runs a CSS idle blink/wander animation.
