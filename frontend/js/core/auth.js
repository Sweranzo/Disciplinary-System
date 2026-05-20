const DEFAULT_API_ORIGIN = "http://localhost:5000";

const LucideIcons = (() => {
  const attrs = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"';
  const paths = {
    "layout-dashboard": '<rect width="7" height="9" x="3" y="3" rx="1"></rect><rect width="7" height="5" x="14" y="3" rx="1"></rect><rect width="7" height="9" x="14" y="12" rx="1"></rect><rect width="7" height="5" x="3" y="16" rx="1"></rect>',
    scale: '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"></path><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"></path><path d="M7 21h10"></path><path d="M12 3v18"></path><path d="M3 7h2c2 0 5-1 7-3 2 2 5 3 7 3h2"></path>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>',
    "calendar-days": '<path d="M8 2v4"></path><path d="M16 2v4"></path><rect width="18" height="18" x="3" y="4" rx="2"></rect><path d="M3 10h18"></path><path d="M8 14h.01"></path><path d="M12 14h.01"></path><path d="M16 14h.01"></path><path d="M8 18h.01"></path><path d="M12 18h.01"></path><path d="M16 18h.01"></path>',
    "file-warning": '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path><path d="M14 2v4a2 2 0 0 0 2 2h4"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path>',
    "folder-open": '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6A2 2 0 0 1 18.46 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"></path>',
    bell: '<path d="M10.27 21a2 2 0 0 0 3.46 0"></path><path d="M3.26 15.33A2 2 0 0 0 5 18h14a2 2 0 0 0 1.74-2.67C20.22 13.98 19 13 19 10a7 7 0 1 0-14 0c0 3-1.22 3.98-1.74 5.33Z"></path>',
    settings: '<path d="M9.67 2.93a2.25 2.25 0 0 1 4.66 0 2.25 2.25 0 0 0 3.38 1.46 2.25 2.25 0 0 1 2.33 4.04 2.25 2.25 0 0 0 0 3.9 2.25 2.25 0 0 1-2.33 4.04 2.25 2.25 0 0 0-3.38 1.46 2.25 2.25 0 0 1-4.66 0 2.25 2.25 0 0 0-3.38-1.46 2.25 2.25 0 0 1-2.33-4.04 2.25 2.25 0 0 0 0-3.9 2.25 2.25 0 0 1 2.33-4.04 2.25 2.25 0 0 0 3.38-1.46Z"></path><circle cx="12" cy="12" r="3"></circle>',
    menu: '<line x1="4" x2="20" y1="12" y2="12"></line><line x1="4" x2="20" y1="6" y2="6"></line><line x1="4" x2="20" y1="18" y2="18"></line>',
    search: '<circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path>',
    "user-round": '<circle cx="12" cy="8" r="5"></circle><path d="M20 21a8 8 0 0 0-16 0"></path>',
    "shield-check": '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1Z"></path><path d="m9 12 2 2 4-4"></path>',
    "clipboard-list": '<rect width="8" height="4" x="8" y="2" rx="1"></rect><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><path d="M12 11h4"></path><path d="M12 16h4"></path><path d="M8 11h.01"></path><path d="M8 16h.01"></path>',
    "file-text": '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path><path d="M14 2v4a2 2 0 0 0 2 2h4"></path><path d="M10 9H8"></path><path d="M16 13H8"></path><path d="M16 17H8"></path>',
    "life-buoy": '<circle cx="12" cy="12" r="10"></circle><path d="m4.93 4.93 4.24 4.24"></path><path d="m14.83 9.17 4.24-4.24"></path><path d="m14.83 14.83 4.24 4.24"></path><path d="m9.17 14.83-4.24 4.24"></path><circle cx="12" cy="12" r="4"></circle>',
    chevronDown: '<path d="m6 9 6 6 6-6"></path>',
    chevronLeft: '<path d="m15 18-6-6 6-6"></path>',
    chevronRight: '<path d="m9 18 6-6-6-6"></path>',
    "book-open": '<path d="M12 7v14"></path><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"></path>'
  };

  function svg(name, className = "") {
    const body = paths[name] || paths["layout-dashboard"];
    return `<svg class="lucide-icon ${className}" ${attrs}>${body}</svg>`;
  }

  return { svg };
})();

window.LucideIcons = LucideIcons;

function saveAuth(data) {
  localStorage.setItem("token", data.token);
  localStorage.setItem("user", JSON.stringify(data.user));
  localStorage.setItem("lastLoginAt", new Date().toISOString());
}

function setUser(user) {
  localStorage.setItem("user", JSON.stringify(user));
}

function getUser() {
  const raw = localStorage.getItem("user");
  return raw ? JSON.parse(raw) : null;
}

function getToken() {
  return localStorage.getItem("token");
}

function getApiOrigin() {
  if (typeof API_BASE_URL === "string" && API_BASE_URL.startsWith("http")) {
    return API_BASE_URL.replace(/\/api\/?$/, "");
  }

  return DEFAULT_API_ORIGIN;
}

