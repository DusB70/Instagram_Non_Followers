(function () {
  console.log("[IG Unfollow] Script loaded");

  window.addEventListener("START_UNFOLLOW", async (e) => {
    const { usernames, safeModeEnabled, simulate } = e.detail;
    console.log(
      `[IG Unfollow] Starting unfollow for ${usernames.length} users (Safe Mode: ${safeModeEnabled}, Simulate: ${simulate}):`,
      usernames
    );

    try {
      const results = await unfollowMultipleUsers(
        usernames,
        safeModeEnabled,
        simulate
      );

      window.dispatchEvent(
        new CustomEvent("UNFOLLOW_COMPLETE", {
          detail: results,
        })
      );
    } catch (error) {
      console.error("[IG Unfollow] Error:", error);
      window.dispatchEvent(
        new CustomEvent("UNFOLLOW_ERROR", {
          detail: { error: error.message },
        })
      );
    }
  });

  async function unfollowMultipleUsers(usernames, safeModeEnabled, simulate) {
    const results = {
      unfollowedCount: 0,
      failed: [],
      rateLimited: false,
    };

    for (let i = 0; i < usernames.length; i++) {
      const username = usernames[i];

      try {
        console.log(
          `[IG Unfollow] ${simulate ? "Simulating" : "Unfollowing"} ${i + 1}/${
            usernames.length
          }: @${username}`
        );

        // Send progress update
        window.dispatchEvent(
          new CustomEvent("UNFOLLOW_PROGRESS", {
            detail: {
              current: i + 1,
              total: usernames.length,
              username: username,
            },
          })
        );

        const result = await unfollowUser(username, simulate);

        if (result.rateLimited) {
          console.error(`[IG Unfollow] Rate limited detected!`);
          results.rateLimited = true;
          break;
        }

        if (result.success) {
          results.unfollowedCount++;
          console.log(
            `[IG Unfollow] ✓ Successfully ${
              simulate ? "simulated" : "unfollowed"
            } @${username}`
          );
        } else {
          results.failed.push(username);
          console.log(`[IG Unfollow] ✗ Failed to unfollow @${username}`);
        }

        // Randomized delay between unfollows (12-18 seconds)
        if (i < usernames.length - 1 && !simulate) {
          const delay = 12000 + Math.random() * 6000; // 12-18 seconds
          console.log(
            `[IG Unfollow] Waiting ${(delay / 1000).toFixed(
              1
            )}s before next unfollow...`
          );
          await sleep(delay);
        } else if (simulate) {
          // Shorter delay for simulation
          await sleep(500);
        }
      } catch (error) {
        console.error(`[IG Unfollow] Error unfollowing @${username}:`, error);
        results.failed.push(username);

        // Check if error indicates rate limiting
        if (
          error.message.includes("429") ||
          error.message.includes("403") ||
          error.message.includes("Try again later")
        ) {
          results.rateLimited = true;
          break;
        }
      }
    }

    return results;
  }

  async function unfollowUser(username, simulate) {
    try {
      // If simulating, just return success without making API call
      if (simulate) {
        console.log(`[IG Unfollow] Simulating unfollow for @${username}`);
        return { success: true, rateLimited: false, simulated: true };
      }

      // Get the user ID
      const userId = await getUserId(username);
      if (!userId) {
        throw new Error(`Could not find user ID for @${username}`);
      }

      // Get CSRF token
      const csrfToken = getCsrfToken();
      if (!csrfToken) {
        throw new Error("CSRF token not found");
      }

      // Make unfollow request
      const response = await fetch(
        `https://www.instagram.com/api/v1/friendships/destroy/${userId}/`,
        {
          method: "POST",
          headers: {
            accept: "*/*",
            "accept-language": "en-US,en;q=0.9",
            "content-type": "application/x-www-form-urlencoded",
            "sec-fetch-site": "same-origin",
            "x-csrftoken": csrfToken,
            "x-ig-app-id": "936619743392459",
            "x-instagram-ajax": "1007616494",
            "x-requested-with": "XMLHttpRequest",
          },
          credentials: "include",
          body: new URLSearchParams({}),
        }
      );

      // Check for rate limiting
      if (response.status === 429 || response.status === 403) {
        console.error(`[IG Unfollow] Rate limited! Status: ${response.status}`);
        return { success: false, rateLimited: true };
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      // Check for Instagram warnings
      if (
        data.message &&
        (data.message.includes("Try again later") ||
          data.message.includes("Please wait") ||
          data.message.includes("blocked"))
      ) {
        console.error(`[IG Unfollow] Instagram warning: ${data.message}`);
        return { success: false, rateLimited: true };
      }

      if (
        data.status === "ok" &&
        data.friendship_status &&
        data.friendship_status.following === false
      ) {
        return { success: true, rateLimited: false };
      } else {
        throw new Error("Unfollow failed in response");
      }
    } catch (error) {
      console.error(`[IG Unfollow] Error unfollowing @${username}:`, error);

      // Check if error message indicates rate limiting
      const rateLimited =
        error.message.includes("429") ||
        error.message.includes("403") ||
        error.message.includes("Try again later");

      return { success: false, rateLimited };
    }
  }

  async function getUserId(username) {
    try {
      const response = await fetch(
        `https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`,
        {
          headers: {
            accept: "*/*",
            "x-ig-app-id": "936619743392459",
          },
          credentials: "include",
        }
      );

      if (response.ok) {
        const data = await response.json();
        return data.data?.user?.id;
      }

      return null;
    } catch (error) {
      console.error(
        `[IG Unfollow] Error getting user ID for @${username}:`,
        error
      );
      return null;
    }
  }

  function getCsrfToken() {
    return document.cookie.match(/csrftoken=([^;]+)/)?.[1];
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  console.log("[IG Unfollow] Ready to unfollow");
})();
