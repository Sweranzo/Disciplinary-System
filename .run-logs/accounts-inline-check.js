
requireAuth();

const user = getUser();
if (!user || user.role !== "admin") {
  alert("Access denied");
  logout();
}

let accountPage = 1;
let accountTotalPages = 1;
let parentPage = 1;
let parentTotalPages = 1;
let parentRecordsLoaded = false;
let studentOptions = [];
let parentOptions = [];
let pendingAction = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function badge(value) {
  return `<span class="badge ${String(value || "").replaceAll(" ", "_")}">${String(value || "").replaceAll("_", " ")}</span>`;
}

function roleLabel(value) {
  const labels = {
    admin: "Admin",
    discipline_officer: "Discipline Officer",
    guidance_counselor: "Guidance Counselor",
    teacher: "Teacher",
    student: "Student",
    parent: "Parent"
  };
  return labels[value] || String(value || "Account").replaceAll("_", " ");
}

function accountInitials(item) {
  const first = item.first_name?.[0] || item.username?.[0] || "U";
  const last = item.last_name?.[0] || "";
  return `${first}${last}`.toUpperCase();
}

function accountGroupLabel(role) {
  return `${roleLabel(role)} Accounts`;
}

function accountGroupKey(item) {
  return item.role || "other";
}

function hasAccountFilters() {
  return Boolean(
    document.getElementById("accountSearch").value.trim()
    || document.getElementById("accountRoleFilter").value
    || document.getElementById("accountStatusFilter").value
  );
}

function resetAccountDirectory(message = "Choose a role, status, or search term to show matching accounts.") {
  document.getElementById("accountTable").innerHTML = `<tr><td colspan="6">${escapeHtml(message)}</td></tr>`;
  document.getElementById("accountPaginationInfo").textContent = "No account filter applied";
  document.getElementById("accountPageIndicator").textContent = "Filtered results only";
  document.getElementById("accountPrevBtn").disabled = true;
  document.getElementById("accountNextBtn").disabled = true;
  document.getElementById("totalAccounts").textContent = "-";
  document.getElementById("activeAccounts").textContent = "-";
  document.getElementById("staffAccounts").textContent = "-";
  document.getElementById("familyAccounts").textContent = "-";
  window.__accountRows = [];
}

function syncParentSummary(total = null, profileOnly = null) {
  if (total !== null) {
    document.getElementById("totalParents").textContent = total;
    document.getElementById("parentPanelTotal").textContent = total;
  }

  if (profileOnly !== null) {
    document.getElementById("profileOnlyParents").textContent = profileOnly;
    document.getElementById("parentPanelProfileOnly").textContent = profileOnly;
  }
}

function renderAccountActions(item) {
  const nextStatus = item.status === "active" ? "inactive" : "active";
  const statusLabel = item.status === "active" ? "Disable" : "Enable";
  const encodedUsername = encodeURIComponent(item.username || "");
  return `
    <div class="table-action-row">
      <button type="button" class="compact-btn" onclick="openEditAccount(${item.id})">Edit</button>
      <button type="button" class="compact-btn secondary" onclick="toggleAccountStatus(${item.id}, '${nextStatus}')">${statusLabel}</button>
      <button type="button" class="compact-btn secondary" onclick="openResetModal(${item.id})">Reset</button>
      ${!item.linked_profile_type && item.role === "student" ? `<button type="button" class="compact-btn secondary" onclick="openRepairModal(${item.id})">Repair Link</button>` : ""}
      <button type="button" class="compact-btn secondary icon-btn" title="Delete account" aria-label="Delete account" onclick="deleteAccount(${item.id}, decodeURIComponent('${encodedUsername}'))">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v8h-2V9zm4 0h2v8h-2V9zM7 9h2v8H7V9zm1 11h8a2 2 0 0 0 2-2V7H6v11a2 2 0 0 0 2 2z"/>
        </svg>
      </button>
    </div>
  `;
}

