/*
 * MinicampUI —— 站内统一的通知、确认与弹窗模板。
 *
 * 用途：替代 window.confirm / window.alert，并统一各页面零散的 toast 实现。
 * 用法：
 *   MinicampUI.toast("已保存", {tone: "success"});                    // 轻提示，不打断操作
 *   const ok = await MinicampUI.confirm({title: "离开队伍？", body: "…", tone: "danger"});
 *   await MinicampUI.alert({title: "无法提交", body: "…", tone: "error"});
 *   // 多个自定义按钮（返回被点按钮的 value，取消 / Esc 返回 null）：
 *   const pick = await MinicampUI.choose({
 *     kicker: "ADMISSION", title: "是否会到场？",
 *     body: ["第一段纯文本", {html: "第二段可以含 <a href='admission.html'>链接</a>"}],
 *     cancelText: "稍后再说",
 *     actions: [{value: "decline", label: "我不会参与", tone: "quiet"}, {value: "attend", label: "我会参与", tone: "primary"}]
 *   });
 *   // 通知中心的超文本正文用同一套消毒规则渲染：
 *   container.innerHTML = MinicampUI.sanitizeHtml(notice.body);
 *
 * 约定：
 *   - confirm 返回 Promise<boolean>；Esc、点击遮罩、点“取消”都返回 false。
 *   - alert 返回 Promise<void>；只有一个确认按钮。
 *   - choose 返回 Promise<value|null>；actions 按数组顺序从左到右渲染（取消按钮在最左），
 *     移动端弹窗是 column-reverse 布局，所以把最重要的按钮放在数组最后。
 *   - body 传数组会渲染成多个段落：字符串按纯文本写入，{html: "…"} 消毒后再写入。
 *   - tone 取值：info（默认）、success、error、danger（danger 用于不可恢复操作）。
 *   - 按钮 tone：primary（默认第一个）、quiet、danger。
 */
