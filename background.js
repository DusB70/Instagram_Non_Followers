console.log("[IG Non-Followers] Background script loaded");

// Handle image fetching to bypass CORS
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "FETCH_IMAGE") {
    fetchImageAsDataUrl(message.url)
      .then((dataUrl) => sendResponse({ dataUrl }))
      .catch((error) => {
        console.error("[IG Non-Followers] Image fetch error:", error);
        sendResponse({ dataUrl: null });
      });

    return true; // Keep channel open for async response
  }
});

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
    console.error("[IG Non-Followers] Fetch error:", error);
    throw error;
  }
}
