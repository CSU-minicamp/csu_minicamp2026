/*
 * index.js —— MiniCamp 欢迎页（站点首页 index.html）脚本。
 *
 * 只做一件事：读取 `data/editions.json`，渲染
 *   1) 「选择届次」卡片（editions[]）
 *   2) 「历届作品」卡片 + 届次筛选（works[]）
 *
 * 字段含义与填写约定见 `data/README.md`。这里的原则是「数据缺失不炸页面」：
 * 读取失败只在对应区块显示一段提示，其余静态内容照常可用。
 *
 * 命名说明：本文件是站点首页的脚本，所以随页面叫 index.js。
 * 注意与 2026info.js 区分：2026info.js 是 2026 赛事信息页（2026info.html）的脚本，
 * 负责报名表单与进站通知弹窗（详见 2026info.js 顶部注释），两者互不依赖。
 */
(() => {
  const DATA_URL = "data/editions.json";

  const editionGrid = document.getElementById("edition-grid");
  const editionsStatus = document.getElementById("editions-status");
  const worksGrid = document.getElementById("works-grid");
  const worksFilter = document.getElementById("works-filter");
  const worksCount = document.getElementById("works-count");
  const worksHint = document.getElementById("works-hint");
  const footerUpdated = document.getElementById("footer-updated");
  if (!editionGrid && !worksGrid) return;

  /** 转义后再拼 HTML：本文件的数据来自仓库内的 JSON，但仍是「内容」，不能直接当标记写进去。 */
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[character]));

  /** 只允许站内相对路径与 http(s)/mailto，避免 JSON 里写进 javascript: 之类。 */
  const safeHref = value => {
    const href = String(value ?? "").trim();
    if (!href) return "";
    if (/^(https?:\/\/|mailto:)/i.test(href)) return href;
    if (/^[\w.\-]+\.html([#?][\w\-.=&%/]*)?$/i.test(href)) return href;
    if (/^#[\w\-.]+$/.test(href)) return href;
    return "";
  };

  /** 只允许站内相对图片路径，挡掉 data: / 协议外链。 */
  const safeImage = value => {
    const src = String(value ?? "").trim();
    if (!src) return "";
    if (/^[a-z][\w+.-]*:/i.test(src) || src.startsWith("//")) return "";
    return src.replace(/^\.?\//, "");
  };

  const asText = value => String(value ?? "").trim();
  const isPlaceholder = work => work?.placeholder === true;

  const STATUS_DEFAULT_LABEL = {
    current: "本届 · 进行中",
    finished: "本届 · 已结束",
    archived: "往届回顾",
    "coming-soon": "资料整理中",
    past: "往届"
  };
  const STATUS_BADGE_CLASS = {
    current: "is-open",
    // 已结束的届次用强调色徽章（不是绿色「进行中」，也不是灰色的「往届」）。
    finished: "is-archived",
    archived: "is-archived",
    "coming-soon": "is-soon",
    past: "is-soon"
  };

  /* ---------- 届次卡片 ---------- */

  const factsMarkup = facts => {
    const rows = (Array.isArray(facts) ? facts : [])
      .map(fact => ({ label: asText(fact?.label), value: asText(fact?.value) }))
      .filter(fact => fact.label && fact.value);
    if (!rows.length) return "";
    return `<dl class="edition-card-facts">${rows.map(fact =>
      `<div><dt>${escapeHtml(fact.label)}</dt><dd>${escapeHtml(fact.value)}</dd></div>`
    ).join("")}</dl>`;
  };

  const editionCard = (edition, index) => {
    const year = asText(edition?.year);
    const label = asText(edition?.label) || (year ? year + " 届" : "届次 " + (index + 1));
    const status = STATUS_DEFAULT_LABEL[edition?.status] ? edition.status : "past";
    const badgeText = asText(edition?.statusLabel) || STATUS_DEFAULT_LABEL[status];
    const name = asText(edition?.name);
    const summary = asText(edition?.summary);

    const page = edition?.page && typeof edition.page === "object" ? edition.page : {};
    const pageHref = safeHref(page.href);
    // available 默认 true；显式写 false 时按钮不可点，只留说明文字。
    const pageAvailable = page.available !== false;
    const pageCta = asText(page.cta) || "查看详情";
    const pageNote = asText(page.note);

    const externalUrl = safeHref(edition?.externalUrl);
    const externalMarkup = externalUrl
      ? `<a class="text-link dark-link" href="${escapeHtml(externalUrl)}" target="_blank" rel="noreferrer">站外链接 <span>↗</span></a>`
      : "";
    const pageMarkup = pageHref && pageAvailable
      ? `<a class="button ${status === "current" ? "button-primary" : "button-dark"}" href="${escapeHtml(pageHref)}">${escapeHtml(pageCta)} <span>↗</span></a>`
      : "";
    const unavailableMarkup = pageHref && !pageAvailable
      ? `<p class="edition-card-unavailable">${escapeHtml(pageCta)} · 暂未开放</p>`
      : "";

    return `
      <article class="edition-card${status === "coming-soon" ? " is-soon" : ""}">
        <div class="edition-card-head">
          <span class="edition-card-year">${escapeHtml(year || "—")}</span>
          <span class="edition-badge ${STATUS_BADGE_CLASS[status] || "is-soon"}">${escapeHtml(badgeText)}</span>
        </div>
        <h3>${escapeHtml(name || label)}</h3>
        ${summary ? `<p>${escapeHtml(summary)}</p>` : ""}
        ${factsMarkup(edition?.facts)}
        <div class="edition-card-actions">
          ${pageMarkup}
          ${unavailableMarkup}
          ${externalMarkup}
        </div>
        ${pageNote ? `<p class="edition-card-note">${escapeHtml(pageNote)}</p>` : ""}
      </article>
    `;
  };

  /* ---------- 作品卡片 ---------- */

  const workCard = work => {
    const placeholder = isPlaceholder(work);
    const year = asText(work?.year);
    const title = asText(work?.title) || "作品名称待补充";
    const tagline = asText(work?.tagline);
    const team = asText(work?.team);
    const award = asText(work?.award);
    const note = asText(work?.note);
    const tags = (Array.isArray(work?.tags) ? work.tags : []).map(asText).filter(Boolean);
    const cover = safeImage(work?.cover);
    const links = work?.links && typeof work.links === "object" ? work.links : {};
    const demo = safeHref(links.demo);
    const repo = safeHref(links.repo);
    const detail = safeHref(links.detail);

    const coverMarkup = cover
      ? `<div class="work-cover"><img src="${escapeHtml(cover)}" alt="${escapeHtml(title)} 封面" loading="lazy"></div>`
      : `<div class="work-cover" aria-hidden="true"><span class="work-cover-mark">${placeholder ? "TO BE ADDED" : "NO COVER"}</span></div>`;

    const metaMarkup = [
      team ? `<span>${escapeHtml(team)}</span>` : "",
      ...tags.map(tag => `<span>${escapeHtml(tag)}</span>`)
    ].filter(Boolean).join("");

    const actions = [
      detail ? `<a href="${escapeHtml(detail)}">项目详情 →</a>` : "",
      repo ? `<a href="${escapeHtml(repo)}" target="_blank" rel="noreferrer">代码仓库 ↗</a>` : "",
      demo ? `<a class="button button-dark" href="${escapeHtml(demo)}" target="_blank" rel="noreferrer">体验 Demo <span>↗</span></a>` : ""
    ].filter(Boolean).join("");

    return `
      <article class="work-card${placeholder ? " is-placeholder" : ""}">
        ${coverMarkup}
        <div class="work-head">
          <span class="work-year">${escapeHtml(year ? year + " 届" : "届次待补充")}</span>
          ${award ? `<span class="work-award">${escapeHtml(award)}</span>` : ""}
          ${placeholder ? `<span class="work-placeholder-tag">待补充</span>` : ""}
        </div>
        <h3 class="work-title">${escapeHtml(title)}</h3>
        ${tagline ? `<p class="work-tagline">${escapeHtml(tagline)}</p>` : ""}
        ${metaMarkup ? `<div class="work-meta">${metaMarkup}</div>` : ""}
        ${actions ? `<div class="work-actions">${actions}</div>` : ""}
        ${note ? `<p class="work-note">${escapeHtml(note)}</p>` : ""}
      </article>
    `;
  };

  /* ---------- 渲染 ---------- */

  const renderEditions = editions => {
    if (!editionGrid) return;
    editionGrid.innerHTML = editions.length
      ? editions.map(editionCard).join("")
      : `<p class="works-empty">届次信息待补充（在 <code>data/editions.json</code> 的 <code>editions</code> 里添加）。</p>`;
  };

  /** 届次筛选：按钮来自 editions[] + works 里出现过的年份，按年号从新到旧排列。 */
  const filterYears = (editions, works) => {
    const years = new Set();
    editions.forEach(edition => { const year = asText(edition?.year); if (year) years.add(year); });
    works.forEach(work => { const year = asText(work?.year); if (year) years.add(year); });
    return [...years].sort((a, b) => b.localeCompare(a, "zh-CN", { numeric: true }));
  };

  const renderWorks = (works, editions) => {
    if (!worksGrid) return;
    const years = filterYears(editions, works);
    let active = "all";

    const paint = () => {
      const shown = active === "all" ? works : works.filter(work => asText(work?.year) === active);
      worksGrid.innerHTML = shown.length
        ? shown.map(workCard).join("")
        : `<p class="works-empty">该届次的作品还没有收录，欢迎稍后再来看看。</p>`;
      if (worksCount) {
        const placeholders = shown.filter(isPlaceholder).length;
        const suffix = placeholders === shown.length && shown.length
          ? "（均为待补充占位）"
          : (placeholders ? `（其中 ${placeholders} 条待补充）` : "");
        worksCount.textContent = `共 ${shown.length} 件作品${suffix}`;
      }
      worksFilter?.querySelectorAll("button").forEach(button => {
        button.setAttribute("aria-pressed", String(button.dataset.year === active));
      });
    };

    if (worksFilter) {
      worksFilter.innerHTML = [
        `<button type="button" data-year="all">全部</button>`,
        ...years.map(year => `<button type="button" data-year="${escapeHtml(year)}">${escapeHtml(year)} 届</button>`)
      ].join("");
      worksFilter.addEventListener("click", event => {
        const button = event.target.closest("button[data-year]");
        if (!button) return;
        active = button.dataset.year;
        paint();
      });
    }

    if (worksHint) {
      const placeholders = works.filter(isPlaceholder).length;
      if (placeholders) {
        worksHint.hidden = false;
        worksHint.textContent = "说明：带「待补充」标记的卡片是占位条目，用来演示数据格式。作品资料补齐后，"
          + "把 data/editions.json 里对应条目的 placeholder 去掉、填上真实内容即可；字段说明见 public/data/README.md。";
      } else {
        worksHint.hidden = true;
      }
    }

    paint();
  };

  const renderFailure = message => {
    if (editionsStatus) {
      editionsStatus.classList.add("is-error");
      editionsStatus.textContent = message;
    }
    if (editionGrid) {
      editionGrid.innerHTML = `<p class="works-empty">届次信息暂时无法读取。2026 届详情仍可直接访问 <a href="2026info.html">2026info.html</a>。</p>`;
    }
    if (worksGrid) {
      worksGrid.innerHTML = `<p class="works-empty">历届作品暂时无法读取，请稍后刷新重试。</p>`;
    }
    if (worksCount) worksCount.textContent = "";
  };

  const boot = async () => {
    let data;
    try {
      // no-cache：每次都用条件请求向服务器确认一次，改了 JSON 刷新就能看到（服务器本来就带 no-store）。
      const response = await fetch(DATA_URL, { cache: "no-cache", headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("HTTP " + response.status);
      data = await response.json();
    } catch (error) {
      renderFailure("届次与作品数据读取失败（" + DATA_URL + "）。" + (error?.message || ""));
      return;
    }

    const editions = Array.isArray(data?.editions) ? data.editions.filter(Boolean) : [];
    const works = Array.isArray(data?.works) ? data.works.filter(Boolean) : [];

    renderEditions(editions);
    renderWorks(works, editions);

    const updatedAt = asText(data?.meta?.updatedAt);
    if (footerUpdated && updatedAt) footerUpdated.textContent = "资料更新 " + updatedAt;
  };

  boot().catch(error => renderFailure("页面数据渲染出错：" + (error?.message || "")));
})();
