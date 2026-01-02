console.log("[IG Non-Followers] Content script loaded");

// ==================== Message Listener ====================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[IG Non-Followers Content] Received:", message.type);

  if (message.type === "START_SCAN") {
    startScan();
    sendResponse({ success: true, message: "Scan started in background" });
    return false; // Synchronous response
  }

  if (message.type === "UNFOLLOW_USERS") {
    unfollowUsers(
      message.usernames,
      message.safeModeEnabled,
      message.simulate || false,
      sendResponse
    );
    return true; // Async response
  }

  if (message.type === "GET_USER_ID") {
    getUserId(sendResponse);
    return true;
  }

  if (message.type === "GET_USER_PREVIEW") {
    getUserPreview(message.username, sendResponse);
    return true;
  }
});

// ==================== Start Scan (Inject pageScript.js) ====================
function startScan() {
  console.log("[IG Non-Followers Content] Starting scan");

  // Validation
  if (!window.location.href.includes("instagram.com")) {
    chrome.runtime.sendMessage({
      type: "SCAN_ERROR",
      error: "Not on Instagram",
    });
    return;
  }

  const isLoggedIn =
    document.cookie.includes("sessionid") ||
    document.cookie.includes("ds_user_id");

  if (!isLoggedIn) {
    chrome.runtime.sendMessage({
      type: "SCAN_ERROR",
      error: "Not logged in to Instagram",
    });
    return;
  }

  // Notify background: scan starting
  chrome.runtime.sendMessage({ type: "SCAN_STARTED" });

  // Remove old script if exists
  const existingScript = document.querySelector('script[src*="pageScript.js"]');
  if (existingScript) {
    existingScript.remove();
  }

  // Set up event listeners for page script events
  setupPageScriptListeners();

  // Inject pageScript.js
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("pageScript.js");
  script.onload = function () {
    console.log("[IG Non-Followers Content] Page script injected");
    this.remove();
  };
  script.onerror = function () {
    console.error("[IG Non-Followers Content] Failed to inject page script");
    chrome.runtime.sendMessage({
      type: "SCAN_ERROR",
      error: "Failed to load scanner",
    });
  };
  (document.head || document.documentElement).appendChild(script);
}

// ==================== Page Script Event Listeners ====================
function setupPageScriptListeners() {
  // Progress updates
  window.addEventListener("IG_SCAN_PROGRESS", (e) => {
    console.log("[IG Non-Followers Content] Progress:", e.detail.percent + "%");
    chrome.runtime.sendMessage({
      type: "SCAN_PROGRESS",
      message: e.detail.message,
      percent: e.detail.percent,
    });
  });

  // Scan completed
  window.addEventListener(
    "IG_NON_FOLLOWERS_COMPLETE",
    (e) => {
      console.log(
        "[IG Non-Followers Content] Scan complete:",
        e.detail.nonFollowers.length,
        "non-followers"
      );
      chrome.runtime.sendMessage({
        type: "SCAN_COMPLETE",
        data: {
          followers: e.detail.followers,
          following: e.detail.following,
          nonFollowers: e.detail.nonFollowers,
        },
      });
    },
    { once: true }
  );

  // Scan error
  window.addEventListener(
    "IG_NON_FOLLOWERS_ERROR",
    (e) => {
      console.error("[IG Non-Followers Content] Scan error:", e.detail.error);
      chrome.runtime.sendMessage({
        type: "SCAN_ERROR",
        error: e.detail.error,
      });
    },
    { once: true }
  );
}

