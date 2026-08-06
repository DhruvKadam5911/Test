const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export async function request(endpoint, options = {}, token = null) {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const config = {
    ...options,
    headers,
  };

  try {
    const response = await fetch(url, config);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorMessage = data?.error || `Request failed with status ${response.status}`;
      const error = new Error(errorMessage);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  } catch (err) {
    if (err.status) throw err;
    throw new Error("Unable to connect to streaming server. Please check your network connection.");
  }
}

export const api = {
  get: (endpoint, token) => request(endpoint, { method: "GET" }, token),
  post: (endpoint, body, token) => request(endpoint, { method: "POST", body: JSON.stringify(body) }, token),
  delete: (endpoint, token) => request(endpoint, { method: "DELETE" }, token),
};

export default api;
