const evidenceState = {
  rows: [],
  canReview: false,
  caseDetailsPath: "case-details.html"
};

function labelize(value = "") {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, char => char.toUpperCase());
}

function evidenceBadge(value) {
  const status = value || "pending";
  return `<span class="badge ${escapeHtml(status)}">${escapeHtml(labelize(status))}</span>`;
}

function evidenceText(value, fallback = "-") {
  const text = String(value || "").trim();
  return text ? escapeHtml(text) : fallback;
}

function evidenceFileUrl(path) {
  return `${API_BASE_URL.replace(/\/api$/, "")}${path || ""}`;
}

function updateEvidenceSummary(items = evidenceState.rows) {
  const counts = items.reduce((summary, item) => {
    const status = item.review_status || "pending";
    summary.total += 1;
    summary[status] = (summary[status] || 0) + 1;
    return summary;
  }, { total: 0, pending: 0, approved: 0, rejected: 0 });

  document.getElementById("evidenceTotal").textContent = counts.total;
  document.getElementById("evidencePending").textContent = counts.pending;
  document.getElementById("evidenceApproved").textContent = counts.approved;
  document.getElementById("evidenceRejected").textContent = counts.rejected;
}

function renderEvidenceRows(items) {
  const list = document.getElementById("evidenceTable");

  if (!items.length) {
    list.innerHTML = `<div class="empty-state">No evidence found.</div>`;
    return;
  }

  list.innerHTML = items.map(item => `
    <article class="evidence-record">
      <div class="evidence-record-main">
        <div class="evidence-record-head">
          <div>
            <span class="eyebrow">Case Evidence</span>
            <h3>${evidenceText(item.case_number)}</h3>
            <p>${evidenceText(`${item.first_name || ""} ${item.last_name || ""}`)} · ${evidenceText(item.student_number)}</p>
          </div>
          <a href="${evidenceState.caseDetailsPath}?id=${encodeURIComponent(item.case_id)}"><button type="button" class="secondary compact-btn">Open Case</button></a>
        </div>

        <div class="evidence-record-grid">
          <div class="evidence-field evidence-file-field">
            <span>File</span>
            <a href="${escapeHtml(evidenceFileUrl(item.file_path))}" target="_blank">${evidenceText(item.original_name || item.file_name, "Open file")}</a>
            <small>${evidenceText(item.evidence_category || item.source_label, "Uncategorized")}</small>
          </div>
          <div class="evidence-field">
            <span>Uploaded By</span>
            <strong>${evidenceText(`${item.uploaded_by_first_name || ""} ${item.uploaded_by_last_name || ""}`)}</strong>
            <small>${evidenceText(item.uploaded_by_role_label || item.uploaded_by_role)}</small>
          </div>
          <div class="evidence-field">
            <span>Uploaded</span>
            <strong>${escapeHtml(formatDisplayDateTime(item.uploaded_at))}</strong>
            <small>${evidenceText(item.evidence_purpose, "Supporting case material")}</small>
          </div>
        </div>
      </div>

      <aside class="evidence-review-panel">
        <div class="evidence-status-row">
          <span>Status</span>
          ${evidenceBadge(item.review_status)}
        </div>
        <p>${evidenceText(item.review_notes, "No review notes yet.")}</p>
        ${evidenceState.canReview ? `
          <div class="evidence-review-controls">
            <select id="reviewStatus-${item.id}" aria-label="Evidence review status">
              ${["pending", "approved", "rejected"].map(status => `
                <option value="${status}" ${item.review_status === status ? "selected" : ""}>${escapeHtml(labelize(status))}</option>
              `).join("")}
            </select>
            <textarea id="reviewNotes-${item.id}" rows="3" placeholder="Review notes">${evidenceText(item.review_notes, "")}</textarea>
            <button type="button" onclick="reviewEvidence(${item.id}, this)">Save</button>
          </div>
        ` : `<span class="muted">Read only</span>`}
      </aside>
    </article>
  `).join("");
}

function applyEvidenceFilters() {
  const search = document.getElementById("evidenceSearch").value.trim().toLowerCase();
  const status = document.getElementById("statusFilter").value;

  const filtered = evidenceState.rows.filter(item => {
    const matchesStatus = !status || item.review_status === status;
    const matchesSearch = !search || [
      item.case_number,
      item.first_name,
      item.last_name,
      item.student_number,
      item.original_name,
      item.file_name,
      item.evidence_category,
      item.source_label,
      item.review_status,
      item.review_notes,
      item.uploaded_by_first_name,
      item.uploaded_by_last_name,
      item.uploaded_by_role_label
    ].some(value => String(value || "").toLowerCase().includes(search));

    return matchesStatus && matchesSearch;
  });

  updateEvidenceSummary(filtered);
  renderEvidenceRows(filtered);
}

async function loadEvidence() {
  const list = document.getElementById("evidenceTable");
  list.innerHTML = `<div class="empty-state">Loading evidence...</div>`;

  const res = await apiRequest("/evidence/all", "GET", null, true);
  if (!res.success) {
    list.innerHTML = `<div class="empty-state">${escapeHtml(res.message || "Unable to load evidence.")}</div>`;
    return;
  }

  evidenceState.rows = res.evidence || [];
  applyEvidenceFilters();
}

async function reviewEvidence(id, button) {
  button.disabled = true;

  const res = await apiRequest(`/evidence/${id}/review`, "PUT", {
    reviewStatus: document.getElementById(`reviewStatus-${id}`).value,
    reviewNotes: document.getElementById(`reviewNotes-${id}`).value.trim()
  }, true);

  button.disabled = false;
  if (!res.success) {
    alert(res.message || "Unable to save evidence review.");
    return;
  }

  await loadEvidence();
}

function initEvidenceWorkspace(options = {}) {
  evidenceState.canReview = Boolean(options.canReview);
  evidenceState.caseDetailsPath = options.caseDetailsPath || "case-details.html";

  document.getElementById("evidenceSearch").addEventListener("input", applyEvidenceFilters);
  document.getElementById("statusFilter").addEventListener("change", applyEvidenceFilters);
  document.getElementById("refreshBtn").addEventListener("click", loadEvidence);
  loadEvidence();
}
