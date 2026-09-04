(() => {
  const api = window.MinicampAPI;
  const form = document.getElementById("project-form");
  const fields = document.getElementById("member-fields");
  const error = document.getElementById("project-error");
  const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));

  async function init() {
    try {
      const profile = await api.requireProfile("submission.html");
      if (!profile) return;
      const { participant, team } = profile;
      document.querySelector("main")?.removeAttribute("hidden");
      if (!team) {
        error.textContent = "请先在组队工作区创建或加入队伍。";
        form.querySelector("button[type='submit']").disabled = true;
        return;
      }
      fields.innerHTML = "<fieldset><legend>成员分工</legend>" + team.members.map(member =>
        "<label>" + escapeHtml(member.name) + "<input data-member-role data-member-name='" + escapeHtml(member.name) + "' placeholder='例如：产品 / 开发'></label>"
      ).join("") + "</fieldset>";
      form.dataset.teamId = team.id;
      form.dataset.participantId = participant.id;
    } catch {
      location.href = "profile.html";
    }
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const data = new FormData(form);
    const members = [...form.querySelectorAll("[data-member-role]")].map(input => ({
      name: input.dataset.memberName,
      role: input.value.trim()
    }));
    const payload = Object.fromEntries(data.entries());
    payload.members = members;
    payload.aiTools = String(data.get("aiTools") || "").split(",").map(item => item.trim()).filter(Boolean);
    error.textContent = "";
    const submit = form.querySelector("button[type='submit']");
    submit.disabled = true;
    try {
      await api.request("/api/projects", { method: "POST", body: JSON.stringify(payload) });
      form.innerHTML = "<div class='form-success'><span class='success-mark'>✓</span><p class='section-kicker'>PROJECT SAVED</p><h3>项目草稿已提交。</h3><p>主办方审核并发布后，项目会显示在 Gallery 中。</p><a class='button button-dark' href='gallery.html'>查看 Project Gallery</a></div>";
    } catch (err) {
      error.textContent = err.message;
      submit.disabled = false;
    }
  });

  init();
})();
