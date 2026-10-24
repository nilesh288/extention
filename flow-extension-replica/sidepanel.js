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

async function sendToFlowContent(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    const messageText = String(error?.message || error);
    if (!/receiving end does not exist|could not establish connection/i.test(messageText)) throw error;
    log("Content script not connected; injecting it into the selected Flow tab and retrying.");
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    await new Promise(resolve => setTimeout(resolve, 250));
    return await chrome.tabs.sendMessage(tabId, message);
  }
}
async function runOne() {
  if (busy) return;
  const prompt = $("prompt").value.trim();
  if (!prompt) { setState("Blocked", "Enter a prompt first."); return; }
  const tab = await getFlowTab();
  if (!tab?.id) { setState("Blocked", "Google Flow tab was not found."); await refreshConnection(); return; }
  busy = true;
  $("run").disabled = true;
  setState("Checking", "Detecting the prompt editor and submit control locally.");
  log("Starting one-prompt test.");
  try {
    const response = await sendToFlowContent(tab.id, { type: "REPLICA_RUN_PROMPT", payload: { prompt } });
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
async function diagnoseFlow() {
  const tab = await getFlowTab();
  if (!tab?.id) { setState("No tab", "Open Google Flow first."); return; }
  try {
    setState("Diagnosing", "Inspecting visible local UI controls.");
    const response = await sendToFlowContent(tab.id, { type: "REPLICA_DIAGNOSE_FLOW" });
    if (!response?.ok) throw new Error(response?.error || "Diagnostic request failed.");
    displayDiagnostic(response.report);
    log("Diagnostic captured: " + response.report.editors.length + " editors, " + response.report.buttons.length + " buttons.");
    setState("Diagnostic ready", "Copy the report and paste it into this chat if detection still fails.");
  } catch (error) {
    const message = String(error?.message || error);
    setState("Diagnostic failed", message);
    log(message, "error");
  }
}
function displayDiagnostic(report) {
  if (!report) return;
  $("diagnostic").value = JSON.stringify(report, null, 2);
  $("diagnosticSummary").textContent = report.title + " — " + report.editors.length + " visible editors, " + report.buttons.length + " visible buttons, " + report.hints.length + " status hints.";
}
async function copyDiagnostic() {
  const value = $("diagnostic").value;
  if (!value) { setState("No report", "Run Diagnose Flow UI first."); return; }
  try {
    await navigator.clipboard.writeText(value);
    log("Diagnostic report copied to clipboard.", "success");
  } catch {
    $("diagnostic").focus();
    $("diagnostic").select();
    setState("Copy manually", "The report is selected; copy it with Ctrl+C.");
  }
}
$("diagnose").addEventListener("click", diagnoseFlow);
$("copyDiagnostic").addEventListener("click", copyDiagnostic);
$("run").addEventListener("click", runOne);
$("detach").addEventListener("click", detachDebugger);
function handleEvent(event) {
  if (!event) return;
  if (event.type === "REPLICA_GENERATION_STATUS") {
    const state = event.state || "Unknown";
    const detail = state === "generating" ? "Google Flow generation activity was detected."
      : state === "submitted" ? "Submitted; waiting for generation evidence."
      : state === "completed" ? "Generation appears to have completed and a new resource was detected."
      : state === "timeout" ? "Generation could not be verified before timeout."
      : state;
    setState(state, detail);
  } else if (event.type === "REPLICA_LOG") {
    log(event.message || "Extension event", event.level || "info");
  }
}
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.replicaLastEvent) handleEvent(changes.replicaLastEvent.newValue);
});
chrome.storage.local.get(["replicaLastEvent", "replicaDiagnostic"]).then(data => {
  handleEvent(data.replicaLastEvent);
  if (data.replicaDiagnostic) displayDiagnostic(data.replicaDiagnostic);
});
refreshConnection();
setInterval(refreshConnection, 12000);