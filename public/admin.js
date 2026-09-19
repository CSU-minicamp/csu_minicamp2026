(() => {
  const api = { ...MinicampAPI, request: MinicampAPI.adminRequest };
  let state;
  const root = document.querySelector(".admin-main");
  const SKILLS = ["Frontend", "Backend", "Product", "Design", "Hardware", "AI Engineer", "Media"];
  const STATUSES = ["待审核", "已录取", "已通过", "候补", "待复审", "未通过"];
  const STATUS_CLASS = { "待审核": "status-pending", "已录取": "status-accepted", "候补": "status-waitlist", "待复审": "status-pending" };
  const isRoadshow = a => (a.registration_type || a.registrationType || "contestant") === "roadshow";
  const statusCell = a => isRoadshow(a)
    ? "<button type='button' class='status status-accepted status-locked' data-locked-status='" + esc(a.id) + "' title='路演报名固定为「已通过」，不可更改'>已通过 <span aria-hidden='true'>锁</span></button>"
    : "<select class='status-select' data-id='" + esc(a.id) + "'>" + STATUSES.map(s => "<option " + (s === a.status ? "selected" : "") + ">" + s + "</option>").join("") + "</select>";
  // 队伍卡片里每个成员按报名状态上色：已录取/已通过=浅绿、待审核=纸色、待复审=浅蓝、未通过=浅红、候补=黄。
  const MEMBER_TONE = { approved: "is-approved", pending: "is-pending", review: "is-review", rejected: "is-rejected", waitlist: "is-waitlist" };
  const memberTone = member => {
    if (isRoadshow(member)) return "approved";
    const s = String(member?.status || "").trim();
    if (s === "已录取" || s === "已通过") return "approved";
    if (s === "待复审") return "review";
    if (s === "未通过") return "rejected";
    if (s === "候补") return "waitlist";
    return "pending";
  };
  const memberToneClass = member => MEMBER_TONE[memberTone(member)] || "is-pending";
  const PANEL_META = {
    overview: ["报名总览", "集中管理报名、审核、录取与通知。"],
    applicants: ["报名审核", "查看报名者资料、调整录取状态、导出名单。"],
    teams: ["队伍管理", "查看组队进度，协助处理尚未锁定的队伍。"],
    ideas: ["Idea 管理", "管理组队页中公开展示的创意。"],
    projects: ["项目审核", "审核项目草稿；发布后会出现在 Project Gallery。"],
    voting: ["投票与结果", "查看参与者和 Jury 投票的实时汇总。"],
    notices: ["通知与录取", "向报名者发送录取结果与活动通知。"],
    config: ["活动配置", "设置官网、投票与 Starter Pack 的实时配置。"],
    stage: ["现场大屏", "推进现场节点，编辑主持人提示和现场动作。"]
  };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = t => t ? new Date(t).toLocaleString("zh-CN", {hour12: false}) : "";
  // 活动配置的时间用「日期选择器 + 24 小时制下拉」组合。
  const pad2 = value => String(value).padStart(2, "0");
  const splitTime = value => {
    const text = String(value || "").trim();
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    if (match) return {date: match[1] + "-" + match[2] + "-" + match[3], hour: match[4], minute: match[5]};
    const parsed = new Date(text);
    if (!text || Number.isNaN(parsed.getTime())) return {date: "", hour: "00", minute: "00"};
    return {date: parsed.getFullYear() + "-" + pad2(parsed.getMonth() + 1) + "-" + pad2(parsed.getDate()), hour: pad2(parsed.getHours()), minute: pad2(parsed.getMinutes())};
  };
  const timeSelect = (name, label, selected, count) => {
    let options = "";
    for (let value = 0; value < count; value += 1) {
      const text = pad2(value);
      options += "<option value='" + text + "'" + (text === selected ? " selected" : "") + ">" + text + "</option>";
    }
    return "<select name='" + name + "' aria-label='" + label + "'>" + options + "</select>";
  };
  const timeInput = (name, label, value) => {
    const parts = splitTime(value);
    return "<div class='config-time'><input type='date' name='" + name + "Date' aria-label='" + label + "' value='" + parts.date + "'><span class='config-time-clock'>" + timeSelect(name + "Hour", label + " 小时", parts.hour, 24) + "<b>:</b>" + timeSelect(name + "Minute", label + " 分钟", parts.minute, 60) + "</span></div><small class='field-help'>24 小时制，日期留空表示不设置</small>";
  };
  const joinTime = (date, hour, minute) => {
    const day = String(date || "").trim();
    if (!day) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined;
    return day + "T" + pad2(hour || "00") + ":" + pad2(minute || "00");
  };
  const modal = document.getElementById("applicant-modal");
  function toast(msg, tone = "info") { MinicampUI.toast(msg, {tone}); }
  function setHtml(id, html) { const el = document.getElementById(id); if (el) el.innerHTML = html; return el;}

  /**
   * 正在编辑的表单（通知 / 活动配置 / 主持人提示）在轮询刷新时不丢草稿：
   * 每次重绘前用 preserveForm 把已填的值原样放回，内容继续更新、正在写的东西也不会被清掉。
   */
  const formDrafts = new Map();
  const draftOf = id => formDrafts.get(id)?.draft ?? null;
  /** 读取表单当前值（含未保存的草稿），供 preserveForm 使用。 */
  function formDraft(form) {
    const draft = new Map();
    if (!form) return draft;
    form.querySelectorAll("input, select, textarea").forEach(field => {
      if (!field.name) return;
      if (field.type === "checkbox" || field.type === "radio") draft.set(field.name, field.checked);
      else draft.set(field.name, field.value);
    });
    return draft;
  }
  /** 重绘后把草稿原样放回：只更新内容，不清掉主办方正在写的东西。 */
  function preserveForm(form, draft) {
    if (!form || !draft || !draft.size) return form;
    form.querySelectorAll("input, select, textarea").forEach(field => {
      const name = field.name;
      if (!name || !draft.has(name)) return;
      const value = draft.get(name);
      if (field.type === "checkbox" || field.type === "radio") field.checked = Boolean(value);
      else field.value = String(value);
    });
    return form;
  }
  /** 绑定表单：用户改动后记录草稿，重绘时用 preserveForm 还原，标记 span 同步提示。 */
  function bindDraft(id, form, helpId) {
    if (!form || formDrafts.has(id)) return;
    const entry = { draft: null };
    formDrafts.set(id, entry);
    ["input", "change"].forEach(type => form.addEventListener(type, () => {
      entry.draft = formDraft(form);
      const help = document.getElementById(helpId);
      if (help) help.textContent = "你有未保存的修改：自动刷新会保留它们，保存或点「刷新数据」后同步最新数据。";
    }));
  }

  function showLogin() {
    if (document.getElementById("admin-login")) return;
    const box = document.createElement("section"); box.id = "admin-login"; box.className = "admin-login-card";
    box.innerHTML = "<p class='section-kicker'>ORGANIZER ACCESS</p><h2>进入报名管理工作台</h2><form><label>主办方密码<input type='password' name='password' required></label><p class='form-error'></p><button class='button button-dark'>登录</button></form>";
    root.prepend(box);
    const form = box.querySelector("form");
    if (!form) return;
    form.onsubmit = async e => {
      e.preventDefault();
      try {
        const d = await api.request("/api/auth/admin", { method: "POST", body: JSON.stringify({ password: new FormData(e.currentTarget).get("password") }) });
        api.setAdminToken(d.token);
        box.remove();
        await load();
      } catch (err) {
        const error = box.querySelector(".form-error");
        if (error) error.textContent = err.message;
        else toast(err.message, "error");
      }
    };
  }
  // keepDrafts：轮询 / 面板自动刷新沿用「正在编辑」的状态；手动刷新按钮会清掉未保存草稿重新拉取。
  // automatic：由轮询 / 切回标签页触发的刷新，正在输入时跳过；用户主动点按钮时为 false，正常刷新。
  function load({ keepDrafts = true, withQa = true, automatic = true } = {}) {
    if (!keepDrafts) formDrafts.forEach(entry => { entry.draft = null; });
    return sync({ withQa, reason: "manual", notify: false, automatic });
  }
  function bar(label, value, max) { return "<div><div class='status-bar-label'><span>" + esc(label) + "</span><b>" + value + "</b></div><div class='status-bar-track'><i style='width:" + (value / Math.max(max, 1) * 100) + "%'></i></div></div>"; }
  function stackedBar(label, value, acceptedCount, max) {
    const width = inner => Math.max(inner > 0 ? 3 : 0, inner / Math.max(max, 1) * 100);
    return "<div class='status-bar-stack'><div class='status-bar-label'><span>" + esc(label) + "</span><b>" + acceptedCount + " / " + value + "</b></div><div class='status-bar-track'><i class='is-total' style='width:" + width(value) + "%'></i><i class='is-accepted' style='width:" + width(acceptedCount) + "%'></i></div></div>";
  }

  /**
   * 报名筛选（advance search 风格）：一条条件 = 一个维度 + 一个取值，
   * 同一维度可以同时选中多个取值（维度内并集，例如「专业=软件工程 或 计算机」），
   * 不同维度之间为「同时满足」。统计范围可选「全部报名」或「筛选结果」。
   */
  const FILTER_DIMENSIONS = [
    { key: "status", label: "状态" },
    { key: "registration_type", label: "报名类型" },
    { key: "grade", label: "年级" },
    { key: "major", label: "专业" },
    { key: "college", label: "学院" }
  ];
  const DIMENSION_LABEL = Object.fromEntries(FILTER_DIMENSIONS.map(item => [item.key, item.label]));
  /** 维度下拉由 FILTER_DIMENSIONS 生成，避免两处定义走样。 */
  function renderFilterDimensions() {
    const select = document.getElementById("filter-dimension");
    if (!select) return;
    const previous = select.value;
    select.innerHTML = FILTER_DIMENSIONS.map(item => "<option value='" + item.key + "'>" + esc(item.label) + "</option>").join("");
    if (FILTER_DIMENSIONS.some(item => item.key === previous)) select.value = previous;
  }
  const FILTER_STORAGE_KEY = "minicamp2026_admin_filters";
  /** chips 里保存的是「单个取值」的条件，上限防止多选后条件过多（存 localStorage 也够小）。 */
  const FILTER_CHIP_LIMIT = 24;
  const filterState = { active: false, chips: [] };
  const appValue = (app, key) => key === "registration_type" ? (isRoadshow(app) ? "roadshow" : "contestant") : String(app[key] ?? "").trim();
  const displayValue = (key, value) => {
    if (key === "registration_type") return value === "roadshow" ? "路演报名" : "参赛报名";
    return value || "未填写";
  };
  /** 按维度归并条件：维度内多选 → 并集；维度之间 → 交集。 */
  function groupChips(chips) {
    const groups = new Map();
    chips.forEach(chip => {
      if (!groups.has(chip.key)) groups.set(chip.key, []);
      groups.get(chip.key).push(chip.value);
    });
    return groups;
  }
  /**
   * 条件匹配：同一维度内多个取值取并集（年级=大三 或 大四），
   * 不同维度之间取交集（状态=已通过 且 专业=软件工程）。
   */
  function matchesChips(app, chips) {
    for (const [key, values] of groupChips(chips)) {
      if (!values.includes(appValue(app, key))) return false;
    }
    return true;
  }
  /**
   * 筛选只作用于「分类查看」与「能力结构」两块，其它统计（指标卡、报名状态、最近报名、
   * 已录取来源、报名审核表）始终看全部报名。返回是否启用筛选 + 命中数量 + 判定函数。
   */
  function overviewFilter() {
    const active = filterState.active && filterState.chips.length > 0;
    return {
      active,
      matches: app => !active || matchesChips(app, filterState.chips),
      count: active ? (state.applications || []).filter(app => matchesChips(app, filterState.chips)).length : (state.applications || []).length
    };
  }
  /** 需要跟随筛选的两块统计所用的数据集。 */
  function filteredApps() {
    const filter = overviewFilter();
    return (state.applications || []).filter(filter.matches);
  }
  /** 分类统计 */
  const CATEGORY_LABEL = { grade: "年级", major: "专业", college: "学院", type: "报名类型" };
  let categoryKey = "grade";
  let categoryPicked = false;
  function pickDefaultCategory() {
    if (categoryPicked) return;
    categoryPicked = true;
    const apps = state.applications || [];
    if (!apps.length) return;
    const coverage = key => apps.filter(a => String(a[key] || "").trim()).length / apps.length;
    if (coverage("grade") >= Math.max(coverage("major"), coverage("college"))) return;
    categoryKey = coverage("major") >= coverage("college") ? "major" : "college";
  }
  /** 分类查看的数据集：跟随筛选 + 报名类型筛选。 */
  const appsOfType = type => filteredApps().filter(a => type === "全部" || (isRoadshow(a) ? "roadshow" : "contestant") === type);
  const currentTypeFilter = () => document.getElementById("applicant-type")?.value || "全部";
  function categoryCounts(key) {
    const counts = new Map();
    appsOfType(currentTypeFilter()).forEach(a => {
      const raw = key === "type" ? (isRoadshow(a) ? "路演报名" : "参赛报名") : String(a[key] || "").trim();
      const value = raw || "未填写 " + CATEGORY_LABEL[key];
      const entry = counts.get(value) || {label: value, total: 0, accepted: 0};
      entry.total += 1;
      if (a.status === "已录取") entry.accepted += 1;
      counts.set(value, entry);
    });
    return [...counts.values()].sort((a, b) => (b.total - a.total) || a.label.localeCompare(b.label, "zh-CN"));
  }
  // 图表交给 Chart.js（本地 vendor/chart.umd.min.js），标签冲突由它自动换行/旋转处理。
  let categoryChart = null;
  const CHART_COLORS = { total: "#dfe3dc", accepted: "#247b63", axis: "#a2a29a", grid: "#ececE5" };
  function renderCategoryChart() {
    pickDefaultCategory();
    const rows = categoryCounts(categoryKey);
    const filter = overviewFilter();
    const typeFilter = currentTypeFilter();
    const typeLabel = typeFilter === "roadshow" ? "路演报名" : typeFilter === "contestant" ? "参赛报名" : "";
    const scopeLabel = filter.active ? "筛选结果 " + appsOfType(typeFilter).length + " 条" : "全部报名 " + appsOfType(typeFilter).length + " 条";
    const wrap = document.getElementById("category-canvas-wrap");
    const canvas = document.getElementById("category-canvas");
    if (!canvas || !wrap) return;
    const foot = document.getElementById("chart-foot");
    if (foot) foot.textContent = CATEGORY_LABEL[categoryKey] + "维度 · " + (typeLabel ? typeLabel + " · " : "") + scopeLabel + (rows.some(row => row.accepted) ? " · 深色为已录取" : "");
    document.querySelectorAll("#category-switch [data-category]").forEach(button => {
      button.classList.toggle("active", button.dataset.category === categoryKey);
      button.setAttribute("aria-selected", String(button.dataset.category === categoryKey));
    });
    if (categoryChart) { categoryChart.destroy(); categoryChart = null; }
    if (!rows.length) { wrap.innerHTML = "<p class='empty-state'>当前条件下没有报名</p>"; wrap.style.height = ""; wrap.style.width = ""; return; }
    if (!wrap.querySelector("canvas")) wrap.innerHTML = "<canvas id='category-canvas' aria-label='分类报名人数柱状图' role='img'></canvas>";
    const target = wrap.querySelector("canvas");
    /*
     * 横向条（indexAxis: "y"）：类别名在左侧一行一个，天然不会互相压字，
     * 也省掉斜排标签；容器高度随类别数增长，保证每个类别都有足够的行高。
     * 同时锁定宽度，避免 height 变化时 Chart.js 按宽高比把画布撑宽而造成横向溢出。
     */
    const wrapWidth = Math.max(320, Math.round(wrap.clientWidth || wrap.getBoundingClientRect().width || 600));
    wrap.style.height = Math.max(260, Math.min(900, 44 + rows.length * 30)) + "px";
    wrap.style.width = wrapWidth + "px";
    if (typeof window.Chart !== "function") {
      wrap.style.height = "";
      wrap.innerHTML = "<p class='empty-state'>图表库未加载，以下为数字列表：</p><div class='status-bars'>" + rows.map(row => stackedBar(row.label, row.total, row.accepted, Math.max(1, ...rows.map(item => item.total)))).join("") + "</div>";
      return;
    }
    const maxValue = Math.max(1, ...rows.map(row => row.total));
    categoryChart = new window.Chart(target, {
      type: "bar",
      data: {
        labels: rows.map(row => row.label),
        datasets: [
          { label: "报名人数", data: rows.map(row => row.total), backgroundColor: CHART_COLORS.total, borderRadius: 4, maxBarThickness: 24 },
          { label: "已录取", data: rows.map(row => row.accepted), backgroundColor: CHART_COLORS.accepted, borderRadius: 4, maxBarThickness: 24 }
        ]
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 220 },
        layout: { padding: { right: 5 } },
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: {
            position: "top",
            align: "end",
            labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: "rectRounded", font: { size: 11, weight: "700" }, color: "#3f3f39" }
          },
          tooltip: {
            backgroundColor: "#111111",
            padding: 10,
            displayColors: false,
            titleFont: { size: 12, weight: "800" },
            bodyFont: { size: 12 },
            callbacks: {
              title: items => rows[items[0]?.dataIndex]?.label ?? "",
              label: item => item.dataset.label + "：" + item.parsed.x + " 人"
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            suggestedMax: maxValue * 1.08,
            grid: { color: CHART_COLORS.grid },
            border: { display: false },
            ticks: { color: CHART_COLORS.axis, font: { size: 10, family: "Consolas, monospace" }, precision: 0, maxTicksLimit: 8 }
          },
          y: {
            grid: { display: false },
            border: { color: "#c8c8c1" },
            ticks: { color: "#6e6e66", font: { size: 11 }, autoSkip: false, padding: 8 }
          }
        }
      }
    });
  }

  function render() {
    // 全局统计始终基于全部报名；只有「分类查看」与「能力结构」跟随筛选。
    const apps = state.applications || [];
    const facetApps = filteredApps();
    const filter = overviewFilter();
    const count = s => apps.filter(x => x.status === s).length;
    const contestants = apps.filter(x => !isRoadshow(x)).length;
    const roadshows = apps.length - contestants;
    const acceptedApps = apps.filter(x => x.status === "已录取");
    const facetAccepted = facetApps.filter(x => x.status === "已录取");
    const total = apps.length;
    setHtml("metrics-grid", [["报名总数", total + "<em>（MC " + contestants + " / RO " + roadshows + "）</em>", "报名 / 路演"], ["待审核", count("待审核"), "需处理"], ["已录取", acceptedApps.length, "正式名额"], ["候补", count("候补"), "备选名单"]].map(x => "<div class='metric-card'><span>" + x[0] + "</span><strong>" + x[1] + "</strong><small>" + x[2] + "</small></div>").join(""));
    setHtml("status-bars", STATUSES.map(s => bar(s, count(s), total)).join(""));
    const skillRows = SKILLS.map(s => {
      const all = facetApps.filter(a => (a.skills || []).includes(s)).length;
      const acceptedCount = facetAccepted.filter(a => (a.skills || []).includes(s)).length;
      return {label: s, all, accepted: acceptedCount};
    });
    const skillMax = Math.max(1, ...skillRows.map(row => row.all));
    setHtml("skill-bars", skillRows.map(row => stackedBar(row.label, row.all, row.accepted, skillMax)).join(""));
    const skillScope = document.getElementById("skill-scope");
    if (skillScope) skillScope.textContent = filter.active ? "筛选结果 " + facetApps.length + " 条 · 深色为已录取" : "浅色为报名人数 · 深色为已录取";
    setHtml("accepted-major-bars", (() => {
      const counts = new Map();
      acceptedApps.forEach(a => {
        const label = String(a.major || "").trim() || "未填写专业";
        counts.set(label, (counts.get(label) || 0) + 1);
      });
      const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
      const max = Math.max(1, ...rows.map(row => row[1]));
      return rows.map(row => bar(row[0], row[1], max)).join("") || "<p class='empty-state'>暂无已录取报名</p>";
    })());
    renderCategoryChart();
    renderFilterBuilder();
    renderFilterChips();
    setHtml("activity-list", apps.slice(0, 6).map(x => "<div class='activity-item'><span class='activity-dot'>" + esc((x.name || "?").slice(0, 1)) + "</span><p><strong>" + esc(x.name) + "</strong> · " + esc(x.id) + "<br><time>" + fmt(x.createdAt) + "</time></p></div>").join("") || "<p class='empty-state'>暂无报名</p>");
    renderReminders();
    renderApps();
    renderTeams();
    renderIdeas();
    renderProjects();
    renderVoting();
    renderNotices();
    renderConfig();
    renderStageBriefEditor();
  }

  /**
   * 条件取值列表：复选框，支持一个维度同时勾选多个取值。
   * 每个取值后面标注「加上该条件后」的命中人数（其余维度的已选条件仍然生效）。
   * 维度内已添加过的取值保持勾选并禁用，避免重复条件。
   */
  let stagedValues = [];
  function renderFilterBuilder() {
    const dimension = document.getElementById("filter-dimension");
    const valueList = document.getElementById("filter-value");
    if (!dimension || !valueList) return;
    const key = dimension.value || "status";
    const others = filterState.chips.filter(chip => chip.key !== key);
    const added = new Set(filterState.chips.filter(chip => chip.key === key).map(chip => chip.value));
    const counts = new Map();
    (state.applications || []).filter(app => matchesChips(app, others)).forEach(app => {
      const value = appValue(app, key);
      counts.set(value, (counts.get(value) || 0) + 1);
    });
    const rows = [...counts.entries()].sort((a, b) => (b[1] - a[1]) || displayValue(key, a[0]).localeCompare(displayValue(key, b[0]), "zh-CN"));
    valueList.innerHTML = rows.length
      ? rows.map(([value, num]) => {
          const isAdded = added.has(value);
          return "<label class='filter-option" + (isAdded ? " is-added" : "") + "'><input type='checkbox' value='" + esc(value) + "'" + (isAdded ? " checked disabled" : "") + "><span class='filter-option-label'>" + esc(displayValue(key, value)) + "</span><b>" + num + "</b></label>";
        }).join("")
      : "<p class='filter-empty'>没有可选值</p>";
    // 每次重绘都清空暂存勾选：已添加的取值由上面的 checked/disabled 表示。
    stagedValues = [];
    setFilterValueChecks([]);
    updateFilterValueHint();
    const button = document.getElementById("filter-add");
    if (button) button.disabled = !rows.length;
  }

  /** 当前列表里可勾选（尚未添加）的取值。 */
  function checkedFilterValues() {
    const valueList = document.getElementById("filter-value");
    if (!valueList) return [];
    return [...valueList.querySelectorAll("input[type='checkbox']:checked")].filter(box => !box.disabled).map(box => box.value);
  }
  /** 回填勾选状态（不触发 change 事件；调用方负责随后刷新提示文案）。 */
  function setFilterValueChecks(values) {
    const wanted = new Set(values);
    document.querySelectorAll("#filter-value input[type='checkbox']").forEach(box => {
      if (!box.disabled) box.checked = wanted.has(box.value);
    });
  }
  /** 列表右上角的小字：提示当前勾选了几个 / 若添加会命中多少条。 */
  function updateFilterValueHint() {
    const hint = document.getElementById("filter-values-hint");
    if (!hint) return;
    if (!stagedValues.length) { hint.textContent = "勾选一个或多个"; return; }
    const next = filterState.chips.concat(stagedValues.map(value => ({key: document.getElementById("filter-dimension")?.value || "", value})));
    const hits = (state.applications || []).filter(app => matchesChips(app, next)).length;
    hint.textContent = "已选 " + stagedValues.length + " 项 · 添加后命中 " + hits + " 条";
  }

  function renderFilterChips() {
    const filter = overviewFilter();
    const box = document.getElementById("filter-chips");
    if (box) {
      if (!filterState.chips.length) {
        box.innerHTML = "<span class='filter-empty'>未添加条件：下面「分类查看」与「能力结构」都按全部报名统计。</span>";
      } else {
        box.innerHTML = [...groupChips(filterState.chips)].map(([key, values]) => "<div class='filter-chip-group'><span class='filter-chip-head'><b>" + esc(DIMENSION_LABEL[key] || key) + "</b>" + (values.length > 1 ? "<em>" + values.length + " 项任一</em>" : "<em>是</em>") + "</span>" + values.map(value => "<span class='filter-chip'>" + esc(displayValue(key, value)) + "<button type='button' data-chip-key='" + esc(key) + "' data-chip-value='" + esc(value) + "' aria-label='移除该条件'>×</button></span>").join("") + "</div>").join("") + "<span class='filter-empty'>共 " + filterState.chips.length + " 个取值，维度内任一满足 · 维度之间同时满足</span>";
      }
      box.querySelectorAll("[data-chip-key]").forEach(button => button.onclick = () => {
        const { chipKey, chipValue } = button.dataset;
        cropFilterChips(item => item.key === chipKey && item.value === chipValue);
        saveFilterSettings();
        stagedValues = [];
        render();
      });
    }
    const scope = document.getElementById("overview-scope");
    if (scope) {
      const usable = filterState.chips.length > 0;
      if (!usable) filterState.active = false;
      scope.querySelectorAll("[data-scope]").forEach(button => {
        const isActive = usable && button.dataset.scope === (filterState.active ? "filtered" : "all");
        button.classList.toggle("active", isActive || (!usable && button.dataset.scope === "all"));
        button.disabled = !usable && button.dataset.scope === "filtered";
      });
    }
    const summary = document.getElementById("filter-summary");
    if (summary) {
      const allTotal = (state.applications || []).length;
      summary.innerHTML = filterState.chips.length
        ? "命中 <b>" + filter.count + "</b> / " + allTotal + " 条 · 影响范围：" + (filter.active ? "分类查看 · 能力结构" : "未启用（点右上角切到筛选结果）")
        : "全部报名 <b>" + allTotal + "</b> 条";
    }
  }

  /** 原地裁剪条件数组（remove = 返回 true 表示该条件要移除）。 */
  function cropFilterChips(remove) {
    filterState.chips = filterState.chips.filter(chip => !remove(chip));
    if (!filterState.chips.length) filterState.active = false;
  }

  /** 添加条件：把当前勾选的所有取值一次性加入该维度（已添加过的自动跳过）。 */
  function addFilterChip() {
    const dimension = document.getElementById("filter-dimension");
    const key = dimension?.value || "";
    const picked = checkedFilterValues();
    if (!key) return;
    if (!picked.length) { toast("先勾选一个或多个取值"); return; }
    const exists = value => filterState.chips.some(chip => chip.key === key && chip.value === value);
    const room = Math.max(0, FILTER_CHIP_LIMIT - filterState.chips.length);
    const added = picked.filter(value => !exists(value)).slice(0, room);
    if (!added.length) {
      toast(picked.every(exists) ? "这些取值已经加过了" : "条件数量已达上限（" + FILTER_CHIP_LIMIT + " 个）", "info");
      return;
    }
    filterState.chips.push(...added.map(value => ({ key, value })));
    filterState.active = true;
    saveFilterSettings();
    stagedValues = [];
    render();
    const label = DIMENSION_LABEL[key] || key;
    toast(added.length > 1 ? "已添加 " + label + " " + added.length + " 个取值（满足任一）" : "已添加条件：" + label + " = " + displayValue(key, added[0]), "success");
  }

  function saveFilterSettings() {
    try { localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({ chips: filterState.chips, active: filterState.active })); } catch { /* 隐私模式忽略 */ }
  }
  function readFilterSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(FILTER_STORAGE_KEY) || "null");
      if (saved && Array.isArray(saved.chips)) {
        const seen = new Set();
        filterState.chips = saved.chips
          .filter(chip => chip && DIMENSION_LABEL[chip.key] && typeof chip.value === "string")
          .filter(chip => { const id = chip.key + "\u0000" + chip.value; if (seen.has(id)) return false; seen.add(id); return true; })
          .slice(0, FILTER_CHIP_LIMIT);
        filterState.active = Boolean(saved.active) && filterState.chips.length > 0;
      }
    } catch { /* 忽略损坏的本地设置 */ }
  }

  function renderReminders() {
    const c = state.config || {};
    const items = [
      [c.applicationOpen ? "✓" : "!", c.applicationOpen ? "报名通道开放中" : "报名通道已关闭", c.applicationOpen ? "官网报名表可正常提交" : "官网显示“暂未开放”"],
      ["#", "报名截止", c.applicationDeadline ? fmt(c.applicationDeadline) : "尚未设置"],
      ["#", "录取公布", c.resultDate ? fmt(c.resultDate) : "尚未设置"],
      ["#", "投票开始", c.voteStartAt ? fmt(c.voteStartAt) : "尚未设置"]
    ];
    setHtml("event-reminders", items.map(i => "<div class='activity-item'><span class='activity-dot'>" + esc(i[0]) + "</span><p><strong>" + esc(i[1]) + "</strong><br><time>" + esc(i[2]) + "</time></p></div>").join(""));
  }

  function renderApps() { applyFilters(); }
  function applyFilters() {
    const q = (document.getElementById("applicant-search")?.value || "").trim().toLowerCase();
    const status = document.getElementById("applicant-status")?.value || "全部";
    const type = document.getElementById("applicant-type")?.value || "全部";
    const list = (state.applications || []).filter(a => {
      const okStatus = status === "全部" || a.status === status;
      const okType = type === "全部" || (a.registration_type || "contestant") === type;
      const okQ = !q || [a.name, a.college, a.major, a.id, a.email, a.phone].some(v => String(v || "").toLowerCase().includes(q));
      return okStatus && okType && okQ;
    });
    renderRows(list);
  }
  function renderRows(list) {
    const tbody = document.getElementById("applicants-table"); if (!tbody) return;
    tbody.innerHTML = list.map(x => "<tr><td class='name-cell'><span class='mini-avatar'>" + esc((x.name || "?").slice(0, 1)) + "</span><div><strong>" + esc(x.name) + "</strong><br><small>" + esc(x.college) + " · " + esc(x.major) + "</small></div></td><td>" + (isRoadshow(x) ? "路演报名" : "参赛报名") + "</td><td>" + esc(x.id) + "</td><td><small>" + esc(x.phone || "—") + "<br>" + esc(x.email || "—") + "</small></td><td>" + ((x.skills || []).map(s => "<span class='tag'>" + esc(s) + "</span>").join(" ") || "—") + "</td><td><small>" + fmt(x.createdAt) + "</small></td><td class='status-cell'>" + statusCell(x) + "</td><td><button class='row-action' data-view='" + esc(x.id) + "'>查看</button></td></tr>").join("") || "<tr><td colspan='8'><div class='empty-state'>没有符合条件的报名</div></td></tr>";
    tbody.querySelectorAll(".status-select").forEach(sel => sel.onchange = async () => { try { await api.request("/api/admin/applications", { method: "PATCH", body: JSON.stringify({ id: sel.dataset.id, status: sel.value }) }); toast("已更新为「" + sel.value + "」", "success"); await load(); } catch (e) { toast(e.message, "error"); await load(); } });
    tbody.querySelectorAll("[data-locked-status]").forEach(b => b.onclick = () => toast("路演报名固定为「已通过」，无法更改。", "info"));
    tbody.querySelectorAll("[data-view]").forEach(b => b.onclick = () => openDetail(b.dataset.view));
  }

  function openDetail(id) {
    const x = (state.applications || []).find(a => a.id === id);
    const box = document.getElementById("applicant-detail");
    if (!x || !box || !modal) return;
    const row = (dt, dd) => "<div><dt>" + dt + "</dt><dd>" + esc(dd || "—") + "</dd></div>";
    const blk = (h, body) => "<div class='admin-detail-block'><h3>" + h + "</h3><p>" + (body ? esc(body) : "<span class='muted'>未填写</span>") + "</p></div>";
    box.innerHTML =
      "<div class='admin-detail-head'><div><p class='section-kicker'>APPLICATION · " + esc(x.id) + "</p><h2 id='applicant-detail-name'>" + esc(x.name) + "</h2><span>" + esc(x.college) + " · " + esc(x.major) + "</span></div><span class='status " + (STATUS_CLASS[x.status] || "status-pending") + "'>" + esc(x.status) + "</span></div>" +
      (isRoadshow(x)
        ? "<div class='admin-detail-status is-locked'><span>报名状态</span><b class='status status-accepted status-locked'>已通过</b><small>路演报名提交后自动通过，主办方不可更改状态。</small></div>"
        : "<div class='admin-detail-status'><span>快速设置状态</span>" + STATUSES.map(s => "<button type='button' class='outline-button" + (s === x.status ? " primary" : "") + "' data-set-status='" + s + "'>" + s + "</button>").join("") + "</div>") +
      "<dl class='admin-detail-grid'>" + row("学号", x.studentId) + row("手机号", x.phone) + row("邮箱", x.email) + row("年级", x.grade) + row("能力标签", (x.skills || []).join(" / ")) + row("提交时间", fmt(x.createdAt)) + row("最近更新", x.updatedAt ? fmt(x.updatedAt) : "—") + "</dl>" +
      blk("参与动机", x.motivation) + blk("做过的项目 / 经历", x.experience) + blk("可以来找 TA 聊什么", x.askMeAbout) + blk("可以帮助别人做什么", x.canHelpWith) + blk("想探索什么", x.explore) +
      "<div class='admin-detail-block'><h3>作品集 / GitHub / 主页</h3><p>" + (x.portfolio ? "<a href='" + esc(x.portfolio) + "' target='_blank' rel='noreferrer'>" + esc(x.portfolio) + " ↗</a>" : "<span class='muted'>未填写</span>") + "</p></div>";
    box.querySelectorAll("[data-set-status]").forEach(btn => btn.onclick = async () => { try { await api.request("/api/admin/applications", { method: "PATCH", body: JSON.stringify({ id: x.id, status: btn.dataset.setStatus }) }); modal.close(); toast("已更新为「" + btn.dataset.setStatus + "」", "success"); await load(); } catch (e) { toast(e.message, "error"); } });
    modal.showModal();
  }
  document.getElementById("applicant-modal-close")?.addEventListener("click", () => modal?.close());
  modal?.addEventListener("click", e => { if (e.target === modal) modal.close(); });

  function renderTeams() {
    const teams = state.teams || [];
    const total = document.getElementById("team-total");
    if (total) total.textContent = teams.length + " 支队伍";
    const board = setHtml("admin-team-board", teams.map(team => {
      const teamMembers = team.members || [];
      const members = teamMembers.map(member => `<li class='${memberToneClass(member)}'><button class='team-member-name' data-view="${esc(member.id)}">` + esc(member.name) + "</button><small>" + esc((member.skills || []).join(" / ") || "未填写能力标签") + "</small></li>").join("") || "<li class='is-empty'>暂无成员</li>";
      // 卡片头部统计：已录取/已通过 · 候补 · 待审核/待复审 · 未通过，颜色与成员底色一致，个数为 0 的不显示。
      const tones = teamMembers.reduce((acc, member) => { const key = memberTone(member); acc[key] = (acc[key] || 0) + 1; return acc; }, {});
      const statChips = [
        ["is-approved", "已录取/已通过", tones.approved || 0],
        ["is-waitlist", "候补", tones.waitlist || 0],
        ["is-pending", "待审核/待复审", (tones.pending || 0) + (tones.review || 0)],
        ["is-rejected", "未通过", tones.rejected || 0]
      ].filter(chip => chip[2] > 0);
      const stats = statChips.length ? "<div class='team-card-stats'>" + statChips.map(chip => "<span class='team-stat " + chip[0] + "'>" + chip[1] + " <b>" + chip[2] + "</b></span>").join("") + "</div>" : "";
      const locked = Boolean(team.locked);
      const statusText = locked ? "正式队伍 · 已锁定" : (state.config?.teamConfirmOpen ? "正式确认已开启 · 等待队长提交" : "预组队中 · 可继续招募");
      const owner = team.ownerId ? "<span>队长 <b>" + esc(team.ownerId) + "</b></span>" : "";
      return "<article class='team-card-admin" + (locked ? " is-locked" : "") + "'><header class='team-card-head'><strong class='team-card-name'>" + esc(team.project || team.id) + "</strong><span class='team-card-count'>" + teamMembers.length + " / 5 人</span></header><div class='team-card-meta'><span>队伍码 <b>" + esc(team.code) + "</b></span><span>编号 <b>" + esc(team.id) + "</b></span>" + owner + "</div><p class='team-card-status'><i class='status-dot-mark'></i>" + statusText + "</p>" + stats + "<ul class='team-member-list'>" + members + "</ul><button class='outline-button admin-team-lock' data-id='" + esc(team.id) + "' data-locked='" + String(!locked) + "'>" + (locked ? "解除正式锁定" : (state.config?.teamConfirmOpen ? "管理员锁定队伍" : "预览锁定（确认开启后生效）")) + "</button></article>";
    }).join("") || "<p class='empty-state'>暂无队伍</p>");
    if(board){
      board.querySelectorAll("button.team-member-name").forEach(el => el.onclick = () => openDetail(el.dataset.view));
      board.querySelectorAll(".admin-team-lock").forEach(button => button.onclick = async () => {
        try {
          await api.request("/api/admin/teams/" + encodeURIComponent(button.dataset.id), { method: "PATCH", body: JSON.stringify({ locked: button.dataset.locked === "true" }) });
          toast("队伍状态已更新", "success"); await load();
        } catch (error) { toast(error.message, "error"); }
      });
    }
  }

  function renderIdeas() {
    const ideas = state.ideas || [];
    const total = document.getElementById("idea-total");
    if (total) total.textContent = ideas.length + " 条创意";
    setHtml("admin-idea-list", ideas.map(idea => {
      const open = idea.status === "open";
      const needs = (idea.needs || []).map(need => "<span class='idea-need'>" + esc(need) + "</span>").join("");
      return "<article class='idea-card" + (open ? "" : " is-closed") + "'><p class='idea-card-status'><i class='status-dot-mark'></i>" + (open ? "公开中" : "已关闭") + "<span class='idea-card-theme'>" + esc(idea.theme) + "</span></p><h3>" + esc(idea.title) + "</h3><p class='idea-summary'>" + esc(idea.summary) + "</p><div class='idea-needs'><small>寻找</small>" + (needs || "<span class='idea-need is-empty'>未填写</span>") + "</div><button class='outline-button admin-idea-status' data-id='" + esc(idea.id) + "' data-status='" + (open ? "closed" : "open") + "'>" + (open ? "关闭 Idea" : "重新公开") + "</button></article>";
    }).join("") || "<p class='empty-state'>暂无 Idea</p>");
    document.querySelectorAll(".admin-idea-status").forEach(button => button.onclick = async () => {
      try {
        await api.request("/api/admin/ideas/" + encodeURIComponent(button.dataset.id), { method: "PATCH", body: JSON.stringify({ status: button.dataset.status }) });
        toast("Idea 状态已更新", "success"); await load();
      } catch (error) { toast(error.message, "error"); }
    });
  }

  function renderProjects() {
    const projects = state.projects || [];
    const total = document.getElementById("project-total"); if (total) total.textContent = projects.length + " 个项目";
    setHtml("projects-table", projects.map(project => "<tr><td><strong>" + esc(project.projectName) + "</strong><br><small>" + esc(project.tagline) + "</small></td><td>" + esc(project.teamId) + "</td><td>" + esc(project.theme) + "</td><td>" + (project.demoUrl ? "<a class='dark-link' target='_blank' rel='noreferrer' href='" + esc(project.demoUrl) + "'>打开 ↗</a>" : "—") + "</td><td><span class='status " + (project.status === "published" ? "status-accepted" : "status-pending") + "'>" + (project.status === "published" ? "已发布" : "草稿待审核") + "</span></td><td><button class='outline-button project-status' data-id='" + esc(project.id) + "' data-status='" + (project.status === "published" ? "draft" : "published") + "'>" + (project.status === "published" ? "撤回发布" : "发布到 Gallery") + "</button></td></tr>").join("") || "<tr><td colspan='6'><div class='empty-state'>暂无项目</div></td></tr>");
    document.querySelectorAll(".project-status").forEach(button => button.onclick = async () => {
      try {
        await api.request("/api/admin/projects", { method: "PATCH", body: JSON.stringify({ id: button.dataset.id, status: button.dataset.status }) });
        toast(button.dataset.status === "published" ? "项目已发布到 Gallery" : "项目已撤回", "success"); await load();
      } catch (error) { toast(error.message, "error"); }
    });
  }

  function renderVoting() {
    const results = state.results || [], awards = state.awards || [];
    const participantVotes = new Set((state.votes || []).filter(vote => vote.role === "participant").map(vote => vote.voterId)).size;
    const juryVotes = new Set((state.votes || []).filter(vote => vote.role === "jury").map(vote => vote.voterId)).size;
    setHtml("vote-summary", "<div class='vote-leader'><span>投票状态</span><strong>" + (state.config?.voteOpen ? "开放中" : "未开放") + "</strong><p>参与者 " + participantVotes + " 人 · Jury " + juryVotes + " 人</p></div><div class='vote-list'><div class='vote-row'><strong>参与者权重</strong><span class='vote-meter'><i style='width:" + Number(state.config?.participantWeight || 0) + "%'></i></span><b>" + Number(state.config?.participantWeight || 0) + "%</b></div><div class='vote-row'><strong>Jury 权重</strong><span class='vote-meter'><i style='width:" + Number(state.config?.juryWeight || 0) + "%'></i></span><b>" + Number(state.config?.juryWeight || 0) + "%</b></div></div>");
    setHtml("vote-results", awards.map(award => "<div class='vote-row'><strong>" + esc(award.award) + "</strong><span>" + esc(award.projectName || award.projectId) + " · " + esc(award.teamId || "") + "</span><b>" + Number(award.weighted || 0).toFixed(1) + "</b></div>").join("") || (results.length ? "<p class='empty-state'>已有投票，正在计算获奖项目。</p>" : "<p class='empty-state'>暂无已提交投票</p>"));
    // 投票人名单：统一按「报名编号 · 姓名」区分投票人（Jury 单独标注）。
    const voteRows = [...(state.votes || [])].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))).map(vote => {
      const jury = vote.role === "jury";
      const known = (state.applications || []).find(a => a.id === vote.voterId);
      const code = vote.voterCode || (known ? known.id : "");
      const name = known ? known.name : "";
      const label = jury ? "Jury 评审" : code ? (name ? code + " · " + name : code) : (vote.voterId || "未知投票人");
      return "<div class='vote-voter'><span class='vote-voter-role" + (jury ? " is-jury" : "") + "'>" + (jury ? "JURY" : "参与者") + "</span><strong>" + esc(label) + "</strong><small>" + (jury ? esc((vote.selections || []).length + " 个奖项") : name ? "已报名" : "未匹配到报名编号") + "</small><time>" + esc(fmt(vote.createdAt)) + "</time></div>";
    }).join("");
    setHtml("vote-voters", voteRows ? voteRows : "<p class='empty-state'>暂无投票记录</p>");
  }

  const NOTICE_TYPE_LABEL = { "资料复核": "资料复核", "问答": "问答回复", "项目审核": "项目审核", event: "活动公告", application: "报名进度", roadshow: "路演报名" };
  const noticeType = value => NOTICE_TYPE_LABEL[String(value || "").trim()] || String(value || "").trim() || "通知";
  const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
  /** 收件人展示：新数据用服务端算好的 recipientLabel，老数据在客户端兜底拼一次。 */
  function noticeRecipient(notice) {
    if (notice?.recipientLabel) return { all: Boolean(notice.broadcast), label: notice.recipientLabel };
    const target = String(notice?.target || "ALL");
    if (target === "ALL" || !target) return { all: true, label: "所有人（所有报名者）" };
    const person = (state.applications || []).find(x => x.id === target);
    return { all: false, label: "指定报名者：" + [person?.name, target].filter(Boolean).join(" · ") };
  }
  /**
   * 已发布通知卡片：标题、发给谁、已读进度。
   * 已读数据来自服务端 adminNoticeView（readBy 是实时落库的），
   * 每 15 秒全量刷新一次，所以选手标为已读后这里会跟着变。
   */
  function noticeItemHtml(notice) {
    const to = noticeRecipient(notice);
    const recipients = Number.isFinite(notice.recipientCount) ? notice.recipientCount : (state.applications || []).length;
    const readers = Number.isFinite(notice.readCount) ? notice.readCount : (notice.readBy || []).length;
    const updated = notice.updatedAt && notice.updatedAt !== notice.createdAt ? "<small class='notice-edited'>内容更新于 " + esc(fmt(notice.updatedAt)) + "</small>" : "";
    return "<article class='admin-notice-item " + (to.all ? "is-broadcast" : "is-direct") + "'>" +
      "<div class='notice-meta'><span>" + esc(notice.typeLabel || noticeType(notice.type)) + "</span><time>" + esc(fmt(notice.createdAt)) + "</time></div>" +
      "<h3>" + esc(notice.title) + "</h3>" +
      "<div class='notice-recipient'><b>发给谁</b><span>" + esc(to.label) + "</span></div>" +
      "<p>" + esc(notice.body) + "</p>" +
      "<div class='notice-read' title='选手打开通知中心后会立即标记为已读'>" +
        "<span class='notice-read-bar'><i style='width:" + pct(readers, recipients) + "%'></i></span>" +
        "<b>已读 " + readers + " / " + recipients + " 人</b>" +
        "<em>" + pct(readers, recipients) + "%</em>" +
      "</div>" +
      updated + "</article>";
  }
  function renderNotices() {
    // 先把「发送对象」下拉按最新报名列表重建，再用草稿回填，避免自动刷新清掉已选收件人。
    const select = document.getElementById("notice-target");
    if (select) select.innerHTML = "<option value='ALL'>所有人（所有报名者）</option>" + (state.applications || []).map(x => "<option value='" + esc(x.id) + "'>" + esc(x.name) + " · " + esc(x.id) + "</option>").join("");
    preserveForm(document.getElementById("notice-form"), draftOf("notice"));
    setHtml("admin-notice-list", (state.notices || []).slice(0, 12).map(noticeItemHtml).join("") || "<p class='empty-state'>暂无通知</p>");
    const total = document.getElementById("notice-total"); if (total) total.textContent = (state.notices || []).length + " 条";
  }

  function renderConfig() {
    const box = document.getElementById("config-editor"); if (!box) return;
    const c = state.config || {};
    const pack = JSON.stringify(c.starterPack || {}, null, 2);
    box.innerHTML = "<div class='admin-card-head'><h2>活动配置</h2><span id='config-form-state'>保存后官网实时生效</span></div><form class='field-grid'><label>活动名称<input name='eventName' value='" + esc(c.eventName) + "'></label><label>活动日期<input name='date' value='" + esc(c.date) + "'></label><label>活动地点<input name='venue' value='" + esc(c.venue) + "'></label><label>主题揭晓<input name='themeReveal' value='" + esc(c.themeReveal) + "'></label><label>报名截止" + timeInput("applicationDeadline", "报名截止", c.applicationDeadline) + "</label><label>录取公布" + timeInput("resultDate", "录取公布", c.resultDate) + "</label><label>投票开始时间" + timeInput("voteStartAt", "投票开始时间", c.voteStartAt) + "</label><label>报名状态<select name='applicationOpen'><option value='true'>开放</option><option value='false'>关闭</option></select></label><label>正式组队确认<select name='teamConfirmOpen'><option value='true'>开启</option><option value='false'>关闭</option></select></label><label>投票状态<select name='voteOpen'><option value='true'>开放</option><option value='false'>关闭</option></select></label><label>参与者投票权重（%）<input name='participantWeight' type='number' min='0' max='100' value='" + Number(c.participantWeight || 60) + "'></label><label>Jury 投票权重（%）<input name='juryWeight' type='number' min='0' max='100' value='" + Number(c.juryWeight || 40) + "'></label><label class='config-pack'>Starter Pack（JSON）<textarea name='starterPack' rows='10'>" + esc(pack) + "</textarea></label><div class='config-actions'><button class='button button-dark'>保存配置</button></div></form>";
    box.querySelector('[name="applicationOpen"]').value = String(c.applicationOpen);
    box.querySelector('[name="teamConfirmOpen"]').value = String(Boolean(c.teamConfirmOpen));
    box.querySelector('[name="voteOpen"]').value = String(c.voteOpen);
    // 重建后把未保存的草稿放回，自动刷新不会清掉正在改的配置。
    preserveForm(box.querySelector("form"), draftOf("config"));
    bindDraft("config", box.querySelector("form"), "config-form-state");
    if (draftOf("config")?.size) {
      const stateEl = document.getElementById("config-form-state");
      if (stateEl) stateEl.textContent = "你有未保存的修改：自动刷新会保留它们。";
    }
    box.querySelector("form").onsubmit = async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.currentTarget));
      d.applicationOpen = d.applicationOpen === "true"; d.teamConfirmOpen = d.teamConfirmOpen === "true"; d.voteOpen = d.voteOpen === "true";
      d.participantWeight = Number(d.participantWeight); d.juryWeight = Number(d.juryWeight);
      for (const key of ["applicationDeadline", "resultDate", "voteStartAt"]) {
        const parsed = joinTime(d[key + "Date"], d[key + "Hour"], d[key + "Minute"]);
        if (parsed === undefined) return toast("日期格式不正确，请重新选择。", "error");
        d[key] = parsed;
        delete d[key + "Date"]; delete d[key + "Hour"]; delete d[key + "Minute"];
      }
      if (d.participantWeight + d.juryWeight !== 100) return toast("参与者与 Jury 权重之和必须为 100%。", "error");
      try { d.starterPack = JSON.parse(d.starterPack); } catch { return toast("Starter Pack 必须是有效的 JSON。", "error"); }
      try {
        await api.request("/api/admin/config", { method: "PATCH", body: JSON.stringify(d) });
        if (formDrafts.get("config")) formDrafts.get("config").draft = null;
        toast("配置已保存，官网已同步", "success");
        await load();
      } catch (err) { toast(err.message, "error"); }
    };
  }

  function splitStageLines(value) {
    return String(value || "").split(/\r?\n|,/).map(item => item.trim()).filter(Boolean).slice(0, 20);
  }

  function stageBriefContext() {
    const stage = window.MinicampStage;
    const configured = state.config?.stageSchedule;
    const schedule = configured && typeof configured === "object"
      ? JSON.parse(JSON.stringify(configured))
      : stage?.getSchedule?.();
    if (!schedule) return { stage, schedule: null, day: "day1", index: 0, item: null };
    const stageState = stage?.getState?.() || { day: "day1", index: 0 };
    const day = Array.isArray(schedule[stageState.day]) ? stageState.day : "day1";
    const list = schedule[day] || [];
    const index = Math.min(Math.max(list.length - 1, 0), Math.max(0, Number(stageState.index) || 0));
    return { stage, schedule, day, index, item: list[index] };
  }

  function renderStageBriefEditor() {
    const form = document.getElementById("stage-brief-form");
    if (!form || !state) return;
    bindDraft("stage-brief", form, "stage-brief-state");
    const context = stageBriefContext();
    if (!context.item) return;
    const script = form.elements.script;
    const actions = form.elements.actions;
    const draft = draftOf("stage-brief");
    // 有未保存的草稿就不覆盖输入框；没有草稿时按最新数据回填（正在输入的字段除外）。
    if (draft?.size) {
      preserveForm(form, draft);
    } else {
      if (document.activeElement !== script) script.value = context.item.script || "";
      if (document.activeElement !== actions) actions.value = (context.item.actions || []).join("\n");
    }
    form.onsubmit = async event => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget));
      const next = JSON.parse(JSON.stringify(context.schedule));
      const target = next[context.day][context.index];
      target.script = String(data.script || "").trim();
      target.actions = splitStageLines(data.actions);
      try {
        await api.request("/api/admin/config", { method: "PATCH", body: JSON.stringify({ stageSchedule: next }) });
        state.config.stageSchedule = next;
        context.stage?.setSchedule?.(next);
        if (formDrafts.get("stage-brief")) formDrafts.get("stage-brief").draft = null;
        toast("主持人提示和现场动作已保存", "success");
        await load();
      } catch (error) { toast(error.message, "error"); }
    };
  }

  function exportCsv() {
    const cols = [["报名类型", a => (a.registration_type || "contestant") === "roadshow" ? "路演报名" : "参赛报名"], ["报名编号", "id"], ["姓名", "name"], ["学号", "studentId"], ["学院", "college"], ["专业", "major"], ["年级", "grade"], ["手机号", "phone"], ["邮箱", "email"], ["能力标签", a => (a.skills || []).join(" / ")], ["参与动机", "motivation"], ["经历", "experience"], ["作品集", "portfolio"], ["能帮助", "canHelpWith"], ["想探索", "explore"], ["找我聊", "askMeAbout"], ["状态", "status"], ["提交时间", a => fmt(a.createdAt)]];
    const cell = v => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
    const head = cols.map(c => cell(c[0])).join(",");
    const rows = (state.applications || []).map(a => cols.map(c => cell(typeof c[1] === "function" ? c[1](a) : a[c[1]])).join(","));
    const csv = "\uFEFF" + [head, ...rows].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "minicamp-报名名单-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    toast("已导出 " + (state.applications || []).length + " 条报名", "success");
  }

  document.getElementById("applicant-search")?.addEventListener("input", applyFilters);
  document.getElementById("applicant-status")?.addEventListener("change", applyFilters);
  document.getElementById("applicant-type")?.addEventListener("change", () => { applyFilters(); renderCategoryChart(); });
  document.querySelectorAll("#category-switch [data-category]").forEach(button => button.onclick = () => { categoryKey = button.dataset.category; categoryPicked = true; renderCategoryChart(); });
  // 多条件筛选：勾选取值 / 添加 / 清空 / 切换统计范围
  document.getElementById("filter-add")?.addEventListener("click", addFilterChip);
  document.getElementById("filter-dimension")?.addEventListener("change", renderFilterBuilder);
  document.getElementById("filter-value")?.addEventListener("change", () => {
    stagedValues = checkedFilterValues();
    updateFilterValueHint();
  });
  document.getElementById("filter-clear")?.addEventListener("click", () => { filterState.chips = []; filterState.active = false; stagedValues = []; saveFilterSettings(); render(); });
  document.querySelectorAll("#overview-scope [data-scope]").forEach(button => button.onclick = () => {
    if (!filterState.chips.length) { toast("先添加一个筛选条件"); return; }
    filterState.active = button.dataset.scope === "filtered";
    saveFilterSettings();
    render();
  });
  document.getElementById("export-csv")?.addEventListener("click", exportCsv);
  document.getElementById("refresh-data")?.addEventListener("click", () => { load({ keepDrafts: false }); toast("已刷新"); });

  // ---- 轮询刷新：报名 / 队伍 / Idea / Q&A 等后台数据每 15 秒同步一次 ----
  // 间隔固定为 15 秒（不再提供开关与间隔选择）；轮询只更新内容，
  // 通过 MinicampScroll.lock 保持窗口显示位置不变。
  const POLL_INTERVAL_MS = 15000;
  const pollState = { timer: 0, syncing: false };
  const pollTime = document.getElementById("admin-poll-time");
  const pollBox = document.getElementById("admin-sync");

  /** 有输入焦点时暂停覆盖式刷新（登录框也算）。 */
  function isTyping() {
    const active = document.activeElement;
    if (!active) return false;
    const tag = active.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    return Boolean(active.isContentEditable);
  }
  function markSynced(reason) {
    if (!pollTime) return;
    pollTime.textContent = "已同步 " + new Date().toLocaleTimeString("zh-CN", { hour12: false }) + (reason === "poll" ? "（自动）" : "");
  }
  /** 未登录 / 登录过期都算需要重新登录：把登录卡片放回来。 */
  function needsLogin(error) {
    if (!api.getAdminToken()) return true;
    const message = String(error?.message || "");
    return /admin required|login required|invalid admin/i.test(message);
  }
  /** 拉取后台数据；withQa 时同时刷新 Q&A 面板（qa-admin.js 提供）。 */
  async function sync({ withQa = false, reason = "poll", notify = true, automatic = false } = {}) {
    if (pollState.syncing) return false;
    // 用户正在输入时跳过自动刷新（轮询与「切回标签页」），手动点按钮的刷新不受影响。
    if (isTyping() && (reason === "poll" || automatic)) return false;
    if (!api.getAdminToken()) { showLogin(); return false; }
    pollState.syncing = true;
    pollBox?.classList.add("is-syncing");
    const guard = reason !== "poll";
    const scroll = window.MinicampScroll;
    try {
      state = await api.request("/api/admin/summary");
      document.getElementById("admin-login")?.remove();
      // 数据驱动的内容一次性重绘，期间锁住滚动位置，刷新完仍停在原来的地方。
      if (scroll) scroll.lock(() => render(), { guard }); else render();
      // Q&A 面板是异步重绘（先清空、拿到数据再填回来），整段过程都盯住位置，别让文档变矮把页面夹到顶部。
      if (withQa) {
        const reload = window.MinicampQAAdmin?.reload;
        if (reload) { if (scroll) await scroll.lockUntil(() => reload(), { guard }); else await reload(); }
      }
      markSynced(reason);
      return true;
    } catch (error) {
      // 登录失效要重新显示登录卡片，其它错误只提示，避免页面变成一片空白。
      if (needsLogin(error)) showLogin();
      else if (reason === "manual" && notify) toast(error.message, "error");
      return false;
    } finally {
      pollState.syncing = false;
      pollBox?.classList.remove("is-syncing");
    }
  }
  function stopPolling() {
    if (pollState.timer) clearInterval(pollState.timer);
    pollState.timer = 0;
  }
  function startPolling() {
    stopPolling();
    pollState.timer = setInterval(() => { if (!document.hidden) sync({ withQa: true, reason: "poll" }); }, POLL_INTERVAL_MS);
  }
  readFilterSettings();
  renderFilterDimensions();
  startPolling();
  // 通知表单：改动后记住草稿，自动刷新会保留它（见 preserveForm）。
  bindDraft("notice", document.getElementById("notice-form"), "notice-form-state");
  document.addEventListener("visibilitychange", () => { if (!document.hidden) load({ automatic: true }); });
  document.getElementById("notice-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const form = e.currentTarget;
    const d = Object.fromEntries(new FormData(form));
    try {
      await api.request("/api/admin/notices", { method: "POST", body: JSON.stringify(d) });
      form.reset();
      if (formDrafts.get("notice")) formDrafts.get("notice").draft = null;
      toast("通知已发布", "success");
      await load();
    } catch (err) { toast(err.message, "error"); }
  });

  function activate(panel) {
    document.querySelectorAll(".admin-nav button").forEach(x => x.classList.toggle("active", x.dataset.panel === panel));
    document.querySelectorAll(".admin-panel").forEach(x => x.classList.toggle("active", x.id === "panel-" + panel));
    const meta = PANEL_META[panel];
    if (meta) { const title = document.getElementById("admin-title"), sub = document.getElementById("admin-subtitle"); if (title) title.textContent = meta[0]; if (sub) sub.textContent = meta[1]; }
  }
  document.querySelectorAll(".admin-nav button").forEach(b => b.onclick = () => activate(b.dataset.panel));
  document.querySelectorAll("[data-switch]").forEach(b => b.onclick = () => activate(b.dataset.switch));

  window.MinicampStage?.subscribe(() => { if (state) renderStageBriefEditor(); });
  // 其它后台脚本（例如 qa-admin.js）需要读取当前后台数据用于展示。
  window.MinicampAdmin = { getState: () => state, reload: load };
  load();
})();
