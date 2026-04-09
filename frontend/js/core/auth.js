const DEFAULT_API_ORIGIN = "http://localhost:5000";

function saveAuth(data) {
  localStorage.setItem("token", data.token);
  localStorage.setItem("user", JSON.stringify(data.user));
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
      <img src="${getBrandAssetUrl()}" alt="Philippine Technological Institute crest">
      <div class="page-transition-copy">
        <strong>PTI Disciplinary System</strong>
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
    return "../../assets/pti-crest.svg";
  }

  try {
    return new URL("../assets/pti-crest.svg", stylesheet.href).href;
  } catch (error) {
    return "../../assets/pti-crest.svg";
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
      <img src="${brandAssetUrl}" alt="Philippine Technological Institute crest">
      <div class="brand-copy">
        <strong>Philippine Technological Institute</strong>
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
    <span class="profile-caret">&#9662;</span>
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
  const link = document.createElement("button");
  link.type = "button";
  link.className = "notification-trigger";
  link.setAttribute("aria-label", "Open notifications");
  link.innerHTML = `
    <span class="notification-icon">&#128276;</span>
    <span class="notification-count hidden" id="globalNotificationCount">0</span>
  `;

  link.addEventListener("click", () => {
    goToPage("common/notifications.html");
  });

  return link;
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

  const aside = document.createElement("aside");
  aside.className = "app-sidebar";
  aside.innerHTML = `
    <div class="app-sidebar-brand">
      <img src="${getBrandAssetUrl()}" alt="Philippine Technological Institute crest">
      <div class="app-sidebar-brand-copy">
        <strong>PTI Disciplinary System</strong>
        <span>${user.role_label || getRoleLabel(user.role)}</span>
      </div>
    </div>
    <nav class="app-sidebar-nav">
      ${navItems.map(item => {
        const href = buildFrontendPageUrl(item.path);
        const isActive = pathname.endsWith(item.path);
        return `<a href="${href}" class="app-sidebar-link${isActive ? " active" : ""}">${item.label}</a>`;
      }).join("")}
    </nav>
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
  const countNode = document.getElementById("globalNotificationCount");
  if (!token || !countNode) {
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
    countNode.textContent = String(unreadCount);
    countNode.classList.toggle("hidden", unreadCount <= 0);
  } catch (error) {
    console.error("Unable to refresh notification badge:", error);
  }
}

async function initializeSharedTopbar() {
  injectBranding();
  const cachedUser = getUser();

  if (cachedUser) {
    injectSidebar(cachedUser);

    getPrimaryTopbars().forEach(topbar => {
      enhanceTopbarUser(topbar, cachedUser);
      moveTopbarActionsBelow(topbar);
    });
  }

  const refreshedUser = await refreshCurrentUser();
  if (!cachedUser && refreshedUser) {
    injectSidebar(refreshedUser);

    getPrimaryTopbars().forEach(topbar => {
      enhanceTopbarUser(topbar, refreshedUser);
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
window.getRoleLabel = getRoleLabel;
window.getDashboardPath = getDashboardPath;
window.getAvatarUrl = getAvatarUrl;
window.getUserFullName = getUserFullName;
