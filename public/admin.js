(() => {
  const api = { ...MinicampAPI, request: MinicampAPI.adminRequest };
  let state;
  const root = document.querySelector(".admin-main");
  const SKILLS = ["DEV", "PRODUCT", "DESIGN", "AI/DATA", "HARDWARE", "BUSINESS", "CREATIVE", "RESEARCH"];
  const STATUSES = ["待审核", "已录取", "候补", "待复审"];
  const STATUS_CLASS = { "待审核": "status-pending", "已录取": "status-accepted", "候补": "status-waitlist", "待复审": "status-pending" };
  const PANEL_META = {
    overview: ["报名总览", "集中管理报名、审核、录取与通知。"],
    applicants: ["报名审核", "查看报名者资料、调整录取状态、导出名单。"],
    teams: ["队伍管理", "查看组队进度，协助处理尚未锁定的队伍。"],
    ideas: ["Idea 管理", "管理组队页中公开展示的创意。"],
    projects: ["项目审核", "审核项目草稿；发布后会出现在 Project Gallery。"],
    voting: ["投票与结果", "查看参与者和 Jury 投票的实时汇总。"],
    notices: ["通知与录取", "向报名者发送录取结果与活动通知。"],
    config: ["活动配置", "设置官网、投票与 Starter Pack 的实时配置。"]
  };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = t => t ? new Date(t).toLocaleString("zh-CN") : "";
  const modal = document.getElementById("applicant-modal");
  function toast(msg) { const t = document.getElementById("admin-toast"); if (!t) return; t.textContent = msg; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 1800); }
  function setHtml(id, html) { const el = document.getElementById(id); if (el) el.innerHTML = html; }

  function showLogin() {
    if (document.getElementById("admin-login")) return;
    const box = document.createElement("section"); box.id = "admin-login"; box.className = "admin-login-card";
    box.innerHTML = "<p class='section-kicker'>ORGANIZER ACCESS</p><h2>进入报名管理工作台</h2><form><label>主办方密码<input type='password' name='password' required></label><p class='form-error'></p><button class='button button-dark'>登录</button></form>";
    root.prepend(box);
    box.querySelector("form").onsubmit = async e => { e.preventDefault(); try { const d = await api.request("/api/auth/admin", { method: "POST", body: JSON.stringify({ password: new FormData(e.currentTarget).get("password") }) }); api.setAdminToken(d.token); box.remove(); await load(); } catch (err) { box.querySelector(".form-error").textContent = err.message; } };
  }
  async function load() { try { state = await api.request("/api/admin/summary"); render(); } catch { showLogin(); } }

  function bar(label, value, max) { return "<div><div class='status-bar-label'><span>" + esc(label) + "</span><b>" + value + "</b></div><div class='status-bar-track'><i style='width:" + (value / Math.max(max, 1) * 100) + "%'></i></div></div>"; }

  function render() {
    const apps = state.applications || [];
    const count = s => apps.filter(x => x.status === s).length;
    const total = apps.length, pending = count("待审核"), accepted = count("已录取"), waitlist = count("候补");
    setHtml("metrics-grid", [["报名总数", total, "实时"], ["待审核", pending, "需处理"], ["已录取", accepted, "正式名额"], ["候补", waitlist, "备选名单"]].map(x => "<div class='metric-card'><span>" + x[0] + "</span><strong>" + x[1] + "</strong><small>" + x[2] + "</small></div>").join(""));
    setHtml("status-bars", STATUSES.map(s => bar(s, count(s), total)).join(""));
    const skillCounts = SKILLS.map(s => [s, apps.filter(a => (a.skills || []).includes(s)).length]);
    const skillMax = Math.max(1, ...skillCounts.map(c => c[1]));
    setHtml("skill-bars", skillCounts.map(c => bar(c[0], c[1], skillMax)).join(""));
    setHtml("activity-list", apps.slice(0, 6).map(x => "<div class='activity-item'><span class='activity-dot'>" + esc((x.name || "?").slice(0, 1)) + "</span><p><strong>" + esc(x.name) + "</strong> · " + esc(x.id) + "<br><time>" + fmt(x.createdAt) + "</time></p></div>").join("") || "<p class='empty-state'>暂无报名</p>");
    renderReminders();
    renderApps();
    renderTeams();
    renderIdeas();
    renderProjects();
    renderVoting();
    renderNotices();
    renderConfig();
  }

  function renderReminders() {
    const c = state.config || {};
    const items = [
      [c.applicationOpen ? "✓" : "!", c.applicationOpen ? "报名通道开放中" : "报名通道已关闭", c.applicationOpen ? "官网报名表可正常提交" : "官网显示“暂未开放”"],
      ["#", "报名截止", c.applicationDeadline ? fmt(c.applicationDeadline) : "尚未设置"],
      ["#", "录取公布", c.resultDate ? fmt(c.resultDate) : "尚未设置"],
      ["#", "投票开始", c.voteStartAt ? fmt(c.voteStartAt) : "尚未设置"]
    ];
    setHtml("event-reminders", items.map(i => "<div class='activity-item'><span class='activity-dot'>" + esc(i[0]) + "</span><p><strong>" + esc(i[1]) + "</strong><br><time>" + esc(i[2]) + "</time></p></div>").join(""));
  }

  function renderApps() { applyFilters(); }
  function applyFilters() {
    const q = (document.getElementById("applicant-search")?.value || "").trim().toLowerCase();
    const status = document.getElementById("applicant-status")?.value || "全部";
    const list = (state.applications || []).filter(a => {
      const okStatus = status === "全部" || a.status === status;
      const okQ = !q || [a.name, a.college, a.major, a.id, a.email, a.phone].some(v => String(v || "").toLowerCase().includes(q));
      return okStatus && okQ;
    });
    renderRows(list);
  }
  function renderRows(list) {
    const tbody = document.getElementById("applicants-table"); if (!tbody) return;
    tbody.innerHTML = list.map(x => "<tr><td class='name-cell'><span class='mini-avatar'>" + esc((x.name || "?").slice(0, 1)) + "</span><div><strong>" + esc(x.name) + "</strong><br><small>" + esc(x.college) + " · " + esc(x.major) + "</small></div></td><td>" + esc(x.id) + "</td><td><small>" + esc(x.phone || "—") + "<br>" + esc(x.email || "—") + "</small></td><td>" + ((x.skills || []).map(s => "<span class='tag'>" + esc(s) + "</span>").join(" ") || "—") + "</td><td><small>" + fmt(x.createdAt) + "</small></td><td><select class='status-select' data-id='" + esc(x.id) + "'>" + STATUSES.map(s => "<option " + (s === x.status ? "selected" : "") + ">" + s + "</option>").join("") + "</select></td><td><button class='row-action' data-view='" + esc(x.id) + "'>查看</button></td></tr>").join("") || "<tr><td colspan='7'><div class='empty-state'>没有符合条件的报名</div></td></tr>";
    tbody.querySelectorAll(".status-select").forEach(sel => sel.onchange = async () => { try { await api.request("/api/admin/applications", { method: "PATCH", body: JSON.stringify({ id: sel.dataset.id, status: sel.value }) }); toast("已更新为「" + sel.value + "」"); await load(); } catch (e) { toast(e.message); } });
    tbody.querySelectorAll("[data-view]").forEach(b => b.onclick = () => openDetail(b.dataset.view));
  }

  function openDetail(id) {
    const x = (state.applications || []).find(a => a.id === id);
    const box = document.getElementById("applicant-detail");
    if (!x || !box || !modal) return;
    const row = (dt, dd) => "<div><dt>" + dt + "</dt><dd>" + esc(dd || "—") + "</dd></div>";
    const blk = (h, body) => "<div class='admin-detail-block'><h3>" + h + "</h3><p>" + (body ? esc(body) : "<span class='muted'>未填写</span>") + "</p></div>";
    box.innerHTML =
      "<div class='admin-detail-head'><div><p class='section-kicker'>APPLICATION · " + esc(x.id) + "</p><h2 id='applicant-detail-name'>" + esc(x.name) + "</h2><span>" + esc(x.college) + " · " + esc(x.major) + "</span></div><span class='status " + (STATUS_CLASS[x.status] || "status-pending") + "'>" + esc(x.status) + "</span></div>" +
      "<div class='admin-detail-status'><span>快速设置状态</span>" + STATUSES.map(s => "<button type='button' class='outline-button" + (s === x.status ? " primary" : "") + "' data-set-status='" + s + "'>" + s + "</button>").join("") + "</div>" +
      "<dl class='admin-detail-grid'>" + row("学号", x.studentId) + row("手机号", x.phone) + row("邮箱", x.email) + row("能力标签", (x.skills || []).join(" / ")) + row("提交时间", fmt(x.createdAt)) + row("最近更新", x.updatedAt ? fmt(x.updatedAt) : "—") + "</dl>" +
      blk("参与动机", x.motivation) + blk("做过的项目 / 经历", x.experience) + blk("可以来找 TA 聊什么", x.askMeAbout) + blk("可以帮助别人做什么", x.canHelpWith) + blk("想探索什么", x.explore) +
      "<div class='admin-detail-block'><h3>作品集 / GitHub / 主页</h3><p>" + (x.portfolio ? "<a href='" + esc(x.portfolio) + "' target='_blank' rel='noreferrer'>" + esc(x.portfolio) + " ↗</a>" : "<span class='muted'>未填写</span>") + "</p></div>";
    box.querySelectorAll("[data-set-status]").forEach(btn => btn.onclick = async () => { try { await api.request("/api/admin/applications", { method: "PATCH", body: JSON.stringify({ id: x.id, status: btn.dataset.setStatus }) }); modal.close(); toast("已更新为「" + btn.dataset.setStatus + "」"); await load(); } catch (e) { toast(e.message); } });
    modal.showModal();
  }
  document.getElementById("applicant-modal-close")?.addEventListener("click", () => modal?.close());
  modal?.addEventListener("click", e => { if (e.target === modal) modal.close(); });

  function renderTeams() {
    const teams = state.teams || [];
    const total = document.getElementById("team-total");
    if (total) total.textContent = teams.length + " 支队伍";
    setHtml("admin-team-board", teams.map(team => {
      const members = (team.members || []).map(member => "<li>" + esc(member.name) + "<small>" + esc((member.skills || []).join(" / ") || "未填写能力标签") + "</small></li>").join("") || "<li>暂无成员</li>";
      const status = team.locked ? "已锁定" : team.members.length < 3 ? "待补齐成员" : "可锁定";
      return "<article class='team-card-admin'><div class='team-card-head'><strong>" + esc(team.project || team.id) + "</strong><span>" + team.members.length + " / 5 人</span></div><p>" + esc(team.id) + " · " + esc(team.code) + "</p><small>" + status + "</small><ul class='team-member-list'>" + members + "</ul><button class='outline-button admin-team-lock' data-id='" + esc(team.id) + "' data-locked='" + String(!team.locked) + "'>" + (team.locked ? "解除锁定" : "锁定队伍") + "</button></article>";
    }).join("") || "<p class='empty-state'>暂无队伍</p>");
    document.querySelectorAll(".admin-team-lock").forEach(button => button.onclick = async () => {
      try {
        await api.request("/api/admin/teams/" + encodeURIComponent(button.dataset.id), { method: "PATCH", body: JSON.stringify({ locked: button.dataset.locked === "true" }) });
        toast("队伍状态已更新"); await load();
      } catch (error) { toast(error.message); }
    });
  }

  function renderIdeas() {
    const ideas = state.ideas || [];
    setHtml("admin-idea-list", ideas.map(idea => "<article class='idea-card'><span>" + esc(idea.status === "open" ? "公开中" : "已关闭") + " · " + esc(idea.theme) + "</span><h3>" + esc(idea.title) + "</h3><p>" + esc(idea.summary) + "</p><small>寻找：" + esc((idea.needs || []).join(" / ")) + "</small><button class='outline-button admin-idea-status' data-id='" + esc(idea.id) + "' data-status='" + (idea.status === "open" ? "closed" : "open") + "'>" + (idea.status === "open" ? "关闭 Idea" : "重新公开") + "</button></article>").join("") || "<p class='empty-state'>暂无 Idea</p>");
    document.querySelectorAll(".admin-idea-status").forEach(button => button.onclick = async () => {
      try {
        await api.request("/api/admin/ideas/" + encodeURIComponent(button.dataset.id), { method: "PATCH", body: JSON.stringify({ status: button.dataset.status }) });
        toast("Idea 状态已更新"); await load();
      } catch (error) { toast(error.message); }
    });
  }

  function renderProjects() {
    const projects = state.projects || [];
    const total = document.getElementById("project-total"); if (total) total.textContent = projects.length + " 个项目";
    setHtml("projects-table", projects.map(project => "<tr><td><strong>" + esc(project.projectName) + "</strong><br><small>" + esc(project.tagline) + "</small></td><td>" + esc(project.teamId) + "</td><td>" + esc(project.theme) + "</td><td>" + (project.demoUrl ? "<a class='dark-link' target='_blank' rel='noreferrer' href='" + esc(project.demoUrl) + "'>打开 ↗</a>" : "—") + "</td><td><span class='status " + (project.status === "published" ? "status-accepted" : "status-pending") + "'>" + (project.status === "published" ? "已发布" : "草稿待审核") + "</span></td><td><button class='outline-button project-status' data-id='" + esc(project.id) + "' data-status='" + (project.status === "published" ? "draft" : "published") + "'>" + (project.status === "published" ? "撤回发布" : "发布到 Gallery") + "</button></td></tr>").join("") || "<tr><td colspan='6'><div class='empty-state'>暂无项目</div></td></tr>");
    document.querySelectorAll(".project-status").forEach(button => button.onclick = async () => {
      try {
        await api.request("/api/admin/projects", { method: "PATCH", body: JSON.stringify({ id: button.dataset.id, status: button.dataset.status }) });
        toast(button.dataset.status === "published" ? "项目已发布到 Gallery" : "项目已撤回"); await load();
      } catch (error) { toast(error.message); }
    });
  }

  function renderVoting() {
    const results = state.results || [], awards = state.awards || [];
    const participantVotes = new Set((state.votes || []).filter(vote => vote.role === "participant").map(vote => vote.voterId)).size;
    const juryVotes = new Set((state.votes || []).filter(vote => vote.role === "jury").map(vote => vote.voterId)).size;
    setHtml("vote-summary", "<div class='vote-leader'><span>投票状态</span><strong>" + (state.config?.voteOpen ? "开放中" : "未开放") + "</strong><p>参与者 " + participantVotes + " 人 · Jury " + juryVotes + " 人</p></div><div class='vote-list'><div class='vote-row'><strong>参与者权重</strong><span class='vote-meter'><i style='width:" + Number(state.config?.participantWeight || 0) + "%'></i></span><b>" + Number(state.config?.participantWeight || 0) + "%</b></div><div class='vote-row'><strong>Jury 权重</strong><span class='vote-meter'><i style='width:" + Number(state.config?.juryWeight || 0) + "%'></i></span><b>" + Number(state.config?.juryWeight || 0) + "%</b></div></div>");
    setHtml("vote-results", awards.map(award => "<div class='vote-row'><strong>" + esc(award.award) + "</strong><span>" + esc(award.projectName || award.projectId) + " · " + esc(award.teamId || "") + "</span><b>" + Number(award.weighted || 0).toFixed(1) + "</b></div>").join("") || (results.length ? "<p class='empty-state'>已有投票，正在计算获奖项目。</p>" : "<p class='empty-state'>暂无已提交投票</p>"));
  }

  function renderNotices() {
    setHtml("admin-notice-list", (state.notices || []).slice(0, 12).map(x => "<article class='admin-notice-item'><div class='notice-meta'><span>" + esc(x.type) + "</span><time>" + fmt(x.createdAt) + "</time></div><h3>" + esc(x.title) + "</h3><p>" + esc(x.body) + "</p></article>").join("") || "<p class='empty-state'>暂无通知</p>");
    const total = document.getElementById("notice-total"); if (total) total.textContent = (state.notices || []).length + " 条";
    setHtml("notice-target", "<option value='ALL'>所有报名者</option>" + (state.applications || []).map(x => "<option value='" + esc(x.id) + "'>" + esc(x.name) + " · " + esc(x.id) + "</option>").join(""));
  }

  function renderConfig() {
    const box = document.getElementById("config-editor"); if (!box) return; const c = state.config || {};
    const pack = JSON.stringify(c.starterPack || {}, null, 2);
    box.innerHTML = "<div class='admin-card-head'><h2>活动配置</h2><span>保存后官网实时生效</span></div><form class='field-grid'><label>活动名称<input name='eventName' value='" + esc(c.eventName) + "'></label><label>活动日期<input name='date' value='" + esc(c.date) + "'></label><label>活动地点<input name='venue' value='" + esc(c.venue) + "'></label><label>主题揭晓<input name='themeReveal' value='" + esc(c.themeReveal) + "'></label><label>报名截止<input type='datetime-local' name='applicationDeadline' value='" + (c.applicationDeadline ? c.applicationDeadline.slice(0, 16) : "") + "'></label><label>录取公布<input type='datetime-local' name='resultDate' value='" + (c.resultDate ? c.resultDate.slice(0, 16) : "") + "'></label><label>投票开始时间<input type='datetime-local' name='voteStartAt' value='" + (c.voteStartAt ? c.voteStartAt.slice(0, 16) : "") + "'></label><label>报名状态<select name='applicationOpen'><option value='true'>开放</option><option value='false'>关闭</option></select></label><label>投票状态<select name='voteOpen'><option value='true'>开放</option><option value='false'>关闭</option></select></label><label>参与者投票权重（%）<input name='participantWeight' type='number' min='0' max='100' value='" + Number(c.participantWeight || 60) + "'></label><label>Jury 投票权重（%）<input name='juryWeight' type='number' min='0' max='100' value='" + Number(c.juryWeight || 40) + "'></label><label class='config-pack'>Starter Pack（JSON）<textarea name='starterPack' rows='10'>" + esc(pack) + "</textarea></label><button class='button button-dark'>保存配置</button></form>";
    box.querySelector('[name="applicationOpen"]').value = String(c.applicationOpen);
    box.querySelector('[name="voteOpen"]').value = String(c.voteOpen);
    box.querySelector("form").onsubmit = async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.currentTarget));
      d.applicationOpen = d.applicationOpen === "true"; d.voteOpen = d.voteOpen === "true";
      d.participantWeight = Number(d.participantWeight); d.juryWeight = Number(d.juryWeight);
      d.voteStartAt = d.voteStartAt || null; d.applicationDeadline = d.applicationDeadline || null; d.resultDate = d.resultDate || null;
      if (d.participantWeight + d.juryWeight !== 100) return toast("参与者与 Jury 权重之和必须为 100%。");
      try { d.starterPack = JSON.parse(d.starterPack); } catch { return toast("Starter Pack 必须是有效的 JSON。"); }
      try { await api.request("/api/admin/config", { method: "PATCH", body: JSON.stringify(d) }); toast("配置已保存，官网已同步"); await load(); } catch (err) { toast(err.message); }
    };
  }

  function exportCsv() {
    const cols = [["申请编号", "id"], ["姓名", "name"], ["学号", "studentId"], ["学院", "college"], ["专业与年级", "major"], ["手机号", "phone"], ["邮箱", "email"], ["能力标签", a => (a.skills || []).join(" / ")], ["参与动机", "motivation"], ["经历", "experience"], ["作品集", "portfolio"], ["能帮助", "canHelpWith"], ["想探索", "explore"], ["找我聊", "askMeAbout"], ["状态", "status"], ["提交时间", a => fmt(a.createdAt)]];
    const cell = v => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
    const head = cols.map(c => cell(c[0])).join(",");
    const rows = (state.applications || []).map(a => cols.map(c => cell(typeof c[1] === "function" ? c[1](a) : a[c[1]])).join(","));
    const csv = "\uFEFF" + [head, ...rows].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "minicamp-报名名单-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    toast("已导出 " + (state.applications || []).length + " 条报名");
  }

  document.getElementById("applicant-search")?.addEventListener("input", applyFilters);
  document.getElementById("applicant-status")?.addEventListener("change", applyFilters);
  document.getElementById("export-csv")?.addEventListener("click", exportCsv);
  document.getElementById("refresh-data")?.addEventListener("click", () => { load(); toast("已刷新"); });
  document.getElementById("notice-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const form = e.currentTarget;
    const d = Object.fromEntries(new FormData(form));
    try {
      await api.request("/api/admin/notices", { method: "POST", body: JSON.stringify(d) });
      form.reset();
      toast("通知已发布");
      await load();
    } catch (err) { toast(err.message); }
  });

  function activate(panel) {
    document.querySelectorAll(".admin-nav button").forEach(x => x.classList.toggle("active", x.dataset.panel === panel));
    document.querySelectorAll(".admin-panel").forEach(x => x.classList.toggle("active", x.id === "panel-" + panel));
    const meta = PANEL_META[panel];
    if (meta) { const title = document.getElementById("admin-title"), sub = document.getElementById("admin-subtitle"); if (title) title.textContent = meta[0]; if (sub) sub.textContent = meta[1]; }
  }
  document.querySelectorAll(".admin-nav button").forEach(b => b.onclick = () => activate(b.dataset.panel));
  document.querySelectorAll("[data-switch]").forEach(b => b.onclick = () => activate(b.dataset.switch));

  load();
})();
