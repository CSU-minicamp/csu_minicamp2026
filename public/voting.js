(() => {
  const api = MinicampAPI;
  const awards = ["Best Overall", "Best Product", "Best Design", "Best Technical", "Most Unexpected"];
  const login = document.getElementById("voting-login-form");
  const form = document.getElementById("voting-form");
  const modal = document.getElementById("project-detail-modal");
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  const safeUrl = value => {
    try {
      const url = new URL(value, location.href);
      return ["http:", "https:"].includes(url.protocol) ? escapeHtml(url.href) : "";
    } catch { return ""; }
  };
  const voteDraft = Object.fromEntries(awards.map(award => [award, {3: "", 2: "", 1: ""}]));
  let projects = [];
  let voter;
  let votingOpen = false;

  const projectName = id => projects.find(project => project.id === id)?.projectName || "未选择";
  const choiceForProject = (projectId, award) => Object.entries(voteDraft[award]).find(([, id]) => id === projectId)?.[0] || "";
  const rankLabel = points => ({3: "第一选择 · 3 票", 2: "第二选择 · 2 票", 1: "第三选择 · 1 票"}[points]);

  function renderDraftSummary() {
    const summary = document.getElementById("vote-draft-summary");
    if (!summary) return;
    const rows = awards.map(award => {
      const picks = [3, 2, 1].map(points => `<span><b>${rankLabel(points)}</b>${escapeHtml(projectName(voteDraft[award][points]))}</span>`).join("");
      return `<div class="vote-draft-row"><strong>${escapeHtml(award)}</strong><div>${picks}</div></div>`;
    }).join("");
    const missing = awards.reduce((count, award) => count + [3, 2, 1].filter(points => !voteDraft[award][points]).length, 0);
    summary.innerHTML = `<div class="vote-draft-head"><div><p class="section-kicker">YOUR DRAFT</p><h3>已选的投票</h3></div><span>${missing ? `还差 ${missing} 个选择` : "正式奖项已选齐"}</span></div>${rows}<div class="vote-draft-row people-draft"><strong>People's Choice</strong><div><span><b>现场人气奖</b>${escapeHtml(peopleChoice ? projectName(peopleChoice) : "未选择")}</span></div></div>`;
  }

  let peopleChoice = "";

  function projectVotePicker(project) {
    if (project.teamId === voter.teamId) {
      return "<p class='project-vote-disabled'>这是你的队伍，不能为自己的项目投票。</p>";
    }
    const options = [
      ["", "不投这个奖项"],
      ["3", "第一选择 · 3 票"],
      ["2", "第二选择 · 2 票"],
      ["1", "第三选择 · 1 票"]
    ];
    const formal = awards.map(award => `<label><span>${escapeHtml(award)}</span><select data-vote-award data-award="${escapeHtml(award)}"><option value="">不投</option>${options.slice(1).map(([value, label]) => `<option value="${value}" ${choiceForProject(project.id, award) === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>`).join("");
    return `<div class="project-vote-picker"><p class="section-kicker">CAST YOUR VOTE</p><p>选择这个项目要进入哪些奖项，以及它在该奖项中的票次。</p><div class="project-vote-options">${formal}<label><span>People's Choice</span><select data-vote-people><option value="">不投</option><option value="yes" ${peopleChoice === project.id ? "selected" : ""}>现场人气奖</option></select></label></div><button class="button button-primary" type="button" data-vote-project>投它一票 <span>✓</span></button></div>`;
  }

  function showProject(project) {
    if (!project) return;
    const demoUrl = safeUrl(project.demoUrl);
    const githubUrl = safeUrl(project.githubUrl);
    const links = [
      demoUrl && `<a class='button button-primary' href='${demoUrl}' target='_blank' rel='noreferrer'>打开 Demo <span>↗</span></a>`,
      githubUrl && `<a class='outline-button' href='${githubUrl}' target='_blank' rel='noreferrer'>查看 GitHub ↗</a>`
    ].filter(Boolean).join("");
    const ownTeam = voter && project.teamId === voter.teamId;
    document.getElementById("project-detail-content").innerHTML =
      `<p class='section-kicker'>${escapeHtml(project.theme)}</p><h2 id='project-detail-title'>${escapeHtml(project.projectName)}</h2>` +
      `<p class='project-detail-tagline'>${escapeHtml(project.tagline)}</p>` +
      `<dl class='project-detail-copy'><div><dt>问题</dt><dd>${escapeHtml(project.problem)}</dd></div><div><dt>方案</dt><dd>${escapeHtml(project.solution)}</dd></div></dl>` +
      `<div class='project-detail-members'><h3>团队成员</h3>${(project.members || []).map(member => `<span>${escapeHtml(member.name)}<small>${escapeHtml(member.role || "成员")}</small></span>`).join("")}</div>` +
      `<div class='project-detail-tools'>${(project.aiTools || []).map(tool => `<span>${escapeHtml(tool)}</span>`).join("")}</div>` +
      (links ? `<div class='project-detail-actions'>${links}</div>` : "") +
      (ownTeam ? "<p class='project-vote-disabled'>这是你的队伍，不能为自己的项目投票。</p>" : projectVotePicker(project));
    modal.showModal();
    modal.querySelector("[data-vote-project]")?.addEventListener("click", () => {
      const choices = Object.fromEntries([...modal.querySelectorAll("[data-vote-award]")].map(select => [select.dataset.award, select.value]));
      choices.people = modal.querySelector("[data-vote-people]")?.value || "";
      applyProjectVote(project, choices);
      modal.close();
      render();
      document.getElementById("vote-draft-feedback").textContent = `已记录「${project.projectName}」的投票选择，还可以继续选择其他项目。`;
    });
  }

  function applyProjectVote(project, choices) {
    for (const award of awards) {
      for (const points of [3, 2, 1]) {
        if (voteDraft[award][points] === project.id) voteDraft[award][points] = "";
      }
      const points = Number(choices[award]);
      if ([1, 2, 3].includes(points)) voteDraft[award][points] = project.id;
    }
    if (choices.people === "yes") peopleChoice = project.id;
    else if (peopleChoice === project.id) peopleChoice = "";
  }

  function render() {
    const available = projects.filter(project => project.teamId !== voter.teamId);
    document.getElementById("project-count").textContent = projects.length + " 个作品";
    document.getElementById("project-browser-grid").innerHTML = projects.map((project, index) => {
      const selected = awards.flatMap(award => {
        const points = choiceForProject(project.id, award);
        return points ? [rankLabel(points)] : [];
      });
      if (peopleChoice === project.id) selected.push("People's Choice");
      return `<button class='project-browser-card accent-${["coral", "cyan", "yellow"][index % 3]}' type='button' data-project-id='${escapeHtml(project.id)}'><span>${String(index + 1).padStart(2, "0")} · ${escapeHtml(project.theme)}</span><strong>${escapeHtml(project.projectName)}</strong><p>${escapeHtml(project.tagline)}</p><small>${selected.length ? "已选 · " + escapeHtml(selected.join(" / ")) : "查看详情并投票"} <b>↗</b></small></button>`;
    }).join("") || "<p class='empty-state'>暂时还没有已发布的作品。</p>";
    document.querySelectorAll("[data-project-id]").forEach(button => button.addEventListener("click", () => showProject(projects.find(project => project.id === button.dataset.projectId))));
    renderDraftSummary();
    document.getElementById("formal-votes")?.remove();
    document.getElementById("people-candidates")?.closest(".people-choice-block")?.remove();
  }

  function showRecordedVote(vote) {
    document.getElementById("voting-login")?.setAttribute("hidden", "true");
    document.getElementById("voting-workspace")?.setAttribute("hidden", "true");
    const summary = vote.selections.map(selection => `<li><span>${escapeHtml(selection.award)}</span><strong>${escapeHtml(selection.projectName)}</strong><small>${selection.points} 票</small></li>`).join("");
    const success = document.getElementById("vote-success");
    success.innerHTML = `<span class='success-mark'>✓</span><p class='section-kicker'>VOTE ALREADY RECORDED</p><h1>你已经完成投票。</h1><p>投票提交后不能修改。以下是你已记录的选择：</p><ul class='recorded-vote-list'>${summary}</ul><a class='button button-dark' href='profile-dashboard.html'>查看我的投票</a>`;
    success.hidden = false;
  }

  function showVoteSuccess() {
    const success = document.getElementById("vote-success");
    success.innerHTML = "<span class='success-mark'>✓</span><p class='section-kicker'>VOTE RECEIVED</p><h1>你的选择已记录。</h1><p>感谢你认真体验每一个作品。投票提交后不能修改，你可以在个人主页查看自己的投票结果。</p><a class='button button-dark' href='profile-dashboard.html'>查看我的投票</a>";
    success.hidden = false;
  }

  api.request("/api/config").then(({config}) => {
    votingOpen = Boolean(config.voteOpen);
    if (!votingOpen && login) {
      const button = login.querySelector("button[type=submit]");
      if (button) button.disabled = true;
      const status = document.createElement("p");
      status.className = "vote-closed-status";
      status.textContent = "投票暂未开放，主办方设置开始时间后会自动开放。";
      login.insertBefore(status, login.querySelector("button"));
    }
  }).catch(() => {});

  login?.addEventListener("submit", async event => {
    event.preventDefault();
    if (!votingOpen) {
      document.getElementById("voter-error").textContent = "投票暂未开放。";
      return;
    }
    try {
      await api.participantLogin(document.getElementById("voter-id").value, document.getElementById("voter-contact").value);
      location.assign("vote.html");
    } catch (error) { document.getElementById("voter-error").textContent = error.message; }
  });

  form?.addEventListener("submit", async event => {
    event.preventDefault();
    document.getElementById("voting-error").textContent = "";
    const selections = [];
    for (const award of awards) {
      const picks = [3, 2, 1].map(points => ({award, projectId: voteDraft[award][points], points}));
      if (picks.some(pick => !pick.projectId) || new Set(picks.map(pick => pick.projectId)).size < 3) {
        document.getElementById("voting-error").textContent = "每个奖项请选择三个不同项目。请点击项目卡片继续选择。";
        return;
      }
      selections.push(...picks);
    }
    if (!peopleChoice) {
      document.getElementById("voting-error").textContent = "请选择 People's Choice。请点击项目卡片后选择现场人气奖。";
      return;
    }
    selections.push({award: "People's Choice", projectId: peopleChoice, points: 1});
    try {
      await api.request("/api/votes", {method: "POST", body: JSON.stringify({selections})});
      document.getElementById("voting-workspace").hidden = true;
      showVoteSuccess();
    } catch (error) {
      document.getElementById("voting-error").textContent = error.message === "vote already submitted" ? "你已经完成投票，投票提交后不能修改。" : error.message;
    }
  });

  document.getElementById("project-detail-close")?.addEventListener("click", () => modal.close());
  modal?.addEventListener("click", event => { if (event.target === modal) modal.close(); });
  document.getElementById("voting-logout")?.addEventListener("click", () => { api.logout(); location.assign("voting.html"); });

  async function openWorkspace() {
    const workspace = document.getElementById("voting-workspace");
    if (!workspace || login) return;
    try {
      const profile = await api.requireProfile("vote.html");
      if (!profile) return;
      const {config} = await api.request("/api/config");
      document.querySelector("main")?.removeAttribute("hidden");
      if (!config.voteOpen) {
        location.replace("voting.html");
        return;
      }
      voter = profile.participant;
      const voteState = await api.request("/api/me/vote");
      if (voteState.vote) {
        showRecordedVote(voteState.vote);
        return;
      }
      projects = (await api.request("/api/projects")).projects;
      document.getElementById("voter-name").textContent = voter.name;
      workspace.hidden = false;
      render();
    } catch { location.replace("voting.html"); }
  }

  openWorkspace();
})();
