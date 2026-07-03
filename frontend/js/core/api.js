const API_BASE_URL = "http://localhost:5000/api";

const AppProgress = (() => {
  let activeRequests = 0;
  let progressValue = 0;
  let showTimer = null;
  let hideTimer = null;
  let tickTimer = null;

  function ensureElement() {
    let bar = document.querySelector(".system-progress");
    if (bar) {
      return bar;
    }

    bar = document.createElement("div");
    bar.className = "system-progress";
    bar.setAttribute("role", "progressbar");
    bar.setAttribute("aria-valuemin", "0");
    bar.setAttribute("aria-valuemax", "100");
    bar.setAttribute("aria-hidden", "true");
    bar.innerHTML = `
      <div class="system-progress-track">
        <span class="system-progress-fill"></span>
      </div>
      <span class="system-progress-label">Working...</span>
    `;
    document.body.appendChild(bar);
    return bar;
  }

  function setProgress(value) {
    const bar = ensureElement();
    progressValue = Math.max(0, Math.min(100, value));
    bar.setAttribute("aria-valuenow", String(Math.round(progressValue)));
    bar.querySelector(".system-progress-fill").style.width = `${progressValue}%`;
  }

  function show(label) {
    const bar = ensureElement();
    clearTimeout(hideTimer);
    bar.querySelector(".system-progress-label").textContent = label || "Working...";
    bar.classList.add("is-visible");
    bar.setAttribute("aria-hidden", "false");
    setProgress(Math.max(progressValue, 8));

    clearInterval(tickTimer);
    tickTimer = setInterval(() => {
      const nextValue = progressValue < 55
        ? progressValue + 8
        : progressValue < 82
          ? progressValue + 3
          : progressValue + 0.6;
      setProgress(Math.min(nextValue, 92));
    }, 420);
  }

  function start(label = "Working...") {
    activeRequests += 1;
    clearTimeout(hideTimer);

    if (activeRequests === 1) {
      progressValue = 0;
      clearTimeout(showTimer);
      showTimer = setTimeout(() => show(label), 280);
    } else if (document.querySelector(".system-progress.is-visible")) {
      ensureElement().querySelector(".system-progress-label").textContent = label;
    }

    let finished = false;
    return () => {
      if (finished) {
        return;
      }
      finished = true;
      activeRequests = Math.max(0, activeRequests - 1);

      if (activeRequests > 0) {
        return;
      }

      clearTimeout(showTimer);
      clearInterval(tickTimer);
      const bar = document.querySelector(".system-progress");
      if (!bar) {
        return;
      }

      if (!bar.classList.contains("is-visible")) {
        return;
      }

      setProgress(100);
      hideTimer = setTimeout(() => {
        bar.classList.remove("is-visible");
        bar.setAttribute("aria-hidden", "true");
        setProgress(0);
      }, 360);
    };
  }

  return { start };
})();

window.AppProgress = AppProgress;

function getApiProgressLabel(endpoint, method) {
  const normalizedMethod = String(method || "GET").toUpperCase();
  const path = String(endpoint || "").toLowerCase();

  if (path.includes("bulk-delete")) return "Deleting selected records...";
  if (path.includes("bulk-import")) return "Creating reviewed records and accounts...";
  if (path.includes("masterlist-ocr")) return "Scanning masterlist image...";
  if (path.includes("evidence/upload") || path.includes("avatar")) return "Uploading file...";
  if (path.includes("sms-settings")) return "Saving SMS settings...";
  if (path.includes("email-settings")) return "Saving email settings...";
  if (normalizedMethod !== "GET") return "Saving changes...";
  return "Loading data...";
}

async function apiRequest(endpoint, method = "GET", body = null, auth = false, options = {}) {
  const isFormData = body instanceof FormData;
  const headers = {};
  const finishProgress = options.progress === false
    ? null
    : AppProgress.start(options.progressLabel || getApiProgressLabel(endpoint, method));

  if (!isFormData) {
    headers["Content-Type"] = "application/json";
  }

  if (auth) {
    const token = localStorage.getItem("token");
    if (token) {
      headers["Authorization"] = "Bearer " + token;
    }
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method,
      headers,
      body: body ? (isFormData ? body : JSON.stringify(body)) : null
    });

    const data = await response.json();
    return data;
  } finally {
    if (finishProgress) {
      finishProgress();
    }
  }
}
