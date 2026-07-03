const appealsState = {
  rows: [],
  canReview: false,
  caseDetailsPath: "case-details.html",
  studentProfilePath: "student-profile.html"
};

function appealLabelize(value = "") {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, char => char.toUpperCase());
}

function appealBadge(value) {
  const status = value || "submitted";
  return `<span class="badge ${escapeHtml(status)}">${escapeHtml(appealLabelize(status))}</span>`;
}

function appealText(value, fallback = "-") {
  const text = String(value || "").trim();
  return text ? escapeHtml(text) : fallback;
}

function updateAppealSummary(items = appealsState.rows) {
  const counts = items.reduce((summary, item) => {
    const status = item.status || "submitted";
    summary.total += 1;
    summary[status] = (summary[status] || 0) + 1;
    return summary;
  }, { total: 0, submitted: 0, under_review: 0, approved: 0, rejected: 0 });

  document.getElementById("appealTotal").textContent = counts.total;
  document.getElementById("appealOpen").textContent = counts.submitted + counts.under_review;
  document.getElementById("appealApproved").textContent = counts.approved;
  document.getElementById("appealRejected").textContent = counts.rejected;
}

function renderAppealRows(items) {
  const list = document.getElementById("appealsList");

  if (!items.length) {
    list.innerHTML = `<div class="empty-state">No appeals found.</div>`;
    return;
  }

  list.innerHTML = `<div class="detail-list">${items.map(appeal => `
    <div class="detail-item">
      <div class="card-header">
        <div>
          <p><strong>${appealText(appeal.case_number)}</strong> ${appealBadge(appeal.status)}</p>
          <p class="muted">${appealText(`${appeal.first_name || ""} ${appeal.last_name || ""}`)} (${appealText(appeal.student_number)}) · ${appealText(appeal.violation_type, "No violation label")}</p>
        </div>
        <div class="action-row">
          <a href="${appealsState.caseDetailsPath}?id=${encodeURIComponent(appeal.case_id)}"><button type="button" class="secondary">Open Case</button></a>
          ${appealsState.studentProfilePath && appeal.student_id ? `<a href="${appealsState.studentProfilePath}?id=${encodeURIComponent(appeal.student_id)}"><button type="button" class="secondary">Student Profile</button></a>` : ""}
        </div>
      </div>
      <p>${appealText(appeal.reason, "No appeal reason recorded.")}</p>
      <p class="muted">
        Submitted ${appealText(formatDisplayDateTime(appeal.created_at))}
        ${appeal.deadline_at ? ` · Deadline ${appealText(formatDisplayDateTime(appeal.deadline_at))}` : ""}
        ${appeal.reviewed_by_first_name ? ` · Reviewed by ${appealText(`${appeal.reviewed_by_first_name} ${appeal.reviewed_by_last_name || ""}`)} (${appealText(appeal.reviewed_by_role_label || appeal.reviewed_by_role)})` : ""}
      </p>
      ${appealsState.canReview ? `
        <div class="form-grid">
          <div class="field-stack">
            <label for="decision-${appeal.id}">Decision</label>
            <select id="decision-${appeal.id}">
              ${["under_review", "approved", "rejected"].map(status => `
                <option value="${status}" ${appeal.status === status ? "selected" : ""}>${appealText(appealLabelize(status))}</option>
              `).join("")}
            </select>
          </div>
          <div class="field-stack">
            <label for="notes-${appeal.id}">Decision Notes</label>
            <textarea id="notes-${appeal.id}" rows="3" placeholder="Decision notes">${appealText(appeal.decision_notes, "")}</textarea>
          </div>
        </div>
        <div class="action-row">
          <button type="button" onclick="reviewAppeal(${appeal.id}, this)">Save Decision</button>
        </div>
      ` : `
        <p class="muted">${appealText(appeal.decision_notes, "No decision notes yet.")}</p>
      `}
    </div>
  `).join("")}</div>`;
}

function applyAppealFilters() {
  const search = document.getElementById("appealSearch").value.trim().toLowerCase();
  const status = document.getElementById("statusFilter").value;

  const filtered = appealsState.rows.filter(appeal => {
    const matchesStatus = !status || appeal.status === status;
    const matchesSearch = !search || [
      appeal.case_number,
      appeal.first_name,
      appeal.last_name,
      appeal.student_number,
      appeal.violation_type,
      appeal.reason,
      appeal.decision_notes,
      appeal.status,
      appeal.reviewed_by_first_name,
      appeal.reviewed_by_last_name,
      appeal.reviewed_by_role_label
    ].some(value => String(value || "").toLowerCase().includes(search));

    return matchesStatus && matchesSearch;
  });

  updateAppealSummary(filtered);
  renderAppealRows(filtered);
}

async function loadAppeals() {
  const list = document.getElementById("appealsList");
  list.innerHTML = `<div class="empty-state">Loading appeals...</div>`;

  const res = await apiRequest("/appeals/all", "GET", null, true);
  if (!res.success) {
    list.innerHTML = `<div class="empty-state">${escapeHtml(res.message || "Unable to load appeals.")}</div>`;
    return;
  }

  appealsState.rows = res.appeals || [];
  applyAppealFilters();
}

async function reviewAppeal(id, button) {
  button.disabled = true;

  const res = await apiRequest(`/appeals/${id}/review`, "PUT", {
    status: document.getElementById(`decision-${id}`).value,
    decisionNotes: document.getElementById(`notes-${id}`).value.trim()
  }, true);

  button.disabled = false;
  if (!res.success) {
    alert(res.message || "Unable to save appeal decision.");
    return;
  }

  await loadAppeals();
}

function initAppealsWorkspace(options = {}) {
  appealsState.canReview = Boolean(options.canReview);
  appealsState.caseDetailsPath = options.caseDetailsPath || "case-details.html";
  appealsState.studentProfilePath = options.studentProfilePath || "";

  document.getElementById("appealSearch").addEventListener("input", applyAppealFilters);
  document.getElementById("statusFilter").addEventListener("change", applyAppealFilters);
  document.getElementById("refreshBtn").addEventListener("click", loadAppeals);
  loadAppeals();
}
