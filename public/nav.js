(() => {
  const header = document.getElementById("site-header");
  if (!header) return;

  const page = document.body.dataset.page || "home";
  const items = [
    { id: "about", label: "活动介绍", href: "index.html#about", current: ["home", "starter-pack"] },
    { id: "team", label: "组队工作区", href: "team.html", current: ["team"] },
    { id: "gallery", label: "项目 Gallery", href: "gallery.html", current: ["gallery", "submission"] },
    { id: "voting", label: "现场投票", href: "voting.html", current: ["voting", "vote"], voting: true },
    { id: "profile", label: "个人主页", href: "profile.html", current: ["profile", "profile-dashboard"] }
  ];

  const links = items.map(item => {
    const current = item.current.includes(page);
    const attributes = [
      item.voting ? "data-voting-entry" : "",
      current ? 'aria-current="page"' : ""
    ].filter(Boolean).join(" ");
    return `<a href="${item.href}" ${attributes}>${item.label}</a>`;
  }).join("");
  const applyHref = page === "home" ? "#apply" : "index.html#apply";

  header.className = "site-header";
  header.innerHTML = `
    <a class="brand" href="index.html" aria-label="返回 minicamp 2026 首页">
      <img class="brand-lockup" src="assets/brand/minicamp-logo-lockup-partners-horizontal.png" alt="minicamp 2026" width="2203" height="614">
    </a>
    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="打开导航">
      <span></span><span></span>
    </button>
    <nav id="site-nav" class="site-nav" aria-label="主导航">
      ${links}
      <a class="button button-small button-dark" href="${applyHref}">立即报名</a>
    </nav>
  `;

  const toggle = header.querySelector(".nav-toggle");
  const nav = header.querySelector(".site-nav");
  const closeMenu = () => {
    nav.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "打开导航");
  };

  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "关闭导航" : "打开导航");
  });
  nav.addEventListener("click", event => {
    if (event.target.closest("a")) closeMenu();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeMenu();
  });

  window.MinicampAPI?.request("/api/config").then(({ config }) => {
    if (config.voteOpen) return;
    header.querySelectorAll("[data-voting-entry]").forEach(link => {
      link.textContent = "投票未开放";
      link.classList.add("is-disabled");
      link.setAttribute("aria-disabled", "true");
      link.addEventListener("click", event => event.preventDefault());
    });
  }).catch(() => {});
})();
