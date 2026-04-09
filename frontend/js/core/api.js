const API_BASE_URL = "http://localhost:5000/api";

async function apiRequest(endpoint, method = "GET", body = null, auth = false) {
  const isFormData = body instanceof FormData;
  const headers = {};

  if (!isFormData) {
    headers["Content-Type"] = "application/json";
  }

  if (auth) {
    const token = localStorage.getItem("token");
    if (token) {
      headers["Authorization"] = "Bearer " + token;
    }
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method,
    headers,
    body: body ? (isFormData ? body : JSON.stringify(body)) : null
  });

  const data = await response.json();
  return data;
}
