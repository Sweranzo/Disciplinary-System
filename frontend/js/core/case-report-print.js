(function () {
  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function labelize(value) {
    return String(value || "-")
      .replaceAll("_", " ")
      .replace(/\b\w/g, character => character.toUpperCase());
  }

  function valueOrDash(value) {
    if (value === null || value === undefined || value === "") return "-";
    return value;
  }

  function formatDate(value) {
    if (typeof window.formatDisplayDate === "function") return window.formatDisplayDate(value);
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
  }

  function formatTime(value) {
    if (typeof window.formatDisplayTime === "function") return window.formatDisplayTime(value);
    if (!value) return "-";
    return String(value).slice(0, 5);
  }

  function formatDateTime(value) {
    if (typeof window.formatDisplayDateTime === "function") return window.formatDisplayDateTime(value);
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
  }

  function getRoleLabel(value) {
    return typeof window.getRoleLabel === "function" ? window.getRoleLabel(value) : labelize(value);
  }

  function fullName(record, firstKey = "first_name", lastKey = "last_name") {
    return [record?.[firstKey], record?.[lastKey]].filter(Boolean).join(" ").trim();
  }

  function studentName(caseItem = {}) {
    return (
      fullName(caseItem) ||
      fullName(caseItem, "student_first_name", "student_last_name") ||
      caseItem.student_name ||
      "-"
    );
  }

  function reporterName(caseItem = {}) {
    return fullName(caseItem, "reported_by_first_name", "reported_by_last_name") || caseItem.reported_by_name || "-";
  }

  function ownerName(caseItem = {}) {
    return (
      caseItem.owner_label ||
      fullName(caseItem, "assigned_to_first_name", "assigned_to_last_name") ||
      caseItem.assigned_to_name ||
      "Unassigned"
    );
  }

  function row(label, value) {
    return `
      <div class="report-row">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(valueOrDash(value))}</strong>
      </div>
    `;
  }

  function section(title, body, options = {}) {
    return `
      <section class="report-section ${options.breakBefore ? "page-break" : ""}">
        <h2>${escapeHtml(title)}</h2>
        ${body}
      </section>
    `;
  }

  function emptyState(message) {
    return `<div class="report-empty">${escapeHtml(message)}</div>`;
  }

  function textBlock(text) {
    return `<p class="report-text">${escapeHtml(text || "No details recorded.")}</p>`;
  }

  function statusPill(value) {
    return `<span class="report-pill">${escapeHtml(labelize(value))}</span>`;
  }

  function itemList(items, emptyMessage, mapper) {
    if (!Array.isArray(items) || !items.length) return emptyState(emptyMessage);
    return `<div class="report-list">${items.map(mapper).join("")}</div>`;
  }

  function truncateText(value, maxLength = 220) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (!text) return "-";
    return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
  }

  function countLabel(items) {
    return Array.isArray(items) ? String(items.length) : "0";
  }

  function latestItem(items = [], dateKeys = ["created_at", "uploaded_at", "scheduled_date", "submitted_at"]) {
    if (!Array.isArray(items) || !items.length) return null;
    return [...items].sort((left, right) => {
      const leftDate = dateKeys.map(key => left?.[key]).find(Boolean);
      const rightDate = dateKeys.map(key => right?.[key]).find(Boolean);
      return new Date(rightDate || 0).getTime() - new Date(leftDate || 0).getTime();
    })[0];
  }

  function compactField(label, value) {
    return `
      <div class="compact-field">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(valueOrDash(value))}</strong>
      </div>
    `;
  }

  function compactNote(label, value) {
    return `
      <div class="compact-note">
        <span>${escapeHtml(label)}</span>
        <p>${escapeHtml(truncateText(value, 230))}</p>
      </div>
    `;
  }

  function detailItem(title, meta, description, fields = []) {
    return `
      <article class="report-item">
        <div class="report-item-head">
          <h3>${escapeHtml(valueOrDash(title))}</h3>
          ${meta ? `<span>${escapeHtml(meta)}</span>` : ""}
        </div>
        ${description ? textBlock(description) : ""}
        ${fields.length ? `<div class="report-mini-grid">${fields.map(field => row(field.label, field.value)).join("")}</div>` : ""}
      </article>
    `;
  }

  function normalizeTimeline(timeline = {}, packet = {}) {
    return {
      updates: timeline.updates || packet.updates || [],
      evidence: timeline.evidence || packet.evidence || [],
      hearings: timeline.hearings || packet.hearings || [],
      sanctions: timeline.sanctions || packet.sanctions || [],
      appeals: timeline.appeals || packet.appeals || [],
      counselorNotes: timeline.counselorNotes || timeline.counselor_notes || packet.counselorNotes || packet.counselor_notes || [],
      workflowEvents: timeline.workflowEvents || timeline.workflow_events || packet.workflow_events || [],
      closureReadiness: timeline.closureReadiness || timeline.closure_readiness || null
    };
  }

  function buildCaseReportHtml({ caseItem = {}, timeline = {}, packet = {}, roleLabel = "Case Office" }) {
    const packetCase = packet.case || {};
    const record = { ...packetCase, ...caseItem };
    const normalized = normalizeTimeline(timeline, packet);
    const generatedAt = packet.generated_at || new Date().toISOString();
    const reportTitle = `Case Report - ${record.case_number || record.id || "Case"}`;
    const status = labelize(record.operational_status || record.status);
    const severity = labelize(record.severity_level);
    const student = studentName(record);
    const academicContext = [record.program, record.year_level, record.section].filter(Boolean).join(" / ");
    const logoUrl = new URL("../../Philtech-logo.png", window.location.href).href;
    const latestUpdate = latestItem(normalized.updates, ["created_at"]);
    const latestEvidence = latestItem(normalized.evidence, ["uploaded_at", "created_at"]);
    const latestHearing = latestItem(normalized.hearings, ["scheduled_date", "created_at"]);
    const latestSanction = latestItem(normalized.sanctions, ["created_at", "start_date"]);
    const latestAppeal = latestItem(normalized.appeals, ["submitted_at", "created_at"]);
    const latestCounselorNote = latestItem(normalized.counselorNotes, ["created_at", "follow_up_date"]);
    const latestWorkflow = latestItem(normalized.workflowEvents, ["created_at"]);
    const closureChecks = normalized.closureReadiness?.checks || [];
    const completedChecks = closureChecks.filter(check => check.complete).length;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(reportTitle)}</title>
  <style>
    * { box-sizing: border-box; }
    @page { size: A4; margin: 8mm; }
    body { margin: 0; background: #e9edf3; color: #18202c; font-family: Arial, Helvetica, sans-serif; line-height: 1.28; }
    .report-page { width: 210mm; min-height: 297mm; max-height: 297mm; margin: 0 auto; padding: 10mm; background: #fff; overflow: hidden; }
    .report-shell { height: 277mm; border: 1px solid #d8dee8; border-radius: 14px; overflow: hidden; background: #fff; }
    .report-header { display: grid; grid-template-columns: 1fr auto; gap: 16px; padding: 18px 20px; color: #fff; background: linear-gradient(135deg, #13213a 0%, #263a5d 54%, #9d2f57 100%); }
    .brand-line { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .brand-line img { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; background: #fff; padding: 3px; }
    .brand-kicker { display: block; font-size: 8.5px; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; color: rgba(255,255,255,.72); }
    .brand-line h1 { margin: 3px 0 1px; font-size: 19px; line-height: 1.05; letter-spacing: 0; }
    .brand-line p { margin: 0; font-size: 10px; color: rgba(255,255,255,.78); }
    .status-block { display: grid; align-content: center; justify-items: end; gap: 6px; text-align: right; }
    .status-pill { display: inline-flex; align-items: center; border: 1px solid rgba(255,255,255,.3); border-radius: 999px; padding: 5px 10px; background: rgba(255,255,255,.14); font-size: 11px; font-weight: 800; }
    .case-code { font-size: 10px; color: rgba(255,255,255,.76); }
    .student-strip { display: grid; grid-template-columns: 1.25fr .85fr .85fr; gap: 10px; padding: 12px 20px; background: #f5f7fb; border-bottom: 1px solid #dfe5ee; }
    .student-strip span, .compact-field span, .metric span, .compact-note span, .signature-box span { display: block; color: #667085; font-size: 7.5px; font-weight: 900; letter-spacing: .12em; text-transform: uppercase; }
    .student-strip strong { display: block; margin-top: 3px; font-size: 14px; color: #172033; }
    .student-strip p { margin: 2px 0 0; color: #526071; font-size: 9.5px; }
    .report-content { display: grid; gap: 10px; padding: 12px 20px 14px; }
    .section-title { display: flex; align-items: center; justify-content: space-between; margin: 0 0 7px; padding-bottom: 5px; border-bottom: 1px solid #dfe5ee; }
    .section-title h2 { margin: 0; font-size: 12px; color: #172033; }
    .section-title small { color: #667085; font-size: 8.5px; }
    .details-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; }
    .compact-field { min-height: 42px; border: 1px solid #dfe5ee; border-radius: 8px; padding: 7px 8px; background: #fff; }
    .compact-field strong { display: block; margin-top: 3px; color: #172033; font-size: 9.8px; overflow-wrap: anywhere; }
    .narrative-grid { display: grid; grid-template-columns: 1.2fr .8fr; gap: 8px; }
    .compact-note { border: 1px solid #dfe5ee; border-radius: 8px; padding: 8px 9px; background: #fbfcfe; min-height: 64px; }
    .compact-note p { margin: 4px 0 0; color: #313b4c; font-size: 9.2px; }
    .metrics-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 7px; }
    .metric { border-radius: 9px; padding: 8px 8px; background: #172033; color: #fff; }
    .metric strong { display: block; margin-top: 3px; font-size: 16px; line-height: 1; }
    .metric span { color: rgba(255,255,255,.7); }
    .activity-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
    .activity-card { border: 1px solid #dfe5ee; border-radius: 9px; padding: 8px 9px; min-height: 62px; background: #fff; }
    .activity-card h3 { margin: 0 0 4px; font-size: 10.5px; color: #172033; }
    .activity-card p { margin: 0; color: #455164; font-size: 9px; }
    .activity-card small { display: block; margin-top: 4px; color: #7a8494; font-size: 8px; }
    .footer-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; padding: 0 20px 14px; }
    .signature-box { border-top: 1px solid #98a2b3; padding-top: 7px; min-height: 30px; }
    .signature-box strong { display: block; margin-top: 2px; font-size: 9px; color: #172033; }
    @media screen and (max-width: 760px) {
      .report-page { width: 100%; max-height: none; padding: 0; }
      .report-shell { height: auto; border-radius: 0; border: 0; }
      .report-header, .student-strip, .narrative-grid, .details-grid, .metrics-grid, .activity-grid, .footer-grid { grid-template-columns: 1fr; }
      .status-block { justify-items: start; text-align: left; }
    }
    @media print {
      body { background: #fff; }
      .report-page { width: auto; min-height: auto; max-height: none; margin: 0; padding: 0; }
      .report-shell { height: 281mm; border-radius: 12px; }
      .report-header { grid-template-columns: 1fr auto; }
      .student-strip { grid-template-columns: 1.25fr .85fr .85fr; }
      .details-grid { grid-template-columns: repeat(4, 1fr); }
      .narrative-grid { grid-template-columns: 1.2fr .8fr; }
      .metrics-grid { grid-template-columns: repeat(6, 1fr); }
      .activity-grid { grid-template-columns: repeat(2, 1fr); }
      .footer-grid { grid-template-columns: 1fr 1fr 1fr; }
      .status-block { justify-items: end; text-align: right; }
      .report-header, .metric { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <main class="report-page">
    <div class="report-shell">
      <header class="report-header">
        <div class="brand-line">
          <img src="${escapeHtml(logoUrl)}" alt="Philtech-GMA logo">
          <div>
            <span class="brand-kicker">Philtech-GMA Disciplinary System</span>
            <h1>Case Summary Report</h1>
            <p>One-page administrative PDF for review, filing, and discipline follow-through.</p>
          </div>
        </div>
        <div class="status-block">
          <div class="status-pill">${escapeHtml(status)}</div>
          <div class="case-code">${escapeHtml(record.case_number || record.id || "-")}</div>
        </div>
      </header>

      <section class="student-strip">
        <div>
          <span>Student Name</span>
          <strong>${escapeHtml(student)}</strong>
          <p>${escapeHtml(record.student_number || "-")} ${academicContext ? `| ${escapeHtml(academicContext)}` : ""}</p>
        </div>
        <div>
          <span>Violation</span>
          <strong>${escapeHtml(valueOrDash(record.violation_type))}</strong>
          <p>Severity: ${escapeHtml(severity)}</p>
        </div>
        <div>
          <span>Case Status</span>
          <strong>${escapeHtml(status)}</strong>
          <p>${escapeHtml(labelize(record.workflow_status || record.next_action || "For record"))}</p>
        </div>
      </section>

      <div class="report-content">
        <section>
          <div class="section-title"><h2>Core Details</h2><small>Generated ${escapeHtml(formatDateTime(generatedAt))}</small></div>
          <div class="details-grid">
            ${compactField("Incident Date", formatDate(record.incident_date))}
            ${compactField("Incident Time", formatTime(record.incident_time))}
            ${compactField("Location", record.location)}
            ${compactField("Reported By", `${reporterName(record)}${record.reported_by_role ? ` - ${getRoleLabel(record.reported_by_role)}` : ""}`)}
            ${compactField("Discipline Owner", `${ownerName(record)}${record.assigned_to_role ? ` - ${getRoleLabel(record.assigned_to_role)}` : ""}`)}
            ${compactField("Prepared For", roleLabel)}
            ${compactField("Review Status", labelize(record.review_status || record.operational_status || record.status))}
            ${compactField("Closure Checks", closureChecks.length ? `${completedChecks}/${closureChecks.length} complete` : "Not recorded")}
          </div>
        </section>

        <section>
          <div class="section-title"><h2>Incident and Resolution Notes</h2><small>Condensed for one-page filing</small></div>
          <div class="narrative-grid">
            ${compactNote("Incident Narrative", record.description)}
            ${compactNote("Closure / Decision Notes", record.closure_notes || latestWorkflow?.details || latestWorkflow?.notes || latestWorkflow?.message)}
          </div>
        </section>

        <section>
          <div class="section-title"><h2>Case Activity Snapshot</h2><small>Full history remains in the digital case packet</small></div>
          <div class="metrics-grid">
            <div class="metric"><span>Updates</span><strong>${escapeHtml(countLabel(normalized.updates))}</strong></div>
            <div class="metric"><span>Evidence</span><strong>${escapeHtml(countLabel(normalized.evidence))}</strong></div>
            <div class="metric"><span>Hearings</span><strong>${escapeHtml(countLabel(normalized.hearings))}</strong></div>
            <div class="metric"><span>Sanctions</span><strong>${escapeHtml(countLabel(normalized.sanctions))}</strong></div>
            <div class="metric"><span>Appeals</span><strong>${escapeHtml(countLabel(normalized.appeals))}</strong></div>
            <div class="metric"><span>Notes</span><strong>${escapeHtml(countLabel(normalized.counselorNotes))}</strong></div>
          </div>
        </section>

        <section>
          <div class="section-title"><h2>Latest Records</h2><small>Most recent linked activity</small></div>
          <div class="activity-grid">
            <div class="activity-card">
              <h3>Timeline</h3>
              <p>${escapeHtml(truncateText(latestUpdate?.content, 145))}</p>
              <small>${escapeHtml(latestUpdate ? `${labelize(latestUpdate.update_type)} | ${formatDateTime(latestUpdate.created_at)}` : "No timeline update")}</small>
            </div>
            <div class="activity-card">
              <h3>Evidence</h3>
              <p>${escapeHtml(truncateText(latestEvidence?.original_name || latestEvidence?.file_name || latestEvidence?.review_notes, 145))}</p>
              <small>${escapeHtml(latestEvidence ? `${labelize(latestEvidence.review_status || "pending")} | ${formatDateTime(latestEvidence.uploaded_at)}` : "No evidence uploaded")}</small>
            </div>
            <div class="activity-card">
              <h3>Hearing / Sanction</h3>
              <p>${escapeHtml(truncateText(latestHearing?.outcome || latestSanction?.description || "No completed outcome recorded.", 145))}</p>
              <small>${escapeHtml(latestHearing ? `Hearing ${labelize(latestHearing.status)} | ${formatDate(latestHearing.scheduled_date)}` : (latestSanction ? `Sanction ${labelize(latestSanction.status)}` : "No hearing or sanction"))}</small>
            </div>
            <div class="activity-card">
              <h3>Appeal / Guidance</h3>
              <p>${escapeHtml(truncateText(latestAppeal?.reason || latestCounselorNote?.note || "No appeal or guidance note recorded.", 145))}</p>
              <small>${escapeHtml(latestAppeal ? `Appeal ${labelize(latestAppeal.status)}` : (latestCounselorNote ? `Counselor ${labelize(latestCounselorNote.status)}` : "No linked record"))}</small>
            </div>
          </div>
        </section>
      </div>

      <footer class="footer-grid">
        <div class="signature-box"><span>Prepared By</span><strong>${escapeHtml(roleLabel)}</strong></div>
        <div class="signature-box"><span>Reviewed By</span><strong>Discipline Office</strong></div>
        <div class="signature-box"><span>Received / Filed</span><strong>Date and Signature</strong></div>
      </footer>
    </div>
  </main>
</body>
</html>`;
  }

  function writePreparing(printWindow) {
    printWindow.document.open();
    printWindow.document.write(`<!DOCTYPE html><html><head><title>Preparing Case Report</title><style>body{font-family:Arial,Helvetica,sans-serif;background:#f5f7fb;color:#20242c;margin:0;display:grid;min-height:100vh;place-items:center}.box{padding:28px 32px;border:1px solid #dbe2ed;border-radius:12px;background:#fff;box-shadow:0 18px 44px rgba(20,30,48,.12)}h1{font-size:20px;margin:0 0 8px}p{margin:0;color:#667085}</style></head><body><div class="box"><h1>Preparing case report...</h1><p>Please wait while the printable packet is generated.</p></div></body></html>`);
    printWindow.document.close();
  }

  async function fetchPacket(caseId) {
    if (typeof window.apiRequest !== "function") return null;
    try {
      const response = await window.apiRequest(`/case-process/cases/${caseId}/packet`, "GET", null, true);
      return response?.success ? response.packet : null;
    } catch (error) {
      console.warn("Case packet export failed; printing loaded case data instead.", error);
      return null;
    }
  }

  window.printCasePacketReport = async function printCasePacketReport(options = {}) {
    const { caseId, caseItem, timeline, roleLabel } = options;
    if (!caseId || !caseItem) {
      throw new Error("Case details are still loading. Try again in a moment.");
    }

    const printWindow = window.open("", "_blank", "width=980,height=1200");
    if (!printWindow) {
      throw new Error("Allow pop-ups for this site to open the printable report.");
    }

    writePreparing(printWindow);
    const packet = await fetchPacket(caseId);
    const html = buildCaseReportHtml({
      caseItem,
      timeline: timeline || {},
      packet: packet || {},
      roleLabel: roleLabel || "Case Office"
    });

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 350);
  };
})();
