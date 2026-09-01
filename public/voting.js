(() => {
  const api = MinicampAPI;
  const awards = ["Best Overall", "Best Product", "Best Design", "Best Technical", "Most Unexpected"];
  const login = document.getElementById("voting-login-form");
  const form = document.getElementById("voting-form");
  const modal = document.getElementById("project-detail-modal");
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  let projects = [];
  let voter;
  let votingOpen = false;

  function showProject(project) {
    if (!project) return;
    const links = [
      project.demoUrl && "<a class='button button-primary' href='" + escapeHtml(project.demoUrl) + "' target='_blank' rel='noreferrer'>打开 Demo <span>↗</span></a>",
      project.githubUrl && "<a class='outline-button' href='" + escapeHtml(project.githubUrl) + "' target='_blank' rel='noreferrer'>查看 GitHub ↗</a>"
    ].filter(Boolean).join("");
    document.getElementById("project-detail-content").innerHTML =
      "<p class='section-kicker'>" + escapeHtml(project.theme) + "</p><h2 id='project-detail-title'>" + escapeHtml(project.projectName) + "</h2>" +
      "<p class='project-detail-tagline'>" + escapeHtml(project.tagline) + "</p>" +
      "<dl class='project-detail-copy'><div><dt>问题</dt><dd>" + escapeHtml(project.problem) + "</dd></div><div><dt>方案</dt><dd>" + escapeHtml(project.solution) + "</dd></div></dl>" +
      "<div class='project-detail-members'><h3>团队成员</h3>" + (project.members || []).map(member => "<span>" + escapeHtml(member.name) + "<small>" + escapeHtml(member.role || "成员") + "</small></span>").join("") + "</div>" +
      "<div class='project-detail-tools'>" + (project.aiTools || []).map(tool => "<span>" + escapeHtml(tool) + "</span>").join("") + "</div>" +
      (links ? "<div class='project-detail-actions'>" + links + "</div>" : "");
    modal.showModal();
  }

  function render() {
    const available = projects.filter(project => project.teamId !== voter.teamId);
    document.getElementById("project-count").textContent = projects.length + " 个作品";
    document.getElementById("project-browser-grid").innerHTML = projects.map((project, index) =>
      "<button class='project-browser-card accent-" + ["coral", "cyan", "yellow"][index % 3] + "' type='button' data-project-id='" + escapeHtml(project.id) + "'>" +
      "<span>" + String(index + 1).padStart(2, "0") + " · " + escapeHtml(project.theme) + "</span><strong>" + escapeHtml(project.projectName) + "</strong><p>" + escapeHtml(project.tagline) + "</p><small>查看详情 <b>↗</b></small></button>"
    ).join("") || "<p class='empty-state'>暂时还没有已发布的作品。</p>";
    document.querySelectorAll("[data-project-id]").forEach(button => button.addEventListener("click", () => showProject(projects.find(project => project.id === button.dataset.projectId))));
    document.getElementById("formal-votes").innerHTML = awards.map(award =>
      "<section class='formal-vote-block'><div class='vote-section-title'><h2>" + award + "</h2><span>第一 3 票 · 第二 2 票 · 第三 1 票</span></div><div class='rank-selects'>" +
      [3, 2, 1].map(points => "<label>" + points + " 票<select data-award='" + award + "' data-points='" + points + "' required><option value=''>请选择</option>" +
        available.map(project => "<option value='" + escapeHtml(project.id) + "'>" + escapeHtml(project.projectName) + "</option>").join("") + "</select></label>").join("") +
      "</div></section>"
    ).join("");
    document.getElementById("people-candidates").innerHTML = available.map(project =>
      "<label class='candidate-card'><input type='radio' name='people-choice' value='" + escapeHtml(project.id) + "'><strong>" + escapeHtml(project.projectName) + "</strong><small>" + escapeHtml(project.tagline) + "</small></label>"
    ).join("");
  }

  function showRecordedVote(vote) {
    const loginSection = document.getElementById("voting-login");
    const workspace = document.getElementById("voting-workspace");
    if (loginSection) loginSection.hidden = true;
    if (workspace) workspace.hidden = true;
    const summary = vote.selections.map(selection => "<li><span>" + escapeHtml(selection.award) + "</span><strong>" + escapeHtml(selection.projectName) + "</strong><small>" + selection.points + " 票</small></li>").join("");
    const success = document.getElementById("vote-success");
    success.innerHTML = "<span class='success-mark'>✓</span><p class='section-kicker'>VOTE ALREADY RECORDED</p><h1>你已经完成投票。</h1><p>投票提交后不能修改。以下是你已记录的选择：</p><ul class='recorded-vote-list'>" + summary + "</ul><a class='button button-dark' href='profile-dashboard.html'>查看我的投票</a>";
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
    } catch (error) {
      document.getElementById("voter-error").textContent = error.message;
    }
  });

  form?.addEventListener("submit", async event => {
    event.preventDefault();
    const selections = [];
    for (const award of awards) {
      const picks = [...form.querySelectorAll('select[data-award="' + award + '"]')];
      if (picks.some(pick => !pick.value) || new Set(picks.map(pick => pick.value)).size < 3) {
        document.getElementById("voting-error").textContent = "每个奖项请选择三个不同项目。";
        return;
      }
      picks.forEach(pick => selections.push({award, projectId: pick.value, points: Number(pick.dataset.points)}));
    }
    const people = form.querySelector('input[name="people-choice"]:checked');
    if (!people) {
      document.getElementById("voting-error").textContent = "请选择 People's Choice。";
      return;
    }
    selections.push({award: "People's Choice", projectId: people.value, points: 1});
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
      const [{config}, data] = await Promise.all([api.request("/api/config"), api.request("/api/me")]);
      if (!config.voteOpen) {
        location.replace("voting.html");
        return;
      }
      voter = data.participant;
      const voteState = await api.request("/api/me/vote");
      if (voteState.vote) {
        showRecordedVote(voteState.vote);
        return;
      }
      projects = (await api.request("/api/projects")).projects;
      document.getElementById("voter-name").textContent = voter.name;
      workspace.hidden = false;
      render();
    } catch {
      location.replace("voting.html");
    }
  }

  openWorkspace();
})();
