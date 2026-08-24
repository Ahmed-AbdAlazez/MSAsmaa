# Sama — Mascot & Homepage Effects

"Sama" is the friendly mascot of منصة المرسال: a flat vector character drawn as
a **circle in the site's primary brand green** with a **white doctor figure**
inside it (white coat, V-collar, teal stethoscope across the chest, round eyes,
small smile). She lives in the hero section of the homepage and powers three
lightweight effects inspired by Duolingo / Brilliant.org.

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

Sama also appears on the dedicated auth page `login.html`: the left visual panel
mounts her with the same `[data-sama-mascot]` selector (plus
`mascotEyeTracking.js`), and the warm tagline next to her swaps between
"أهلاً بيك تاني! 👋" (sign in) and "أهلاً بيك معانا! 🌱" (sign up) as the tabs
switch — see `css/login.css` and `src/loginPage.js`.

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
(no SVG knowledge needed). Since the v2 redesign, every token **reuses an
existing site variable**, so Sama always matches the palette exactly:

```css
.sama-mascot {
  --sama-body:  var(--color-primary);       /* outer circle = brand green */
  --sama-line:  var(--color-primary-dark);  /* face lines / eye rings */
  --sama-tube:  var(--color-accent-blue);   /* teal stethoscope */
}
```

**Changing the shape:** the outer body is a single `<circle class="sama-body">`
inside `samaMascot.js`; the white coat/collar/stethoscope live in a group that
is clipped by `#sama-circle-clip`. Edit those paths (220×220 viewBox) and the
eyes keep working — they are separate elements carrying the `.sama-eye` /
`.sama-pupil` hooks.

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
while scrolling, the wrapper's position is converted into a **footer-reveal
progress** value `p = 0..1`:

```
p = clamp( (viewportHeight - rect.top) / rect.height , 0 , 1 )
```

`p = 0` when the zone's top edge appears at the viewport bottom; `p = 1` when
the page is scrolled to its very end (true because this zone is the last
element on the page). That becomes a centered value `c = p - 0.5` which drives,
per shape:

```
translate3d(c × driftX, c × driftY) rotate(c × spin)
```

Negative values move opposite to positive ones, so shapes drift up/inward as
you scroll down and perfectly reverse when scrolling up.

**v2 fix:** the previous formula divided by `rect.height + viewportHeight`,
which describes a zone traveling *through* the viewport — impossible for the
last element on a page. Progress saturated around 0.5 before the footer was
even visible and the drift was smeared over ~1700px of scroll, so the shapes
looked frozen. The new mapping stays live for every remaining scroll pixel.

On top of that raw mapping sits an **eased chase loop**: scroll events only set
a target, and `current += (target - current) * 0.18` per frame glides the
shapes toward it until they settle (< 0.1% away). Fast flicks therefore glide
instead of jumping, slow scrolls track almost 1:1, and the lerp can never
overshoot. The loop cancels itself once settled, so there is no idle CPU use.

Only `transform` is ever written (one passive scroll listener + rAF batching,
one layout read per recompute), so there is no layout thrash. The layer sits
above section backgrounds but below real content, has `pointer-events: none`,
and is clipped by `overflow: hidden` so it can never cover main content or the
navbar.

**Tuning intensity/speed once you see it live:**

| What feels off | Change |
|---|---|
| Everything too fast/subtle overall | `INTENSITY` constant at top of `scrollBiology.js` (default `1.4`; try `2.0` or `0.8`) |
| Motion feels laggy / too floaty after flicks | raise `EASE` (default `0.18`) in the same file |
| One shape travels too far | its `data-drift-y` px value in `index.html` |
| Rotation distracting | set `data-spin="0"` on that shape |
| Too many shapes on phones | add/remove the `hide-mobile` class (shapes with it disappear under 600px) |
| Shape position/size | the inline `style="top/left/right/width"` on each shape |

Everything also switches itself off automatically for users with
`prefers-reduced-motion: reduce`, and eye-tracking disables itself on touch
devices where Sama instead runs a CSS idle blink/wander animation.

---

## Revision 2 changelog

1. **Sama redesigned** (`samaMascot.js`, tokens in `mascot.css`):
   outer blob replaced by a plain circle filled with `var(--color-primary)` —
   the site's exact brand green, no new colors introduced; inside sits a white
   doctor figure (coat + V-collar + teal stethoscope loop across the chest,
   drawn with `var(--color-accent-blue)`), round ringed eyes and a small smile
   line. The old "stethoscope-as-mouth" is gone.
2. **Footer scroll effect fixed** (`scrollBiology.js`): new footer-reveal
   progress formula + eased chase loop (see section 3). Shapes now move visibly
   while approaching the footer, reverse smoothly when scrolling back up, work
   at both fast and slow speeds without jumps or overshoot.
3. **Interaction logic untouched:** eye tracking still moves only the
   `.sama-pupil` groups (they were preserved verbatim in the new SVG), the nav
   hover-reveal still calls the same `SamaMascot.reveal()/hide()` API, blink /
   idle-wander CSS animations still hook the same classes, and the scroll
   effect still reads the same `data-drift-*` attributes from `index.html`.
   All three behaviors run together on the homepage with no duplicated
   components.
