# Reference extension source analysis

Reference inspected: `3.5.8.0_0/` on branch `main` of this repository.

## Confirmed extension architecture

- Manifest V3; service worker module loaded through `service-worker-loader.js`.
- Content script is a small loader for the bundled Flow automation workflow.
- Side panel and separate workflow page are distinct UI surfaces.
- The Flow content workflow retrieves selector data using `GET_REMOTE_CONFIG`; the selector object is not embedded in the checked-in workflow bundle.
- The remote config loader requests `/config/flow-automation-2` from `configs.kylenguyen.me`, then falls back to `configs2.kylenguyen.me`, using an `X-Client-Secret` header.
- Background input actions use Chrome Debugger Protocol v1.3: `Input.insertText`, `Input.dispatchKeyEvent`, and `Input.dispatchMouseEvent`. The reference tracks attached tab IDs and detaches on explicit request or tab removal.
- The reference also enables CDP Network monitoring/cache control in one of its background actions.
- Resource downloads are initiated through `chrome.downloads.download`, with a `downloads.onDeterminingFilename` handler for optional folders/prefixes.

## Confirmed prompt-generation sequence

1. Load selector configuration and stop if it is unavailable.
2. Check/create a Flow project when needed.
3. Configure relevant mode and generation settings (including mode, aspect ratio, model, video option, and output count).
4. Fill the configured prompt editor using debugger-driven input.
5. Resolve image/character references through prompt mentions when the payload requires them.
6. Find the configured submit control; click it through debugger input or use a debugger key event for Enter.
7. Wait for the configured stop/generating control to disappear, with a 15-minute timeout in the prompt workflow.
8. Inspect output tiles. Progress percentages and media resources are used as evidence; tile failures are retried for inspection.
9. Only after generation evidence is found does the workflow continue to output download handling.
10. Emit generation progress and prompt-group status messages to the side panel/workflow UI.

## Confirmed queue and download behavior

- Queue tracks prompt groups, active/current prompt, completed indexes, per-prompt results, retries, download retries, and cancellation.
- Concurrency and randomized prompt-delay ranges are configurable.
- Queue recovery data is persisted to `chrome.storage.local` under `VEO_QUEUE_RECOVERY`; recovery can reload the page for certain failures.
- Download flow supports images/videos, per-prompt filenames, folders/prefixes, and quality menu paths including 1080, 2K, and 4K.
- Downloading and generation are tracked as separate statuses. A prompt may be generated but still be waiting for download completion.
- Workflow UI includes chained/concatenated prompts and agent-automation workflow variants. This is more than a simple batch text-to-video panel.

## Confirmed selector names used by the checked-in content bundle

The bundle references these selector keys in the remote `selectors` object (this is not asserted to be the complete set):

- `promptTextarea`
- `submitButton`
- `stopButton`
- `createProjectButton`
- `disableAgentModeButton`
- `enableAgentModeButton`
- `selectUploadImageType`
- `selectUploadCharacterType`
- `firstFoundedItemSelector`
- `downloadDoneButton`
- `tileOnQueue`
- `outputDetail.video`
- `outputDetail.image`
- `quality2KOption`
- `quality4KOption`
- `quality1080Option`
- `moreOptionsButtonInHoverTile`
- `downloadButtonInHoverTile`

## Known unresolved item

The config endpoint itself was not readable through the available web/source inspection path. The replica fetches the same endpoint at runtime and refuses to guess selector values. The only definitive validation of current selector compatibility will be a live run in the user's Chrome profile, where the runtime config response and visible Flow UI can be checked.

## Replica implementation status

### Stage 1 started in this folder

- `manifest.json`: permissions/host access, including `debugger` and `unlimitedStorage`.
- `background.js`: debugger attach/detach, CDP mouse movement/click, keyboard and text input, remote config fetch.
- `content.js`: remote-selector validation, prompt fill verification, debugger submission, conservative generation-state monitoring.
- `sidepanel.html/js/css`: single-prompt test interface and status display.
- `README.md`: development install instructions.

### Still to implement before calling this a full replica

1. Live-test the remote selector configuration and correct any selector-shape assumptions.
2. Reproduce project creation/navigation and full mode/settings configuration.
3. Reproduce generation tile discovery, robust progress polling, retry logic and tile-error classification.
4. Reproduce download handling, quality menus, naming/folders and download completion tracking.
5. Reproduce queue concurrency, delay ranges, retries, cancellation and queue recovery.
6. Reproduce image/character upload and @-mention handling, frame extraction, and chained workflows.
7. Reproduce the complete side-panel/workflow settings UI and test all supported modes.
8. Run static syntax checks and end-to-end browser tests; no browser runtime test has been performed by this source-only implementation step.

## Verification policy

- `clicked` is not the same as `submitted`.
- `submitted` is not the same as `generating`.
- `generating` is not the same as `completed`.
- A completed generation is not the same as a completed download.
- A state should only advance when supported by observed UI/resource evidence.
