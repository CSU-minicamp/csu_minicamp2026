(() => {
  const query = new URLSearchParams(window.location.search);
  const isEmbed = query.has("embed");
  const isPresentation = query.has("present");
  if (isEmbed) document.body.classList.add("stage-embed");
  if (isPresentation) document.body.classList.add("stage-present");
  const make = (time, title, subtitle, minutes, host, options = {}) => ({ time, title, subtitle, minutes, host, timed: options.timed ?? true, cues: options.cues || [], script: options.script || subtitle, actions: options.actions || [], referenceTitle: options.referenceTitle || "", reference: options.reference || null, phases: options.phases || null });
  const schedule = {
    day1: [
      make("09:00–09:10", "Opening", "先认识彼此，再一起做出一个真正能被看见的作品。", 10, true, { timed: false, script: "回答三个问题：minicamp 是什么？InnOSeed 为什么举办？我们希望这两天发生什么？", actions: ["快速介绍 minicamp 与 InnOSeed", "让参与者知道今天会从相遇走到组队"], referenceTitle: "OPENING / THREE QUESTIONS", reference: { items: [{ label: "WHAT IS MINICAMP?", text: "让不同背景的人相遇，一起做出真实作品" }, { label: "WHY US?", text: "连接技术、产品、设计和更多可能，一起创造真实连接" }, { label: "WHAT HAPPENS?", text: "相遇 → 学习 → 找到想法 → 组队 → 开发 → 展示" }] } }),
      make("09:10–09:35", "AI Coding Quickstart", "看一次完整示范：如何把模糊想法变成可以运行的第一步。", 25, true, { timed: false, script: "展示一次完整的 AI Coding 工作流：描述需求、拆任务、运行、面对报错。", actions: ["演示真实的 AI Coding 对话", "提醒：AI 是开发方式，不是比赛题目"] }),
      make("09:35–09:45", "Rules", "先了解两天怎么玩：时间、组队、提交、展示和投票。", 10, true, { timed: false, script: "说明两天节奏、组队人数、项目提交、路演与投票节点。", actions: ["公布关键时间点", "强调不要求预先会编程，也不审查 Prompt"] }),
      make("09:45–09:50", "Theme Reveal", "三个主题，任选一个作为你们的出发点。", 5, true, { timed: false, script: "公布三个灵感主题。主题是起点，不是限制；从真实的人和校园问题出发。", actions: ["依次揭示三个主题", "给参与者留下拍照和记忆的时间"] }),
      make("09:50–10:00", "Idea Spark", "写下一个脑海中的有趣的点子", 10, true, { cues: ["THINK ABOUT", "PROBLEM", "NEED", "OBSERVATION", "CRAZY THOUGHT"], script: "提醒大家先写问题，不急着讨论技术，也不需要证明 Idea 现在就能做出来。", actions: ["展示 Think About / Problem / Need / Observation / Crazy Thought", "09:56 提示选择一个最想继续聊的 Spark"], referenceTitle: "IDEA SPARK / KEEP THIS VISIBLE", reference: { themes: ["Reimagine Campus", "Build for Humans", "Create the Unexpected"], items: [{ label: "What bothers you?", text: "什么事情让你觉得：它本来可以更好？" }, { label: "What do people actually need?", text: "你或身边的人，正在被什么不方便困扰？" }, { label: "What have you always wanted to build?", text: "有没有一个东西，你一直想亲手做出来？" }, { label: "What sounds ridiculous but interesting?", text: "有没有一个听起来离谱，却让你忍不住想试试的点子？" }] } }),
      make("10:00–10:15", "Idea Collision", "把你的想法讲给别人听，也让它在交流中变得更清楚。", 15, true, { script: "Idea 不属于某个人。先交流，再决定；这里还不是正式组队。", actions: ["提醒所有人站起来，优先找到刚才没有交流过的人", "Mentor 主动连接落单者，打散封闭小圈子", "10:13 开始收集希望进入 Lightning Pitch 的 Idea"], referenceTitle: "IDEA COLLISION / LIVE FLOW", reference: { items: [{ label: "IDEAS CAN CHANGE", text: "你可以追问、补充、挑战、合并，甚至放下原来的想法。" }, { label: "NOT TEAM FORMATION", text: "现在先交流和探索，正式组队会在 Team Market。" }, { label: "TALK TO 2–3 PEOPLE", text: "至少和两到三位不同的参与者聊聊。" }] }, phases: [{ label: "01 / RULES", title: "STAND UP / GO TALK", text: "先站起来，找到还没聊过的人。现在还不是正式组队。", seconds: 60, cues: ["IDEAS CAN CHANGE", "NOT TEAM FORMATION YET"] }, { label: "02 / ROUND 1", title: "EXCHANGE", text: "先听懂，再评价。分享你最想继续探索的 Spark。", seconds: 240, cues: ["LISTEN FIRST", "WHY?", "WHO NEEDS THIS?"] }, { label: "03 / ROUND 2", title: "SWITCH / CHALLENGE", text: "换一位伙伴，为对方的 Idea 加一个新的可能。", seconds: 240, cues: ["NEW USER", "ONE FEATURE", "CRAZY TWIST"] }, { label: "04 / ROUND 3", title: "FREE COLLISION", text: "两到四人自由交流，看看哪些方向可以连接起来。", seconds: 240, cues: ["COMBINE", "REWRITE", "KEEP EXPLORING"] }, { label: "05 / COLLECT", title: "CHOOSE A DIRECTION", text: "留下最想继续探索的方向，为 Lightning Pitch 做准备。", seconds: 120, cues: ["ONE SENTENCE", "PITCH IF YOU NEED PEOPLE"] }] }),
      make("10:15–10:30", "Lightning Pitch", "用 45 秒说清你的想法，以及你希望找到什么伙伴。", 15, true, { cues: ["PROBLEM · 10s", "IDEA · 15s", "WHY · 10s", "NEED · 10s", "45s / IDEA"], script: "每个 Pitch 45 秒：Problem 10s · Idea 15s · Why 10s · Need 10s。", actions: ["给每个 Idea 临时编号", "记录 Pitcher、Idea 一句话和主要需求", "提醒不要把 Pitch 讲成完整路演"], referenceTitle: "LIGHTNING PITCH / 45 SECONDS", reference: { items: [{ label: "PROBLEM · 10s", text: "谁遇到了什么问题？" }, { label: "IDEA · 15s", text: "你想做什么？" }, { label: "WHY · 10s", text: "为什么现在值得做？" }, { label: "NEED · 10s", text: "你需要什么伙伴或能力？" }] } }),
      make("10:30–10:45", "Team Market", "找到想一起做两天的人，组建一支互补的队伍。", 15, true, { cues: ["WHAT?", "WHY?", "YOU?", "NEED?", "10:32 EXPLORE · 10:37 FORM · 10:41 BALANCE · 10:44 FREEZE"], script: "先聊再锁队。问 What / Why / You / Need，鼓励主动连接，不替大家分配队伍。", actions: ["10:32 Explore · 先聊", "10:37 Form · 形成候选团队", "10:41 Balance · 连接落单者与缺口", "10:44 Freeze Movement"], referenceTitle: "TEAM MARKET / FIND YOUR PEOPLE", reference: { items: [{ label: "WHAT?", text: "你们想一起做什么？" }, { label: "WHY?", text: "这个问题为什么值得解决？" }, { label: "YOU?", text: "你能带来什么兴趣、经验或技能？" }, { label: "NEED?", text: "你们还缺什么伙伴或能力？" }] } }),
      make("10:45–10:50", "Team Lock-in", "确认队友和方向，接下来把想法做成可以展示的成果。", 5, true, { script: "确认每队 3–5 人。项目名称、方向和功能仍可在开发中收敛。", actions: ["打开 Team Lock-in 提交入口", "检查单人队、2 人队和超过 5 人的队伍", "宣布进入 Hack Block"] }),
      make("10:50–21:10", "Hack Block", "专注开发，把最重要的功能做成明天能体验的作品。", 620, false, { timed: false, script: "这是参与者的连续开发时段。午餐、晚餐和自由交流在现场安排中穿插，主办方只需关注场地、网络和 Mentor 支持。", actions: ["不打断团队开发，按需提供 Mentor 支持", "午餐与晚餐按现场安排穿插", "20:55 提醒开始整理 Demo", "21:05 提醒准备 Day 1 Wrap"] }),
      make("21:10–21:30", "Day 1 Wrap", "在结束前记下进度、卡点，以及明早的第一步。", 20, true, { timed: false, script: "让每队留下 Done Today / Biggest Problem / Tomorrow Morning Must Do。", actions: ["展示三栏收尾问题", "提醒 Day 2 09:00 Kickoff"] })
    ],
    day2: [
      make("13:00–13:40", "Project Submission", "提交项目核心信息，让评审和观众快速看懂你的作品。", 40, true, { script: "宣布 Feature Development Stop。接下来只修复展示阻塞问题，不新增核心功能。", actions: ["打开项目提交入口", "现场公布提交截止", "协助队伍确认资料已收到"] }),
      make("13:40–15:00", "Stage Demo", "用几分钟讲清问题、产品、Demo 和团队。", 80, true, { cues: ["PROBLEM", "PRODUCT", "DEMO", "TEAM"], script: "每队快速展示，控制节奏，让观众听懂问题、看到产品、认识团队。", actions: ["按队列呼叫团队上台", "控制每队展示时间", "记录现场技术或设备异常"], referenceTitle: "STAGE DEMO / SHOW THE CORE", reference: { items: [{ label: "PROBLEM", text: "先说清楚：谁遇到了什么问题？" }, { label: "PRODUCT", text: "用一句话说明：你们做了什么？" }, { label: "DEMO", text: "直接展示产品最关键的一条使用路径。" }, { label: "TEAM", text: "让观众知道：是谁把它做出来的。" }] } }),
      make("15:00–15:50", "Demo Fair", "去看看、亲手试试，再为你最喜欢的作品投票。", 50, true, { cues: ["PROJECT EXHIBITS", "TRY IT", "PEOPLE'S CHOICE", "CONNECT"], script: "把舞台交给作品。参与者自由体验并完成 People's Choice 投票。", actions: ["公布展位或项目分布", "提醒投票规则与截止时间", "Organizer / Mentor 主动连接观众与团队"], referenceTitle: "DEMO FAIR / WALK, TRY, VOTE", reference: { items: [{ label: "PROJECT EXHIBITS", text: "找到一个展位，先听团队用一句话介绍。" }, { label: "TRY IT", text: "亲手试试作品最核心的功能。" }, { label: "PEOPLE'S CHOICE", text: "投出你最想继续看到的作品。" }, { label: "CONNECT", text: "把问题和建议直接告诉团队。" }] } }),
      make("15:50–16:10", "自由交流 / 结果统计", "继续逛项目、聊天；主办方同时统计现场投票。", 20, true, { timed: false, actions: ["确认投票数据已同步", "准备 Awards 页面与奖项顺序", "16:05 预告颁奖开始"] }),
      make("16:10–16:40", "Awards", "一起认识获奖作品，也把掌声送给每一支队伍。", 30, true, { timed: false, actions: ["按奖项顺序公布结果", "邀请获奖团队上台"] }),
      make("16:40–17:05", "Closing", "回看这两天做过的事，也想想接下来还能一起做什么。", 25, true, { timed: false, actions: ["回顾作品与相遇", "感谢参与者、Mentor 与志愿者", "介绍我们后续连接方式"] }),
      make("17:05–17:10", "Group Photo", "一起拍张合照，把这次相遇留存下来。", 5, true, { timed: false, actions: ["清空舞台动线", "确认摄影位置", "倒数 3、2、1"] }),
      make("17:10–18:00", "自由交流", "活动没有结束，继续和队友、Mentor 和其他团队聊聊。", 50, true, { timed: false, actions: ["提示自由交流区域", "收集现场反馈", "结束时关闭大屏"] })
    ]
  };

  // Idea Collision is one continuous host-led block. Keep the full 15 minutes
  // together so the console and the audience screen never drift between rounds.
  const ideaCollision = schedule.day1.find(item => item.title === "Idea Collision");
  const ideaCollisionTimerVersion = 1;
  if (ideaCollision) {
    ideaCollision.phases = null;
    ideaCollision.cues = ["STAND UP", "TALK TO 2–3 PEOPLE", "IDEAS CAN CHANGE", "NOT TEAM FORMATION", "10:13 COLLECT"];
    ideaCollision.script = "这是一个连续 15 分钟的交流环节：先站起来找到没聊过的人，互相讲清 Spark，追问、补充、挑战或合并想法，最后留下最想继续探索的方向。现在还不是正式组队，10:13 开始收集准备进入 Lightning Pitch 的 Idea。";
  }

  const horizontalStages = new Set(["Opening", "Idea Spark", "Idea Collision", "Lightning Pitch", "Team Market"]);
  const stageDisplayTitles = {
    "自由交流 / 结果统计": "Open Exchange / Results",
    "自由交流": "Open Networking"
  };
  const displayTitle = item => stageDisplayTitles[item.title] || item.title;
  const key = "minicamp_stage_state";
  const defaults = { day: "day1", index: 0, phase: 0, remaining: null, endsAt: null, running: false };
  const getState = () => { try { return { ...defaults, ...(JSON.parse(localStorage.getItem(key)) || {}) }; } catch { return { ...defaults }; } };
  let state = getState();
  const scheduleVersion = 2;
  try {
    if (state.scheduleVersion !== scheduleVersion) {
      if (state.day === "day2" && state.index > 0) state.index -= 1;
      state.scheduleVersion = scheduleVersion;
      localStorage.setItem(key, JSON.stringify(state));
    }
  } catch { /* Continue with the in-memory state when storage is unavailable. */ }
  const node = id => document.getElementById(id);
  const current = () => schedule[state.day][state.index];
  const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("minicamp-stage-control") : null;
  const broadcast = payload => {
    if (!channel) return;
    try { channel.postMessage(payload); } catch (error) { console.warn("Stage sync broadcast failed", error); }
  };
  const publishState = () => broadcast({ type: "stage-state", state: { ...state }, sentAt: Date.now() });
  const save = () => { localStorage.setItem(key, JSON.stringify(state)); publishState(); };
  const applyExternalState = incoming => {
    if (!incoming || typeof incoming !== "object" || !schedule[incoming.day]) return;
    const list = schedule[incoming.day];
    const next = { ...defaults, ...incoming };
    next.index = Math.min(list.length - 1, Math.max(0, Number(next.index) || 0));
    next.phase = Math.max(0, Number(next.phase) || 0);
    if (next.running && !next.endsAt) next.running = false;
    state = next;
    const day = node("stage-day"); if (day) day.value = state.day;
    render();
  };
  if (channel) {
    channel.addEventListener("message", event => {
      const message = event.data;
      if (!message || typeof message !== "object") return;
      if (message.type === "stage-request-state") publishState();
      if (message.type === "stage-state") applyExternalState(message.state);
    });
    broadcast({ type: "stage-request-state", sentAt: Date.now() });
  }
  const format = seconds => { seconds = Math.max(0, Math.ceil(seconds)); const h = Math.floor(seconds / 3600); const m = Math.floor((seconds % 3600) / 60); const s = seconds % 60; return h > 0 ? [h, m, s].map(value => String(value).padStart(2, "0")).join(":") : [m, s].map(value => String(value).padStart(2, "0")).join(":"); };
  const phase = () => current().phases?.[Math.min(state.phase, current().phases.length - 1)] || null;
  const duration = () => phase()?.seconds || current().minutes * 60;
  const remaining = () => { const item = current(); if (!item.timed) return 0; return state.running && state.endsAt ? Math.max(0, (state.endsAt - Date.now()) / 1000) : (state.remaining ?? duration()); };
  const setText = (id, value) => { const element = node(id); if (element) element.textContent = value; };
  const audienceSubtitle = value => String(value || "").replace(/[。！？]+$/g, "");
  const slug = title => title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const stageGuides = {
    "AI Coding Quickstart": { title: "AI CODING / FROM IDEA TO RUNNING STEP", items: [
      { label: "DESCRIBE", text: "先说清楚要解决的问题和使用场景" },
      { label: "BREAK DOWN", text: "把想法拆成今天能完成的小任务" },
      { label: "RUN + DEBUG", text: "先运行起来，再根据报错继续提问" },
      { label: "AI IS A METHOD", text: "作品不一定要有 AI 功能，开发时用 AI Coding 就好" }
    ] },
    Rules: { title: "RULES / KEEP IT FAIR", items: [
      { label: "WHO CAN JOIN", text: "不管你的专业和技术背景是什么，都欢迎参加" },
      { label: "TEAM SIZE", text: "每队 3–5 人，4 人一起做最方便" },
      { label: "AI CODING", text: "可以用任何工具，不比较代码量，也不审查 Prompt" },
      { label: "DELIVERY", text: "第二天提交项目、上台展示、开放体验并投票" }
    ] },
    "Theme Reveal": { title: "THEME REVEAL / THREE STARTING POINTS", items: [
      { label: "REIMAGINE CAMPUS", text: "从校园里的真实体验出发，想想还能怎样更好" },
      { label: "BUILD FOR HUMANS", text: "先关心人的需要，再决定使用什么技术" },
      { label: "CREATE THE UNEXPECTED", text: "大胆试试有点奇怪、但让人好奇的想法" }
    ] },
    "Team Lock-in": { title: "TEAM LOCK-IN / READY TO BUILD", items: [
      { label: "3–5 PEOPLE", text: "确认 3–5 位队友，推荐 4 人协作" },
      { label: "KEEP IT OPEN", text: "先确定队友，项目方向和功能还可以调整" },
      { label: "SET A NORTH STAR", text: "写下项目名、方向和最小可展示成果" },
      { label: "NEXT", text: "进入 Hack Block，把想法做成明天能展示的作品" }
    ] },
    "Hack Block": { title: "HACK BLOCK / MAKE IT REAL", items: [
      { label: "BUILD", text: "先完成一条能运行、能体验的核心路径" },
      { label: "MENTOR", text: "遇到困难可以找 Mentor，也可以随时求助" },
      { label: "CHECK-IN", text: "20:55 整理 Demo，21:05 准备今天收尾" },
      { label: "SCOPE", text: "先做小而完整的成果，再考虑继续扩展" }
    ] },
    "Day 1 Wrap": { title: "DAY 1 WRAP / CLOSE THE LOOP", items: [
      { label: "DONE TODAY", text: "今天已经完成了什么？" },
      { label: "BIGGEST PROBLEM", text: "现在最卡住你的地方是什么？" },
      { label: "TOMORROW MORNING", text: "明早第一件要做什么？" }
    ] },
    "Project Submission": { title: "PROJECT SUBMISSION / HAND IN THE CORE", items: [
      { label: "BASIC", text: "Team ID、项目名、主题和一句话介绍" },
      { label: "TEAM", text: "成员名单，以及每个人负责什么" },
      { label: "PRODUCT", text: "Problem、Solution、Demo 链接、GitHub 和截图" },
      { label: "AI CODING", text: "分享你使用 AI 的心得，以及它如何帮助你完成作品" }
    ] },
    "Stage Demo": { title: "STAGE DEMO / DEMO > PPT", items: [
      { label: "PROBLEM", text: "先说清楚：谁遇到了什么问题？" },
      { label: "PRODUCT", text: "用一句话说明：你们做了什么？" },
      { label: "DEMO", text: "直接展示产品最关键的一条使用路径" },
      { label: "TEAM", text: "让观众知道：是谁把它做出来的" }
    ] },
    "Demo Fair": { title: "DEMO FAIR / WALK, TRY, CONNECT", items: [
      { label: "WALK", text: "自由逛逛不同团队的展示点" },
      { label: "TRY", text: "亲手试试作品最核心的功能" },
      { label: "TALK", text: "和团队聊聊你的感受和建议" },
      { label: "VOTE", text: "投出你最喜欢的作品" }
    ] },
    "自由交流 / 结果统计": { title: "OPEN EXCHANGE / RESULTS IN PROGRESS", items: [
      { label: "KEEP MOVING", text: "继续逛项目、聊天、拍照" },
      { label: "VOTE CLOSED", text: "投票结束，结果正在统计" },
      { label: "NEXT", text: "16:05 预告颁奖" }
    ] },
    "Awards": { title: "AWARDS / SIMPLE, SHARED MOMENT", items: [
      { label: "INTRODUCE", text: "先认识今天的奖项" },
      { label: "ANNOUNCE", text: "公布获奖团队" },
      { label: "ON STAGE", text: "请获奖团队上台，分享一个瞬间" },
      { label: "PHOTO", text: "一起留下获奖合影" }
    ] },
    "Closing": { title: "CLOSING / KEEP MAKING TOGETHER", items: [
      { label: "LOOK BACK", text: "两天前还不存在的作品，今天被做出来了" },
      { label: "WHY MINICAMP", text: "因为一起创造，让陌生人有了连接" },
      { label: "WHO ARE WE", text: "喜欢这两天，就继续一起做东西" }
    ] },
    "Group Photo": { title: "GROUP PHOTO / KEEP THE MOMENT", items: [
      { label: "ALL PARTICIPANTS", text: "全体参与者合影" },
      { label: "TEAMS", text: "各团队与作品合影" },
      { label: "ORGANIZERS", text: "主办团队合影" },
      { label: "WINNERS", text: "获奖团队合影" }
    ] },
    "自由交流": { title: "OPEN NETWORKING / NO FORMAL PROGRAM", items: [
      { label: "ROAM", text: "继续参观和体验喜欢的项目" },
      { label: "CONNECT", text: "和队友、Mentor、学长学姐保持联系" },
      { label: "CONTINUE", text: "把今天的连接带到下一次创造" }
    ] }
  };
  const guideFor = item => item.reference || stageGuides[item.title] || null;

  function fitPreview() {
    const frame = node("stage-preview-frame");
    const preview = node("stage-preview");
    if (!frame || !preview) return;
    const scale = Math.min(frame.clientWidth / 1440, frame.clientHeight / 900);
    preview.style.transform = `scale(${scale})`;
  }

  function renderReference(item) {
    const targets = [node("stage-reference"), node("stage-screen-rail")].filter(Boolean);
    targets.forEach(target => {
      const reference = guideFor(item);
      const referenceKey = reference ? `${item.title}:${item.referenceTitle}` : "none";
      if (target.dataset.referenceKey === referenceKey) return;
      target.dataset.referenceKey = referenceKey;
      if (!reference) { target.hidden = true; target.innerHTML = ""; return; }
      const themes = reference.themes?.length ? `<div class="stage-reference-themes">${reference.themes.map(theme => `<span>${theme}</span>`).join("")}</div>` : "";
      const items = reference.items?.length ? `<div class="stage-reference-items">${reference.items.map((entry, index) => `<div class="stage-reference-item"><i>${String(index + 1).padStart(2, "0")}</i><div><b>${entry.label}</b><span>${entry.text}</span></div></div>`).join("")}</div>` : "";
      target.hidden = false;
      // Keep the audience deck focused on the actual prompts, without utility headers.
      target.innerHTML = `${themes}${items}`;
    });
  }

  function renderFeature(item, activePhase) {
    const target = node("stage-feature");
    if (!target) return;
    if (item.title === "Rules") {
      target.innerHTML = '<div class="stage-rule-grid"><div><b>3–5</b><span>每队 3–5 人，鼓励不同能力组合</span></div><div><b>2 DAYS</b><span>两天做出能运行、能展示的作品</span></div><div><b>AI CODING</b><span>开发时可用任意 AI 工具；作品不必包含 AI 功能</span></div><div><b>PROJECT SUBMISSION</b><span>截止前提交 Team ID、项目名、Problem、Solution 和演示链接</span></div><div><b>STAGE DEMO</b><span>按队伍上台，讲清 Problem、Product、Demo 和 Team</span></div><div><b>DEMO FAIR + VOTE</b><span>自由体验其他作品，并完成 People&apos;s Choice 现场投票</span></div></div>';
      return;
    }
    if (item.title === "Opening") {
      target.innerHTML = '<div class="stage-opening-feature"><div class="stage-opening-route"><span>DAY 01</span><b>MEET</b><i></i><b>MAKE</b><i></i><b>MOVE</b></div></div>';
      return;
    }
    if (item.title === "Theme Reveal") {
      target.innerHTML = '<div class="stage-theme-stack"><span>01 / Reimagine Campus</span><span>02 / Build for Humans</span><span>03 / Create the Unexpected</span></div>';
      return;
    }
    if (item.title === "AI Coding Quickstart") {
      target.innerHTML = '<div class="stage-feature-flow"><div><i>01</i><b>DESCRIBE</b><span>说清要解决的问题</span></div><div><i>02</i><b>BREAK DOWN</b><span>拆成今天能做的任务</span></div><div><i>03</i><b>RUN</b><span>先让它运行起来</span></div><div><i>04</i><b>DEBUG</b><span>根据报错继续提问</span></div><div><i>05</i><b>SHIP</b><span>交付可以展示的第一步</span></div></div>';
      return;
    }
    if (item.title === "Rules") {
      target.innerHTML = '<div class="stage-rule-grid"><div><b>3–5</b><span>每队 3–5 人，鼓励不同能力组合</span></div><div><b>2 DAYS</b><span>两天做出能运行、能展示的作品</span></div><div><b>AI CODING</b><span>开发时可用任意 AI 工具；作品不必包含 AI 功能</span></div><div><b>SHOW + VOTE</b><span>第二天完成项目提交、舞台路演、自由体验与现场投票</span></div></div>';
      return;
    }
    if (item.title === "Team Lock-in") {
      target.innerHTML = '<div class="stage-lock-flow"><div class="stage-lock-flow-node"><b>确认成员</b><span>锁定 3–5 位队友</span></div><div class="stage-lock-flow-arrow" aria-hidden="true">→</div><div class="stage-lock-flow-node"><b>明确方向</b><span>写下项目名称与核心问题</span></div><div class="stage-lock-flow-arrow" aria-hidden="true">→</div><div class="stage-lock-flow-node"><b>定下最小成果</b><span>确定明天可以展示的第一步</span></div></div>';
      return;
    }
    if (item.title === "Hack Block") {
      target.innerHTML = '<div class="stage-build-board"><div><b>BUILD</b><span>先让主流程跑起来</span></div><div><b>TEST</b><span>找队友或 Mentor 试用</span></div><div><b>SHOW</b><span>准备明天的展示</span></div></div>';
      return;
    }
    if (item.title === "Day 1 Wrap") {
      target.innerHTML = '<div class="stage-wrap-grid"><div><b>DONE TODAY</b><span>今天完成了什么</span></div><div><b>BIGGEST PROBLEM</b><span>现在卡在哪里</span></div><div><b>TOMORROW</b><span>明早先做什么</span></div></div>';
      return;
    }
    if (item.title === "Project Submission") {
      target.innerHTML = '<div class="stage-submission-grid stage-day2-cards"><div><b>BASIC</b><span>Team ID、项目名、Theme；用一句话说清作品。补充 Demo 链接、截图和封面。</span></div><div><b>TEAM</b><span>列出每位成员，并写清各自主要负责的工作。</span></div><div><b>PRODUCT</b><span>Problem：解决什么问题？Solution：你们的方案如何工作？附 GitHub（可选）。</span></div><div><b>AI CODING</b><span>分享你使用 AI 的心得，以及它如何帮助你完成作品。</span></div></div>';
      return;
    }
    if (item.title === "Stage Demo") {
      target.innerHTML = '<div class="stage-demo-board"><div class="stage-demo-hero"><b>DEMO &gt; PPT</b></div><div class="stage-demo-steps stage-day2-cards"><div><b>PROBLEM</b><span>谁遇到了什么问题</span></div><div><b>PRODUCT</b><span>你们做了什么</span></div><div><b>DEMO</b><span>展示最关键的一步</span></div><div><b>TEAM</b><span>介绍一起完成作品的队友</span></div></div></div>';
      return;
    }
    if (item.title === "Demo Fair") {
      target.innerHTML = '<div class="stage-fair-board stage-day2-cards"><div><b>WALK</b><span>自由逛不同团队的展示点</span></div><div><b>TRY</b><span>亲手体验作品最核心的功能</span></div><div><b>TALK</b><span>和团队聊聊你的感受和建议</span></div><div><b>VOTE</b><span>投出你最喜欢的作品</span></div></div>';
      return;
    }
    if (item.title === "自由交流 / 结果统计") {
      target.innerHTML = '<div class="stage-network-board stage-day2-cards"><div><b>KEEP MOVING</b><span>继续逛项目、聊天、拍照</span></div><div><b>VOTE CLOSED</b><span>投票结束，结果正在统计</span></div><div><b>NEXT</b><span>16:05 预告颁奖</span></div></div>';
      return;
    }
    if (item.title === "Awards") {
      target.innerHTML = '<div class="stage-awards-board stage-day2-cards"><div><b>BEST OVERALL · 最佳综合</b><span>整体完成度</span></div><div><b>BEST PRODUCT · 最佳产品</b><span>产品价值</span></div><div><b>BEST DESIGN · 最佳设计</b><span>设计与体验</span></div><div><b>BEST TECHNICAL · 最佳技术</b><span>技术实现</span></div><div><b>MOST UNEXPECTED · 最具惊喜</b><span>意外与想象力</span></div><div><b>PEOPLE\'S CHOICE · 人气之选</b><span>现场票选</span></div></div>';
      return;
    }
    if (item.title === "Closing") {
      target.innerHTML = '<div class="stage-closing-board stage-day2-cards"><div><b>LOOK BACK</b><span>两天前还不存在的作品，今天被做出来了</span></div><div><b>WHY MINICAMP</b><span>因为一起创造，让陌生人有了连接</span></div><div><b>WHO ARE WE</b><span>喜欢这两天，就继续一起做东西</span></div></div>';
      return;
    }
    if (item.title === "Group Photo") {
      target.innerHTML = '<div class="stage-photo-board stage-day2-cards"><div><b>ALL PARTICIPANTS</b><span>全体参与者</span></div><div><b>TEAMS</b><span>各团队与作品</span></div><div><b>ORGANIZERS</b><span>主办团队</span></div><div><b>WINNERS</b><span>获奖团队</span></div></div>';
      return;
    }
    if (item.title === "自由交流") {
      target.innerHTML = '<div class="stage-network-board stage-day2-cards"><div><b>ROAM</b><span>继续参观和体验喜欢的项目</span></div><div><b>CONNECT</b><span>与队友、Mentor、学长学姐保持联系</span></div><div><b>CONTINUE</b><span>把连接带到下一次一起创造</span></div></div>';
      return;
    }
    if (activePhase) {
      target.innerHTML = `<div class="stage-phase-card"><span>${activePhase.label}</span><b>${activePhase.title}</b><i></i></div>`;
      return;
    }
    target.innerHTML = "";
  }

  const contextOverrides = {
    "AI Coding Quickstart": ["AI CODING METHOD", "描述问题 · 拆成任务 · 运行调试", "作品不一定要有 AI 功能", "关键是用 AI Coding 把想法做出来"],
    Rules: ["MAKE THE RULES VISIBLE", "每队 3–5 人，4 人协作最方便", "不限制专业，也不要求你提前会编程", "第二天提交、展示、体验并投票"],
    "Team Lock-in": ["LOCK MEMBERS, KEEP THE IDEA OPEN", "确认 3–5 位队友和一个最小成果", "方向和功能还可以边做边调整", "下一站：Hack Block"],
    "Hack Block": ["PARTICIPANT-LED BUILD", "先完成一条能运行、能体验的核心路径", "遇到困难可以找 Mentor 求助", "20:55 整理 Demo，21:05 准备收尾"],
    "Day 1 Wrap": ["CLOSE THE LOOP", "Done Today：今天完成了什么", "Biggest Problem：现在卡在哪里", "Tomorrow Morning：明早先做什么"],
    "Project Submission": ["SUBMIT THE CORE", "Problem · Solution · Team · Demo · AI Coding", "确认链接、截图、封面和成员分工", "13:40 进入 Stage Demo"],
    "Stage Demo": ["DEMO > PPT", "Problem · Product · Demo · Team", "每队约 3 分钟，重点是让大家看懂和看到", "深入交流留到 Demo Fair"],
    "Demo Fair": ["WALK · TRY · VOTE", "逛项目、亲手试试、和团队聊聊", "投出你最喜欢的作品", "把舞台交给真实作品"],
    "自由交流 / 结果统计": ["RESULTS IN PROGRESS", "投票结束，继续逛项目和认识人", "主办方后台统计结果", "16:10 Awards"],
    "Awards": ["INTRODUCE · ANNOUNCE · PHOTO", "介绍奖项 → 公布团队 → 上台 → 合影", "为每一支队伍鼓掌，分享属于你们的高光时刻", "下一站：Closing"],
    "Closing": ["LOOK BACK · WHY · WHO", "回顾两天里一起做出的作品", "想想你和谁建立了新的连接", "喜欢这两天，就继续一起做东西"],
    "Group Photo": ["KEEP THE MOMENT", "全体、团队、主办方和获奖队伍依次合影", "按现场提示站位，给大家留下一张合照", "18:00 正式结束"],
    "自由交流": ["OPEN NETWORKING", "没有固定流程，去和你感兴趣的人聊聊", "继续体验、交换联系方式", "把今天的连接带到下一次创造"]
  };

  function renderContext(item, activePhase) {
    const target = node("stage-context");
    if (!target) return;
    const content = activePhase ? null : (contextOverrides[item.title] || ({
      "Opening": null,
      "AI Coding Quickstart": ["AI CODING METHOD", "描述问题 · 拆成任务 · 运行调试", "作品不一定要有 AI 功能", "关键是用 AI Coding 把想法做出来"],
      "Rules": ["MAKE THE RULES VISIBLE", "每队 3–5 人，4 人协作最方便", "不限制专业，也不要求你提前会编程", "第二天提交、展示、体验并投票"],
      "Theme Reveal": ["START WITH WHAT IS REAL", "从你真实遇到的人和校园问题出发"],
      "Idea Spark": ["INDIVIDUAL SPARK", "先独立写下一个问题或想法", "不需要成熟，真实和有趣就够了"],
      "Lightning Pitch": ["30–45 SECONDS", "不用 PPT · 不设现场 Q&A", "说清你想做什么、需要什么伙伴"],
      "Team Market": ["TEAM TARGET", "先聊再锁队 · 目标 3–5 人", "找到能互相补位的队友"],
      "Stage Demo": ["SHOW THE CORE", "说清问题 · 展示产品 · 介绍团队"],
      "Demo Fair": ["WALK · TRY · VOTE", "找到展位 · 亲手体验 · 投出喜欢的作品"]
    })[item.title]);
    target.hidden = !content;
    target.innerHTML = content ? content.map((entry, index) => `<span class="${index === 0 ? "stage-context-label" : ""}">${entry}</span>`).join("") : "";
  }

  function render() {
    const list = schedule[state.day];
    state.index = Math.min(list.length - 1, Math.max(0, state.index));
    const item = current();
    const visibleTitle = displayTitle(item);
    if (item.title === "Idea Collision" && state.ideaCollisionTimerVersion !== ideaCollisionTimerVersion) {
      state.ideaCollisionTimerVersion = ideaCollisionTimerVersion;
      state.phase = 0;
      state.remaining = null;
      state.endsAt = null;
      state.running = false;
      save();
    }
    if (item.phases && state.phase >= item.phases.length) state.phase = 0;
    const activePhase = phase();
    const seconds = remaining();
    const progress = item.timed ? Math.min(100, Math.max(0, (1 - seconds / duration()) * 100)) : 0;
    const screen = node("stage-screen");
    if (screen) { screen.classList.toggle("stage-team-work", !item.host); screen.classList.toggle("stage-no-timer", !item.timed); screen.classList.toggle("stage-title-long", visibleTitle.length > 16); screen.classList.toggle("stage-has-phase", Boolean(activePhase)); screen.dataset.stage = slug(item.title); screen.dataset.day = state.day; }
    if (screen) screen.dataset.layout = horizontalStages.has(item.title) ? "horizontal" : "vertical";
    setText("stage-day-label", `${state.day === "day1" ? "DAY 1" : "DAY 2"} / ${item.time}`);
    setText("stage-kind-label", item.host ? "HOST LED" : "TEAM WORK");
    const overline = node("stage-overline");
    if (overline) {
      overline.hidden = true;
      overline.textContent = "";
      overline.remove();
    }
    const subtitle = item.title === "Opening"
      ? "让不同背景的人相遇，一起做出真实作品"
      : item.title === "Theme Reveal" ? "" : audienceSubtitle(activePhase?.text || item.subtitle);
    setText("stage-title", visibleTitle); setText("stage-subtitle", subtitle); setText("stage-countdown", item.timed ? format(seconds) : "");
    setText("stage-next-label", list[state.index + 1] ? `NEXT · ${list[state.index + 1].title}` : "END OF RUN OF SHOW");
    setText("stage-status-label", item.timed ? (state.running ? "LIVE" : seconds <= 0 ? "TIME" : "READY") : (item.host ? "OPEN" : "TEAM WORK"));
    const pageIndex = `${String(state.index + 1).padStart(2, "0")} / ${String(list.length).padStart(2, "0")}`;
    setText("stage-script", item.script); setText("stage-index-label", pageIndex); setText("stage-page-index", pageIndex);
    const progressBar = node("stage-progress-bar"); if (progressBar) progressBar.style.width = `${progress}%`;
    renderFeature(item, activePhase);
    if (item.title === "Group Photo") {
      const feature = node("stage-feature");
      if (feature) feature.innerHTML = '<div class="stage-photo-new"><div class="stage-photo-new-head"><span>PHOTO CALL</span><b>ONE FRAME</b><small>KEEP THE MOMENT</small></div><div class="stage-photo-new-slots"><div><b>ALL PARTICIPANTS</b><span>全体参与者</span></div><div><b>TEAMS</b><span>各团队与作品</span></div><div><b>ORGANIZERS</b><span>主办团队</span></div><div><b>WINNERS</b><span>获奖团队</span></div></div></div>';
    }
    renderContext(item, activePhase);
    const cues = node("stage-cues"); if (cues) cues.innerHTML = (activePhase?.cues || item.cues).map(cue => `<span>${cue}</span>`).join("");
    renderReference(item);
    const toggle = node("stage-toggle"); if (toggle) { toggle.disabled = !item.timed; toggle.textContent = item.timed ? (state.running ? "暂停倒计时" : "开始倒计时") : "无需倒计时"; }
    [node("stage-timer-minus"), node("stage-timer-plus")].forEach(button => { if (button) button.disabled = !item.timed; });
    const phaseNext = node("stage-phase-next"); if (phaseNext) { const isFinalPhase = Boolean(activePhase && state.phase >= item.phases.length - 1); phaseNext.hidden = !activePhase; phaseNext.disabled = !activePhase || isFinalPhase; phaseNext.textContent = isFinalPhase ? "已到收敛步骤" : "下一步骤 →"; }
    const actions = node("stage-actions"); if (actions) actions.innerHTML = item.actions.map(action => `<li>${action}</li>`).join("");
  }

  function toggle() {
    if (!current().timed) return;
    if (state.running) { state.remaining = remaining(); state.endsAt = null; state.running = false; }
    else { state.endsAt = Date.now() + (state.remaining ?? duration()) * 1000; state.remaining = null; state.running = true; }
    save(); render();
  }
  function reset() { state.phase = 0; state.remaining = null; state.endsAt = null; state.running = false; save(); render(); }
  function move(delta) { state.index = Math.min(schedule[state.day].length - 1, Math.max(0, state.index + delta)); reset(); render(); }
  function adjustTimer(delta) {
    if (!current().timed) return;
    if (state.running && state.endsAt) state.endsAt = Math.max(Date.now(), state.endsAt + delta * 1000);
    else state.remaining = Math.max(0, Math.min(21600, (state.remaining ?? duration()) + delta));
    save(); render();
  }
  function movePhase() {
    const phases = current().phases;
    if (!phases || state.phase >= phases.length - 1) return;
    state.phase += 1; state.remaining = null; state.endsAt = null; state.running = false; save(); render();
  }
  function bind() {
    node("stage-day")?.addEventListener("change", event => { state.day = event.target.value; state.index = 0; reset(); render(); });
    node("stage-toggle")?.addEventListener("click", toggle); node("stage-timer-minus")?.addEventListener("click", () => adjustTimer(-60)); node("stage-timer-plus")?.addEventListener("click", () => adjustTimer(60)); node("stage-phase-next")?.addEventListener("click", movePhase); node("stage-reset")?.addEventListener("click", reset); node("stage-previous")?.addEventListener("click", () => move(-1)); node("stage-next")?.addEventListener("click", () => move(1));
    node("stage-fullscreen")?.addEventListener("click", () => {
      const popup = window.open("stage.html?present=1", "minicamp-stage", "popup=yes,width=1440,height=900,resizable=yes,scrollbars=no");
      if (popup) popup.focus();
    });
    const day = node("stage-day"); if (day) day.value = state.day;
    render();
    fitPreview();
    window.addEventListener("resize", fitPreview);
    const previewFrame = node("stage-preview-frame");
    if (window.ResizeObserver && previewFrame) new ResizeObserver(fitPreview).observe(previewFrame);
    setInterval(() => { if (state.running && remaining() <= 0) { state.running = false; state.remaining = 0; state.endsAt = null; save(); } render(); }, 250);
    window.addEventListener("storage", event => { if (event.key === key) applyExternalState(getState()); });
  }
  window.addEventListener("pagehide", () => channel?.close());
  bind();
})();
