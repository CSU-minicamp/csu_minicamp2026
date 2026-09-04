(() => {
  const api = window.MinicampAPI, login = document.getElementById("profile-login"), dashboard = document.getElementById("profile-dashboard");
  let current;
  const params = new URLSearchParams(location.search);
  const returnTo = params.get("returnTo") || "";
  const profileRequired = params.get("profileRequired") === "1";
  const activatePanel = id => { document.querySelectorAll("[data-profile-panel]").forEach(item => item.classList.toggle("active", item.dataset.profilePanel === id)); document.querySelectorAll(".profile-panel").forEach(panel => panel.classList.toggle("active", panel.id === id)); };
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  const show = async () => {
    try {
      const data = await api.request("/api/me"); current = data.participant; if (login) login.hidden = true; if (dashboard) dashboard.hidden = false;
      document.getElementById("profile-name").textContent = current.name; document.getElementById("profile-status").innerHTML = "<strong>" + current.status + "</strong><span>" + (data.team ? data.team.id + " · " + data.team.members.length + " 人" : "尚未确认队伍") + "</span>"; if (profileRequired && !api.isProfileComplete(current)) { activatePanel("profile-details"); document.getElementById("edit-save-state").textContent = "请先完善所有必填个人信息，再继续。"; }
      const form = document.getElementById("profile-edit-form"); for (const [name,value] of Object.entries(current)) { const field = form.elements[name]; if (field && field.type !== "checkbox" && field.type !== "radio") field.value = value || ""; }
      form.querySelectorAll('input[name="skills"]').forEach(input => input.checked = (current.skills || []).includes(input.value));
      document.getElementById("last-updated").textContent = current.updatedAt ? new Date(current.updatedAt).toLocaleString("zh-CN") : "已提交";
      await renderNotices();
      await renderVote();
    } catch { if (dashboard) location.replace("profile.html"); }
  };
  async function renderNotices() { const {notices} = await api.request("/api/me/notices"); const list = document.getElementById("notice-list"); const unread = notices.filter(item => !(item.readBy || []).includes(current.id)).length; document.getElementById("notice-count").textContent = unread; list.innerHTML = notices.map(item => { const read = (item.readBy || []).includes(current.id); return "<article class='notice-item " + (read ? "is-read" : "is-unread") + "'><div class='notice-marker'>" + (read ? "✓" : "!") + "</div><div><div class='notice-meta'><span>" + item.type + "</span><time>" + new Date(item.createdAt).toLocaleString("zh-CN") + "</time></div><h3>" + item.title + "</h3><p>" + item.body + "</p></div></article>"; }).join("") || "<p>暂无通知</p>"; }
  async function renderVote() {
    const container = document.getElementById("my-vote-content");
    if (!container) return;
    const {vote, voteOpen} = await api.request("/api/me/vote");
    if (!vote) {
      container.innerHTML = "<div class='my-vote-empty'><span>○</span><div><strong>" + (voteOpen ? "你还没有投票。" : "投票暂未开放。") + "</strong><p>" + (voteOpen ? "浏览作品后，为你喜欢的项目投出一票。" : "主办方设置开始时间后，这里会显示投票入口。") + "</p>" + (voteOpen ? "<a class='button button-primary' href='vote.html'>去投票 <span>↗</span></a>" : "") + "</div></div>";
      return;
    }
    const groups = vote.selections.reduce((result, selection) => {
      (result[selection.award] ||= []).push(selection);
      return result;
    }, {});
    container.innerHTML = "<div class='my-vote-record'><div class='my-vote-record-head'><span>已于 " + new Date(vote.createdAt).toLocaleString("zh-CN") + " 提交</span><b>已锁定</b></div>" + Object.entries(groups).map(([award, selections]) =>
      "<section><h3>" + award + "</h3><ol>" + selections.sort((a, b) => b.points - a.points).map(selection =>
        "<li><span>" + escapeHtml(selection.projectName) + "</span><strong>" + selection.points + " 票</strong></li>"
      ).join("") + "</ol></section>"
    ).join("") + "</div>";
  }
  document.getElementById("profile-login-form")?.addEventListener("submit", async event => { event.preventDefault(); const id = document.getElementById("login-id").value.trim(), contact = document.getElementById("login-contact").value.trim(); try { await api.participantLogin(id,contact); location.assign(returnTo || "profile-dashboard.html"); } catch (err) { document.getElementById("login-error").textContent = err.message; } });
document.getElementById("profile-edit-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget, data = new FormData(form), payload = Object.fromEntries(data.entries());
    payload.skills = data.getAll("skills");
    delete payload.consent;
    const saveState = document.getElementById("edit-save-state");
    const editError = document.getElementById("edit-error");
    editError.textContent = "";
    if (!api.isProfileComplete(payload)) {
      editError.textContent = "请先填写姓名、学号、学院、专业与年级、手机号、邮箱和参与动机。";
      return;
    }
    try {
      await api.request("/api/me", {method:"PATCH", body:JSON.stringify(payload)});
      if (returnTo) { location.assign(returnTo); return; }
      saveState.textContent = "已保存，等待主办方复核。";
      await show();
    } catch (err) { editError.textContent = err.message; }
  });
  document.querySelectorAll("[data-profile-panel]").forEach(button => button.addEventListener("click", () => { document.querySelectorAll("[data-profile-panel]").forEach(item => item.classList.toggle("active", item === button)); document.querySelectorAll(".profile-panel").forEach(panel => panel.classList.toggle("active", panel.id === button.dataset.profilePanel)); }));
  document.getElementById("mark-read")?.addEventListener("click", async () => { await api.request("/api/me/notices/read",{method:"POST"}); await renderNotices(); });
  document.getElementById("profile-logout")?.addEventListener("click", () => { api.logout(); location.reload(); });
  if (dashboard) show();
  else if (api.getToken()) api.request("/api/me").then(() => { const destination = returnTo ? "profile-dashboard.html?returnTo=" + encodeURIComponent(returnTo) + "&profileRequired=1" : "profile-dashboard.html"; location.replace(destination); }).catch(() => api.logout());
})();
