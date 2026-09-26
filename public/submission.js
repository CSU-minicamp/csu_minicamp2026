(() => {
  const api = window.MinicampAPI;
  const form = document.getElementById("project-form");
  const fields = document.getElementById("member-fields");
  const error = document.getElementById("project-error");
  const coverFile = document.getElementById("cover-file");
  const coverFileName = document.getElementById("cover-file-name");
  const coverUrl = form.querySelector("[name=coverUrl]");
  const submitLabel = form.querySelector(".submit-label");
  const setFieldState = (field, message = "") => {
    if (!field) return;
    field.classList.toggle("has-error", Boolean(message));
    field.setAttribute("aria-invalid", message ? "true" : "false");
    let hint = field.parentElement?.querySelector(".field-error");
    if (message && !hint) { hint = document.createElement("small"); hint.className = "field-error"; field.parentElement?.appendChild(hint); }
    if (hint) { hint.textContent = message; hint.hidden = !message; }
  };
  const clearFieldStates = () => form.querySelectorAll(".has-error").forEach(field => setFieldState(field));
  const requiredFields = [
    ["projectName", "请填写项目名称，让大家知道你们做的是什么。"],
    ["tagline", "请用一句话介绍项目解决的问题或带来的价值。"],
    ["problem", "请描述用户遇到的真实问题和使用场景。"],
    ["solution", "请说明项目如何解决这个问题，以及核心功能。"]
  ];
  const validateForm = () => {
    clearFieldStates();
    const issues = [];
    requiredFields.forEach(([name, message]) => {
      const field = form.elements[name];
      if (!String(field?.value || "").trim()) { setFieldState(field, message); issues.push({ field, message }); }
    });
    ["demoUrl", "githubUrl"].forEach(name => {
      const field = form.elements[name];
      if (String(field?.value || "").trim() && !field.checkValidity()) {
        const message = "请输入完整的网址，例如 https://example.com。";
        setFieldState(field, message); issues.push({ field, message });
      }
    });
    if (issues.length) {
      error.textContent = `请先补充 ${issues.length} 项内容，完成后再提交。`;
      issues[0].field?.scrollIntoView({ behavior: "smooth", block: "center" });
      issues[0].field?.focus({ preventScroll: true });
      return false;
    }
    error.textContent = "";
    return true;
  };
  form.addEventListener("input", event => {
    const field = event.target;
    if (!field.classList?.contains("has-error")) return;
    setFieldState(field);
    if (!form.querySelector(".has-error")) error.textContent = "";
  });
  let coverTask = Promise.resolve(true);
  let coverVersion = 0;
  function compressImage(file) { return new Promise((resolve, reject) => { const img = new Image(); const reader = new FileReader(); reader.onload = () => { img.onload = () => { const max = 1600, scale = Math.min(1, max / Math.max(img.width, img.height)); const canvas = document.createElement("canvas"); canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale); canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height); resolve(canvas.toDataURL("image/jpeg", .82)); }; img.onerror = reject; img.src = reader.result; }; reader.onerror = reject; reader.readAsDataURL(file); }); }
  coverFile?.addEventListener("change", () => {
    const file = coverFile.files?.[0], version = ++coverVersion;
    if (coverFileName) coverFileName.textContent = file ? file.name : "尚未选择文件";
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
      const { participant, team: profileTeam, localSubmissionBypass } = profile;
      document.querySelector("main")?.removeAttribute("hidden");
      const team = profileTeam || (localSubmissionBypass ? { id: "LOCAL-TEAM-" + participant.id, members: [{ name: participant.name || "本地测试用户" }] } : null);
      if (!team) {
        error.textContent = "请先在组队工作区创建或加入队伍。";
        form.querySelector("button[type='submit']").disabled = true;
        return;
      }
      if (localSubmissionBypass) {
        const note = document.createElement("p");
        note.className = "local-test-note";
        note.textContent = "本地测试模式：当前账号暂时跳过组队限制；正式环境仍需先创建或加入队伍。";
        form.querySelector(".form-intro")?.appendChild(note);
      }
      fields.innerHTML = "<fieldset><legend>团队成员分工（每项选填）</legend>" + team.members.map(member =>
        "<label>" + escapeHtml(member.name) + "<input data-member-role data-member-name='" + escapeHtml(member.name) + "' placeholder='例如：产品负责人、前端开发、视觉设计（选填）'></label>"
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
    if (submit.disabled || !validateForm()) return;
    submit.disabled = true;
    submit.classList.add("is-loading");
    if (submitLabel) submitLabel.textContent = "正在提交…";
    if (coverFile) coverFile.disabled = true;
    try {
      if (!await coverTask) {
        error.textContent = "封面图片还没有处理完成，请重新选择图片或清除选择后再提交。";
        submit.disabled = false;
        submit.classList.remove("is-loading");
        if (submitLabel) submitLabel.textContent = "提交项目审核";
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
      error.textContent = err.message || "提交失败，请稍后重试。";
      submit.disabled = false;
      submit.classList.remove("is-loading");
      if (submitLabel) submitLabel.textContent = "重新提交";
    } finally {
      if (coverFile) coverFile.disabled = false;
    }
  });
  init();
})();




