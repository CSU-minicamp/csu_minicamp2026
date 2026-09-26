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
      // Gallery 在完成准入条件后显示；上传项目从 Gallery 页面进入。现场投票入口由 app.js 单独控制。
      { id: "gallery", label: "项目 Gallery", href: "gallery.html", current: ["gallery"] },
      // { id: "voting", label: "现场投票", href: "voting.html", current: ["voting", "vote"], voting: true },
      { id: "profile", label: "个人主页", href: "profile.html", current: ["profile", "profile-dashboard"] }
    ];
    const links = items.map(item => {
      const current = item.current.includes(page);
      const attributes = current ? 'aria-current="page"' : "";
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
  const galleryLink = nav.querySelector('a[href="gallery.html"]');
  // Gallery is available only after the participant access checks complete.
  const hideGallery = () => galleryLink?.remove();
  const showGallery = () => {
    if (nav.querySelector('a[href="gallery.html"]')) return;
    const link = document.createElement("a");
    link.href = "gallery.html";
    link.textContent = "项目 Gallery";
    if (page === "gallery") link.setAttribute("aria-current", "page");
    nav.insertBefore(link, nav.querySelector(".nav-account"));
  };
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
  hideGallery();
  if (!window.MinicampAPI?.getToken()) signOut();
  else window.MinicampAPI.request("/api/me").then(({participant, team, localSubmissionBypass}) => {
    const type = participant.registrationType || "contestant";
    signIn(participant);
    // 只有状态为「已录取」的参赛者能进入组队工作区：路演观众与 待审核/待复审/候补/未通过 都不显示入口。
    // 未登录访客仍然保留入口，点击后再走登录流程，由 team.html 自己按状态给出说明。
    if (type !== "contestant" || String(participant.status || "") !== "已录取") header.querySelector('a[href="team.html"]')?.remove();
    const hasTeam = Boolean(team);
    if (localSubmissionBypass || (type === "contestant" && String(participant.status || "") === "已录取" && hasTeam && window.MinicampAPI.isProfileComplete(participant))) showGallery();
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
