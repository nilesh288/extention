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
  const send = (type, payload = {}) => chrome.runtime.sendMessage({ type, ...payload });
  const log = (message, level = "info") => send("REPLICA_LOG", { message, level }).catch(() => {});
  const clean = value => String(value || "").replace(/\\s+/g, " ").trim().slice(0, 140);
  const describe = (element, index) => {
    const rect = element.getBoundingClientRect();
    return {
      index,
      tag: element.tagName.toLowerCase(),
      role: element.getAttribute("role") || "",
      text: clean(element.innerText || element.textContent),
      ariaLabel: clean(element.getAttribute("aria-label")),
      title: clean(element.getAttribute("title")),
      placeholder: clean(element.getAttribute("placeholder")),
      testId: clean(element.getAttribute("data-testid")),
      type: clean(element.getAttribute("type")),
      disabled: Boolean(element.disabled || element.getAttribute("aria-disabled") === "true"),
      contenteditable: element.getAttribute("contenteditable") || "",
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }
    };
  };
  const editorElements = () => [...document.querySelectorAll(
    'textarea, input:not([type="hidden"]), [contenteditable="true"], [role="textbox"]'
  )].filter(visible);
  const buttonElements = () => [...document.querySelectorAll(
    'button, [role="button"], input[type="submit"], input[type="button"]'
  )].filter(visible);
  const describePage = () => ({
    url: location.href,
    title: document.title,
    editors: editorElements().map(describe),
    buttons: buttonElements().map(describe),
    hints: [...document.querySelectorAll('[aria-live], [role="status"], [role="progressbar"]')]
      .filter(visible).map((el, i) => describe(el, i)).slice(0, 30)
  });
  const center = element => {
    const rect = element.getBoundingClientRect();
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
  };
  async function debuggerClick(element) {
    if (!visible(element)) throw new Error("Target control is not visible.");
    const result = await send("DEBUGGER_CLICK", center(element));
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
  function discoverEditor() {
    const candidates = editorElements();
    const score = el => {
      const rect = el.getBoundingClientRect();
      const hint = [
        el.getAttribute("placeholder"), el.getAttribute("aria-label"),
        el.getAttribute("data-testid"), el.getAttribute("name"),
        el.getAttribute("role"), el.innerText
      ].join(" ").toLowerCase();
      let points = 0;
      if (el.matches("textarea")) points += 8;
      if (el.getAttribute("contenteditable") === "true") points += 7;
      if (el.getAttribute("role") === "textbox") points += 5;
      if (/prompt|describe|imagine|type|write|generate/.test(hint)) points += 8;
      if (rect.width > 250) points += 2;
      if (rect.height > 45) points += 2;
      return points;
    };
    return candidates.map(el => ({el, score:score(el)})).sort((a,b)=>b.score-a.score);
  }
  function discoverSubmit() {
    const candidates = buttonElements().filter(el => !el.disabled && el.getAttribute("aria-disabled") !== "true");
    const score = el => {
      const hint = [
        el.innerText, el.textContent, el.getAttribute("aria-label"),
        el.getAttribute("title"), el.getAttribute("data-testid")
      ].join(" ").toLowerCase().replace(/\\s+/g, " ");
      let points = 0;
      if (/generate|create|submit|send|make video|make image/.test(hint)) points += 12;
      if (/stop|cancel|close|back|menu|settings|upload|download/.test(hint)) points -= 10;
      if (el.querySelector("svg, mat-icon, [class*='icon']")) points += 1;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) points -= 20;
      return points;
    };
    return candidates.map(el=>({el,score:score(el)})).sort((a,b)=>b.score-a.score);
  }
  async function fillPrompt(editor, prompt) {
    await debuggerClick(editor);
    await sleep(150);
    await debuggerKey({ key: "a", code: "KeyA", keyCode: 65, modifiers: 2 });
    await debuggerKey({ key: "Backspace", code: "Backspace", keyCode: 8 });
    await debuggerType(prompt);
    await sleep(400);
    const value = String(editor.innerText ?? editor.value ?? "").trim();
    const expectedPrefix = prompt.slice(0, Math.min(20, prompt.length));
    if (!value || !value.includes(expectedPrefix)) {
      throw new Error("Prompt text verification failed after debugger input. Inspect the Flow UI report before retrying.");
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
  async function diagnose() {
    const report = describePage();
    await send("REPLICA_DIAGNOSTIC", { report });
    await log("Collected local Flow UI diagnostics: " + report.editors.length + " visible editor(s), " + report.buttons.length + " visible button(s).");
    return { ok: true, report };
  }
  async function waitForGeneration(before, timeoutMs = 15 * 60 * 1000) {
    const startedAt = Date.now();
    let sawGenerating = false;
    let sawNewResource = false;
    let stableResourceChecks = 0;
    let lastResourceCount = before.size;
    const status = state => send("REPLICA_GENERATION_STATUS", { state, elapsedMs: Date.now() - startedAt });
    await status("submitted");
    while (Date.now() - startedAt < timeoutMs) {
      const buttons = buttonElements();
      const stopVisible = buttons.some(el => /stop generation|stop creating|cancel generation/i.test([
        el.innerText, el.getAttribute("aria-label"), el.getAttribute("title")
      ].join(" ")));
      const now = resourceSnapshot();
      const newResources = [...now].filter(url => !before.has(url));
      const statusText = [...document.querySelectorAll('[aria-live], [role="status"]')]
        .filter(visible).map(el => clean(el.innerText || el.textContent)).join(" ").toLowerCase();
      if (stopVisible || /generating|creating video|creating image|processing your request/.test(statusText)) {
        if (!sawGenerating) { sawGenerating = true; await status("generating"); }
      }
      if (newResources.length) sawNewResource = true;
      if (now.size === lastResourceCount) stableResourceChecks++;
      else stableResourceChecks = 0;
      lastResourceCount = now.size;
      if (sawGenerating && !stopVisible && sawNewResource && stableResourceChecks >= 3) {
        await status("completed");
        return { state: "completed", newResources };
      }
      await sleep(1500);
    }
    const newResources = [...resourceSnapshot()].filter(url => !before.has(url));
    await status("timeout");
    return { state:"timeout", error:"Could not verify completed generation before timeout.", sawGenerating, sawNewResource, newResources };
  }
  async function runPrompt(payload) {
    if (!payload || typeof payload.prompt !== "string" || !payload.prompt.trim()) throw new Error("Prompt is empty.");
    if (location.hostname !== "flow.google.com" && !location.hostname.endsWith(".flow.google.com")) throw new Error("This tab is not on flow.google.com.");

    const editorCandidates = discoverEditor();
    const submitCandidates = discoverSubmit();
    await log("Local detection found " + editorCandidates.length + " editor candidate(s) and " + submitCandidates.length + " button candidate(s).");
    if (!editorCandidates.length) {
      await diagnose();
      throw new Error("No visible prompt editor detected. Use Diagnose Flow UI and share the report.");
    }
    if (!submitCandidates.length || submitCandidates[0].score < 1) {
      await diagnose();
      throw new Error("No likely submit control could be identified locally. Use Diagnose Flow UI and share the report; submission was not attempted.");
    }
    if (editorCandidates.length > 1 && editorCandidates[0].score === editorCandidates[1].score) {
      await diagnose();
      throw new Error("Prompt editor detection is ambiguous. Use Diagnose Flow UI and share the report; submission was not attempted.");
    }
    if (submitCandidates.length > 1 && submitCandidates[0].score === submitCandidates[1].score) {
      await diagnose();
      throw new Error("Submit button detection is ambiguous. Use Diagnose Flow UI and share the report; submission was not attempted.");
    }

    const editor = editorCandidates[0].el;
    const submit = submitCandidates[0].el;
    await log("Local candidate selection: editor score " + editorCandidates[0].score + "; submit score " + submitCandidates[0].score + ".");
    const before = resourceSnapshot();
    await fillPrompt(editor, payload.prompt.trim());
    const submitAfterFill = discoverSubmit()[0];
    if (!submitAfterFill || submitAfterFill.score < 1) {
      await diagnose();
      throw new Error("Submit control could not be confirmed after prompt entry. Submission was not attempted.");
    }
    await sleep(700 + Math.random() * 1200);
    await debuggerClick(submitAfterFill.el);
    await log("Clicked locally detected submit candidate using debugger input; waiting for independent generation evidence.", "info");
    const result = await waitForGeneration(before);
    return {
      ok: result.state === "completed", submitted: true, generation: result.state,
      error: result.error, sawGenerating: result.sawGenerating,
      sawNewResource: result.sawNewResource, newResources: result.newResources || []
    };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "REPLICA_DIAGNOSE_FLOW") {
      diagnose().then(sendResponse).catch(error => sendResponse({ok:false,error:String(error?.message||error)}));
      return true;
    }
    if (message?.type !== "REPLICA_RUN_PROMPT") return false;
    runPrompt(message.payload).then(sendResponse).catch(error => {
      log(String(error?.message || error), "error");
      sendResponse({ ok: false, submitted: false, error: String(error?.message || error) });
    });
    return true;
  });
})();