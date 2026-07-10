# CapyStudio — Design Brief for Restyling

This document is the complete specification for redesigning CapyStudio's UI.
It is written to be handed to a design-focused AI (or human) together with the
repository. Read the whole brief before touching code. The functional contract
in §2 is non-negotiable; everything else is direction with room for taste.

---

## 1. What you are designing

CapyStudio is a browser-based media studio. Its first module is a **Lyric
Video Maker**: the user loads a song, a background image or looping video,
pastes lyrics, taps timing live while the song plays, styles the subtitles,
and exports a video — all client-side, no server.

**Personality**: a small, confident, professional creative tool with warmth.
Think "a tiny DaVinci Resolve built by someone who loves capybaras" — calm,
dark, focused, precise, with one playful wink (the capybara/wordmark), never
cartoonish. The user is doing creative work at night with music playing;
the UI should feel like a quiet studio, not a SaaS dashboard.

Design goals in priority order:
1. The **preview stage is the hero** — everything else visually recedes.
2. **Tap-timing mode must feel like recording** — unmistakable live state.
3. Zero learning curve — three panels: media/style → stage → lyrics/timing.
4. Beautiful enough to screenshot: this page is the product's marketing.

---

## 2. Hard functional contract (do not break)

The JavaScript (`js/app.js`, `js/waveform.js`) locates elements by id and
toggles state classes. **You may restructure HTML wrappers, add classes and
aria attributes, and rewrite `css/style.css` completely** — but:

### 2.1 Element ids that must keep existing (and their roles)
- `player` — native `<audio controls>`; keep it a native audio element.
- `preview` (canvas), `preview-wrap` — video preview stage. Canvas aspect
  ratio changes with resolution; it must stay fully visible (contain-fit).
- `wave`, `wave-overlay` — two stacked canvases inside their wrapper
  (`.wave-wrap`); JS sizes them to the wrapper; wrapper handles click-to-seek.
- File pickers: `audio-input`, `audio-name`, `audio-drop`, `bg-input`,
  `bg-name`, `bg-drop`. Each drop zone is a `<label>` wrapping a hidden
  `<input type="file">` — keep that pattern (click-to-open relies on it).
- Style controls: `st-font`, `st-size`, `st-bold`, `st-color`,
  `st-outline-color`, `st-outline`, `st-position`, `st-dim`, `resolution`.
- Lyrics: `lyrics-text`, `load-lines`, `tap-btn`, `clear-times`, `line-list`.
- Header actions: `save-project`, `load-project-btn`, `load-project`,
  `export-srt`, `export-lrc`, `import-subs-btn`, `import-subs`,
  `export-video`.
- Account cluster (visibility toggled via the `hidden` attribute by JS):
  `account`, `sign-in`, `sign-out`, `user-chip`, `user-avatar`, `user-name`,
  `cloud-save`, `cloud-open`.
- Export overlay: `export-overlay`, `export-progress`, `export-pct`,
  `export-cancel`. Shown/hidden via the `hidden` attribute — keep
  `[hidden] { display: none }` semantics working.

### 2.2 State classes toggled by JS (style these, don't rename)
- `.file-drop` gains `.loaded` (media attached) and `.dragover` (drag hover).
- `#tap-btn` gains `.active` while tap-timing runs.
- Line rows are JS-generated: `li.line-row` containing `input.line-text`,
  `span.times`, `span.line-btns` (four small buttons). The row for the next
  line to stamp gets `.next-tap`. (A `.current` class exists in CSS but is
  currently unused — you may keep or drop it.)
- `button.primary` is the visual-priority button class used in markup.

### 2.3 Canvas-drawn colors (JS constants, not CSS)
The waveform, playhead, and lyric-start markers are drawn in
`js/waveform.js`; the preview letterbox background and placeholder text in
`js/renderer.js`. You **may** change these hex constants so canvases match
your palette — simple color-value swaps only, no logic changes.
The lyric text drawn *inside* the preview canvas is the user's exported
content — never theme it.

### 2.4 Platform constraints
- Static site, GitHub Pages, **no build step, no frameworks, no JS libraries**.
- CSS may be fully rewritten; keep it one file: `css/style.css`.
- Web fonts allowed (Google Fonts `<link>` or self-hosted in `/fonts`);
  keep total font payload reasonable (≤ 2 families, ≤ 4 weights).
- Must work in current Chrome, Firefox, Safari. No horizontal page scroll.
- App is keyboard-driven (Space/X/Esc); nothing may steal focus permanently.

---

## 3. Aesthetic direction: "Midnight Studio"

One strong direction below; refine freely within it rather than inventing a
different theme.

### 3.1 Color
Dark, blue-tinted near-blacks with layered elevation — not flat gray panels.
Proposed token starting points (tune as needed, keep the roles):

```css
--bg-0: #0b0d12;      /* page: deepest, stage backdrop            */
--bg-1: #12151d;      /* panels / cards                           */
--bg-2: #1a1e28;      /* inputs, nested surfaces                  */
--line: #262b38;      /* hairline borders (1px, low contrast)     */
--text-1: #eef0f6;    /* primary text                             */
--text-2: #98a0b3;    /* secondary / labels                       */
--accent: #7c92ff;    /* interactive: buttons, focus, waveform    */
--accent-strong: #5b74f0;
--record: #ff5c5c;    /* tap-timing "live" state + playhead       */
--ok: #57d38c;        /* loaded media, lyric markers, success     */
```

Rules:
- Exactly **one** accent hue for interaction; `--record` red is reserved
  exclusively for the live tap-timing state and the playhead — that reservation
  is what makes recording mode feel different.
