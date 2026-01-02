(function () {
  console.log("[IG Preview] Script loaded");

  // Rate limiting and caching
  const previewCache = new Map();
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  let requestQueue = [];
  let isProcessing = false;
  let lastRequestTime = 0;
  const MIN_REQUEST_DELAY = 2000; // 2 seconds between requests

  // Listen for current user ID request
  window.addEventListener("GET_CURRENT_USER_ID", async () => {
    try {
      const userId = getCurrentUserId();
      const username = getCurrentUsername();

      window.dispatchEvent(
        new CustomEvent("CURRENT_USER_ID_RESPONSE", {
          detail: {
            userId: userId,
            username: username,
          },
        })
      );
    } catch (error) {
      console.error("[IG Preview] Error getting user ID:", error);
      window.dispatchEvent(
        new CustomEvent("CURRENT_USER_ID_RESPONSE", {
          detail: {
            userId: null,
            username: null,
          },
        })
      );
    }
  });

  // Listen for user preview request
  window.addEventListener("GET_USER_PREVIEW", async (e) => {
    const { username } = e.detail;
    console.log(`[IG Preview] Received preview request for @${username}`);

    // Check cache first
    const cached = previewCache.get(username);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log(`[IG Preview] Returning cached data for @${username}`);
      window.dispatchEvent(
        new CustomEvent("USER_PREVIEW_RESPONSE", {
          detail: {
            username: username,
            success: true,
            data: cached.data,
            cached: true,
          },
        })
      );
      return;
    }

    // Add to queue
    requestQueue.push(username);
    processQueue();
  });

  async function processQueue() {
    if (isProcessing || requestQueue.length === 0) return;

    isProcessing = true;
    const username = requestQueue.shift();

    try {
      // Enforce rate limiting
      const timeSinceLastRequest = Date.now() - lastRequestTime;
      if (timeSinceLastRequest < MIN_REQUEST_DELAY) {
        const delay = MIN_REQUEST_DELAY - timeSinceLastRequest;
        console.log(`[IG Preview] Rate limiting: waiting ${delay}ms`);
        await sleep(delay);
      }

      console.log(`[IG Preview] Fetching preview for @${username}`);
      const userData = await fetchUserData(username);

      if (userData && userData.user) {
        console.log(`[IG Preview] Successfully fetched data for @${username}`);

        // Cache the result
        previewCache.set(username, {
          data: userData,
          timestamp: Date.now(),
        });

        window.dispatchEvent(
          new CustomEvent("USER_PREVIEW_RESPONSE", {
            detail: {
              username: username,
              success: true,
              data: userData,
              cached: false,
            },
          })
        );
      } else {
        throw new Error("No user data returned");
      }
    } catch (error) {
      console.error(
        `[IG Preview] Error fetching preview for @${username}:`,
        error
      );

      let errorMessage = "Failed to fetch user data";
      if (error.message.includes("429")) {
        errorMessage = "Rate limited - please wait a moment";
      } else if (error.message.includes("404")) {
        errorMessage = "User not found";
      } else if (error.message.includes("CSRF")) {
        errorMessage = "Session expired - refresh Instagram";
      }

      window.dispatchEvent(
        new CustomEvent("USER_PREVIEW_RESPONSE", {
          detail: {
            username: username,
            success: false,
            error: errorMessage,
          },
        })
      );
    } finally {
      lastRequestTime = Date.now();
      isProcessing = false;

      // Process next in queue after delay
      if (requestQueue.length > 0) {
        setTimeout(() => processQueue(), MIN_REQUEST_DELAY);
      }
    }
  }

  // Get current user ID from page
  function getCurrentUserId() {
    let userId = null;

    // Try _sharedData
    if (window._sharedData && window._sharedData.config) {
      userId = window._sharedData.config.viewerId;
    }

    // Try cookies
    if (!userId) {
      const match = document.cookie.match(/ds_user_id=([^;]+)/);
      if (match) userId = match[1];
    }

    // Try window.__additionalDataLoaded
    if (!userId && window.__additionalDataLoaded) {
      const keys = Object.keys(window.__additionalDataLoaded);
      for (const key of keys) {
        if (key.includes("user")) {
          const data = window.__additionalDataLoaded[key];
          if (data && data.data && data.data.user && data.data.user.id) {
            userId = data.data.user.id;
            break;
          }
        }
      }
    }

    return userId;
  }

  // Get current username from page
  function getCurrentUsername() {
    let username = null;

    // Try _sharedData
    if (window._sharedData && window._sharedData.config) {
      username = window._sharedData.config.viewer?.username;
    }

    // Try cookies
    if (!username) {
      const match = document.cookie.match(/ds_user=([^;]+)/);
      if (match) username = match[1];
    }

    // Try page URL or meta tags
    if (!username) {
      const metaTag = document.querySelector('meta[property="og:title"]');
      if (metaTag) {
        const content = metaTag.getAttribute("content");
        const match = content.match(/@([a-zA-Z0-9._]+)/);
        if (match) username = match[1];
      }
    }

    return username;
  }

  // Fetch user data from Instagram API
  async function fetchUserData(username) {
    try {
      console.log(`[IG Preview] Fetching data for @${username}`);

      // Get CSRF token
      const csrfToken = getCsrfToken();
      if (!csrfToken) {
        console.error("[IG Preview] CSRF token not found");
        throw new Error("CSRF token not found - please refresh Instagram page");
      }

      console.log(`[IG Preview] CSRF token found, making API request`);

      // Fetch user profile info
      const response = await fetch(
        `https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`,
        {
          headers: {
            accept: "*/*",
            "accept-language": "en-US,en;q=0.9",
            "sec-fetch-site": "same-origin",
            "x-csrftoken": csrfToken,
            "x-ig-app-id": "936619743392459",
            "x-requested-with": "XMLHttpRequest",
          },
          credentials: "include",
        }
      );

      console.log(`[IG Preview] API response status:`, response.status);

      if (response.status === 429) {
        throw new Error("HTTP 429 - Rate limited");
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} - ${response.statusText}`);
      }

      const data = await response.json();
      console.log(`[IG Preview] API response data:`, data);

      if (!data.data || !data.data.user) {
        console.error("[IG Preview] Invalid response structure:", data);
        throw new Error("Invalid response data - user not found");
      }

      const user = data.data.user;

      // Get last 3 posts
      const posts = [];
      if (
        user.edge_owner_to_timeline_media &&
        user.edge_owner_to_timeline_media.edges
      ) {
        const postEdges = user.edge_owner_to_timeline_media.edges.slice(0, 3);
        postEdges.forEach((edge) => {
          posts.push({
            id: edge.node.id,
            thumbnail_src: edge.node.thumbnail_src,
            display_url: edge.node.display_url,
          });
        });
      }

      console.log(`[IG Preview] Successfully parsed data for @${username}`);

      return {
        user: {
          id: user.id,
          username: user.username,
          full_name: user.full_name,
          biography: user.biography,
          profile_pic_url: user.profile_pic_url_hd || user.profile_pic_url,
          is_private: user.is_private,
          is_verified: user.is_verified,
          edge_followed_by: user.edge_followed_by,
          edge_follow: user.edge_follow,
          edge_owner_to_timeline_media: user.edge_owner_to_timeline_media,
        },
        posts: posts,
      };
    } catch (error) {
      console.error("[IG Preview] Fetch error:", error);
      throw error;
    }
  }

  // Get CSRF token from cookies
  function getCsrfToken() {
    const match = document.cookie.match(/csrftoken=([^;]+)/);
    const token = match?.[1];
    console.log("[IG Preview] CSRF token:", token ? "found" : "not found");
    return token;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  console.log("[IG Preview] Ready and listening for preview requests");
})();
