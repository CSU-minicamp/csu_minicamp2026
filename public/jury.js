(() => {
  const api = {...MinicampAPI, request: MinicampAPI.adminRequest};
  const formalAwards = ["Best Overall", "Best Product", "Best Design", "Best Technical", "Most Unexpected"];
  const peopleAward = "People's Choice";
  const labels = {"Best Overall":"全场最佳", "Best Product":"最佳产品", "Best Design":"最佳设计与体验", "Best Technical":"最佳技术 Hack", "Most Unexpected":"最出乎意料", "People's Choice":"现场人气奖"};
  let projects = [];
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[char]));
  const projectOptions = () => projects.map(project => "<option value='" + esc(project.id) + "'>" + esc(project.projectName) + "</option>").join("");
  const formalFields = award => "<fieldset class='jury-award-field'><legend>" + esc(labels[award]) + "</legend><label>第一选择 · 3 票<select data-award='" + esc(award) + "' data-points='3' required><option value=''>请选择</option>" + projectOptions() + "</select></label><label>第二选择 · 2 票<select data-award='" + esc(award) + "' data-points='2' required><option value=''>请选择</option>" + projectOptions() + "</select></label><label>第三选择 · 1 票<select data-award='" + esc(award) + "' data-points='1' required><option value=''>请选择</option>" + projectOptions() + "</select></label></fieldset>";
  // 必须和 formalFields 一样延迟到渲染时求值：写成字符串常量会在 projects 还没拉到时就把空选项定死。
  const peopleField = () => "<fieldset class='jury-award-field'><legend>现场人气奖</legend><label>选择一个项目<select data-award='" + esc(peopleAward) + "' data-points='1' required><option value=''>请选择</option>" + projectOptions() + "</select></label></fieldset>";
  const login = document.getElementById("jury-login");
  login.onsubmit = async event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const auth = await api.request("/api/auth/admin", {method:"POST", body:JSON.stringify({password:data.get("password"), organizerCode:data.get("organizerCode")})});
      api.setAdminToken(auth.token);
      if (auth.hasVoted) { document.getElementById("jury-error").textContent = "该主办方已经提交过投票，如需重投请联系后台撤回。"; return; }
      projects = (await api.request("/api/projects")).projects || [];
      document.querySelector(".voting-login").hidden = true;
      document.getElementById("jury-workspace").hidden = false;
      document.getElementById("jury-fields").innerHTML = formalAwards.map(formalFields).join("") + peopleField();
    } catch (error) { document.getElementById("jury-error").textContent = error.message; }
  };
  const juryForm = document.getElementById("jury-form");
  const juryError = document.getElementById("jury-submit-error");
  // 动过任何一个下拉就清掉上一次的报错，否则改好了红字还挂在那里，看起来像一直在失败。
  juryForm.addEventListener("change", () => { juryError.textContent = ""; });
  juryForm.onsubmit = async event => {
    event.preventDefault();
    // 事件派发结束后 event.currentTarget 会变成 null，必须在 await 之前先把 form 的引用存下来。
    const form = event.currentTarget;
    juryError.textContent = "";
    const selects = [...form.querySelectorAll("select")];
    const byAward = new Map();
    selects.forEach(select => { const rows = byAward.get(select.dataset.award) || []; rows.push(select); byAward.set(select.dataset.award, rows); });
    const invalid = formalAwards.some(award => { const rows = byAward.get(award) || []; return rows.length !== 3 || rows.some(row => !row.value) || new Set(rows.map(row => row.value)).size !== 3; }) || !(byAward.get(peopleAward) || [])[0]?.value;
    if (invalid) { juryError.textContent = "前五个奖项请选择三个不同项目，现场人气奖请选择一个项目。"; return; }
    const selections = selects.map(select => ({award:select.dataset.award, projectId:select.value, points:Number(select.dataset.points)}));
    try {
      await api.request("/api/votes", {method:"POST", body:JSON.stringify({selections})});
      form.innerHTML = "<div class='form-success'><h3>Jury 投票已记录。</h3><p>如需更正，请联系后台撤回后重新提交。</p><a class='button button-dark' href='admin.html'>返回后台查看统计</a></div>";
    } catch (error) { juryError.textContent = error.message; }
  };
})();
