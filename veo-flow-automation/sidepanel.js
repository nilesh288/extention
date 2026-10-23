const $ = id => document.getElementById(id);
const DEFAULTS = { mode:"textToVideo", model:"default", ratio:"current", outputs:"1", delay:"10", autoDownload:true, folder:"Flow Studio", filenamePrefix:"Shot_", numberFiles:true, pauseOnError:true, confirmStart:false };
let settings = { ...DEFAULTS };
let queue = [];
let activity = [];
let running = false;
let stopRequested = false;
let toastTimer;
const modeNames = { textToVideo:"Text to video", imageToVideo:"Image to video", textToImage:"Text to image", imageToImage:"Image to image" };
const modeShort = { textToVideo:"T2V", imageToVideo:"I2V", textToImage:"T2I", imageToImage:"I2I" };
function toast(message) { $("toast").textContent = message; $("toast").classList.add("show"); clearTimeout(toastTimer); toastTimer=setTimeout(()=>$("toast").classList.remove("show"),2800); }
function log(message, level="info") { activity.unshift({message,level,time:new Date().toISOString()}); activity=activity.slice(0,100); renderActivity(); chrome.storage.local.set({flowStudioActivity:activity}); }
function parsePrompts() { return $("prompts").value.split(/\n+/).map(s=>s.trim()).filter(Boolean); }
function updatePromptCount() { const n=parsePrompts().length; $("promptCount").textContent=n+" prompt"+(n===1?"":"s"); }
function showTab(name) { document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===name)); document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id==="view-"+name)); }
function setMode(mode) { settings.mode=mode; document.querySelectorAll(".mode-card").forEach(b=>b.classList.toggle("selected",b.dataset.mode===mode)); savePrefs(); }
function collectSettings() {
  settings = {...settings, model:$("model").value, ratio:$("ratio").value, outputs:$("outputs").value, delay:$("delay").value,
    autoDownload:$("autoDownload").checked, folder:$("folder").value.trim(), filenamePrefix:$("filenamePrefix").value.trim(),
    numberFiles:$("numberFiles").checked, pauseOnError:$("pauseOnError").checked, confirmStart:$("confirmStart").checked};
}
async function savePrefs() { collectSettings(); await chrome.storage.local.set({flowStudioSettings:settings}); }
function hydrate() {
  $("model").value=settings.model; $("ratio").value=settings.ratio; $("outputs").value=settings.outputs; $("delay").value=settings.delay;
  $("autoDownload").checked=settings.autoDownload; $("folder").value=settings.folder; $("filenamePrefix").value=settings.filenamePrefix;
  $("numberFiles").checked=settings.numberFiles; $("pauseOnError").checked=settings.pauseOnError; $("confirmStart").checked=settings.confirmStart;
  setMode(settings.mode || "textToVideo");
}
function renderQueue() {
  $("queueCount").textContent=queue.filter(q=>q.status==="pending").length;
  $("queueList").innerHTML="";
  $("queueEmpty").classList.toggle("hidden",queue.length>0);
  for (const [i,item] of queue.entries()) {
    const el=document.createElement("article"); el.className="queue-item";
    const top=document.createElement("div"); top.className="queue-top";
    const num=document.createElement("span"); num.className="queue-number"; num.textContent=String(i+1);
    const prompt=document.createElement("div"); prompt.className="queue-prompt"; prompt.textContent=item.prompt;
    const remove=document.createElement("button"); remove.className="remove-item"; remove.textContent="×"; remove.title="Remove prompt"; remove.disabled=running;
    remove.addEventListener("click",()=>{queue.splice(i,1); persistQueue(); renderQueue();});
    top.append(num,prompt,remove); el.append(top);
    const status=document.createElement("div"); status.className="queue-status "+(item.status==="completed"?"status-completed":item.status==="error"?"status-error":"");
    status.textContent=modeNames[item.mode]+" · "+(item.status||"pending")+(item.error?" — "+item.error:""); el.append(status); $("queueList").append(el);
  }
  $("runQueue").disabled=running||!queue.some(q=>q.status==="pending");
}
function renderActivity() {
  $("activityList").innerHTML=""; $("activityEmpty").classList.toggle("hidden",activity.length>0);
  activity.slice(0,60).forEach(item=>{const row=document.createElement("div");row.className="activity-item";const sym=document.createElement("div");sym.className="activity-symbol";sym.textContent=item.level==="error"?"!":item.level==="success"?"✓":"·";const body=document.createElement("div");body.className="activity-body";const p=document.createElement("p");p.textContent=item.message;const time=document.createElement("time");time.textContent=new Date(item.time).toLocaleString();body.append(p,time);row.append(sym,body);$("activityList").append(row);});
}
async function persistQueue() { await chrome.storage.local.set({flowStudioQueue:queue}); }
async function addPrompts() {
  const prompts=parsePrompts(); if(!prompts.length){toast("Add at least one prompt first.");return;}
  const mode=settings.mode||"textToVideo";
  queue.push(...prompts.map(prompt=>({id:crypto.randomUUID(),prompt,mode,ratio:settings.ratio,outputs:Number(settings.outputs)||1,status:"pending"})));
  await persistQueue(); renderQueue(); log("Added "+prompts.length+" prompt(s) to the queue."); toast("Added "+prompts.length+" prompt(s) to queue."); showTab("queue");
}