window.MinicampUI = (() => {
  const TOAST_TONE = {info: "", success: "is-success", error: "is-error", danger: "is-error"};
  const DIALOG_TONE = {info: "", success: "is-success", error: "is-error", danger: "is-danger"};
  let toastHost = null;
  // 超文本正文的白名单：保留排版与链接标签，其余标签拆掉，属性只留安全的 href / title。
  const RICH_TAGS = new Set(["A", "B", "STRONG", "I", "EM", "U", "S", "BR", "P", "SPAN", "SMALL", "UL", "OL", "LI", "CODE", "PRE", "BLOCKQUOTE", "H3", "H4", "H5", "HR"]);
  const RICH_DROP = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "FORM", "INPUT", "BUTTON", "LINK", "META", "SVG", "MATH"]);
  const SAFE_HREF = /^(https?:\/\/|mailto:|\/|#|\?|[\w.-]+\.html[\w#?=&./%-]*$)/i;

  const hostEl = () => {
    if (!toastHost || !toastHost.isConnected) {
      toastHost = document.createElement("div");
      toastHost.className = "ui-toast-host";
      toastHost.setAttribute("role", "status");
      toastHost.setAttribute("aria-live", "polite");
      document.body.appendChild(toastHost);
    }
    return toastHost;
  };

  /**
   * 清洗主办方填写的超文本：危险标签整个删掉，白名单外的标签拆成内容，
   * 属性只保留 title 与安全的 href（自动补 rel="noreferrer"）。
   * 返回可以安全赋给 innerHTML 的字符串。
   */
  const sanitizeHtml = html => {
    const template = document.createElement("template");
    template.innerHTML = String(html ?? "");
    template.content.querySelectorAll("*").forEach(node => {
      if (RICH_DROP.has(node.tagName)) { node.remove(); return; }
      if (!RICH_TAGS.has(node.tagName)) { node.replaceWith(...node.childNodes); return; }
      [...node.attributes].forEach(attribute => {
        const name = attribute.name.toLowerCase();
        const value = String(attribute.value || "").trim();
        const keepHref = name === "href" && SAFE_HREF.test(value);
        if (name === "title" || keepHref) {
          if (keepHref) node.setAttribute("rel", "noreferrer");
          return;
        }
        node.removeAttribute(attribute.name);
      });
    });
    const host = document.createElement("div");
    host.appendChild(template.content);
    return host.innerHTML;
  };

  const toast = (message, options = {}) => {
    const text = String(message ?? "").trim();
    if (!text || !document.body) return null;
    const item = document.createElement("div");
    item.className = "ui-toast " + (TOAST_TONE[options.tone] || "");
    item.textContent = text;
    hostEl().appendChild(item);
    const show = () => item.classList.add("is-visible");
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(show); else show();
    const timeout = Number.isFinite(options.timeout) ? options.timeout : 2600;
    setTimeout(() => { item.classList.remove("is-visible"); setTimeout(() => item.remove(), 240); }, timeout);
    return item;
  };

  const ask = options => new Promise(resolve => {
    const settings = typeof options === "string" ? {title: options} : (options || {});
    const tone = settings.tone || "info";
    const kicker = settings.kicker || "";
    const cancellable = settings.cancellable !== false;
    const suffix = Math.random().toString(36).slice(2, 8);
    const titleId = "ui-dialog-title-" + suffix, bodyId = "ui-dialog-body-" + suffix;
    // 按钮：默认「取消 + 确定」；传了 actions 就按调用方给的顺序渲染，点了谁就 resolve 谁的 value。
    const custom = Array.isArray(settings.actions) ? settings.actions.filter(Boolean) : [];
    const actions = (custom.length ? custom : [{
      value: true,
      label: settings.confirmText || (cancellable ? "确定" : "知道了"),
      tone: tone === "danger" ? "danger" : "primary"
    }]).map((action, index) => ({
      value: action.value === undefined ? index : action.value,
      label: String(action.label ?? "确定"),
      tone: action.tone || (index === 0 ? "primary" : "quiet")
    }));
    // 正文块：字符串 = 纯文本，{html} = 消毒后的超文本。
    const blocks = (Array.isArray(settings.body) ? settings.body : [settings.body])
      .map(item => (item && typeof item === "object" ? {html: String(item.html ?? "")} : {text: String(item ?? "")}))
      .filter(block => (block.html !== undefined ? block.html : block.text).trim());

    const dialog = document.createElement("dialog");
    dialog.className = "ui-dialog " + (DIALOG_TONE[tone] || "");
    dialog.setAttribute("aria-labelledby", titleId);
    const title = document.createElement("h3");
    title.className = "ui-dialog-title";
    title.id = titleId;
    title.textContent = settings.title || "";
    const actionsRow = document.createElement("div");
    actionsRow.className = "ui-dialog-actions";
    let cancelButton = null;
    if (cancellable) {
      cancelButton = document.createElement("button");
      cancelButton.type = "button";
      cancelButton.className = "button button-quiet";
      cancelButton.textContent = settings.cancelText || "取消";
      cancelButton.dataset.uiCancel = "";
      actionsRow.appendChild(cancelButton);
    }
    const actionButtons = actions.map((action, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button " + (action.tone === "danger" ? "button-danger" : action.tone === "quiet" ? "button-quiet" : "button-primary");
      button.textContent = action.label;
      if (index === actions.length - 1) button.dataset.uiConfirm = "";
      actionsRow.appendChild(button);
      return button;
    });
    const card = document.createElement("div");
    card.className = "ui-dialog-card";
    if (kicker) {
      const kickerEl = document.createElement("p");
      kickerEl.className = "section-kicker";
      kickerEl.textContent = kicker;
      card.appendChild(kickerEl);
    }
    card.appendChild(title);
    blocks.forEach((block, index) => {
      const body = document.createElement("div");
      body.className = "ui-dialog-body";
      if (index === 0) {
        body.id = bodyId;
        dialog.setAttribute("aria-describedby", bodyId);
      }
      if (block.html !== undefined) {
        body.classList.add("rich-text");
        body.innerHTML = sanitizeHtml(block.html);
      } else {
        body.textContent = block.text;
      }
      card.appendChild(body);
    });
    card.appendChild(actionsRow);
    dialog.appendChild(card);

    const previousFocus = document.activeElement;
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      if (dialog.open) dialog.close();
      dialog.remove();
      if (previousFocus && typeof previousFocus.focus === "function" && previousFocus.isConnected) previousFocus.focus();
      resolve(value);
    };
    actionButtons.forEach((button, index) => button.addEventListener("click", () => finish(actions[index].value)));
    cancelButton?.addEventListener("click", () => finish(null));
    dialog.addEventListener("cancel", event => { event.preventDefault(); finish(null); });   // Esc 键
    dialog.addEventListener("close", () => finish(null));
    dialog.addEventListener("click", event => { if (event.target === dialog) finish(null); });

    document.body.appendChild(dialog);
    dialog.showModal();
    const preferred = tone === "danger" && cancelButton ? cancelButton : actionButtons[actionButtons.length - 1];
    // 兜底：环境不支持 focus 时不能让 ask() 的 Promise 变成 rejected。
    if (preferred && typeof preferred.focus === "function") preferred.focus();
  });

  const confirm = options => ask({...(typeof options === "string" ? {title: options} : options), cancellable: true}).then(Boolean);
  const alert = options => ask({...(typeof options === "string" ? {title: options} : options), cancellable: false}).then(() => undefined);
  /** 多按钮选择：resolve 被点按钮的 value；取消 / Esc / 点遮罩 resolve null。 */
  const choose = options => ask(options);

  return {toast, confirm, alert, choose, sanitizeHtml};
})();