// ==================== Unfollow Users ====================
async function unfollowUsers(
  usernames,
  safeModeEnabled,
  simulate,
  sendResponse
) {
  console.log(
    `[IG Non-Followers Content] Unfollowing ${usernames.length} users`
  );

  try {
    // Remove old unfollow script
    const existingScript = document.querySelector(
      'script[src*="unfollowScript.js"]'
    );
    if (existingScript) {
      existingScript.remove();
    }

    // Set up unfollow listeners
    const unfollowPromise = new Promise((resolve) => {
      window.addEventListener(
        "UNFOLLOW_COMPLETE",
        (e) => {
          console.log("[IG Non-Followers Content] Unfollow complete");
          resolve({
            success: true,
            unfollowedCount: e.detail.unfollowedCount,
            failed: e.detail.failed,
            rateLimited: e.detail.rateLimited,
          });
        },
        { once: true }
      );

      window.addEventListener(
        "UNFOLLOW_ERROR",
        (e) => {
          console.error("[IG Non-Followers Content] Unfollow error");
          resolve({
            success: false,
            error: e.detail.error,
            rateLimited: false,
          });
        },
        { once: true }
      );
    });

    // Inject unfollowScript.js
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("unfollowScript.js");
    script.onload = function () {
      console.log("[IG Non-Followers Content] Unfollow script loaded");

      // Trigger unfollow
      window.dispatchEvent(
        new CustomEvent("START_UNFOLLOW", {
          detail: {
            usernames,
            safeModeEnabled,
            simulate,
          },
        })
      );

      this.remove();
    };
    script.onerror = function () {
      console.error(
        "[IG Non-Followers Content] Failed to load unfollow script"
      );
      sendResponse({
        success: false,
        error: "Failed to load unfollow script",
      });
    };
    (document.head || document.documentElement).appendChild(script);

    const result = await unfollowPromise;
    sendResponse(result);
  } catch (error) {
    console.error("[IG Non-Followers Content] Unfollow error:", error);
    sendResponse({ success: false, error: error.message });
  }
}

// ==================== Get User ID ====================
async function getUserId(sendResponse) {
  try {
    // Remove old preview script
    const existingScript = document.querySelector(
      'script[src*="previewScript.js"]'
    );
    if (existingScript) {
      existingScript.remove();
    }

    const userIdPromise = new Promise((resolve) => {
      window.addEventListener(
        "CURRENT_USER_ID_RESPONSE",
        (e) => {
          resolve({
            userId: e.detail.userId,
            username: e.detail.username,
          });
        },
        { once: true }
      );

      setTimeout(() => {
        resolve({ userId: null, username: null });
      }, 5000);
    });

    // Inject previewScript.js
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("previewScript.js");
    script.onload = function () {
      window.dispatchEvent(new CustomEvent("GET_CURRENT_USER_ID"));
      this.remove();
    };
    (document.head || document.documentElement).appendChild(script);

    const result = await userIdPromise;
    sendResponse(result);
  } catch (error) {
    console.error("[IG Non-Followers Content] Get user ID error:", error);
    sendResponse({ userId: null, username: null });
  }
}

// ==================== Get User Preview ====================
async function getUserPreview(username, sendResponse) {
  try {
    // First, ensure the preview script is loaded
    const scriptExists = document.querySelector(
      'script[src*="previewScript.js"]'
    );

    if (!scriptExists) {
      const script = document.createElement("script");
      script.src = chrome.runtime.getURL("previewScript.js");
      (document.head || document.documentElement).appendChild(script);

      // Wait for script to load
      await new Promise((resolve) => {
        script.onload = resolve;
        script.onerror = () => resolve(); // Continue even if error
        setTimeout(resolve, 2000); // Timeout after 2 seconds
      });
    }

    const previewPromise = new Promise((resolve) => {
      // Set up response listener
      const listener = (e) => {
        console.log(
          "[IG Non-Followers Content] Preview response received:",
          e.detail
        );
        if (e.detail.username === username) {
          window.removeEventListener("USER_PREVIEW_RESPONSE", listener);
          if (e.detail.success) {
            resolve({
              success: true,
              data: e.detail.data,
            });
          } else {
            resolve({
              success: false,
              error: e.detail.error || "Failed to load preview",
            });
          }
        }
      };

      window.addEventListener("USER_PREVIEW_RESPONSE", listener);

      // Timeout after 8 seconds
      setTimeout(() => {
        window.removeEventListener("USER_PREVIEW_RESPONSE", listener);
        resolve({ success: false, error: "Timeout" });
      }, 8000);

      // Request preview
      console.log(
        "[IG Non-Followers Content] Requesting preview for:",
        username
      );
      window.dispatchEvent(
        new CustomEvent("GET_USER_PREVIEW", {
          detail: { username },
        })
      );
    });

    const result = await previewPromise;
    console.log("[IG Non-Followers Content] Preview result:", result);
    sendResponse(result);
  } catch (error) {
    console.error("[IG Non-Followers Content] Preview error:", error);
    sendResponse({ success: false, error: error.message });
  }
}

console.log("[IG Non-Followers Content] Ready");
