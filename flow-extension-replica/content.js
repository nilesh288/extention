(() => {
  if (window.__flowReplicaContentInstalled) return;
  window.__flowReplicaContentInstalled = true;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const visible = element => {
    if (!element || !element.isConnected) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" &&
      Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
  };
  const queryAll = selector => {
    if (typeof selector !== "string" || !selector.trim()) return [];
    try { return [...document.querySelectorAll(selector)]; } catch { return []; }
  };
  const firstVisible = selector => queryAll(selector).find(visible) || null;
  const center = element => {
    const rect = element.getBoundingClientRect();
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
  };
  const send = (type, payload = {}) => chrome.runtime.sendMessage({ type, ...payload });
  const log = (message, level = "info") => send("REPLICA_LOG", { message, level }).catch(() => {});

  async function loadConfig() {
    const result = await send("GET_REMOTE_CONFIG");
    if (!result?.ok || !result.config?.selectors) {
      throw new Error("Reference selector configuration unavailable. " + (result?.error || "No valid config response.") + " No selector guesses were used.");
    }
    return result.config;
  }
  async function debuggerClick(element) {
    if (!visible(element)) throw new Error("Target control is not visible.");
    const { x, y } = center(element);
    const result = await send("DEBUGGER_CLICK", { x, y });
    if (!result?.ok) throw new Error(result?.error || "Debugger mouse click failed.");
  }
  async function debuggerKey(key) {
    const result = await send("DEBUGGER_KEY", { key });
    if (!result?.ok) throw new Error(result?.error || "Debugger keyboard input failed.");
  }
  async function debuggerType(text) {
    const result = await send("DEBUGGER_TYPE", { text });
    if (!result?.ok) throw new Error(result?.error || "Debugger text input failed.");
  }
  async function fillPrompt(editor, prompt) {
    await debuggerClick(editor);
    await sleep(150);
    await debuggerKey({ key: "a", code: "KeyA", keyCode: 65, modifiers: 2 });
    await debuggerKey({ key: "Backspace", code: "Backspace", keyCode: 8 });
    await debuggerType(prompt);
    await sleep(300);
    const value = String(editor.innerText ?? editor.value ?? "").trim();
    const expectedPrefix = prompt.slice(0, Math.min(20, prompt.length));
    if (!value || !value.includes(expectedPrefix)) {
      throw new Error("Prompt text verification failed after debugger input; submit was not attempted.");
    }
  }
  function resourceSnapshot() {
    const urls = new Set();
    for (const element of document.querySelectorAll("video, img")) {
      if (!visible(element)) continue;
      const url = element.currentSrc || element.src;
      if (url && !url.startsWith("data:")) urls.add(url);
    }
    return urls;
  }
  async function waitForGeneration(config, before, timeoutMs = 15 * 60 * 1000) {
    const stopSelector = config.selectors.stopButton;
    const startedAt = Date.now();
    let sawGenerating = false;
    let sawNewResource = false;
    let stableResourceChecks = 0;
    let lastResourceCount = before.size;
    const status = state => send("REPLICA_GENERATION_STATUS", { state, elapsedMs: Date.now() - startedAt });
    await status("submitted");
    while (Date.now() - startedAt < timeoutMs) {
      const stop = firstVisible(stopSelector);
      const now = resourceSnapshot();
      const newResources = [...now].filter(url => !before.has(url));
      if (stop && !sawGenerating) {
        sawGenerating = true;
        await status("generating");
      }
      if (newResources.length) sawNewResource = true;
      if (now.size === lastResourceCount) stableResourceChecks++;
      else stableResourceChecks = 0;
      lastResourceCount = now.size;
      if (sawGenerating && !stop && sawNewResource && stableResourceChecks >= 3) {
        await status("completed");
        return { state: "completed", newResources };
      }
      await sleep(1500);
    }
    const finalNow = resourceSnapshot();
    const newResources = [...finalNow].filter(url => !before.has(url));
    await status("timeout");
    return {
      state: "timeout",
      error: "Could not verify completed generation before timeout.",
      sawGenerating,
      sawNewResource,
      newResources
    };
  }
  async function runPrompt(payload) {
    if (!payload || typeof payload.prompt !== "string" || !payload.prompt.trim()) throw new Error("Prompt is empty.");
    if (location.hostname !== "flow.google.com" && !location.hostname.endsWith(".flow.google.com")) {
      throw new Error("This tab is not on flow.google.com.");
    }
    const config = await loadConfig();
    const selectors = config.selectors;
    if (typeof selectors.promptTextarea !== "string" || typeof selectors.submitButton !== "string" || typeof selectors.stopButton !== "string") {
      throw new Error("Remote selector config is missing promptTextarea, submitButton, or stopButton. Submission was not attempted.");
    }
    const editor = firstVisible(selectors.promptTextarea);
    if (!editor) throw new Error("Configured prompt editor was not found. Submission was not attempted.");
    const submit = firstVisible(selectors.submitButton);
    if (!submit) throw new Error("Configured submit button was not found before filling prompt. Submission was not attempted.");
    if (submit.disabled || submit.getAttribute("aria-disabled") === "true") {
      throw new Error("Configured submit button is disabled before prompt entry.");
    }

    const before = resourceSnapshot();
    await fillPrompt(editor, payload.prompt.trim());
    const submitAfterFill = firstVisible(selectors.submitButton);
    if (!submitAfterFill || submitAfterFill.disabled || submitAfterFill.getAttribute("aria-disabled") === "true") {
      throw new Error("Submit control is missing or disabled after prompt entry. Submission was not attempted.");
    }
    await sleep(700 + Math.random() * 1200);
    await debuggerClick(submitAfterFill);
    await log("Submitted prompt using debugger input; waiting for independent generation evidence.", "info");
    const result = await waitForGeneration(config, before);
    return {
      ok: result.state === "completed",
      submitted: true,
      generation: result.state,
      error: result.error,
      sawGenerating: result.sawGenerating,
      sawNewResource: result.sawNewResource,
      newResources: result.newResources || []
    };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== "REPLICA_RUN_PROMPT") return false;
    runPrompt(message.payload).then(sendResponse).catch(error => {
      log(String(error?.message || error), "error");
      sendResponse({ ok: false, submitted: false, error: String(error?.message || error) });
    });
    return true;
  });
})();