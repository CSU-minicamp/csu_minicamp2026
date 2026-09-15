(() => {
  const api = window.MinicampAPI;
  const form = document.getElementById("application-form");
  const FIELD_LABELS = {name:"姓名",studentId:"学号",college:"学院",major:"专业",grade:"年级",phone:"手机号",email:"邮箱",motivation:"参与动机",consent:"信息真实性确认",identity_type:"身份类型",school_or_company:"学校 / 单位",grade_or_position:"年级 / 职位"};
  const labelOf = field => {
    if (FIELD_LABELS[field.name]) return FIELD_LABELS[field.name];
    const label = field.closest("label");
    const text = label ? [...label.childNodes].find(node => node.nodeType === 3 && node.textContent.trim()) : null;
    return text ? text.textContent.trim() : field.name;
  };
  const clearFieldErrors = scope => scope?.querySelectorAll(".field-error, .field-error-group").forEach(item => item.classList.remove("field-error", "field-error-group"));
  const markFieldError = field => {
    if (!field) return;
    field.classList.add("field-error");
    if (field.type === "checkbox" || field.type === "radio") field.closest("fieldset, label")?.classList.add("field-error-group");
  };
  // 只提示第一项缺失 / 无效的必填项，并高亮该字段。
  const reminderFor = field => {
    if (field.name === "phone" && !api.isValidPhone(field.value)) return "请输入 11 位手机号。";
    if (field.name === "studentId" && !api.isValidStudentId(field.value)) return "请输入 10 位数字学号。";
    if (field.type === "checkbox" || field.type === "radio") return "请勾选" + labelOf(field) + "。";
    if (field.tagName === "SELECT") return "请选择" + labelOf(field) + "。";
    if (!String(field.value || "").trim()) return "请填写" + labelOf(field) + "。";
    return "请检查" + labelOf(field) + "是否正确。";
  };
  const reportMissing = (scope, errorNode) => {
    clearFieldErrors(scope);
    const field = [...scope.querySelectorAll("input, select, textarea")].find(item => !item.checkValidity() || (item.name === "phone" && !api.isValidPhone(item.value)) || (item.name === "studentId" && !api.isValidStudentId(item.value)));
    if (!field) return false;
    markFieldError(field);
    errorNode.textContent = reminderFor(field);
    field.focus();
    return true;
  };
  const clearOnEdit = scope => scope?.querySelectorAll("input, select, textarea").forEach(field => {
    const drop = () => { field.classList.remove("field-error"); field.closest(".field-error-group")?.classList.remove("field-error-group"); };
    field.addEventListener("input", drop);
    field.addEventListener("change", drop);
  });
  const configPromise = api.request("/api/config").then(({config}) => {
    document.querySelectorAll("[data-config-date]").forEach(el => el.textContent = config.date);
    document.querySelectorAll("[data-voting-entry]").forEach(el => {
      if (config.voteOpen) {
        el.innerHTML = "开始投票 <span>↗</span>";
        el.setAttribute("href", "voting.html");
        el.removeAttribute("aria-disabled");
        el.removeAttribute("tabindex");
        el.classList.remove("is-disabled");
      } else {
        el.textContent = "暂未开放投票";
        el.removeAttribute("href");
        el.setAttribute("aria-disabled", "true");
        el.setAttribute("tabindex", "-1");
        el.classList.add("is-disabled");
      }
    });
    document.querySelectorAll("[data-config-venue]").forEach(el => el.textContent = config.venue);
    const intro = document.querySelector(".apply-intro > p:nth-of-type(2)");
    if (intro) intro.textContent = config.applicationOpen ? "仅面向中南大学在校学生。请如实填写每一项，提交后可凭申请编号和联系方式登录个人主页，查看审核状态与通知。" : "报名通道暂未开放，主办方确定时间后会在官网和主办方 QQ 群同步公布。";
    if (!config.applicationOpen) {
      const launcher = document.querySelector(".application-choice-column, .application-launcher");
      if (launcher) launcher.innerHTML = "<div class='form-head'><div><span class='status-dot' style='background:var(--coral)'></span>报名通道</div><span>CLOSED</span></div><div class='application-launcher-body'><p class='section-kicker'>APPLICATION / CLOSED</p><h3>报名通道<br>暂未开放。</h3><p>报名开放与截止时间确定后，会第一时间在官网和主办方 QQ 群公布。已经报名的同学可以进入个人主页查看审核状态与通知。</p><a class='button button-dark' href='profile.html'>进入个人主页 <span>↗</span></a></div>";
    }
  }).catch(() => {});
  document.querySelectorAll(".day-tab").forEach(tab => tab.addEventListener("click", () => {
    document.querySelectorAll(".day-tab").forEach(item => { item.classList.toggle("active", item === tab); item.setAttribute("aria-selected", String(item === tab)); });
    document.querySelectorAll(".timeline-panel").forEach(panel => { const active = panel.id === tab.dataset.day; panel.classList.toggle("active", active); panel.hidden = !active; });
  }));

  document.querySelectorAll('.timeline-panel').forEach(panel => { panel.querySelectorAll('.timeline-item').forEach(item => { item.tabIndex = 0; const activate = () => panel.querySelectorAll('.timeline-item').forEach(entry => entry.classList.toggle('active', entry === item)); item.addEventListener('mouseenter', activate); item.addEventListener('focus', activate); }); });

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
  const qqDrawer = document.getElementById("qq-drawer");
  const openQqDrawer = document.getElementById("open-qq-drawer");
  const closeQqDrawer = document.getElementById("close-qq-drawer");
  const closeQqDrawerButton = document.getElementById("close-qq-drawer-button");
  const setQqDrawer = open => {
    if (!qqDrawer) return;
    qqDrawer.classList.toggle("is-open", open);
    qqDrawer.setAttribute("aria-hidden", String(!open));
    document.body.classList.toggle("drawer-open", open);
    if (open) closeQqDrawerButton?.focus();
  };
  openQqDrawer?.addEventListener("click", () => setQqDrawer(true));
  closeQqDrawer?.addEventListener("click", () => setQqDrawer(false));
  closeQqDrawerButton?.addEventListener("click", () => setQqDrawer(false));
  document.addEventListener("keydown", event => { if (event.key === "Escape" && qqDrawer?.classList.contains("is-open")) setQqDrawer(false); });
  const applicationModal = document.getElementById("application-modal");
  const openApplication = document.getElementById("open-application");
  const closeApplication = document.getElementById("close-application");
  openApplication?.addEventListener("click", () => {
    applicationModal?.showModal();
    const nextButton = document.getElementById("next-step");
    if (nextButton) nextButton.textContent = "开始填写";
  });
  closeApplication?.addEventListener("click", () => applicationModal?.close());
  applicationModal?.addEventListener("click", event => { if (event.target === applicationModal) applicationModal.close(); });
  const roadshowModal = document.getElementById("roadshow-modal");
  const roadshowForm = document.getElementById("roadshow-form");
  document.getElementById("open-roadshow")?.addEventListener("click", () => roadshowModal?.showModal());
  document.getElementById("close-roadshow")?.addEventListener("click", () => roadshowModal?.close());
  roadshowModal?.addEventListener("click", event => { if (event.target === roadshowModal) roadshowModal.close(); });
  roadshowForm?.querySelector('input[name="phone"]')?.addEventListener("input", event => { event.target.value = event.target.value.replace(/\D/g, "").slice(0, 11); });
  clearOnEdit(roadshowForm);
  roadshowForm?.addEventListener("submit", async event => {
    event.preventDefault();
    const error = document.getElementById("roadshow-error"), submit = roadshowForm.querySelector("button[type=submit]");
    error.textContent = "";
    if (reportMissing(roadshowForm, error)) return;
    const data = new FormData(roadshowForm), payload = Object.fromEntries(data.entries());
    payload.registration_type = "roadshow";
    payload.attend_roadshow = data.get("attend_roadshow") === "true";
    payload.receive_notifications = data.get("receive_notifications") === "true";
    submit.disabled = true;
    try {
      const result = await api.request("/api/applications", {method:"POST", body:JSON.stringify(payload)});
      api.setToken(result.token); roadshowForm.hidden = true; document.getElementById("roadshow-success").hidden = false; document.getElementById("roadshow-id").textContent = result.application.id;
    } catch (err) { error.textContent = err.message; } finally { submit.disabled = false; }
  });
  document.getElementById("close-roadshow-success")?.addEventListener("click", () => roadshowModal?.close());
  if (!form) return;
  const steps = [...form.querySelectorAll(".form-step")], progress = document.getElementById("form-progress"), error = document.getElementById("form-error");
  form.querySelectorAll('input[name="phone"]').forEach(input => input.addEventListener("input", () => { const digits = input.value.replace(/\D/g, "").slice(0, 11); if (input.value !== digits) input.value = digits; }));
  form.querySelectorAll('input[name="studentId"]').forEach(input => input.addEventListener("input", () => { const digits = input.value.replace(/\D/g, "").slice(0, 10); if (input.value !== digits) input.value = digits; }));
  const next = document.getElementById("next-step"), prev = document.getElementById("prev-step"), submit = document.getElementById("submit-application");
  const gradeField = form.elements.grade, freshmanHelp = document.getElementById("freshman-help");
  const isFreshman = value => /大一|一年级|freshman/i.test(String(value || ""));
  const updateGradeHelp = () => {
    const freshman = isFreshman(gradeField?.value);
    if (freshmanHelp) freshmanHelp.hidden = !freshman;
    gradeField?.setAttribute("aria-describedby", freshman ? "freshman-help" : "");
  };
  let current = 1;
  const showStep = step => { current = step; steps.forEach(item => { item.hidden = Number(item.dataset.step) !== step; item.classList.toggle("active", Number(item.dataset.step) === step); }); progress.textContent = "步骤 " + step + " / 3"; prev.classList.toggle("hidden", step === 1); next.classList.toggle("hidden", step === 3); next.textContent = step === 1 ? "开始填写" : "继续"; submit.classList.toggle("hidden", step !== 3); error.textContent = ""; clearFieldErrors(form); };
  const validate = step => {
    const panel = steps[step - 1];
    if (reportMissing(panel, error)) return false;
    if (step === 2 && !form.querySelector('input[name="skills"]:checked')) { form.querySelector(".skill-grid")?.classList.add("field-error-group"); error.textContent = "请至少选择一项能力标签（最多 2 项）。"; return false; }
    return true;
  };
  clearOnEdit(form);
  next.addEventListener("click", () => validate(current) && showStep(current + 1));
  prev.addEventListener("click", () => showStep(current - 1));
  gradeField?.addEventListener("change", updateGradeHelp);
  updateGradeHelp();
  form.querySelectorAll('input[name="skills"]').forEach(input => input.addEventListener("change", () => { const checked = form.querySelectorAll('input[name="skills"]:checked'); if (checked.length > 2) input.checked = false; }));
  form.addEventListener("submit", async event => {
    event.preventDefault(); if (!validate(3)) return;
    const data = new FormData(form), payload = Object.fromEntries(data.entries()); payload.entryType = "个人报名"; payload.skills = data.getAll("skills"); payload.participationMode = isFreshman(payload.grade) ? "仅参与路演及后续投票等阶段，不参与开发环节" : "可参与完整活动流程"; delete payload.consent;
    submit.disabled = true; error.textContent = "";
    try {
      const result = await api.request("/api/applications",{method:"POST",body:JSON.stringify(payload)});
      api.setToken(result.token); form.hidden = true; document.getElementById("form-success").hidden = false; document.getElementById("application-id").textContent = result.application.id; progress.textContent = "提交成功";
    } catch (err) { error.textContent = err.message; } finally { submit.disabled = false; }
  });
  document.getElementById("close-success")?.addEventListener("click", () => applicationModal?.close());
})();

