(() => {
  const grid = document.getElementById("gallery-grid");
  if (!grid) return;
  const fallbackNode = document.getElementById("gallery-fallback");
  let fallback = [];
  try { fallback = JSON.parse(fallbackNode?.textContent || "[]"); } catch { fallback = []; }
  const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  const render = projects => {
    grid.innerHTML = projects.map(p => "<article class='project-card'><div class='project-cover'>" + (p.coverUrl ? "<img src='" + escape(p.coverUrl) + "' alt=''>" : "<span>" + escape(p.teamId) + "</span>") + "</div><p class='section-kicker'>" + escape(p.theme) + "</p><h2>" + escape(p.projectName) + "</h2><p class='project-tagline'>" + escape(p.tagline) + "</p><dl><dt>Problem</dt><dd>" + escape(p.problem) + "</dd><dt>Solution</dt><dd>" + escape(p.solution) + "</dd></dl><div class='project-members'>" + (p.members || []).map(m => "<span>" + escape(m.name) + " · " + escape(m.role) + "</span>").join("") + "</div><div class='project-actions'>" + (p.demoUrl ? "<a class='button button-dark' target='_blank' rel='noreferrer' href='" + escape(p.demoUrl) + "'>打开 Demo</a>" : "") + (p.githubUrl ? "<a class='outline-button' target='_blank' rel='noreferrer' href='" + escape(p.githubUrl) + "'>GitHub</a>" : "") + "</div></article>").join("") || "<p>还没有已发布项目。</p>";
  };
  const api = window.MinicampAPI;
  if (!api || typeof api.requireProfile !== "function") return;
  (async () => {
    const profile = await api.requireProfile("gallery.html");
    if (!profile) return;
    document.querySelector("main")?.removeAttribute("hidden");
    try {
      const { projects } = await api.request("/api/projects");
      render(Array.isArray(projects) ? projects : fallback);
    } catch { render(fallback); }
  })();
})();
