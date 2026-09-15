/*
 * MinicampUI —— 站内统一的通知与确认模块。
 *
 * 用途：替代 window.confirm / window.alert，并统一各页面零散的 toast 实现。
 * 用法：
 *   MinicampUI.toast("已保存", {tone: "success"});                    // 轻提示，不打断操作
 *   const ok = await MinicampUI.confirm({title: "离开队伍？", body: "…", tone: "danger"});
 *   await MinicampUI.alert({title: "无法提交", body: "…", tone: "error"});
 *
 * 约定：
 *   - confirm 返回 Promise<boolean>；Esc、点击遮罩、点“取消”都返回 false。
 *   - alert 返回 Promise<void>；只有一个确认按钮。
 *   - 所有文案都用 textContent 写入，调用方不需要转义，也不能注入 HTML。
 *   - tone 取值：info（默认）、success、error、danger（danger 用于不可恢复操作）。
 */
window.MinicampUI = (() => {
  const TOAST_TONE = {info: "", success: "is-success", error: "is-error", danger: "is-error"};
  const DIALOG_TONE = {info: "", success: "is-success", error: "is-error", danger: "is-danger"};
  let toastHost = null;

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

    const dialog = document.createElement("dialog");
    dialog.className = "ui-dialog " + (DIALOG_TONE[tone] || "");
    dialog.setAttribute("aria-labelledby", titleId);
    const title = document.createElement("h3");
    title.className = "ui-dialog-title";
    title.id = titleId;
    title.textContent = settings.title || "";
    const actions = document.createElement("div");
    actions.className = "ui-dialog-actions";
    const confirmButton = document.createElement("button");
    confirmButton.type = "button";
    confirmButton.className = "button " + (tone === "danger" ? "button-danger" : "button-primary");
    confirmButton.textContent = settings.confirmText || (cancellable ? "确定" : "知道了");
    confirmButton.dataset.uiConfirm = "";
    actions.appendChild(confirmButton);
    let cancelButton = null;
    if (cancellable) {
      cancelButton = document.createElement("button");
      cancelButton.type = "button";
      cancelButton.className = "button button-quiet";
      cancelButton.textContent = settings.cancelText || "取消";
      cancelButton.dataset.uiCancel = "";
      actions.insertBefore(cancelButton, confirmButton);
    }
    const card = document.createElement("div");
    card.className = "ui-dialog-card";
    if (kicker) {
      const kickerEl = document.createElement("p");
      kickerEl.className = "section-kicker";
      kickerEl.textContent = kicker;
      card.appendChild(kickerEl);
    }
    card.appendChild(title);
    if (settings.body) {
      const body = document.createElement("p");
      body.className = "ui-dialog-body";
      body.id = bodyId;
      body.textContent = settings.body;
      card.appendChild(body);
      dialog.setAttribute("aria-describedby", bodyId);
    }
    card.appendChild(actions);
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
    confirmButton.addEventListener("click", () => finish(true));
    cancelButton?.addEventListener("click", () => finish(false));
    dialog.addEventListener("cancel", event => { event.preventDefault(); finish(false); });   // Esc 键
    dialog.addEventListener("close", () => finish(false));
    dialog.addEventListener("click", event => { if (event.target === dialog) finish(false); });

    document.body.appendChild(dialog);
    dialog.showModal();
    (tone === "danger" && cancelButton ? cancelButton : confirmButton).focus();
  });

  const confirm = options => ask({...(typeof options === "string" ? {title: options} : options), cancellable: true}).then(Boolean);
  const alert = options => ask({...(typeof options === "string" ? {title: options} : options), cancellable: false}).then(() => undefined);

  return {toast, confirm, alert};
})();
