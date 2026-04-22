const BASE_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

export function getToken() {
  return localStorage.getItem("authToken") || "";
}

export function setToken(token) {
  if (!token) localStorage.removeItem("authToken");
  else localStorage.setItem("authToken", token);
}

export async function apiFetch(path, { method = "GET", body, auth = false, headers } = {}) {
  const url = `${BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const h = { ...(headers || {}) };
  if (body !== undefined) h["Content-Type"] = "application/json";
  if (auth) {
    const token = getToken();
    if (token) h.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method,
    headers: h,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = json;
    throw err;
  }
  return json;
}

export async function apiDelete(path, { auth = true } = {}) {
  return apiFetch(path, { method: "DELETE", auth });
}

// For multipart/form-data uploads (videos, audio)
export async function apiUploadFile(path, formData) {
  const url = `${BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const token = getToken();
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { method: "POST", headers, body: formData });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json?.error || `Upload failed (${res.status})`);
    err.status = res.status;
    err.data = json;
    throw err;
  }
  return json;
}

