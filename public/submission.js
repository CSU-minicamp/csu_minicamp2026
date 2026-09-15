(() => {
  const api = window.MinicampAPI;
  const form = document.getElementById("project-form");
  const fields = document.getElementById("member-fields");
  const error = document.getElementById("project-error");
  const coverFile = document.getElementById("cover-file");
  const coverUrl = form.querySelector("[name=coverUrl]");
  let coverTask = Promise.resolve(true);
  let coverVersion = 0;
  function compressImage(file) { return new Promise((resolve, reject) => { const img = new Image(); const reader = new FileReader(); reader.onload = () => { img.onload = () => { const max = 1600, scale = Math.min(1, max / Math.max(img.width, img.height)); const canvas = document.createElement("canvas"); canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale); canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height); resolve(canvas.toDataURL("image/jpeg", .82)); }; img.onerror = reject; img.src = reader.result; }; reader.onerror = reject; reader.readAsDataURL(file); }); }
  coverFile?.addEventListener("change", () => {
    const file = coverFile.files?.[0], version = ++coverVersion;
    coverUrl.value = "";
    error.textContent = "";
    if (!file) { coverTask = Promise.resolve(true); return; }
    if (file.size > 12 * 1024 * 1024) {
      error.textContent = "图片不能超过 12MB。";
      coverTask = Promise.resolve(false);
      return;
    }
    coverTask = compressImage(file).then(data => {
      if (version !== coverVersion) return false;
      coverUrl.value = data;
      return true;
    }).catch(() => {
      if (version === coverVersion) error.textContent = "图片读取失败，请重新选择。";
      return false;
    });
  });
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
        "<label>" + escapeHtml(member.name) + " <em class='optional-mark'>选填</em><input data-member-role data-member-name='" + escapeHtml(member.name) + "' placeholder='例如：产品 / 开发'></label>"
      ).join("") + "</fieldset>";
      form.dataset.teamId = team.id;
      form.dataset.participantId = participant.id;
    } catch {
      location.href = "profile.html";
    }
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const submit = form.querySelector("button[type='submit']");
    if (submit.disabled) return;
    submit.disabled = true;
    if (coverFile) coverFile.disabled = true;
    try {
      if (!await coverTask) {
        error.textContent = "封面图片未处理成功，请重新选择或清除图片。";
        submit.disabled = false;
        return;
      }
    const data = new FormData(form);
    const members = [...form.querySelectorAll("[data-member-role]")].map(input => ({
      name: input.dataset.memberName,
      role: input.value.trim()
    }));
    const payload = Object.fromEntries(data.entries());
    payload.members = members;
    payload.aiTools = String(data.get("aiTools") || "").split(",").map(item => item.trim()).filter(Boolean);
    error.textContent = "";
      await api.request("/api/projects", { method: "POST", body: JSON.stringify(payload) });
      form.innerHTML = "<div class='form-success'><span class='success-mark'>✓</span><p class='section-kicker'>PROJECT SAVED</p><h3>项目草稿已提交。</h3><p>主办方审核并发布后，项目会显示在 Gallery 中。</p><a class='button button-dark' href='gallery.html'>查看 Project Gallery</a></div>";
    } catch (err) {
      error.textContent = err.message;
      submit.disabled = false;
    } finally {
      if (coverFile) coverFile.disabled = false;
    }
  });

  init();
})();