function renderAccountRow(item) {
  const fullName = `${item.first_name || ""} ${item.last_name || ""}`.trim() || item.username || "Unnamed account";
  const linkedProfile = item.linked_profile_type
    ? `${badge(roleLabel(item.linked_profile_type))}<br><span class="muted">#${escapeHtml(item.linked_profile_id)}</span>`
    : item.role === "student"
      ? `<span class="account-link-warning">Needs student profile link</span>`
      : `<span class="muted">No linked profile</span>`;

  return `
    <tr>
      <td>
        <strong>${escapeHtml(fullName)}</strong>
        <br><span class="muted">${escapeHtml(item.email || "No email recorded")}</span>
      </td>
      <td>
        <strong>${escapeHtml(item.username || "-")}</strong>
        <br><span class="muted">${escapeHtml(item.employee_or_student_id || "No ID")}</span>
      </td>
      <td>${badge(roleLabel(item.role))}</td>
      <td>${linkedProfile}</td>
      <td>${badge(item.status)}</td>
      <td>${renderAccountActions(item)}</td>
    </tr>
  `;
}

function renderAccountDirectory(users) {
  const groupOrder = ["admin", "discipline_officer", "guidance_counselor", "teacher", "student", "parent", "other"];
  const grouped = users.reduce((acc, item) => {
    const key = accountGroupKey(item);
    acc[key] = acc[key] || [];
    acc[key].push(item);
    return acc;
  }, {});

  return groupOrder
    .filter(key => grouped[key]?.length)
    .map(key => `
      <tr class="account-group-row">
        <td colspan="6">
          <strong>${accountGroupLabel(grouped[key][0].role)}</strong>
          <span class="muted">${grouped[key].length} account${grouped[key].length === 1 ? "" : "s"} in this page · ${grouped[key].filter(item => item.status === "active").length} active</span>
        </td>
      </tr>
      ${grouped[key].map(renderAccountRow).join("")}
    `).join("");
}

function openModal(id) {
  document.getElementById(id).classList.add("open");
}

function closeModal(id) {
  document.getElementById(id).classList.remove("open");
}

function showFeedback(title, message) {
  document.getElementById("feedbackTitle").textContent = title;
  document.getElementById("feedbackMessage").textContent = message;
  openModal("feedbackModal");
}

function openConfirmModal(title, message, action) {
  pendingAction = action;
  document.getElementById("confirmActionTitle").textContent = title;
  document.getElementById("confirmActionMessage").textContent = message;
  openModal("confirmActionModal");
}

async function loadOptions() {
  const [studentsRes, parentsRes] = await Promise.all([
    apiRequest("/admin/students/options", "GET", null, true),
    apiRequest("/admin/parents/options", "GET", null, true)
  ]);

  studentOptions = studentsRes.success ? studentsRes.students : [];
  parentOptions = parentsRes.success ? parentsRes.parents : [];

  const studentSelectHtml = `<option value="">Link to Existing Student (Optional)</option>` + studentOptions.map(item => `
    <option value="${item.id}">${escapeHtml(item.student_number)} - ${escapeHtml(item.first_name)} ${escapeHtml(item.last_name)}${item.user_id ? "" : " (Profile Only)"}</option>
  `).join("");

  document.getElementById("linkedStudentId").innerHTML = studentSelectHtml;
  document.getElementById("linkStudentSelect").innerHTML = `<option value="">Select Student</option>` + studentOptions.map(item => `
    <option value="${item.id}">${escapeHtml(item.student_number)} - ${escapeHtml(item.first_name)} ${escapeHtml(item.last_name)}</option>
  `).join("");
  document.getElementById("repairStudentId").innerHTML = `<option value="">Select Student Profile</option>` + studentOptions
    .filter(item => !item.user_id)
    .map(item => `
      <option value="${item.id}">${escapeHtml(item.student_number)} - ${escapeHtml(item.first_name)} ${escapeHtml(item.last_name)}</option>
    `).join("");

  const parentSelectHtml = `<option value="">Link to Existing Parent (Optional)</option>` + parentOptions.map(item => `
    <option value="${item.id}">${escapeHtml(item.first_name)} ${escapeHtml(item.last_name)}${item.email ? ` (${escapeHtml(item.email)})` : ""}</option>
  `).join("");

  document.getElementById("linkedParentId").innerHTML = parentSelectHtml;
  document.getElementById("linkParentSelect").innerHTML = `<option value="">Select Parent</option>` + parentOptions.map(item => `
    <option value="${item.id}">${escapeHtml(item.first_name)} ${escapeHtml(item.last_name)}${item.email ? ` (${escapeHtml(item.email)})` : ""}</option>
  `).join("");
  document.getElementById("repairParentId").innerHTML = `<option value="">Select Parent Profile</option>` + parentOptions.map(item => `
    <option value="${item.id}">${escapeHtml(item.first_name)} ${escapeHtml(item.last_name)}${item.email ? ` (${escapeHtml(item.email)})` : ""}</option>
  `).join("");
}

