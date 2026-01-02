(function () {
  console.log("[IG Non-Followers] Page script started");

  sendProgress("Initializing scanner...", 0);

  async function runScanner() {
    try {
      sendProgress("Getting Instagram data...", 5);

      const instagramData = await getInstagramData();
      if (!instagramData) {
        throw new Error(
          "Could not find Instagram data. Make sure you're on your profile page."
        );
      }

      const userId = instagramData.user_id;
      if (!userId) {
        throw new Error("Could not find user ID");
      }

      sendProgress("Fetching followers...", 10);
      const followers = await fetchUserList(userId, "followers", 10, 40);

      sendProgress("Fetching following...", 40);
      const following = await fetchUserList(userId, "following", 40, 70);

      sendProgress("Analyzing data...", 70);

      const followerSet = new Set(followers.map((u) => u.username));
      const nonFollowers = following.filter(
        (user) => !followerSet.has(user.username)
      );

      sendProgress("Complete!", 100);

      window.dispatchEvent(
        new CustomEvent("IG_NON_FOLLOWERS_COMPLETE", {
          detail: {
            followers: followers.length,
            following: following.length,
            nonFollowers: nonFollowers,
          },
        })
      );
    } catch (error) {
      console.error("[IG Non-Followers] Error:", error);
      window.dispatchEvent(
        new CustomEvent("IG_NON_FOLLOWERS_ERROR", {
          detail: {
            error: error.message,
          },
        })
      );
    }
  }

  async function getInstagramData() {
    try {
      // Method 1: Try getting from current page URL
      const urlMatch = window.location.pathname.match(/^\/([^\/]+)\/?$/);
      if (urlMatch) {
        const username = urlMatch[1];
        console.log("[IG Non-Followers] Found username from URL:", username);

        const userId = await getUserIdFromUsername(username);
        if (userId) {
          return { user_id: userId };
        }
      }

      // Method 2: Try cookies
      const cookieMatch = document.cookie.match(/ds_user_id=([^;]+)/);
      if (cookieMatch) {
        console.log(
          "[IG Non-Followers] Found user ID in cookies:",
          cookieMatch[1]
        );
        return { user_id: cookieMatch[1] };
      }

      // Method 3: Try window._sharedData
      if (window._sharedData?.config?.viewerId) {
        console.log("[IG Non-Followers] Found user ID in _sharedData");
        return { user_id: window._sharedData.config.viewerId };
      }

      // Method 4: Try script tags
      const scriptTags = document.querySelectorAll(
        'script[type="application/ld+json"]'
      );
      for (const script of scriptTags) {
        try {
          const data = JSON.parse(script.textContent);
          if (data.author?.identifier) {
            console.log("[IG Non-Followers] Found user ID in LD+JSON");
            return { user_id: data.author.identifier };
          }
        } catch (e) {
          continue;
        }
      }

      // Method 5: Try meta tags
      const metaTags = document.querySelectorAll(
        'meta[property^="al:ios:url"]'
      );
      for (const meta of metaTags) {
        const content = meta.getAttribute("content");
        const match = content?.match(/user_id=(\d+)/);
        if (match) {
          console.log("[IG Non-Followers] Found user ID in meta tags");
          return { user_id: match[1] };
        }
      }

      return null;
    } catch (error) {
      console.error("[IG Non-Followers] Error getting Instagram data:", error);
      return null;
    }
  }

  async function getUserIdFromUsername(username) {
    try {
      const response = await fetch(
        `https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`,
        {
          headers: {
            "x-ig-app-id": "936619743392459",
          },
          credentials: "include",
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      return data.data?.user?.id;
    } catch (error) {
      console.error("[IG Non-Followers] Error fetching user ID:", error);
      return null;
    }
  }

  async function fetchUserList(userId, type, startPercent, endPercent) {
    const users = [];
    let hasNext = true;
    let endCursor = null;
    const progressRange = endPercent - startPercent;

    const queryHash =
      type === "followers"
        ? "c76146de99bb02f6415203be841dd25a"
        : "d04b0a864b4b54837c0d870b0e77e076";

    let requestCount = 0;

    while (hasNext) {
      try {
        const variables = {
          id: userId,
          include_reel: true,
          fetch_mutual: false,
          first: 50,
        };

        if (endCursor) {
          variables.after = endCursor;
        }

        const url = `https://www.instagram.com/graphql/query/?query_hash=${queryHash}&variables=${encodeURIComponent(
          JSON.stringify(variables)
        )}`;

        const response = await fetch(url, {
          credentials: "include",
          headers: {
            "X-IG-App-ID": "936619743392459",
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        const edge =
          data.data.user[
            type === "followers" ? "edge_followed_by" : "edge_follow"
          ];

        if (!edge || !edge.edges) {
          break;
        }

        const timestamp = Date.now() - requestCount * 1000;
        edge.edges.forEach((item, index) => {
          const user = item.node;
          users.push({
            username: user.username,
            full_name: user.full_name || "",
            profile_pic_url: user.profile_pic_url || "",
            profile_pic_url_hd: user.profile_pic_url || "",
            is_verified: user.is_verified || false,
            follow_timestamp: timestamp - index * 100,
            fetch_order: requestCount * 50 + index,
          });
        });

        hasNext = edge.page_info.has_next_page;
        endCursor = edge.page_info.end_cursor;

        const progress =
          startPercent +
          (progressRange * users.length) / Math.max(edge.count, users.length);
        sendProgress(
          `Fetching ${type}... (${users.length}/${edge.count})`,
          Math.min(progress, endPercent)
        );

        requestCount++;

        if (hasNext) {
          await sleep(1000 + Math.random() * 1000);
        }
      } catch (error) {
        console.error(`[IG Non-Followers] Error fetching ${type}:`, error);
        break;
      }
    }

    return users;
  }

  function sendProgress(message, percent) {
    window.dispatchEvent(
      new CustomEvent("IG_SCAN_PROGRESS", {
        detail: {
          message: message,
          percent: percent,
        },
      })
    );
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  runScanner();

  console.log("[IG Non-Followers] Scanner finished initializing");
})();
