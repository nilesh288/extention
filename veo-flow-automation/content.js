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
    const before = new Set([...document.querySelectorAll("video, img")]);
    const generate = findButton(/^(generate|create|make|run|submit)\b/i) ||
      [...document.querySelectorAll('button,[role="button"]')].filter(visible).find(el => /generate|create video|create image/i.test(textOf(el)));
    if (!generate) throw new Error("Prompt is filled, but the Generate button was not detected. Check Flow's current UI.");
    if (generate.disabled || generate.getAttribute("aria-disabled") === "true") throw new Error("Generate is currently disabled. Check the prompt, model, or available credits.");
    generate.click();
    chrome.runtime.sendMessage({ type: "FLOW_STUDIO_LOG", level: "info", message: "Submitted prompt to Google Flow." }).catch(() => {});
    return { ok: true, submitted: true, previousMediaCount: before.size, note: "Prompt submitted. Generation completion is controlled by Google Flow." };
  }
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== "FLOW_STUDIO_RUN_PROMPT") return false;
    runPrompt(message.payload || {}).then(sendResponse).catch(error => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  });
})();