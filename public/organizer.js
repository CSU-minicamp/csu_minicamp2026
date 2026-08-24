(() => {
  const navToggle = document.querySelector(".nav-toggle");
  const nav = document.getElementById("organizer-site-nav");
  navToggle?.addEventListener("click", () => { const open = nav.classList.toggle("open"); navToggle.setAttribute("aria-expanded", String(open)); });
  const esc = value => String(value ?? "").replace(/[&<>\"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'\"':"&quot;", "'":"&#39;"}[ch]));
  const metrics = document.getElementById("organizer-metrics");
  (window.MinicampAPI ? window.MinicampAPI.request("/api/organizer/summary") : fetch("/api/organizer/summary").then(response => { if (!response.ok) throw new Error("load failed"); return response.json(); })).then(({config, metrics: data, teams, projects, notices}) => {
    metrics.innerHTML = [["报名总数", data.applications], ["已录取", data.accepted], ["待审核", data.pending], ["队伍", data.teams], ["已发布项目", data.publishedProjects]].map(([label, value]) => `<div class="metric-card"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>公开摘要</small></div>`).join("");
    document.getElementById("organizer-config").innerHTML = [["活动日期", config.date], ["活动地点", config.venue], ["报名状态", config.applicationOpen ? "开放" : "暂未开放"], ["报名截止", config.applicationDeadline], ["录取公布", config.resultDate]].map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join("");
    document.getElementById("organizer-notices").innerHTML = notices.length ? notices.map(item => `<article class="admin-notice-item"><div class="notice-meta"><span>${esc(item.type)}</span><time>${esc(new Date(item.createdAt).toLocaleString("zh-CN"))}</time></div><h3>${esc(item.title)}</h3><p>${esc(item.body)}</p></article>`).join("") : "<p>暂无公告</p>";
    document.getElementById("organizer-projects").innerHTML = [...teams.map(team => `<article class="organizer-public-item"><span>${esc(team.id)}</span><h3>${esc(team.project)}</h3><p>${esc(team.theme)} · ${esc(team.memberCount)} 人 · ${esc(team.status)}</p></article>`), ...projects.map(project => `<article class="organizer-public-item"><span>${esc(project.id)}</span><h3>${esc(project.projectName)}</h3><p>${esc(project.theme)} · ${esc(project.tagline)}</p>${project.demoUrl ? `<a href="${esc(project.demoUrl)}" target="_blank" rel="noreferrer">查看 Demo ↗</a>` : ""}</article>`)].join("") || "<p>暂无公开项目</p>";
  }).catch(() => { metrics.innerHTML = "<p>公开信息暂时无法加载。</p>"; });
})();
