(() => {
  const header = document.getElementById("site-header");
  if (!header) return;

  const page = document.body.dataset.page || "home";
  // 有些页面有导航栏，如此只补账户入口和交互，不重建导航，避免覆盖页面自带的链接。
  const hasStaticNav = Boolean(header.querySelector(".site-nav"));

  if (!hasStaticNav) {
    const items = [
      { id: "about", label: "活动介绍", href: "index.html#about", current: ["home", "starter-pack"] },
      { id: "qa", label: "Q&A", href: "qa.html", current: ["qa"] },
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
      </nav>
    `;
  }

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

  // 个人主页入口同时充当登录入口：未登录显示「登录」，登录后显示参与者姓名。
  let profileLink = nav.querySelector('a[href="profile.html"], a[href="profile-dashboard.html"]');
  if (!profileLink) {
    // 静态导航页面没有个人主页链接，这里补一个账户入口。
    profileLink = document.createElement("a");
    profileLink.href = "profile.html";
    profileLink.textContent = "登录";
    nav.appendChild(profileLink);
  }
  const signOut = () => { profileLink.textContent = "登录"; };
  const signIn = participant => {
    const name = String(participant.name || "").trim();
    profileLink.textContent = name ? (name.length > 8 ? name.slice(0, 8) + "…" : name) : "个人主页";
    profileLink.setAttribute("href", "profile-dashboard.html");
    profileLink.classList.add("is-signed-in");
    profileLink.title = name;
  };
  profileLink.classList.add("nav-account");
  if (!window.MinicampAPI?.getToken()) signOut();
  else window.MinicampAPI.request("/api/me").then(({participant}) => {
    const type = participant.registration_type || participant.registrationType || "contestant";
    const pending = participant.status === "待审核";
    signIn(participant);
    if (type === "roadshow") {
      header.querySelectorAll('a[href="team.html"],a[href="gallery.html"],a[href="voting.html"],a[data-voting-entry]').forEach(link => link.remove());
    }
    if (pending) {
      header.querySelectorAll('a[href="gallery.html"],a[href="voting.html"],a[data-voting-entry]').forEach(link => link.remove());
    }
  }).catch(signOut);
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