function buildFrontendPageUrl(target) {
  const marker = "/frontend/pages/";
  const normalizedPath = window.location.pathname.replace(/\\/g, "/");
  const markerIndex = normalizedPath.lastIndexOf(marker);

  if (markerIndex >= 0) {
    const rootPath = normalizedPath.slice(0, markerIndex + marker.length);
    if (window.location.protocol === "file:") {
      return `${rootPath}${target}`;
    }
    return `${window.location.origin}${rootPath}${target}`;
  }

  if (window.location.protocol === "file:") {
    return target;
  }

  return `${window.location.origin}/${target}`;
}

let transitionTimeoutId = null;

function goToPage(target) {
  beginPageTransition(buildFrontendPageUrl(target));
}

function ensureTransitionVeil() {
  let veil = document.querySelector(".page-transition-veil");
  if (veil) {
    return veil;
  }

  veil = document.createElement("div");
  veil.className = "page-transition-veil";
  veil.innerHTML = `
    <div class="page-transition-card">
      <img src="${getBrandAssetUrl()}" alt="Philtech-GMA logo">
      <div class="page-transition-copy">
        <strong>Philtech-GMA Disciplinary System</strong>
        <span>Loading workspace...</span>
      </div>
      <div class="page-transition-spinner" aria-hidden="true"></div>
    </div>
  `;
  document.body.appendChild(veil);
  return veil;
}

function beginPageTransition(targetUrl) {
  if (!targetUrl) {
    return;
  }

  const currentUrl = window.location.href;
  const resolvedTarget = new URL(targetUrl, window.location.href).href;
  if (resolvedTarget === currentUrl) {
    return;
  }

  if (transitionTimeoutId) {
    clearTimeout(transitionTimeoutId);
  }

  const veil = ensureTransitionVeil();
  document.body.classList.add("page-transitioning");
  veil.classList.add("is-visible");

  transitionTimeoutId = setTimeout(() => {
    window.location.href = resolvedTarget;
  }, 170);
}

function getBrandAssetUrl() {
  const stylesheet = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .find(link => (link.getAttribute("href") || "").includes("styles.css"));

  if (!stylesheet) {
    return "../../Philtech-logo.png";
  }

  try {
    return new URL("../Philtech-logo.png", stylesheet.href).href;
  } catch (error) {
    return "../../Philtech-logo.png";
  }
}

function getPrimaryTopbars() {
  const selectors = [
    ".dashboard-container > .topbar",
    ".main-content > .topbar",
    "body > .topbar"
  ];

  const seen = new Set();
  const results = [];

  selectors.forEach(selector => {
    document.querySelectorAll(selector).forEach(element => {
      if (!seen.has(element)) {
        seen.add(element);
        results.push(element);
      }
    });
  });

  return results;
}

function getPageTitleText() {
  const path = window.location.pathname.replace(/\\/g, "/");
  if (path.endsWith("/dashboard.html")) {
    return "Dashboard";
  }

  return document.querySelector(".dashboard-container > .topbar h1")?.textContent?.trim()
    || document.querySelector("h1")?.textContent?.trim()
    || document.title.replace(/\s*\|\s*.*/, "").trim()
    || "Workspace";
}

function getPageSubtitleText(user) {
  const path = window.location.pathname.replace(/\\/g, "/");
  if (path.endsWith("/dashboard.html")) {
    return `Welcome back, ${getUserFullName(user)}. Here's what's happening today.`;
  }

  return document.querySelector(".dashboard-container > .topbar p")?.textContent?.trim()
    || "Manage records, activity, and student support workflows.";
}

function getAvatarUrl(user) {
  if (!user || !user.avatar_url) {
    return "";
  }

  if (/^https?:\/\//i.test(user.avatar_url)) {
    return user.avatar_url;
  }

  return `${getApiOrigin()}${user.avatar_url}`;
}

function getUserFullName(user) {
  if (!user) {
    return "Account User";
  }

  return user.full_name
    || [user.first_name, user.middle_name, user.last_name].filter(Boolean).join(" ").replace(/\s+/g, " ").trim()
    || user.username
    || "Account User";
}

