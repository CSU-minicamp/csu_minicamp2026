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

  const state = { publicQuestions: [], mine: [], me: null, createdIds: new Set(), expanded: new Set() };
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

  /** 当前登录者的提问（含追问），供追问链与权限判断使用。 */
  function mineRows() {
    return state.mine;
  }
  /** 追问成功后服务端返回的 id 让本次会话就能识别自己的追问；再叠加"我的提问"接口里的 id。 */
  function knownMineIds() {
    return new Set([...mineRows().map(item => item.question_id), ...state.createdIds]);
  }

  function followUpCardHtml(row) {
    const status = row.status || "pending";
    const answered = Boolean(String(row.answer || "").trim());
    const answeredAt = formatTime(row.answered_at);
    return `<article class="qa-followup is-${escapeHtml(status)}" data-id="${escapeHtml(row.question_id)}">
      <div class="qa-followup-head">
        <span class="qa-followup-label">追问</span>
        <span class="qa-badge qa-badge-${escapeHtml(status)}">${escapeHtml(STATUS_LABEL[status] || status)}</span>
        <time class="qa-time">${formatTime(row.asked_at) || ""}</time>
      </div>
      <p class="qa-followup-question">${escapeHtml(row.question)}</p>
      ${answered
        ? `<div class="qa-answer"><span class="qa-answer-mark">答</span><div><p>${escapeHtml(row.answer)}</p>${answeredAt ? `<time class="qa-time">回答于 ${answeredAt}</time>` : ""}</div></div>`
        : `<p class="qa-waiting"><span class="qa-waiting-mark">…</span>主办方还没有回答这条追问。</p>`}
    </article>`;
  }

  /**
   * 追问卡片：问题与答案直接显示（不折叠），下面递归挂它自己的追问链。
   * 每层判断可见性——与父问题公开状态不一致的追问不挤在链里：
   *   · 父被隐藏（自己已公开）→ 该条断开，由调用方独立成卡；
   *   · 自己没公开（隐藏/还没回答）→ 公开区不显示，提问者自己的链里照常显示。
   */
  function followUpHtml(row, options) {
    const { childrenOf, isPublicView = false, detached = [], lifted = [], depth = 1, linkNode = false, liftPinned = true } = options;
    const status = row.status || "pending";
    const published = status === "answered" || status === "pinned";
    const answered = Boolean(String(row.answer || "").trim());
    // 这条自己是否被抽离（父问题不是置顶、自己置顶）——抽离后不再抽它内部的置顶节点，避免同一会话被拆成多张卡。
    const wasLifted = Boolean(options.liftPinned) && status === "pinned" && !options.parentPinned;
    // 链接节点（因为下面还有公开追问才被保留的那条）不算"父被隐藏"，它的子层不应该被断开。
    const chain = renderChildren(row.question_id, {
      ...options,
      parentPublic: linkNode ? true : published,
      parentPinned: status === "pinned",
      parentAnswered: answered,
      linkNode: false,
      liftPinned: wasLifted ? false : options.liftPinned,
      depth: depth + 1
    });
    return `<div class="qa-chain-branch">${followUpCardHtml(row)}${chain}</div>`;
  }

  function renderChildren(parentId, options) {
    const { childrenOf, isPublicView = false, parentPublic = true, parentPinned = false, parentAnswered = false, depth = 1, selfForm = false, allowForm = false, detached = [], lifted = [], linkNode = false } = options;
    const rows = [];
    for (const row of childrenOf(parentId)) {
      const status = row.status || "pending";
      const published = status === "answered" || status === "pinned";
      // 公开区：自己没公开却还挂在链上的行 = 服务端为连通深层公开追问保留的链接节点（子行非空），必须保留。
      if (isPublicView && !published) {
        const childRows = childrenOf(row.question_id);
        if (!childRows.length) continue;                 // 既没公开也没深层内容 → 不显示
        rows.push(followUpHtml(row, { ...options, depth, linkNode: true }));   // 链接节点：子层按"父公开"继续渲染
        continue;
      }
      // 公开区：父被隐藏（且不是链接节点）而自己已公开 → 断开，由调用方独立成卡
      if (isPublicView && published && !parentPublic && !linkNode) { detached.push(row); continue; }
      // 置顶的追问：只要它的父问题不是置顶，就抽到「置顶问题」区单独显示（每一层都这样判断）
      if (status === "pinned" && options.liftPinned && !parentPinned) {
        // 抽离时把它的子树一起带上，避免更深的追问被丢掉；子树内部不再二次抽离。
        lifted.push({ row, children: renderChildren(row.question_id, { ...options, parentPublic: true, parentPinned: true, parentAnswered: Boolean(String(row.answer || "").trim()), liftPinned: false, depth: depth + 1 }) });
        continue;
      }
      rows.push(followUpHtml(row, { ...options, depth }));
    }
    // 只有"已经被回答过"的问题才能继续追问：没有答案时追问无从谈起，不显示入口。
    const form = allowForm && selfForm && parentAnswered
      ? `<div class="qa-followup-form-host"><button class="qa-choice" type="button" data-form="${escapeHtml(parentId)}">继续追问</button></div>`
      : "";
    const total = rows.length;
    if (!total) return form ? `<div class="qa-chain">${form}</div>` : "";
    // 整条链默认折叠（只有点开才展开）；用户展开过的链记在 state.expanded 里。
    const expanded = state.expanded.has(String(parentId));
    const toggle = `<button class="qa-thread-toggle" type="button" data-toggle="${escapeHtml(parentId)}" aria-expanded="${expanded ? "true" : "false"}">
      <span class="qa-thread-toggle-mark">${expanded ? "−" : "+"}</span>${expanded ? "折叠" : "展开"} ${total} 条追问
    </button>`;
    return `<div class="qa-chain${expanded ? "" : " is-collapsed"}" data-chain="${escapeHtml(parentId)}">
      ${toggle}
      <div class="qa-chain-body">
        ${rows.join("")}
        ${form}
      </div>
    </div>`;
  }

  /**
   * 独立显示的追问卡片，两种情况共用：
   *   · 断开：父问题没公开，自己却已公开；
   *   · 置顶抽离：父问题不是置顶，但这条追问被置顶了，抽到「置顶问题」区单独显示。
   * item.liftedFrom 有值时表示是从某条问题里抽出来的；options.children 是它自己的子树（继续追问）。
   */
  function detachedCardHtml(item, options = {}) {
    const status = item.status || "pending";
    const asked = formatTime(item.asked_at);
    const answeredAt = formatTime(item.answered_at);
    const answer = String(item.answer || "").trim();
    const tag = item.liftedFrom ? "追问 · 置顶" : "追问 · 独立显示";
    const context = item.liftedFrom
      ? `<p class="qa-detached-context">出自：${escapeHtml(item.liftedFrom)}</p>`
      : "";
    return `<article class="qa-card qa-card-detached" data-id="detached:${escapeHtml(item.question_id)}">
      <div class="qa-card-head">
        <span class="qa-tag">${tag}</span>
        <span class="qa-badge qa-badge-${escapeHtml(status)}">${escapeHtml(STATUS_LABEL[status] || status)}</span>
        <time class="qa-time">提问于 ${asked || "刚刚"}</time>
      </div>
      <h3 class="qa-question">${escapeHtml(item.question)}</h3>
      ${context}
      ${answer
        ? `<div class="qa-answer"><span class="qa-answer-mark">答</span><div><p>${escapeHtml(item.answer)}</p>${answeredAt ? `<time class="qa-time">回答于 ${answeredAt}</time>` : ""}</div></div>`
        : `<p class="qa-waiting"><span class="qa-waiting-mark">…</span>主办方还没有回答这条追问。</p>`}
      ${options.children || ""}
    </article>`;
  }

  /**
   * 参与者侧始终直接显示答案，不做折叠：左侧状态与时间，下面是问题，再下面是答案，最下面是追问链。
   * 追问可继续追问，所以追问块自身也带链（递归）；整条链可以折叠。
   */
  function cardHtml(item, options = {}) {
    const { isMine = false, childrenOf = () => [], selfForm = false, detached = [], lifted = [] } = options;
    const status = item.status || "pending";
    const pending = status === "pending";
    const answered = Boolean(String(item.answer || "").trim());
    const asked = formatTime(item.asked_at);
    const answeredAt = formatTime(item.answered_at);
    // 根问题自己是不是公开：提问者视角里根可能还没回答（pending），那它会下面的已公开追问就要断开显示。
    const chainOptions = { childrenOf, isPublicView: !isMine, selfForm, allowForm: true, detached, lifted, parentPublic: status === "answered" || status === "pinned", parentPinned: status === "pinned", parentAnswered: answered, liftPinned: !isMine };
    const meta = `<span class="qa-badge qa-badge-${escapeHtml(status)}">${escapeHtml(STATUS_LABEL[status] || status)}</span>
      <span class="qa-tag">${isMine ? "我的提问" : "Q&amp;A"}</span>
      <time class="qa-time">提问于 ${asked || "刚刚"}</time>`;

    if (!answered) {
      return `<article class="qa-card${pending ? " is-pending" : ""}" data-id="${escapeHtml(item.question_id)}">
        <div class="qa-card-head">${meta}</div>
        <h3 class="qa-question">${escapeHtml(item.question)}</h3>
        <p class="qa-waiting"><span class="qa-waiting-mark">…</span>主办方还没有回答这个问题。回答后你会收到站内通知。</p>
        ${renderChildren(item.question_id, chainOptions)}
      </article>`;
    }

    return `<article class="qa-card" data-id="${escapeHtml(item.question_id)}">
      <div class="qa-card-head">${meta}</div>
      <h3 class="qa-question">${escapeHtml(item.question)}</h3>
      <div class="qa-answer"><span class="qa-answer-mark">答</span><div><p>${escapeHtml(item.answer)}</p>${answeredAt ? `<time class="qa-time">回答于 ${answeredAt}</time>` : ""}</div></div>
      ${renderChildren(item.question_id, chainOptions)}
    </article>`;
  }

  /**
   * 公开接口返回的是追问树（只含公开状态的追问 + 通往公开后代的链接节点），
   * 拍平成"父 id → 子行"索引与"id → 行"索引，供渲染、搜索与断开判断使用。
   */
  function publicSessionTree(roots) {
    const map = new Map();
    const nodes = new Map();
    const walk = (rows, parentId) => {
      map.set(String(parentId), rows);
      for (const row of rows) {
        nodes.set(String(row.question_id), row);
        walk(row.followUps || [], row.question_id);
      }
    };
    for (const root of roots) {
      nodes.set(String(root.question_id), root);
      walk(root.followUps || [], root.question_id);
    }
    return { childrenOf: id => map.get(String(id)) || [], nodes };
  }

  /** 「我的提问」是平坦列表（含待回答/隐藏的追问），按父 id 分组。 */
  function groupMap(rows) {
    const map = new Map();
    for (const row of rows) {
      if (!row.parent_question_id) continue;
      const key = String(row.parent_question_id);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    }
    return map;
  }

  function render() {
    const keyword = normalize(els.search?.value || "");
    // 去重：自己的提问只出现在「我的提问」区，置顶区与公开区都不再重复渲染。
    // 公开接口只返回会话根，所以这里按 question_id 判断即可。
    const myIds = knownMineIds();
    // 公开区的行不带 asker_id（脱敏），所以用"我的提问 id 集合"兜底判断归属。
    const matchesMine = row => myIds.has(String(row.question_id));
    const publicTree = publicSessionTree(state.publicQuestions);
    const publicChildrenOf = id => publicTree.childrenOf(id);
    const mineChildren = groupMap(mineRows());
    const mineChildrenOf = id => mineChildren.get(String(id)) || [];
    /** 搜索要能命中追问内容：命中追问时，它所在的根卡片也要保留。 */
    const subtreeMatches = (row, childOf) => {
      if (!keyword) return true;
      if (matches(row, keyword)) return true;
      return childOf(row.question_id).some(child => subtreeMatches(child, childOf));
    };
    // 我的提问里可能混入"自己的追问"，只把根当卡片渲染
    const myRoots = mineRows().filter(row => !row.parent_question_id);
    const decorate = (item, isMine) => {
      // 断开收集器：链里父问题不公开、自己却公开的追问会被收进来，稍后独立成卡。
      const detached = [];
      // 置顶追问收集器：会话根不是置顶时，链里置顶的追问会被抽出来，放到「置顶问题」区。
      const lifted = [];
      const html = cardHtml(item, {
        isMine,
        childrenOf: isMine ? mineChildrenOf : publicChildrenOf,
        // 只有自己的问题才给「继续追问」；公开区一律不给（不是自己的问题）。
        selfForm: Boolean(isMine),
        detached,
        lifted
      });
      return { ...item, html, detached, lifted };
    };

    const visiblePublic = state.publicQuestions
      .filter(item => !matchesMine(item))
      .filter(item => subtreeMatches(item, publicChildrenOf))
      .map(item => decorate(item, false));
    const pinned = visiblePublic.filter(item => item.status === "pinned");
    const others = visiblePublic.filter(item => item.status !== "pinned");
    const mine = myRoots.filter(item => subtreeMatches(item, mineChildrenOf)).map(item => decorate(item, true));
    // 公开区用服务端树（父被隐藏时服务端仍会把已公开的子追问挂在链里），把"父隐藏、子公开"的挑出来独立显示。
    const isPublished = row => ["answered", "pinned"].includes(row.status || "pending");
    const { nodes } = publicTree;
    // 服务端已经给出"根不公开、但自己公开"的追问（detached:true），这里连同链里遇到的断点一起收集。
    const collected = state.publicQuestions.filter(item => item.detached);
    // 「我的提问」里也有公开区看不到的会话：同样把其中"父被排除、自己已公开"的追问挑出来独立显示。
    // 被排除的行不影响后代判断（后代看自己的状态），否则根被隐藏会把整条链都判成断开。
    const walkMine = (rows, parentPublished) => {
      for (const row of rows) {
        const published = isPublished(row);
        if (published && !parentPublished) collected.push(row);
        walkMine(mineChildrenOf(row.question_id), published);
      }
    };
    walkMine(myRoots, true);
    // 断开显示的追问跟随"它所属会话的根"分组：根是置顶的进置顶区，否则进「其他已回答」。
    const pinnedIds = new Set(pinned.map(item => String(item.question_id)));
    const rootIdOf = row => String(row.root_question_id || row.parent_question_id || "");
    const detachedCards = [
      ...new Map([...collected, ...[...pinned, ...others].flatMap(item => item.detached)].map(item => [String(item.question_id), item])).values()
    ]
      .filter(item => matches(item, keyword))
      .map(item => ({ id: "detached:" + item.question_id, html: detachedCardHtml(item), pinned: pinnedIds.has(rootIdOf(item)) }));
    const detachedPinned = detachedCards.filter(item => item.pinned);
    const detachedOthers = detachedCards.filter(item => !item.pinned);
    // 会话根不是置顶、但链里有置顶追问：抽出来放到「置顶问题」区，卡片上标出它出自哪个问题。
    const liftedCards = [...pinned, ...others]
      .flatMap(item => item.lifted.map(({ row, children }) => ({ row, parent: item, children })))
      .filter(({ row }) => matches(row, keyword))
      .map(({ row, parent, children }) => ({ id: "lifted:" + row.question_id, html: detachedCardHtml({ ...row, liftedFrom: parent.question }, { children }) }));

    // pinned / others 存的是卡片对象，这里统一取 html 拼接。
    els.pinnedSection.hidden = pinned.length + detachedPinned.length + liftedCards.length === 0;
    els.pinned.innerHTML = [...pinned.map(item => item.html), ...liftedCards.map(item => item.html), ...detachedPinned.map(item => item.html)].join("");

    els.mineSection.hidden = mine.length === 0;
    els.mine.innerHTML = mine.map(item => item.html).join("");

    els.grid.innerHTML = [...others.map(item => item.html), ...detachedOthers.map(item => item.html)].join("");
    els.othersSection.hidden = others.length + detachedOthers.length === 0 && keyword.length > 0;

    const shown = pinned.length + detachedCards.length + mine.length + others.length;
    const pendingMine = myRoots.filter(item => item.status !== "answered" && item.status !== "pinned").length;
    const total = state.publicQuestions.length + pendingMine;
    els.count.textContent = keyword
      ? `匹配 ${shown} 条 / 共 ${total} 条`
      : `已回答 ${state.publicQuestions.length} 条${myRoots.length ? ` · 我的提问 ${myRoots.length} 条` : ""}`;

    if (keyword && shown === 0) {
      els.empty.hidden = false;
      els.empty.textContent = `没有匹配「${els.search.value.trim()}」的问题。可以换个关键词，或者登录后直接向主办方提问。`;
    } else if (!keyword && others.length === 0 && pinned.length === 0 && detached.length === 0 && !mine.length) {
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

  /** 「继续追问」的内联表单：同一时间只展开一个。 */
  function openFollowUpForm(button) {
    const host = button.closest(".qa-followup-form-host");
    const parentId = button.dataset.form;
    if (!host || !parentId) return;
    els.mine.querySelectorAll(".qa-followup-form-host").forEach(other => {
      other.querySelector(".qa-followup-form")?.remove();
      other.querySelector("button[data-form]")?.removeAttribute("hidden");
    });
    const form = document.createElement("form");
    form.className = "qa-followup-form";
    form.dataset.parent = parentId;
    form.innerHTML = `<label>继续追问<textarea rows="3" required placeholder="补充你想问的细节，例如：那需要自带插排吗？"></textarea></label>
      <p class="form-error" role="alert"></p>
      <div class="qa-followup-actions">
        <button class="button button-dark" type="submit">提交追问 <span>↗</span></button>
        <button class="qa-choice" type="button" data-cancel>取消</button>
      </div>`;
    button.hidden = true;
    host.appendChild(form);
    form.querySelector("textarea")?.focus();
  }

  async function submitFollowUp(form) {
    const parentId = form.dataset.parent;
    const textarea = form.querySelector("textarea");
    const error = form.querySelector(".form-error");
    const text = textarea.value.trim();
    error.textContent = "";
    if (text.length < 2) {
      error.textContent = "请把追问写完整一些（至少 2 个字）。";
      textarea.focus();
      return;
    }
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      const created = await api.request("/api/qa", { method: "POST", body: JSON.stringify({ question: text, parentQuestionId: parentId }) });
      if (created?.question?.question_id) state.createdIds.add(created.question.question_id);
      window.MinicampUI?.toast("追问已提交，主办方回答后会通知你。", { tone: "success" });
      await loadMine();
      // 追问只有自己的问题才可能，所以只刷新「我的提问」区，避免公开区把追问重复显示出来。
      render();
    } catch (submitError) {
      error.textContent = submitError.message;
      button.disabled = false;
    }
  }

  els.search?.addEventListener("input", render);

  // 追问链上的按钮：折叠/展开、打开/取消/提交追问
  const toggleThread = button => {
    const id = String(button.dataset.toggle || "");
    if (!id) return;
    const card = button.closest(".qa-card");
    if (state.expanded.has(id)) state.expanded.delete(id); else state.expanded.add(id);
    // 折叠时清掉展开中的追问表单，避免隐藏的表单下次渲染又冒出来
    card?.querySelectorAll(".qa-followup-form-host").forEach(host => {
      host.querySelector(".qa-followup-form")?.remove();
      host.querySelector("button[data-form]")?.removeAttribute("hidden");
    });
    render();
  };
  [els.mine, els.pinned, els.grid].forEach(container => {
    container.addEventListener("click", event => {
      const toggleButton = event.target.closest("button[data-toggle]");
      if (toggleButton) { toggleThread(toggleButton); return; }
      const openButton = event.target.closest("button[data-form]");
      if (openButton) { openFollowUpForm(openButton); return; }
      const cancelButton = event.target.closest("button[data-cancel]");
      if (cancelButton) {
        const host = cancelButton.closest(".qa-followup-form-host");
        cancelButton.closest(".qa-followup-form")?.remove();
        host?.querySelector("button[data-form]")?.removeAttribute("hidden");
      }
    });
    container.addEventListener("submit", event => {
      const form = event.target.closest(".qa-followup-form");
      if (!form) return;
      event.preventDefault();
      submitFollowUp(form);
    });
  });

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
      const created = await api.request("/api/qa", { method: "POST", body: JSON.stringify({ question: text }) });
      if (created?.question?.question_id) state.createdIds.add(created.question.question_id);
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
