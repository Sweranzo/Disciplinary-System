(function () {
  const state = {
    caseId: null,
    messages: [],
    participants: [],
    loading: false,
    pollId: null
  };

  function getCaseIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get("id");
  }

  function userName(item = {}) {
    return [item.first_name, item.last_name].filter(Boolean).join(" ").trim()
      || item.username
      || "User";
  }

  function roleLabel(role = "") {
    if (typeof getRoleLabel === "function") {
      return getRoleLabel(role);
    }

    return String(role || "")
      .split("_")
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function html(value) {
    if (typeof escapeHtml === "function") {
      return escapeHtml(value);
    }

    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function timeLabel(value) {
    if (typeof formatDisplayDateTime === "function") {
      return formatDisplayDateTime(value, "");
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
  }

  function ensureMessagesSection() {
    let section = document.getElementById("caseMessagesSection");
    if (section) {
      return section;
    }

    section = document.createElement("section");
    section.id = "caseMessagesSection";
    section.className = "card case-section case-messages-card compact-case-messages";
    section.innerHTML = `
      <div class="card-header">
        <div>
          <h2>Messages</h2>
          <p class="muted">Secure case conversation tied to this record.</p>
        </div>
        <div class="action-row" style="margin-bottom:0;">
          <button type="button" class="secondary compact-btn" data-case-message-refresh>Refresh</button>
          <button type="button" class="compact-btn" data-case-message-toggle>Open Thread</button>
        </div>
      </div>
      <div class="case-message-compact-summary">
        <div>
          <strong data-case-message-summary-title>Case thread ready</strong>
          <span data-case-message-summary>Open the thread to view or send case messages.</span>
        </div>
      </div>
      <div class="case-messenger hidden" data-case-message-panel>
        <aside class="case-messenger-people">
          <strong>Participants</strong>
          <div data-case-message-participants class="case-message-participants">
            <span class="muted">Loading...</span>
          </div>
        </aside>
        <div class="case-messenger-main">
          <div data-case-message-list class="case-message-list">
            <div class="empty-state">Loading messages...</div>
          </div>
          <form data-case-message-form class="case-message-composer">
            <textarea data-case-message-input rows="2" maxlength="2000" placeholder="Write a message tied to this case..."></textarea>
            <div class="case-message-composer-actions">
              <span data-case-message-result class="muted"></span>
              <button type="submit" class="compact-btn">Send</button>
            </div>
          </form>
        </div>
      </div>
    `;

    const tabs = document.querySelector(".section-tabs");
    if (tabs && !tabs.querySelector('a[href="#caseMessagesSection"]')) {
      tabs.insertAdjacentHTML("beforeend", `<a href="#caseMessagesSection" class="section-tab">Messages</a>`);
    }

    const quickGrid = document.querySelector(".quick-grid");
    if (quickGrid && !quickGrid.querySelector('a[href="#caseMessagesSection"]')) {
      quickGrid.insertAdjacentHTML("beforeend", `<a href="#caseMessagesSection" class="section-tab">Messages</a>`);
    }

    const anchor = document.getElementById("timelineSection")
      || document.querySelector(".case-section")
      || document.querySelector(".dashboard-container");

    if (anchor?.parentElement && anchor.id !== "caseMessagesSection") {
      anchor.insertAdjacentElement("beforebegin", section);
    } else {
      document.querySelector(".dashboard-container")?.appendChild(section);
    }

    return section;
  }

  function renderParticipants(section) {
    const target = section.querySelector("[data-case-message-participants]");
    if (!target) return;

    if (!state.participants.length) {
      target.innerHTML = `<span class="muted">No participants yet.</span>`;
      return;
    }

    target.innerHTML = state.participants.map(item => `
      <div class="case-message-person">
        <span>${html(userName(item))}</span>
        <small>${html(roleLabel(item.role || ""))}</small>
      </div>
    `).join("");
  }

  function renderMessages(section) {
    const list = section.querySelector("[data-case-message-list]");
    if (!list) return;

    const currentUser = typeof getUser === "function" ? getUser() : null;
    if (!state.messages.length) {
      list.innerHTML = `<div class="empty-state">No messages yet. Start the case conversation here.</div>`;
      return;
    }

    list.innerHTML = state.messages.map(item => {
      const mine = Number(item.sender_user_id) === Number(currentUser?.id);
      return `
        <article class="case-message-bubble ${mine ? "mine" : ""}">
          <div class="case-message-bubble-meta">
            <strong>${html(mine ? "You" : userName(item))}</strong>
            <span>${html(roleLabel(item.role || ""))} · ${html(timeLabel(item.created_at))}</span>
          </div>
          <p>${html(item.body || "")}</p>
        </article>
      `;
    }).join("");
    list.scrollTop = list.scrollHeight;
  }

  function render(section) {
    renderParticipants(section);
    renderMessages(section);
    const summaryTitle = section.querySelector("[data-case-message-summary-title]");
    const summary = section.querySelector("[data-case-message-summary]");
    const lastMessage = state.messages[state.messages.length - 1];
    if (summaryTitle) {
      summaryTitle.textContent = state.messages.length
        ? `${state.messages.length} message${state.messages.length === 1 ? "" : "s"} in this case`
        : "No messages yet";
    }
    if (summary) {
      summary.textContent = lastMessage?.body
        ? `Latest: ${lastMessage.body}`
        : "Open the thread to start the case conversation.";
    }
  }

  async function loadMessages({ silent = false } = {}) {
    if (!state.caseId || state.loading) {
      return;
    }

    const section = ensureMessagesSection();
    const result = section.querySelector("[data-case-message-result]");

    state.loading = true;
    if (!silent && result) result.textContent = "Loading messages...";

    try {
      const res = await apiRequest(`/messages/cases/${encodeURIComponent(state.caseId)}`, "GET", null, true);
      if (!res.success) {
        section.querySelector("[data-case-message-list]").innerHTML = `<div class="empty-state">${html(res.message || "Unable to load messages.")}</div>`;
        return;
      }

      state.messages = res.messages || [];
      state.participants = res.participants || [];
      render(section);
      if (result) result.textContent = "";
      if (typeof refreshMessageBadge === "function") {
        refreshMessageBadge();
      }
    } catch (error) {
      console.error("Unable to load case messages:", error);
      if (!silent && result) result.textContent = "Unable to load messages.";
    } finally {
      state.loading = false;
    }
  }

  async function sendMessage(event) {
    event.preventDefault();
    const section = ensureMessagesSection();
    const input = section.querySelector("[data-case-message-input]");
    const result = section.querySelector("[data-case-message-result]");
    const body = input?.value.trim();

    if (!body) {
      if (result) result.textContent = "Write a message first.";
      return;
    }

    if (result) result.textContent = "Sending...";
    const res = await apiRequest(`/messages/cases/${encodeURIComponent(state.caseId)}/messages`, "POST", { body }, true);
    if (!res.success) {
      if (result) result.textContent = res.message || "Unable to send message.";
      return;
    }

    input.value = "";
    if (result) result.textContent = "";
    await loadMessages({ silent: true });
  }

  function bind(section) {
    section.querySelector("[data-case-message-form]")?.addEventListener("submit", sendMessage);
    section.querySelector("[data-case-message-refresh]")?.addEventListener("click", () => loadMessages());
    section.querySelector("[data-case-message-toggle]")?.addEventListener("click", event => {
      const panel = section.querySelector("[data-case-message-panel]");
      const isOpen = panel && !panel.classList.contains("hidden");
      panel?.classList.toggle("hidden", isOpen);
      section.classList.toggle("compact-case-messages", isOpen);
      event.currentTarget.textContent = isOpen ? "Open Thread" : "Hide Thread";
    });
  }

  function init() {
    if (!document.querySelector(".case-detail-workspace")) {
      return;
    }

    state.caseId = getCaseIdFromUrl();
    if (!state.caseId) {
      return;
    }

    const section = ensureMessagesSection();
    bind(section);
    loadMessages();
    state.pollId = setInterval(() => loadMessages({ silent: true }), 30000);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
