window.MinicampAPI = (() => {
  const key = "minicamp2026_token";
  const adminKey = "minicamp2026_admin_token";
  const getToken = () => localStorage.getItem(key) || "";
  const setToken = value => value ? localStorage.setItem(key, value) : localStorage.removeItem(key);
  const getAdminToken = () => localStorage.getItem(adminKey) || "";
  const setAdminToken = value => value ? localStorage.setItem(adminKey, value) : localStorage.removeItem(adminKey);
  const profileFields = ["name", "studentId", "college", "major", "grade", "phone", "email", "motivation"];
  const isProfileComplete = participant => Boolean(participant && profileFields.every(field => String(participant[field] || "").trim()));
  const profileReturnUrl = () => location.pathname.split("/").pop() + location.search + location.hash;
  const redirectToProfile = (returnTo = profileReturnUrl()) => {
    const query = new URLSearchParams({ returnTo, profileRequired: "1" });
    location.replace("profile.html?" + query.toString());
  };
  async function requireProfile(returnTo = profileReturnUrl()) {
    try {
      const data = await request("/api/me");
      if (!isProfileComplete(data.participant)) {
        redirectToProfile(returnTo);
        return null;
      }
      return data;
    } catch {
      redirectToProfile(returnTo);
      return null;
    }
  }
  async function request(path, options = {}) {
    const headers = {"Content-Type":"application/json", ...(options.headers || {})};
    const token = options.authRole === "admin" ? getAdminToken() : getToken();
    if (token) headers.Authorization = "Bearer " + token;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(path, {...options, headers, signal: controller.signal});
      const raw = await response.text();
      let data = {};
      const contentType = response.headers.get("content-type") || "";
      try { data = raw && contentType.includes("json") ? JSON.parse(raw) : {}; } catch { data = {}; }
      if (!contentType.includes("json") && !response.ok) throw new Error("API 路由未配置（HTTP " + response.status + "），请确认域名已反向代理到 Node 服务。");
      if (!response.ok) throw new Error(data.error || "请求失败（HTTP " + response.status + "）");
      return data;
    } catch (error) {
      if (error.name === "AbortError") throw new Error("请求超时，请检查服务是否正在运行。");
      if (error instanceof TypeError) throw new Error("无法连接服务器，请确认使用 http://localhost:4173 打开网站。");
      throw error;
    } finally { clearTimeout(timeout); }
  }
  const adminRequest = (path, options = {}) => request(path, {...options, authRole: "admin"});
  return {request, adminRequest, getToken, setToken, getAdminToken, setAdminToken, isProfileComplete, requireProfile, redirectToProfile, participantLogin: async (id, contact) => { const data = await request("/api/auth/participant",{method:"POST",body:JSON.stringify({id,contact})}); setToken(data.token); return data; }, logout: () => setToken(""), adminLogout: () => setAdminToken("")};
})();
