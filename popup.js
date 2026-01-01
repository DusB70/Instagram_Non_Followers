document.addEventListener("DOMContentLoaded", function () {
  // ==================== DOM Elements ====================
  const btn = document.getElementById("btn");
  const list = document.getElementById("list");
  const status = document.getElementById("status");
  const progress = document.getElementById("progress");
  const stats = document.getElementById("stats");
  const resultsHeader = document.querySelector(".results-header");
  const bulkActions = document.querySelector(".bulk-actions");
  const selectedCount = document.getElementById("selected-count");
  const unfollowSelectedBtn = document.getElementById("unfollow-selected");
  const selectAllBtn = document.getElementById("select-all");
  const deselectAllBtn = document.getElementById("deselect-all");
  const safeModeToggle = document.getElementById("safe-mode-toggle");
  const unfollowCounter = document.getElementById("unfollow-counter");
  const sessionLimitEl = document.getElementById("session-limit");
  const warningMessage = document.getElementById("warning-message");
  const themeToggle = document.getElementById("theme-toggle");
  const whitelistManagerBtn = document.getElementById("whitelist-manager-btn");
  const whitelistModal = document.getElementById("whitelist-modal");
  const closeModalBtn = document.querySelector(".close-modal");
  const exportWhitelistBtn = document.getElementById("export-whitelist");
  const importWhitelistBtn = document.getElementById("import-whitelist");
  const importFileInput = document.getElementById("import-file");
  const autoBackupToggle = document.getElementById("auto-backup-toggle");
  const currentUserIdSpan = document.getElementById("current-user-id");
  const whitelistCountSpan = document.getElementById("whitelist-count");
  const whitelistListDiv = document.getElementById("whitelist-list");
  const lastScanInfo = document.getElementById("last-scan-info");
  const lastScanText = document.getElementById("last-scan-text");
  const clearScanBtn = document.getElementById("clear-scan-btn");
  const filtersContainer = document.querySelector(".filters-container");
  const toggleFiltersBtn = document.getElementById("toggle-filters");
  const filtersPanel = document.getElementById("filters-panel");
  const sortFilter = document.getElementById("sort-filter");
  const searchFilter = document.getElementById("search-filter");
  const resetFiltersBtn = document.getElementById("reset-filters");
  const unfollowProgress = document.getElementById("unfollow-progress");
  const unfollowCurrent = document.getElementById("unfollow-current");
  const unfollowTotal = document.getElementById("unfollow-total");
  const userPreview = document.getElementById("user-preview");

  // ==================== State Management ====================
  let isScanning = false;
  let currentScanData = null;
  let selectedUsers = new Set();
  let allNonFollowers = [];
  let filteredNonFollowers = [];
  let imageCache = new Map();
  let safeModeEnabled = true;
  let sessionUnfollowCount = 0;
  let isLocked = false;
  let isPaused = false;
  let currentUserId = null;
  let whitelist = {};
  let unfollowedUsers = new Set();
  let autoBackupEnabled = false;
  let previewTimeout = null;
  let currentTheme = "light";
  const SAFE_MODE_LIMIT = 50;
  const BACKUP_FILENAME = "ig-nonfollowers-whitelist-backup.json";

  // ==================== Initialization ====================
  async function initialize() {
    await loadSettings();
    await loadWhitelist();
    await loadUnfollowedUsers();
    await getCurrentUserId();
    setupEventListeners();
    checkLastScan();
    autoCheckInstagram();
  }

  async function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get(
        [
          "safeModeEnabled",
          "sessionUnfollowCount",
          "sessionStartTime",
          "theme",
          "autoBackupEnabled",
          "selectedUsers",
          "lastSort",
        ],
        (result) => {
          safeModeEnabled =
            result.safeModeEnabled !== undefined
              ? result.safeModeEnabled
              : true;
          safeModeToggle.checked = safeModeEnabled;

          const sessionStartTime = result.sessionStartTime || Date.now();
          const hoursSinceStart =
            (Date.now() - sessionStartTime) / (1000 * 60 * 60);

          if (hoursSinceStart > 24) {
            sessionUnfollowCount = 0;
            chrome.storage.local.set({
              sessionUnfollowCount: 0,
              sessionStartTime: Date.now(),
            });
          } else {
            sessionUnfollowCount = result.sessionUnfollowCount || 0;
          }

          currentTheme = result.theme || "light";
          document.body.setAttribute("data-theme", currentTheme);
          themeToggle.textContent = currentTheme === "light" ? "🌙" : "☀️";

          autoBackupEnabled = result.autoBackupEnabled || false;
          autoBackupToggle.checked = autoBackupEnabled;

          if (result.selectedUsers) {
            selectedUsers = new Set(result.selectedUsers);
          }

          // Restore last sort option
          if (result.lastSort) {
            sortFilter.value = result.lastSort;
          }

          updateSafeModeUI();
          resolve();
        }
      );
    });
  }

  async function loadWhitelist() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["whitelist"], (result) => {
        whitelist = result.whitelist || {};
        resolve();
      });
    });
  }

  async function loadUnfollowedUsers() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["unfollowedUsers"], (result) => {
        unfollowedUsers = new Set(result.unfollowedUsers || []);
        resolve();
      });
    });
  }

  async function getCurrentUserId() {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tab && tab.url && tab.url.includes("instagram.com")) {
        const response = await chrome.tabs.sendMessage(tab.id, {
          type: "GET_USER_ID",
        });
        if (response && response.userId) {
          currentUserId = response.userId;
          currentUserIdSpan.textContent = `@${
            response.username || currentUserId
          }`;
          updateWhitelistCount();
        }
      }
    } catch (error) {
      console.error("Error getting user ID:", error);
      currentUserIdSpan.textContent = "Not available";
    }
  }

  // ==================== Event Listeners ====================
  function setupEventListeners() {
    themeToggle.addEventListener("click", toggleTheme);
    safeModeToggle.addEventListener("change", () => {
      safeModeEnabled = safeModeToggle.checked;
      chrome.storage.local.set({ safeModeEnabled });
      updateSafeModeUI();
    });

    btn.addEventListener("click", startScan);
    selectAllBtn.addEventListener("click", selectAll);
    deselectAllBtn.addEventListener("click", deselectAll);
    unfollowSelectedBtn.addEventListener("click", unfollowMultipleUsers);

    whitelistManagerBtn.addEventListener("click", openWhitelistManager);
    closeModalBtn.addEventListener("click", closeWhitelistManager);
    exportWhitelistBtn.addEventListener("click", exportWhitelist);
    importWhitelistBtn.addEventListener("click", () => importFileInput.click());
    importFileInput.addEventListener("change", importWhitelist);
    autoBackupToggle.addEventListener("change", toggleAutoBackup);

    clearScanBtn.addEventListener("click", clearLastScan);

    toggleFiltersBtn.addEventListener("click", toggleFilters);
    sortFilter.addEventListener("change", applyFilters);
    searchFilter.addEventListener("input", debounce(applyFilters, 300));
    resetFiltersBtn.addEventListener("click", resetFilters);

    whitelistModal.addEventListener("click", (e) => {
      if (e.target === whitelistModal) {
        closeWhitelistManager();
      }
    });

    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === "SCAN_PROGRESS") {
        status.textContent = message.message;
        if (message.percent !== undefined) {
          progress.style.setProperty("--progress", `${message.percent}%`);
        }
      }
    });
  }

  // ==================== Theme Management ====================
  function toggleTheme() {
    currentTheme = currentTheme === "light" ? "dark" : "light";
    document.body.setAttribute("data-theme", currentTheme);
    themeToggle.textContent = currentTheme === "light" ? "🌙" : "☀️";
    chrome.storage.local.set({ theme: currentTheme });
  }

  // ==================== Safe Mode Management ====================
  function updateSafeModeUI() {
    if (safeModeEnabled) {
      sessionLimitEl.textContent = SAFE_MODE_LIMIT;
      warningMessage.textContent = `⚠️ Safe Mode: Max ${SAFE_MODE_LIMIT} unfollows per session`;
      unfollowCounter.style.display = "block";
      updateUnfollowCounter();
    } else {
      warningMessage.textContent =
        "⚠️ Safe Mode OFF: Unfollow at your own risk";
      unfollowCounter.style.display = "none";
    }

    if (isLocked) {
      warningMessage.classList.add("error");
      warningMessage.textContent =
        "🔒 Unfollows locked due to Instagram warning";
    }

    if (isPaused) {
      warningMessage.classList.add("warning");
      warningMessage.textContent = "⏸️ Process paused due to Instagram warning";
    }
  }

  function updateUnfollowCounter() {
    const counterStrong = unfollowCounter.querySelector("strong");
    if (counterStrong) {
      counterStrong.textContent = sessionUnfollowCount;
    }

    if (safeModeEnabled && sessionUnfollowCount >= SAFE_MODE_LIMIT) {
      lockUnfollows("Session limit reached");
    }
  }

  function lockUnfollows(reason) {
    isLocked = true;
    unfollowSelectedBtn.disabled = true;
    unfollowSelectedBtn.classList.add("locked");
    warningMessage.classList.add("error");
    warningMessage.textContent = `🔒 ${reason}`;
    status.classList.add("warning");
    status.innerHTML = `<span>⚠️</span><span>${reason}</span>`;

    document.querySelectorAll(".unfollow-btn-single").forEach((btn) => {
      btn.disabled = true;
    });
  }

  function pauseProcess(reason) {
    isPaused = true;
    warningMessage.classList.add("warning");
    warningMessage.textContent = `⏸️ ${reason}`;
    status.classList.add("warning");
    status.innerHTML = `<span>⏸️</span><span>${reason}</span>`;
  }

  // ==================== Avatar Management ====================
  function loadAvatar(container, profilePicUrl) {
    const defaultAvatar =
      "https://www.instagram.com/static/images/ico/favicon-192.png/68d99ba29cc8.png";
    const imageUrl = profilePicUrl || defaultAvatar;

    container.innerHTML = '<div class="avatar-loading"></div>';

    if (imageCache.has(imageUrl)) {
      displayAvatar(container, imageCache.get(imageUrl));
      return;
    }

    chrome.runtime.sendMessage(
      { type: "FETCH_IMAGE", url: imageUrl },
      (response) => {
        if (response && response.dataUrl) {
          imageCache.set(imageUrl, response.dataUrl);
          displayAvatar(container, response.dataUrl);
        } else {
          displayFallbackAvatar(container, profilePicUrl);
        }
      }
    );
  }

  function displayAvatar(container, dataUrl) {
    container.innerHTML = "";
    const img = document.createElement("img");
    img.className = container.classList.contains("whitelist-avatar-container")
      ? "whitelist-avatar"
      : container.classList.contains("preview-avatar-container")
      ? "preview-avatar"
      : "avatar";
    img.src = dataUrl;
    img.style.opacity = "0";
    img.style.transition = "opacity 0.3s ease";
    img.onload = () => (img.style.opacity = "1");
    img.onerror = () => displayFallbackAvatar(container, null);
    container.appendChild(img);
  }

  function displayFallbackAvatar(container, profilePicUrl) {
    container.innerHTML = "";
    const avatar = document.createElement("div");
    avatar.className = container.classList.contains(
      "whitelist-avatar-container"
    )
      ? "whitelist-avatar"
      : container.classList.contains("preview-avatar-container")
      ? "preview-avatar"
      : "avatar";
    avatar.style.background =
      "linear-gradient(135deg, #667eea 0%, #764ba2 100%)";
    avatar.style.display = "flex";
    avatar.style.alignItems = "center";
    avatar.style.justifyContent = "center";
    avatar.style.color = "white";
    avatar.style.fontWeight = "bold";
    avatar.style.fontSize = "16px";
    avatar.textContent = profilePicUrl ? "?" : "IG";
    container.appendChild(avatar);
  }

  // ==================== User Preview ====================
  async function showUserPreview(username, element) {
    clearTimeout(previewTimeout);

    previewTimeout = setTimeout(async () => {
      userPreview.style.display = "block";
      userPreview.innerHTML = '<div class="preview-loading">Loading...</div>';

      const rect = element.getBoundingClientRect();
      userPreview.style.left = `${rect.right + 10}px`;
      userPreview.style.top = `${rect.top}px`;

      try {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        const response = await chrome.tabs.sendMessage(tab.id, {
          type: "GET_USER_PREVIEW",
          username: username,
        });

        if (response && response.success) {
          displayUserPreview(response.data);
        } else {
          userPreview.innerHTML =
            '<div class="preview-loading">Failed to load</div>';
        }
      } catch (error) {
        console.error("Preview error:", error);
        userPreview.style.display = "none";
      }
    }, 500);
  }

  function hideUserPreview() {
    clearTimeout(previewTimeout);
    userPreview.style.display = "none";
  }

  function displayUserPreview(data) {
    const { user, posts } = data;

    userPreview.innerHTML = `
      <div class="preview-header">
        <div class="preview-avatar-container" id="preview-avatar-container">
          <div class="preview-avatar-loading"></div>
        </div>
        <div class="preview-info">
          <h3>@${user.username}</h3>
          <p>${user.full_name || ""}</p>
        </div>
      </div>
      <div class="preview-stats">
        <div><strong>${
          user.edge_owner_to_timeline_media?.count || 0
        }</strong> posts</div>
        <div><strong>${formatNumber(
          user.edge_followed_by?.count || 0
        )}</strong> followers</div>
        <div><strong>${formatNumber(
          user.edge_follow?.count || 0
        )}</strong> following</div>
      </div>
      ${
        user.biography ? `<div class="preview-bio">${user.biography}</div>` : ""
      }
      ${
        posts.length > 0
          ? `
        <div class="preview-posts">
          ${posts
            .map(
              (post) => `
            <img src="${post.thumbnail_src}" class="preview-post-img" alt="Post" onerror="this.style.display='none'">
          `
            )
            .join("")}
        </div>
      `
          : ""
      }
    `;

    // Load avatar after rendering
    const avatarContainer = document.getElementById("preview-avatar-container");
    if (avatarContainer && user.profile_pic_url) {
      loadAvatar(avatarContainer, user.profile_pic_url);
    }
  }

  function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
    if (num >= 1000) return (num / 1000).toFixed(1) + "K";
    return num.toString();
  }

  // ==================== Whitelist Management ====================
  function isWhitelisted(username) {
    if (!currentUserId || !whitelist[currentUserId]) return false;
    return whitelist[currentUserId].some((u) => u.username === username);
  }

  async function toggleWhitelist(username, fullName, profilePicUrl, index) {
    if (!currentUserId) {
      alert("⚠️ Could not determine current user ID");
      return;
    }

    if (!whitelist[currentUserId]) {
      whitelist[currentUserId] = [];
    }

    const isCurrentlyWhitelisted = isWhitelisted(username);

    if (isCurrentlyWhitelisted) {
      // Remove from whitelist
      whitelist[currentUserId] = whitelist[currentUserId].filter(
        (u) => u.username !== username
      );
      status.innerHTML = `<span>☆</span><span>@${username} removed from whitelist</span>`;
    } else {
      // Add to whitelist
      whitelist[currentUserId].push({
        username: username,
        full_name: fullName,
        profile_pic_url: profilePicUrl,
        added_at: Date.now(),
      });
      status.innerHTML = `<span>⭐</span><span>@${username} added to whitelist</span>`;
    }

    await saveWhitelist();

    // Update star visual state with color change
    const star = document.querySelector(
      `[data-index="${index}"] .whitelist-star`
    );
    if (star) {
      if (isCurrentlyWhitelisted) {
        // Removing from whitelist - gray star
        star.textContent = "☆";
        star.classList.remove("whitelisted");
      } else {
        // Adding to whitelist - gold star
        star.textContent = "★";
        star.classList.add("whitelisted");
      }
    }

    // Real-time update: remove from list if added to whitelist
    if (!isCurrentlyWhitelisted) {
      setTimeout(() => {
        removeUserFromList(index);
      }, 1000);
    }

    updateWhitelistCount();

    // If whitelist modal is open, refresh it
    if (whitelistModal.style.display === "flex") {
      displayWhitelistItems();
    }
  }

  async function saveWhitelist() {
    await chrome.storage.local.set({ whitelist });
    await chrome.storage.sync.set({ whitelist });

    if (autoBackupEnabled) {
      await backupWhitelistToPC();
    }
  }

  async function backupWhitelistToPC() {
    try {
      const blob = new Blob([JSON.stringify(whitelist, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);

      await chrome.downloads.download({
        url: url,
        filename: BACKUP_FILENAME,
        conflictAction: "overwrite",
        saveAs: false,
      });

      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Backup error:", error);
    }
  }

  function updateWhitelistCount() {
    const count =
      currentUserId && whitelist[currentUserId]
        ? whitelist[currentUserId].length
        : 0;
    whitelistCountSpan.textContent = count;
  }

  function openWhitelistManager() {
    whitelistModal.style.display = "flex";
    displayWhitelistItems();
  }

  function closeWhitelistManager() {
    whitelistModal.style.display = "none";
  }

  function displayWhitelistItems() {
    if (
      !currentUserId ||
      !whitelist[currentUserId] ||
      whitelist[currentUserId].length === 0
    ) {
      whitelistListDiv.innerHTML =
        '<p style="text-align: center; opacity: 0.7; padding: 20px;">No whitelisted users</p>';
      return;
    }

    whitelistListDiv.innerHTML = "";

    whitelist[currentUserId].forEach((user) => {
      const item = document.createElement("div");
      item.className = "whitelist-item";

      const leftDiv = document.createElement("div");
      leftDiv.className = "whitelist-item-left";

      const avatarContainer = document.createElement("div");
      avatarContainer.className = "whitelist-avatar-container";
      loadAvatar(avatarContainer, user.profile_pic_url);

      const info = document.createElement("div");
      info.className = "whitelist-item-info";
      info.innerHTML = `
        <strong>@${user.username}</strong>
        <div style="font-size: 12px; opacity: 0.7;">${
          user.full_name || ""
        }</div>
        <div style="font-size: 11px; opacity: 0.5;">Added: ${new Date(
          user.added_at
        ).toLocaleDateString()}</div>
      `;

      leftDiv.appendChild(avatarContainer);
      leftDiv.appendChild(info);

      const removeBtn = document.createElement("button");
      removeBtn.textContent = "Remove";
      removeBtn.onclick = () => removeFromWhitelist(user.username);

      item.appendChild(leftDiv);
      item.appendChild(removeBtn);
      whitelistListDiv.appendChild(item);
    });
  }

  window.removeFromWhitelist = async function (username) {
    if (!currentUserId || !whitelist[currentUserId]) return;

    whitelist[currentUserId] = whitelist[currentUserId].filter(
      (u) => u.username !== username
    );

    await saveWhitelist();
    displayWhitelistItems();
    updateWhitelistCount();

    // Real-time update: update star in list if user is visible
    const userElement = list.querySelector(`[data-username="${username}"]`);
    if (userElement) {
      const star = userElement.querySelector(".whitelist-star");
      if (star) {
        star.textContent = "☆";
        star.classList.remove("whitelisted");
      }
    } else {
      // User not in current list, reload to show them
      if (currentScanData) {
        await reloadNonFollowersList();
      }
    }

    status.innerHTML = `<span>☆</span><span>@${username} removed from whitelist</span>`;
  };

  async function reloadNonFollowersList() {
    if (!currentScanData) return;

    const { followers, following, nonFollowers } = currentScanData;

    const filtered = nonFollowers.filter(
      (user) =>
        !isWhitelisted(user.username) && !unfollowedUsers.has(user.username)
    );
    allNonFollowers = filtered;
    filteredNonFollowers = filtered;

    stats.innerHTML = `
      <strong>Results:</strong> ${filtered.length} non-followers
      <br>
      <small>Following: ${following} | Followers: ${followers}</small>
    `;

    applyFilters();
  }

  async function exportWhitelist() {
    const dataStr = JSON.stringify(whitelist, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    await chrome.downloads.download({
      url: url,
      filename: `ig-nonfollowers-whitelist-${timestamp}.json`,
      saveAs: true,
    });

    URL.revokeObjectURL(url);
    status.innerHTML = "<span>📥</span><span>Whitelist exported</span>";
  }

  async function importWhitelist(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const imported = JSON.parse(e.target.result);

        Object.keys(imported).forEach((userId) => {
          if (!whitelist[userId]) {
            whitelist[userId] = [];
          }
          imported[userId].forEach((user) => {
            if (!whitelist[userId].some((u) => u.username === user.username)) {
              whitelist[userId].push(user);
            }
          });
        });

        await saveWhitelist();
        displayWhitelistItems();
        updateWhitelistCount();
        status.innerHTML =
          "<span>📤</span><span>Whitelist imported successfully</span>";
      } catch (error) {
        console.error("Import error:", error);
        alert("❌ Failed to import whitelist. Invalid file format.");
      }
    };
    reader.readAsText(file);
    importFileInput.value = "";
  }

  function toggleAutoBackup() {
    autoBackupEnabled = autoBackupToggle.checked;
    chrome.storage.local.set({ autoBackupEnabled });

    if (autoBackupEnabled) {
      backupWhitelistToPC();
      status.innerHTML = "<span>💾</span><span>Auto-backup enabled</span>";
    } else {
      status.innerHTML = "<span>💾</span><span>Auto-backup disabled</span>";
    }
  }

  // ==================== User Element Creation ====================
  function createUserElement(user, index) {
    const div = document.createElement("div");
    div.className = "user";
    div.dataset.username = user.username;
    div.dataset.index = index;

    const star = document.createElement("span");
    star.className = "whitelist-star";
    const isWhitelistedUser = isWhitelisted(user.username);
    star.textContent = isWhitelistedUser ? "★" : "☆";
    if (isWhitelistedUser) star.classList.add("whitelisted");

    star.onclick = (e) => {
      e.stopPropagation();
      toggleWhitelist(
        user.username,
        user.full_name,
        user.profile_pic_url_hd || user.profile_pic_url,
        index
      );
    };

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "user-checkbox";
    checkbox.checked = selectedUsers.has(index);
    checkbox.onclick = (e) => e.stopPropagation();
    checkbox.onchange = () => {
      if (checkbox.checked) {
        selectedUsers.add(index);
      } else {
        selectedUsers.delete(index);
      }
      updateSelectedCount();
      saveSelections();
    };

    const avatarContainer = document.createElement("div");
    avatarContainer.className = "avatar-container";

    const userInfo = document.createElement("div");
    userInfo.className = "user-info";

    const usernameSpan = document.createElement("div");
    usernameSpan.className = "username";
    usernameSpan.textContent = `@${user.username}`;
    usernameSpan.title = `@${user.username}`;
    usernameSpan.onclick = (e) => {
      e.stopPropagation();
      chrome.tabs.create({
        url: `https://www.instagram.com/${user.username}/`,
      });
    };

    usernameSpan.onmouseenter = () =>
      showUserPreview(user.username, usernameSpan);
    usernameSpan.onmouseleave = hideUserPreview;

    const fullNameSpan = document.createElement("div");
    fullNameSpan.className = "full-name";
    fullNameSpan.textContent = user.full_name || user.username;

    userInfo.appendChild(usernameSpan);
    userInfo.appendChild(fullNameSpan);

    const actionButtons = document.createElement("div");
    actionButtons.className = "action-buttons";

    const unfollowBtn = document.createElement("button");
    unfollowBtn.className = "unfollow-btn-single";
    unfollowBtn.textContent = "Unfollow";
    unfollowBtn.disabled = isLocked;
    unfollowBtn.onclick = async (e) => {
      e.stopPropagation();
      await unfollowSingleUser(user.username, index);
    };

    actionButtons.appendChild(unfollowBtn);

    div.appendChild(star);
    div.appendChild(checkbox);
    div.appendChild(avatarContainer);
    div.appendChild(userInfo);
    div.appendChild(actionButtons);

    div.addEventListener("click", (e) => {
      if (
        !e.target.classList.contains("username") &&
        !e.target.classList.contains("whitelist-star") &&
        !e.target.classList.contains("unfollow-btn-single") &&
        !e.target.classList.contains("user-checkbox")
      ) {
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event("change"));
      }
    });
    div.classList.add("clickable-area");

    loadAvatar(
      avatarContainer,
      user.profile_pic_url_hd || user.profile_pic_url
    );

    return div;
  }

  // ==================== Scanning ====================
  async function startScan() {
    if (isScanning) return;

    isScanning = true;
    btn.disabled = true;
    btn.textContent = "⏳ Scanning...";
    list.innerHTML = "";
    resultsHeader.style.display = "none";
    bulkActions.style.display = "none";
    filtersContainer.style.display = "none";
    status.textContent = "Preparing to scan...";
    status.classList.remove("warning", "error");
    progress.style.setProperty("--progress", "0%");
    imageCache.clear();

    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab.url || !tab.url.includes("instagram.com")) {
      status.textContent = "❌ Please open Instagram first";
      btn.disabled = false;
      btn.textContent = "🔍 Scan Non-Followers";
      isScanning = false;
      return;
    }

    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: "START_SCAN",
      });

      if (response.success) {
        await displayResults(response);
      } else {
        status.textContent = `❌ Error: ${response.error}`;
      }
    } catch (error) {
      console.error("Scan error:", error);
      status.textContent = `❌ Error: ${error.message}`;
    } finally {
      btn.disabled = false;
      btn.textContent = "🔍 Scan Non-Followers";
      isScanning = false;
    }
  }

  async function displayResults(data) {
    const { followers, following, nonFollowers } = data;

    currentScanData = data;

    const filtered = nonFollowers.filter(
      (user) =>
        !isWhitelisted(user.username) && !unfollowedUsers.has(user.username)
    );
    allNonFollowers = filtered;
    filteredNonFollowers = filtered;

    stats.innerHTML = `
      <strong>Results:</strong> ${filtered.length} non-followers
      <br>
      <small>Following: ${following} | Followers: ${followers}</small>
    `;

    resultsHeader.style.display = "block";
    bulkActions.style.display = "block";
    filtersContainer.style.display = "block";

    let statusEmoji = "📊";
    let statusMessage = "";

    if (filtered.length === 0) {
      statusEmoji = "🎉";
      statusMessage = "Everyone follows you back!";
    } else {
      statusMessage = `Found ${filtered.length} user${
        filtered.length !== 1 ? "s" : ""
      } not following back`;
    }

    status.classList.remove("warning", "error");
    status.innerHTML = `<span>${statusEmoji}</span><span>${statusMessage}</span>`;
    progress.style.setProperty("--progress", "100%");

    renderUserList(filtered);
    updateSelectedCount();

    await chrome.storage.local.set({
      lastScan: Date.now(),
      scanData: data,
    });

    showLastScanInfo();
  }

  function renderUserList(users) {
    list.innerHTML = "";

    if (users.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">✨</div>
          <h3>All Clear!</h3>
          <p>Everyone you follow follows you back</p>
        </div>
      `;
      return;
    }

    users.forEach((user, index) => {
      const userElement = createUserElement(user, index);
      list.appendChild(userElement);
    });

    selectedUsers.forEach((index) => {
      const checkbox = list.querySelector(
        `[data-index="${index}"] .user-checkbox`
      );
      if (checkbox) checkbox.checked = true;
    });
  }

  // ==================== Filtering & Sorting ====================
  function toggleFilters() {
    const isVisible = filtersPanel.style.display === "block";
    filtersPanel.style.display = isVisible ? "none" : "block";
    toggleFiltersBtn.textContent = isVisible
      ? "🔍 Filters & Sort"
      : "🔍 Hide Filters";
  }

  function applyFilters() {
    const sortValue = sortFilter.value;
    const searchValue = searchFilter.value.toLowerCase().trim();

    let filtered = [...allNonFollowers];

    // Search filter
    if (searchValue) {
      filtered = filtered.filter(
        (user) =>
          user.username.toLowerCase().includes(searchValue) ||
          (user.full_name && user.full_name.toLowerCase().includes(searchValue))
      );
    }

    // Sort
    switch (sortValue) {
      case "username-asc":
        filtered.sort((a, b) => a.username.localeCompare(b.username));
        break;
      case "username-desc":
        filtered.sort((a, b) => b.username.localeCompare(a.username));
        break;
      case "name-asc":
        filtered.sort((a, b) => {
          const nameA = (a.full_name || a.username).toLowerCase();
          const nameB = (b.full_name || b.username).toLowerCase();
          return nameA.localeCompare(nameB);
        });
        break;
      case "name-desc":
        filtered.sort((a, b) => {
          const nameA = (a.full_name || a.username).toLowerCase();
          const nameB = (b.full_name || b.username).toLowerCase();
          return nameB.localeCompare(nameA);
        });
        break;
      case "default":
      default:
        // Keep original order
        break;
    }

    filteredNonFollowers = filtered;
    renderUserList(filtered);

    chrome.storage.local.set({ lastSort: sortValue });
  }

  function resetFilters() {
    sortFilter.value = "default";
    searchFilter.value = "";
    applyFilters();
  }

  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // ==================== Selection Management ====================
  function selectAll() {
    if (!currentScanData) return;

    const maxSelect = Math.min(50, filteredNonFollowers.length);
    selectedUsers.clear();

    for (let i = 0; i < maxSelect; i++) {
      selectedUsers.add(i);
      const checkbox = list.querySelector(`[data-index="${i}"] .user-checkbox`);
      if (checkbox) checkbox.checked = true;
    }

    updateSelectedCount();
    saveSelections();
  }

  function deselectAll() {
    selectedUsers.clear();
    list
      .querySelectorAll(".user-checkbox")
      .forEach((cb) => (cb.checked = false));
    updateSelectedCount();
    saveSelections();
  }

  function updateSelectedCount() {
    const count = selectedUsers.size;
    selectedCount.textContent = `Selected: ${count} user${
      count !== 1 ? "s" : ""
    }`;
    unfollowSelectedBtn.textContent = `🚫 Unfollow Selected (${count})`;
    unfollowSelectedBtn.disabled = count === 0 || isLocked || isPaused;

    if (count > 50) {
      warningMessage.textContent =
        "⚠️ Maximum 50 users can be selected at once";
      warningMessage.classList.add("error");
    } else {
      updateSafeModeUI();
      warningMessage.classList.remove("error");
    }
  }

  function saveSelections() {
    chrome.storage.local.set({ selectedUsers: Array.from(selectedUsers) });
  }

  // ==================== Unfollowing ====================
  async function unfollowSingleUser(username, index) {
    if (isLocked || isPaused) return;

    if (safeModeEnabled && sessionUnfollowCount >= SAFE_MODE_LIMIT) {
      lockUnfollows("Safe Mode: Session limit reached");
      return;
    }

    const unfollowBtn = list.querySelector(
      `[data-index="${index}"] .unfollow-btn-single`
    );
    const originalText = unfollowBtn.textContent;
    unfollowBtn.innerHTML = '<span class="loading"></span>';
    unfollowBtn.disabled = true;

    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: "UNFOLLOW_USERS",
        usernames: [username],
        safeModeEnabled,
        simulate: false,
      });

      if (response.rateLimited) {
        if (safeModeEnabled) {
          pauseProcess("Instagram warning detected - Process paused");
        } else {
          lockUnfollows("Instagram rate limit detected");
        }
        unfollowBtn.textContent = originalText;
        unfollowBtn.disabled = false;
        return;
      }

      if (response.success && response.unfollowedCount > 0) {
        sessionUnfollowCount++;
        chrome.storage.local.set({ sessionUnfollowCount });
        updateUnfollowCounter();

        unfollowedUsers.add(username);
        await chrome.storage.local.set({
          unfollowedUsers: Array.from(unfollowedUsers),
        });

        removeUserFromList(index);
        status.classList.remove("warning", "error");
        status.innerHTML = `<span>✅</span><span>Successfully unfollowed @${username}</span>`;
      } else {
        throw new Error(response.error || "Unfollow failed");
      }
    } catch (error) {
      console.error("Unfollow error:", error);
      status.classList.add("error");
      status.innerHTML = `<span>❌</span><span>Failed to unfollow @${username}</span>`;
      unfollowBtn.textContent = originalText;
      unfollowBtn.disabled = false;
    }
  }

  async function unfollowMultipleUsers() {
    if (isLocked || isPaused) return;

    const selectedIndices = Array.from(selectedUsers);
    const selectedUsernames = selectedIndices.map(
      (i) => filteredNonFollowers[i].username
    );

    if (selectedUsernames.length === 0) return;

    if (selectedUsernames.length > 50) {
      alert("⚠️ Please select maximum 50 users at a time");
      return;
    }

    if (safeModeEnabled) {
      const remaining = SAFE_MODE_LIMIT - sessionUnfollowCount;
      if (remaining <= 0) {
        lockUnfollows("Safe Mode: Session limit reached");
        return;
      }
      if (selectedUsernames.length > remaining) {
        alert(
          `⚠️ Safe Mode: Only ${remaining} unfollows remaining in this session`
        );
        return;
      }
    }

    unfollowSelectedBtn.disabled = true;
    unfollowProgress.style.display = "block";
    unfollowTotal.textContent = selectedUsernames.length;
    unfollowCurrent.textContent = "0";

    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    let currentProgress = 0;
    const updateProgress = () => {
      unfollowCurrent.textContent = currentProgress;
      unfollowSelectedBtn.textContent = `🚫 Unfollowing... (${currentProgress}/${selectedUsernames.length})`;
    };

    try {
      for (let i = 0; i < selectedUsernames.length; i++) {
        if (isPaused) {
          status.innerHTML =
            "<span>⏸️</span><span>Process paused - Resume to continue</span>";
          break;
        }

        const username = selectedUsernames[i];

        try {
          const response = await chrome.tabs.sendMessage(tab.id, {
            type: "UNFOLLOW_USERS",
            usernames: [username],
            safeModeEnabled,
            simulate: false,
          });

          if (response.rateLimited) {
            if (safeModeEnabled) {
              pauseProcess("Instagram warning detected - Process paused");
            } else {
              lockUnfollows("Instagram rate limit detected");
            }
            break;
          }

          if (response.success && response.unfollowedCount > 0) {
            currentProgress++;
            sessionUnfollowCount++;
            updateProgress();

            unfollowedUsers.add(username);

            removeUserFromList(selectedIndices[i]);
          }

          if (i < selectedUsernames.length - 1) {
            const delay = 12000 + Math.random() * 6000;
            await sleep(delay);
          }
        } catch (error) {
          console.error(`Error unfollowing ${username}:`, error);
        }
      }

      chrome.storage.local.set({
        sessionUnfollowCount,
        unfollowedUsers: Array.from(unfollowedUsers),
      });

      updateUnfollowCounter();
      selectedUsers.clear();
      updateSelectedCount();

      status.classList.remove("warning", "error");
      status.innerHTML = `<span>✅</span><span>Successfully unfollowed ${currentProgress} user${
        currentProgress !== 1 ? "s" : ""
      }</span>`;
    } catch (error) {
      console.error("Bulk unfollow error:", error);
      status.classList.add("error");
      status.innerHTML = `<span>❌</span><span>Error: ${error.message}</span>`;
    } finally {
      unfollowProgress.style.display = "none";
      if (!isLocked && !isPaused) {
        unfollowSelectedBtn.textContent = `🚫 Unfollow Selected (0)`;
        unfollowSelectedBtn.disabled = true;
      }
    }
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function removeUserFromList(index) {
    const userElement = list.querySelector(`[data-index="${index}"]`);
    if (userElement) {
      userElement.style.transition = "all 0.3s ease";
      userElement.style.opacity = "0";
      userElement.style.transform = "translateX(-20px)";

      setTimeout(() => {
        userElement.remove();

        if (currentScanData) {
          filteredNonFollowers = filteredNonFollowers.filter(
            (_, i) => i !== index
          );
          allNonFollowers = allNonFollowers.filter((u) =>
            filteredNonFollowers.some((f) => f.username === u.username)
          );

          stats.innerHTML = `
            <strong>Results:</strong> ${filteredNonFollowers.length} non-followers
            <br>
            <small>Following: ${currentScanData.following} | Followers: ${currentScanData.followers}</small>
          `;

          if (filteredNonFollowers.length === 0) {
            list.innerHTML = `
              <div class="empty-state">
                <div class="empty-icon">✨</div>
                <h3>All Clear!</h3>
                <p>Everyone you follow follows you back</p>
              </div>
            `;
            bulkActions.style.display = "none";
            filtersContainer.style.display = "none";
          }
        }

        selectedUsers.delete(index);
        updateSelectedCount();
        saveSelections();
      }, 300);
    }
  }

  // ==================== Last Scan Management ====================
  function showLastScanInfo() {
    chrome.storage.local.get(["lastScan"], (result) => {
      if (result.lastScan) {
        const date = new Date(result.lastScan);
        lastScanText.textContent = `Last scan: ${date.toLocaleString()}`;
        lastScanInfo.style.display = "flex";
      }
    });
  }

  function checkLastScan() {
    chrome.storage.local.get(["scanData", "lastScan"], (result) => {
      if (result.scanData && result.lastScan) {
        const date = new Date(result.lastScan);
        lastScanText.textContent = `Last scan: ${date.toLocaleString()}`;
        lastScanInfo.style.display = "flex";
        displayResults(result.scanData);
        status.innerHTML = `<span>💾</span><span>Loaded previous scan results</span>`;
      }
    });
  }

  function clearLastScan() {
    if (confirm("Clear previous scan results?")) {
      chrome.storage.local.remove(["scanData", "lastScan", "selectedUsers"]);
      lastScanInfo.style.display = "none";
      list.innerHTML = "";
      resultsHeader.style.display = "none";
      bulkActions.style.display = "none";
      filtersContainer.style.display = "none";
      currentScanData = null;
      allNonFollowers = [];
      filteredNonFollowers = [];
      selectedUsers.clear();
      status.innerHTML = "<span>🗑️</span><span>Scan results cleared</span>";
    }
  }

  // ==================== Auto-check Instagram ====================
  async function autoCheckInstagram() {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab.url || !tab.url.includes("instagram.com")) {
      status.innerHTML = `<span>⚠️</span><span>Please open Instagram to scan</span>`;
      btn.disabled = true;
    } else {
      btn.disabled = false;
    }
  }

  // ==================== Initialize ====================
  initialize();
});
