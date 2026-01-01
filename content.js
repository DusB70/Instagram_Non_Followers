console.log("[IG Non-Followers] Content script loaded");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[IG Non-Followers] Received message:", message);

  if (message.type === "START_SCAN") {
    startScan(sendResponse);
    return true;
  } else if (message.type === "UNFOLLOW_USERS") {
    unfollowUsers(
      message.usernames,
      message.safeModeEnabled,
      message.simulate || false,
      sendResponse
    );
    return true;
  } else if (message.type === "GET_USER_ID") {
    getUserId(sendResponse);
    return true;
  } else if (message.type === "GET_USER_PREVIEW") {
    getUserPreview(message.username, sendResponse);
    return true;
  }
});

async function startScan(sendResponse) {
  try {
    if (!window.location.href.includes("instagram.com")) {
      sendResponse({ success: false, error: "Not on Instagram" });
      return;
    }

    const isLoggedIn =
      document.cookie.includes("sessionid") ||
      document.cookie.includes("ds_user_id");

    if (!isLoggedIn) {
      sendResponse({ success: false, error: "Not logged in" });
      return;
    }

    const existingScript = document.querySelector(
      'script[src*="pageScript.js"]'
    );
    if (existingScript) existingScript.remove();

    const scanPromise = new Promise((resolve) => {
      let timeoutId;

      window.addEventListener(
        "IG_NON_FOLLOWERS_COMPLETE",
        function onComplete(e) {
          console.log("[IG Non-Followers] Scan complete:", e.detail);
          clearTimeout(timeoutId);
          window.removeEventListener("IG_NON_FOLLOWERS_COMPLETE", onComplete);
          resolve({ success: true, ...e.detail });
        },
        { once: true }
      );

      window.addEventListener(
        "IG_NON_FOLLOWERS_ERROR",
        function onError(e) {
          console.error("[IG Non-Followers] Scan error:", e.detail);
          clearTimeout(timeoutId);
          window.removeEventListener("IG_NON_FOLLOWERS_ERROR", onError);
          resolve({ success: false, error: e.detail.error });
        },
        { once: true }
      );

      timeoutId = setTimeout(() => {
        resolve({ success: false, error: "Scan timeout" });
      }, 120000);
    });

    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("pageScript.js");
    script.onload = function () {
      console.log("[IG Non-Followers] Page script loaded");
      this.remove();
    };
    script.onerror = function () {
      console.error("[IG Non-Followers] Failed to load page script");
      sendResponse({ success: false, error: "Failed to load scanner" });
    };
    (document.head || document.documentElement).appendChild(script);

    window.addEventListener("IG_SCAN_PROGRESS", (e) => {
      chrome.runtime.sendMessage({
        type: "SCAN_PROGRESS",
        message: e.detail.message,
        percent: e.detail.percent,
      });
    });

    const result = await scanPromise;
    sendResponse(result);
  } catch (error) {
    console.error("[IG Non-Followers] Error:", error);
    sendResponse({ success: false, error: error.message });
  }
}

async function unfollowUsers(
  usernames,
  safeModeEnabled,
  simulate,
  sendResponse
) {
  try {
    // Remove existing script if present
    const existingScript = document.querySelector(
      'script[src*="unfollowScript.js"]'
    );
    if (existingScript) existingScript.remove();

    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("unfollowScript.js");

    script.onload = function () {
      console.log("[IG Non-Followers] Unfollow script loaded");
      this.remove();

      window.dispatchEvent(
        new CustomEvent("START_UNFOLLOW", {
          detail: { usernames, safeModeEnabled, simulate },
        })
      );
    };

    (document.head || document.documentElement).appendChild(script);

    window.addEventListener(
      "UNFOLLOW_COMPLETE",
      function onComplete(e) {
        window.removeEventListener("UNFOLLOW_COMPLETE", onComplete);
        sendResponse({
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
      function onError(e) {
        window.removeEventListener("UNFOLLOW_ERROR", onError);
        sendResponse({
          success: false,
          error: e.detail.error,
          rateLimited: false,
        });
      },
      { once: true }
    );

    // Listen for progress updates
    window.addEventListener("UNFOLLOW_PROGRESS", function onProgress(e) {
      chrome.runtime.sendMessage({
        type: "UNFOLLOW_PROGRESS",
        current: e.detail.current,
        total: e.detail.total,
        username: e.detail.username,
      });
    });
  } catch (error) {
    console.error("[IG Non-Followers] Unfollow error:", error);
    sendResponse({ success: false, error: error.message, rateLimited: false });
  }
}

async function getUserId(sendResponse) {
  try {
    // Remove existing script
    const existingScript = document.querySelector(
      'script[src*="previewScript.js"]'
    );
    if (existingScript) existingScript.remove();

    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("previewScript.js");

    script.onload = function () {
      this.remove();

      window.dispatchEvent(new CustomEvent("GET_CURRENT_USER_ID"));
    };

    (document.head || document.documentElement).appendChild(script);

    window.addEventListener(
      "CURRENT_USER_ID_RESPONSE",
      function onResponse(e) {
        window.removeEventListener("CURRENT_USER_ID_RESPONSE", onResponse);
        sendResponse({
          userId: e.detail.userId,
          username: e.detail.username,
        });
      },
      { once: true }
    );
  } catch (error) {
    console.error("[IG Non-Followers] Get user ID error:", error);
    sendResponse({ userId: null, username: null });
  }
}

async function getUserPreview(username, sendResponse) {
  try {
    // Remove existing script
    const existingScript = document.querySelector(
      'script[src*="previewScript.js"]'
    );
    if (existingScript) existingScript.remove();

    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("previewScript.js");

    script.onload = function () {
      this.remove();

      window.dispatchEvent(
        new CustomEvent("GET_USER_PREVIEW", {
          detail: { username },
        })
      );
    };

    (document.head || document.documentElement).appendChild(script);

    // Set timeout for preview fetch
    const timeoutId = setTimeout(() => {
      sendResponse({ success: false, error: "Preview timeout" });
    }, 10000);

    window.addEventListener(
      "USER_PREVIEW_RESPONSE",
      function onResponse(e) {
        clearTimeout(timeoutId);
        window.removeEventListener("USER_PREVIEW_RESPONSE", onResponse);

        if (e.detail.success) {
          sendResponse({
            success: true,
            data: e.detail.data,
          });
        } else {
          sendResponse({
            success: false,
            error: e.detail.error,
          });
        }
      },
      { once: true }
    );
  } catch (error) {
    console.error("[IG Non-Followers] Get user preview error:", error);
    sendResponse({ success: false, error: error.message });
  }
}