async function loadAccounts() {
  if (!hasAccountFilters()) {
    resetAccountDirectory();
    return;
  }

  const query = new URLSearchParams({
    page: accountPage,
    limit: 10,
    search: document.getElementById("accountSearch").value.trim(),
    role: document.getElementById("accountRoleFilter").value,
    status: document.getElementById("accountStatusFilter").value
  });

  const res = await apiRequest(`/admin/users?${query.toString()}`, "GET", null, true);
  const directory = document.getElementById("accountTable");

  if (!res.success) {
    directory.innerHTML = `<tr><td colspan="6">${escapeHtml(res.message)}</td></tr>`;
    return;
  }

  accountTotalPages = res.pagination.totalPages || 1;
  document.getElementById("accountPaginationInfo").textContent = `Page ${res.pagination.page} of ${accountTotalPages} | ${res.pagination.total} accounts`;
  document.getElementById("accountPageIndicator").textContent = `Page ${res.pagination.page} of ${accountTotalPages}`;
  document.getElementById("accountPrevBtn").disabled = Number(res.pagination.page) <= 1;
  document.getElementById("accountNextBtn").disabled = Number(res.pagination.page) >= accountTotalPages;
  document.getElementById("totalAccounts").textContent = res.pagination.total;
  document.getElementById("activeAccounts").textContent = res.users.filter(item => item.status === "active").length;
  document.getElementById("staffAccounts").textContent = res.users.filter(item => !["student", "parent"].includes(item.role)).length;
  document.getElementById("familyAccounts").textContent = res.users.filter(item => ["student", "parent"].includes(item.role)).length;

  if (!res.users.length) {
    directory.innerHTML = `<tr><td colspan="6">No accounts found.</td></tr>`;
    return;
  }

  directory.innerHTML = renderAccountDirectory(res.users);

  window.__accountRows = res.users;
}

async function loadParents() {
  parentRecordsLoaded = true;
  const query = new URLSearchParams({
    page: parentPage,
    limit: 10,
    search: document.getElementById("parentSearch").value.trim(),
    status: document.getElementById("parentStatusFilter").value
  });

  const res = await apiRequest(`/admin/parents?${query.toString()}`, "GET", null, true);
  const table = document.getElementById("parentTable");

  if (!res.success) {
    table.innerHTML = `<tr><td colspan="6">${escapeHtml(res.message)}</td></tr>`;
    return;
  }

  syncParentSummary(res.pagination.total, res.parents.filter(item => !item.has_account).length);
  parentTotalPages = res.pagination.totalPages || 1;
  document.getElementById("parentPageIndicator").textContent =
    `Page ${res.pagination.page} of ${parentTotalPages} | ${res.pagination.total} parent records`;
  document.getElementById("parentPrevBtn").disabled = Number(res.pagination.page) <= 1;
  document.getElementById("parentNextBtn").disabled = Number(res.pagination.page) >= parentTotalPages;

  if (!res.parents.length) {
    table.innerHTML = `<tr><td colspan="6">No parent records found.</td></tr>`;
    return;
  }

  table.innerHTML = res.parents.map(item => `
    <tr>
      <td>
        <strong>${escapeHtml(item.first_name)} ${escapeHtml(item.last_name)}</strong><br>
        <span class="muted">${item.has_account ? "Linked account" : "Profile only"}</span>
      </td>
      <td>${escapeHtml(item.email || "-")}<br><span class="muted">${escapeHtml(item.phone_number || "-")}</span></td>
      <td>${item.linked_students}</td>
      <td>${item.has_account ? badge("linked") : "<span class='muted'>No account</span>"}</td>
      <td>${badge(item.status)}</td>
      <td>
        <div class="action-chip-group action-chip-group-compact">
          <button type="button" class="compact-btn" onclick="openEditParent(${item.id})">Edit</button>
          ${!item.has_account ? `<button type="button" class="secondary compact-btn" onclick="openCreateLinkedParentAccount(${item.id})">Create Account</button>` : ""}
        </div>
      </td>
    </tr>
  `).join("");

  window.__parentRows = res.parents;
}

