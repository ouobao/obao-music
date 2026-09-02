# Obao Music

A feature-rich desktop music player for Windows, built with **Electron 33 + React 18 + TypeScript**.
Stream and organize music from NetEase Cloud Music, QQ Music, and local files — with lossless-quality playback, karaoke-style lyrics, and a fully custom UI.

| | |
|---|---|
| ![Player](images/1.png) | ![Lyrics](images/2.png) |

## Features

**Multi-source streaming**

- Three providers behind one unified interface: NetEase Cloud Music, QQ Music, and local files
- Unified search across songs, artists, albums, and playlists, plus charts and playlist discovery
- Daily recommendations, recommendation history, and similar-song suggestions (NetEase)
- QR-code or account login; like songs and manage your playlists in-app

**Playback**

- Quality tiers from standard up to lossless
- Karaoke-style scrolling lyrics with translation support
- Playback restrictions (VIP / copyright / region) surfaced as clear, actionable messages
- Exclusive-mode audio output, tray playback controls, and Windows media-key integration

**Desktop experience**

- Custom frameless window with its own navigation stack (no router library)
- 3D ambient background rendered with Three.js; GSAP-driven motion across the UI
- Light / dark themes, queue panel, similar-songs panel, toasts, and skeleton loading states

## Tech Stack

| Layer | Tech |
|---|---|
| Shell | Electron 33 (main process in TypeScript) |
| UI | React 18 + Vite 5 + TypeScript |
| State | Zustand 5 |
| Motion | GSAP + @gsap/react |
| 3D | Three.js |
| IPC | Typed contract over contextBridge — no HTTP layer |
| Audio | Custom `musicplayer-audio://` protocol with a main-process proxy and expiring handles |

## Architecture Highlights

- **Typed IPC contract** — every `window.musicPlayer.*` call returns a discriminated result (`{ok:true,data} | {ok:false,error}`); the full interface is specified in [docs/FEATURES.md](docs/FEATURES.md)
- **Provider abstraction** — NetEase / QQ / local sources implement one provider interface with a capability matrix, so the UI degrades gracefully per platform
- **Secure media pipeline** — audio URLs are resolved by the main process and exposed to the renderer only through a custom protocol with time-limited handles
- **Structured playback errors** — restrictions map to typed categories (`login_required`, `vip_required`, `copyright_unavailable`, …) with a suggested action for each

## Getting Started

Requirements: Windows 10/11, Node.js 20+ (LTS recommended).

```bat
git clone <repo-url>
cd MusicPlayer
npm install
npm run dev
```

Optional — register the Windows app identity (enables system media controls / SMTC):

```bat
npm run windows:register-identity
```

### Build & Package

```bat
npm run build              # typecheck + production build
npm run dist:win           # NSIS installer (x64)
npm run dist:win:portable  # portable executable
```

## Documentation

- [docs/FEATURES.md](docs/FEATURES.md) — complete feature specification and IPC contract
- [docs/COMPREHENSIVE_UI_MOTION_ANALYSIS.md](docs/COMPREHENSIVE_UI_MOTION_ANALYSIS.md) — UI motion design analysis

## License

[MIT](LICENSE)
