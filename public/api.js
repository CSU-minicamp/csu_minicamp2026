window.MinicampAPI = (() => {
  const key = "minicamp2026_token";
  const getToken = () => localStorage.getItem(key) || "";
  const setToken = value => value ? localStorage.setItem(key, value) : localStorage.removeItem(key);
  async function request(path, options = {}) {
    const headers = {"Content-Type":"application/json", ...(options.headers || {})};
    const token = getToken();
    if (token) headers.Authorization = "Bearer " + token;
    const response = await fetch(path, {...options, headers});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "请求失败");
    return data;
  }
  return {request, getToken, setToken, participantLogin: async (id, contact) => { const data = await request("/api/auth/participant",{method:"POST",body:JSON.stringify({id,contact})}); setToken(data.token); return data; }, logout: () => setToken("")};
})();