function resetAccountModal() {
  document.getElementById("accountEditId").value = "";
  document.getElementById("accountModalTitle").textContent = "Create Account";
  document.getElementById("accountRole").value = "admin";
  document.getElementById("accountIdentifier").value = "";
  document.getElementById("accountUsername").value = "";
  document.getElementById("accountEmail").value = "";
  document.getElementById("accountPassword").value = "";
  document.getElementById("accountFirstName").value = "";
  document.getElementById("accountMiddleName").value = "";
  document.getElementById("accountLastName").value = "";
  document.getElementById("accountStatus").value = "active";
  document.getElementById("linkedStudentId").value = "";
  document.getElementById("linkedParentId").value = "";
  document.getElementById("accountModalResult").textContent = "";
  updateAccountRoleState();
}

function openEditAccount(id) {
  const item = (window.__accountRows || []).find(row => Number(row.id) === Number(id));
  if (!item) return;

  resetAccountModal();
  document.getElementById("accountModalTitle").textContent = "Edit Account";
  document.getElementById("accountEditId").value = item.id;
  document.getElementById("accountRole").value = item.role;
  document.getElementById("accountIdentifier").value = item.employee_or_student_id || "";
  document.getElementById("accountUsername").value = item.username || "";
  document.getElementById("accountEmail").value = item.email || "";
  document.getElementById("accountFirstName").value = item.first_name || "";
  document.getElementById("accountMiddleName").value = item.middle_name || "";
  document.getElementById("accountLastName").value = item.last_name || "";
  document.getElementById("accountStatus").value = item.status || "active";
  updateAccountRoleState();
  openModal("accountModal");
}

function openCreateLinkedParentAccount(parentId) {
  const item = (window.__parentRows || []).find(row => Number(row.id) === Number(parentId));
  resetAccountModal();
  document.getElementById("accountRole").value = "parent";
  document.getElementById("linkedParentId").value = String(parentId);
  if (item) {
    document.getElementById("accountEmail").value = item.email || "";
    document.getElementById("accountFirstName").value = item.first_name || "";
    document.getElementById("accountMiddleName").value = item.middle_name || "";
    document.getElementById("accountLastName").value = item.last_name || "";
    document.getElementById("accountStatus").value = item.status || "active";
  }
  updateAccountRoleState();
  openModal("accountModal");
}

function updateAccountRoleState() {
  const role = document.getElementById("accountRole").value;
  const studentSelect = document.getElementById("linkedStudentId");
  const parentSelect = document.getElementById("linkedParentId");
  const note = document.getElementById("accountRoleNote");

  studentSelect.classList.toggle("hidden", role !== "student");
  parentSelect.classList.toggle("hidden", role !== "parent");

  if (role === "student") {
    note.textContent = "Student accounts must be linked to an existing student record. Use Student Records to create a new student profile first.";
  } else if (role === "parent") {
    note.textContent = "Parent accounts must be linked to an existing parent record. Create the parent record first if it does not exist yet.";
  } else {
    note.textContent = "Staff roles can be created directly here. Student and parent accounts must be linked to an existing student or parent profile.";
  }
}

