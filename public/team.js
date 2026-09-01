(() => {
  const api = MinicampAPI;
  const feedback = document.getElementById("team-feedback");
  let me;

  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));
  const setFeedback = (message = "", type = "") => {
    feedback.textContent = message;
    feedback.className = "team-feedback" + (type ? " is-" + type : "");
  };
  const readableError = error => ({
    "already belongs to a team": "你已经加入了一支队伍。",
    "team is locked or full": "这支队伍已锁定或已满员。",
    "leave current team first": "请先离开当前未锁定的队伍。",
    "team code required": "请输入完整的队伍邀请码。",
    "team code not found": "没有找到这个邀请码对应的队伍。",
    "team member required": "只有当前队伍成员可以进行这项操作。",
    "team must have 3 to 5 members": "队伍需要有 3–5 名成员才能锁定。",
    "locked team cannot be changed": "队伍已锁定，不能再调整成员。",
    "submitter must keep the project team": "该队伍已有项目提交，不能直接解散。请联系主办方处理。"
  }[error.message] || error.message || "操作未完成，请稍后重试。");
  const memberLabel = member => {
    const skills = (member.skills || []).filter(Boolean).join(" / ");
    return "<li><strong>" + escapeHtml(member.name) + "</strong>" + (skills ? "<span>" + escapeHtml(skills) + "</span>" : "") + "</li>";
  };

  function renderMyTeam(team) {
    const createForm = document.getElementById("create-team-form");
    const joinByCodeForm = document.getElementById("join-by-code-form");
    if (!team) {
      createForm.hidden = false;
      joinByCodeForm.hidden = false;
      document.getElementById("my-team").innerHTML = "<div class='team-empty'><strong>\u4f60\u8fd8\u6ca1\u6709\u961f\u4f0d</strong><p>\u53ef\u4ee5\u81ea\u5df1\u521b\u5efa\u4e00\u652f\u961f\u4f0d\uff0c\u6216\u4ece\u4e0b\u65b9\u52a0\u5165\u6b63\u5728\u62db\u52df\u7684\u961f\u4f0d\u3002</p></div>";
      return;
    }

    createForm.hidden = true;
    joinByCodeForm.hidden = true;
    const count = team.members.length;
    const missing = Math.max(0, 3 - count);
    const status = team.locked
      ? "\u5df2\u9501\u5b9a\u00b7 \u6210\u5458\u5df2\u786e\u8ba4"
      : missing
        ? "\u8fd8\u5dee " + missing + " \u4eba\u624d\u80fd\u9501\u5b9a"
        : "\u5df2\u6ee1\u8db3\u9501\u5b9a\u4eba\u6570\uff0c\u8bf7\u786e\u8ba4\u6210\u5458";
    const members = team.members.map(memberLabel).join("") + Array.from({ length: 5 - count }, () => "<li class='team-slot-empty'>\u7a7a\u7f3a\u5f85\u52a0\u5165</li>").join("");
    document.getElementById("my-team").innerHTML =
      "<div class='team-focus-head'><div><p class='section-kicker'>MY TEAM</p><h3>" + escapeHtml(team.project || team.id) + "</h3><span class='team-status " + (team.locked ? "is-locked" : "") + "\">" + status + "</span></div><b>" + count + " / 5 \u4eba</b></div>" +
      "<p class='team-code'>\u961f\u4f0d\u9080\u8bf7\u7801 <strong>" + escapeHtml(team.code) + "</strong><button class='copy-code' type='button' data-code='" + escapeHtml(team.code) + "'>\u590d\u5236</button></p>" +
      "<ul class='team-member-list team-member-slots'>" + members + "</ul>" +
      "<div class='team-focus-actions'>" +
      (team.locked ? "<span class='team-action-note'>\u961f\u4f0d\u5df2\u9501\u5b9a\uff0c\u5982\u9700\u8c03\u6574\u8bf7\u8054\u7cfb\u4e3b\u529e\u65b9\u3002</span>" :
        "<button class='outline-button' id='leave-team' type='button'>\u79bb\u5f00\u8fd9\u652f\u961f\u4f0d</button>" +
        "<button class='button button-primary' id='lock-team' type='button' " + (missing ? "disabled title='\u9700\u8981\u81f3\u5c11 3 \u4eba\u624d\u80fd\u9501\u5b9a'" : "") + ">\u786e\u8ba4\u5e76\u9501\u5b9a\u961f\u4f0d</button>") +
      "</div>";
  }

  function renderTeams(teams, currentTeam) {
    const available = teams.filter(team => team.id !== currentTeam?.id);
    document.getElementById("team-list").innerHTML = available.length ? available.map(team => {
      const count = team.members.length;
      const canJoin = !currentTeam && !team.locked && count < 5;
      const label = team.locked ? "\u5df2\u9501\u5b9a" : count >= 5 ? "\u5df2\u6ee1\u5458" : currentTeam ? "\u5148\u79bb\u5f00\u5f53\u524d\u961f\u4f0d" : "\u52a0\u5165\u8fd9\u652f\u961f\u4f0d";
      return "<article class='team-card-admin'><div class='team-card-head'><strong>" + escapeHtml(team.project || team.id) + "</strong><span>" + count + " / 5 \u4eba</span></div>" +
        "<small class='team-code'>" + escapeHtml(team.id) + " \u00b7 \u9080\u8bf7\u7801 " + escapeHtml(team.code) + "</small>" +
        "<ul>" + team.members.map(memberLabel).join("") + "</ul>" +
        "<button class='outline-button join-team' data-id='" + escapeHtml(team.id) + "' " + (canJoin ? "" : "disabled") + ">" + label + "</button></article>";
    }).join("") : "<p class='team-list-empty'>\u76ee\u524d\u6ca1\u6709\u5176\u4ed6\u5f00\u653e\u961f\u4f0d\u3002</p>";
  }

  async function render() {
    try {
      const mine = await api.request("/api/me");
      me = mine.participant;
      const [teamData, ideaData] = await Promise.all([api.request("/api/teams"), api.request("/api/ideas")]);
      renderMyTeam(mine.team);
      renderTeams(teamData.teams, mine.team);
      document.getElementById("idea-list").innerHTML = ideaData.ideas.map(idea =>
        "<article class='idea-card'><span>" + escapeHtml(idea.theme) + "</span><h3>" + escapeHtml(idea.title) + "</h3><p>" + escapeHtml(idea.summary) + "</p><small>\u5bfb\u627e\uff1a" + escapeHtml((idea.needs || []).join(" / ")) + "</small></article>"
      ).join("") || "<p class='team-list-empty'>\u8fd8\u6ca1\u6709\u516c\u5f00\u7684 Idea\u3002</p>";
      bindTeamActions(mine.team);
    } catch {
      location.assign("profile.html");
    }
  }

  function bindTeamActions(team) {
    document.querySelectorAll(".join-team").forEach(button => button.addEventListener("click", async () => {
      const card = button.closest("article");
      const name = card?.querySelector("strong")?.textContent || "\u8fd9\u652f\u961f\u4f0d";
      if (!window.confirm("\u52a0\u5165\u201c" + name + "\u201d\uff1f\u52a0\u5165\u540e\u5728\u961f\u4f0d\u672a\u9501\u5b9a\u524d\u4ecd\u53ef\u4ee5\u79bb\u5f00\u3002")) return;
      try {
        await api.request("/api/teams/" + encodeURIComponent(button.dataset.id) + "/join", { method: "POST" });
        setFeedback("\u5df2\u52a0\u5165\u961f\u4f0d\uff0c\u8bf7\u7ee7\u7eed\u9080\u8bf7\u6210\u5458\u3002", "success");
        await render();
      } catch (error) { setFeedback(readableError(error), "error"); }
    }));
    document.getElementById("lock-team")?.addEventListener("click", async () => {
      if (!team || !window.confirm("\u9501\u5b9a\u540e\u65e0\u6cd5\u81ea\u884c\u589e\u51cf\u6210\u5458\u3002\u786e\u8ba4\u961f\u4f0d\u6210\u5458\u65e0\u8bef\uff1f")) return;
      try {
        await api.request("/api/teams/" + encodeURIComponent(team.id) + "/lock", { method: "PATCH" });
        setFeedback("\u961f\u4f0d\u5df2\u9501\u5b9a\uff0c\u63a5\u4e0b\u6765\u53ef\u4ee5\u51c6\u5907\u9879\u76ee\u63d0\u4ea4\u3002", "success");
        await render();
      } catch (error) { setFeedback(readableError(error), "error"); }
    });
    document.getElementById("leave-team")?.addEventListener("click", async () => {
      if (!team || !window.confirm("\u786e\u5b9a\u79bb\u5f00\u201c" + team.project + "\u201d\uff1f\u961f\u4f0d\u672a\u9501\u5b9a\u524d\u53ef\u4ee5\u91cd\u65b0\u52a0\u5165\u5176\u4ed6\u961f\u4f0d\u3002")) return;
      try {
        await api.request("/api/teams/" + encodeURIComponent(team.id) + "/leave", { method: "POST" });
        setFeedback("\u4f60\u5df2\u79bb\u5f00\u961f\u4f0d\uff0c\u53ef\u4ee5\u521b\u5efa\u6216\u52a0\u5165\u5176\u4ed6\u961f\u4f0d\u3002", "success");
        await render();
      } catch (error) { setFeedback(readableError(error), "error"); }
    });
    document.querySelectorAll(".copy-code").forEach(button => button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(button.dataset.code);
        setFeedback("\u961f\u4f0d\u9080\u8bf7\u7801\u5df2\u590d\u5236\u3002", "success");
      } catch {
        setFeedback("\u590d\u5236\u5931\u8d25\uff0c\u8bf7\u624b\u52a8\u8bb0\u4e0b\u9080\u8bf7\u7801\u3002", "error");
      }
    }));
  }

  document.getElementById("idea-form").addEventListener("submit", async event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await api.request("/api/ideas", { method: "POST", body: JSON.stringify({ title: data.get("title"), summary: data.get("summary"), theme: data.get("theme"), needs: String(data.get("needs") || "").split(",").map(item => item.trim()).filter(Boolean) }) });
      event.currentTarget.reset();
      setFeedback("Idea \u5df2\u53d1\u5e03\uff0c\u5176\u4ed6\u540c\u5b66\u73b0\u5728\u53ef\u4ee5\u770b\u5230\u5b83\u3002", "success");
      await render();
    } catch (error) { setFeedback(readableError(error), "error"); }
  });

  document.getElementById("create-team-form").addEventListener("submit", async event => {
    event.preventDefault();
    const project = new FormData(event.currentTarget).get("projectName").trim();
    try {
      await api.request("/api/teams", { method: "POST", body: JSON.stringify({ project }) });
      event.currentTarget.reset();
      setFeedback("\u961f\u4f0d\u5df2\u521b\u5efa\uff0c\u8bf7\u628a\u9080\u8bf7\u7801\u53d1\u7ed9\u961f\u53cb\u3002", "success");
      await render();
    } catch (error) { setFeedback(readableError(error), "error"); }
  });

  document.getElementById("join-by-code-form").addEventListener("submit", async event => {
    event.preventDefault();
    const input = event.currentTarget.elements.code;
    const code = input.value.trim().toUpperCase();
    try {
      await api.request("/api/teams/join-by-code", { method: "POST", body: JSON.stringify({ code }) });
      input.value = "";
      setFeedback("已加入邀请的队伍，请确认成员和锁定条件。", "success");
      await render();
    } catch (error) { setFeedback(readableError(error), "error"); }
  });

  render();
})();
