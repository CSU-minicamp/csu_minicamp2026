(function () {
  const STORAGE_KEY = "minicamp2026_applications";
  const TEAM_KEY = "minicamp2026_teams";
  const VOTE_KEY = "minicamp2026_votes";
  const NOTIFICATION_KEY = "minicamp2026_notifications";
  const state = {
    panel: "overview",
    applications: JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"),
    teams: JSON.parse(localStorage.getItem(TEAM_KEY) || "[]"),
    votes: JSON.parse(localStorage.getItem(VOTE_KEY) || "[]"),
    notices: JSON.parse(localStorage.getItem(NOTIFICATION_KEY) || "[]")
  };

  const titles = {
    overview: ["活动总览", "把报名、组队和现场结果放在一个工作台里。"],
    applicants: ["报名管理", "查看申请资料、能力结构与录取状态。"],
    teams: ["分队情况", "把不同能力和不同想法连接成可以交付的小队。"],
    voting: ["投票统计", "实时查看 Demo Fair 后的奖项投票情况。"],
    notices: ["公告通知", "发布活动公告，并向特定报名者发送审核进度。"]
  };

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.applications));
    localStorage.setItem(TEAM_KEY, JSON.stringify(state.teams));
    localStorage.setItem(VOTE_KEY, JSON.stringify(state.votes));
    localStorage.setItem(NOTIFICATION_KEY, JSON.stringify(state.notices));
  }

  function initials(name = "主") { return name.slice(0, 1); }
  function countByStatus(status) { return state.applications.filter(item => item.status === status).length; }
  function render() {
    renderOverview(); renderApplicants(); renderTeams(); renderVoting(); renderNotices();
  }

  function renderOverview() {
    const accepted = countByStatus("已录取");
    const teams = state.teams.filter(item => !item.unassigned).length;
    document.getElementById("metrics-grid").innerHTML = [
      ["报名总数", state.applications.length, "当前原型数据"],
      ["已录取", accepted, accepted ? `${Math.round(accepted / Math.max(state.applications.length, 1) * 100)}% 录取比例` : "等待审核"],
      ["已建队伍", teams, "含已确认 Team ID"],
      ["已收集投票", state.votes.reduce((sum, item) => sum + item.people + item.overall, 0), "演示票数"]
    ].map(item => `<div class="metric-card"><span>${item[0]}</span><strong>${item[1]}</strong><small>${item[2]}</small></div>`).join("");

    const total = Math.max(state.applications.length, 1);
    document.getElementById("status-bars").innerHTML = [
      ["待审核", countByStatus("待审核"), "var(--cyan)"],
      ["已录取", countByStatus("已录取"), "var(--yellow)"],
      ["候补", countByStatus("候补"), "var(--coral)"],
      ["待复审", countByStatus("待复审"), "var(--yellow)"]
    ].map(item => `<div><div class="status-bar-label"><span>${item[0]}</span><b>${item[1]}</b></div><div class="status-bar-track"><i style="width:${item[1] / total * 100}%;background:${item[2]}"></i></div></div>`).join("");

    const skillCounts = {};
    state.applications.forEach(item => (item.skills || []).forEach(skill => { skillCounts[skill] = (skillCounts[skill] || 0) + 1; }));
    const topSkills = Object.entries(skillCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
    document.getElementById("skill-bars").innerHTML = topSkills.length ? topSkills.map(item => `<div><div class="status-bar-label"><span>${item[0]}</span><b>${item[1]} 人</b></div><div class="status-bar-track"><i style="width:${item[1] / Math.max(...topSkills.map(value => value[1])) * 100}%"></i></div></div>`).join("") : `<div class="empty-state">还没有能力标签数据</div>`;

    const recent = state.applications.slice(0, 4);
    document.getElementById("activity-list").innerHTML = recent.length ? recent.map(item => `<div class="activity-item"><span class="activity-dot">${initials(item.name)}</span><p><strong>${item.name}</strong> 提交了报名<br><time>${formatTime(item.createdAt)}</time></p></div>`).join("") : `<div class="empty-state">暂无报名动态</div>`;
  }

  function renderApplicants() {
    const search = (document.getElementById("applicant-search")?.value || "").toLowerCase();
    const status = document.getElementById("applicant-status")?.value || "全部";
    const items = state.applications.filter(item => {
      const text = `${item.name} ${item.college} ${item.id}`.toLowerCase();
      return (!search || text.includes(search)) && (status === "全部" || item.status === status);
    });
    const tbody = document.getElementById("applicants-table");
    if (!items.length) { tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state">没有匹配的报名记录</div></td></tr>`; return; }
    tbody.innerHTML = items.map(item => `<tr>
      <td><div class="name-cell"><span class="mini-avatar">${initials(item.name)}</span><div><strong>${item.name}</strong><br><small>${item.college} · ${item.major}</small></div></div></td>
      <td>${item.id}</td><td>${item.entryType}</td><td>${(item.skills || []).map(skill => `<span class="tag">${skill}</span>`).join(" ") || "—"}</td><td>${item.teamCode || "—"}</td>
      <td><select class="status-select status-${statusClass(item.status)}" data-id="${item.id}"><option ${item.status === "待审核" ? "selected" : ""}>待审核</option><option ${item.status === "待复审" ? "selected" : ""}>待复审</option><option ${item.status === "已录取" ? "selected" : ""}>已录取</option><option ${item.status === "候补" ? "selected" : ""}>候补</option></select></td>
      <td><button class="row-action" title="查看完整资料" data-view="${item.id}">查看 ↗</button></td>
    </tr>`).join("");
    tbody.querySelectorAll(".status-select").forEach(select => select.addEventListener("change", event => {
      const item = state.applications.find(application => application.id === event.target.dataset.id);
      item.status = event.target.value;
      state.notices.unshift({ id: `notice-status-${Date.now()}`, title: `报名状态更新：${item.status}`, body: item.status === "已录取" ? "恭喜，你的报名已通过审核。请继续留意活动安排与 AI Coding Starter Pack。" : `主办方已将你的报名状态更新为“${item.status}”，如有疑问请联系主办方。`, type: "报名进度", target: item.id, readBy: [], createdAt: new Date().toISOString() });
      save(); render(); showToast(`已更新 ${item.name} 的状态`);
    }));
    tbody.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => {
      const item = state.applications.find(application => application.id === button.dataset.view);
      alert(`申请编号：${item.id}\n姓名：${item.name}\n学院：${item.college}\n专业年级：${item.major}\n联系方式：${item.phone} / ${item.email}\n报名方式：${item.entryType}\n能力：${(item.skills || []).join("、") || "未填写"}\n动机：${item.motivation || "未填写"}`);
    }));
  }

  function renderTeams() {
    const assignedIds = new Set(state.teams.flatMap(team => team.memberIds || []));
    const unassigned = state.applications.filter(item => !assignedIds.has(item.id));
    const cards = state.teams.filter(team => !team.unassigned).map(team => {
      const members = state.applications.filter(item => (team.memberIds || []).includes(item.id));
      return `<article class="team-card-admin"><div class="team-card-head"><strong>${team.id}</strong><span>${members.length} / 5 人</span></div><p style="margin:14px 0 0;font-size:12px;font-weight:700">${team.project || "暂未命名"}</p><small style="color:var(--muted);font-size:10px">${team.code || "无 Team Code"}</small><ul class="team-member-list">${members.map(member => `<li><span>${member.name}</span><small>${(member.skills || []).join(" · ") || "待补充"}</small></li>`).join("") || `<li><span>尚未添加成员</span></li>`}</ul></article>`;
    }).join("");
    document.getElementById("team-board").innerHTML = cards + `<article class="team-card-admin unassigned"><div class="team-card-head"><strong>待分配</strong><span>${unassigned.length} 人</span></div><p style="margin:14px 0;color:var(--muted);font-size:12px">需要主办方进一步连接的参与者</p><ul class="team-member-list">${unassigned.map(member => `<li><span>${member.name}</span><small>${(member.skills || []).join(" · ") || "待补充"}</small></li>`).join("") || `<li><span>所有人都已入队</span></li>`}</ul></article>`;
  }

  function renderVoting() {
    const sorted = [...state.votes].sort((a, b) => b.overall - a.overall);
    const leader = sorted[0];
    document.getElementById("vote-leader").innerHTML = leader ? `<span>BEST OVERALL · 当前领先</span><strong>${leader.project}</strong><p>${leader.team} · ${leader.overall} 票</p>` : `<span>BEST OVERALL</span><strong>暂无投票</strong><p>Demo Fair 后数据会显示在这里</p>`;
    const max = Math.max(...state.votes.map(item => item.overall), 1);
    document.getElementById("vote-list").innerHTML = state.votes.length ? state.votes.map(item => `<div class="vote-row"><span><b>${item.project}</b><br><small>${item.team}</small></span><div class="vote-meter"><i style="width:${item.overall / max * 100}%"></i></div><strong>${item.overall}</strong></div>`).join("") : `<div class="empty-state">暂无投票数据</div>`;
  }

  function renderNotices() {
    const targetSelect = document.getElementById("notice-target");
    if (!targetSelect) return;
    const currentTarget = targetSelect.value;
    targetSelect.innerHTML = `<option value="ALL">所有报名者</option>${state.applications.map(item => `<option value="${item.id}">${item.name} · ${item.id}</option>`).join("")}`;
    if (["ALL", ...state.applications.map(item => item.id)].includes(currentTarget)) targetSelect.value = currentTarget;
    document.getElementById("notice-total").textContent = `${state.notices.length} 条`;
    document.getElementById("admin-notice-list").innerHTML = state.notices.length ? state.notices.slice(0, 12).map(item => `<article class="admin-notice-item"><div class="notice-meta"><span>${item.type}</span><time>${formatTime(item.createdAt)}</time></div><h3>${item.title}</h3><p>${item.body}</p><small>发送给：${item.target === "ALL" ? "所有报名者" : item.target}</small></article>`).join("") : `<div class="empty-state">还没有发布通知</div>`;
  }

  function switchPanel(panel) {
    state.panel = panel;
    document.querySelectorAll(".admin-nav button").forEach(button => button.classList.toggle("active", button.dataset.panel === panel));
    document.querySelectorAll(".admin-panel").forEach(section => section.classList.toggle("active", section.id === `panel-${panel}`));
    document.getElementById("admin-title").textContent = titles[panel][0];
    document.getElementById("admin-subtitle").textContent = titles[panel][1];
  }
  document.querySelectorAll(".admin-nav button").forEach(button => button.addEventListener("click", () => switchPanel(button.dataset.panel)));
  document.querySelectorAll("[data-switch]").forEach(button => button.addEventListener("click", () => switchPanel(button.dataset.switch)));
  document.getElementById("applicant-search")?.addEventListener("input", renderApplicants);
  document.getElementById("applicant-status")?.addEventListener("change", renderApplicants);
  document.getElementById("refresh-data")?.addEventListener("click", () => { state.applications = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); render(); showToast("数据已刷新"); });
  document.getElementById("export-csv")?.addEventListener("click", exportCsv);
  document.getElementById("auto-team")?.addEventListener("click", autoTeam);
  document.getElementById("create-team")?.addEventListener("click", createTeam);
  document.getElementById("reset-votes")?.addEventListener("click", () => { if (confirm("确定要清空演示票数吗？")) { state.votes = []; save(); render(); showToast("演示票数已清空"); } });
  document.getElementById("notice-form")?.addEventListener("submit", event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const title = String(data.get("title") || "").trim();
    const body = String(data.get("body") || "").trim();
    if (!title || !body) { showToast("请填写通知标题和内容"); return; }
    state.notices.unshift({ id: `notice-${Date.now()}`, title, body, type: data.get("type"), target: data.get("target"), readBy: [], createdAt: new Date().toISOString() });
    save(); event.currentTarget.reset(); render(); showToast("通知已发布");
  });

  function autoTeam() {
    const available = state.applications.filter(item => !item.teamId && item.status !== "候补");
    if (available.length < 3) { showToast("可分组成员不足 3 人"); return; }
    const id = `TEAM ${String(state.teams.length + 1).padStart(2, "0")}`;
    const memberIds = available.slice(0, Math.min(4, available.length)).map(item => item.id);
    state.teams.push({ id, code: `MC26-${Math.random().toString(36).slice(2, 6).toUpperCase()}`, project: "待填写项目名", theme: "待揭晓", memberIds });
    state.applications.forEach(item => { if (memberIds.includes(item.id)) { item.teamId = id; item.status = "已录取"; } });
    save(); render(); showToast(`${id} 已创建，分配 ${memberIds.length} 名成员`);
  }
  function createTeam() {
    const id = `TEAM ${String(state.teams.length + 1).padStart(2, "0")}`;
    state.teams.push({ id, code: `MC26-${Math.random().toString(36).slice(2, 6).toUpperCase()}`, project: "待填写项目名", theme: "待揭晓", memberIds: [] });
    save(); render(); showToast(`${id} 已创建`);
  }
  function exportCsv() {
    const headers = ["申请编号", "姓名", "学院", "专业年级", "报名方式", "能力标签", "Team Code", "状态"];
    const lines = state.applications.map(item => [item.id, item.name, item.college, item.major, item.entryType, (item.skills || []).join(" / "), item.teamCode, item.status].map(value => `"${String(value || "").replaceAll('"', '""')}"`).join(","));
    const blob = new Blob(["\ufeff" + [headers.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "minicamp-2026-applicants.csv"; anchor.click(); URL.revokeObjectURL(url); showToast("已导出报名 CSV");
  }
  function statusClass(status) { return status === "已录取" ? "accepted" : status === "候补" ? "waitlist" : status === "待复审" ? "review" : "pending"; }
  function formatTime(value) { const date = new Date(value); return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`; }
  function showToast(message) { const toast = document.getElementById("admin-toast"); toast.textContent = message; toast.classList.add("show"); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove("show"), 2200); }
  render();
})();