function getRoleLabel(role = "") {
  return role
    .split("_")
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getInitials(user) {
  const first = user?.first_name?.[0] || user?.username?.[0] || "U";
  const last = user?.last_name?.[0] || "";
  return `${first}${last}`.toUpperCase();
}

function getDashboardPath(role) {
  switch (role) {
    case "admin":
      return "admin/dashboard.html";
    case "teacher":
      return "teacher/dashboard.html";
    case "discipline_officer":
      return "discipline/dashboard.html";
    case "guidance_counselor":
      return "counselor/dashboard.html";
    case "student":
      return "student/dashboard.html";
    case "parent":
      return "parent/dashboard.html";
    default:
      return "auth/login.html";
  }
}

function getRoleNavItems(role) {
  switch (role) {
    case "admin":
      return [
        { label: "Dashboard", path: "admin/dashboard.html" },
        { label: "Case Center", path: "admin/cases.html" },
        { label: "Student Records", path: "admin/students.html" },
        { label: "Accounts", path: "admin/accounts.html" },
        { label: "Audit Log", path: "admin/audit.html" },
        { label: "Hearings", path: "admin/hearings.html" },
        { label: "Sanctions", path: "admin/sanctions.html" },
        { label: "Appeals", path: "admin/appeals.html" },
        { label: "Evidence", path: "admin/evidence.html" },
        { label: "Notifications", path: "common/notifications.html" }
      ];
    case "discipline_officer":
      return [
        { label: "Dashboard", path: "discipline/dashboard.html" },
        { label: "Case Center", path: "discipline/cases.html" },
        { label: "Hearings", path: "discipline/hearings.html" },
        { label: "Sanctions", path: "discipline/sanctions.html" },
        { label: "Appeals", path: "discipline/appeals.html" },
        { label: "Evidence", path: "discipline/evidence.html" },
        { label: "Notifications", path: "common/notifications.html" }
      ];
    case "guidance_counselor":
      return [
        { label: "Dashboard", path: "counselor/dashboard.html" },
        { label: "Cases", path: "counselor/cases.html" },
        { label: "Hearings", path: "counselor/hearings.html" },
        { label: "Sanctions", path: "counselor/sanctions.html" },
        { label: "Appeals", path: "counselor/appeals.html" },
        { label: "Evidence", path: "counselor/evidence.html" },
        { label: "Student Profiles", path: "counselor/student-profile.html" },
        { label: "Notifications", path: "common/notifications.html" }
      ];
    case "teacher":
      return [
        { label: "Dashboard", path: "teacher/dashboard.html" },
        { label: "Report Incident", path: "teacher/report-case.html" },
        { label: "My Cases", path: "teacher/cases.html" },
        { label: "Notifications", path: "common/notifications.html" }
      ];
    case "student":
      return [
        { label: "Dashboard", path: "student/dashboard.html" },
        { label: "Profile", path: "student/profile.html" },
        { label: "Cases", path: "student/cases.html" },
        { label: "Hearings", path: "student/hearings.html" },
        { label: "Sanctions", path: "student/sanctions.html" },
        { label: "Appeals", path: "student/appeals.html" },
        { label: "Notifications", path: "common/notifications.html" }
      ];
    case "parent":
      return [
        { label: "Dashboard", path: "parent/dashboard.html" },
        { label: "Cases", path: "parent/cases.html" },
        { label: "Hearings", path: "parent/hearings.html" },
        { label: "Sanctions", path: "parent/sanctions.html" },
        { label: "Notifications", path: "common/notifications.html" }
      ];
    default:
      return [];
  }
}

function getRoleProfilePath(role) {
  switch (role) {
    case "student":
      return "student/profile.html";
    default:
      return "common/profile-settings.html";
  }
}

function isSharedAppPage(pathname = window.location.pathname.replace(/\\/g, "/")) {
  return pathname.includes("/frontend/pages/")
    && !pathname.includes("/frontend/pages/auth/");
}

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  goToPage("auth/login.html");
}

function requireAuth() {
  const token = getToken();
  if (!token) {
    goToPage("auth/login.html");
  }
}

function redirectByRole(user) {
  goToPage(getDashboardPath(user.role));
}

function injectBranding() {
  if (document.querySelector(".app-top-header") || isSharedAppPage()) {
    return;
  }

  const brandAssetUrl = getBrandAssetUrl();

  getPrimaryTopbars().forEach(topbar => {
    if (topbar.dataset.brandInjected === "true") {
      return;
    }

    const primaryBlock = topbar.firstElementChild;
    if (!primaryBlock) {
      return;
    }

    const brand = document.createElement("div");
    brand.className = "brand-lockup";
    brand.innerHTML = `
      <img src="${brandAssetUrl}" alt="Philtech-GMA logo">
      <div class="brand-copy">
        <strong>Philtech-GMA</strong>
        <span>College / SHS Disciplinary System</span>
      </div>
    `;

    if (/^H[1-6]$/i.test(primaryBlock.tagName)) {
      const wrapper = document.createElement("div");
      wrapper.className = "brand-host";
      topbar.insertBefore(wrapper, primaryBlock);
      wrapper.appendChild(brand);
      wrapper.appendChild(primaryBlock);
    } else {
      primaryBlock.classList.add("brand-host");
      primaryBlock.prepend(brand);
    }

    topbar.dataset.brandInjected = "true";
  });
}

