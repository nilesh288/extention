const attachedTabs = new Set();
const lastMouse = new Map();

chrome.runtime.onInstalled.addListener(() => {
  if (!chrome.sidePanel) return;
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});
chrome.action.onClicked.addListener(async tab => {
  if (chrome.sidePanel && Number.isInteger(tab.id)) {
    try { await chrome.sidePanel.open({ tabId: tab.id }); } catch {}
  }
});
chrome.tabs.onRemoved.addListener(tabId => {
  attachedTabs.delete(tabId);
  lastMouse.delete(tabId);
});
chrome.debugger.onDetach.addListener(source => {
  if (Number.isInteger(source.tabId)) attachedTabs.delete(source.tabId);
});

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const random = (min, max) => min + Math.random() * (max - min);

async function ensureAttached(tabId) {
  if (attachedTabs.has(tabId)) return;
  await chrome.debugger.attach({ tabId }, "1.3");
  attachedTabs.add(tabId);
}
async function sendCDP(tabId, method, params = {}) {
  await ensureAttached(tabId);
  return chrome.debugger.sendCommand({ tabId }, method, params);
}
async function typeText(tabId, text) {
  await sendCDP(tabId, "Input.insertText", { text: String(text ?? "") });
}
async function keyPress(tabId, { key, code, keyCode, modifiers = 0, text, commands, keyType }) {
  const params = { key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode };
  if (text !== undefined) { params.text = text; params.unmodifiedText = text; }
  if (modifiers) params.modifiers = modifiers;
  if (commands) params.commands = commands;
  if (keyType) {
    await sendCDP(tabId, "Input.dispatchKeyEvent", { type: keyType, ...params });
  } else {
    await sendCDP(tabId, "Input.dispatchKeyEvent", { type: "keyDown", ...params });
    await sleep(random(30, 90));
    await sendCDP(tabId, "Input.dispatchKeyEvent", { type: "keyUp", ...params });
  }
}
async function moveMouse(tabId, x, y) {
  const previous = lastMouse.get(tabId) || { x: x - 120, y: y - 60 };
  const distance = Math.hypot(x - previous.x, y - previous.y);
  const steps = Math.max(6, Math.min(28, Math.round(distance / 18 + random(3, 8))));
  const bend = random(-0.25, 0.25) * distance;
  const nx = distance ? -(y - previous.y) / distance : 0;
  const ny = distance ? (x - previous.x) / distance : 0;
  const cx = (previous.x + x) / 2 + nx * bend;
  const cy = (previous.y + y) / 2 + ny * bend;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const px = i === steps ? x : (1 - eased) ** 2 * previous.x + 2 * (1 - eased) * eased * cx + eased ** 2 * x;
    const py = i === steps ? y : (1 - eased) ** 2 * previous.y + 2 * (1 - eased) * eased * cy + eased ** 2 * y;
    await sendCDP(tabId, "Input.dispatchMouseEvent", {
      type: "mouseMoved", x: Math.round(px), y: Math.round(py),
      button: "none", buttons: 0, modifiers: 0
    });
    await sleep(random(8, 20));
  }
  lastMouse.set(tabId, { x, y });
}
async function clickAt(tabId, x, y) {
  await moveMouse(tabId, x, y);
  await sendCDP(tabId, "Input.dispatchMouseEvent", {
    type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1
  });
  await sleep(random(45, 100));
  await sendCDP(tabId, "Input.dispatchMouseEvent", {
    type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id ?? message.tabId;
  (async () => {
    switch (message?.type) {
      case "DEBUGGER_CLICK":
        if (!Number.isInteger(tabId)) throw new Error("No target tab ID.");
        await clickAt(tabId, Number(message.x), Number(message.y));
        return { ok: true };
      case "DEBUGGER_TYPE":
        if (!Number.isInteger(tabId)) throw new Error("No target tab ID.");
        await typeText(tabId, message.text);
        return { ok: true };
      case "DEBUGGER_KEY":
        if (!Number.isInteger(tabId)) throw new Error("No target tab ID.");
        await keyPress(tabId, message.key);
        return { ok: true };
      case "DEBUGGER_DETACH":
        if (!Number.isInteger(tabId)) throw new Error("No target tab ID.");
        if (attachedTabs.has(tabId)) {
          await chrome.debugger.detach({ tabId });
          attachedTabs.delete(tabId);
          lastMouse.delete(tabId);
        }
        return { ok: true, detached: true };
      case "REPLICA_LOG":
      case "REPLICA_GENERATION_STATUS":
        await chrome.storage.local.set({
          replicaLastEvent: {
            type: message.type,
            message: message.message || "",
            level: message.level || "info",
            state: message.state || "",
            elapsedMs: Number(message.elapsedMs) || 0,
            at: Date.now()
          }
        });
        return { ok: true };
      case "REPLICA_DIAGNOSTIC":
        await chrome.storage.local.set({
          replicaDiagnostic: message.report || {},
          replicaLastEvent: {
            type: "REPLICA_LOG",
            message: "Diagnostic report captured from the current Flow page.",
            level: "info",
            at: Date.now()
          }
        });
        return { ok: true };
      default:
        return undefined;
    }
  })().then(result => sendResponse(result)).catch(error => {
    sendResponse({ ok: false, error: String(error?.message || error) });
  });
  return true;
});
