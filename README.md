# 🎬 Lyric Video Maker

Turn a song + a background image (or looping video) + lyrics into a subtitled
music video — entirely in your browser. No install, no upload, no server:
your files never leave your machine.

**Use it here: https://capyshibara.github.io/lyric-video-maker/**

## How to use

1. **Audio** — choose (or drag in) your song file.
2. **Background** — choose an image or a short video (it loops automatically).
3. **Lyrics** — paste them in the right panel, one line per subtitle, press
   *Load lines*.
4. **Tap timing** — press *⏱ Tap timing*: the song plays, and you press
   **Space** exactly when each line should appear. Press **X** to end the
   current line early (instrumental gap), **Esc** to stop. Fine-tune any line
   with the per-line ⏱/⏹ buttons or by clicking the waveform to seek.
5. **Style** — font, size, colors, outline, position, background dim. The
   preview is exactly what gets exported.
6. **⬇ Export video** — records in real time (a 3-minute song takes ~3 minutes;
   keep the tab visible). Output is **MP4 on Safari, WebM on Chrome/Firefox** —
   both upload fine to YouTube and most platforms.

Also available: **SRT / LRC export & import**, and **save/load project**
(timings + style as JSON; media files are re-attached on load since browsers
can't store them in the JSON).

## Why real-time export?

GitHub Pages is static hosting — there is no server to run an encoder on.
The app records its own preview canvas with the browser's built-in
`MediaRecorder`, which runs at playback speed. Zero dependencies, works
offline once loaded, and what you see is literally what you get.

## Development

Static site, no build step. Serve the folder and open it:

```
python3 -m http.server 8000
```

Modules:

| File | Role |
|---|---|
| `js/model.js` | Project state: assets / tracks / clips / style (serializable JSON) |
| `js/renderer.js` | Pure canvas frame renderer — drives both preview and export |
| `js/exporter.js` | MediaRecorder capture (canvas + Web Audio graph) |
| `js/waveform.js` | Waveform strip, playhead, lyric markers, click-to-seek |
| `js/formats.js` | SRT / LRC parse & stringify |
| `js/app.js` | UI wiring |

The project model is deliberately track/clip/asset shaped rather than
"one audio + one image", so the roadmap below extends it without a rewrite.

## Roadmap

- Word-level karaoke highlighting
- Text animations (fade, slide, typewriter)
- Auto-transcription timing via Whisper (WebGPU)
- Multiple backgrounds per song section, with crossfade transitions
- Ken Burns (slow zoom/pan) on still images
- Audio-reactive visualizers (spectrum, waveform pulse)
- Faster-than-real-time MP4 export via WebCodecs
- Style presets / templates, batch export

## License

MIT