async function saveAccount() {
  const editId = document.getElementById("accountEditId").value;
  const payload = {
    role: document.getElementById("accountRole").value,
    employeeOrStudentId: document.getElementById("accountIdentifier").value.trim(),
    username: document.getElementById("accountUsername").value.trim(),
    email: document.getElementById("accountEmail").value.trim(),
    password: document.getElementById("accountPassword").value,
    firstName: document.getElementById("accountFirstName").value.trim(),
    middleName: document.getElementById("accountMiddleName").value.trim(),
    lastName: document.getElementById("accountLastName").value.trim(),
    status: document.getElementById("accountStatus").value,
    studentId: document.getElementById("linkedStudentId").value || null,
    parentId: document.getElementById("linkedParentId").value || null
  };

  const result = document.getElementById("accountModalResult");
  let res;

  if (!editId && payload.role === "student" && !payload.studentId) {
    result.textContent = "Pick an existing student record first. New student profiles must be created from Student Records.";
    return;
  }

  if (!editId && payload.role === "parent" && !payload.parentId) {
    result.textContent = "Pick an existing parent record first, or create the parent profile in Parent Management.";
    return;
  }

  if (editId) {
    delete payload.password;
    res = await apiRequest(`/admin/users/${editId}`, "PUT", payload, true);
  } else {
    if (!payload.password) {
      result.textContent = "Password is required for new accounts.";
      return;
    }
    res = await apiRequest("/admin/users", "POST", payload, true);
  }

  result.textContent = res.success ? "Account saved successfully." : res.message;

  if (res.success) {
    await Promise.all([loadAccounts(), loadParents(), loadOptions()]);
    closeModal("accountModal");
    showFeedback(editId ? "Account Updated" : "Account Created", editId ? "The account details were saved successfully." : "The account was created successfully.");
  }
}

async function toggleAccountStatus(id, status) {
  openConfirmModal(
    status === "inactive" ? "Deactivate Account" : "Activate Account",
    status === "inactive"
      ? "This will disable login access for the selected account. Continue?"
      : "This will restore login access for the selected account. Continue?",
    async () => {
      const res = await apiRequest(`/admin/users/${id}/status`, "PUT", { status }, true);
      if (!res.success) {
        showFeedback("Action Failed", res.message);
        return;
      }

      await Promise.all([loadAccounts(), loadParents()]);
      showFeedback("Status Updated", "The account status was updated successfully.");
    }
  );
}

async function deleteAccount(id, username) {
  openConfirmModal(
    "Delete Account",
    `Delete account "${username}"? Linked student or parent profiles will be kept when possible, but login access will be removed.`,
    async () => {
      const res = await apiRequest(`/admin/users/${id}`, "DELETE", null, true);
      if (!res.success) {
        showFeedback("Delete Failed", res.message);
        return;
      }

      await loadOptions();
      await Promise.all([loadAccounts(), loadParents()]);
      showFeedback("Account Deleted", "The account was deleted successfully.");
    }
  );
}

function openResetModal(id) {
  document.getElementById("resetUserId").value = id;
  document.getElementById("resetPasswordInput").value = "";
  document.getElementById("resetPasswordResult").textContent = "";
  openModal("resetPasswordModal");
}

async function resetPassword() {
  const userId = document.getElementById("resetUserId").value;
  const res = await apiRequest(`/admin/users/${userId}/reset-password`, "PUT", {
    password: document.getElementById("resetPasswordInput").value
  }, true);

  document.getElementById("resetPasswordResult").textContent = res.success
    ? `Password reset successful.${res.temporaryPassword ? ` Temporary password: ${res.temporaryPassword}` : ""}`
    : res.message;

  if (res.success) {
    closeModal("resetPasswordModal");
    showFeedback(
      "Password Reset",
      res.temporaryPassword
        ? `Password reset successful. Temporary password: ${res.temporaryPassword}`
        : "Password reset successful."
    );
  }
}

