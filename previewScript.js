(function () {
  console.log("[IG Preview] Script loaded");

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

    try {
      console.log(`[IG Preview] Fetching preview for @${username}`);

      const userData = await fetchUserData(username);

      if (userData) {
        window.dispatchEvent(
          new CustomEvent("USER_PREVIEW_RESPONSE", {
            detail: {
              success: true,
              data: userData,
            },
          })
        );
      } else {
        throw new Error("Failed to fetch user data");
      }
    } catch (error) {
      console.error(
        `[IG Preview] Error fetching preview for @${username}:`,
        error
      );
      window.dispatchEvent(
        new CustomEvent("USER_PREVIEW_RESPONSE", {
          detail: {
            success: false,
            error: error.message,
          },
        })
      );
    }
  });

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
      // Get CSRF token
      const csrfToken = getCsrfToken();
      if (!csrfToken) {
        throw new Error("CSRF token not found");
      }

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

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (!data.data || !data.data.user) {
        throw new Error("Invalid response data");
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
    return document.cookie.match(/csrftoken=([^;]+)/)?.[1];
  }

  console.log("[IG Preview] Ready");
})();
