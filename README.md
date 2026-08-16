# CapyStudio

CapyStudio is a private, browser-based video editor built for phone footage.
Select several videos or photos, arrange them into a story, add music and timed
text, and export the result without uploading your media to a server.

**Live app: https://capyshibara.github.io/capystudio/**

## What the editor can do

- Import multiple videos and photos at once from a phone or computer.
- Browse six original templates by category or search, preview each recipe, and
  batch-fill its media slots from the phone picker.
- Apply template-defined canvas size, clip pacing, reframing, transitions, and
  editable text while keeping every timeline control available.
- Join visual clips sequentially on a three-track timeline.
- Reorder, trim, split, speed up/slow down, and delete video clips.
- Reframe each clip with direct preview dragging plus zoom and rotation controls.
- Add crossfade, fade-through-black, slide, or zoom transitions between clips.
- Control the original sound of each video clip.
- Add one or more songs from the device, position and trim them, and adjust
  volume plus fade-in/fade-out.
- Record voice-over from the device microphone directly onto the timeline.
- Add multiple timed text layers with font, size, color, backdrop, position,
  and fade/pop animation controls.
- Generate editable automatic captions in the browser with a private Whisper
  speech model. The first use downloads the model and caches it locally.
- Preview the complete edit with synchronized video, original audio, music,
  and text.
- Choose 9:16, 16:9, 1:1, or 4:5 output and 24/30/60 fps.
- Save and reopen editable `.capy.json` project files. Browsers cannot embed
  local media inside project JSON, so the original files are reattached after
  opening a saved project.
- Export the composited timeline as MP4 where the browser supports MP4
  recording, otherwise WebM.

## Quick start

1. Open **Video Editor** and choose **Add videos or photos**, or start in the
   **Template Library** and choose **Use template**.
2. Select several items from the device picker. They appear one after another
   on the Video track.
3. Tap a clip to trim, split, change speed, reframe it, add its incoming
   transition, move it, or change its original volume.
4. Open **Audio** to add songs or record voice-over. Open **Text** to create
   timed titles at the playhead or generate editable automatic captions.
5. Use **Canvas** for the target social format, preview the result, then choose
   **Export**.

On phones the editor follows a preview → timeline → contextual tools layout.
The tools collapse into a thumb-friendly bottom dock so the preview and
timeline remain available while editing.

## Privacy and export

Media files are read through local browser file handles and are not uploaded by
the editor. Export uses `MediaRecorder` on the composed canvas and mixed Web
Audio output. It therefore runs in real time: a four-minute timeline takes
about four minutes to export, and the tab should remain visible. CapyStudio
requests a screen wake lock on supported mobile browsers during export.

Automatic captions use Transformers.js and a compact Whisper model. The model
files are downloaded from Hugging Face on first use and cached by the browser;
the timeline audio is decoded and transcribed locally. Voice-over requires the
browser's microphone permission.

## Development

There is no build step or framework. Serve the repository and open the editor:

```sh
python3 serve.py
```

The development URL is printed in the terminal (normally
`http://127.0.0.1:8901/editor.html`).

| File | Role |
|---|---|
| `editor.html` | Editor shell, preview, timeline, tool dock, and export UI |
| `templates.html` | Searchable template gallery and recipe previews |
| `js/model.js` | Versioned project model and timeline helpers |
| `js/app.js` | Media loading, playback engine, editing controls, save/load |
| `js/captions.js` | Local timeline audio decoding and Whisper transcription |
| `js/templates.js` | Original template recipes, media slots, and metadata |
| `js/templates-page.js` | Template filtering, preview, and editor handoff |
| `js/renderer.js` | Canvas compositor used by preview and export |
| `js/exporter.js` | MediaRecorder and Web Audio export pipeline |
| `css/style.css` | Desktop and CapCut-inspired mobile UI |

## Current limitations

- Export is real-time and the available MP4/WebM format depends on the browser.
- Media bytes are not embedded in saved project JSON.
- Stickers, filters/effects, keyframes, background removal, and speed ramps are
  not part of this release yet. Constant per-clip speed is supported.
- Automatic caption quality and speed depend on the browser, device memory,
  spoken audio, and the compact local model.
- Very large or long projects remain constrained by the phone/browser's memory.

## License

MIT
