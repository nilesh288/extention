# Flow Automation Replica — development

This is a **new, isolated folder** based on source-level inspection of the reference extension in `3.5.8.0_0/`. It does not replace or modify `veo-flow-automation/`.

## Current stage

- Manifest V3 service worker.
- Debugger-protocol mouse and keyboard input (same input family as the reference).
- Fetches the reference selector configuration from the two configured endpoints.
- Uses configured prompt/submit/stop selectors only; does not invent selector fallbacks.
- Reports prompt submission separately from generation completion.
- Watches for configured stop-control disappearance and newly appearing media resources.
- Minimal side panel for one prompt at a time to validate the input/submission path.

## Important limitations

The reference configuration endpoint `/config/flow-automation-2` could not be inspected through the available source viewer. The extension requests it at runtime, and fails visibly if it cannot obtain valid selectors. The current implementation is a first-stage foundation, not yet a complete replacement for the reference queue, output-tile download, retry/recovery, quality-selection, mention-upload, or workflow UI.

## Install for development

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked** and select this folder.
4. Open Google Flow, then open the extension side panel.
5. Test with one harmless prompt first.

Chrome may display a debugger notification while the extension controls the Flow tab. That is expected for this reference-style input approach. Detach is available from the side panel; the worker also detaches when the tab is removed.

Do not consider a prompt successful merely because the submit control was clicked. Check the panel's separate generation status.
