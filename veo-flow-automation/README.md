# Flow Studio — Batch Assistant

An original, lightweight Chrome Manifest V3 extension scaffold for organizing and submitting prompt batches in Google Flow.

## Features
- Chrome side-panel UI with Generate, Queue, Settings, and Activity views.
- Text-to-video, image-to-video, text-to-image, and image-to-image mode labels.
- Multi-prompt queue with per-item status, pause-on-error preference, and stop control.
- Persistent local preferences and activity log.
- Optional download folder and filename preferences (the browser download helper is ready for detected direct media URLs).
- Conservative page automation: fills a detected prompt editor and submits only when a visible Generate/Create button is found.

## Install in Chrome / Chromium
1. Download this folder or clone the repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select the `veo-flow-automation` directory.
5. Open `https://flow.google/`, enter a project, and open the extension side panel.

## Important implementation notes
- Google Flow's UI and available models vary over time and by account. The prompt editor and generation button are detected from visible page elements; if Flow changes its UI, selectors may need adjustment.
- The current implementation submits prompts and records successful submission; it does **not** guarantee that a generated asset is complete or automatically download every result.
- Model selection, output count, media upload, and exact generation-mode switching are represented in the UI but require site-specific validation before being automated. The extension intentionally avoids clicking ambiguous controls.
- This project is an independent implementation and does not include the reference extension's bundled source or assets.

## Permissions
Only uses browser storage, tabs, side panel, downloads, and access to Google Flow / Google Labs pages. Preferences are stored with `chrome.storage.local`.
