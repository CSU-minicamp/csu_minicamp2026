(() => {
  const root = document.getElementById("participant-fab-root");
  const api = window.MinicampAPI;
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));
  if (!root || !api || ["profile", "profile-dashboard", "admin"].includes(document.body.dataset.page)) return;
  const render = ({ participant } = {}) => {
    if (participant) {
      const name = participant.name || "参与者", id = participant.id || "已报名";
      root.innerHTML = `<button class="participant-fab participant-fab-joined" type="button" aria-expanded="false" aria-controls="participant-fab-panel"><span class="participant-fab-mark">${escapeHtml(String(name).slice(0, 1))}</span><span class="participant-fab-label">${escapeHtml(id)}</span></button><section class="participant-fab-panel" id="participant-fab-panel" hidden><p class="section-kicker">MY APPLICATION</p><h3>${escapeHtml(name)} <small>${escapeHtml(id)}</small></h3><p>${escapeHtml(participant.college)}${participant.major ? " · " + escapeHtml(participant.major) : ""}</p><div class="participant-fab-actions"><a class="button button-dark" href="profile.html">查看并修改资料 <span>↗</span></a></div></section>`;
    } else {
      const href = document.body.dataset.page === "home" ? "#apply" : "index.html#apply";
      root.innerHTML = `<a class="participant-fab" href="${href}"><span class="participant-fab-mark">＋</span><span class="participant-fab-label">立即报名</span></a>`;
    }
    const button = root.querySelector(".participant-fab-joined"), panel = root.querySelector(".participant-fab-panel");
    button?.addEventListener("click", () => { const open = panel.hidden; panel.hidden = !open; button.setAttribute("aria-expanded", String(open)); });
  };
  render();
  if (api.getToken() || api.isLocalPreview()) api.request("/api/me").then(render).catch(() => {});
})();
