(() => {
  const api = window.MinicampAPI;
  const form = document.getElementById("application-form");
  const configPromise = api.request("/api/config").then(({config}) => {
    document.querySelectorAll("[data-config-date]").forEach(el => el.textContent = config.date); document.querySelectorAll("[data-voting-entry]").forEach(el => { if (!config.voteOpen) { el.textContent = "暂未开放"; el.classList.add("is-disabled"); } });
    document.querySelectorAll("[data-config-venue]").forEach(el => el.textContent = config.venue);
    const intro = document.querySelector(".apply-intro > p:nth-of-type(2)");
    if (intro) intro.textContent = config.applicationOpen ? "仅面向中南大学在校学生。报名开放后，每位参与者都需要独立填写资料。" : "报名通道暂未开放，主办方确定时间后会在官网更新。";
    if (!config.applicationOpen && form) form.closest(".application-box").innerHTML = "<div class='form-success'><p class='section-kicker'>APPLICATION CLOSED</p><h3>报名通道暂未开放。</h3><p>请关注官网公告和主办方通知。</p></div>";
  }).catch(() => {});
  document.querySelectorAll(".day-tab").forEach(tab => tab.addEventListener("click", () => {
    document.querySelectorAll(".day-tab").forEach(item => { item.classList.toggle("active", item === tab); item.setAttribute("aria-selected", String(item === tab)); });
    document.querySelectorAll(".timeline-panel").forEach(panel => { const active = panel.id === tab.dataset.day; panel.classList.toggle("active", active); panel.hidden = !active; });
  }));
  const faqList = document.querySelector(".faq-list");
  if (faqList) {
    const faqItems = [...faqList.querySelectorAll("details")];
    const faqPrev = faqList.querySelector('[data-faq-direction="prev"]');
    const faqNext = faqList.querySelector('[data-faq-direction="next"]');
    const faqStatus = faqList.querySelector(".faq-page-status");
    const faqPageSize = 4;
    const faqPageCount = Math.ceil(faqItems.length / faqPageSize);
    let faqPage = 1;
    const renderFaqPage = () => {
      const start = (faqPage - 1) * faqPageSize;
      faqItems.forEach((item, index) => {
        item.hidden = index < start || index >= start + faqPageSize;
        if (item.hidden) item.open = false;
      });
      faqPrev.disabled = faqPage === 1;
      faqNext.disabled = faqPage === faqPageCount;
      faqStatus.textContent = `第 ${faqPage} / ${faqPageCount} 页`;
    };
    faqPrev.addEventListener("click", () => { if (faqPage > 1) { faqPage -= 1; renderFaqPage(); } });
    faqNext.addEventListener("click", () => { if (faqPage < faqPageCount) { faqPage += 1; renderFaqPage(); } });
    renderFaqPage();
  }
  const navToggle = document.querySelector(".nav-toggle"), nav = document.querySelector(".site-nav");
  navToggle?.addEventListener("click", () => { const open = nav.classList.toggle("open"); navToggle.setAttribute("aria-expanded", String(open)); });
  if (!form) return;
  const steps = [...form.querySelectorAll(".form-step")], progress = document.getElementById("form-progress"), error = document.getElementById("form-error");
  const next = document.getElementById("next-step"), prev = document.getElementById("prev-step"), submit = document.getElementById("submit-application"), intentNameField = document.getElementById("team-intent-name-field"), intentNameInput = document.getElementById("teamIntentName");
  let current = 1;
  const showStep = step => { current = step; steps.forEach(item => { item.hidden = Number(item.dataset.step) !== step; item.classList.toggle("active", Number(item.dataset.step) === step); }); progress.textContent = "步骤 " + step + " / 3"; prev.classList.toggle("hidden", step === 1); next.classList.toggle("hidden", step === 3); next.textContent = step === 1 ? "开始填写" : "继续"; submit.classList.toggle("hidden", step !== 3); error.textContent = ""; };
  const validate = step => { const panel = steps[step - 1]; for (const field of panel.querySelectorAll("[required]")) if (!field.checkValidity()) { field.focus(); error.textContent = "请完成当前步骤中的必填信息。"; return false; } if (step === 2 && !form.querySelector('input[name="skills"]:checked')) { error.textContent = "请至少选择一项能力标签。"; return false; } return true; };
  next.addEventListener("click", () => validate(current) && showStep(current + 1));
  prev.addEventListener("click", () => showStep(current - 1));
  form.querySelectorAll('input[name="hasTeamIntent"]').forEach(input => input.addEventListener("change", () => { const show = input.checked && input.value === "是"; intentNameField.classList.toggle("hidden", !show); intentNameInput.required = show; if (!show) intentNameInput.value = ""; }));
  form.querySelectorAll('input[name="skills"]').forEach(input => input.addEventListener("change", () => { const checked = form.querySelectorAll('input[name="skills"]:checked'); if (checked.length > 2) input.checked = false; }));
  form.addEventListener("submit", async event => {
    event.preventDefault(); if (!validate(3)) return;
    const data = new FormData(form), payload = Object.fromEntries(data.entries()); payload.entryType = "个人报名"; payload.skills = data.getAll("skills"); delete payload.consent;
    submit.disabled = true; error.textContent = "";
    try {
      const result = await api.request("/api/applications",{method:"POST",body:JSON.stringify(payload)});
      api.setToken(result.token); form.hidden = true; document.getElementById("form-success").hidden = false; document.getElementById("application-id").textContent = result.application.id; progress.textContent = "提交成功";
    } catch (err) { error.textContent = err.message; } finally { submit.disabled = false; }
  });
  document.getElementById("new-application")?.addEventListener("click", () => { form.reset(); form.hidden = false; document.getElementById("form-success").hidden = true; intentNameField.classList.add("hidden"); intentNameInput.required = false; showStep(1); });
})();
