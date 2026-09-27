(() => {
  const api = window.MinicampAPI;
  const list = document.querySelector(".award-list");
  if (!list || !api) return;

  const labels = {
    "Best Overall": "全场最佳",
    "Best Product": "最佳产品",
    "Best Design": "最佳设计与体验",
    "Best Technical": "最佳技术 Hack",
    "Most Unexpected": "最出乎意料",
    "People's Choice": "现场人气奖"
  };

  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
  })[char]);
  let lastSnapshot = "";
  let loading = false;

  function card(item, index) {
    const published = Boolean(item.published || item.status === "published");
    const label = item.awardLabel || labels[item.award] || item.award;
    const winner = item.teamName || "";
    const number = String(index + 1).padStart(2, "0");
    const votes = published
      ? "<small>获奖票数：" + Number(item.votes || 0).toFixed(0) + " 票</small>"
      : "";
    return "<button class='award-card" + (published ? " is-published" : "") +
      "' type='button' data-award-card data-published='" + published +
      "' data-award='" + esc(item.award || "") + "' aria-expanded='" + published + "' aria-label='" + esc(label) + "'>" +
      "<span class='award-card-inner'>" +
      "<span class='award-card-face award-card-front'><span>" + number +
      "</span><strong>" + esc(label) + "</strong><small>" +
      esc(item.award || "AWARD") + "</small><em>" +
      (published ? "点击重播揭晓" : "结果待公布") + "</em></span>" +
      "<span class='award-card-face award-card-back'><span>WINNER / " + number +
      "</span><strong>" + esc(label) + "</strong><b>" +
      esc(winner || "结果待公布") + "</b>" + votes + "</span>" +
      "</span></button>";
  }

  function bind() {
    list.querySelectorAll("[data-award-card]").forEach(button => {
      button.addEventListener("click", () => {
        if (button.dataset.published !== "true") return;
        button.setAttribute("aria-expanded", "true");
        button.classList.remove("is-replaying");
        void button.offsetWidth;
        button.classList.add("is-replaying");
        window.setTimeout(() => button.classList.remove("is-replaying"), 760);
      });
    });
  }

  async function load() {
    if (loading) return;
    loading = true;
    try {
      const data = await api.request("/api/awards");
      const awards = data.awards || [];
      const isInitialLoad = lastSnapshot === "";
      const previousAwards = isInitialLoad ? [] : JSON.parse(lastSnapshot);
      const previouslyPublished = new Set(previousAwards
        .filter(item => item.published || item.status === "published")
        .map(item => item.award));
      const snapshot = JSON.stringify(awards);
      if (snapshot === lastSnapshot) return;
      list.innerHTML = awards.map(card).join("");
      lastSnapshot = snapshot;
      bind();
      const newlyPublished = new Set(isInitialLoad ? [] : awards
        .filter(item => (item.published || item.status === "published") && !previouslyPublished.has(item.award))
        .map(item => item.award));
      list.querySelectorAll("[data-award-card]").forEach(button => {
        if (!newlyPublished.has(button.dataset.award)) return;
        button.classList.add("is-replaying");
        window.setTimeout(() => button.classList.remove("is-replaying"), 760);
      });
    } catch {
      // Keep the last successful result visible during a temporary network error.
    } finally {
      loading = false;
    }
  }

  load();
  window.setInterval(() => {
    if (!document.hidden) load();
  }, 15000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) load();
  });
})();
