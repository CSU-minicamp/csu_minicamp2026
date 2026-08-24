(() => {
  const api = window.MinicampAPI, login = document.getElementById("profile-login"), dashboard = document.getElementById("profile-dashboard");
  let current;
  const show = async () => {
    try {
      const data = await api.request("/api/me"); current = data.participant; if (login) login.hidden = true; if (dashboard) dashboard.hidden = false;
      document.getElementById("profile-name").textContent = current.name; document.getElementById("profile-status").innerHTML = "<strong>" + current.status + "</strong><span>" + (data.team ? data.team.id + " · " + data.team.members.length + " 人" : "尚未确认队伍") + "</span>";
      const form = document.getElementById("profile-edit-form"); for (const [name,value] of Object.entries(current)) { const field = form.elements[name]; if (field && field.type !== "checkbox" && field.type !== "radio") field.value = value || ""; }
      form.querySelectorAll('input[name="hasTeamIntent"]').forEach(input => input.checked = input.value === (current.hasTeamIntent || "否")); const intentNameField = document.getElementById("profile-team-intent-name-field"); intentNameField.classList.toggle("hidden", current.hasTeamIntent !== "是"); intentNameField.querySelector("input").required = current.hasTeamIntent === "是";
      form.querySelectorAll('input[name="skills"]').forEach(input => input.checked = (current.skills || []).includes(input.value));
      document.getElementById("last-updated").textContent = current.updatedAt ? new Date(current.updatedAt).toLocaleString("zh-CN") : "已提交";
      await renderNotices();
    } catch { if (dashboard) location.replace("profile.html"); }
  };
  async function renderNotices() { const {notices} = await api.request("/api/me/notices"); const list = document.getElementById("notice-list"); const unread = notices.filter(item => !(item.readBy || []).includes(current.id)).length; document.getElementById("notice-count").textContent = unread; list.innerHTML = notices.map(item => { const read = (item.readBy || []).includes(current.id); return "<article class='notice-item " + (read ? "is-read" : "is-unread") + "'><div class='notice-marker'>" + (read ? "✓" : "!") + "</div><div><div class='notice-meta'><span>" + item.type + "</span><time>" + new Date(item.createdAt).toLocaleString("zh-CN") + "</time></div><h3>" + item.title + "</h3><p>" + item.body + "</p></div></article>"; }).join("") || "<p>暂无通知</p>"; }
  document.getElementById("profile-login-form")?.addEventListener("submit", async event => { event.preventDefault(); const id = document.getElementById("login-id").value.trim(), contact = document.getElementById("login-contact").value.trim(); try { await api.participantLogin(id,contact); location.assign("profile-dashboard.html"); } catch (err) { document.getElementById("login-error").textContent = err.message; } });
  document.getElementById("profile-edit-form")?.addEventListener("submit", async event => { event.preventDefault(); const form = event.currentTarget, data = new FormData(form), payload = Object.fromEntries(data.entries()); payload.skills = data.getAll("skills"); delete payload.consent; try { await api.request("/api/me",{method:"PATCH",body:JSON.stringify(payload)}); document.getElementById("edit-save-state").textContent = "已保存，等待主办方复核。"; await show(); } catch (err) { document.getElementById("edit-error").textContent = err.message; } });
  document.querySelectorAll('input[name="hasTeamIntent"]').forEach(input => input.addEventListener("change", () => { const field = document.getElementById("profile-team-intent-name-field"), show = input.checked && input.value === "是"; field.classList.toggle("hidden", !show); field.querySelector("input").required = show; if (!show) field.querySelector("input").value = ""; }));
  document.querySelectorAll("[data-profile-panel]").forEach(button => button.addEventListener("click", () => { document.querySelectorAll("[data-profile-panel]").forEach(item => item.classList.toggle("active", item === button)); document.querySelectorAll(".profile-panel").forEach(panel => panel.classList.toggle("active", panel.id === button.dataset.profilePanel)); }));
  document.getElementById("mark-read")?.addEventListener("click", async () => { await api.request("/api/me/notices/read",{method:"POST"}); await renderNotices(); });
  document.getElementById("profile-logout")?.addEventListener("click", () => { api.logout(); location.reload(); });
  if (dashboard) show();
  else if (api.getToken()) api.request("/api/me").then(() => location.replace("profile-dashboard.html")).catch(() => api.logout());
})();