// Query all tabs and parse their URLs ourselves. This is more tolerant of Flow's
// changing URL paths and avoids relying on a restrictive tabs.query URL filter.
function isGoogleFlowTab(tab) {
  try {
    const url = new URL(tab.url || "");
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    return host === "flow.google" ||
      host.endsWith(".flow.google") ||
      ((host === "labs.google" || host === "labs.google.com" || host.endsWith(".labs.google.com")) &&
        (path.includes("/fx/tools/flow") || path === "/" || path.includes("flow")));
  } catch { return false; }
}
async function getFlowTab() {
  const tabs = await chrome.tabs.query({});
  const matches = tabs.filter(isGoogleFlowTab);
  if (!matches.length) return null;
  const activeCurrentWindow = matches.find(t => t.active && t.windowId != null);
  return activeCurrentWindow || matches.find(t => t.active) || matches[0];
}
async function runBatch() {
  if(running)return;
  const pending=queue.filter(q=>q.status==="pending");
  if(!pending.length){toast("There are no pending prompts.");return;}
  if(settings.confirmStart&&!confirm("Run "+pending.length+" queued prompt(s) in Google Flow?"))return;
  let tab;
  try { tab = await getFlowTab(); }
  catch(error) { toast("Could not inspect browser tabs: "+String(error.message||error)); return; }
  if(!tab){toast("Google Flow tab not found. Check the Flow tab URL, then click Refresh status.");log("Cannot start: Google Flow tab not found. No open tab matched a supported Flow URL.", "error");return;}
  running=true;stopRequested=false; $("runState").textContent="Running";$("runState").classList.add("running");$("startRun").disabled=true;$("addQueue").disabled=true;$("stopRun").classList.remove("hidden");renderQueue();
  log("Batch started: "+pending.length+" prompt(s). Target tab: "+(tab.url||"Google Flow"));
  try {
    for(const item of pending) {
      if(stopRequested)break;
      item.status="running";renderQueue();await persistQueue();
      try {
        const response=await chrome.tabs.sendMessage(tab.id,{type:"FLOW_STUDIO_RUN_PROMPT",payload:{prompt:item.prompt,mode:item.mode,aspectRatio:item.ratio,outputs:item.outputs}});
        if(!response?.ok)throw new Error(response?.error||"Google Flow did not confirm submission.");
        item.status="completed";log("Submitted: "+item.prompt.slice(0,100),"success");
        const delay=Math.max(0,Number(settings.delay)||0)*1000;
        if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
      } catch(error) {
        item.status="error";item.error=String(error.message||error);log("Prompt failed: "+item.error,"error");
        if(settings.pauseOnError) {toast("Batch paused: "+item.error);await persistQueue();break;}
      }
      renderQueue();await persistQueue();
    }
  } finally {
    running=false;$("runState").textContent=stopRequested?"Stopped":"Ready";$("runState").classList.remove("running");$("startRun").disabled=false;$("addQueue").disabled=false;$("stopRun").classList.add("hidden");renderQueue();await persistQueue();
    log(stopRequested?"Batch stopped by user.":"Batch run finished.");
  }
}
async function refreshConnection() {
  const tab=await getFlowTab();const ok=!!tab;
  $("connectionDot").classList.toggle("ok",ok);$("connectionDot").classList.toggle("bad",!ok);
  $("connectionText").textContent=ok?"Google Flow tab detected":"Open Google Flow tab to connect";
}
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>showTab(b.dataset.tab)));
document.querySelectorAll(".mode-card").forEach(b=>b.addEventListener("click",()=>setMode(b.dataset.mode)));
$("prompts").addEventListener("input",updatePromptCount);$("clearPrompts").addEventListener("click",()=>{$("prompts").value="";updatePromptCount();});
$("addQueue").addEventListener("click",addPrompts);$("startRun").addEventListener("click",async()=>{if(parsePrompts().length)await addPrompts();await runBatch();});
$("runQueue").addEventListener("click",runBatch);$("stopRun").addEventListener("click",()=>{stopRequested=true;toast("Stopping after the current action…");});
$("clearQueue").addEventListener("click",async()=>{if(running){toast("Stop the batch before clearing the queue.");return;}queue=[];await persistQueue();renderQueue();});
$("clearActivity").addEventListener("click",async()=>{activity=[];await chrome.storage.local.set({flowStudioActivity:activity});renderActivity();});
$("refreshStatus").addEventListener("click",refreshConnection);
$("openFlow").addEventListener("click",async()=>{const tab=await getFlowTab();if(tab?.id){await chrome.tabs.update(tab.id,{active:true});if(tab.windowId)await chrome.windows.update(tab.windowId,{focused:true});}else await chrome.tabs.create({url:"https://labs.google/fx/tools/flow"});});
$("saveSettings").addEventListener("click",async()=>{await savePrefs();toast("Preferences saved.");log("Preferences saved.");});
["model","ratio","outputs","delay","autoDownload","folder","filenamePrefix","numberFiles","pauseOnError","confirmStart"].forEach(id=>$(id).addEventListener("change",savePrefs));
(async()=>{const data=await chrome.storage.local.get(["flowStudioSettings","flowStudioQueue","flowStudioActivity"]);settings={...DEFAULTS,...(data.flowStudioSettings||{})};queue=Array.isArray(data.flowStudioQueue)?data.flowStudioQueue:[];activity=Array.isArray(data.flowStudioActivity)?data.flowStudioActivity:[];hydrate();renderQueue();renderActivity();updatePromptCount();refreshConnection();setInterval(refreshConnection,15000);})();