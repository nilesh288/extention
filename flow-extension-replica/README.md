# Flow Automation Replica — development

This is a **new, isolated folder** based on source-level inspection of the reference extension in `3.5.8.0_0/`. It does not replace or modify `veo-flow-automation/`.

## Current stage

- Manifest V3 service worker.
- Debugger-protocol mouse and keyboard input (same input family as the reference).
- Does not depend on a remote selector/configuration service.
- Locally inventories visible editors, buttons, and status elements on the current Flow page.
- Uses conservative local heuristics to identify the prompt editor and a clearly labelled submit control; refuses weak or ambiguous candidates.
- Provides a **Diagnose Flow UI** action and a copyable report to identify the actual controls.
- Reports prompt submission separately from generation completion.
- Watches for visible generation status and newly appearing media resources.
- Minimal side panel for one prompt at a time to validate the input/submission path.

## Important limitations

The replica no longer calls `/config/flow-automation-2`. The local detector is a diagnostic first stage, not yet a complete replacement for the reference queue, output-tile download, retry/recovery, quality-selection, mention-upload, or workflow UI. Because Flow changes its UI over time, use the diagnostic report to refine local detection from the rendered page rather than guessing.

## Install for development

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked** and select this folder.
4. Open Google Flow, then open the extension side panel.
5. Click **Diagnose Flow UI** first. If editor/button detection is wrong, copy the diagnostic report and inspect it before attempting generation.
6. Test with one harmless prompt only after the editor and submit control are clearly identified.

Chrome may display a debugger notification while the extension controls the Flow tab. That is expected for this reference-style input approach. Detach is available from the side panel; the worker also detaches when the tab is removed.

Do not consider a prompt successful merely because the submit control was clicked. Check the panel's separate generation status.