- Elevation = background step + 1px `--line` border + very soft shadow.
  No heavy drop shadows, no glassmorphism blur soup.
- A restrained accent gradient is allowed on exactly two things: the wordmark
  and the primary Export button.
- AA contrast minimum for all text (4.5:1 body, 3:1 large/secondary).

### 3.2 Typography
- UI: **Inter** (or system-ui fallback stack), 13–14px base, tabular numerals
  (`font-variant-numeric: tabular-nums`) for all timecodes.
- Wordmark "CapyStudio": a display face with character — e.g. **Space
  Grotesk** or **Sora**, semibold, slight negative tracking. Module name
  ("Lyric Video Maker") sits beside it, quiet and secondary.
- Panel section headings: 11–12px uppercase, letter-spaced, `--text-2`.

### 3.3 Shape & space
- Radius scale: 6px (inputs/small buttons) / 10px (cards) / 14px (stage,
  overlay). Consistent — no mixed rounding on siblings.
- 4px spacing grid; panels breathe (16–20px padding).
- Buttons: 32–36px tall, generous horizontal padding; icon-only line-row
  buttons ≥ 28px hit area.

### 3.4 Motion
- 120–180ms, `ease-out`, transform/opacity only. Hover = subtle lift or
  brighten, never layout shift.
- Tap-timing live state: gentle 1.2s pulse on the record button and/or a thin
  `--record` top border on the lyrics panel. The `.next-tap` row gets a clear
  animated affordance (e.g. breathing left border) — this is the single most
  important state in the app.
- Export progress: animated fill; small indeterminate shimmer is fine.
- Wrap all animation in `@media (prefers-reduced-motion: no-preference)`.

---

## 4. Surface-by-surface guidance

### Header
Slim (~52px). Left: wordmark + module name. Right: actions in two visual
groups — file/subtitle utilities (Save/Load/SRT/LRC/Import) as quiet ghost
buttons, then **Export video** isolated as the single high-emphasis button.
Consider a thin divider or gap between groups.

### Left panel — Media & Style
- Drop zones: dashed border idle → accent on `.dragover` → solid `--ok`
  border + filename + small checkmark on `.loaded`. Make the empty state
  inviting (icon + short verb-first label), the loaded state compact.
- Style controls: align as a clean two-column form (label left, control
  right). Color swatches, range sliders, and selects should look like one
  family — restyle native controls where cheap (`accent-color` covers range,
  checkbox, progress in modern browsers; don't rebuild selects in JS).

### Center — Stage
- The canvas sits on `--bg-0` with generous letterboxing; optional very
  subtle vignette or 1px inner border to separate video black from UI black.
- Transport: native `<audio>` is hard to style — contain it in a card that
  matches the theme (`color-scheme: dark` helps native controls). Do not
  replace it with a custom player.
- Waveform card directly below transport; it should read as an instrument,
  not decoration: full-width, ~90px, crisp playhead.
- Hint line: single quiet row of `<kbd>`-styled key hints.

### Right panel — Lyrics & Timing
- Textarea for pasting, then the three action buttons, then the line list.
- Line rows are the workhorse: editable text on top; second row =
  `0:02.5 → 0:04.0` timecode (tabular, `--text-2`) left, four micro-buttons
  right, visible on hover/focus-within to reduce noise.
- `.next-tap` row: unmistakable (accent/record border + slight background
  shift). Timed vs untimed rows should be distinguishable at a glance
  (e.g. untimed timecode dimmed with an em-dash).

### Export overlay
Modal card on a dimmed, slightly blurred backdrop: title, one calm sentence
("Recording in real time — keep this tab visible"), big progress bar,
percentage in tabular numerals, quiet Cancel. No spinner clutter.

### Empty state (first load)
The stage placeholder text currently drawn on canvas stays, but the three
panels should each make their first action obvious. Optional: a one-line
welcome strip under the header on first visit — CSS/HTML only if added.

### Responsive
- ≥ 1280px: three columns (~260px / fluid / ~340px).
- 980–1280px: narrower side panels, same grid.
- < 980px: single column, order stage → media/style → lyrics; page scrolls
  vertically (already handled — keep it working).

---

## 5. Accessibility checklist
- `:focus-visible` rings (2px accent, offset) on every interactive element.
- Icon-only buttons keep their `title` and gain `aria-label`.
- `prefers-reduced-motion` respected; `color-scheme: dark` declared.
- Keyboard flow untouched: Space/X/Esc handlers live on `document` and check
  `e.target` — don't wrap inputs in elements that swallow key events.

## 6. QA walkthrough (must pass after restyling)
1. Load an audio file → name appears in drop zone, waveform renders, `.loaded`
   state visible.
2. Load an image → preview shows it; switch resolution → canvas stays
   contain-fit, no overflow.
3. Paste 3 lyric lines → Load lines → rows render; Tap timing → button shows
   live state, `.next-tap` moves as Space is pressed; X and Esc work.
4. Per-row ⏱/⏹/▶/✕ buttons work; timecodes are tabular and readable.
5. Export video → overlay appears, progress fills, cancel works, file
   downloads.
6. SRT/LRC export/import and project save/load still function.
7. No horizontal scroll at 1440px, 1024px, 375px. No console errors.
8. Contrast spot-check: labels, timecodes, hints all ≥ AA.

## 7. Out of scope
- No JS behavior changes beyond §2.3 color constants and adding
  aria-attributes/classes in generated DOM **only if** you also update the
  matching selectors.
- No new features, no copy rewrites beyond microcopy polish, no framework,
  no build tooling, no replacement of native `<audio>`/`<select>`.
