(() => {
  if (window.__flowStudioInstalled) return;
  window.__flowStudioInstalled = true;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const visible = el => !!el && !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  const textOf = el => (el?.innerText || el?.getAttribute?.("aria-label") || el?.getAttribute?.("title") || "").trim();
  function findPromptEditor() {
    const candidates = [...document.querySelectorAll('textarea, [contenteditable="true"], [role="textbox"], input[type="text"]')].filter(visible);
    return candidates.find(el => /prompt|describe|generate|imagine|type/i.test([
      el.getAttribute("placeholder"), el.getAttribute("aria-label"), el.getAttribute("data-placeholder"),
      el.getAttribute("name"), el.parentElement?.innerText
    ].filter(Boolean).join(" "))) || candidates.sort((a,b)=>(b.getBoundingClientRect().width*b.getBoundingClientRect().height)-(a.getBoundingClientRect().width*a.getBoundingClientRect().height))[0] || null;
  }
  function findButton(regex) {
    return [...document.querySelectorAll('button,[role="button"]')].filter(visible).find(el => regex.test(textOf(el) + " " + (el.getAttribute("aria-label") || ""))) || null;
  }
  async function setEditorText(editor, value) {
    editor.focus();
    if (editor.isContentEditable || editor.getAttribute("contenteditable") === "true") {
      const setter = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "innerText")?.set;
      if (setter) setter.call(editor, value); else editor.textContent = value;
    } else {
      const proto = editor instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (setter) setter.call(editor, value); else editor.value = value;
    }
    editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    editor.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(350);
  }
  async function runPrompt(payload) {
    const editor = findPromptEditor();
    if (!editor) throw new Error("Could not find the prompt field. Open a Google Flow project and try again.");
    await setEditorText(editor, payload.prompt);
    if (payload.aspectRatio && payload.aspectRatio !== "current") {
      // Ratio/model menus differ across Flow releases. Do not guess and click unrelated controls.
      const ratioButton = findButton(/aspect ratio|aspect ratio selector/i);
      if (ratioButton) {
        ratioButton.click(); await sleep(250);
        const ratioOption = [...document.querySelectorAll('button,[role="option"],[role="menuitem"]')].filter(visible).find(el => textOf(el).includes(payload.aspectRatio));
        if (ratioOption) { ratioOption.click(); await sleep(250); }
      }
    }
    // Current Flow UI exposes a named "Start generation" control in the prompt composer.
    // Prefer that explicit control; never click an arbitrary form button.
    const before = new Set([...document.querySelectorAll("flow-tile-container, video, img")]);
    const explicitSelectors = [
      'flow-base-prompt-box button[aria-label*="Start generation" i]',
      'flow-base-prompt-box button[aria-label*="Generate" i]',
      'button[aria-label*="Start generation" i]',
      'button[aria-label*="Iniciar generación" i]',
      'button[aria-label*="Iniciar geración" i]'
    ];
    let generate = null;
    for (const selector of explicitSelectors) {
      generate = [...document.querySelectorAll(selector)].find(el => visible(el) && !el.disabled && el.getAttribute("aria-disabled") !== "true");
      if (generate) break;
    }
    // Fallback only to an enabled, visible button with an explicit generation label.
    if (!generate) {
      const candidates = [...document.querySelectorAll('button,[role="button"]')].filter(visible);
      generate = candidates.find(el => !el.disabled && el.getAttribute("aria-disabled") !== "true" &&
        /start generation|generate video|generate image|create video|create image/i.test([
          el.getAttribute("aria-label"), el.getAttribute("title"), el.innerText
        ].filter(Boolean).join(" "))) || null;
    }
    if (!generate) {
      throw new Error('Prompt was filled, but the current Google Flow "Start generation" button was not found. No success was reported. Please capture a screenshot of the prompt composer.');
    }
    generate.click();
    await sleep(800);
    const buttonState = generate.isConnected
      ? { disabled: !!generate.disabled, ariaDisabled: generate.getAttribute("aria-disabled"), label: textOf(generate) }
      : { detached: true };
    const mediaAfter = new Set([...document.querySelectorAll("flow-tile-container, video, img")]);
    const visibleProgress = [...document.querySelectorAll('[role="progressbar"],mat-progress-spinner,[aria-label*="Generating" i],[aria-label*="Stop generation" i]')].some(visible);
    const uiChanged = mediaAfter.size > before.size || visibleProgress || buttonState.detached || buttonState.disabled || buttonState.ariaDisabled === "true";
    const submitMethod = "Generate button click";
    chrome.runtime.sendMessage({ type: "FLOW_STUDIO_LOG", level: "info", message: "Clicked Google Flow Generate control. Generation-start confirmation: " + (uiChanged ? "UI changed" : "not detected") + "." }).catch(() => {});
    return { ok: true, submitted: true, clickedGenerate: true, uiChanged, submitMethod, previousMediaCount: before.size, note: uiChanged ? "Generate was clicked and a UI change was observed; generation completion is not yet verified." : "Generate was clicked, but no visible start signal was detected. Check Google Flow before continuing." };
  }
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== "FLOW_STUDIO_RUN_PROMPT") return false;
    runPrompt(message.payload || {}).then(sendResponse).catch(error => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  });
})();