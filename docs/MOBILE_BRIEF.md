# CapyStudio Mobile — Layout Brief

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

- No hover anywhere: line-row micro-buttons and the cloud-popover delete are
  always visible on touch (`@media (hover: none)`).
- Hit targets ≥ 44×44px for primary controls, ≥ 32px for row micro-buttons.
- The waveform strip is tap-to-seek (already works); add a drag-scrub.
- File pickers: tap opens the native picker (drag & drop is desktop-only
  garnish); zone copy should say "Choose", not "drop".
- During export, request a **screen Wake Lock** (`navigator.wakeLock`) and
  warn that the recording happens in real time; releasing on done/cancel.
  (Real-time MediaRecorder export works on mobile browsers, but a sleeping
  screen kills it.)
- `viewport-fit=cover` + safe-area insets for the fixed bottom bar.

## 5. Out of scope for the first mobile pass

- No timeline clip-blocks (we have one audio + one background; the waveform
  strip *is* our timeline until multi-track lands).
- No pinch-zoom waveform, no direct-manipulation preview (nothing draggable
  in the frame yet).
- No feature additions from the CapCut inventory (transitions, stickers,
  filters) — shell first; those live on the README roadmap already.

## 6. QA (mobile walkthrough, 375×812)

1. Load audio + background via native pickers; both zones show loaded state.
2. Preview stays visible while switching every sheet.
3. Paste lyrics, load lines, enter Timing mode → stamp a whole song one-handed
   with the big button; End line and Undo behave; exit restores the sheet.
4. Line list: micro-buttons visible and tappable without hover; times update.
5. Style change reflects live in the always-visible preview.
6. Export: wake lock held, progress overlay readable, file downloads.
7. No horizontal scroll; bottom bar clears the home-indicator safe area.
8. Desktop (≥ 720px) is pixel-identical to today.