function openRepairModal(id) {
  const item = (window.__accountRows || []).find(row => Number(row.id) === Number(id));
  if (!item) return;

  document.getElementById("repairUserId").value = item.id;
  document.getElementById("repairAccountLabel").textContent = `${item.first_name} ${item.last_name} | ${item.role} | ${item.username}`;
  document.getElementById("repairStudentId").value = "";
  document.getElementById("repairParentId").value = "";
  document.getElementById("repairResult").textContent = "";
  document.getElementById("repairStudentId").classList.toggle("hidden", item.role !== "student");
  document.getElementById("repairParentId").classList.toggle("hidden", item.role !== "parent");
  openModal("repairLinkModal");
}

async function saveRepairLink() {
  const userId = document.getElementById("repairUserId").value;
  const res = await apiRequest(`/admin/users/${userId}/link-profile`, "POST", {
    studentId: document.getElementById("repairStudentId").value || null,
    parentId: document.getElementById("repairParentId").value || null
  }, true);

  document.getElementById("repairResult").textContent = res.success ? "Account repaired successfully." : res.message;

  if (res.success) {
    await loadOptions();
    await Promise.all([loadAccounts(), loadParents()]);
    closeModal("repairLinkModal");
    showFeedback("Account Repaired", "The account is now linked to the selected profile.");
  }
}

function resetParentModal() {
  document.getElementById("parentEditId").value = "";
  document.getElementById("parentModalTitle").textContent = "Create Parent Record";
  document.getElementById("parentFirstName").value = "";
  document.getElementById("parentMiddleName").value = "";
  document.getElementById("parentLastName").value = "";
  document.getElementById("parentEmail").value = "";
  document.getElementById("parentPhone").value = "";
  document.getElementById("parentAddress").value = "";
  document.getElementById("parentRecordStatus").value = "active";
  document.getElementById("parentCreateAccountCheckbox").checked = false;
  document.getElementById("parentUsername").value = "";
  document.getElementById("parentPassword").value = "";
  document.getElementById("parentModalResult").textContent = "";
}

function openEditParent(id) {
  const item = (window.__parentRows || []).find(row => Number(row.id) === Number(id));
  if (!item) return;

  resetParentModal();
  document.getElementById("parentModalTitle").textContent = "Edit Parent Record";
  document.getElementById("parentEditId").value = item.id;
  document.getElementById("parentFirstName").value = item.first_name || "";
  document.getElementById("parentMiddleName").value = item.middle_name || "";
  document.getElementById("parentLastName").value = item.last_name || "";
  document.getElementById("parentEmail").value = item.email || "";
  document.getElementById("parentPhone").value = item.phone_number || "";
  document.getElementById("parentAddress").value = item.address || "";
  document.getElementById("parentRecordStatus").value = item.status || "active";
  openModal("parentModal");
}

async function saveParent() {
  const editId = document.getElementById("parentEditId").value;
  const payload = {
    firstName: document.getElementById("parentFirstName").value.trim(),
    middleName: document.getElementById("parentMiddleName").value.trim(),
    lastName: document.getElementById("parentLastName").value.trim(),
    email: document.getElementById("parentEmail").value.trim(),
    phoneNumber: document.getElementById("parentPhone").value.trim(),
    address: document.getElementById("parentAddress").value.trim(),
    status: document.getElementById("parentRecordStatus").value
  };

  const result = document.getElementById("parentModalResult");
  let res;

  if (editId) {
    res = await apiRequest(`/admin/parents/${editId}`, "PUT", payload, true);
  } else {
    payload.createAccount = document.getElementById("parentCreateAccountCheckbox").checked;
    payload.username = document.getElementById("parentUsername").value.trim();
    payload.password = document.getElementById("parentPassword").value;
    res = await apiRequest("/admin/parents", "POST", payload, true);
  }

  result.textContent = res.success ? "Parent saved successfully." : res.message;

  if (res.success) {
    await Promise.all([loadParents(), loadOptions()]);
    closeModal("parentModal");
    showFeedback(editId ? "Parent Updated" : "Parent Created", editId ? "The parent record was updated successfully." : "The parent record was created successfully.");
  }
}

