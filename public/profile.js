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
  const NOTICE_TYPE_LABEL = { "资料复核": "资料复核", "问答": "问答回复", "活动公告": "活动公告", "报名进度": "报名进度", "录取结果": "录取结果", "现场提醒": "现场提醒", event: "活动公告", application: "报名进度", roadshow: "路演报名" };
  const noticeTypeLabel = value => NOTICE_TYPE_LABEL[String(value || "").trim()] || String(value || "").trim() || "通知";
  /** 这条通知是给谁的：所有人，还是只发给我（主办方定向发送时带上报名编号）。 */
  const noticeRecipientLabel = (notice, mineId) => {
    const target = String(notice?.target || "ALL");
    if (target === "ALL" || !target) return { mine: true, label: "发给所有人", detail: "所有报名者都会收到这条通知。" };
    if (target === mineId) return { mine: true, label: "只发给你", detail: "这是主办方单独发给你的通知。" };
    return { mine: false, label: "发给报名编号 " + target, detail: "这条通知由主办方定向发送给该报名者。" };
  };
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
  const splitLegacyMajor = participant => { const normalized = api.normalizeProfile(participant); return {major: normalized.major || "", grade: normalized.grade || ""}; };
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
        roadshowBox.innerHTML = roadshow ? "<div class='roadshow-summary'><p class='section-kicker'>ROADSHOW PROFILE</p><h3>路演报名已通过</h3><p>报名码 <strong>" + escapeHtml(current.id) + "</strong></p><p class='field-help'>下面是你的路演报名资料，可随时修改并保存，主办方会同步看到最新版本。如需参赛、组队与提交项目，请从首页重新选择「报名参赛」。</p></div>" : "";
        document.querySelectorAll('[data-profile-panel="profile-votes"],#profile-votes,.profile-side-tip').forEach(el => { if (roadshow) el.hidden = true; });
      }
      const roadshowReady = ["name", "phone", "email", "identity_type", "school_or_company", "grade_or_position"].every(key => String(current[key] || "").trim());
      document.getElementById("profile-name").textContent = current.name; document.getElementById("profile-application-id").textContent = current.id; document.getElementById("profile-status").innerHTML = "<strong>" + escapeHtml(current.status) + "</strong><span>" + (data.team ? escapeHtml(data.team.id) + " · " + data.team.members.length + " 人" : roadshow ? "路演观众 · 无需组队" : "尚未确认队伍") + "</span>"; renderIntendedTeammates(data.team); if (profileRequired && !(roadshow ? roadshowReady : api.isProfileComplete(current))) { activatePanel("profile-details"); document.getElementById("edit-save-state").textContent = roadshow ? "请先完善姓名、手机号、邮箱与身份信息，再继续。" : "请先完善所有必填个人信息，再继续。"; }
      const legacyContestantProfile = !roadshow ? splitLegacyMajor(current) : null;
      const form = document.getElementById("profile-edit-form");
      const setBlock = (id, hidden) => { const block = document.getElementById(id); if (block) block.hidden = hidden; };
      const setBlockDisabled = (id, disabled) => { const block = document.getElementById(id); if (block) block.querySelectorAll("input, select, textarea").forEach(field => { field.disabled = disabled; }); };
      if (form) { setBlock("profile-basic-block", roadshow); setBlock("profile-skills-block", roadshow); setBlock("roadshow-basic-block", !roadshow); setBasicFieldsEditable(form, false); setBlockDisabled("roadshow-basic-block", !roadshow); setBlockDisabled("profile-skills-block", roadshow); }
      if (form && roadshow) {
        const lead = document.querySelector("#profile-details .profile-panel-lead");
        if (lead) lead.textContent = "路演报名资料可随时更新，保存后会同步给主办方；身份类型与活动选择也可以在这里修改。";
        const fill = (name, value) => { const field = form.elements[name]; if (field) field.value = value ?? ""; };
        fill("rs_name", current.name); fill("rs_phone", current.phone); fill("rs_email", current.email);
        fill("rs_identity_type", current.identity_type); fill("rs_school_or_company", current.school_or_company); fill("rs_grade_or_position", current.grade_or_position);
        if (form.elements.rs_attend_roadshow) form.elements.rs_attend_roadshow.checked = current.attend_roadshow !== false;
        if (form.elements.rs_receive_notifications) form.elements.rs_receive_notifications.checked = current.receive_notifications !== false;
      }
      if (form && !roadshow) {
        for (const [name,value] of Object.entries(current)) { const field = form.elements[name]; if (field && field.type !== "checkbox" && field.type !== "radio") field.value = value || ""; }
        if (legacyContestantProfile) { form.elements.major.value = legacyContestantProfile.major; form.elements.grade.value = legacyContestantProfile.grade; }
      }
      form.querySelectorAll('input[name="skills"]').forEach(input => input.checked = (current.skills || []).includes(input.value));
      document.getElementById("last-updated").textContent = current.updatedAt ? new Date(current.updatedAt).toLocaleString("zh-CN") : "已提交";
      if (!localPreview) { await renderNotices(); if (!roadshow) await renderVote(); startNoticePolling(); }
    } catch { if (dashboard) location.replace("profile.html"); }
  };
  // 通知内容来自主办方输入：纯文本一律转义，超文本（format=html）先消毒再渲染。
  /** 首页弹窗只弹一次，所以通知中心这里保留「参与确认」入口，错过弹窗的人还能补回复。 */
  const noticeBodyHtml = item => item.format === "html"
    ? "<div class='notice-body rich-text'>" + (MinicampUI?.sanitizeHtml(item.body) ?? escapeHtml(item.body)) + "</div>"
    : "<p>" + escapeHtml(item.body) + "</p>";
  const noticeReplyLabel = (item, value) => (item.replyOptions || []).find(option => String(option.value) === String(value))?.label || String(value);
  const noticeReplyBlock = item => {
    if (!item.requiresReply) return "";
    if (item.myReply) return "<div class='notice-reply-done'>你已回复：<b>" + escapeHtml(noticeReplyLabel(item, item.myReply.value)) + "</b></div>";
    // canReply 由服务端判定（需要回复 + 已录取的参赛者），前端不再自己算身份。
    if (!item.canReply) return "";
    return "<div class='notice-reply-actions'>" + (item.replyOptions || []).map(option =>
      "<button class='outline-button notice-reply-button' type='button' data-notice-id='" + escapeHtml(item.id) + "' data-value='" + escapeHtml(option.value) + "'>" + escapeHtml(option.label) + "</button>"
    ).join("") + "</div>";
  };
  const renderNotices = async () => {
    const {notices} = await api.request("/api/me/notices");
    const list = document.getElementById("notice-list");
    const unread = notices.filter(item => !(item.readBy || []).includes(current.id)).length;
    const noticeCount = document.getElementById("notice-count"); noticeCount.textContent = unread; noticeCount.hidden = unread === 0;
    list.innerHTML = notices.map(item => {
      const read = (item.readBy || []).includes(current.id);
      const to = noticeRecipientLabel(item, current.id);
      return "<article class='notice-item " + (read ? "is-read" : "is-unread") + "' data-notice-id='" + escapeHtml(item.id) + "'><div class='notice-marker'>" + (read ? "✓" : "!") + "</div><div><div class='notice-meta'><span>" + escapeHtml(noticeTypeLabel(item.type)) + "</span><time>" + new Date(item.createdAt).toLocaleString("zh-CN") + "</time></div><div class='notice-recipient " + (to.mine ? "is-mine" : "is-other") + "'><b>发给谁</b><span>" + escapeHtml(to.label) + "</span><i>" + escapeHtml(to.detail) + "</i></div><h3>" + escapeHtml(item.title) + "</h3>" + noticeBodyHtml(item) + noticeReplyBlock(item) + "</div></article>";
    }).join("") || "<p>暂无通知</p>";
  };
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
    const form = event.currentTarget, data = new FormData(form);
    let payload = Object.fromEntries(data.entries());
    payload.skills = data.getAll("skills");
    delete payload.consent;
    const saveState = document.getElementById("edit-save-state");
    const editError = document.getElementById("edit-error");
    editError.textContent = "";
    const roadshow = (current.registration_type || current.registrationType) === "roadshow";
    const fail = (field, message) => { form.querySelectorAll(".field-error").forEach(el => el.classList.remove("field-error")); if (field) { field.classList.add("field-error"); field.focus(); } editError.textContent = message; };
    if (!roadshow) {
      const legacyContestantProfile = splitLegacyMajor(current);
      contestantBasicFields.forEach(name => { payload[name] = legacyContestantProfile[name] ?? current[name] ?? ""; });
    }
    if (roadshow) {
      const value = name => { const field = form.elements[name]; return field ? String(field.value || "").trim() : ""; };
      const missing = [["rs_name", "姓名"], ["rs_phone", "手机号"], ["rs_email", "邮箱"], ["rs_identity_type", "身份类型"], ["rs_school_or_company", "学校 / 单位"], ["rs_grade_or_position", "年级 / 职位"]].find(([name]) => !value(name));
      if (missing) { fail(form.elements[missing[0]], "请先填写：" + missing[1] + "。"); return; }
      if (form.elements.rs_email && !form.elements.rs_email.checkValidity()) { fail(form.elements.rs_email, "请检查邮箱格式。"); return; }
      payload = {name: value("rs_name"), phone: value("rs_phone"), email: value("rs_email"), identity_type: value("rs_identity_type"), school_or_company: value("rs_school_or_company"), grade_or_position: value("rs_grade_or_position"), attend_roadshow: Boolean(form.elements.rs_attend_roadshow?.checked), receive_notifications: Boolean(form.elements.rs_receive_notifications?.checked)};
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
      fail(roadshow ? form.elements.rs_phone : form.elements.phone, "请输入 11 位手机号。");
      return;
    }
    try {
      await api.request("/api/me", {method:"PATCH", body:JSON.stringify(payload)});
      if (returnTo) { location.assign(returnTo); return; }
      saveState.textContent = roadshow ? "已保存。" : "已保存，等待主办方复核。";
      await show();
    } catch (err) { editError.textContent = err.message; }
  });
  document.querySelectorAll("[data-profile-panel]").forEach(button => button.addEventListener("click", () => { document.querySelectorAll("[data-profile-panel]").forEach(item => item.classList.toggle("active", item === button)); document.querySelectorAll(".profile-panel").forEach(panel => panel.classList.toggle("active", panel.id === button.dataset.profilePanel)); if (button.dataset.profilePanel === "profile-notices") markNoticesRead(); }));

  /**
   * 打开通知中心就算看过了：把当前未读一次性标记为已读（服务端按通知 id 落库），
   * 这样主办方在后台能实时看到「已读 N / M 人」，而不是永远 0。
   */
  let markingRead = false;
  async function markNoticesRead() {
    if (markingRead || !current) return;
    const unread = [...document.querySelectorAll(".notice-item.is-unread")].map(item => item.dataset.noticeId).filter(Boolean);
    if (!unread.length) return;
    markingRead = true;
    try {
      const result = await api.request("/api/me/notices/read", { method: "POST", body: JSON.stringify({ id: unread }) });
      if (result?.changed) {
        await refreshNotices({ force: true });
        MinicampUI?.toast("已把 " + result.changed + " 条通知标为已读", { tone: "success" });
      }
    } catch { /* 标记失败不打断阅读，下次打开通知中心会再试 */ } finally { markingRead = false; }
  }

  // ---- 通知中心轮询：每 1 分钟拉一次新通知，只更新内容，不改窗口显示位置 ----
  const NOTICE_POLL_MS = 60000;
  let noticeTimer = 0, noticeRefreshing = false;
  const isEditingProfile = () => Boolean(document.activeElement && ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName));
  async function refreshNotices(options = {}) {
    if (noticeRefreshing || (!options.force && (document.hidden || isEditingProfile()))) return false;
    noticeRefreshing = true;
    try {
      // 重绘通知列表时锁住滚动位置：新通知只更新内容，页面仍停在原来的位置。
      if (window.MinicampScroll) await window.MinicampScroll.lock(renderNotices);
      else await renderNotices();
      return true;
    } catch { return false; } finally { noticeRefreshing = false; }
  }
  function startNoticePolling() {
    if (noticeTimer) clearInterval(noticeTimer);
    noticeTimer = setInterval(() => { refreshNotices(); }, NOTICE_POLL_MS);
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshNotices(); });
  // 通知中心的参与确认：点一下即写入回复，后台「通知与录取」会同步显示。
  document.getElementById("notice-list")?.addEventListener("click", async event => {
    const button = event.target?.closest?.(".notice-reply-button");
    if (!button) return;
    button.disabled = true;
    try {
      await api.request("/api/me/notices/reply", { method: "POST", body: JSON.stringify({ id: button.dataset.noticeId, value: button.dataset.value }) });
      await refreshNotices({ force: true });
      MinicampUI?.toast("已记录你的回复", { tone: "success" });
    } catch (error) {
      button.disabled = false;
      MinicampUI?.toast(error.message, { tone: "error" });
    }
  });
  document.getElementById("mark-read")?.addEventListener("click", async () => {
    try {
      const result = await api.request("/api/me/notices/read", { method: "POST" });
      await refreshNotices({ force: true });
      MinicampUI?.toast(result?.changed ? "已把 " + result.changed + " 条通知标为已读" : "没有未读通知", { tone: result?.changed ? "success" : "info" });
    } catch (error) { MinicampUI?.toast(error.message, { tone: "error" }); }
  });
  document.getElementById("profile-logout")?.addEventListener("click", () => { api.logout(); location.reload(); });
  document.getElementById("profile-delete-account")?.addEventListener("click", async event => {
    const button = event.currentTarget;
    const ok = await MinicampUI.confirm({kicker: "ACCOUNT / DELETE", tone: "danger", title: "确定注销账号？", body: "注销后将永久删除你的报名资料、预组队、项目成员记录、创意、投票、通知和登录会话，且无法恢复。", confirmText: "永久注销"});
    if (!ok) return;
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

