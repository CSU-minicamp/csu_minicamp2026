(() => {
  const api = window.MinicampAPI, login = document.getElementById("profile-login"), dashboard = document.getElementById("profile-dashboard");
  let current;
  const params = new URLSearchParams(location.search);
  const returnTo = params.get("returnTo") || "";
  const profileRequired = params.get("profileRequired") === "1";
  const accountDeleted = params.get("accountDeleted") === "1";
  const localPreview = api.isLocalPreview?.();
  const contestantBasicFields = ["name", "studentId", "college", "major", "grade", "phone", "email"];
  document.querySelectorAll('input[name="phone"]').forEach(input => input.addEventListener("input", () => { const digits = input.value.replace(/\D/g, "").slice(0, 11); if (input.value !== digits) input.value = digits; }));
  document.querySelectorAll('input[name="studentId"]').forEach(input => input.addEventListener("input", () => { const digits = input.value.replace(/\D/g, "").slice(0, 10); if (input.value !== digits) input.value = digits; }));
  const activatePanel = id => { document.querySelectorAll("[data-profile-panel]").forEach(item => item.classList.toggle("active", item.dataset.profilePanel === id)); document.querySelectorAll(".profile-panel").forEach(panel => panel.classList.toggle("active", panel.id === id)); };
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  const renderIntendedTeammates = team => {
    const container = document.getElementById("profile-intended-teammates");
    if (!container) return;
    const teammates = (team?.members || []).filter(member => member.id !== current.id);
    if (!team || team.locked || !teammates.length) {
      container.hidden = true;
      container.innerHTML = "";
      return;
    }
    const captain = team.members.find(member => member.id === team.ownerId);
    const otherMembers = teammates.filter(member => member.id !== team.ownerId);
    const statusLabel = member => member.status || "已报名";
    container.hidden = false;
    container.className = "profile-intended-teammates";
    container.innerHTML = "<div class='profile-intended-head'><div><p class='section-kicker'>预组队 / 意向关系</p><h3>意向队友</h3><p>队长提交成员编号后，队伍关系会同步出现在相关成员的个人主页。</p></div><div class='profile-intended-meta'><span>队伍人数</span><strong>" + team.members.length + " 人</strong></div></div>" +
      "<div class='profile-intended-captain-card'><span class='profile-intended-role'>队长</span><div><strong>" + escapeHtml(captain?.name || "待确认") + "</strong><span>报名编号 " + escapeHtml(captain?.id || "待确认") + " · " + escapeHtml(statusLabel(captain || {})) + "</span></div><em>已建立意向</em></div>" +
      "<div class='profile-intended-subhead'><span>意向队友</span><small>" + otherMembers.length + " 位意向队友</small></div><ul class='profile-intended-list'>" + otherMembers.map((member, index) => "<li><span class='profile-intended-index'>" + String(index + 1).padStart(2, "0") + "</span><div><strong>" + escapeHtml(member.name) + "</strong><span>报名编号 " + escapeHtml(member.id) + "</span></div><em>" + escapeHtml(statusLabel(member)) + "</em></li>").join("") + "</ul>";
  };
  const splitLegacyMajor = participant => {
    const major = String(participant?.major || "");
    if (participant?.grade || !major) return {major, grade: String(participant?.grade || "")};
    const match = major.match(/^\s*(.*?)\s*·\s*(大一|大二|大三|大四|研究生)\s*$/);
    return match ? {major: match[1], grade: match[2]} : {major, grade: ""};
  };
  const setBasicFieldsEditable = (form, editable) => {
    form.querySelector("#profile-basic-block")?.classList.toggle("profile-basic-readonly", !editable);
    contestantBasicFields.forEach(name => {
      const field = form.elements[name];
      if (!field) return;
      field.readOnly = !editable;
      field.disabled = field.tagName === "SELECT" && !editable;
      field.setAttribute("aria-readonly", String(!editable));
    });
  };
  if (login && accountDeleted) document.getElementById("login-success").textContent = "账号已注销，报名、预组队及其他关联记录已删除。";
  const show = async () => {
    try {
      const data = localPreview ? {participant: api.getPreviewParticipant(), team: null} : await api.request("/api/me"); current = data.participant; if (login) login.hidden = true; if (dashboard) dashboard.hidden = false;
      const roadshow = (current.registration_type || current.registrationType || "contestant") === "roadshow";
      const roadshowBox = document.getElementById("roadshow-profile");
      if (roadshowBox) {
        roadshowBox.hidden = !roadshow;
        roadshowBox.innerHTML = roadshow ? "<div class='roadshow-summary'><p class='section-kicker'>ROADSHOW PROFILE</p><h3>路演报名已通过</h3><p>报名码 <strong>" + escapeHtml(current.id) + "</strong></p><dl><div><dt>身份类型</dt><dd>" + escapeHtml(current.identity_type) + "</dd></div><div><dt>学校 / 单位</dt><dd>" + escapeHtml(current.school_or_company) + "</dd></div><div><dt>年级 / 职位</dt><dd>" + escapeHtml(current.grade_or_position) + "</dd></div><div><dt>现场路演</dt><dd>" + (current.attend_roadshow ? "参加" : "不参加") + "</dd></div><div><dt>活动通知</dt><dd>" + (current.receive_notifications ? "接收" : "不接收") + "</dd></div></dl><p class='field-help'>路演用户仅可查看和修改个人资料、报名码和活动通知。如需参赛，请从首页重新选择“报名参赛”。</p></div>" : "";
        document.querySelectorAll('[data-profile-panel="profile-votes"],#profile-votes,.profile-side-tip').forEach(el => { if (roadshow) el.hidden = true; });
      }
      document.getElementById("profile-name").textContent = current.name; document.getElementById("profile-application-id").textContent = current.id; document.getElementById("profile-status").innerHTML = "<strong>" + escapeHtml(current.status) + "</strong><span>" + (data.team ? escapeHtml(data.team.id) + " · " + data.team.members.length + " 人" : "尚未确认队伍") + "</span>"; renderIntendedTeammates(data.team); if (profileRequired && !api.isProfileComplete(current)) { activatePanel("profile-details"); document.getElementById("edit-save-state").textContent = "请先完善所有必填个人信息，再继续。"; }
      const legacyContestantProfile = !roadshow ? splitLegacyMajor(current) : null;
      const form = document.getElementById("profile-edit-form"); if (form && roadshow) { form.hidden = false; form.elements.studentId.required = false; form.elements.motivation.required = false; form.elements.studentId.closest("label").hidden = true; form.elements.college.closest("label").querySelector("input").previousElementSibling; form.elements.college.closest("label").firstChild.textContent = "学校 / 单位"; form.elements.major.closest("label").firstChild.textContent = "年级 / 职位"; form.elements.grade.closest("label").hidden = true; form.elements.motivation.closest("label").hidden = true; } if (form) setBasicFieldsEditable(form, roadshow); for (const [name,value] of Object.entries(current)) { const field = form?.elements[name]; if (field && field.type !== "checkbox" && field.type !== "radio") field.value = value || ""; } if (form && !roadshow && legacyContestantProfile) { form.elements.major.value = legacyContestantProfile.major; form.elements.grade.value = legacyContestantProfile.grade; } if (form && roadshow) { form.elements.college.value = current.school_or_company || ""; form.elements.major.value = current.grade_or_position || ""; }
      form.querySelectorAll('input[name="skills"]').forEach(input => input.checked = (current.skills || []).includes(input.value));
      document.getElementById("last-updated").textContent = current.updatedAt ? new Date(current.updatedAt).toLocaleString("zh-CN") : "已提交";
      if (!localPreview) { await renderNotices(); if (!roadshow) await renderVote(); }
    } catch { if (dashboard) location.replace("profile.html"); }
  };
  async function renderNotices() { const {notices} = await api.request("/api/me/notices"); const list = document.getElementById("notice-list"); const unread = notices.filter(item => !(item.readBy || []).includes(current.id)).length; const noticeCount = document.getElementById("notice-count"); noticeCount.textContent = unread; noticeCount.hidden = unread === 0; list.innerHTML = notices.map(item => { const read = (item.readBy || []).includes(current.id); return "<article class='notice-item " + (read ? "is-read" : "is-unread") + "'><div class='notice-marker'>" + (read ? "✓" : "!") + "</div><div><div class='notice-meta'><span>" + item.type + "</span><time>" + new Date(item.createdAt).toLocaleString("zh-CN") + "</time></div><h3>" + item.title + "</h3><p>" + item.body + "</p></div></article>"; }).join("") || "<p>暂无通知</p>"; }
  async function renderVote() {
    const container = document.getElementById("my-vote-content");
    if (!container) return;
    const {vote, voteOpen} = await api.request("/api/me/vote");
    if (!vote) {
      container.innerHTML = "<div class='my-vote-empty'><span>○</span><div><strong>" + (voteOpen ? "你还没有投票。" : "投票暂未开放。") + "</strong><p>" + (voteOpen ? "浏览作品后，为你喜欢的项目投出一票。" : "主办方设置开始时间后，这里会显示投票入口。") + "</p>" + (voteOpen ? "<a class='button button-primary' href='vote.html'>去投票 <span>↗</span></a>" : "") + "</div></div>";
      return;
    }
    const groups = vote.selections.reduce((result, selection) => {
      (result[selection.award] ||= []).push(selection);
      return result;
    }, {});
    container.innerHTML = "<div class='my-vote-record'><div class='my-vote-record-head'><span>已于 " + new Date(vote.createdAt).toLocaleString("zh-CN") + " 提交</span><b>已锁定</b></div>" + Object.entries(groups).map(([award, selections]) =>
      "<section><h3>" + award + "</h3><ol>" + selections.sort((a, b) => b.points - a.points).map(selection =>
        "<li><span>" + escapeHtml(selection.projectName) + "</span><strong>" + selection.points + " 票</strong></li>"
      ).join("") + "</ol></section>"
    ).join("") + "</div>";
  }
  document.getElementById("profile-login-form")?.addEventListener("submit", async event => { event.preventDefault(); const id = document.getElementById("login-id").value.trim(), contact = document.getElementById("login-contact").value.trim(), loginError = document.getElementById("login-error"); if (/^\d+$/.test(contact) && !api.isValidPhone(contact)) { loginError.textContent = "手机号请输入 11 位数字；也可以使用报名时填写的邮箱。"; document.getElementById("login-contact").focus(); return; } try { await api.participantLogin(id,contact); location.assign(returnTo || "profile-dashboard.html"); } catch (err) { loginError.textContent = err.message; } });
document.getElementById("profile-edit-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget, data = new FormData(form), payload = Object.fromEntries(data.entries());
    payload.skills = data.getAll("skills");
    delete payload.consent;
    const saveState = document.getElementById("edit-save-state");
    const editError = document.getElementById("edit-error");
    editError.textContent = "";
    const roadshow = (current.registration_type || current.registrationType) === "roadshow";
    if (!roadshow) {
      const legacyContestantProfile = splitLegacyMajor(current);
      contestantBasicFields.forEach(name => { payload[name] = legacyContestantProfile[name] ?? current[name] ?? ""; });
    }
    if (roadshow) {
      payload.identity_type = current.identity_type;
      payload.school_or_company = payload.college;
      payload.grade_or_position = payload.major;
      payload.attend_roadshow = current.attend_roadshow;
      payload.receive_notifications = current.receive_notifications;
      if (!["name", "phone", "email", "identity_type", "school_or_company", "grade_or_position"].every(key => String(payload[key] || "").trim())) {
        editError.textContent = "请先填写姓名、手机号、邮箱、学校 / 单位和年级 / 职位。";
        return;
      }
    } else if (!api.isProfileComplete(payload)) {
      editError.textContent = "请先填写姓名、学号、学院、专业、年级、手机号、邮箱和参与动机。";
      return;
    }
    if (!roadshow && !api.isValidStudentId(payload.studentId)) {
      form.elements.studentId.focus();
      editError.textContent = "请输入 10 位数字学号。";
      return;
    }
    if (!api.isValidPhone(payload.phone)) {
      form.elements.phone.focus();
      editError.textContent = "请输入 11 位手机号。";
      return;
    }
    try {
      await api.request("/api/me", {method:"PATCH", body:JSON.stringify(payload)});
      if (returnTo) { location.assign(returnTo); return; }
      saveState.textContent = roadshow ? "已保存。" : "已保存，等待主办方复核。";
      await show();
    } catch (err) { editError.textContent = err.message; }
  });
  document.querySelectorAll("[data-profile-panel]").forEach(button => button.addEventListener("click", () => { document.querySelectorAll("[data-profile-panel]").forEach(item => item.classList.toggle("active", item === button)); document.querySelectorAll(".profile-panel").forEach(panel => panel.classList.toggle("active", panel.id === button.dataset.profilePanel)); }));
  document.getElementById("mark-read")?.addEventListener("click", async () => { await api.request("/api/me/notices/read",{method:"POST"}); await renderNotices(); });
  document.getElementById("profile-logout")?.addEventListener("click", () => { api.logout(); location.reload(); });
  document.getElementById("profile-delete-account")?.addEventListener("click", async event => {
    const button = event.currentTarget;
    if (!window.confirm("注销后将永久删除你的报名资料、预组队、项目成员记录、创意、投票、通知和登录会话，且无法恢复。确定要注销账号吗？")) return;
    button.disabled = true;
    try {
      await api.request("/api/me", {method:"DELETE"});
      api.logout();
      location.replace("profile.html?accountDeleted=1");
    } catch (err) {
      button.disabled = false;
      document.getElementById("edit-error").textContent = err.message;
    }
  });
  if (dashboard) show();
  else if (localPreview) location.replace("profile-dashboard.html?preview=1");
  else if (api.getToken()) api.request("/api/me").then(() => { const destination = returnTo ? "profile-dashboard.html?returnTo=" + encodeURIComponent(returnTo) + "&profileRequired=1" : "profile-dashboard.html"; location.replace(destination); }).catch(() => api.logout());
})();

