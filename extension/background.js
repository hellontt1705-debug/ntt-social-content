// SocialContent OS - Extension Background Service Worker (Manifest V3)
const API_BASE = "http://127.0.0.1:8000/api";
const WS_URL = "ws://127.0.0.1:8000/ws/progress";

let ws = null;
let reconnectTimer = null;
let isConnected = false;

// Connect to WebSocket for Real-time Progress
function connectWebSocket() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }
  try {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      isConnected = true;
      console.log("[SocialContent Ext] WebSocket Connected to Backend!");
      clearTimeout(reconnectTimer);
      broadcastToTabs({ type: "WS_STATUS", connected: true });
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // Forward progress / completed / error to all active tabs
        broadcastToTabs({ type: "WS_EVENT", payload: data });

        // If completed, save into local history
        if (data.type === "task_completed" && data.video) {
          saveToHistory(data.video);
        }
      } catch (err) {
        console.error("[SocialContent Ext] WS message parse error:", err);
      }
    };

    ws.onclose = () => {
      isConnected = false;
      ws = null;
      broadcastToTabs({ type: "WS_STATUS", connected: false });
      scheduleReconnect();
    };

    ws.onerror = () => {
      isConnected = false;
      try { ws.close(); } catch(e) {}
    };
  } catch (err) {
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    connectWebSocket();
  }, 4000);
}

// Broadcast message to all tabs running content script
function broadcastToTabs(message) {
  chrome.tabs.query({}, (tabs) => {
    if (!tabs || !tabs.length) return;
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, message).catch(() => {
          // Tab might not have content script loaded or is system tab, ignore
        });
      }
    }
  });
}

// Save downloaded item into recent history (Limit 20 items like in Image 4)
async function saveToHistory(video) {
  try {
    const res = await chrome.storage.local.get(["sc_history"]);
    let history = res.sc_history || [];
    
    // Check duplicate
    history = history.filter(item => item.id !== video.id && item.url !== video.source_url);
    
    // Determine platform
    let platform = "web";
    const src = video.source_url || "";
    if (src.includes("tiktok.com")) platform = "tiktok";
    else if (src.includes("x.com") || src.includes("twitter.com")) platform = "x";
    else if (src.includes("douyin.com")) platform = "douyin";
    else if (src.includes("youtube.com") || src.includes("youtu.be")) platform = "youtube";
    else if (src.includes("facebook.com") || src.includes("fb.watch")) platform = "facebook";
    else if (src.includes("instagram.com")) platform = "instagram";

    let thumb = video.local_thumbnail 
      ? `http://127.0.0.1:8000/media/downloads/${video.local_thumbnail}`
      : (video.thumbnail_url || "");

    const newItem = {
      id: video.id || String(Date.now()),
      title: video.title || "Video mới tải về",
      url: video.source_url || "",
      platform: platform,
      thumbnail: thumb,
      savedAt: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
      category: video.category_id || "all"
    };

    history.unshift(newItem);
    if (history.length > 20) history = history.slice(0, 20);

    await chrome.storage.local.set({ sc_history: history });
    broadcastToTabs({ type: "HISTORY_UPDATED", history });
  } catch (e) {
    console.error("Save history error:", e);
  }
}

// Initial WS connection
connectWebSocket();

// Message listener from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "CHECK_BACKEND") {
    fetch(`${API_BASE}/categories`)
      .then(res => res.json())
      .then(data => {
        connectWebSocket();
        sendResponse({ success: true, connected: true, categories: data });
      })
      .catch(err => {
        sendResponse({ success: false, connected: false, error: err.message });
      });
    return true; // Keep channel open for async response
  }

  if (request.action === "GET_CATEGORIES") {
    fetch(`${API_BASE}/categories`)
      .then(res => res.json())
      .then(data => sendResponse({ success: true, categories: data }))
      .catch(err => sendResponse({ success: false, error: err.message, categories: [] }));
    return true;
  }

  if (request.action === "START_DOWNLOAD") {
    const payload = {
      url: request.url,
      category_id: request.category_id || "all",
      sync_to_drive: request.sync_to_drive !== false,
      is_private: request.is_private === true
    };

    fetch(`${API_BASE}/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(res => res.json())
      .then(data => {
        connectWebSocket();
        sendResponse({ success: true, data });
      })
      .catch(err => {
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }

  if (request.action === "GET_HISTORY") {
    chrome.storage.local.get(["sc_history"], (res) => {
      sendResponse({ success: true, history: res.sc_history || [] });
    });
    return true;
  }

  if (request.action === "CLEAR_HISTORY") {
    chrome.storage.local.set({ sc_history: [] }, () => {
      sendResponse({ success: true });
      broadcastToTabs({ type: "HISTORY_UPDATED", history: [] });
    });
    return true;
  }
});
