const FLOW_MATCHES = ["https://flow.google/*", "https://labs.google/*"];
async function configurePanel() {
  if (!chrome.sidePanel) return;
  try {
    await chrome.sidePanel.setOptions({ path: "sidepanel.html", enabled: true });
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (error) { console.warn("Could not configure side panel", error); }
}
chrome.runtime.onInstalled.addListener(configurePanel);
chrome.runtime.onStartup.addListener(configurePanel);
configurePanel();
chrome.action.onClicked.addListener(async (tab) => {
  if (tab?.id && chrome.sidePanel) {
    try { await chrome.sidePanel.open({ tabId: tab.id }); } catch (_) {}
  }
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "FLOW_DOWNLOAD" && typeof message.url === "string") {
    (async () => {
      try {
        const safeName = String(message.filename || "flow-output").replace(/[\\/:*?"<>|]/g, "_");
        const folder = String(message.folder || "").replace(/^[/\\]+|[/\\]+$/g, "");
        const filename = [folder, safeName].filter(Boolean).join("/");
        const id = await chrome.downloads.download({ url: message.url, filename, conflictAction: "uniquify", saveAs: false });
        sendResponse({ ok: true, id });
      } catch (error) { sendResponse({ ok: false, error: String(error?.message || error) }); }
    })();
    return true;
  }
  if (message?.type === "GET_ACTIVE_FLOW_TAB") {
    chrome.tabs.query({ url: FLOW_MATCHES }).then(tabs => sendResponse({ tab: tabs.find(t => t.active) || tabs[0] || null }));
    return true;
  }
  return false;
});