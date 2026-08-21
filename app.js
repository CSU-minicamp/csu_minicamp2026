(function () {
  const STORAGE_KEY = "minicamp2026_applications";
  const TEAM_KEY = "minicamp2026_teams";
  const VOTE_KEY = "minicamp2026_votes";
  const NOTIFICATION_KEY = "minicamp2026_notifications";

  const seedApplications = [
    { id: "MC26-1001", name: "陈知行", studentId: "8201230001", college: "计算机学院", major: "软件工程 · 大二", phone: "138****4021", email: "zhixing@example.com", entryType: "个人报名", teamCode: "", skills: ["DEV", "AI/DATA"], motivation: "想做一个真正有人使用的校园工具。", experience: "课程项目：校园失物招领小程序", portfolio: "", status: "待审核", teamId: "", createdAt: "2026-08-17T10:20:00+08:00" },
    { id: "MC26-1002", name: "林若晴", studentId: "8301230002", college: "建筑与艺术学院", major: "视觉传达 · 大三", phone: "139****5218", email: "ruoqing@example.com", entryType: "结伴报名", teamCode: "MC26-A7K2", skills: ["DESIGN", "CREATIVE"], motivation: "想认识技术同学，把交互概念做成真的。", experience: "社团品牌设计、个人作品集", portfolio: "https://example.com", status: "已录取", teamId: "TEAM 03", createdAt: "2026-08-16T14:05:00+08:00" },
    { id: "MC26-1003", name: "周骁", studentId: "8101230003", college: "自动化学院", major: "自动化 · 大二", phone: "137****8860", email: "zhou@example.com", entryType: "结伴报名", teamCode: "MC26-A7K2", skills: ["HARDWARE", "DEV"], motivation: "想尝试用传感器做一个有趣的校园装置。", experience: "智能车竞赛", portfolio: "", status: "已录取", teamId: "TEAM 03", createdAt: "2026-08-16T14:18:00+08:00" },
    { id: "MC26-1004", name: "叶思源", studentId: "8401230004", college: "商学院", major: "工商管理 · 大一", phone: "136****7304", email: "siyuan@example.com", entryType: "个人报名", teamCode: "", skills: ["PRODUCT", "BUSINESS"], motivation: "想学习如何从用户问题出发做产品。", experience: "参与校园公益项目", portfolio: "", status: "候补", teamId: "", createdAt: "2026-08-15T19:42:00+08:00" }
  ];
  const seedTeams = [
    { id: "TEAM 03", code: "MC26-A7K2", project: "暂未命名", theme: "待揭晓", memberIds: ["MC26-1002", "MC26-1003"] }
  ];
  const seedVotes = [
    { team: "TEAM 01", project: "Campus Pulse", overall: 42, product: 36, design: 25, technical: 31, unexpected: 18, people: 47 },
    { team: "TEAM 03", project: "暂未命名", overall: 18, product: 22, design: 39, technical: 28, unexpected: 15, people: 33 },
    { team: "TEAM 07", project: "Next Seat", overall: 35, product: 41, design: 27, technical: 22, unexpected: 30, people: 38 }
  ];

  function initializeData() {
    if (!localStorage.getItem(STORAGE_KEY)) localStorage.setItem(STORAGE_KEY, JSON.stringify(seedApplications));
    if (!localStorage.getItem(TEAM_KEY)) localStorage.setItem(TEAM_KEY, JSON.stringify(seedTeams));
    if (!localStorage.getItem(VOTE_KEY)) localStorage.setItem(VOTE_KEY, JSON.stringify(seedVotes));
    if (!localStorage.getItem(NOTIFICATION_KEY)) localStorage.setItem(NOTIFICATION_KEY, JSON.stringify([
      { id: "notice-welcome", title: "欢迎来到 minicamp 2026", body: "报名资料提交后，你可以在个人主页修改信息并查看主办方通知。", type: "活动公告", target: "ALL", readBy: [], createdAt: new Date().toISOString() },
      { id: "notice-date", title: "活动日期已确定", body: "minicamp 2026 将于 2026 年 9 月 12 日至 13 日在中南大学潇湘校区信息楼 508 举行。", type: "活动公告", target: "ALL", readBy: [], createdAt: new Date().toISOString() }
    ]));
  }

  initializeData();

  const navToggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".site-nav");
  navToggle?.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    navToggle.setAttribute("aria-expanded", String(open));
  });
  nav?.querySelectorAll("a").forEach(link => link.addEventListener("click", () => {
    nav.classList.remove("open");
    navToggle?.setAttribute("aria-expanded", "false");
  }));

  document.querySelectorAll(".day-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".day-tab").forEach(item => {
        item.classList.toggle("active", item === tab);
        item.setAttribute("aria-selected", String(item === tab));
      });
      document.querySelectorAll(".timeline-panel").forEach(panel => {
        const active = panel.id === tab.dataset.day;
        panel.classList.toggle("active", active);
        panel.hidden = !active;
      });
    });
  });

  const form = document.getElementById("application-form");
  if (!form) return;
  const steps = Array.from(form.querySelectorAll(".form-step"));
  const progress = document.getElementById("form-progress");
  const prevButton = document.getElementById("prev-step");
  const nextButton = document.getElementById("next-step");
  const submitButton = document.getElementById("submit-application");
  const error = document.getElementById("form-error");
  const teamCodeField = document.getElementById("team-code-field");
  let currentStep = 1;

  function showStep(step) {
    currentStep = step;
    steps.forEach(item => {
      const active = Number(item.dataset.step) === step;
      item.classList.toggle("active", active);
      item.hidden = !active;
    });
    progress.textContent = `步骤 ${step} / 3`;
    prevButton.classList.toggle("hidden", step === 1);
    nextButton.classList.toggle("hidden", step === 3);
    submitButton.classList.toggle("hidden", step !== 3);
    error.textContent = "";
  }

  function validateStep(step) {
    const current = steps[step - 1];
    const required = current.querySelectorAll("[required]");
    for (const field of required) {
      if (!field.checkValidity()) {
        field.focus();
        error.textContent = field.type === "email" ? "请填写有效的邮箱地址。" : "请完成当前步骤中的必填信息。";
        return false;
      }
    }
    if (step === 2 && form.querySelectorAll('input[name="skills"]:checked').length === 0) {
      error.textContent = "请至少选择一项能力标签。";
      return false;
    }
    return true;
  }

  nextButton.addEventListener("click", () => {
    if (validateStep(currentStep)) showStep(currentStep + 1);
  });
  prevButton.addEventListener("click", () => showStep(currentStep - 1));

  form.querySelectorAll('input[name="entryType"]').forEach(radio => {
    radio.addEventListener("change", () => teamCodeField.classList.toggle("hidden", radio.value === "个人报名"));
  });

  document.getElementById("generate-code").addEventListener("click", () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "MC26-";
    for (let i = 0; i < 4; i += 1) code += chars[Math.floor(Math.random() * chars.length)];
    document.getElementById("teamCode").value = code;
    showToast(`已生成 Team Code：${code}`);
  });

  const skillInputs = form.querySelectorAll('input[name="skills"]');
  skillInputs.forEach(input => input.addEventListener("change", () => {
    const checked = form.querySelectorAll('input[name="skills"]:checked');
    if (checked.length > 2) {
      input.checked = false;
      showToast("能力标签最多选择 2 项");
    }
  }));

  form.addEventListener("submit", event => {
    event.preventDefault();
    if (!validateStep(3)) return;
    const data = new FormData(form);
    const applications = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    const id = `MC26-${String(1001 + applications.length).padStart(4, "0")}`;
    const application = {
      id,
      name: data.get("name"),
      studentId: data.get("studentId"),
      college: data.get("college"),
      major: data.get("major"),
      phone: data.get("phone"),
      email: data.get("email"),
      entryType: data.get("entryType"),
      teamCode: (data.get("teamCode") || "").toUpperCase(),
      skills: data.getAll("skills"),
      motivation: data.get("motivation"),
      experience: data.get("experience"),
      portfolio: data.get("portfolio"),
      status: "待审核",
      teamId: "",
      createdAt: new Date().toISOString()
    };
    applications.unshift(application);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(applications));
    localStorage.setItem("minicamp2026_profile_session", id);
    const notices = JSON.parse(localStorage.getItem(NOTIFICATION_KEY) || "[]");
    notices.unshift({ id: `notice-submit-${Date.now()}`, title: "报名资料已提交", body: "你的报名资料已经收到。后续审核状态和活动公告会在个人主页通知中心更新。", type: "报名进度", target: id, readBy: [], createdAt: new Date().toISOString() });
    localStorage.setItem(NOTIFICATION_KEY, JSON.stringify(notices));
    form.hidden = true;
    document.getElementById("form-success").hidden = false;
    document.getElementById("application-id").textContent = id;
    progress.textContent = "提交成功";
  });

  document.getElementById("new-application").addEventListener("click", () => {
    form.reset();
    form.hidden = false;
    document.getElementById("form-success").hidden = true;
    teamCodeField.classList.add("hidden");
    showStep(1);
  });

  function showToast(message) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2200);
  }
})();
