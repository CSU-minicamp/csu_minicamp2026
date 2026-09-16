(() => {
  const api = { ...MinicampAPI, request: MinicampAPI.adminRequest };
  let state;
  const root = document.querySelector(".admin-main");
  const SKILLS = ["Frontend", "Backend", "Product", "Design", "Hardware", "AI Engineer", "Media"];
  const STATUSES = ["待审核", "已录取", "已通过", "候补", "待复审", "未通过"];
  const STATUS_CLASS = { "待审核": "status-pending", "已录取": "status-accepted", "候补": "status-waitlist", "待复审": "status-pending" };
  const isRoadshow = a => (a.registration_type || a.registrationType || "contestant") === "roadshow";
  const statusCell = a => isRoadshow(a)
    ? "<button type='button' class='status status-accepted status-locked' data-locked-status='" + esc(a.id) + "' title='路演报名固定为「已通过」，不可更改'>已通过 <span aria-hidden='true'>锁</span></button>"
    : "<select class='status-select' data-id='" + esc(a.id) + "'>" + STATUSES.map(s => "<option " + (s === a.status ? "selected" : "") + ">" + s + "</option>").join("") + "</select>";
  const PANEL_META = {
    overview: ["报名总览", "集中管理报名、审核、录取与通知。"],
    applicants: ["报名审核", "查看报名者资料、调整录取状态、导出名单。"],
    teams: ["队伍管理", "查看组队进度，协助处理尚未锁定的队伍。"],
    ideas: ["Idea 管理", "管理组队页中公开展示的创意。"],
    projects: ["项目审核", "审核项目草稿；发布后会出现在 Project Gallery。"],
    voting: ["投票与结果", "查看参与者和 Jury 投票的实时汇总。"],
    notices: ["通知与录取", "向报名者发送录取结果与活动通知。"],
    config: ["活动配置", "设置官网、投票与 Starter Pack 的实时配置。"],
    stage: ["现场大屏", "推进现场节点，编辑主持人提示和现场动作。"]
  };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = t => t ? new Date(t).toLocaleString("zh-CN", {hour12: false}) : "";
  // 活动配置的时间用「日期选择器 + 24 小时制下拉」组合。
  const pad2 = value => String(value).padStart(2, "0");
  const splitTime = value => {
    const text = String(value || "").trim();
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    if (match) return {date: match[1] + "-" + match[2] + "-" + match[3], hour: match[4], minute: match[5]};
    const parsed = new Date(text);
    if (!text || Number.isNaN(parsed.getTime())) return {date: "", hour: "00", minute: "00"};
    return {date: parsed.getFullYear() + "-" + pad2(parsed.getMonth() + 1) + "-" + pad2(parsed.getDate()), hour: pad2(parsed.getHours()), minute: pad2(parsed.getMinutes())};
  };
  const timeSelect = (name, label, selected, count) => {
    let options = "";
    for (let value = 0; value < count; value += 1) {
      const text = pad2(value);
      options += "<option value='" + text + "'" + (text === selected ? " selected" : "") + ">" + text + "</option>";
    }
    return "<select name='" + name + "' aria-label='" + label + "'>" + options + "</select>";
  };
  const timeInput = (name, label, value) => {
    const parts = splitTime(value);
    return "<div class='config-time'><input type='date' name='" + name + "Date' aria-label='" + label + "' value='" + parts.date + "'><span class='config-time-clock'>" + timeSelect(name + "Hour", label + " 小时", parts.hour, 24) + "<b>:</b>" + timeSelect(name + "Minute", label + " 分钟", parts.minute, 60) + "</span></div><small class='field-help'>24 小时制，日期留空表示不设置</small>";
  };
  const joinTime = (date, hour, minute) => {
    const day = String(date || "").trim();
    if (!day) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined;
    return day + "T" + pad2(hour || "00") + ":" + pad2(minute || "00");
  };
  const modal = document.getElementById("applicant-modal");
  function toast(msg, tone = "info") { MinicampUI.toast(msg, {tone}); }
  function setHtml(id, html) { const el = document.getElementById(id); if (el) el.innerHTML = html; }

  function showLogin() {
    if (document.getElementById("admin-login")) return;
    const box = document.createElement("section"); box.id = "admin-login"; box.className = "admin-login-card";
    box.innerHTML = "<p class='section-kicker'>ORGANIZER ACCESS</p><h2>进入报名管理工作台</h2><form><label>主办方密码<input type='password' name='password' required></label><p class='form-error'></p><button class='button button-dark'>登录</button></form>";
    root.prepend(box);
    const form = box.querySelector("form");
    if (!form) return;
    form.onsubmit = async e => {
      e.preventDefault();
      try {
        const d = await api.request("/api/auth/admin", { method: "POST", body: JSON.stringify({ password: new FormData(e.currentTarget).get("password") }) });
        api.setAdminToken(d.token);
        box.remove();
        await load();
      } catch (err) {
        const error = box.querySelector(".form-error");
        if (error) error.textContent = err.message;
        else toast(err.message, "error");
      }
    };
  }
  function load() { return sync({ withQa: true, reason: "manual", notify: false }); }
  function bar(label, value, max) { return "<div><div class='status-bar-label'><span>" + esc(label) + "</span><b>" + value + "</b></div><div class='status-bar-track'><i style='width:" + (value / Math.max(max, 1) * 100) + "%'></i></div></div>"; }
  function stackedBar(label, value, acceptedCount, max) {
    const width = inner => Math.max(inner > 0 ? 3 : 0, inner / Math.max(max, 1) * 100);
    return "<div class='status-bar-stack'><div class='status-bar-label'><span>" + esc(label) + "</span><b>" + acceptedCount + " / " + value + "</b></div><div class='status-bar-track'><i class='is-total' style='width:" + width(value) + "%'></i><i class='is-accepted' style='width:" + width(acceptedCount) + "%'></i></div></div>";
  }

  /** 分类统计 */
  const CATEGORY_LABEL = { grade: "年级", major: "专业", college: "学院", type: "报名类型" };
  let categoryKey = "grade";
  let categoryPicked = false;
  function pickDefaultCategory() {
    if (categoryPicked) return;
    categoryPicked = true;
    const apps = state.applications || [];
    if (!apps.length) return;
    const coverage = key => apps.filter(a => String(a[key] || "").trim()).length / apps.length;
    if (coverage("grade") >= Math.max(coverage("major"), coverage("college"))) return;
    categoryKey = coverage("major") >= coverage("college") ? "major" : "college";
  }
  const appsOfType = type => (state.applications || []).filter(a => type === "全部" || (isRoadshow(a) ? "roadshow" : "contestant") === type);
  const currentTypeFilter = () => document.getElementById("applicant-type")?.value || "全部";
  function categoryCounts(key) {
    const counts = new Map();
    appsOfType(currentTypeFilter()).forEach(a => {
      const raw = key === "type" ? (isRoadshow(a) ? "路演报名" : "参赛报名") : String(a[key] || "").trim();
      const value = raw || "未填写 " + CATEGORY_LABEL[key];
      const entry = counts.get(value) || {label: value, total: 0, accepted: 0};
      entry.total += 1;
      if (a.status === "已录取") entry.accepted += 1;
      counts.set(value, entry);
    });
    return [...counts.values()].sort((a, b) => (b.total - a.total) || a.label.localeCompare(b.label, "zh-CN"));
  }
  /** 分类柱状图：纯 SVG 绘制（零依赖）。宽度随列数自适应，高度固定。 */
  const CHART = { top: 26, bottom: 48, left: 40, right: 16 };
  function niceTicks(max) {
    const ticks = [];
    for (let value = 0; value <= max; value += 1) ticks.push(value);
    if (ticks.length > 7) {
      const step = Math.ceil(max / 6);
      ticks.length = 0;
      for (let value = 0; value <= max; value += step) ticks.push(value);
      if (ticks[ticks.length - 1] !== max) ticks.push(max);
    }
    return ticks;
  }
  function renderCategoryChart() {
    pickDefaultCategory();
    const rows = categoryCounts(categoryKey);
    const total = appsOfType(currentTypeFilter()).length;
    const typeLabel = currentTypeFilter() === "roadshow" ? "路演报名" : currentTypeFilter() === "contestant" ? "参赛报名" : "全部报名类型";
    setHtml("category-chart", (rows.length
      ? categoryChartSvg(rows)
      : "<p class='empty-state'>当前筛选下没有报名</p>") + "<p class='chart-foot'>" + esc(CATEGORY_LABEL[categoryKey]) + "维度 · " + esc(typeLabel) + " · 共 " + total + " 条" + (rows.some(row => row.accepted) ? " · 深色段为已录取" : "") + "</p>");
    document.querySelectorAll("#category-switch [data-category]").forEach(button => {
      button.classList.toggle("active", button.dataset.category === categoryKey);
      button.setAttribute("aria-selected", String(button.dataset.category === categoryKey));
    });
  }
  function categoryChartSvg(rows) {
    const max = Math.max(1, ...rows.map(row => row.total));
    // 宽度随列数走：类别少就画窄一点并居中，类别多才铺满并允许横向滚动。
    const width = Math.round(Math.max(400, Math.min(700, 64 + rows.length * 86)));
    const height = 300;
    const plotWidth = width - CHART.left - CHART.right;
    const plotHeight = height - CHART.top - CHART.bottom;
    const baseY = CHART.top + plotHeight;
    const scale = value => value / max * plotHeight;
    const slot = plotWidth / rows.length;
    const longest = Math.max(1, ...rows.map(row => row.label.length));
    const barWidth = Math.max(10, Math.min(46, slot * 0.56, (slot * 1.6) / longest * 4.4));

    const ticks = niceTicks(max);
    const grid = ticks.map(value => {
      const y = baseY - scale(value);
      return "<line class='chart-grid' x1='" + CHART.left + "' y1='" + y.toFixed(1) + "' x2='" + (width - CHART.right) + "' y2='" + y.toFixed(1) + "'></line>" +
        "<text class='chart-tick' x='" + (CHART.left - 8) + "' y='" + (y + 3.5).toFixed(1) + "' text-anchor='end'>" + value + "</text>";
    }).join("");

    const bars = rows.map((row, index) => {
      const x = CHART.left + slot * index + (slot - barWidth) / 2;
      const totalHeight = row.total > 0 ? Math.max(3, scale(row.total)) : 0;
      const acceptedHeight = row.accepted > 0 ? Math.max(2, scale(row.accepted)) : 0;
      const acceptedText = row.accepted > 0 ? " · 已录取 " + row.accepted : "";
      return "<title>" + esc(row.label) + "：报名 " + row.total + acceptedText + "</title>" +
        "<rect class='chart-bar is-total' x='" + x.toFixed(1) + "' y='" + (baseY - totalHeight).toFixed(1) + "' width='" + barWidth.toFixed(1) + "' height='" + totalHeight.toFixed(1) + "' rx='3'></rect>" +
        (acceptedHeight ? "<rect class='chart-bar is-accepted' x='" + x.toFixed(1) + "' y='" + (baseY - acceptedHeight).toFixed(1) + "' width='" + barWidth.toFixed(1) + "' height='" + acceptedHeight.toFixed(1) + "' rx='3'></rect>" : "") +
        "<text class='chart-value' x='" + (x + barWidth / 2).toFixed(1) + "' y='" + (baseY - totalHeight - 7).toFixed(1) + "' text-anchor='middle'>" + row.total + "</text>";
    }).join("");

    const labels = rows.map((row, index) => {
      const x = CHART.left + slot * index + (slot - barWidth) / 2;
      return "<foreignObject class='chart-label-box' x='" + (x - 6).toFixed(1) + "' y='" + (baseY + 6) + "' width='" + (barWidth + 12).toFixed(1) + "' height='" + (CHART.bottom - 10) + "'>" +
        "<div xmlns='http://www.w3.org/1999/xhtml' class='chart-label'>" + esc(row.label) + "</div></foreignObject>";
    }).join("");

    return "<div class='chart-scroll'><svg class='bar-chart' viewBox='0 0 " + width + " " + height + "' width='" + width + "' height='" + height + "' role='img' aria-label='" + esc(CATEGORY_LABEL[categoryKey]) + "分类报名人数柱状图' preserveAspectRatio='xMidYMid meet'>" +
      grid +
      "<line class='chart-axis' x1='" + CHART.left + "' y1='" + baseY + "' x2='" + (width - CHART.right) + "' y2='" + baseY + "'></line>" +
      bars +
      labels +
      "</svg></div>";
  }

  function render() {
    const apps = state.applications || [];
    const count = s => apps.filter(x => x.status === s).length;
    const contestants = apps.filter(x => !isRoadshow(x)).length;
    const roadshows = apps.length - contestants;
    const acceptedApps = apps.filter(x => x.status === "已录取");
    const total = apps.length;
    setHtml("metrics-grid", [["报名总数", total + "<em>（MC " + contestants + " / RO " + roadshows + "）</em>", "报名 / 路演"], ["待审核", count("待审核"), "需处理"], ["已录取", acceptedApps.length, "正式名额"], ["候补", count("候补"), "备选名单"]].map(x => "<div class='metric-card'><span>" + x[0] + "</span><strong>" + x[1] + "</strong><small>" + x[2] + "</small></div>").join(""));
    setHtml("status-bars", STATUSES.map(s => bar(s, count(s), total)).join(""));
    const skillRows = SKILLS.map(s => {
      const all = apps.filter(a => (a.skills || []).includes(s)).length;
      const acceptedCount = acceptedApps.filter(a => (a.skills || []).includes(s)).length;
      return {label: s, all, accepted: acceptedCount};
    });
    const skillMax = Math.max(1, ...skillRows.map(row => row.all));
    setHtml("skill-bars", skillRows.map(row => stackedBar(row.label, row.all, row.accepted, skillMax)).join(""));
    setHtml("accepted-major-bars", (() => {
      const counts = new Map();
      acceptedApps.forEach(a => {
        const label = String(a.major || "").trim() || "未填写专业";
        counts.set(label, (counts.get(label) || 0) + 1);
      });
      const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
      const max = Math.max(1, ...rows.map(row => row[1]));
      return rows.map(row => bar(row[0], row[1], max)).join("") || "<p class='empty-state'>暂无已录取报名</p>";
    })());
    renderCategoryChart();
    setHtml("activity-list", apps.slice(0, 6).map(x => "<div class='activity-item'><span class='activity-dot'>" + esc((x.name || "?").slice(0, 1)) + "</span><p><strong>" + esc(x.name) + "</strong> · " + esc(x.id) + "<br><time>" + fmt(x.createdAt) + "</time></p></div>").join("") || "<p class='empty-state'>暂无报名</p>");
    renderReminders();
    renderApps();
    renderTeams();
    renderIdeas();
    renderProjects();
    renderVoting();
    renderNotices();
    renderConfig();
    renderStageBriefEditor();
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
    const type = document.getElementById("applicant-type")?.value || "全部";
    const list = (state.applications || []).filter(a => {
      const okStatus = status === "全部" || a.status === status;
      const okType = type === "全部" || (a.registration_type || "contestant") === type;
      const okQ = !q || [a.name, a.college, a.major, a.id, a.email, a.phone].some(v => String(v || "").toLowerCase().includes(q));
      return okStatus && okType && okQ;
    });
    renderRows(list);
  }
  function renderRows(list) {
    const tbody = document.getElementById("applicants-table"); if (!tbody) return;
    tbody.innerHTML = list.map(x => "<tr><td class='name-cell'><span class='mini-avatar'>" + esc((x.name || "?").slice(0, 1)) + "</span><div><strong>" + esc(x.name) + "</strong><br><small>" + esc(x.college) + " · " + esc(x.major) + "</small></div></td><td>" + (isRoadshow(x) ? "路演报名" : "参赛报名") + "</td><td>" + esc(x.id) + "</td><td><small>" + esc(x.phone || "—") + "<br>" + esc(x.email || "—") + "</small></td><td>" + ((x.skills || []).map(s => "<span class='tag'>" + esc(s) + "</span>").join(" ") || "—") + "</td><td><small>" + fmt(x.createdAt) + "</small></td><td class='status-cell'>" + statusCell(x) + "</td><td><button class='row-action' data-view='" + esc(x.id) + "'>查看</button></td></tr>").join("") || "<tr><td colspan='8'><div class='empty-state'>没有符合条件的报名</div></td></tr>";
    tbody.querySelectorAll(".status-select").forEach(sel => sel.onchange = async () => { try { await api.request("/api/admin/applications", { method: "PATCH", body: JSON.stringify({ id: sel.dataset.id, status: sel.value }) }); toast("已更新为「" + sel.value + "」", "success"); await load(); } catch (e) { toast(e.message, "error"); await load(); } });
    tbody.querySelectorAll("[data-locked-status]").forEach(b => b.onclick = () => toast("路演报名固定为「已通过」，无法更改。", "info"));
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
      (isRoadshow(x)
        ? "<div class='admin-detail-status is-locked'><span>报名状态</span><b class='status status-accepted status-locked'>已通过</b><small>路演报名提交后自动通过，主办方不可更改状态。</small></div>"
        : "<div class='admin-detail-status'><span>快速设置状态</span>" + STATUSES.map(s => "<button type='button' class='outline-button" + (s === x.status ? " primary" : "") + "' data-set-status='" + s + "'>" + s + "</button>").join("") + "</div>") +
      "<dl class='admin-detail-grid'>" + row("学号", x.studentId) + row("手机号", x.phone) + row("邮箱", x.email) + row("年级", x.grade) + row("能力标签", (x.skills || []).join(" / ")) + row("提交时间", fmt(x.createdAt)) + row("最近更新", x.updatedAt ? fmt(x.updatedAt) : "—") + "</dl>" +
      blk("参与动机", x.motivation) + blk("做过的项目 / 经历", x.experience) + blk("可以来找 TA 聊什么", x.askMeAbout) + blk("可以帮助别人做什么", x.canHelpWith) + blk("想探索什么", x.explore) +
      "<div class='admin-detail-block'><h3>作品集 / GitHub / 主页</h3><p>" + (x.portfolio ? "<a href='" + esc(x.portfolio) + "' target='_blank' rel='noreferrer'>" + esc(x.portfolio) + " ↗</a>" : "<span class='muted'>未填写</span>") + "</p></div>";
    box.querySelectorAll("[data-set-status]").forEach(btn => btn.onclick = async () => { try { await api.request("/api/admin/applications", { method: "PATCH", body: JSON.stringify({ id: x.id, status: btn.dataset.setStatus }) }); modal.close(); toast("已更新为「" + btn.dataset.setStatus + "」", "success"); await load(); } catch (e) { toast(e.message, "error"); } });
    modal.showModal();
  }
  document.getElementById("applicant-modal-close")?.addEventListener("click", () => modal?.close());
  modal?.addEventListener("click", e => { if (e.target === modal) modal.close(); });

  function renderTeams() {
    const teams = state.teams || [];
    const total = document.getElementById("team-total");
    if (total) total.textContent = teams.length + " 支队伍";
    setHtml("admin-team-board", teams.map(team => {
      const members = (team.members || []).map(member => "<li><span class='team-member-name'>" + esc(member.name) + "</span><small>" + esc((member.skills || []).join(" / ") || "未填写能力标签") + "</small></li>").join("") || "<li class='is-empty'>暂无成员</li>";
      const locked = Boolean(team.locked);
      const statusText = locked ? "正式队伍 · 已锁定" : (state.config?.teamConfirmOpen ? "正式确认已开启 · 等待队长提交" : "预组队中 · 可继续招募");
      const owner = team.ownerId ? "<span>队长 <b>" + esc(team.ownerId) + "</b></span>" : "";
      return "<article class='team-card-admin" + (locked ? " is-locked" : "") + "'><header class='team-card-head'><strong class='team-card-name'>" + esc(team.project || team.id) + "</strong><span class='team-card-count'>" + team.members.length + " / 5 人</span></header><div class='team-card-meta'><span>队伍码 <b>" + esc(team.code) + "</b></span><span>编号 <b>" + esc(team.id) + "</b></span>" + owner + "</div><p class='team-card-status'><i class='status-dot-mark'></i>" + statusText + "</p><ul class='team-member-list'>" + members + "</ul><button class='outline-button admin-team-lock' data-id='" + esc(team.id) + "' data-locked='" + String(!locked) + "'>" + (locked ? "解除正式锁定" : (state.config?.teamConfirmOpen ? "管理员锁定队伍" : "预览锁定（确认开启后生效）")) + "</button></article>";
    }).join("") || "<p class='empty-state'>暂无队伍</p>");
    document.querySelectorAll(".admin-team-lock").forEach(button => button.onclick = async () => {
      try {
        await api.request("/api/admin/teams/" + encodeURIComponent(button.dataset.id), { method: "PATCH", body: JSON.stringify({ locked: button.dataset.locked === "true" }) });
        toast("队伍状态已更新", "success"); await load();
      } catch (error) { toast(error.message, "error"); }
    });
  }

  function renderIdeas() {
    const ideas = state.ideas || [];
    const total = document.getElementById("idea-total");
    if (total) total.textContent = ideas.length + " 条创意";
    setHtml("admin-idea-list", ideas.map(idea => {
      const open = idea.status === "open";
      const needs = (idea.needs || []).map(need => "<span class='idea-need'>" + esc(need) + "</span>").join("");
      return "<article class='idea-card" + (open ? "" : " is-closed") + "'><p class='idea-card-status'><i class='status-dot-mark'></i>" + (open ? "公开中" : "已关闭") + "<span class='idea-card-theme'>" + esc(idea.theme) + "</span></p><h3>" + esc(idea.title) + "</h3><p class='idea-summary'>" + esc(idea.summary) + "</p><div class='idea-needs'><small>寻找</small>" + (needs || "<span class='idea-need is-empty'>未填写</span>") + "</div><button class='outline-button admin-idea-status' data-id='" + esc(idea.id) + "' data-status='" + (open ? "closed" : "open") + "'>" + (open ? "关闭 Idea" : "重新公开") + "</button></article>";
    }).join("") || "<p class='empty-state'>暂无 Idea</p>");
    document.querySelectorAll(".admin-idea-status").forEach(button => button.onclick = async () => {
      try {
        await api.request("/api/admin/ideas/" + encodeURIComponent(button.dataset.id), { method: "PATCH", body: JSON.stringify({ status: button.dataset.status }) });
        toast("Idea 状态已更新", "success"); await load();
      } catch (error) { toast(error.message, "error"); }
    });
  }

  function renderProjects() {
    const projects = state.projects || [];
    const total = document.getElementById("project-total"); if (total) total.textContent = projects.length + " 个项目";
    setHtml("projects-table", projects.map(project => "<tr><td><strong>" + esc(project.projectName) + "</strong><br><small>" + esc(project.tagline) + "</small></td><td>" + esc(project.teamId) + "</td><td>" + esc(project.theme) + "</td><td>" + (project.demoUrl ? "<a class='dark-link' target='_blank' rel='noreferrer' href='" + esc(project.demoUrl) + "'>打开 ↗</a>" : "—") + "</td><td><span class='status " + (project.status === "published" ? "status-accepted" : "status-pending") + "'>" + (project.status === "published" ? "已发布" : "草稿待审核") + "</span></td><td><button class='outline-button project-status' data-id='" + esc(project.id) + "' data-status='" + (project.status === "published" ? "draft" : "published") + "'>" + (project.status === "published" ? "撤回发布" : "发布到 Gallery") + "</button></td></tr>").join("") || "<tr><td colspan='6'><div class='empty-state'>暂无项目</div></td></tr>");
    document.querySelectorAll(".project-status").forEach(button => button.onclick = async () => {
      try {
        await api.request("/api/admin/projects", { method: "PATCH", body: JSON.stringify({ id: button.dataset.id, status: button.dataset.status }) });
        toast(button.dataset.status === "published" ? "项目已发布到 Gallery" : "项目已撤回", "success"); await load();
      } catch (error) { toast(error.message, "error"); }
    });
  }

  function renderVoting() {
    const results = state.results || [], awards = state.awards || [];
    const participantVotes = new Set((state.votes || []).filter(vote => vote.role === "participant").map(vote => vote.voterId)).size;
    const juryVotes = new Set((state.votes || []).filter(vote => vote.role === "jury").map(vote => vote.voterId)).size;
    setHtml("vote-summary", "<div class='vote-leader'><span>投票状态</span><strong>" + (state.config?.voteOpen ? "开放中" : "未开放") + "</strong><p>参与者 " + participantVotes + " 人 · Jury " + juryVotes + " 人</p></div><div class='vote-list'><div class='vote-row'><strong>参与者权重</strong><span class='vote-meter'><i style='width:" + Number(state.config?.participantWeight || 0) + "%'></i></span><b>" + Number(state.config?.participantWeight || 0) + "%</b></div><div class='vote-row'><strong>Jury 权重</strong><span class='vote-meter'><i style='width:" + Number(state.config?.juryWeight || 0) + "%'></i></span><b>" + Number(state.config?.juryWeight || 0) + "%</b></div></div>");
    setHtml("vote-results", awards.map(award => "<div class='vote-row'><strong>" + esc(award.award) + "</strong><span>" + esc(award.projectName || award.projectId) + " · " + esc(award.teamId || "") + "</span><b>" + Number(award.weighted || 0).toFixed(1) + "</b></div>").join("") || (results.length ? "<p class='empty-state'>已有投票，正在计算获奖项目。</p>" : "<p class='empty-state'>暂无已提交投票</p>"));
    // 投票人名单：统一按「报名编号 · 姓名」区分投票人（Jury 单独标注）。
    const voteRows = [...(state.votes || [])].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))).map(vote => {
      const jury = vote.role === "jury";
      const known = (state.applications || []).find(a => a.id === vote.voterId);
      const code = vote.voterCode || (known ? known.id : "");
      const name = known ? known.name : "";
      const label = jury ? "Jury 评审" : code ? (name ? code + " · " + name : code) : (vote.voterId || "未知投票人");
      return "<div class='vote-voter'><span class='vote-voter-role" + (jury ? " is-jury" : "") + "'>" + (jury ? "JURY" : "参与者") + "</span><strong>" + esc(label) + "</strong><small>" + (jury ? esc((vote.selections || []).length + " 个奖项") : name ? "已报名" : "未匹配到报名编号") + "</small><time>" + esc(fmt(vote.createdAt)) + "</time></div>";
    }).join("");
    setHtml("vote-voters", voteRows ? voteRows : "<p class='empty-state'>暂无投票记录</p>");
  }

  function renderNotices() {
    setHtml("admin-notice-list", (state.notices || []).slice(0, 12).map(x => "<article class='admin-notice-item'><div class='notice-meta'><span>" + esc(x.type) + "</span><time>" + fmt(x.createdAt) + "</time></div><h3>" + esc(x.title) + "</h3><p>" + esc(x.body) + "</p></article>").join("") || "<p class='empty-state'>暂无通知</p>");
    const total = document.getElementById("notice-total"); if (total) total.textContent = (state.notices || []).length + " 条";
    setHtml("notice-target", "<option value='ALL'>所有报名者</option>" + (state.applications || []).map(x => "<option value='" + esc(x.id) + "'>" + esc(x.name) + " · " + esc(x.id) + "</option>").join(""));
  }

  function renderConfig() {
    const box = document.getElementById("config-editor"); if (!box) return; const c = state.config || {};
    const pack = JSON.stringify(c.starterPack || {}, null, 2);
    box.innerHTML = "<div class='admin-card-head'><h2>活动配置</h2><span>保存后官网实时生效</span></div><form class='field-grid'><label>活动名称<input name='eventName' value='" + esc(c.eventName) + "'></label><label>活动日期<input name='date' value='" + esc(c.date) + "'></label><label>活动地点<input name='venue' value='" + esc(c.venue) + "'></label><label>主题揭晓<input name='themeReveal' value='" + esc(c.themeReveal) + "'></label><label>报名截止" + timeInput("applicationDeadline", "报名截止", c.applicationDeadline) + "</label><label>录取公布" + timeInput("resultDate", "录取公布", c.resultDate) + "</label><label>投票开始时间" + timeInput("voteStartAt", "投票开始时间", c.voteStartAt) + "</label><label>报名状态<select name='applicationOpen'><option value='true'>开放</option><option value='false'>关闭</option></select></label><label>正式组队确认<select name='teamConfirmOpen'><option value='true'>开启</option><option value='false'>关闭</option></select></label><label>投票状态<select name='voteOpen'><option value='true'>开放</option><option value='false'>关闭</option></select></label><label>参与者投票权重（%）<input name='participantWeight' type='number' min='0' max='100' value='" + Number(c.participantWeight || 60) + "'></label><label>Jury 投票权重（%）<input name='juryWeight' type='number' min='0' max='100' value='" + Number(c.juryWeight || 40) + "'></label><label class='config-pack'>Starter Pack（JSON）<textarea name='starterPack' rows='10'>" + esc(pack) + "</textarea></label><div class='config-actions'><button class='button button-dark'>保存配置</button></div></form>";
    box.querySelector('[name="applicationOpen"]').value = String(c.applicationOpen);
    box.querySelector('[name="teamConfirmOpen"]').value = String(Boolean(c.teamConfirmOpen));
    box.querySelector('[name="voteOpen"]').value = String(c.voteOpen);
    box.querySelector("form").onsubmit = async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.currentTarget));
      d.applicationOpen = d.applicationOpen === "true"; d.teamConfirmOpen = d.teamConfirmOpen === "true"; d.voteOpen = d.voteOpen === "true";
      d.participantWeight = Number(d.participantWeight); d.juryWeight = Number(d.juryWeight);
      for (const key of ["applicationDeadline", "resultDate", "voteStartAt"]) {
        const parsed = joinTime(d[key + "Date"], d[key + "Hour"], d[key + "Minute"]);
        if (parsed === undefined) return toast("日期格式不正确，请重新选择。", "error");
        d[key] = parsed;
        delete d[key + "Date"]; delete d[key + "Hour"]; delete d[key + "Minute"];
      }
      if (d.participantWeight + d.juryWeight !== 100) return toast("参与者与 Jury 权重之和必须为 100%。", "error");
      try { d.starterPack = JSON.parse(d.starterPack); } catch { return toast("Starter Pack 必须是有效的 JSON。", "error"); }
      try { await api.request("/api/admin/config", { method: "PATCH", body: JSON.stringify(d) }); toast("配置已保存，官网已同步", "success"); await load(); } catch (err) { toast(err.message, "error"); }
    };
  }

  function splitStageLines(value) {
    return String(value || "").split(/\r?\n|,/).map(item => item.trim()).filter(Boolean).slice(0, 20);
  }

  function stageBriefContext() {
    const stage = window.MinicampStage;
    const configured = state.config?.stageSchedule;
    const schedule = configured && typeof configured === "object"
      ? JSON.parse(JSON.stringify(configured))
      : stage?.getSchedule?.();
    if (!schedule) return { stage, schedule: null, day: "day1", index: 0, item: null };
    const stageState = stage?.getState?.() || { day: "day1", index: 0 };
    const day = Array.isArray(schedule[stageState.day]) ? stageState.day : "day1";
    const list = schedule[day] || [];
    const index = Math.min(Math.max(list.length - 1, 0), Math.max(0, Number(stageState.index) || 0));
    return { stage, schedule, day, index, item: list[index] };
  }

  function renderStageBriefEditor() {
    const form = document.getElementById("stage-brief-form");
    if (!form || !state) return;
    const context = stageBriefContext();
    if (!context.item) return;
    const script = form.elements.script;
    const actions = form.elements.actions;
    if (document.activeElement !== script) script.value = context.item.script || "";
    if (document.activeElement !== actions) actions.value = (context.item.actions || []).join("\n");
    form.onsubmit = async event => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget));
      const next = JSON.parse(JSON.stringify(context.schedule));
      const target = next[context.day][context.index];
      target.script = String(data.script || "").trim();
      target.actions = splitStageLines(data.actions);
      try {
        await api.request("/api/admin/config", { method: "PATCH", body: JSON.stringify({ stageSchedule: next }) });
        state.config.stageSchedule = next;
        context.stage?.setSchedule?.(next);
        toast("主持人提示和现场动作已保存", "success");
        await load();
      } catch (error) { toast(error.message, "error"); }
    };
  }

  function exportCsv() {
    const cols = [["报名类型", a => (a.registration_type || "contestant") === "roadshow" ? "路演报名" : "参赛报名"], ["报名编号", "id"], ["姓名", "name"], ["学号", "studentId"], ["学院", "college"], ["专业", "major"], ["年级", "grade"], ["手机号", "phone"], ["邮箱", "email"], ["能力标签", a => (a.skills || []).join(" / ")], ["参与动机", "motivation"], ["经历", "experience"], ["作品集", "portfolio"], ["能帮助", "canHelpWith"], ["想探索", "explore"], ["找我聊", "askMeAbout"], ["状态", "status"], ["提交时间", a => fmt(a.createdAt)]];
    const cell = v => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
    const head = cols.map(c => cell(c[0])).join(",");
    const rows = (state.applications || []).map(a => cols.map(c => cell(typeof c[1] === "function" ? c[1](a) : a[c[1]])).join(","));
    const csv = "\uFEFF" + [head, ...rows].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "minicamp-报名名单-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    toast("已导出 " + (state.applications || []).length + " 条报名", "success");
  }

  document.getElementById("applicant-search")?.addEventListener("input", applyFilters);
  document.getElementById("applicant-status")?.addEventListener("change", applyFilters);
  document.getElementById("applicant-type")?.addEventListener("change", () => { applyFilters(); renderCategoryChart(); });
  document.querySelectorAll("#category-switch [data-category]").forEach(button => button.onclick = () => { categoryKey = button.dataset.category; renderCategoryChart(); });
  document.getElementById("export-csv")?.addEventListener("click", exportCsv);
  document.getElementById("refresh-data")?.addEventListener("click", () => { load(); toast("已刷新"); });

  // ---- 轮询刷新：报名 / 队伍 / Idea / Q&A 等后台数据定时同步 ----
  // 用户正在输入时跳过本次刷新，避免覆盖正在编辑的搜索框、通知或配置内容。
  const POLL_KEY = "minicamp2026_admin_poll";
  const pollState = { enabled: true, seconds: 15, timer: 0, syncing: false };
  const pollToggle = document.getElementById("admin-poll-toggle");
  const pollInterval = document.getElementById("admin-poll-interval");
  const pollTime = document.getElementById("admin-poll-time");

  /** 有输入焦点时暂停覆盖式刷新（登录框也算）。 */
  function isTyping() {
    const active = document.activeElement;
    if (!active) return false;
    const tag = active.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    return Boolean(active.isContentEditable);
  }
  function readPollSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(POLL_KEY) || "null");
      if (saved && typeof saved === "object") {
        if (typeof saved.enabled === "boolean") pollState.enabled = saved.enabled;
        if (Number(saved.seconds) > 0) pollState.seconds = Number(saved.seconds);
      }
    } catch { /* 忽略损坏的本地设置 */ }
  }
  function savePollSettings() {
    try { localStorage.setItem(POLL_KEY, JSON.stringify({ enabled: pollState.enabled, seconds: pollState.seconds })); } catch { /* 隐私模式下忽略 */ }
  }
  function markSynced(reason) {
    if (!pollTime) return;
    pollTime.textContent = "已同步 " + new Date().toLocaleTimeString("zh-CN", { hour12: false }) + (reason === "poll" ? "（自动）" : "");
  }
  /** 未登录 / 登录过期都算需要重新登录：把登录卡片放回来。 */
  function needsLogin(error) {
    if (!api.getAdminToken()) return true;
    const message = String(error?.message || "");
    return /admin required|login required|invalid admin/i.test(message);
  }
  /** 拉取后台数据；withQa 时同时刷新 Q&A 面板（qa-admin.js 提供）。 */
  async function sync({ withQa = false, reason = "poll", notify = true } = {}) {
    if (pollState.syncing) return false;
    if (reason === "poll" && isTyping()) return false;
    if (!api.getAdminToken()) { showLogin(); return false; }
    pollState.syncing = true;
    try {
      state = await api.request("/api/admin/summary");
      document.getElementById("admin-login")?.remove();
      render();
      if (withQa) await window.MinicampQAAdmin?.reload?.();
      markSynced(reason);
      return true;
    } catch (error) {
      // 登录失效要重新显示登录卡片，其它错误只提示，避免页面变成一片空白。
      if (needsLogin(error)) showLogin();
      else if (reason === "manual" && notify) toast(error.message, "error");
      return false;
    } finally { pollState.syncing = false; }
  }
  function stopPolling() {
    if (pollState.timer) clearInterval(pollState.timer);
    pollState.timer = 0;
  }
  function startPolling() {
    stopPolling();
    if (!pollState.enabled) return;
    pollState.timer = setInterval(() => { if (!document.hidden) sync({ withQa: true, reason: "poll" }); }, Math.max(5, pollState.seconds) * 1000);
  }
  readPollSettings();
  if (pollToggle) pollToggle.checked = pollState.enabled;
  if (pollInterval) pollInterval.value = String(pollState.seconds);
  pollToggle?.addEventListener("change", () => { pollState.enabled = pollToggle.checked; savePollSettings(); startPolling(); toast(pollState.enabled ? "已开启自动刷新" : "已关闭自动刷新"); });
  pollInterval?.addEventListener("change", () => { pollState.seconds = Number(pollInterval.value) || 15; savePollSettings(); startPolling(); toast("自动刷新间隔：" + pollState.seconds + " 秒"); });
  document.getElementById("admin-poll-now")?.addEventListener("click", async () => { const ok = await sync({ withQa: true, reason: "manual" }); if (ok) toast("已刷新最新数据", "success"); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && pollState.enabled) sync({ withQa: true, reason: "poll" }); });
  startPolling();
  document.getElementById("notice-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const form = e.currentTarget;
    const d = Object.fromEntries(new FormData(form));
    try {
      await api.request("/api/admin/notices", { method: "POST", body: JSON.stringify(d) });
      form.reset();
      toast("通知已发布", "success");
      await load();
    } catch (err) { toast(err.message, "error"); }
  });

  function activate(panel) {
    document.querySelectorAll(".admin-nav button").forEach(x => x.classList.toggle("active", x.dataset.panel === panel));
    document.querySelectorAll(".admin-panel").forEach(x => x.classList.toggle("active", x.id === "panel-" + panel));
    const meta = PANEL_META[panel];
    if (meta) { const title = document.getElementById("admin-title"), sub = document.getElementById("admin-subtitle"); if (title) title.textContent = meta[0]; if (sub) sub.textContent = meta[1]; }
  }
  document.querySelectorAll(".admin-nav button").forEach(b => b.onclick = () => activate(b.dataset.panel));
  document.querySelectorAll("[data-switch]").forEach(b => b.onclick = () => activate(b.dataset.switch));

  window.MinicampStage?.subscribe(() => { if (state) renderStageBriefEditor(); });
  // 其它后台脚本（例如 qa-admin.js）需要读取当前后台数据用于展示。
  window.MinicampAdmin = { getState: () => state, reload: load };
  load();
})();
