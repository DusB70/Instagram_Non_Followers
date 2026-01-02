console.log(
  "[IG Non-Followers Background] Service worker started - Scan Manager Active"
);

// ==================== Message Listener ====================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[IG Non-Followers Background] Received:", message.type);

  // Image fetching (CORS bypass)
  if (message.type === "FETCH_IMAGE") {
    fetchImageAsDataUrl(message.url)
      .then((dataUrl) => sendResponse({ dataUrl }))
      .catch((error) => {
        console.error(
          "[IG Non-Followers Background] Image fetch error:",
          error
        );
        sendResponse({ dataUrl: null });
      });
    return true; // Async
  }

  // Scan lifecycle management
  if (message.type === "SCAN_STARTED") {
    handleScanStarted();
    return false;
  }

  if (message.type === "SCAN_PROGRESS") {
    handleScanProgress(message);
    return false;
  }

  if (message.type === "SCAN_COMPLETE") {
    handleScanComplete(message);
    return false;
  }

  if (message.type === "SCAN_ERROR") {
    handleScanError(message);
    return false;
  }

  // Get current scan status (for popup on load)
  if (message.type === "GET_SCAN_STATUS") {
    getScanStatus(sendResponse);
    return true; // Async
  }
});

// ==================== Scan Started ====================
function handleScanStarted() {
  console.log("[IG Non-Followers Background] 🚀 Scan STARTED");

  chrome.storage.local.set({
    scanInProgress: true,
    scanProgress: { message: "Initializing...", percent: 0 },
    scanData: null,
    scanError: null,
  });

  // Broadcast to all popups
  broadcastToPopups({
    type: "SCAN_STARTED",
  });
}

// ==================== Scan Progress ====================
function handleScanProgress(message) {
  console.log(
    `[IG Non-Followers Background] 📊 Progress: ${message.percent}% - ${message.message}`
  );

  chrome.storage.local.set({
    scanProgress: {
      message: message.message,
      percent: message.percent,
    },
  });

  // Broadcast progress to all popups
  broadcastToPopups({
    type: "SCAN_PROGRESS_UPDATE",
    message: message.message,
    percent: message.percent,
  });
}

// ==================== Scan Complete ====================
function handleScanComplete(message) {
  console.log(
    `[IG Non-Followers Background] ✅ Scan COMPLETE - ${message.data.nonFollowers.length} non-followers`
  );

  const scanData = {
    followers: message.data.followers,
    following: message.data.following,
    nonFollowers: message.data.nonFollowers,
  };

  chrome.storage.local.set({
    scanInProgress: false,
    scanProgress: null,
    scanData: scanData,
    lastScan: Date.now(),
    scanError: null,
  });

  // Broadcast completion to all popups
  broadcastToPopups({
    type: "SCAN_COMPLETED",
    data: scanData,
  });
}

// ==================== Scan Error ====================
function handleScanError(message) {
  console.error("[IG Non-Followers Background] ❌ Scan ERROR:", message.error);

  chrome.storage.local.set({
    scanInProgress: false,
    scanProgress: null,
    scanError: message.error,
  });

  // Broadcast error to all popups
  broadcastToPopups({
    type: "SCAN_ERROR",
    error: message.error,
  });
}

// ==================== Get Scan Status ====================
function getScanStatus(sendResponse) {
  chrome.storage.local.get(
    ["scanInProgress", "scanProgress", "scanData", "lastScan", "scanError"],
    (result) => {
      sendResponse({
        scanInProgress: result.scanInProgress || false,
        scanProgress: result.scanProgress || null,
        scanData: result.scanData || null,
        lastScan: result.lastScan || null,
        scanError: result.scanError || null,
      });
    }
  );
}

// ==================== Broadcast to All Popups ====================
function broadcastToPopups(message) {
  chrome.runtime.sendMessage(message).catch(() => {
    // Popup might be closed, that's okay
    console.log("[IG Non-Followers Background] No popup to receive broadcast");
  });
}

// ==================== Image Fetching (CORS Bypass) ====================
async function fetchImageAsDataUrl(url) {
  try {
    const response = await fetch(url, {
      headers: {
        Referer: "https://www.instagram.com/",
        Origin: "https://www.instagram.com",
      },
      mode: "cors",
      credentials: "omit",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const blob = await response.blob();

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("[IG Non-Followers Background] Fetch error:", error);
    throw error;
  }
}

// ==================== Cleanup on Extension Update ====================
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "update") {
    console.log(
      "[IG Non-Followers Background] Extension updated - Clearing scan state"
    );
    chrome.storage.local.set({
      scanInProgress: false,
      scanProgress: null,
    });
  }
});

console.log("[IG Non-Followers Background] Ready - Monitoring scan lifecycle");
