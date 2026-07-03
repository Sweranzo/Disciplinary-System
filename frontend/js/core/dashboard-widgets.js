const DashboardWidgets = (() => {
  const monthState = new Map();
  const colors = ["#8A1538", "#d94870", "#f2c6cf", "#6ea076", "#c56b18", "#5577b8"];

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizeDate(value) {
    if (!value) {
      return "";
    }

    const rawValue = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
      return rawValue;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");
  }

  function formatDate(value) {
    if (window.formatDisplayDate) {
      return window.formatDisplayDate(value);
    }

    const key = normalizeDate(value);
    if (!key) {
      return "-";
    }

    const date = new Date(`${key}T00:00:00`);
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function formatDateShort(value) {
    if (window.formatDisplayDate) {
      return window.formatDisplayDate(value).replace(/, \d{4}$/, "");
    }

    const key = normalizeDate(value);
    if (!key) {
      return "-";
    }

    const date = new Date(`${key}T00:00:00`);
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function labelize(value) {
    return String(value || "none")
      .replaceAll("_", " ")
      .replace(/\b\w/g, char => char.toUpperCase());
  }

  function isOpenStatus(status) {
    return !["resolved", "dismissed", "fulfilled", "completed", "cancelled", "rejected", "approved"].includes(String(status || "").toLowerCase());
  }

  function groupBy(items, key) {
    return items.reduce((acc, item) => {
      const value = item[key] || "none";
      acc[value] = (acc[value] || 0) + 1;
      return acc;
    }, {});
  }

  function toSegments(grouped, preferredOrder = [], options = {}) {
    const keys = [
      ...preferredOrder.filter(key => options.includeZeros || Object.prototype.hasOwnProperty.call(grouped, key)),
      ...Object.keys(grouped).filter(key => !preferredOrder.includes(key))
    ];

    return keys.map((key, index) => ({
      label: labelize(key),
      value: grouped[key] || 0,
      color: colors[index % colors.length]
    }));
  }

  function upcoming(events, limit = 5) {
    const todayKey = normalizeDate(new Date());
    return events
      .filter(event => normalizeDate(event.date) >= todayKey)
      .sort((a, b) => `${normalizeDate(a.date)} ${a.time || ""}`.localeCompare(`${normalizeDate(b.date)} ${b.time || ""}`))
      .slice(0, limit);
  }

  function renderMetrics(containerId, metrics) {
    const container = document.getElementById(containerId);
    if (!container) {
      return;
    }

    container.innerHTML = metrics.map((metric, index) => `
      <div class="dash-metric dash-metric-tone-${index % 4}">
        <div class="dash-metric-icon">${window.LucideIcons?.svg(window.getMetricIconName?.(metric) || "layout-dashboard") || escapeHtml(metric.icon || "")}</div>
        <div>
          <span>${escapeHtml(metric.label)}</span>
          <strong>${escapeHtml(metric.value)}</strong>
          <p>${escapeHtml(metric.help || "")}</p>
        </div>
      </div>
    `).join("");
  }

  function renderDonut(containerId, segments, emptyMessage = "No data yet") {
    const container = document.getElementById(containerId);
    if (!container) {
      return;
    }

    const total = segments.reduce((sum, item) => sum + Number(item.value || 0), 0);
    if (!total) {
      container.innerHTML = `<div class="empty-state">${escapeHtml(emptyMessage)}</div>`;
      return;
    }

    let start = 0;
    const gradient = segments.map(item => {
      const end = start + (Number(item.value || 0) / total) * 100;
      const part = `${item.color} ${start}% ${end}%`;
      start = end;
      return part;
    }).join(", ");

    container.innerHTML = `
      <div class="dash-donut-wrap">
        <div class="dash-donut" style="background: conic-gradient(${gradient});">
          <div><strong>${total}</strong><span>Total Cases</span></div>
        </div>
      </div>
    `;
  }

  function renderStatusList(containerId, segments, emptyMessage = "No data yet") {
    const container = document.getElementById(containerId);
    if (!container) {
      return;
    }

    if (!segments || !segments.length) {
      container.innerHTML = `<div class="empty-state">${escapeHtml(emptyMessage)}</div>`;
      return;
    }

    container.innerHTML = `<div class="dash-legend">${segments.map(item => `
      <div>
        <i style="background:${item.color}"></i>
        <span>${escapeHtml(item.label)}</span>
        <strong>${escapeHtml(item.value)}</strong>
      </div>
    `).join("")}</div>`;
  }

  function renderBars(containerId, rows, emptyMessage = "No data yet") {
    const container = document.getElementById(containerId);
    if (!container) {
      return;
    }

    const max = Math.max(...rows.map(row => Number(row.value || 0)), 0);
    if (!max) {
      container.innerHTML = `<div class="empty-state">${escapeHtml(emptyMessage)}</div>`;
      return;
    }

    container.innerHTML = `<div class="dash-bars">${rows.map((row, index) => `
      <div class="dash-bar-row">
        <div class="dash-bar-head"><span>${escapeHtml(row.label)}</span><strong>${escapeHtml(row.value)}</strong></div>
        <div class="dash-bar-track"><span style="width:${Number(row.value || 0) > 0 ? Math.max(8, (Number(row.value || 0) / max) * 100) : 0}%; background:${row.color || colors[index % colors.length]}"></span></div>
      </div>
    `).join("")}</div>`;
  }

  function renderColumns(containerId, rows, emptyMessage = "No data yet") {
    const container = document.getElementById(containerId);
    if (!container) {
      return;
    }

    const max = Math.max(...rows.map(row => Number(row.value || 0)), 0);
    if (!max) {
      container.innerHTML = `<div class="empty-state">${escapeHtml(emptyMessage)}</div>`;
      return;
    }

    container.innerHTML = `<div class="dash-columns">${rows.map((row, index) => {
      const value = Number(row.value || 0);
      const height = value > 0 ? Math.max(18, (value / max) * 100) : 0;
      return `
        <div class="dash-column">
          <strong>${escapeHtml(value)}</strong>
          <span class="dash-column-bar" style="height:${height}%; background:${row.color || colors[index % colors.length]}"></span>
          <small>${escapeHtml(row.shortLabel || row.label)}</small>
        </div>
      `;
    }).join("")}</div>`;
  }

  function renderSummary(containerId, items) {
    const container = document.getElementById(containerId);
    if (!container) {
      return;
    }

    container.innerHTML = items.map(item => `
      <div>
        <span>${escapeHtml(item.label)}</span>
        <strong>${escapeHtml(item.value)}</strong>
      </div>
    `).join("");
  }

  function renderList(containerId, items, emptyMessage, mapFn) {
    const container = document.getElementById(containerId);
    if (!container) {
      return;
    }

    if (!items || !items.length) {
      container.innerHTML = `<div class="empty-state">${escapeHtml(emptyMessage)}</div>`;
      return;
    }

    container.innerHTML = `<div class="dash-list">${items.map(mapFn).join("")}</div>`;
  }

  function renderUpcoming(containerId, events, emptyMessage = "No upcoming meetings") {
    renderList(containerId, upcoming(events), emptyMessage, event => `
      <a class="dash-meeting" href="${escapeHtml(event.url || "#")}">
        <span>${escapeHtml(formatDateShort(event.date))}<small>${escapeHtml(event.time || "")}</small></span>
        <div>
          <strong>${escapeHtml(event.title)}</strong>
          <p>${escapeHtml(event.meta || "")}</p>
        </div>
      </a>
    `);
  }

  function renderCalendar(containerId, events) {
    const container = document.getElementById(containerId);
    if (!container) {
      return;
    }

    const seeded = monthState.get(containerId) || new Date();
    const viewDate = new Date(seeded.getFullYear(), seeded.getMonth(), 1);
    monthState.set(containerId, viewDate);

    const month = viewDate.getMonth();
    const year = viewDate.getFullYear();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayKey = normalizeDate(new Date());
    const eventsByDate = events.reduce((acc, event) => {
      const key = normalizeDate(event.date);
      if (!key) {
        return acc;
      }
      acc[key] = acc[key] || [];
      acc[key].push(event);
      return acc;
    }, {});

    const cells = [];
    for (let i = 0; i < firstDay; i += 1) {
      cells.push(`<div class="dash-calendar-day is-muted"></div>`);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const dayEvents = eventsByDate[key] || [];
      cells.push(`
        <button type="button" class="dash-calendar-day ${key === todayKey ? "is-selected" : ""} ${dayEvents.length ? "has-event" : ""}" data-date="${key}">
          <span>${day}</span>
          ${dayEvents.length ? `<i>${dayEvents.length}</i>` : ""}
        </button>
      `);
    }

    container.innerHTML = `
      <div class="dash-calendar-head">
        <button type="button" data-calendar-prev="${containerId}" aria-label="Previous month">${window.LucideIcons?.svg("chevronLeft") || "&lt;"}</button>
        <strong>${viewDate.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</strong>
        <button type="button" data-calendar-next="${containerId}" aria-label="Next month">${window.LucideIcons?.svg("chevronRight") || "&gt;"}</button>
      </div>
      <div class="dash-calendar-weekdays">
        <span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>
      </div>
      <div class="dash-calendar-grid">${cells.join("")}</div>
    `;

    container.querySelector(`[data-calendar-prev="${containerId}"]`)?.addEventListener("click", () => {
      monthState.set(containerId, new Date(year, month - 1, 1));
      renderCalendar(containerId, events);
    });

    container.querySelector(`[data-calendar-next="${containerId}"]`)?.addEventListener("click", () => {
      monthState.set(containerId, new Date(year, month + 1, 1));
      renderCalendar(containerId, events);
    });

    container.querySelectorAll("[data-date]").forEach(day => {
      day.addEventListener("click", () => {
        const selected = eventsByDate[day.dataset.date] || [];
        renderUpcoming(`${containerId}List`, selected.length ? selected : events, "No meetings on this date");
      });
    });
  }

  return {
    escapeHtml,
    normalizeDate,
    formatDate,
    labelize,
    isOpenStatus,
    groupBy,
    toSegments,
    upcoming,
    renderMetrics,
    renderDonut,
    renderStatusList,
    renderBars,
    renderColumns,
    renderSummary,
    renderList,
    renderUpcoming,
    renderCalendar
  };
})();

window.DashboardWidgets = DashboardWidgets;
