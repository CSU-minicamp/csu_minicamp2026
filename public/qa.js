/*
 * Q&A 页面（qa.html）
 *
 * 数据来源：
 *   GET /api/qa/public  公开列表（置顶在前 + 已回答），不需要登录，响应不含 asker_id
 *   GET /api/qa         登录后返回自己的提问（含待回答、被隐藏的）
 *   POST /api/qa        登录后提问
 *
 * 页面结构（自上而下）：置顶问题 → 我的提问（仅登录）→ 其他已回答。
 * 置顶区与我的提问区每条问题各占一行；其他已回答为多列网格。
 * 每张卡片折叠展示，右侧可展开答案；搜索对三个区域同时生效。
 * 去重：登录后自己的提问只出现在「我的提问」区，不会在「其他已回答」里再出现一遍。
 */
(() => {
  const api = window.MinicampAPI;
  const els = {
    search: document.getElementById("qa-search"),
    count: document.getElementById("qa-count"),
    loginNote: document.getElementById("qa-login-note"),
    loginLink: document.getElementById("qa-login-link"),
    askCard: document.getElementById("qa-ask-card"),
    askForm: document.getElementById("qa-ask-form"),
    askInput: document.getElementById("qa-ask-input"),
    askError: document.getElementById("qa-ask-error"),
    askWho: document.getElementById("qa-ask-who"),
    pinnedSection: document.getElementById("qa-pinned-section"),
    pinned: document.getElementById("qa-pinned"),
    mineSection: document.getElementById("qa-mine-section"),
    mine: document.getElementById("qa-mine"),
    othersSection: document.getElementById("qa-others-section"),
    grid: document.getElementById("qa-grid"),
    empty: document.getElementById("qa-empty")
  };
  if (!els.grid) return;

  const state = { publicQuestions: [], mine: [], me: null };
  const STATUS_LABEL = { pending: "待回答", answered: "已回答", pinned: "置顶", hidden: "已隐藏" };

  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const normalize = value => String(value ?? "").toLocaleLowerCase("zh-CN").replace(/\s+/g, " ").trim();
  const formatTime = value => {
    if (!value) return "";
    const time = new Date(value);
    return Number.isNaN(time.getTime()) ? "" : time.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  };

  /** 登录跳转地址：登录成功后回到本页（保留搜索词）。 */
  function loginHref() {
    const back = "qa.html" + location.search;
    return "profile.html?" + new URLSearchParams({ returnTo: back, profileRequired: "1" }).toString();
  }

  function matches(item, keyword) {
    if (!keyword) return true;
    return [item.question, item.answer, STATUS_LABEL[item.status]].some(value => normalize(value).includes(keyword));
  }

  /**
   * 参与者侧始终直接显示答案，不做折叠：左侧状态与时间，下面是问题，再下面是答案。
   * 未回答（pending / hidden）的问题没有答案，显示等待提示。
   */
  function cardHtml(item, options = {}) {
    const { isMine = false } = options;
    const status = item.status || "pending";
    const pending = status === "pending";
    const answered = Boolean(String(item.answer || "").trim());
    const asked = formatTime(item.asked_at);
    const answeredAt = formatTime(item.answered_at);
    const meta = `<span class="qa-badge qa-badge-${escapeHtml(status)}">${escapeHtml(STATUS_LABEL[status] || status)}</span>
      <span class="qa-tag">${isMine ? "我的提问" : "Q&amp;A"}</span>
      <time class="qa-time">提问于 ${asked || "刚刚"}</time>`;

    if (!answered) {
      return `<article class="qa-card${pending ? " is-pending" : ""}" data-id="${escapeHtml(item.question_id)}">
        <div class="qa-card-head">${meta}</div>
        <h3 class="qa-question">${escapeHtml(item.question)}</h3>
        <p class="qa-waiting"><span class="qa-waiting-mark">…</span>主办方还没有回答这个问题。回答后你会收到站内通知。</p>
      </article>`;
    }

    return `<article class="qa-card" data-id="${escapeHtml(item.question_id)}">
      <div class="qa-card-head">${meta}</div>
      <h3 class="qa-question">${escapeHtml(item.question)}</h3>
      <div class="qa-answer"><span class="qa-answer-mark">答</span><div><p>${escapeHtml(item.answer)}</p>${answeredAt ? `<time class="qa-time">回答于 ${answeredAt}</time>` : ""}</div></div>
    </article>`;
  }

  function filtered(list) {
    const keyword = normalize(els.search?.value || "");
    return list.filter(item => matches(item, keyword));
  }

  function render() {
    const keyword = normalize(els.search?.value || "");
    const mineIds = new Set(state.mine.map(item => item.question_id));
    // 去重：自己的提问只在「我的提问」区出现，置顶区与公开区都不再重复渲染。
    const pinned = filtered(state.publicQuestions.filter(item => item.status === "pinned" && !mineIds.has(item.question_id)));
    const others = filtered(state.publicQuestions.filter(item => item.status !== "pinned" && !mineIds.has(item.question_id)));
    const mine = filtered(state.mine);

    els.pinnedSection.hidden = pinned.length === 0;
    els.pinned.innerHTML = pinned.map(item => cardHtml(item)).join("");

    els.mineSection.hidden = mine.length === 0;
    els.mine.innerHTML = mine.map(item => cardHtml(item, { isMine: true })).join("");

    els.grid.innerHTML = others.map(item => cardHtml(item)).join("");
    els.othersSection.hidden = others.length === 0 && keyword.length > 0;

    const shown = pinned.length + mine.length + others.length;
    const pendingMine = state.mine.filter(item => item.status !== "answered" && item.status !== "pinned").length;
    const total = state.publicQuestions.length + pendingMine;
    els.count.textContent = keyword
      ? `匹配 ${shown} 条 / 共 ${total} 条`
      : `已回答 ${state.publicQuestions.length} 条${state.mine.length ? ` · 我的提问 ${state.mine.length} 条` : ""}`;

    if (keyword && shown === 0) {
      els.empty.hidden = false;
      els.empty.textContent = `没有匹配「${els.search.value.trim()}」的问题。可以换个关键词，或者登录后直接向主办方提问。`;
    } else if (!keyword && others.length === 0 && pinned.length === 0 && !mine.length) {
      els.empty.hidden = false;
      els.empty.textContent = "主办方还没有公开回答任何问题。有问题可以登录后直接提问。";
    } else {
      els.empty.hidden = true;
      els.empty.textContent = "";
    }
  }

  async function loadPublic() {
    try {
      const data = await api.request("/api/qa/public");
      state.publicQuestions = Array.isArray(data.questions) ? data.questions : [];
    } catch (error) {
      state.publicQuestions = [];
      els.empty.hidden = false;
      els.empty.textContent = "问答暂时加载失败：" + error.message;
    }
  }

  async function loadMine() {
    if (!api.getToken()) return;
    try {
      const [me, mine] = await Promise.all([api.request("/api/me"), api.request("/api/qa")]);
      state.me = me.participant || null;
      state.mine = Array.isArray(mine.questions) ? mine.questions : [];
    } catch {
      // token 失效或未登录：保持未登录状态
      state.me = null;
      state.mine = [];
    }
  }

  function renderLoginState() {
    // 登录态以「当前 token + /api/me 返回的报名编号」同时成立为准，换账号或退出后不会残留旧表单。
    const loggedIn = Boolean(state.me && api.getToken() && state.me.id);
    els.loginNote.hidden = loggedIn;
    els.askCard.hidden = !loggedIn;
    els.loginLink?.setAttribute("href", loginHref());
  }

  els.search?.addEventListener("input", render);

  els.askForm?.addEventListener("submit", async event => {
    event.preventDefault();
    const text = els.askInput.value.trim();
    els.askError.textContent = "";
    if (text.length < 2) {
      els.askError.textContent = "请把问题写完整一些（至少 2 个字）。";
      els.askInput.focus();
      return;
    }
    const button = els.askForm.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      await api.request("/api/qa", { method: "POST", body: JSON.stringify({ question: text }) });
      els.askInput.value = "";
      window.MinicampUI?.toast("问题已提交，主办方回答后会通知你。", { tone: "success" });
      await loadMine();
      renderLoginState();
      render();
    } catch (error) {
      els.askError.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });

  (async () => {
    await loadPublic();
    await loadMine();
    renderLoginState();
    render();
  })();
})();
