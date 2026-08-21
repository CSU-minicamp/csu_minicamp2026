(function () {
  const APPLICATION_KEY = "minicamp2026_applications";
  const NOTIFICATION_KEY = "minicamp2026_notifications";
  const SESSION_KEY = "minicamp2026_profile_session";
  const demoApplications = [{ id: "MC26-1001", name: "陈知行", studentId: "8201230001", college: "计算机学院", major: "软件工程 · 大二", phone: "13800004021", email: "zhixing@example.com", entryType: "个人报名", teamCode: "", skills: ["DEV", "AI/DATA"], motivation: "想做一个真正有人使用的校园工具。", experience: "课程项目：校园失物招领小程序", portfolio: "", status: "待审核", teamId: "", createdAt: new Date().toISOString() }];
  function ensureApplications() {
    const stored = localStorage.getItem(APPLICATION_KEY);
    if (!stored) localStorage.setItem(APPLICATION_KEY, JSON.stringify(demoApplications));
  }
  ensureApplications();
  const applications = () => JSON.parse(localStorage.getItem(APPLICATION_KEY) || "[]");
  const saveApplications = value => localStorage.setItem(APPLICATION_KEY, JSON.stringify(value));
  const readNotifications = () => JSON.parse(localStorage.getItem(NOTIFICATION_KEY) || "[]");
  const saveNotifications = value => localStorage.setItem(NOTIFICATION_KEY, JSON.stringify(value));
  const login = document.getElementById("profile-login");
  const dashboard = document.getElementById("profile-dashboard");
  const loginForm = document.getElementById("profile-login-form");
  let currentApplication = null;

  function notification(id, title, body, type = "系统通知", target = "ALL") {
    return { id, title, body, type, target, readBy: [], createdAt: new Date().toISOString() };
  }

  function ensureNotifications() {
    let notices = readNotifications();
    if (!notices.length) {
      notices = [
        notification("notice-welcome", "欢迎来到 minicamp 2026", "报名资料提交后，你可以在个人主页修改信息并查看主办方通知。", "活动公告"),
        notification("notice-date", "活动日期已确定", "minicamp 2026 将于 2026 年 9 月 12 日至 13 日在中南大学潇湘校区信息楼 508 举行。", "活动公告")
      ];
      saveNotifications(notices);
    }
  }
  ensureNotifications();

  loginForm.addEventListener("submit", event => {
    event.preventDefault();
    const id = document.getElementById("login-id").value.trim().toUpperCase();
    const contact = document.getElementById("login-contact").value.trim().toLowerCase();
    if (!id) {
      document.getElementById("login-error").textContent = "请填写报名成功页显示的申请编号。申请编号不是手机号，例如 MC26-1005。";
      document.getElementById("login-id").focus();
      return;
    }
    if (!contact) {
      document.getElementById("login-error").textContent = "请填写报名时使用的手机号或邮箱。";
      document.getElementById("login-contact").focus();
      return;
    }
    const normalize = value => String(value || "").toLowerCase().replace(/[\s-]/g, "");
    const found = applications().find(item => item.id.toUpperCase() === id && [item.email, item.phone].some(value => normalize(value) === normalize(contact)));
    if (!found) {
      const idExists = applications().some(item => item.id.toUpperCase() === id);
      document.getElementById("login-error").textContent = idExists ? "申请编号存在，但联系方式不匹配。请使用报名时填写的手机号或邮箱；演示账号可使用 zhixing@example.com。" : "没有找到这个申请编号。请使用报名成功页显示的最新编号，而不是示例编号 MC26-1001。";
      return;
    }
    currentApplication = found;
    localStorage.setItem(SESSION_KEY, found.id);
    showDashboard();
  });

  function showDashboard() {
    login.hidden = true;
    dashboard.hidden = false;
    document.getElementById("profile-name").textContent = currentApplication.name;
    renderStatus();
    fillForm();
    renderNotices();
  }

  function renderStatus() {
    const status = currentApplication.status || "待审核";
    const details = {
      "已录取": ["已录取 · 期待现场见", "你的报名已通过审核。后续活动提醒、AI Coding Starter Pack 和现场安排会在这里更新。", "status-accepted"],
      "候补": ["候补中 · 请留意通知", "当前名额还在动态确认中，主办方会通过通知中心更新结果。", "status-waitlist"],
      "待复审": ["资料已更新 · 等待复核", "你刚刚重新提交了报名资料，主办方会在复核后更新状态。", "status-review"],
      "待审核": ["资料已提交 · 等待审核", "主办方会根据创造欲、合作意愿和能力结构进行轻筛选。", "status-pending"]
    }[status] || [status, "主办方会在通知中心同步最新进展。", "status-pending"];
    document.getElementById("profile-status").innerHTML = `<span class="profile-status-icon ${details[2]}">${status === "已录取" ? "✓" : "!"}</span><div><strong>${details[0]}</strong><p>${details[1]}</p></div><span class="profile-status-id">${currentApplication.id}</span>`;
  }

  function fillForm() {
    const form = document.getElementById("profile-edit-form");
    ["name", "studentId", "college", "major", "phone", "email", "teamCode", "motivation", "experience", "portfolio"].forEach(name => { if (form.elements[name]) form.elements[name].value = currentApplication[name] || ""; });
    const entry = Array.from(form.querySelectorAll('input[name="entryType"]')).find(input => input.value === (currentApplication.entryType || "个人报名"));
    if (entry) entry.checked = true;
    form.querySelectorAll('input[name="skills"]').forEach(input => { input.checked = (currentApplication.skills || []).includes(input.value); });
    document.getElementById("last-updated").textContent = currentApplication.updatedAt ? `最近更新 ${formatTime(currentApplication.updatedAt)}` : `提交于 ${formatTime(currentApplication.createdAt)}`;
  }

  document.getElementById("profile-edit-form").addEventListener("submit", event => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.elements.name.value.trim() || !form.elements.email.value.trim() || !form.elements.motivation.value.trim()) { document.getElementById("edit-error").textContent = "姓名、邮箱和参与动机不能为空。"; return; }
    if (!form.elements.email.checkValidity()) { document.getElementById("edit-error").textContent = "请填写有效的邮箱地址。"; return; }
    const checkedSkills = Array.from(form.querySelectorAll('input[name="skills"]:checked')).map(input => input.value);
    if (checkedSkills.length > 2) { document.getElementById("edit-error").textContent = "能力标签最多选择 2 项。"; return; }
    const all = applications();
    const index = all.findIndex(item => item.id === currentApplication.id);
    const data = new FormData(form);
    const updated = { ...all[index], name: data.get("name"), studentId: data.get("studentId"), college: data.get("college"), major: data.get("major"), phone: data.get("phone"), email: data.get("email"), entryType: data.get("entryType"), teamCode: data.get("teamCode"), skills: checkedSkills, motivation: data.get("motivation"), experience: data.get("experience"), portfolio: data.get("portfolio"), status: "待复审", updatedAt: new Date().toISOString() };
    all[index] = updated; saveApplications(all); currentApplication = updated;
    const notices = readNotifications(); notices.unshift(notification(`notice-edit-${Date.now()}`, "资料修改已提交", "你的最新报名资料已经提交给主办方，审核状态已更新为“待复审”。", "资料复核", currentApplication.id)); saveNotifications(notices);
    document.getElementById("edit-error").textContent = ""; document.getElementById("edit-save-state").textContent = "已保存并提交复核 · " + formatTime(updated.updatedAt); renderStatus(); renderNotices(); showToast("资料已重新提交");
  });

  document.querySelectorAll("[data-profile-panel]").forEach(button => button.addEventListener("click", () => switchPanel(button.dataset.profilePanel)));
  document.getElementById("mark-read").addEventListener("click", () => { const notices = readNotifications(); notices.forEach(item => { if (item.target === "ALL" || item.target === currentApplication.id) item.readBy = Array.from(new Set([...(item.readBy || []), currentApplication.id])); }); saveNotifications(notices); renderNotices(); showToast("通知已全部标为已读"); });
  document.getElementById("profile-logout").addEventListener("click", () => { localStorage.removeItem(SESSION_KEY); currentApplication = null; dashboard.hidden = true; login.hidden = false; loginForm.reset(); });

  function switchPanel(panelId) { document.querySelectorAll("[data-profile-panel]").forEach(button => button.classList.toggle("active", button.dataset.profilePanel === panelId)); document.querySelectorAll(".profile-panel").forEach(panel => panel.classList.toggle("active", panel.id === panelId)); }
  function renderNotices() {
    const visible = readNotifications().filter(item => item.target === "ALL" || item.target === currentApplication.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const unread = visible.filter(item => !(item.readBy || []).includes(currentApplication.id)).length;
    document.getElementById("notice-count").textContent = unread;
    document.getElementById("notice-list").innerHTML = visible.length ? visible.map(item => { const read = (item.readBy || []).includes(currentApplication.id); return `<article class="notice-item ${read ? "is-read" : "is-unread"}"><div class="notice-marker">${read ? "✓" : "!"}</div><div><div class="notice-meta"><span>${item.type}</span><time>${formatTime(item.createdAt)}</time></div><h3>${item.title}</h3><p>${item.body}</p></div></article>`; }).join("") : `<div class="empty-state">暂时没有通知</div>`;
  }

  const session = localStorage.getItem(SESSION_KEY);
  if (session) { const restored = applications().find(item => item.id === session); if (restored) { currentApplication = restored; showDashboard(); } }
  function formatTime(value) { const date = new Date(value); return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`; }
  function showToast(message) { const toast = document.getElementById("profile-toast"); toast.textContent = message; toast.classList.add("show"); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove("show"), 2200); }
})();
