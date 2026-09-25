(() => {
  const api = MinicampAPI;
  const feedback = document.getElementById("team-feedback");
  let me;
  let team;
  let teamConfirmOpen = false;
  let requests = { outgoing: [], incoming: [] };
  const previewTeams = [
    { id: "PREVIEW-TEAM-01", code: "MC26-DEMO", project: "夜航指南", locked: false, published: true, members: [{ name: "林未", skills: ["Frontend", "AI Engineer"] }, { name: "陈星", skills: ["Design", "Media"] }] },
    { id: "PREVIEW-TEAM-02", code: "MC26-OPEN", project: "无障碍食堂", locked: false, published: true, members: [{ name: "周航", skills: ["Hardware"] }, { name: "许言", skills: ["Product"] }, { name: "沈知", skills: ["AI Engineer"] }, { name: "陈默", skills: ["Design"] }, { name: "林知", skills: ["Media"] }] }
  ];

  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));
  const setFeedback = (message = "", type = "") => {
    feedback.textContent = message;
    feedback.className = "team-feedback" + (type ? " is-" + type : "");
  };
  /** 弹窗统一走站内 UI；万一 ui.js 没加载成功，也要保证有提示，绝不静默跳走。 */
  const dialogText = options => [options?.title, ...(Array.isArray(options?.body) ? options.body : [options?.body])]
    .map(part => typeof part === "string" ? part : String(part?.html || "").replace(/<[^>]+>/g, ""))
    .filter(Boolean).join("\n\n");
  const uiAlert = options => (window.MinicampUI?.alert ? window.MinicampUI.alert(options) : Promise.resolve(window.alert(dialogText(options))));
  const uiConfirm = options => (window.MinicampUI?.confirm ? window.MinicampUI.confirm(options) : Promise.resolve(window.confirm(dialogText(options))));
  /** 与 server.mjs 的 isTeamEligible 保持一致：只有状态为「已录取」的参赛者可以使用组队工作区。 */
  const isEligible = participant => Boolean(participant)
    && (participant.registrationType || "contestant") === "contestant"
    && String(participant.status || "") === "已录取";
  /** 被挡在门外时按当前状态解释原因，并告诉对方下一步去哪。 */
  function accessReason(participant) {
    const isRoadshow = (participant.registrationType || "contestant") === "roadshow";
    if (isRoadshow) return {
      title: "路演报名不参与组队",
      body: [
        "你的报名类型是「路演报名」，只参加现场展示与交流，不使用组队工作区。",
        {html: "如果你想参赛、组队并提交项目，请在首页重新选择「报名参赛」，或联系主办方。"}
      ]
    };
    const status = String(participant.status || "");
    const why = {html: "只有状态为 <b>「已录取」</b> 的参赛者可以进入组队工作区。你可以在 <a href='admission.html'>录取名单</a> 查看自己的结果。"};
    if (status === "待审核") return {title: "你的报名还在审核中", body: ["报名结果公布、状态变成「已录取」之后，就可以进入组队工作区创建或加入队伍了。", why]};
    if (status === "待复审") return {title: "你的资料正在复核中", body: ["资料复核完成、状态回到「已录取」之后才能进入组队工作区。等待较久可以直接联系主办方。", why]};
    if (status === "候补") return {title: "你目前在候补名单中", body: ["候补转为「已录取」之后才能进入组队工作区组建或加入队伍。", why]};
    if (status === "未通过") return {title: "本次报名未通过", body: ["你没有进入本届参赛名单，因此不能使用组队工作区。欢迎来现场参加路演与交流。", why]};
    return {title: "暂时不能进入组队工作区", body: ["你当前的报名状态是「" + (status || "未知状态") + "」。", why]};
  }
  /** 未录取 / 路演报名：弹出提示框说明原因，确认后回个人主页。 */
  async function denyAccess(participant) {
    const reason = accessReason(participant || {});
    await uiAlert({kicker: "TEAM / ACCESS", tone: "error", title: reason.title, body: reason.body, confirmText: "返回个人主页"});
    location.assign("profile.html");
  }
  /** 已录取但资料还没补全：明确说明需要什么，再回个人主页补全。 */
  async function needProfile() {
    await uiAlert({
      kicker: "TEAM / PROFILE", tone: "info", title: "请先补全报名资料",
      body: ["组队工作区需要完整的报名资料：姓名、学号、学院、专业、年级、手机号、邮箱与参与动机。", {html: "在 <a href='profile.html'>个人主页</a> 补全并保存之后，就可以回来创建或加入队伍。"}],
      confirmText: "去补全资料"
    });
    api.redirectToProfile("team.html");
  }
  const readableError = error => {
    const message = String(error?.message || "");
    if (message.startsWith("member not admitted")) {
      const detail = message.includes(":") ? message.slice(message.indexOf(":") + 1).trim() : "";
      return "有成员还不是「已录取」状态，暂时不能加入队伍" + (detail ? "：" + detail : "") + "。请先确认对方已经被录取。";
    }
    if (message.startsWith("member profile incomplete")) {
      const detail = message.includes(":") ? message.slice(message.indexOf(":") + 1).trim() : "";
      return "有成员的报名资料不完整" + (detail ? "：" + detail : "") + "。请让对方先在个人主页补全资料，再重新邀请。";
    }
    return ({
    "not admitted": "只有状态为「已录取」的参赛者可以使用组队工作区。",
    "already belongs to a team": "你已经加入了一支队伍。",
    "team is locked or full": "这支队伍已锁定或已满员。",
    "leave current team first": "请先离开当前未锁定的队伍。",
    "team code required": "请输入完整的队伍邀请码。",
    "team code not found": "没有找到这个邀请码对应的队伍。",
    "team member required": "只有当前队伍成员可以进行这项操作。",
    "team owner required": "只有队长可以进行这项操作。",
    "team member not found": "这名成员已经不在队伍里了。",
    "cannot remove the team owner": "队长本人不能被移出队伍。",
    "team must have 3 to 5 members": "队伍需要有 3–5 名成员才能锁定。",
    "all members must be admitted and complete": "只有状态为「已录取」且资料完整的成员才能锁定队伍。",
    "member ids required": "请至少填写 1 个队员报名编号。",
    "too many members": "最多填写 4 个队员报名编号，队伍总人数不能超过 5 人。",
    "member not found": "有成员编号不存在，请确认填写的是报名编号。",
    "member must be contestant": "只能填写参赛报名者的编号，路演报名者不能加入组队。",
    "member not admitted": "有成员还不是「已录取」状态，暂时不能被加入队伍。",
    "member profile incomplete": "有成员尚未完善资料，暂时无法加入组队。",
    "member already belongs to a team": "有成员已经加入其他队伍，请先调整成员。",
    "cannot include yourself": "队员编号中不能填写队长本人的报名编号。",
    "locked team cannot be changed": "队伍已锁定，不能再调整成员。",
    "submitter must keep the project team": "该队伍已有项目提交，不能直接解散。请联系主办方处理。",
    "team is not recruiting": "这支队伍当前没有公开招募，需要队长先发布招募或直接给你邀请码。",
    "request already pending": "你已经有一份待处理的入队申请了，取消申请或被处理之后才能申请下一支队伍。",
    "request already handled": "这条申请已经被处理过了。",
    "request not found": "找不到这条申请，可能已经失效。",
    "request owner required": "只有申请人本人可以取消这条申请。",
    "applicant is not eligible": "这位申请人的状态已变化（不再是已录取或资料不完整），暂时不能加入。",
    "applicant already belongs to a team": "这位申请人已经加入了其他队伍。"
  }[message] || message || "操作未完成，请稍后重试。");
  };
  const memberLabel = member => {
    const skills = (member.skills || []).filter(Boolean).join(" / ");
    return "<li><strong>" + escapeHtml(member.name) + "</strong>" + (skills ? "<span>" + escapeHtml(skills) + "</span>" : "") + "</li>";
  };
  const updatePhaseBadge = () => {
    const badge = document.querySelector(".team-phase-badge");
    if (badge) badge.textContent = teamConfirmOpen ? "正式组队确认已开启 · 等待队长锁定队伍" : "组队进行中 · 正式确认尚未开启";
  };
  /** 队伍成员行：队长可以移出未锁定队伍里的其他成员。 */
  const memberRow = (member, current, isOwner) => {
    const skills = (member.skills || []).filter(Boolean).join(" / ");
    const isSelf = member.id === me?.id;
    const isCaptain = member.id === current.ownerId;
    const kickable = isOwner && !current.locked && !isCaptain;
    return "<li>" +
      "<span class='team-member-main'><strong>" + escapeHtml(member.name) + "</strong>" + (isCaptain ? "<i class='team-owner-tag'>队长</i>" : "") + (isSelf ? "<i class='team-self-tag'>我</i>" : "") + "</span>" +
      "<span class='team-member-side'>" + (skills ? "<span class='team-member-skills'>" + escapeHtml(skills) + "</span>" : "") +
      (kickable ? "<button class='kick-member' type='button' data-id='" + escapeHtml(member.id) + "' data-name='" + escapeHtml(member.name) + "'>移出</button>" : "") +
      "</span></li>";
  };
  /** 待队长处理的入队申请。 */
  const requestRow = row => {
    const applicant = row.applicant || {};
    const name = applicant.name || row.applicantId;
    const meta = [applicant.college, applicant.major, applicant.grade].filter(Boolean).join(" · ");
    const skills = (applicant.skills || []).filter(Boolean).join(" / ");
    return "<div class='team-request-row'>" +
      "<div class='team-request-who'><strong>" + escapeHtml(name) + "</strong>" +
      "<span>" + escapeHtml(row.applicantId) + (meta ? " · " + escapeHtml(meta) : "") + "</span>" +
      (skills ? "<em>" + escapeHtml(skills) + "</em>" : "") +
      (row.message ? "<p class='team-request-message'>“" + escapeHtml(row.message) + "”</p>" : "") +
      "</div>" +
      "<div class='team-request-actions'>" +
      "<button class='outline-button approve-request' type='button' data-id='" + escapeHtml(row.id) + "' data-name='" + escapeHtml(name) + "'>同意加入</button>" +
      "<button class='outline-button reject-request' type='button' data-id='" + escapeHtml(row.id) + "' data-name='" + escapeHtml(name) + "'>拒绝</button>" +
      "</div></div>";
  };
  /** 我发出的、还在等队长处理的申请：可以取消后立刻申请别的队伍。 */
  const outgoingRow = row =>
    "<div class='team-apply-pending-row'><div><strong>已申请加入「" + escapeHtml(row.team?.project || row.teamId) + "」</strong>" +
    "<span>等待队长" + (row.owner?.name ? "「" + escapeHtml(row.owner.name) + "」" : "") + "确认；取消申请后可以立刻申请其他队伍。</span>" +
    (row.message ? "<p>留言：" + escapeHtml(row.message) + "</p>" : "") +
    "</div><button class='outline-button cancel-request' type='button' data-id='" + escapeHtml(row.id) + "'>取消申请</button></div>";

  function renderMyTeam(current) {
    const createForm = document.getElementById("create-team-form");
    const joinByCodeForm = document.getElementById("join-by-code-form");
    if (!current) {
      createForm.hidden = false;
      if (joinByCodeForm) joinByCodeForm.hidden = false;
      const pending = requests.outgoing || [];
      document.getElementById("my-team").innerHTML =
        "<div class='team-empty'><strong>你还没有队伍</strong><p>可以自己创建一支队伍，或从下方申请加入正在招募的队伍、凭邀请码直接加入。</p></div>" +
        (pending.length
          ? "<div class='team-apply-pending'>" + pending.map(outgoingRow).join("") +
            "<p class='team-apply-pending-note'>同一时间只能有一份待处理申请：取消申请或被拒绝后，才能申请下一支队伍。</p></div>"
          : "");
      return;
    }

    createForm.hidden = true;
    if (joinByCodeForm) joinByCodeForm.hidden = true;
    const count = current.members.length;
    const missing = Math.max(0, 3 - count);
    const isOwner = current.ownerId === me?.id;
    const canLock = teamConfirmOpen && isOwner && isEligible(me);
    const recruiting = Boolean(current.published) && !current.locked;
    const status = current.locked
      ? "\u5df2\u9501\u5b9a\u00b7 \u6210\u5458\u5df2\u786e\u8ba4"
      : missing
        ? "\u8fd8\u5dee " + missing + " \u4eba\u624d\u80fd\u9501\u5b9a"
        : "\u5df2\u6ee1\u8db3\u9501\u5b9a\u4eba\u6570\uff0c\u8bf7\u786e\u8ba4\u6210\u5458";
    const members = current.members.map(member => memberRow(member, current, isOwner)).join("") + Array.from({ length: 5 - count }, () => "<li class='team-slot-empty'>\u7a7a\u7f3a\u5f85\u52a0\u5165</li>").join("");
    const incoming = requests.incoming || [];
    const requestPanel = isOwner && !current.locked
      ? "<div class='team-request-panel'>" +
          "<div class='team-request-head'><strong>入队申请</strong><span>" + (recruiting ? "公开招募中 · 其他同学可以申请加入" : "尚未公开招募 · 其他同学只能凭邀请码加入") + "</span></div>" +
          (incoming.length ? incoming.map(requestRow).join("") : "<p class='team-request-empty'>暂时没有待处理的申请。发布公开招募后，其他同学可以申请加入，需要你在这里确认后才能进队。</p>") +
        "</div>"
      : "";
    document.getElementById("my-team").innerHTML =
      "<div class='team-focus-head'><div><p class='section-kicker'>MY TEAM</p><h3>" + escapeHtml(current.project || current.id) + "</h3>" +
        "<div class='team-status-row'><span class='team-status " + (current.locked ? "is-locked" : "") + "'>" + status + "</span>" +
        (current.locked ? "" : "<span class='team-status-chip " + (recruiting ? "is-recruiting" : "is-private") + "'>" + (recruiting ? "公开招募中" : "仅邀请码加入") + "</span>") +
        "</div></div><b>" + count + " / 5 \u4eba</b></div>" +
      "<p class='team-code'>\u961f\u4f0d\u9080\u8bf7\u7801 <strong>" + escapeHtml(current.code) + "</strong><button class='copy-code' type='button' data-code='" + escapeHtml(current.code) + "'>\u590d\u5236</button></p>" +
      "<ul class='team-member-list team-member-slots'>" + members + "</ul>" +
      "<div class='team-recruit-panel' id='team-recruit-panel' hidden><strong>招募队友</strong><p>把邀请码发给报名并完善资料的同学，对方输入邀请码即可加入。</p><div><code>" + escapeHtml(current.code) + "</code><button class='copy-code' type='button' data-code='" + escapeHtml(current.code) + "'>复制邀请码</button></div></div>" +
      requestPanel +
      "<div class='team-focus-actions'>" +
      (current.locked ? "<span class='team-action-note'>\u961f\u4f0d\u5df2\u9501\u5b9a\uff0c\u5982\u9700\u8c03\u6574\u8bf7\u8054\u7cfb\u4e3b\u529e\u65b9\u3002</span>" :
        (isOwner ? "<button class='outline-button' id='recruit-team' type='button'>" + (current.published ? "停止招募" : "发布公开招募") + "</button>" : "") +
        "<button class='outline-button' id='leave-team' type='button'>\u79bb\u5f00\u8fd9\u652f\u961f\u4f0d</button>" +
        (canLock
          ? "<button class='button button-primary' id='lock-team' type='button'>确认正式队伍</button>"
          : "<span class='team-action-note'>组队阶段 · 等待正式确认开启</span>")) +
      "</div>";
  }

  function renderTeams(teams, current, pendingRequest) {
    const available = teams.filter(item => item.id !== current?.id);
    document.getElementById("team-list").innerHTML = available.length ? available.map(item => {
      const count = item.members.length;
      const recruiting = Boolean(item.published) && !item.locked && count < 5;
      // 已经申请过这支队伍时，这里直接给「取消申请」，方便改投其他队伍。
      const appliedHere = Boolean(pendingRequest) && pendingRequest.teamId === item.id && !current;
      const canApply = !current && !pendingRequest && recruiting;
      const label = appliedHere ? "取消申请" : item.locked ? "\u5df2\u9501\u5b9a" : count >= 5 ? "\u5df2\u6ee1\u5458" : current ? "\u5148\u79bb\u5f00\u5f53\u524d\u961f\u4f0d" : pendingRequest ? "已有待处理申请" : "申请加入";
      const badge = appliedHere ? "已提交申请" : item.locked ? "已锁定" : count >= 5 ? "已满员" : recruiting ? "公开招募中" : "暂不招募";
      const actionClass = appliedHere ? "cancel-request" : "apply-team";
      const actionId = appliedHere ? pendingRequest.id : item.id;
      return "<article class='team-card-admin" + (recruiting || appliedHere ? " is-recruiting" : count >= 5 || item.locked ? " is-full" : "") + "'>" +
        "<div class='team-card-head'><strong>" + escapeHtml(item.project || item.id) + "</strong><span>" + count + " / 5 \u4eba</span></div>" +
        "<p class='team-card-badge " + (recruiting || appliedHere ? "is-recruiting" : "is-quiet") + "'>" + badge + "</p>" +
        "<small class='team-code'>" + escapeHtml(item.id) + "</small>" +
        "<ul>" + item.members.map(memberLabel).join("") + "</ul>" +
        "<button class='outline-button " + actionClass + "' type='button' data-id='" + escapeHtml(actionId) + "' data-name='" + escapeHtml(item.project || item.id) + "' " + (canApply || appliedHere ? "" : "disabled") + ">" + label + "</button>" +
        "<form class='team-apply-form' hidden><label>给队长的留言（选填）<textarea name='message' rows='2' maxlength='200' placeholder='例如：我做前端，想和你一起把 Demo 跑起来'></textarea></label>" +
        "<div class='team-apply-actions'><button class='button button-dark' type='submit'>提交申请</button><button class='outline-button apply-form-cancel' type='button'>取消</button></div></form>" +
        "</article>";
    }).join("") : "<p class='team-list-empty'>\u76ee\u524d\u6ca1\u6709\u5176\u4ed6\u5f00\u653e\u961f\u4f0d\u3002</p>";
  }

  // ---- 动作：全部走事件委托，页面重绘不会丢事件 ----
  async function applyToTeam(teamId, message) {
    try {
      await api.request("/api/teams/requests", {method: "POST", body: JSON.stringify({teamId, message})});
      setFeedback("入队申请已提交，队长确认后会给你发一条组队消息。", "success");
      await render();
    } catch (error) { setFeedback(readableError(error), "error"); }
  }
  async function cancelRequest(requestId) {
    const ok = await uiConfirm({kicker: "TEAM / CANCEL", title: "取消这条入队申请？", body: "取消后队长不会再看到它，你可以立刻申请其他正在招募的队伍。", confirmText: "取消申请"});
    if (!ok) return;
    try {
      await api.request("/api/teams/requests/" + encodeURIComponent(requestId) + "/withdraw", {method: "POST"});
      setFeedback("申请已取消，可以继续申请其他队伍。", "success");
      await render();
    } catch (error) { setFeedback(readableError(error), "error"); }
  }
  async function decideRequest(requestId, action, name) {
    const who = name || "这位同学";
    const ok = action === "approve"
      ? await uiConfirm({kicker: "TEAM / APPROVE", title: "同意「" + who + "」加入队伍？", body: "同意后 TA 会立刻成为队伍成员，并收到一条组队消息；锁定前仍然可以移出。", confirmText: "同意加入"})
      : await uiConfirm({kicker: "TEAM / REJECT", tone: "danger", title: "拒绝「" + who + "」的入队申请？", body: "TA 会收到一条组队消息，并可以继续申请其他队伍。", confirmText: "拒绝申请"});
    if (!ok) return;
    try {
      await api.request("/api/teams/requests/" + encodeURIComponent(requestId) + "/" + action, {method: "POST"});
      setFeedback(action === "approve" ? "已同意入队，队伍成员已更新。" : "已拒绝这条申请。", "success");
      await render();
    } catch (error) { setFeedback(readableError(error), "error"); }
  }
  async function kickMember(memberId, name) {
    if (!team) return;
    const who = name || "这名成员";
    const ok = await uiConfirm({kicker: "TEAM / REMOVE", tone: "danger", title: "把「" + who + "」移出队伍？", body: "移出后 TA 会收到一条组队消息，可以重新创建或加入其他队伍。", confirmText: "移出队伍"});
    if (!ok) return;
    if (team.members.length - 1 < 3) {
      const sure = await uiConfirm({kicker: "TEAM / REMOVE", tone: "danger", title: "移出后队伍不足 3 人", body: "队伍只剩 " + (team.members.length - 1) + " 人，将无法锁定正式队伍。确定继续吗？", confirmText: "仍然移出"});
      if (!sure) return;
    }
    try {
      await api.request("/api/teams/" + encodeURIComponent(team.id) + "/kick", {method: "POST", body: JSON.stringify({memberId})});
      setFeedback("已把 " + who + " 移出队伍。", "success");
      await render();
    } catch (error) { setFeedback(readableError(error), "error"); }
  }
  async function lockTeam() {
    if (!team) return;
    // 按钮始终可点：条件不满足时用提示框说明原因，不做静默失效的灰按钮。
    if (!teamConfirmOpen) {
      await uiAlert({kicker: "TEAM / LOCK", title: "「正式组队确认」还没有开启", body: ["需要主办方在后台开启「正式组队确认」之后，队长才能把队伍锁定为正式队伍。", "现在可以先确认成员、调整队伍，开启后再回来锁定。"], confirmText: "知道了"});
      return;
    }
    if (team.members.length < 3) {
      await uiAlert({kicker: "TEAM / LOCK", tone: "error", title: "人数还不足以锁定队伍", body: ["正式队伍需要 3–5 名成员，现在有 " + team.members.length + " 名，还差 " + (3 - team.members.length) + " 名。", "可以继续发布公开招募或分享邀请码，补齐成员后再锁定。"], confirmText: "知道了"});
      return;
    }
    const ok = await uiConfirm({kicker: "TEAM / LOCK", tone: "danger", title: "\u786e\u8ba4\u6b63\u5f0f\u9501\u5b9a\u8fd9\u652f\u961f\u4f0d\uff1f", body: "\u9501\u5b9a\u540e\u65e0\u6cd5\u81ea\u884c\u589e\u51cf\u6210\u5458\uff0c\u8bf7\u5148\u786e\u8ba4\u961f\u4f0d\u6210\u5458\u65e0\u8bef\u3002", confirmText: "\u786e\u8ba4\u9501\u5b9a"});
    if (!ok) return;
    try {
      await api.request("/api/teams/" + encodeURIComponent(team.id) + "/lock", {method: "PATCH"});
      setFeedback("\u961f\u4f0d\u5df2\u9501\u5b9a\uff0c\u63a5\u4e0b\u6765\u53ef\u4ee5\u51c6\u5907\u9879\u76ee\u63d0\u4ea4\u3002", "success");
      await render();
    } catch (error) { setFeedback(readableError(error), "error"); }
  }
  async function leaveTeam() {
    if (!team) return;
    const ok = await uiConfirm({kicker: "TEAM / LEAVE", tone: "danger", title: "\u786e\u5b9a\u79bb\u5f00\u201c" + (team.project || team.id) + "\u201d\uff1f", body: "未锁定的队伍可以自由离开；队长离开后队长身份会自动移交给下一位成员。", confirmText: "\u79bb\u5f00\u961f\u4f0d"});
    if (!ok) return;
    try {
      await api.request("/api/teams/" + encodeURIComponent(team.id) + "/leave", { method: "POST" });
      setFeedback("\u4f60\u5df2\u79bb\u5f00\u961f\u4f0d\uff0c\u53ef\u4ee5\u521b\u5efa\u6216\u52a0\u5165\u5176\u4ed6\u961f\u4f0d\u3002", "success");
      await render();
    } catch (error) { setFeedback(readableError(error), "error"); }
  }
  async function toggleRecruit() {
    if (!team) return;
    try {
      await api.request("/api/teams/" + encodeURIComponent(team.id) + "/recruit", { method: "PATCH" });
      setFeedback(team.published ? "已停止公开招募。" : "已发布公开招募，其他同学现在可以在公开列表中申请加入。", "success");
      await render();
    } catch (error) { setFeedback(readableError(error), "error"); }
  }
  async function copyCode(code) {
    try {
      await navigator.clipboard.writeText(code);
      setFeedback("\u961f\u4f0d\u9080\u8bf7\u7801\u5df2\u590d\u5236\u3002", "success");
    } catch {
      setFeedback("\u590d\u5236\u5931\u8d25\uff0c\u8bf7\u624b\u52a8\u8bb0\u4e0b\u9080\u8bf7\u7801\u3002", "error");
    }
  }

  async function onTeamClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const applyButton = target.closest(".apply-team");
    if (applyButton) {
      const form = applyButton.closest("article")?.querySelector(".team-apply-form");
      if (form) {
        form.hidden = !form.hidden;
        if (!form.hidden) form.elements.message?.focus();
      }
      return;
    }
    if (target.closest(".apply-form-cancel")) {
      const form = target.closest(".team-apply-form");
      if (form) form.hidden = true;
      return;
    }
    const cancelButton = target.closest(".cancel-request");
    if (cancelButton) { await cancelRequest(cancelButton.dataset.id); return; }
    const approveButton = target.closest(".approve-request");
    if (approveButton) { await decideRequest(approveButton.dataset.id, "approve", approveButton.dataset.name); return; }
    const rejectButton = target.closest(".reject-request");
    if (rejectButton) { await decideRequest(rejectButton.dataset.id, "reject", rejectButton.dataset.name); return; }
    const kickButton = target.closest(".kick-member");
    if (kickButton) { await kickMember(kickButton.dataset.id, kickButton.dataset.name); return; }
    if (target.closest("#lock-team")) { await lockTeam(); return; }
    if (target.closest("#leave-team")) { await leaveTeam(); return; }
    if (target.closest("#recruit-team")) { await toggleRecruit(); return; }
    const copyButton = target.closest(".copy-code");
    if (copyButton) { await copyCode(copyButton.dataset.code); return; }
  }

  async function onTeamSubmit(event) {
    const form = event.target instanceof Element ? event.target.closest(".team-apply-form") : null;
    if (!form) return;   // 建队 / 邀请码表单有各自的处理逻辑
    event.preventDefault();
    const button = form.closest("article")?.querySelector(".apply-team");
    await applyToTeam(button?.dataset.id || "", form.elements.message?.value || "");
  }

  async function loadMe() {
    if (api.isLocalPreview?.()) return {participant: api.getPreviewParticipant?.() || null, team: null};
    const data = await api.request("/api/me");
    return {participant: data.participant, team: data.team || null};
  }

  async function render() {
    try {
      const local = Boolean(api.isLocalPreview?.());
      let mine;
      try {
        mine = await loadMe();
      } catch {
        // 未登录 / 会话过期：说明原因再回个人主页登录（不静默跳走）。
        await uiAlert({kicker: "TEAM / ACCESS", title: "请先登录", body: ["组队工作区需要先登录报名账号，登录后就能创建或加入队伍。", {html: "在 <a href='profile.html'>个人主页</a> 用报名编号 + 手机号 / 邮箱登录。"}], confirmText: "去登录"});
        location.assign("profile.html");
        return;
      }
      me = mine.participant;
      // 先判身份，再判资料：被挡在门外的人先看到「为什么不能进」。
      if (!isEligible(me)) { await denyAccess(me); return; }
      if (!local && !api.isProfileComplete(me)) { await needProfile(); return; }
      document.querySelector("main")?.removeAttribute("hidden");
      const configData = await api.request("/api/config");
      teamConfirmOpen = Boolean(configData.config?.teamConfirmOpen);
      updatePhaseBadge();
      const teamData = local ? { teams: previewTeams } : await api.request("/api/teams");
      requests = local ? { outgoing: [], incoming: [] } : await api.request("/api/teams/requests");
      team = mine.team;
      renderMyTeam(team);
      renderTeams(teamData.teams || [], team, (requests.outgoing || [])[0] || null);
    } catch (error) {
      if (me && String(error?.message || "").includes("not admitted")) { await denyAccess(me); return; }
      await uiAlert({kicker: "TEAM / ERROR", tone: "error", title: "组队工作区暂时打不开", body: ["刚才的请求没有成功：" + readableError(error), "请刷新重试；如果一直失败，请联系主办方。"], confirmText: "返回个人主页"});
      location.assign("profile.html");
    }
  }

  document.getElementById("create-team-form").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const project = String(formData.get("projectName") || "").trim();
    const memberIds = String(formData.get("memberIds") || "").trim();
    try {
      await api.request("/api/teams", { method: "POST", body: JSON.stringify({ project, memberIds }) });
      form.reset();
      setFeedback("\u961f\u4f0d\u5df2\u521b\u5efa\uff0c\u8bf7\u628a\u9080\u8bf7\u7801\u53d1\u7ed9\u961f\u53cb\u3002", "success");
      await render();
    } catch (error) { setFeedback(readableError(error), "error"); }
  });

  document.getElementById("join-by-code-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.elements.code;
    const code = input.value.trim().toUpperCase();
    try {
      await api.request("/api/teams/join-by-code", { method: "POST", body: JSON.stringify({ code }) });
      input.value = "";
      setFeedback("已凭邀请码加入队伍，请确认成员和锁定条件。", "success");
      await render();
    } catch (error) { setFeedback(readableError(error), "error"); }
  });

  // 事件委托：只挂一次，任何一次重绘都不会让按钮失去响应。
  const shell = document.querySelector("main");
  shell?.addEventListener("click", onTeamClick);
  shell?.addEventListener("submit", onTeamSubmit);

  render();
})();
