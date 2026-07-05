# Tapedeck 🎬

A lightweight, browser-based screen and camera recorder — built as a Loom alternative that keeps your recordings on-device.

## Features

- 🖥️ **Screen recording** — capture your full screen, a window, or a browser tab
- 🎙️ **System audio capture** — optionally record tab / system audio alongside your screen
- 📷 **Camera overlay** — record a floating camera bubble on top of your screen capture
- 🎤 **Microphone recording** — pick any connected input device
- 🎚️ **Quality presets** — Efficient (720p/30fps), Standard (1080p/30fps), Smooth (1080p/60fps), Maximum (native)
- ✂️ **In-browser editor** — trim, arrange clips, and adjust the camera bubble layout
- 📤 **Export** — download as video or GIF, all processing happens locally
- 🔒 **Privacy-first** — recordings never leave your device

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | [Next.js 15](https://nextjs.org/) (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS v4 |
| Media processing | [mediabunny](https://github.com/nicholasgasior/mediabunny) |
| GIF encoding | [gifenc](https://github.com/mattdesl/gifenc) |
| Storage | IndexedDB (on-device, no server) |

## Getting Started

```bash
# Install dependencies
npm install

# Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

> **Note:** Screen capture requires a Chromium-based browser (Chrome, Edge, Arc). Firefox has limited `getDisplayMedia` support.

## Project Structure

```
src/
├── app/                  # Next.js App Router pages
│   ├── page.tsx          # Home / recorder entry point
│   ├── projects/         # Saved recordings list
│   └── editor/           # Video editor page
├── components/
│   ├── recorder/         # SetupPanel, RecordingHud, RecorderFlow
│   ├── editor/           # EditorShell, Timeline, SidePanel, PreviewStage
│   └── ui/               # Shared UI primitives (Button, …)
└── lib/
    ├── media/            # Recorder, quality presets, format helpers
    ├── audio/            # Noise DSP, audio preview
    ├── editor/           # Controller, bubble layout, overlay styles
    ├── export/           # Video exporter, GIF encoder
    └── store/            # IndexedDB project store
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Build production bundle |
| `npm start` | Start production server |

## License

MIT
