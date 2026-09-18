/*
 * 主办方后台 · Q&A 问答面板（admin.html #panel-qa）
 *
 * 卡片结构（两列）：
 *   左侧：问题（上）与答案（下），上下排布，都直接显示为文本；
 *   右侧：竖排居中的「状态」下拉框 + 「更改答案 / 回答问题」按钮。
 * 编辑态（点右侧按钮后）：左侧只剩一个更高的答案文本框，右侧状态与按钮一起隐藏，
 *   文本框下方靠右显示「确认」。
 *
 * 排序：置顶在最前，其余按提问时间倒序。
 * 接口：GET /api/qa（全部问答 + stats + storage）、PATCH /api/admin/qa/{id}（answer / status）
 * 状态：pending 待回答（不公开）· answered 已回答（公开）· pinned 置顶（公开且排最前）· hidden 隐藏（不公开，不删除）
 */
(() => {
  const api = { ...window.MinicampAPI, request: window.MinicampAPI.adminRequest };
  const list = document.getElementById("qa-admin-list");
  if (!list) return;

  const els = {
    search: document.getElementById("qa-admin-search"),
    filter: document.getElementById("qa-admin-filter"),
    refresh: document.getElementById("qa-admin-refresh"),
    storage: document.getElementById("qa-admin-storage")
  };
  const STATUS_LABEL = { pending: "待回答", answered: "已回答", pinned: "置顶", hidden: "隐藏" };
  const STATUS_OPTIONS = [["pending", "待回答（不公开）"], ["answered", "已回答（公开）"], ["pinned", "置顶（公开，排最前）"], ["hidden", "隐藏（不公开）"]];
  const esc = value => String(value == null ? "" : value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const fmt = value => (value ? new Date(value).toLocaleString("zh-CN") : "—");
  const toast = (message, tone = "info") => window.MinicampUI?.toast(message, { tone });

  let questions = [];
  let editingId = "";
  let notice = null;   // 状态切换失败时的行内提示（例如没有答案就设为公开）

  const token = () => api.getAdminToken();
  const statusOf = question => question.status || "pending";
  const answerOf = question => String(question.answer || "").trim();

  /** 列表只显示会话根：追问渲染在各自父问题的卡片里，避免一条会话出现多张卡片。 */
  function rootRows() {
    return questions.filter(question => !question.parent_question_id);
  }

  /** 按父问题分组，渲染追问链时按需取子行（含未公开的追问）。 */
  function childrenMap() {
    const map = new Map();
    for (const question of questions) {
      if (!question.parent_question_id) continue;
      const key = String(question.parent_question_id);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(question);
    }
    return map;
  }

  /** 某个会话根下的追问统计（服务端 threads 汇总）。 */
  function threadStats(rootId) {
    return questions.find(question => question.question_id === rootId)?.thread || null;
  }

  async function load() {
    if (!token()) {
      list.innerHTML = "<p class='qa-empty'>请先在上方登录主办方账号，然后回到本面板。</p>";
      return;
    }
    list.innerHTML = "<p class='qa-empty'>正在加载问答…</p>";
    try {
      const data = await api.request("/api/qa");
      questions = Array.isArray(data.questions) ? data.questions : [];
      if (editingId && !questions.some(item => item.question_id === editingId)) editingId = "";
      if (els.storage) els.storage.textContent = `${data.storage === "table" ? "MySQL 表存储" : "JSON 回退存储"} · 共 ${data.stats?.total ?? questions.length} 条`;
      // 只更新问答内容，重绘期间锁住滚动位置：刷新不会把窗口带回最上面。
      if (window.MinicampScroll) window.MinicampScroll.lock(render); else render();
    } catch (error) {
      list.innerHTML = "<p class='qa-empty'>问答加载失败：" + esc(error.message) + "</p>";
    }
  }

  function askerLabel(askerId) {
    const apps = window.MinicampAdmin?.getState?.()?.applications || [];
    const found = apps.find(item => item.id === askerId);
    if (!found) return askerId;
    return askerId + " · " + found.name;
  }

  /**
   * 右侧：状态下拉框 + 回答/更改答案按钮。
   * 还没有答案的问题不给状态下拉——这时只能回答问题，状态由"确认回答"自动变成已回答；
   * 已经有答案的问题才显示状态下拉（待回答选项也不会出现）。
   */
  function sideHtml(question) {
    const status = statusOf(question);
    const answered = Boolean(answerOf(question));
    if (!answered) {
      return `<div class="qa-admin-side">
        <button class="qa-choice" type="button" data-action="edit" data-id="${esc(question.question_id)}">回答问题</button>
        <small class="qa-admin-side-hint">填写答案并确认后自动变为「已回答」</small>
      </div>`;
    }
    const options = STATUS_OPTIONS
      .filter(([value]) => value !== "pending")   // 有待回答语义的选项一律不出现
      .map(([value, label]) => `<option value="${value}"${value === status ? " selected" : ""}>${esc(label)}</option>`)
      .join("");
    return `<div class="qa-admin-side">
      <label class="qa-admin-status">状态
        <select class="admin-select" data-role="status" data-id="${esc(question.question_id)}">${options}</select>
      </label>
      <button class="qa-choice" type="button" data-action="edit" data-id="${esc(question.question_id)}">更改答案</button>
    </div>`;
  }

  /** 左侧：问题（上）与答案（下）。 */
  function bodyHtml(question) {
    const answer = answerOf(question);
    return `<div class="qa-admin-body">
      <div class="qa-admin-block">
        <span class="qa-admin-label">问题</span>
        <p class="qa-admin-text">${esc(question.question)}</p>
      </div>
      <div class="qa-admin-block">
        <span class="qa-admin-label">答案</span>
        ${answer
          ? `<p class="qa-admin-text">${esc(answer)}</p><time class="qa-time">回答于 ${fmt(question.answered_at)}${question.answered_by ? " · " + esc(question.answered_by) : ""}</time>`
          : `<p class="qa-admin-text is-empty">尚未回答</p>`}
      </div>
    </div>`;
  }

  /** 编辑态：只有更高的答案文本框 + 靠右的确认按钮。 */
  function editorHtml(question) {
    return `<div class="qa-admin-editor">
      <textarea class="qa-admin-editor-input" rows="8" data-answer="${esc(question.question_id)}" placeholder="输入给参与者的回答，确认后提问者会收到站内通知">${esc(answerOf(question))}</textarea>
      <div class="qa-admin-editor-actions">
        <button class="qa-choice" type="button" data-action="cancel" data-id="${esc(question.question_id)}">取消</button>
        <button class="button button-dark" type="button" data-action="confirm" data-id="${esc(question.question_id)}">确认</button>
      </div>
    </div>`;
  }

  /**
   * 单条追问：左侧展示问题与答案，右侧是它自己的状态下拉与「更改答案 / 回答问题」。
   * 追问的状态与答案独立于父问题，且可以继续被追问，所以这里递归渲染下一层。
   */
  function followUpHtml(question, children, map) {
    const status = statusOf(question);
    const editing = editingId === question.question_id;
    const nested = (children || []).map(child => {
      const grandChildren = map.get(String(child.question_id)) || [];
      return `<div class="qa-admin-followup-branch">${followUpHtml(child, grandChildren, map)}</div>`;
    }).join("");
    return `<div class="qa-admin-followup${status === "pending" ? " is-pending" : ""}" data-id="${esc(question.question_id)}">
      <div class="qa-admin-followup-head">
        <span class="qa-admin-followup-label">追问</span>
        <span class="qa-badge qa-badge-${esc(status)}">${esc(STATUS_LABEL[status] || status)}</span>
        <time class="qa-time">${esc(fmt(question.asked_at))}</time>
      </div>
      <div class="qa-admin-card-main">
        ${editing ? editorHtml(question) : bodyHtml(question) + sideHtml(question)}
      </div>
      ${notice && notice.id === question.question_id ? `<p class="qa-admin-inline-error">${esc(notice.message)}</p>` : ""}
      ${nested ? `<div class="qa-admin-followups">${nested}</div>` : ""}
    </div>`;
  }

  function cardHtml(question, children = [], map = new Map()) {
    const status = statusOf(question);
    const editing = editingId === question.question_id;
    const stats = threadStats(question.question_id);
    const followUpCount = stats?.followUpCount || children.length;
    const pendingFollowUps = stats?.pendingFollowUpCount ?? countPending(children, map);
    const followUps = children.length
      ? `<div class="qa-admin-followups">${children.map(child => followUpHtml(child, map.get(String(child.question_id)) || [], map)).join("")}</div>`
      : "";
    return `<article class="qa-card qa-admin-card${editing ? " is-editing" : ""}" data-id="${esc(question.question_id)}" data-status="${esc(status)}">
      <div class="qa-admin-card-head">
        <div class="qa-admin-meta">
          <span class="qa-badge qa-badge-${esc(status)}">${esc(STATUS_LABEL[status] || status)}</span>
          <span class="qa-admin-asker">${esc(askerLabel(question.asker_id))}</span>
          <time class="qa-time">提问于 ${fmt(question.asked_at)}</time>
          ${followUpCount ? `<span class="qa-admin-followup-count">追问 ${followUpCount}${pendingFollowUps ? ` · <b>${pendingFollowUps} 条待回答</b>` : ""}</span>` : ""}
        </div>
      </div>
      <div class="qa-admin-card-main">
        ${editing ? editorHtml(question) : bodyHtml(question) + sideHtml(question)}
      </div>
      ${notice && notice.id === question.question_id ? `<p class="qa-admin-inline-error">${esc(notice.message)}</p>` : ""}
      ${followUps}
    </article>`;
  }

  /** 会话内还有多少条追问是待回答的（服务端没给 threads 时兜底自己数）。 */
  function countPending(children, map) {
    let count = 0;
    for (const child of children || []) {
      if (statusOf(child) === "pending") count += 1;
      count += countPending(map.get(String(child.question_id)) || [], map);
    }
    return count;
  }

  function render() {
    const keyword = String(els.search?.value || "").trim().toLowerCase();
    const filter = els.filter?.value || "";
    const children = childrenMap();
    const hit = question => {
      if (!keyword) return true;
      return [question.question, question.answer, question.asker_id, askerLabel(question.asker_id)]
        .some(value => String(value || "").toLowerCase().includes(keyword));
    };
    // 搜索要递归到追问内容：命中追问时，它所在的根卡片也要保留。
    const subtreeHit = question => hit(question) || (children.get(String(question.question_id)) || []).some(subtreeHit);
    // 追问与根一起展示：筛选或搜索命中追问时，把它的会话根也留下。
    const shown = rootRows().filter(question => {
      const childRows = children.get(String(question.question_id)) || [];
      if (filter) {
        const own = statusOf(question) === filter;
        const childHit = childRows.some(child => statusOf(child) === filter);
        if (!own && !childHit) return false;
      }
      if (!keyword) return true;
      return subtreeHit(question);
    });
    if (!shown.length) {
      list.innerHTML = "<p class='qa-empty'>" + (questions.length ? "没有匹配的问答。" : "还没有人提问。") + "</p>";
      return;
    }
    // 排序：置顶永远在最前，其余一律按提问时间倒序（不再按状态分组）。
    shown.sort((a, b) => (Number(statusOf(b) === "pinned") - Number(statusOf(a) === "pinned")) || String(b.asked_at || "").localeCompare(String(a.asked_at || "")));
    list.innerHTML = shown.map(question => cardHtml(question, children.get(String(question.question_id)) || [], children)).join("");
    if (editingId) list.querySelector(`textarea[data-answer="${CSS.escape(editingId)}"]`)?.focus();
  }

  async function patch(questionId, payload, message) {
    try {
      await api.request("/api/admin/qa/" + encodeURIComponent(questionId), { method: "PATCH", body: JSON.stringify(payload) });
      notice = null;
      toast(message, "success");
      await load();
      return true;
    } catch (error) {
      notice = { id: questionId, message: error.message };
      toast(error.message, "error");
      render();
      return false;
    }
  }

  list.addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const id = button.dataset.id;

    if (button.dataset.action === "edit") {
      editingId = id;
      notice = null;
      render();
      return;
    }
    if (button.dataset.action === "cancel") {
      editingId = "";
      render();
      return;
    }
    if (button.dataset.action === "confirm") {
      const textarea = list.querySelector(`textarea[data-answer="${CSS.escape(id)}"]`);
      const answer = textarea ? textarea.value.trim() : "";
      if (!answer) {
        notice = { id, message: "答案不能为空。" };
        toast("答案不能为空。", "error");
        render();
        return;
      }
      editingId = "";
      // 已有答案的问题只更新答案内容，不再改动当前公开状态。
      const question = questions.find(item => item.question_id === id);
      const payload = { answer, answeredBy: "组委会" };
      if (question && !answerOf(question)) payload.status = "answered";
      patch(id, payload, "答案已确认，提问者会收到通知");
    }
  });

  // 状态下拉框直接切换公开状态
  list.addEventListener("change", event => {
    const select = event.target.closest("select[data-role='status']");
    if (!select) return;
    const labels = { pending: "已改为待回答（不公开）", answered: "已设为已回答（公开）", pinned: "已置顶", hidden: "已隐藏" };
    patch(select.dataset.id, { status: select.value, answeredBy: "组委会" }, labels[select.value] || "状态已更新");
  });

  els.search?.addEventListener("input", render);
  els.filter?.addEventListener("change", render);
  els.refresh?.addEventListener("click", () => load());

  // admin.js 通过 data-panel 切换面板：点导航时加载，同时用观察器兜住「直接落在该面板」的情况。
  document.querySelectorAll('.admin-nav button[data-panel="qa"]').forEach(button => {
    button.addEventListener("click", () => { load(); });
  });
  const panel = document.getElementById("panel-qa");
  if (panel) {
    if (panel.classList.contains("active")) load();
    if (typeof MutationObserver === "function") {
      new MutationObserver(() => { if (panel.classList.contains("active")) load(); }).observe(panel, { attributes: true, attributeFilter: ["class"] });
    }
  }

  window.MinicampQAAdmin = {
    getQuestions: () => [...questions],
    getEditingId: () => editingId,
    getRootCount: () => rootRows().length,
    reload: load
  };
})();
