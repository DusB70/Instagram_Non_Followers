(function () {
  console.log("[IG Non-Followers] Page script started");

  sendProgress("Initializing scanner...", 0);

  async function runScanner() {
    try {
      sendProgress("Getting Instagram data...", 5);

      const instagramData = getInstagramData();
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

      window.postMessage(
        {
          type: "SCAN_COMPLETE",
          data: {
            success: true,
            followers: followers.length,
            following: following.length,
            nonFollowers: nonFollowers,
          },
        },
        "*"
      );
    } catch (error) {
      console.error("[IG Non-Followers] Error:", error);
      window.postMessage(
        {
          type: "SCAN_COMPLETE",
          data: {
            success: false,
            error: error.message,
          },
        },
        "*"
      );
    }
  }

  function getInstagramData() {
    try {
      const scriptTags = document.querySelectorAll(
        'script[type="application/ld+json"]'
      );
      for (const script of scriptTags) {
        try {
          const data = JSON.parse(script.textContent);
          if (data.author && data.author.identifier) {
            return {
              user_id: data.author.identifier,
            };
          }
        } catch (e) {
          continue;
        }
      }

      const pageData = document.querySelector(
        'script[type="application/json"]'
      );
      if (pageData) {
        const data = JSON.parse(pageData.textContent);
        const userId =
          data?.require?.[0]?.[3]?.[0]?.__bbox?.require?.[0]?.[3]?.[1]?.__bbox
            ?.result?.data?.user?.id;
        if (userId) {
          return { user_id: userId };
        }
      }

      return null;
    } catch (error) {
      console.error("[IG Non-Followers] Error getting Instagram data:", error);
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

        // Store users with timestamp information
        const timestamp = Date.now() - requestCount * 1000; // Approximate based on fetch order
        edge.edges.forEach((item, index) => {
          const user = item.node;
          users.push({
            username: user.username,
            full_name: user.full_name || "",
            profile_pic_url: user.profile_pic_url || "",
            profile_pic_url_hd: user.profile_pic_url || "",
            is_verified: user.is_verified || false,
            // Approximate follow timestamp - earlier in the list = followed longer ago
            follow_timestamp: timestamp - index * 100,
            fetch_order: requestCount * 50 + index, // Preserve original fetch order
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
    window.postMessage(
      {
        type: "SCAN_PROGRESS",
        message: message,
        percent: percent,
      },
      "*"
    );
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  runScanner();

  console.log("[IG Non-Followers] Scanner finished");
})();
