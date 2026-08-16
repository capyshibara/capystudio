# CapyStudio Mobile — Layout Brief

> **Implementation status (August 2026): shipped.** The editor now uses the
> fixed preview → multi-track timeline → contextual bottom-tool layout from
> this brief. The scope was expanded beyond the original shell proposal to
> include multi-video import, sequential clip arrangement, trim/split/reorder,
> multiple audio clips, timed styled text, canvas presets, and merged export.
> The sections below are retained as the original research record.

Why: the current responsive mode just stacks the three desktop panels into one
long scrolling column. On a phone that means the preview scrolls out of view
while you edit, timing requires a hardware keyboard (Space/X/Esc — impossible
on touch), and hover-revealed controls (line-row buttons, delete) don't exist
on touch at all. This brief specifies a proper mobile shell, informed by how
CapCut — the reference editor for this audience — lays out its mobile app.

## 1. What CapCut mobile gets right (research summary)

Layout — three fixed zones, nothing important ever scrolls away:
1. **Preview window on top**: always visible, shows the frame at the playhead;
   direct manipulation (pinch/drag) happens right on the preview.
2. **Timeline in the middle**: horizontal clip blocks, pinch-zoom, playhead;
   tracks for video / audio / text.
3. **Toolbar at the bottom**: a horizontally scrollable row of tools. It is
   *context-sensitive* — global tools (audio, text, effects) when nothing is
   selected; clip tools (split, trim, speed) when a clip is selected. Tapping
   a tool opens a compact sub-panel over the lower zone, never over the
   preview.

Feature inventory (their "basic" tier): split/trim, speed, text + auto
captions, stickers, transitions, filters/effects, music + sound effects +
voice-over, background removal, templates/presets, per-platform export sizes.

What this means for us: our roadmap already points at several of these
(auto-timing via Whisper ≈ auto captions, style presets ≈ templates, text
animations, background transitions). The mobile lesson is not the feature
list — it's the **shell**: preview pinned on top, one working strip in the
middle, contextual tools in a bottom bar with sheets.

## 2. CapyStudio mobile shell (≤ 720px)

Desktop keeps the current three-pane layout. Below 720px the editor switches
to a CapCut-style vertical shell:

```
┌──────────────────────────┐
│ wordmark            ⋯    │  slim header: logo + overflow menu
├──────────────────────────┤
│                          │
│      preview canvas      │  Zone 1 — sticky, never scrolls away
│                          │
├──────────────────────────┤
│ ▶ 0:42 ────────── 3:12   │  Zone 2 — transport + waveform strip
│ ▁▂▅▃▆▂▁▅▃▂▆▁▂▅ (seek)    │
├──────────────────────────┤
│ [sheet content area]     │  Zone 3 — content of the active tool
│                          │
├──────────────────────────┤
│ 🎵Media 📝Lyrics ⏱Timing │  bottom tool bar (fixed, scrollable row)
│ 🎨Style 🎬Intro ⬇Export  │
└──────────────────────────┘
```

- **Header** collapses to wordmark + a `⋯` overflow menu holding Save/Load
  project, SRT, LRC, Import subs, and the account cluster. Export moves to
  the bottom bar (it's a primary action, thumb territory).
- **Zone 3 sheets**: tapping a bottom-bar tool swaps the sheet content —
  Media (the two pickers + resolution), Lyrics (textarea + line list),
  Style (font/colors/position), Intro & credits, Export. One sheet at a
  time; preview and transport always stay visible above.
- All current element ids survive — the sheets are the existing panel
  sections re-parented/re-styled, not new markup trees. Visibility is CSS
  (`data-sheet` attribute on body or a `.sheet--active` class), plus a small
  bottom-bar controller in JS.

## 3. Tap-timing on touch — the critical redesign

Desktop timing is keyboard-driven. Mobile gets a **Timing mode takeover**:

- Entering ⏱ Timing hides the sheet and shows, under the waveform:
  - a **huge primary STAMP button** (min 40% of width, bottom-center, thumb
    reach) — equivalent of Space,
  - a smaller **"End line"** button beside it — equivalent of X,
  - **"Undo last"** (clears the previous stamp and steps back one line),
  - a live two-line ticker: *current line* (just stamped) and **Next: "…"**
    so the user always knows what they're about to stamp,
  - Exit (✕) top-right of the zone — equivalent of Esc.
- The record-red live treatment (pulse) applies exactly as on desktop.
- Keyboard shortcuts keep working when a hardware keyboard exists.

## 4. Touch interaction rules

- No essential action depends on hover; contextual clip controls live in the
  bottom sheet.
- Primary phone controls use large touch targets and the bottom dock stays in
  thumb reach.
- The transport scrubber and timeline lanes support direct seeking.
- File pickers: tap opens the native picker (drag & drop is desktop-only
  garnish); zone copy should say "Choose", not "drop".
- During export, request a **screen Wake Lock** (`navigator.wakeLock`) and
  warn that the recording happens in real time; releasing on done/cancel.
  (Real-time MediaRecorder export works on mobile browsers, but a sleeping
  screen kills it.)
- `viewport-fit=cover` + safe-area insets for the fixed bottom bar.

## 5. Remaining out of scope

- Direct manipulation of text inside the preview (drag, rotate, pinch-scale).
- Stickers, filters/effects, keyframes, background removal, and speed ramps.
- Server-side or faster-than-real-time rendering.

## 6. QA (mobile walkthrough, 375×812)

1. Multi-select videos/photos in the native picker; every item becomes a
   sequential Video-track block.
2. Preview stays visible while the tool sheet opens and collapses.
3. Select a video block; trim, split, set speed, drag/reframe, move, and undo.
4. Add an incoming transition to a later video clip and preview the boundary.
5. Add music; set its timeline start, trim, volume, and fades. Record a short
   microphone voice-over and verify it lands at the playhead.
6. Add text; set timing, style, position, and animation. Generate automatic
   captions and edit one of the resulting text layers.
7. Change canvas aspect and fit; clip order and total duration remain stable.
8. Export: wake lock held, progress overlay readable, output downloads.
8. No horizontal page scroll at 390×844; timeline itself scrolls as intended.
