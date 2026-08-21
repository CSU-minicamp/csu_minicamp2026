(function () {
  const APPLICATION_KEY = "minicamp2026_applications";
  const VOTE_KEY = "minicamp2026_votes";
  const RECORD_KEY = "minicamp2026_vote_records";
  const candidates = [
    { team: "TEAM 01", project: "Campus Pulse", desc: "让校园里的真实需求被更快看见。", accent: "coral" },
    { team: "TEAM 03", project: "暂未命名", desc: "一个正在从想法变成 Demo 的作品。", accent: "cyan" },
    { team: "TEAM 07", project: "Next Seat", desc: "重新想象下一次人与人相遇的方式。", accent: "yellow" },
    { team: "TEAM 11", project: "Echo Garden", desc: "把校园里的声音变成可探索的互动花园。", accent: "cyan" },
    { team: "TEAM 16", project: "Pocket Lab", desc: "随时记录、验证和分享微小实验。", accent: "coral" }
  ];
  const awards = [
    ["Best Overall", "全场最佳"], ["Best Product", "最佳产品"], ["Best Design", "最佳设计与体验"], ["Best Technical", "最佳技术 Hack"], ["Most Unexpected", "最出乎意料奖"]
  ];
  let voter = null;
  const applications = () => JSON.parse(localStorage.getItem(APPLICATION_KEY) || "[]");
  const votes = () => JSON.parse(localStorage.getItem(VOTE_KEY) || "[]");
  const records = () => JSON.parse(localStorage.getItem(RECORD_KEY) || "[]");

  function candidateCard(item, name, type, value, awardKey = "") {
    const meta = awardKey ? `data-card-award="${awardKey}" data-card-team="${value}"` : "";
    return `<label class="candidate-card accent-${item.accent}" ${meta}><input type="${type}" name="${name}" value="${value}"><span class="candidate-number">${item.team}</span><strong>${item.project}</strong><small>${item.desc}</small><em>选择 <b>＋</b></em></label>`;
  }
  function renderCandidates() {
    const ownTeam = voter.teamId;
    const available = candidates.filter(item => item.team !== ownTeam);
    document.getElementById("formal-votes").innerHTML = awards.map(([key, label]) => `<section class="formal-vote-block"><div class="vote-section-title"><div><p class="section-kicker">${key.toUpperCase()}</p><h2>${label}</h2></div><span>第一 3 票 · 第二 2 票 · 第三 1 票</span></div><div class="candidate-grid ranking-grid">${available.map(item => candidateCard(item, `award-${key}-${item.team}`, "checkbox", item.team, key)).join("")}</div><p class="ranking-help">点击作品卡片会自动填入下方第一个空名次；修改名次后卡片会同步更新，三个名次不能选择同一作品。</p><div class="rank-selects"><label>第一选择（3票）<select data-award="${key}" data-rank="3"><option value="">请选择</option>${available.map(item => `<option value="${item.team}">${item.project}</option>`).join("")}</select></label><label>第二选择（2票）<select data-award="${key}" data-rank="2"><option value="">请选择</option>${available.map(item => `<option value="${item.team}">${item.project}</option>`).join("")}</select></label><label>第三选择（1票）<select data-award="${key}" data-rank="1"><option value="">请选择</option>${available.map(item => `<option value="${item.team}">${item.project}</option>`).join("")}</select></label></div></section>`).join("");
    document.getElementById("people-candidates").innerHTML = available.map(item => candidateCard(item, "people-choice", "radio", item.team)).join("");
    document.querySelectorAll(".rank-selects select").forEach(select => select.addEventListener("change", () => handleRankingChange(select)));
    document.querySelectorAll(".ranking-grid .candidate-card input").forEach(input => input.addEventListener("change", () => syncFromCard(input)));
    awards.forEach(([key]) => syncRanking(key));
  }

  function getRankingSelects(awardKey) {
    return Array.from(document.querySelectorAll(`select[data-award="${awardKey}"]`)).sort((a, b) => Number(b.dataset.rank) - Number(a.dataset.rank));
  }

  function syncRanking(awardKey) {
    const selects = getRankingSelects(awardKey);
    const seen = new Set();
    selects.forEach(select => {
      if (!select.value) return;
      if (seen.has(select.value)) select.value = "";
      else seen.add(select.value);
    });
    const values = selects.map(select => select.value).filter(Boolean);
    selects.forEach(select => {
      const ownValue = select.value;
      Array.from(select.options).forEach(option => { option.disabled = Boolean(option.value && option.value !== ownValue && values.includes(option.value)); });
    });
    const selected = new Set(selects.map(select => select.value).filter(Boolean));
    document.querySelectorAll(`.candidate-card[data-card-award="${awardKey}"]`).forEach(card => {
      const checked = selected.has(card.dataset.cardTeam);
      card.querySelector("input").checked = checked;
      const rank = selects.find(select => select.value === card.dataset.cardTeam);
      card.classList.toggle("is-ranked", checked);
      card.querySelector("em").innerHTML = rank ? `${rank.dataset.rank === "3" ? "第一" : rank.dataset.rank === "2" ? "第二" : "第三"}选择 <b>${rank.dataset.rank}票</b>` : `选择 <b>＋</b>`;
    });
  }

  function handleRankingChange(select) {
    const selects = getRankingSelects(select.dataset.award);
    if (select.value) {
      selects.forEach(other => {
        if (other !== select && other.value === select.value) other.value = "";
      });
    }
    syncRanking(select.dataset.award);
  }

  function syncFromCard(input) {
    const card = input.closest(".candidate-card");
    const awardKey = card.dataset.cardAward;
    const selects = getRankingSelects(awardKey);
    const alreadySelected = selects.some(select => select.value === input.value);
    if (input.checked && !alreadySelected) {
      const empty = selects.find(select => !select.value);
      if (empty) empty.value = input.value;
      else { input.checked = false; showVoteError("三个名次都已选满，请先修改一个名次。"); }
    } else if (!input.checked && alreadySelected) {
      selects.forEach(select => { if (select.value === input.value) select.value = ""; });
    }
    syncRanking(awardKey);
  }

  function showVoteError(message) {
    const error = document.getElementById("voting-error");
    if (error) { error.textContent = message; window.clearTimeout(showVoteError.timer); showVoteError.timer = window.setTimeout(() => { error.textContent = ""; }, 2600); }
  }

  document.getElementById("voting-login-form").addEventListener("submit", event => {
    event.preventDefault();
    const id = document.getElementById("voter-id").value.trim().toUpperCase();
    const contact = document.getElementById("voter-contact").value.trim().toLowerCase().replace(/[\s-]/g, "");
    const found = applications().find(item => item.id.toUpperCase() === id && [item.email, item.phone].some(value => String(value || "").toLowerCase().replace(/[\s-]/g, "") === contact));
    if (!found) { document.getElementById("voter-error").textContent = "申请编号或联系方式不匹配，请使用报名时填写的信息。"; return; }
    if (records().some(record => record.voterId === found.id)) { document.getElementById("voter-error").textContent = "你已经提交过投票，每位参与者只能提交一次。"; return; }
    voter = found; document.getElementById("voter-name").textContent = found.name; document.getElementById("voting-login").hidden = true; document.getElementById("voting-workspace").hidden = false; renderCandidates();
  });

  document.getElementById("voting-form").addEventListener("submit", event => {
    event.preventDefault();
    const error = document.getElementById("voting-error");
    const form = event.currentTarget;
    const submitted = [];
    for (const [key] of awards) {
      const selections = [3, 2, 1].map(rank => form.querySelector(`select[data-award="${key}"][data-rank="${rank}"]`)?.value || "");
      if (selections.some(value => !value) || new Set(selections).size !== 3) { error.textContent = `请完成“${key}”的第一、第二、第三选择，且不能重复。`; return; }
      submitted.push({ award: key, selections });
    }
    const people = form.querySelector('input[name="people-choice"]:checked')?.value;
    if (!people) { error.textContent = "请为 People's Choice 选择一个项目。"; return; }
    const aggregate = votes();
    submitted.forEach(item => item.selections.forEach((team, index) => addVote(aggregate, team, item.award === "Best Overall" ? "overall" : item.award === "Best Product" ? "product" : item.award === "Best Design" ? "design" : item.award === "Best Technical" ? "technical" : "unexpected", [3, 2, 1][index])));
    addVote(aggregate, people, "people", 1);
    localStorage.setItem(VOTE_KEY, JSON.stringify(aggregate));
    const allRecords = records(); allRecords.push({ voterId: voter.id, selections: submitted, peopleChoice: people, createdAt: new Date().toISOString() }); localStorage.setItem(RECORD_KEY, JSON.stringify(allRecords));
    document.getElementById("voting-workspace").hidden = true; document.getElementById("vote-success").hidden = false;
  });
  document.getElementById("voting-logout").addEventListener("click", () => { voter = null; document.getElementById("voting-workspace").hidden = true; document.getElementById("voting-login").hidden = false; });
  function addVote(list, team, field, amount) { let item = list.find(row => row.team === team); if (!item) { const candidate = candidates.find(row => row.team === team); item = { team, project: candidate?.project || team, overall: 0, product: 0, design: 0, technical: 0, unexpected: 0, people: 0 }; list.push(item); } item[field] = (item[field] || 0) + amount; }
})();