async function saveLink() {
  const res = await apiRequest("/admin/links/parent-student", "POST", {
    parentId: document.getElementById("linkParentSelect").value,
    studentId: document.getElementById("linkStudentSelect").value,
    relationship: document.getElementById("linkRelationship").value.trim()
  }, true);

  document.getElementById("linkModalResult").textContent = res.success ? "Link saved successfully." : res.message;
  if (res.success) {
    await Promise.all([loadParents(), loadOptions()]);
    closeModal("linkModal");
    showFeedback("Link Saved", "The parent and student were linked successfully.");
  }
}

document.getElementById("openAccountModalBtn").addEventListener("click", () => {
  resetAccountModal();
  openModal("accountModal");
});
document.getElementById("confirmActionBtn").addEventListener("click", async () => {
  const action = pendingAction;
  pendingAction = null;
  closeModal("confirmActionModal");
  if (action) {
    await action();
  }
});
document.getElementById("closeFeedbackBtn").addEventListener("click", () => closeModal("feedbackModal"));
document.getElementById("accountRole").addEventListener("change", updateAccountRoleState);
document.getElementById("saveAccountBtn").addEventListener("click", saveAccount);
document.getElementById("applyAccountFiltersBtn").addEventListener("click", () => {
  accountPage = 1;
  loadAccounts();
});
document.getElementById("clearAccountFiltersBtn").addEventListener("click", () => {
  document.getElementById("accountSearch").value = "";
  document.getElementById("accountRoleFilter").value = "";
  document.getElementById("accountStatusFilter").value = "";
  accountPage = 1;
  resetAccountDirectory("Filters cleared. Choose a role, status, or search term to show matching accounts.");
});
document.getElementById("accountPrevBtn").addEventListener("click", () => {
  if (accountPage > 1) {
    accountPage -= 1;
    loadAccounts();
  }
});
document.getElementById("accountNextBtn").addEventListener("click", () => {
  if (accountPage < accountTotalPages) {
    accountPage += 1;
    loadAccounts();
  }
});
document.getElementById("parentPrevBtn").addEventListener("click", () => {
  if (parentPage > 1) {
    parentPage -= 1;
    loadParents();
  }
});
document.getElementById("parentNextBtn").addEventListener("click", () => {
  if (parentPage < parentTotalPages) {
    parentPage += 1;
    loadParents();
  }
});
document.getElementById("saveResetPasswordBtn").addEventListener("click", resetPassword);
document.getElementById("saveRepairBtn").addEventListener("click", saveRepairLink);
document.getElementById("openParentModalBtn").addEventListener("click", () => {
  resetParentModal();
  openModal("parentModal");
});
document.getElementById("saveParentBtn").addEventListener("click", saveParent);
document.getElementById("openLinkModalBtn").addEventListener("click", () => {
  document.getElementById("linkRelationship").value = "";
  document.getElementById("linkModalResult").textContent = "";
  openModal("linkModal");
});
document.getElementById("saveLinkBtn").addEventListener("click", saveLink);
document.getElementById("applyParentFiltersBtn").addEventListener("click", () => {
  parentPage = 1;
  const panel = document.getElementById("parentRecordsPanel");
  const shouldLoadDirectly = panel.open || parentRecordsLoaded;
  panel.open = true;
  if (shouldLoadDirectly) {
    loadParents();
  }
});
document.getElementById("clearParentFiltersBtn").addEventListener("click", () => {
  document.getElementById("parentSearch").value = "";
  document.getElementById("parentStatusFilter").value = "";
  parentPage = 1;
  loadParents();
});

loadOptions().then(() => {
  updateAccountRoleState();
  loadAccounts();
  syncParentSummary("-", "-");
});

document.getElementById("parentRecordsPanel").addEventListener("toggle", event => {
  if (event.currentTarget.open && !parentRecordsLoaded) {
    loadParents();
  }
});

document.querySelectorAll(".identity-panel-actions button").forEach(button => {
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
  });
});

