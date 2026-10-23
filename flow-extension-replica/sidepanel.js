const $ = id => document.getElementById(id);
let busy = false;
const activity = [];
function log(message, level = "info") {
  activity.unshift({ message, level, at: new Date().toLocaleTimeString() });
  activity.splice(40);
  $("activity").replaceChildren();
  for (const item of activity) {
    const li = document.createElement("li");
    li.className = item.level;
    li.textContent = item.at + " — " + item.message;
    $("activity").append(li);
  }
}
function setState(state, detail) {
  $("state").textContent = state;
  $("detail").textContent = detail || "";
}
function isFlowTab(tab) {
  try { return new URL(tab.url || "").hostname === "flow.google.com"; } catch { return false; }
}
async function getFlowTab() {
  const tabs = await chrome.tabs.query({});
  return tabs.find(tab => tab.active && isFlowTab(tab)) || tabs.find(isFlowTab) || null;
}
async function refreshConnection() {
  const tab = await getFlowTab();
  $("dot").classList.toggle("ok", !!tab);
  $("dot").classList.toggle("bad", !tab);
  $("connection").textContent = tab ? "Google Flow tab detected" : "Open flow.google.com in a tab";
}
async function runOne() {
  if (busy) return;
  const prompt = $("prompt").value.trim();
  if (!prompt) { setState("Blocked", "Enter a prompt first."); return; }
  const tab = await getFlowTab();
  if (!tab?.id) { setState("Blocked", "Google Flow tab was not found."); await refreshConnection(); return; }
  busy = true;
  $("run").disabled = true;
  setState("Checking", "Loading the reference selector configuration.");
  log("Starting one-prompt test.");
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "REPLICA_RUN_PROMPT", payload: { prompt } });
    if (!response?.ok) {
      setState(response?.submitted ? "Unverified" : "Failed", response?.error || "Generation completion was not confirmed.");
      log(response?.error || "Generation completion was not confirmed.", "error");
      return;
    }
    setState("Completed", "Generation evidence was observed. Newly detected media URLs: " + response.newResources.length);
    log("Generation completed according to the current evidence checks.", "success");
    if (response.newResources.length) log("New resource URLs detected: " + response.newResources.join(" | "));
  } catch (error) {
    const message = String(error?.message || error);
    setState("Failed", message);
    log(message, "error");
  } finally {
    busy = false;
    $("run").disabled = false;
  }
}
async function detachDebugger() {
  const tab = await getFlowTab();
  if (!tab?.id) { setState("No tab", "No Google Flow tab is available to detach."); return; }
  try {
    const result = await chrome.runtime.sendMessage({ type: "DEBUGGER_DETACH", tabId: tab.id });
    if (!result?.ok) throw new Error(result?.error || "Detach failed.");
    setState("Detached", "Debugger detached from the selected Flow tab.");
    log("Debugger detached.");
  } catch (error) {
    setState("Detach failed", String(error?.message || error));
    log(String(error?.message || error), "error");
  }
}
$("run").addEventListener("click", runOne);
$("detach").addEventListener("click", detachDebugger);
chrome.runtime.onMessage.addListener(message => {
  if (message?.type === "REPLICA_GENERATION_STATUS") {
    const state = message.state || "Unknown";
    const detail = state === "generating" ? "Google Flow generation activity was detected."
      : state === "submitted" ? "Submitted; waiting for generation evidence."
      : state === "completed" ? "Generation appears to have completed and a new resource was detected."
      : state === "timeout" ? "Generation could not be verified before timeout."
      : state;
    setState(state, detail);
  } else if (message?.type === "REPLICA_LOG") {
    log(message.message || "Extension event", message.level || "info");
  }
});
refreshConnection();
setInterval(refreshConnection, 12000);