function closeAllProfileMenus() {
  document.querySelectorAll(".profile-menu.is-open").forEach(menu => menu.classList.remove("is-open"));
  document.querySelectorAll(".profile-trigger[aria-expanded='true']").forEach(trigger => trigger.setAttribute("aria-expanded", "false"));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function closeAllNotificationMenus() {
  document.querySelectorAll(".notification-menu.is-open").forEach(menu => menu.classList.remove("is-open"));
  document.querySelectorAll(".notification-trigger[aria-expanded='true']").forEach(trigger => trigger.setAttribute("aria-expanded", "false"));
}

function createProfileTrigger(user) {
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "profile-trigger";
  trigger.setAttribute("aria-expanded", "false");

  const avatarUrl = getAvatarUrl(user);
  const avatarMarkup = avatarUrl
    ? `<span class="profile-avatar has-image"><img src="${avatarUrl}" alt="${getUserFullName(user)} avatar"></span>`
    : `<span class="profile-avatar">${getInitials(user)}</span>`;

  trigger.innerHTML = `
    ${avatarMarkup}
    <span class="profile-trigger-copy">
      <strong>${getUserFullName(user)}</strong>
      <span>${user.role_label || getRoleLabel(user.role)}</span>
    </span>
    <span class="profile-caret">${LucideIcons.svg("chevronDown")}</span>
  `;

  return trigger;
}

function createProfileMenu(user) {
  const menu = document.createElement("div");
  menu.className = "profile-menu";
  menu.innerHTML = `
    <div class="profile-menu-card">
      <div class="profile-menu-head">
        <div class="profile-menu-title">${getUserFullName(user)}</div>
        <div class="profile-menu-subtitle">${user.role_label || getRoleLabel(user.role)}</div>
      </div>
      <button type="button" class="profile-menu-link" data-profile-target="${getRoleProfilePath(user.role)}">Open Profile</button>
      <button type="button" class="profile-menu-link" data-settings-target="common/profile-settings.html">Profile Settings</button>
      <button type="button" class="profile-menu-link danger" data-logout="true">Logout</button>
    </div>
  `;

  menu.addEventListener("click", event => {
    const profileButton = event.target.closest("[data-profile-target]");
    const settingsButton = event.target.closest("[data-settings-target]");
    const logoutButton = event.target.closest("[data-logout]");

    if (profileButton) {
      goToPage(profileButton.dataset.profileTarget);
      return;
    }

    if (settingsButton) {
      goToPage(settingsButton.dataset.settingsTarget);
      return;
    }

    if (logoutButton) {
      logout();
    }
  });

  return menu;
}

function createNotificationsButton(user) {
  const wrapper = document.createElement("div");
  wrapper.className = "notification-menu-wrap";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "notification-trigger";
  trigger.setAttribute("aria-label", "Open notifications");
  trigger.setAttribute("aria-expanded", "false");
  trigger.innerHTML = `
    <span class="notification-icon">${LucideIcons.svg("bell")}</span>
    <span class="notification-count hidden" data-notification-count>0</span>
  `;

  const menu = document.createElement("div");
  menu.className = "notification-menu";
  menu.innerHTML = `
    <div class="notification-menu-card">
      <div class="notification-menu-head">
        <div>
          <strong>Notifications</strong>
          <span data-notification-subtitle>Latest updates</span>
        </div>
        <button type="button" class="notification-menu-link" data-notification-read-all>Mark all read</button>
      </div>
      <div class="notification-menu-list" data-notification-list>
        <div class="notification-menu-empty">Loading notifications...</div>
      </div>
      <div class="notification-menu-foot">
        <button type="button" class="notification-menu-link danger" data-notification-clear>Clear all</button>
        <button type="button" class="notification-menu-link" data-notification-center>Open center</button>
      </div>
    </div>
  `;

  trigger.addEventListener("click", event => {
    event.stopPropagation();
    const isOpen = menu.classList.contains("is-open");
    closeAllProfileMenus();
    closeAllNotificationMenus();
    if (!isOpen) {
      menu.classList.add("is-open");
      trigger.setAttribute("aria-expanded", "true");
      loadNotificationMenu(menu);
    }
  });

  menu.addEventListener("click", event => {
    event.stopPropagation();
    handleNotificationMenuAction(event, menu);
  });

  wrapper.appendChild(trigger);
  wrapper.appendChild(menu);
  return wrapper;
}

function formatNotificationTime(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function updateNotificationCounts(unreadCount = 0) {
  document.querySelectorAll("[data-notification-count], #globalNotificationCount").forEach(countNode => {
    countNode.textContent = String(unreadCount);
    countNode.classList.toggle("hidden", Number(unreadCount) <= 0);
  });
}

function renderNotificationMenu(menu, notifications = []) {
  const list = menu.querySelector("[data-notification-list]");
  const subtitle = menu.querySelector("[data-notification-subtitle]");
  const unreadCount = notifications.filter(item => !Number(item.is_read)).length;

  updateNotificationCounts(unreadCount);
  if (subtitle) {
    subtitle.textContent = unreadCount ? `${unreadCount} unread` : "You're all caught up";
  }

  if (!list) {
    return;
  }

  if (!notifications.length) {
    list.innerHTML = `<div class="notification-menu-empty">No notifications yet.</div>`;
    return;
  }

  list.innerHTML = notifications.map(item => {
    const unread = !Number(item.is_read);
    return `
      <article class="notification-menu-item ${unread ? "unread" : ""}" data-notification-id="${item.id}">
        <div class="notification-menu-dot" aria-hidden="true"></div>
        <div class="notification-menu-body">
          <div class="notification-menu-title-row">
            <strong>${escapeHtml(item.title || "Notification")}</strong>
            <span>${formatNotificationTime(item.created_at)}</span>
          </div>
          <p>${escapeHtml(item.message || "")}</p>
          <div class="notification-menu-actions">
            ${unread ? `<button type="button" data-notification-read="${item.id}">Mark as read</button>` : `<span>Read</span>`}
            <button type="button" class="danger" data-notification-delete="${item.id}">Delete</button>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

async function loadNotificationMenu(menu) {
  const list = menu.querySelector("[data-notification-list]");
  if (list) {
    list.innerHTML = `<div class="notification-menu-empty">Loading notifications...</div>`;
  }

  try {
    const response = await fetch(`${getApiOrigin()}/api/auth/notifications`, {
      headers: {
        Authorization: `Bearer ${getToken()}`
      }
    });
    const data = await response.json();
    if (!data.success) {
      if (list) list.innerHTML = `<div class="notification-menu-empty">${data.message || "Unable to load notifications."}</div>`;
      return;
    }
    renderNotificationMenu(menu, data.notifications || []);
  } catch (error) {
    console.error("Unable to load notifications:", error);
    if (list) list.innerHTML = `<div class="notification-menu-empty">Unable to load notifications.</div>`;
  }
}

async function notificationRequest(endpoint, method = "GET") {
  const response = await fetch(`${getApiOrigin()}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${getToken()}`
    }
  });
  return response.json();
}

async function handleNotificationMenuAction(event, menu) {
  const readButton = event.target.closest("[data-notification-read]");
  const deleteButton = event.target.closest("[data-notification-delete]");
  const readAllButton = event.target.closest("[data-notification-read-all]");
  const clearButton = event.target.closest("[data-notification-clear]");
  const centerButton = event.target.closest("[data-notification-center]");

  if (readButton) {
    const result = await notificationRequest(`/api/auth/notifications/${readButton.dataset.notificationRead}/read`, "PUT");
    if (result.success) await loadNotificationMenu(menu);
    return;
  }

  if (deleteButton) {
    const result = await notificationRequest(`/api/auth/notifications/${deleteButton.dataset.notificationDelete}`, "DELETE");
    if (result.success) await loadNotificationMenu(menu);
    return;
  }

  if (readAllButton) {
    const result = await notificationRequest("/api/auth/notifications/read-all", "PUT");
    if (result.success) await loadNotificationMenu(menu);
    return;
  }

  if (clearButton) {
    const result = await notificationRequest("/api/auth/notifications", "DELETE");
    if (result.success) await loadNotificationMenu(menu);
    return;
  }

  if (centerButton) {
    goToPage("common/notifications.html");
  }
}

function formatSessionDate(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function injectAppHeader(user) {
  if (!user || document.querySelector(".app-top-header") || !isSharedAppPage()) {
    return;
  }

  const header = document.createElement("header");
  header.className = "app-top-header";
  header.innerHTML = `
    <div class="app-top-title">
      <button type="button" class="app-menu-button" aria-label="Menu">${LucideIcons.svg("menu")}</button>
      <div>
        <h1>${getPageTitleText()}</h1>
        <p>${getPageSubtitleText(user)}</p>
      </div>
    </div>
    <label class="app-search" aria-label="Search workspace">
      <span>${LucideIcons.svg("search")}</span>
      <input type="search" placeholder="Search cases, students, hearings...">
    </label>
    <div class="app-top-actions"></div>
  `;

  const actions = header.querySelector(".app-top-actions");
  const notificationsButton = createNotificationsButton(user);
  const trigger = createProfileTrigger(user);
  const menu = createProfileMenu(user);
  const wrapper = document.createElement("div");
  wrapper.className = "profile-menu-wrap";
  wrapper.appendChild(trigger);
  wrapper.appendChild(menu);
  actions.appendChild(notificationsButton);
  actions.appendChild(wrapper);

  trigger.addEventListener("click", event => {
    event.stopPropagation();
    const isOpen = menu.classList.contains("is-open");
    closeAllProfileMenus();
    if (!isOpen) {
      menu.classList.add("is-open");
      trigger.setAttribute("aria-expanded", "true");
    }
  });

  const sidebar = document.querySelector(".app-sidebar");
  if (sidebar) {
    sidebar.insertAdjacentElement("afterend", header);
  } else {
    document.body.prepend(header);
  }
}

function getNavIconName(item) {
  const value = `${item.label || ""} ${item.path || ""}`.toLowerCase();
  if (value.includes("dashboard")) return "layout-dashboard";
  if (value.includes("case")) return "scale";
  if (value.includes("student") || value.includes("account") || value.includes("users")) return "users";
  if (value.includes("hearing")) return "calendar-days";
  if (value.includes("appeal")) return "file-warning";
  if (value.includes("evidence")) return "folder-open";
  if (value.includes("notification")) return "bell";
  if (value.includes("setting")) return "settings";
  if (value.includes("audit")) return "clipboard-list";
  if (value.includes("sanction")) return "shield-check";
  if (value.includes("report")) return "file-text";
  if (value.includes("profile")) return "user-round";
  return "layout-dashboard";
}

function getMetricIconName(metric) {
  const value = `${metric.icon || ""} ${metric.label || ""}`.toLowerCase();
  if (value.includes("student") || value.includes("st")) return "users";
  if (value.includes("hearing") || value.includes("meeting") || value.includes("calendar") || value.includes("mt")) return "calendar-days";
  if (value.includes("appeal") || value.includes("ap")) return "file-warning";
  if (value.includes("sanction")) return "shield-check";
  if (value.includes("evidence")) return "folder-open";
  if (value.includes("case") || value.includes("cs")) return "scale";
  return "layout-dashboard";
}

function enhanceTopbarUser(topbar, user) {
  if (!topbar || topbar.dataset.profileInjected === "true") {
    return;
  }

  let container = topbar.querySelector(".topbar-user");
  const actionRow = topbar.querySelector(".action-row") || topbar.lastElementChild;
  let existingLogoutButton = null;

  if (!container) {
    if (!actionRow) {
      return;
    }

    container = document.createElement("div");
    container.className = "topbar-user topbar-user-inline";
    actionRow.prepend(container);
  } else {
    existingLogoutButton = Array.from(container.querySelectorAll("button"))
      .find(button => /logout/i.test(button.textContent || ""));
    container.innerHTML = "";
  }

  const trigger = createProfileTrigger(user);
  const menu = createProfileMenu(user);
  const notificationsButton = createNotificationsButton(user);
  const wrapper = document.createElement("div");
  wrapper.className = "profile-menu-wrap";
  wrapper.appendChild(trigger);
  wrapper.appendChild(menu);
  container.appendChild(notificationsButton);
  container.appendChild(wrapper);

  if (existingLogoutButton) {
    existingLogoutButton.remove();
  }

  if (actionRow) {
    Array.from(actionRow.children).forEach(node => {
      const isStandaloneButton =
        node.matches?.("button")
        && !node.classList?.contains("topbar-user")
        && !node.querySelector?.(".profile-menu")
        && /logout/i.test((node.textContent || "").trim());

      const nestedButton = node.matches?.("a") ? node.querySelector("button") : null;
      const linkText = (nestedButton?.textContent || node.textContent || "").trim();
      const isStandaloneLink =
        node.matches?.("a")
        && !node.classList?.contains("topbar-user")
        && !node.querySelector?.(".profile-menu")
        && /logout/i.test(linkText);

      if (isStandaloneButton || isStandaloneLink) {
        node.remove();
      }
    });
  }

  trigger.addEventListener("click", event => {
    event.stopPropagation();
    const isOpen = menu.classList.contains("is-open");
    closeAllProfileMenus();
    if (!isOpen) {
      menu.classList.add("is-open");
      trigger.setAttribute("aria-expanded", "true");
    }
  });

  topbar.dataset.profileInjected = "true";
}

function stripTopbarLogout(topbar) {
  const actionRow = topbar?.querySelector(".action-row");
  if (!actionRow) {
    return;
  }

  Array.from(actionRow.children).forEach(node => {
    const text = (node.textContent || "").trim();
    const isLogoutButton = node.matches?.("button") && /logout/i.test(text);
    const isLogoutLink = node.matches?.("a") && /logout/i.test(text);
    if (isLogoutButton || isLogoutLink) {
      node.remove();
    }
  });
}

function enhanceDashboardProfile(user) {
  const card = document.querySelector(".dash-profile-card");
  if (!card || !user || card.dataset.profileInjected === "true" || document.querySelector(".app-top-header")) {
    return;
  }

  const legacyProfileRow = card.querySelector(".dash-profile-row");
  if (legacyProfileRow) {
    legacyProfileRow.remove();
  }

  const toolbar = document.createElement("div");
  toolbar.className = "dash-profile-tools";

  const notificationsButton = createNotificationsButton(user);
  const trigger = createProfileTrigger(user);
  const menu = createProfileMenu(user);
  const wrapper = document.createElement("div");
  wrapper.className = "profile-menu-wrap";
  wrapper.appendChild(trigger);
  wrapper.appendChild(menu);

  toolbar.appendChild(notificationsButton);
  toolbar.appendChild(wrapper);
  card.prepend(toolbar);

  trigger.addEventListener("click", event => {
    event.stopPropagation();
    const isOpen = menu.classList.contains("is-open");
    closeAllProfileMenus();
    if (!isOpen) {
      menu.classList.add("is-open");
      trigger.setAttribute("aria-expanded", "true");
    }
  });

  card.dataset.profileInjected = "true";
}

function moveTopbarActionsBelow(topbar) {
  if (!topbar || topbar.dataset.navLifted === "true") {
    return;
  }

  const actionRow = topbar.querySelector(".action-row");
  if (!actionRow) {
    return;
  }

  const movableNodes = Array.from(actionRow.children).filter(node => {
    if (node.classList?.contains("topbar-user")) {
      return false;
    }

    if (node.matches?.("button") && /logout/i.test(node.textContent || "")) {
      return false;
    }

    if (node.matches?.("a") && /logout/i.test(node.textContent || "")) {
      return false;
    }

    return true;
  });

  if (movableNodes.length === 0) {
    topbar.dataset.navLifted = "true";
    return;
  }

  const existingQuickActions = topbar.parentElement?.querySelector(".hero-panel .quick-actions");
  if (existingQuickActions) {
    movableNodes.forEach(node => {
      const button = node.matches?.("a, button") ? node : null;
      if (!button) {
        return;
      }

      const nestedButton = button.matches("a") ? button.querySelector("button") : button;
      if (nestedButton) {
        nestedButton.classList.add("secondary");
      }

      existingQuickActions.appendChild(button);
    });

    if (!Array.from(actionRow.children).some(node => node.classList?.contains("topbar-user") || /logout/i.test(node.textContent || ""))) {
      actionRow.remove();
    }

    topbar.dataset.navLifted = "true";
    return;
  }

  const navStrip = document.createElement("div");
  navStrip.className = "topbar-nav-strip page-section";

  const navWrap = document.createElement("div");
  navWrap.className = "action-row topbar-nav-actions";
  navStrip.appendChild(navWrap);

  movableNodes.forEach(node => navWrap.appendChild(node));
  topbar.insertAdjacentElement("afterend", navStrip);

  if (!Array.from(actionRow.children).some(node => node.classList?.contains("topbar-user") || /logout/i.test(node.textContent || ""))) {
    actionRow.remove();
  }

  topbar.dataset.navLifted = "true";
}

function injectSidebar(user) {
  if (!user || !user.role || document.querySelector(".app-sidebar")) {
    return;
  }

  const pathname = window.location.pathname.replace(/\\/g, "/");
  if (!isSharedAppPage(pathname)) {
    return;
  }

  const navItems = getRoleNavItems(user.role);
  if (!navItems.length) {
    return;
  }

  document.body.classList.add("has-app-sidebar");

  const groupedNav = user.role === "admin"
    ? navItems.map((item, index) => {
        const labels = {
          0: "Main",
          1: "Case Management",
          5: "Administration",
          9: "System"
        };
        return { ...item, groupLabel: labels[index] || "" };
      })
    : navItems.map((item, index) => ({ ...item, groupLabel: index === 0 ? "Main" : "" }));

  const aside = document.createElement("aside");
  aside.className = "app-sidebar";
  aside.innerHTML = `
    <div class="app-sidebar-brand">
      <img src="${getBrandAssetUrl()}" alt="Philtech-GMA logo">
      <div class="app-sidebar-brand-copy">
        <strong>Philtech-GMA</strong>
        <span>${user.role_label || getRoleLabel(user.role)}</span>
      </div>
    </div>
    <nav class="app-sidebar-nav">
      ${groupedNav.map(item => {
        const href = buildFrontendPageUrl(item.path);
        const isActive = pathname.endsWith(item.path);
        const groupLabel = item.groupLabel ? `<div class="app-sidebar-group-label">${item.groupLabel}</div>` : "";
        return `${groupLabel}<a href="${href}" class="app-sidebar-link${isActive ? " active" : ""}">${LucideIcons.svg(getNavIconName(item))}<span>${item.label}</span></a>`;
      }).join("")}
    </nav>
    <div class="app-sidebar-support">${LucideIcons.svg("life-buoy")}<span>Help & Support</span></div>
  `;

  document.body.prepend(aside);
}

function initializeRevealOnScroll() {
  const targets = document.querySelectorAll(
    ".topbar, .card, .stat-card, .hero-panel, .summary-chip, .summary-card-compact, .detail-item, .case-hero-panel"
  );

  targets.forEach((element, index) => {
    element.classList.add("reveal-on-scroll");
    element.style.transitionDelay = `${Math.min(index * 35, 240)}ms`;
  });

  if (!("IntersectionObserver" in window)) {
    targets.forEach(element => element.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.08,
    rootMargin: "0px 0px -40px 0px"
  });

  targets.forEach(element => observer.observe(element));
}

function animateCountUp(element) {
  const rawText = (element.textContent || "").trim();
  const finalValue = Number(rawText.replace(/[^0-9.-]/g, ""));

  if (!Number.isFinite(finalValue) || finalValue <= 0 || element.dataset.countAnimated === "true") {
    element.classList.add("count-up-ready");
    return;
  }

  const duration = 900;
  const startTime = performance.now();
  element.dataset.countAnimated = "true";
  element.classList.add("count-up-ready");

  function step(timestamp) {
    const progress = Math.min((timestamp - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = String(Math.round(finalValue * eased));
    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      element.textContent = String(finalValue);
    }
  }

  requestAnimationFrame(step);
}

function initializeAnimatedMetrics() {
  document.querySelectorAll(".stat-value, .summary-chip span, .summary-card-compact span").forEach(element => {
    const runAnimation = () => animateCountUp(element);

    if (!("IntersectionObserver" in window)) {
      runAnimation();
      return;
    }

    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          runAnimation();
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.5
    });

    observer.observe(element);
  });
}

function primeSharedLayoutShell() {
  const cachedUser = getUser();
  if (!cachedUser || !cachedUser.role || !isSharedAppPage()) {
    return;
  }

  document.body.classList.add("has-app-sidebar", "page-shell-pending");
  injectSidebar(cachedUser);
  ensureTransitionVeil();
}

async function refreshCurrentUser() {
  const token = getToken();
  if (!token) {
    return null;
  }

  try {
    const response = await fetch(`${getApiOrigin()}/api/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await response.json();
    if (data.success && data.user) {
      setUser(data.user);
      return data.user;
    }
  } catch (error) {
    console.error("Unable to refresh current user:", error);
  }

  return getUser();
}

async function refreshNotificationBadge() {
  const token = getToken();
  if (!token) {
    return;
  }

  try {
    const response = await fetch(`${getApiOrigin()}/api/auth/notifications`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await response.json();
    if (!data.success) {
      return;
    }

    const unreadCount = Number(data.unreadCount || 0);
    updateNotificationCounts(unreadCount);
  } catch (error) {
    console.error("Unable to refresh notification badge:", error);
  }
}

async function initializeSharedTopbar() {
  injectBranding();
  const cachedUser = getUser();

  if (cachedUser) {
    injectSidebar(cachedUser);
    injectAppHeader(cachedUser);
    enhanceDashboardProfile(cachedUser);

    getPrimaryTopbars().forEach(topbar => {
      stripTopbarLogout(topbar);
      if (!document.querySelector(".app-top-header")) {
        enhanceTopbarUser(topbar, cachedUser);
      }
      moveTopbarActionsBelow(topbar);
    });
  }

  const refreshedUser = await refreshCurrentUser();
  if (!cachedUser && refreshedUser) {
    injectSidebar(refreshedUser);
    injectAppHeader(refreshedUser);
    enhanceDashboardProfile(refreshedUser);

    getPrimaryTopbars().forEach(topbar => {
      stripTopbarLogout(topbar);
      if (!document.querySelector(".app-top-header")) {
        enhanceTopbarUser(topbar, refreshedUser);
      }
      moveTopbarActionsBelow(topbar);
    });
  }

  refreshNotificationBadge();
  initializeRevealOnScroll();
  initializeAnimatedMetrics();

  const veil = ensureTransitionVeil();

  requestAnimationFrame(() => {
    setTimeout(() => {
      document.body.classList.add("page-ready");
      document.body.classList.remove("page-shell-pending");
      veil.classList.remove("is-visible");
    }, 120);
  });
}

document.addEventListener("click", event => {
  const nestedButton = event.target.closest("a[href] > button");
  if (nestedButton) {
    event.preventDefault();
    const link = nestedButton.parentElement;
    if (link && link.getAttribute("href")) {
      beginPageTransition(link.href);
    }
    return;
  }

  const link = event.target.closest("a[href]");
  if (link) {
    const href = link.getAttribute("href");
    const target = link.getAttribute("target");
    let resolvedHref = null;

    try {
      resolvedHref = new URL(link.href, window.location.href);
    } catch (error) {
      resolvedHref = null;
    }

    const isSameOriginAppLink = resolvedHref
      && resolvedHref.origin === window.location.origin
      && resolvedHref.pathname.includes("/frontend/pages/");

    if (
      href
      && !href.startsWith("#")
      && !/^mailto:/i.test(href)
      && !/^tel:/i.test(href)
      && (!/^https?:\/\//i.test(href) || isSameOriginAppLink)
      && (!target || target === "_self")
    ) {
      event.preventDefault();
      beginPageTransition(resolvedHref ? resolvedHref.href : link.href);
      return;
    }
  }

  if (!event.target.closest(".profile-menu-wrap")) {
    closeAllProfileMenus();
  }

  if (!event.target.closest(".notification-menu-wrap")) {
    closeAllNotificationMenus();
  }
});

primeSharedLayoutShell();
document.addEventListener("DOMContentLoaded", initializeSharedTopbar);

window.saveAuth = saveAuth;
window.setUser = setUser;
window.getUser = getUser;
window.getToken = getToken;
window.logout = logout;
window.requireAuth = requireAuth;
window.redirectByRole = redirectByRole;
window.goToPage = goToPage;
window.injectBranding = injectBranding;
window.injectAppHeader = injectAppHeader;
window.enhanceDashboardProfile = enhanceDashboardProfile;
window.getMetricIconName = getMetricIconName;
window.getRoleLabel = getRoleLabel;
window.getDashboardPath = getDashboardPath;
window.getAvatarUrl = getAvatarUrl;
window.getUserFullName = getUserFullName;
window.formatSessionDate = formatSessionDate;
