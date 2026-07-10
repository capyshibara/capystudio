# CapyStudio — Per-Screen Design Prompts for Claude Design

How to use: for each screen, paste the **Shared context** block first, then the
screen's prompt. One screen per session gives the most focused results. After
each screen, run the QA walkthrough in `docs/DESIGN_BRIEF.md` §6 before moving on.

---

## Shared context (paste before every screen prompt)

> You are applying the CapyStudio design system you previously established to
> one screen of the app in this repository
> (https://github.com/capyshibara/capystudio). Use your existing tokens,
> typography, spacing, and motion rules — do not invent a new theme.
>
> Hard constraints, non-negotiable — read `docs/DESIGN_BRIEF.md` §2 fully
> before editing:
> - Every element id and JS state class listed there must keep working
>   (`.loaded`, `.dragover`, `.next-tap`, `#tap-btn.active`, `[hidden]`, the
>   `label.file-drop > input[type=file]` pattern, native `<audio id="player">`).
> - Static GitHub Pages site: no frameworks, no build step, no JS libraries.
>   All styling in `css/style.css`; HTML wrapper/class/aria changes allowed in
>   `index.html`; in JS you may only swap the canvas color hex constants in
>   `js/waveform.js` / `js/renderer.js`.
> - Keyboard flow (Space / X / Esc on `document`) must not be intercepted.
> - AA contrast, `:focus-visible` rings, `prefers-reduced-motion` respected.
>
> Only redesign the screen described below. Leave other surfaces untouched
> except where shared tokens/utilities naturally apply.

---

## Screen 1 — App shell & header

> Design the application shell: the header bar and the overall three-pane
> frame of the editor. Header left: "CapyStudio" wordmark + quiet module name
> ("Lyric Video Maker"). Header right, three visual groups by emphasis:
> (1) utility actions — Save/Load project, SRT, LRC, Import subs — as quiet
> ghost buttons; (2) the account cluster (`#account`: sign-in button, user
> chip with avatar `#user-avatar` + name `#user-name` + sign-out, cloud Save
> `#cloud-save` / Open `#cloud-open` — all of these toggle via the `hidden`
> attribute, so style both present and absent layouts); (3) **Export video**
> as the single high-emphasis action. Define the responsive collapse of the
> header below 980px (wrap order, which labels become icon-only). States:
> signed-out, signed-in, buttons hidden (no Firebase configured).

## Screen 2 — Media & Style panel (left)

> Design the left panel: two file drop zones (audio; background image/video)
> and the subtitle style form. Drop zones need three unmistakable states:
> idle (inviting, dashed, verb-first label), `.dragover` (accent), `.loaded`
> (compact: filename + subtle success cue). The style form (font, size, bold,
> text color, outline color/width, position, background dim, resolution) is
> label-left / control-right; make native selects, color swatches, range
> sliders, and the checkbox read as one control family using `accent-color`
> and restrained custom styling — do not rebuild native controls in JS.
> Group "Media" and "Subtitle style" with the design system's section-heading
> treatment.

## Screen 3 — Stage & transport (center)

> Design the center column: preview canvas stage, native audio transport,
> waveform strip, and the keyboard-hint line. The stage is the hero — the
> canvas must stay contain-fit for all four aspect ratios (16:9, 9:16, 1:1)
> with elegant letterboxing that separates video-black from UI-black
> (hairline border or subtle vignette). Wrap the native `<audio id="player">`
> in a themed card using `color-scheme: dark`; do not replace it. The
> waveform card (~90px, two stacked canvases, click-to-seek) should read as a
> precision instrument; you may retint the canvas-drawn wave/marker/playhead
> hex constants in `js/waveform.js` to system colors. Restyle the hint line
> as `<kbd>` key chips.

## Screen 4 — Lyrics & timing panel (right)

> Design the right panel: lyrics textarea, the action row (Load lines /
> Tap timing / Clear times), and the line list. Line rows are JS-generated
> (`li.line-row` > `input.line-text`, `span.times`, `span.line-btns` with four
> micro-buttons) — style via those classes only. Requirements: editable text
> row; timecode row in tabular numerals, dimmed with an em-dash when untimed;
> micro-buttons appear on hover/focus-within; the `.next-tap` row is the
> single most important state in the app — give it an unmistakable "live"
> affordance (record-red breathing border) consistent with `#tap-btn.active`,
> which must feel like a recording indicator while tap-timing runs. Design
> the empty state (no lines yet) and a long-list scroll treatment.

## Screen 5 — Export flow (overlay)

> Design the export overlay (`#export-overlay`, toggled via `hidden`): modal
> card on a dimmed backdrop with title, one calm sentence ("Recording in real
> time — keep this tab visible"), a substantial progress bar
> (`#export-progress`), percentage in tabular numerals (`#export-pct`), and a
> quiet Cancel (`#export-cancel`). Cover: 0% just-started, mid-progress, and
> the reduced-motion variant. No spinners, no confetti; completion simply
> closes the overlay and the file downloads — the bar reaching 100% is the
> payoff, make it satisfying.

## Screen 6 — Account & sign-in states

> Design the account experience in the header: (a) signed-out — a compact
> "Sign in with Google" button (`#sign-in`) following Google's sign-in
> branding spirit without heavy chrome; (b) signed-in — user chip
> (`#user-chip`) with 24px round avatar, first name, and an unobtrusive
> sign-out; plus the two cloud actions (`#cloud-save`, `#cloud-open`) that
> exist only when signed in. All visibility is toggled by the `hidden`
> attribute — design so the header doesn't jump when the cluster appears.
> Include a title-attribute-level explanation of what cloud save does
> (project timings + style; media files stay local).

## Screen 7 — Cloud project library (new component, design ahead)

> Design a small project-library dialog to replace the current native
> `prompt()` placeholder used by "☁ Open": an anchored popover or centered
> modal listing the user's saved cloud projects — name, relative "updated"
> time, open on click, delete behind a confirm affordance. Include empty
> ("No cloud projects yet — Save one first"), loading, and error states.
> Deliver it as static HTML + CSS with documented class names and the states
> as modifier classes, so it can be wired to `js/cloud.js` (which already
> exposes list/load/delete) in a follow-up JS change. Do not wire JS yourself.

## Screen 8 — Home / module launcher (future, design ahead)

> Design a future home screen for CapyStudio as static HTML/CSS in
> `docs/mockups/home.html` (do not link it into the app yet): wordmark
> hero, a grid of module cards where "Lyric Video Maker" is active and
> placeholder cards (e.g. "Visualizer", "Trimmer") are visibly coming-soon,
> and a "Recent projects" row that assumes the signed-in cloud library.
> This defines the visual grammar modules will grow into — keep it fully in
> the established system.
