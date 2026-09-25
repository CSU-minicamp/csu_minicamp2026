import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { createQaStore, QA_STATUSES, QA_PUBLIC_STATUSES } from "./storage/qa-store.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.join(root, "public");
const port = Number(process.env.MINICAMP_PORT || 4173);
const dbPath = path.join(root, "data", "minicamp.json");
const qaPath = path.join(root, "data", "qa.json");
const adminPassword = process.env.MINICAMP_ADMIN_PASSWORD || "123456";
/** 空库（app_state 里没有 main 行）时是否允许从本地 data/*.json 载入数据。默认拒绝，避免把本机旧数据写进库里。 */
const ALLOW_JSON_SEED = process.env.MINICAMP_ALLOW_JSON_SEED === "1";
const mysqlConfig = { host: process.env.MYSQL_HOST || "127.0.0.1", port: Number(process.env.MYSQL_PORT || 3306), user: process.env.MYSQL_USER || "root", password: process.env.MYSQL_PASSWORD || "", database: process.env.MYSQL_DATABASE || "minicamp2026", waitForConnections: true, connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 10), charset: "utf8mb4" };
const mime = {".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".json":"application/json; charset=utf-8",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg"};
const vendorFiles = new Map([["/vendor/chart.umd.min.js","chart.js/dist/chart.umd.js"]]);
const seed = {
  config: {
    eventName: "minicamp 2026",
    date: "2026-09-26/27",
    venue: "CSU Smart Classroom",
    applicationOpen: true,
    applicationDeadline: "2026-09-05T23:59:00+08:00",
    resultDate: "2026-09-08T18:00:00+08:00",
    themeReveal: "Day 1 09:45",
    voteStartAt: "2026-09-01T00:00:00+08:00",
    teamConfirmOpen: false,
    voteOpen: false,
    juryWeight: 40,
    participantWeight: 60,
    starterPack: {
      title: "AI Coding Starter Pack",
      intro: "Prepare your tools and environment before the event.",
      tools: ["Codex", "Claude Code", "Cursor", "GitHub Copilot"],
      steps: [
        "Install and sign in to your tool",
        "Prepare Node.js, Python and Git",
        "Ask AI to plan before splitting tasks",
        "Share complete errors and verify the result"
      ]
    }
  },

  applications: [],
  teams: [],
  ideas: [],
  projects: [],
  notices: [],
  votes: [],
  teamRequests: [],
  sessions: {}
};
let db;
let pool;
// 问答信息独立成表（qa_questions）；MySQL 不可用时回退到 data/qa.json。
const qaStore = createQaStore({
  query: (sql, params) => {
    if (!pool) throw new Error("MySQL unavailable");
    return pool.query(sql, params);
  },
  getPool: () => pool,
  fallbackPath: qaPath
});
const clone=x=>JSON.parse(JSON.stringify(x));
const qaStatuses=new Set(QA_STATUSES);
/** 主办方筛选参数：?status=pending,pinned → ["pending","pinned"]；无有效值则不过滤。 */
function parseQaStatusFilter(value){
  if(!value)return undefined;
  const wanted=String(value).split(",").map(x=>x.trim().toLowerCase()).filter(x=>qaStatuses.has(x));
  return wanted.length?wanted:undefined;
}
/** 公开列表要脱敏：不暴露提问人报名编号，也不暴露回答人标识。 */
function publicQuestion(row,followUps=[]){
  return {question_id:row.question_id,parent_question_id:row.parent_question_id||null,question:row.question,asked_at:row.asked_at,answer:row.answer,answered_at:row.answered_at,status:row.status,followUps};
}
/** 提问者本人与主办方看得到身份信息（用于"我的提问"与后台去重/追踪），并标出所属会话与层级。 */
function questionWithId(row){
  const {rootQuestionId,depth}=qaStore.rootOf(row.question_id);
  return {question_id:row.question_id,parent_question_id:row.parent_question_id||null,root_question_id:rootQuestionId||row.question_id,depth,asker_id:row.asker_id,question:row.question,asked_at:row.asked_at,answer:row.answer,answered_at:row.answered_at,status:row.status,answered_by:row.answered_by};
}
/**
 * 会话根不公开、但链上某条追问自己已公开时，把它作为 detached 条目返回（前端独立成卡）。
 * 根公开的会话不在此列 —— 那些追问已经挂在公开链里了。
 */
function qaDetachedQuestions(publicRoots){
  const publicRootIds=new Set(publicRoots.map(row=>row.question_id));
  const seen=new Set();
  const result=[];
  for(const row of qaStore.list({status:[...QA_PUBLIC_STATUSES]})){
    if(!row.parent_question_id)continue;
    const {rootQuestionId}=qaStore.rootOf(row.question_id);
    if(!rootQuestionId||publicRootIds.has(rootQuestionId)||seen.has(row.question_id))continue;
    seen.add(row.question_id);
    result.push({...publicQuestion(row),detached:true,root_question_id:rootQuestionId});
  }
  return result;
}
/**
 * 公开页面的追问链：只展示公开状态的追问，但会保留"通往更深公开追问"的链接节点
 * （父问题被隐藏、父还没回答时，已公开的子追问不会丢，客户端会把它断开独立显示）。
 */
function qaPublicFollowUps(rootQuestionId){
  const session=qaStore.listSession(rootQuestionId);
  const childrenOf=parentId=>session.filter(row=>String(row.parent_question_id||"")===String(parentId));
  const isVisible=row=>QA_PUBLIC_STATUSES.includes(row.status)||childrenOf(row.question_id).some(isVisible);
  const build=parentId=>childrenOf(parentId).filter(isVisible).map(row=>publicQuestion(row,build(row.question_id)));
  return build(rootQuestionId);
}
/** 后台列表：每个会话根对应的追问条数、未回答追问数与最后活动时间（用于列表角标与排序）。 */
function qaThreadSummary(questions){
  const summary={};
  for(const row of questions){
    if(!row.parent_question_id)continue;
    const {rootQuestionId}=qaStore.rootOf(row.question_id);
    if(!rootQuestionId)continue;
    const entry=summary[rootQuestionId]||(summary[rootQuestionId]={rootQuestionId,followUpCount:0,pendingFollowUpCount:0,lastActivityAt:null});
    entry.followUpCount+=1;
    if(row.status==="pending")entry.pendingFollowUpCount+=1;
    if(!entry.lastActivityAt||String(row.asked_at)>String(entry.lastActivityAt))entry.lastActivityAt=row.asked_at;
  }
  for(const entry of Object.values(summary)){
    const thread=qaStore.threadInfo(entry.rootQuestionId);
    if(thread?.last_activity_at&&(!entry.lastActivityAt||thread.last_activity_at>entry.lastActivityAt))entry.lastActivityAt=thread.last_activity_at;
  }
  return summary;
}
/** 后台需要每条问题带上「属于哪个会话 / 层级 / 自己的追问情况」，前端才能渲染追问链。 */
function adminQaQuestion(row,summary){
  return {...questionWithId(row),thread:summary[row.question_id]||null};
}
const makeId=p=>p+"-"+crypto.randomBytes(5).toString("hex").toUpperCase();
const makeToken=()=>crypto.randomBytes(24).toString("hex");
const applicationStatuses=new Set(["待审核","已录取","已通过","候补","待复审","未通过"]);
const formalAwards=["Best Overall","Best Product","Best Design","Best Technical","Most Unexpected"];
async function readJsonDb(){try{return JSON.parse(await fs.readFile(dbPath,"utf8"));}catch{return clone(seed);}}
async function loadDb(){
  try {
    let bootstrap;
    try { bootstrap=await mysql.createConnection({host:mysqlConfig.host,port:mysqlConfig.port,user:mysqlConfig.user,password:mysqlConfig.password}); await bootstrap.query("CREATE DATABASE IF NOT EXISTS "+mysqlConfig.database+" CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"); }
    finally { await bootstrap?.end().catch(()=>{}); }
    pool=mysql.createPool(mysqlConfig);
    await pool.query("CREATE TABLE IF NOT EXISTS app_state (state_key VARCHAR(64) NOT NULL PRIMARY KEY, state_json JSON NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB");
    const [rows]=await pool.query("SELECT state_json FROM app_state WHERE state_key = 'main'");
    if(rows.length)db=typeof rows[0].state_json === "string" ? JSON.parse(rows[0].state_json) : rows[0].state_json;
    else if(ALLOW_JSON_SEED){console.warn("[warn] app_state 里没有 main 行，按 MINICAMP_ALLOW_JSON_SEED=1 从 "+dbPath+" 载入本地数据。");db=await readJsonDb();}
    else {
      console.error([
        "[fatal] 数据库 "+mysqlConfig.database+" 连得上，但 app_state 里没有 state_key='main' 那一行。",
        "        为免把本机旧数据写进库里，这里不会去读 "+dbPath+"。",
        "        新库请先导入镜像：mysql -u "+mysqlConfig.user+" -p < storage/minicamp2026-init.sql",
        "        确实要用本地 JSON 数据启动，请设 MINICAMP_ALLOW_JSON_SEED=1 后重试。"
      ].join("\n"));
      process.exit(1);
    }
  } catch(error) {
    pool=undefined;
    db=await readJsonDb();
    console.warn("MySQL unavailable; using JSON storage at "+dbPath+". "+error.message);
  }
  for(const key of Object.keys(seed))if(!(key in db))db[key]=clone(seed[key]);
  db.config={...clone(seed.config),...(db.config||{})};
  // 问答存在独立表里：整理通知前先读一次，才能把「已回答」通知对回真正存在的问题。
  await qaStore.initialize();
  await saveDb();
}
let saveQueue=Promise.resolve();
function saveDb(){saveQueue=saveQueue.catch(()=>{}).then(async()=>{if(pool)await pool.query("INSERT INTO app_state (state_key, state_json) VALUES ('main', ?) ON DUPLICATE KEY UPDATE state_json = VALUES(state_json)",[JSON.stringify(db)]);else{await fs.mkdir(path.dirname(dbPath),{recursive:true});await fs.writeFile(dbPath,JSON.stringify(db,null,2),"utf8");}});return saveQueue;}
function safe(x){if(!x)return null;const v={...x};delete v.password;return v;}
/**
 * 对外展示的成员视图（白名单）。
 * 组队工作区 / 项目 Gallery 只需要「谁在这个队里、什么专业、什么能力」，
 * 手机号、邮箱、学号、参与动机、经历、作品集这些报名资料一律不下发。
 * 注意：不要用 safe()（黑名单，只删 password）来当对外视图 —— applications 里没有 password，等于没过滤。
 */
function memberView(application) {
  if (!application) return null;
  return {
    id: application.id,
    name: application.name || "",
    college: application.college || "",
    major: application.major || "",
    grade: application.grade || "",
    skills: Array.isArray(application.skills) ? application.skills : [],
    status: application.status || "",
    registrationType: application.registrationType
  };
}
function send(res,status,data){res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"});res.end(JSON.stringify(data));}
function fail(res,status,message){send(res,status,{error:message});}
function body(req){return new Promise((resolve,reject)=>{let raw="";req.on("data",x=>{raw+=x;if(raw.length>8000000)reject(new Error("body too large"));});req.on("end",()=>{try{resolve(raw?JSON.parse(raw):{});}catch{reject(new Error("invalid JSON"));}});req.on("error",reject);});}
function session(req,role){const h=req.headers.authorization||"";const key=h.startsWith("Bearer ")?h.slice(7):"";const s=db.sessions[key];return s&&(!role||s.role===role)?s:null;}
function person(req){const s=session(req,"participant");return s&&db.applications.find(x=>x.id===s.userId);}
function publicVoter(req){return session(req,"voter");}
function admin(req){return Boolean(session(req,"admin"));}
/**
 * 队伍视图。includeCode 默认 false（公开视角不下发邀请码）：
 * 只有「本队成员 / 主办方」的接口显式传 {includeCode:true}，匿名列表拿不到队伍邀请码。
 */
function teamView(team,{includeCode=false}={}){
  if(!team)return null;
  const view={...team,members:team.memberIds.map(x=>memberView(db.applications.find(a=>a.id===x))).filter(Boolean)};
  if(!includeCode)delete view.code;
  return view;
}
function projectView(project,options){return {...project,team:teamView(db.teams.find(x=>x.id===project.teamId),options)};}
function votingIsOpen(){return Boolean(db.config.voteOpen);}
function voteView(vote){return vote?{id:vote.id,createdAt:vote.createdAt,selections:(vote.selections||[]).map(selection=>({...selection,projectName:db.projects.find(project=>project.id===selection.projectId)?.projectName||"已删除项目"}))}:null;}
/** 大众投票身份：姓名 + 报名编号（MC26-… / RO-…），与报名系统共用同一套编号。 */
function normalizeVoterIdentity(data){
  const name=String(data.name||"").normalize("NFKC").trim().replace(/\s+/g," ");
  const code=String(data.code||data.applicationId||data.id||"").normalize("NFKC").trim().toUpperCase().replace(/[\s-]/g,"");
  if(name.length<1||name.length>40)return {error:"请输入真实姓名。"};
  if(!/^(MC26|RO)\d{4,12}$/.test(code))return {error:"请输入报名编号，例如 MC26-1001 或 RO-2026-000001。"};
  const digest=value=>crypto.createHmac("sha256",process.env.MINICAMP_VOTER_SECRET||adminPassword).update(value).digest("hex");
  return {name,code,credentialHash:digest("code:"+code),identityHash:digest("identity:"+[name,code].join("|"))};
}
function duplicatePublicVote(identity){return db.votes.find(vote=>vote.role==="participant"&&(vote.voterCredentialHash===identity.credentialHash||vote.voterIdentityHash===identity.identityHash));}
/** 投票人展示编号：优先投票记录上存下的编号；参与者本人投票用报名编号兜底；历史大众票用去重哈希回查会话。 */
const voterCode = vote =>
  String(vote?.voterCode || "")
    .replace(/[\s-]/g, "")
    .toUpperCase();
function testFixtureMode(){return Boolean(db.testFixtures?.active);}
/** 主办方视角的收件人：定向通知是一位报名者，广播通知是全部报名者。 */
const noticeRecipients=target=>String(target||"ALL")==="ALL"?(db.applications||[]).map(item=>item.id):[String(target)];
/** 通知标题按视角区分：提问者看到「你的提问已回答」，主办方看到「已回答提问」。 */
const NOTICE_TYPE_LABEL = {
  "问答": "问答回复",
  "资料修改": "资料修改（自动）",
  "项目审核": "项目审核",
  "活动公告": "活动公告",
  "报名提交": "用户报名（自动）",
  "状态修改": "状态修改（自动）",
  "录取结果": "录取结果",
  "现场提醒": "现场提醒",
  "组队消息": "组队消息（自动）"
};
/**
 * 系统自动生成的消息（三合一后的类型）。
 * 这些消息对选手一律不显示（只进主办方列表，由后台开关决定默认是否展开），
 * 且前端请求不能凭空造出多条：报名提交只在新报名时写一次，改资料去重成一条未读，
 * 状态修改只在状态值真的变化时写一条。
 */
/**
 * 系统自动生成的消息。
 * 这类消息在主办方列表里默认收起（可用「显示自动消息」展开）；
 * 其中三类（用户报名 / 资料修改 / 状态修改）对选手完全不可见，
 * 问答回复虽然也是自动生成，但它是主办方对「你的提问」的回复，选手端照常显示。
 */
const AUTO_NOTICE_TYPES =
  new Set([
    "报名提交",
    "资料修改",
    "状态修改",
    "组队消息"
  ]);
const PARTICIPANT_HIDDEN_NOTICE_TYPES =
  new Set([
    "报名提交",
    "资料修改",
    "状态修改"
  ]);
const noticeTypeOf = notice => String(notice?.type || "");
const isQaNotice = notice => notice?.contextType === "问答" || noticeTypeOf(notice) === "问答";
const isAutoNotice=notice=>AUTO_NOTICE_TYPES.has(noticeTypeOf(notice))||isQaNotice(notice);
/** 选手收件箱可见的通知：报名 / 资料 / 状态三类自动消息不下发，问答回复照常下发。 */
const noticeVisibleToParticipant=notice=>!PARTICIPANT_HIDDEN_NOTICE_TYPES.has(noticeTypeOf(notice));
/**
 * 三类自动消息去重用的稳定事件键：
 *   用户报名 = 每人一条；资料修改 = 每人一条未读（重复保存时就地更新）；状态修改 = 每次真实变化一条。
 * 有 key 的通知走 addNotice 的「已存在则更新」分支，不会因为重复请求刷屏。
 */
const AUTO_NOTICE_KEY={signup:id=>`用户报名:${id}`,profile:id=>`资料修改:${id}`,status:(id,at)=>`状态修改:${id}:${at}`};
/**
 * 需要报名者回复的通知（例如录取确认）默认给两个选项：
 * value 落库、label 显示，改了 label 不会影响已收集的回复。
 */
const DEFAULT_REPLY_OPTIONS=[{value:"attend",label:"我会参与"},{value:"decline",label:"我不会参与"}];
const replyOptionsOf=notice=>Array.isArray(notice?.replyOptions)&&notice.replyOptions.length?notice.replyOptions:DEFAULT_REPLY_OPTIONS;
/**
 * 通知正文格式：显式写了就用写的；没写时，按状态定制内容的通知（录取结果）默认超文本，
 * 其它通知（问答回复、状态变更等）保持原来的纯文本渲染，行为不变。
 */
const noticeFormatOf=notice=>notice?.format==="html"?"html":notice?.format==="text"?"text":(Array.isArray(notice?.contents)&&notice.contents.length?"html":"text");
/** 按报名状态分发内容（录取结果）：每段自带标题，标题与正文重复，两端都只显示正文。 */
const isStatusNotice=notice=>Array.isArray(notice?.contents)&&notice.contents.length>0;
/** 一次改动涉及了哪些字段：只报字段名，不带值（够用，也不把敏感信息再抄一份）。 */
const changedFieldText=(keys,labels={})=>[...new Set(keys)].map(key=>labels[key]||key).join("、");
/**
 * 「资料修改（自动）」的对比：保存前用 snapshot 记下这几个可编辑字段的值，
 * 保存后（Object.assign 之后）用 changed 找出真正变了的字段。
 * skills 是数组，快照必须存值而不是引用，否则同一对象后续被改写会污染比较基线。
 */
const profileFieldSnapshot=participant=>({skills:[...(participant?.skills||[])],motivation:participant?.motivation,experience:participant?.experience,portfolio:participant?.portfolio});
const changedProfileFields=(data,participant,before)=>(participant&&contestantEditableFields||[]).filter(key=>Object.hasOwn(data,key)&&JSON.stringify(before?.[key]??"")!==JSON.stringify(participant?.[key]??""));
/**
 * 按报名状态取这条通知给某个人的内容：
 *   - 没有 contents 的通知（普通公告）= 通知自己的 title/body，人人可见；
 *   - 有 contents 的通知（录取结果）= 命中自己 status 的那一条；
 *     没命中（或该状态留空）= 返回 null，表示这个人根本不该收到这条通知。
 */
function noticeContentFor(notice,participant){
  const contents=Array.isArray(notice?.contents)?notice.contents.filter(row=>row&&String(row.body||"").trim()):[];
  if(!contents.length)return {title:String(notice?.title||""),body:String(notice?.body||"")};
  const status=String(participant?.status||"");
  const row=contents.find(item => Array.isArray(item.statuses) && item.statuses.some(value => String(value) === status));
  if(!row)return null;
  return {title:String(row.title||notice?.title||""),body:String(row.body||"")};
}
const noticeContentStatuses = notice =>
  (Array.isArray(notice?.contents) ? notice.contents : [])
    .flatMap(row =>
      Array.isArray(row?.statuses) ? row.statuses : []
    )
    .filter(Boolean)
    .map(String);
/** 应回复的人 = 通知收件人里「已录取的参赛者」；路演观众与未录取者不需要确认参与。 */
const replyRecipientsOf=(notice,ids)=>{const eligible=new Set((db.applications||[]).filter(item=>isContestant(item)&&isAccepted(item)).map(item=>item.id));return (ids||noticeRecipients(notice.target)).filter(id=>eligible.has(id));};
const IS_QA_NOTICE = notice =>
  notice?.contextType === "问答" ||
  notice?.type === "问答";
function noticeTitleFor(notice,audience){
  if(!IS_QA_NOTICE(notice))return String(notice?.title||"");
  const followUp=String(notice?.title||"").includes("追问");
  if(audience==="admin")return followUp?"已回答追问":"已回答提问";
  return followUp?"你的追问已回答":"你的提问已回答";
}
/**
 * 主办方通知列表用的视图：带上「谁收到了 / 谁读了」的实时统计与提问人，
 * 这样后台不必自己拼报名名单，也能立刻看到选手读没读。
 */
function adminNoticeView(notice){
  const recipients=noticeRecipients(notice.target);
  const statusOf=id=>String((db.applications||[]).find(item=>item.id===id)?.status||"");
  const contentRows=Array.isArray(notice.contents)?notice.contents.map(row=>{
    const statuses = Array.isArray(row?.statuses) ? row.statuses.map(String) : [];
    return {statuses,status:statuses.join(" · "),title:String(row?.title||""),body:String(row?.body||""),recipientCount:recipients.filter(id=>statuses.includes(statusOf(id))).length};
  }):[];
  // 有按状态内容时，真正的收件人只有「命中某个状态」的那批人；留空的状态不发送。
  const notified=contentRows.length?recipients.filter(id=>noticeContentFor(notice,db.applications.find(item=>item.id===id))):recipients;
  const recipientSet=new Set(notified);
  const readBy=[...new Set((notice.readBy||[]).map(String))].filter(id=>recipientSet.has(id));
  const broadcast=String(notice.target||"ALL")==="ALL";
  const asker=broadcast?"":(db.applications||[]).find(item=>item.id===String(notice.target))?.name||"";
  const requiresReply=Boolean(notice.requiresReply);
  const replyOptions=requiresReply?replyOptionsOf(notice):[];
  const replyRecipients=requiresReply?replyRecipientsOf(notice,notified):[];
  const replies=notice.replies||{};
  const replyRows=replyRecipients.filter(id=>replies[id]).map(id=>{
    const person=(db.applications||[]).find(item=>item.id===id);
    const value=String(replies[id].value||"");
    return {id,name:person?.name||"",college:person?.college||"",major:person?.major||"",value,label:replyOptions.find(option=>String(option.value)===value)?.label||value,at:replies[id].at||""};
  });
  return {
    id:notice.id,
    type:notice.type,
    // auto=true 表示系统自动生成的消息：后台默认收起，选手端不下发（见 AUTO_NOTICE_TYPES）。
    auto:isAutoNotice(notice),
    typeLabel:NOTICE_TYPE_LABEL[notice.type]||String(notice.type||"通知"),
    title:noticeTitleFor(notice,"admin")||contentRows[0]?.title||String(notice.title||""),
    body:notice.body,
    target:notice.target,
    broadcast,
    recipientCount:notified.length,
    skippedCount:Math.max(0,recipients.length-notified.length),
    contentRows,
    format:noticeFormatOf(notice),
    recipientLabel:broadcast?"所有人（所有报名者）":[...new Set([asker,notice.target].filter(Boolean))].join(" · "),
    readCount:readBy.length,
    unreadCount:Math.max(0,notified.length-readBy.length),
    readBy,
    requiresReply,
    replyOptions,
    replySummary:requiresReply?{
      eligible:replyRecipients.length,
      replied:replyRows.length,
      pending:Math.max(0,replyRecipients.length-replyRows.length),
      counts:replyOptions.map(option=>({value:option.value,label:option.label,count:replyRows.filter(row=>String(row.value)===String(option.value)).length}))
    }:null,
    replies:replyRows,
    contextType:notice.contextType||"",
    contextId:notice.contextId||"",
    createdAt:notice.createdAt,
    updatedAt:notice.updatedAt||""
  };
}
const noticeKeyOf=(notice)=>String(notice?.key||"")||`${notice?.type||"notice"}:${notice?.target||"ALL"}:${notice?.contextId||notice?.id||""}`;
const noticeExtraFields=options=>{
  const extra={};
  if(options.requiresReply!==undefined){
    extra.requiresReply=Boolean(options.requiresReply);
    if(extra.requiresReply)extra.replyOptions=Array.isArray(options.replyOptions)&&options.replyOptions.length?options.replyOptions:DEFAULT_REPLY_OPTIONS;
  }
  if(options.format!==undefined)extra.format=options.format==="text"?"text":"html";
  if(options.contents!==undefined)extra.contents=Array.isArray(options.contents)?options.contents:[];
  return extra;
};
/**
 * 写入通知。同一事件键已存在时不重复写入，而是就地更新内容（保留首次时间与已读记录），
 * 这样「回答被修改」「置顶/隐藏来回切换」都只对应收件箱里的一条。
 * 结果类通知（资料更新、状态变更）每次都是一件新事，不传 key，各留一条。
 * options.requiresReply 会让这条通知带上「参与确认」按钮，回复落库到 notice.replies。
 */
function addNotice(title,bodyText,type,target="ALL",options={}){
  const noticeKey=options.key||`${type}:${target}:${makeId("EVENT")}`;
  const extra=noticeExtraFields(options);
  const existing=db.notices.find(item=>noticeKeyOf(item)===noticeKey);
  if(existing){
    // 内容真的变了（例如答案被改写、问题从待回答变已回答）就当作一件新消息：
    // 已读记录清空，收件箱重新显示未读气泡，主办方那边也能看到新的已读进度。
    const changed=existing.body!==bodyText||existing.title!==title;
    existing.title=title;existing.body=bodyText;existing.type=type;existing.target=target;
    existing.contextType=options.contextType||"";existing.contextId=options.contextId||"";
    // 回复类字段跟随更新，但已收集的回复保留（同一件事的答复不因为改文案而作废）。
    if(extra.requiresReply!==undefined)existing.requiresReply=extra.requiresReply;
    if(extra.replyOptions)existing.replyOptions=extra.replyOptions;
    if(extra.format!==undefined)existing.format=extra.format;
    if(extra.contents!==undefined)existing.contents=extra.contents;
    existing.updatedAt=new Date().toISOString();
    if(changed){existing.createdAt=existing.updatedAt;existing.readBy=[];existing.readAt={};}
    return existing;
  }
  const notice={id:options.id||makeId("NOTICE"),key:noticeKey,title,body:bodyText,type,target,contextType:options.contextType||"",contextId:options.contextId||"",readBy:[],readAt:{},createdAt:new Date().toISOString(),updatedAt:"",testFixture:testFixtureMode(),...extra};
  db.notices.unshift(notice);
  return notice;
}
/**
 * 选手视角的通知视图：只保留自己的已读记录与自己的回复，
 * 不能把别人的 readBy / replies 一起发下去；
 * 按状态定制的通知（录取结果）在这里解析成「这个人该看到的那一份」，
 * 没命中任何状态就返回 null —— 调用方据此把这条通知从收件箱里剔除。
 */
function participantNoticeView(notice,participant){
  const meId=String(participant?.id||"");
  const content=noticeContentFor(notice,participant);
  if(!content)return null;
  const copy={...notice};
  copy.title=noticeTitleFor(notice,"participant")||content.title;
  copy.body=content.body;
  copy.format=noticeFormatOf(notice);
  copy.typeLabel=NOTICE_TYPE_LABEL[notice.type]||String(notice.type||"通知");
  // 录取结果按状态分发：同一段内容里标题与正文重复，选手端只显示正文（前端据此不渲染标题）。
  copy.hideTitle=isStatusNotice(notice);
  copy.readBy=(notice.readBy||[]).some(id=>String(id)===meId)?[meId]:[];
  copy.readAt=notice.readAt&&notice.readAt[meId]?{[meId]:notice.readAt[meId]}:{};
  copy.myReply=(notice.replies||{})[meId]||null;
  copy.canReply=Boolean(notice.requiresReply&&isContestant(participant)&&isAccepted(participant));
  delete copy.replies;
  delete copy.contents;
  delete copy.key;
  return copy;
}
/**
 * 问答回答/公开后通知提问者。一次回答只通知一次：
 * key 里带上问题编号，答案被修改、状态在「已回答 / 置顶」之间切换都只更新同一条通知，
 * 服务器重启也不会重新通知（之前靠内存数组，重启即失效，才会刷出上百条重复）。
 */
function notifyQaAnswered(question){
  if(!question)return;
  const followUp=/追问/.test(String(question.title||""));
  const heading=followUp?"你的追问":"你的提问";
  const body=[`${heading}：${question.question}`,"",`主办方回答：${question.answer||""}`,"","在 <a href=\"qa.html\">Q&A 页面</a> 可以随时查看。"];
  addNotice(`${heading}已回答`,body.join("\n"),"问答",question.asker_id,{
    key:`问答:${question.asker_id}:${question.question_id}`,
    contextType:"问答",
    contextId:question.question_id,
    format:"html"
  });
}
function normalizeVoteSelections(selections,role){
  if(!Array.isArray(selections))return null;
  const expected=role==="participant"?[...formalAwards,"People's Choice"]:formalAwards;
  if(selections.length!==(role==="participant"?formalAwards.length*3+1:formalAwards.length))return null;
  const normalized=[];
  for(const award of expected){
    const rows=selections.filter(item=>item?.award===award);
    if(role==="participant"&&award!=="People's Choice"){
      if(rows.length!==3||new Set(rows.map(item=>item.projectId)).size!==3||rows.map(item=>Number(item.points)).sort((a,b)=>a-b).join(",")!=="1,2,3")return null;
    } else if(rows.length!==1||Number(rows[0].points)!==(award==="People's Choice"?1:3))return null;
    for(const row of rows){if(typeof row.projectId!=="string"||!row.projectId.trim()||!Number.isInteger(Number(row.points)))return null;normalized.push({award,projectId:row.projectId,points:Number(row.points)});}
  }
  return normalized;
}
function calcResults(){const map={};for(const vote of db.votes)for(const x of vote.selections||[]){const k=x.award+":"+x.projectId;map[k]??={award:x.award,projectId:x.projectId,participant:0,jury:0};map[k][vote.role]+=Number(x.points||0);}return Object.values(map).map(x=>({...x,total:x.participant+x.jury,weighted:x.participant*db.config.participantWeight/100+x.jury*db.config.juryWeight/100})).sort((a,b)=>b.weighted-a.weighted);}
function participationModeFor(grade) {
  return grade === "大一"
    ? "仅参与路演及后续投票等阶段，不参与开发环节"
    : "可参与完整活动流程";
}
function isContestant(p){return p?.registrationType === "contestant";}
const contestantBasicFields=["name","studentId","college","major","grade","phone","email"];
const contestantEditableFields=["skills","motivation","experience","portfolio"];
const identityFields=["name","studentId","college","major","phone","email"];
const fieldLabels={name:"姓名",studentId:"学号",college:"学院",major:"专业",grade:"年级",phone:"手机号",email:"邮箱",motivation:"参与动机"};
/**
 * 通知正文里的字段名：跟「我的资料」表单上的标签一致。
 * fieldLabels 是给校验错误信息用的（简短），这里额外补上表单项的完整叫法。
 */
const noticeFieldLabels={...fieldLabels,skills:"能力标签",experience:"做过的项目或相关经历",portfolio:"GitHub / 作品集 / 个人主页"};
function normalizeContestantProfile(participant) {
  return {
    name: String(participant?.name || ""),
    studentId: String(participant?.studentId || ""),
    college: String(participant?.college || ""),
    major: String(participant?.major || ""),
    grade: String(participant?.grade || ""),
    phone: String(participant?.phone || ""),
    email: String(participant?.email || "")
  };
}
// 老数据可能缺少 grade（报名表加入年级之前提交的记录），身份与联系方式齐全即可被加入队伍（成员同样必须是已录取状态）。
const memberProfileGaps=p=>{if(!p)return identityFields.slice();const normalized=normalizeContestantProfile(p);return identityFields.filter(key=>!String(normalized[key]||"").trim());};
function isProfileComplete(participant){
  if(!participant)return false;
  const normalized=normalizeContestantProfile(participant);
  return !memberProfileGaps(participant).length&&Boolean(String(normalized.grade||"").trim())&&Boolean(String(participant.motivation||"").trim());
}
const lockedContestantProfile=normalizeContestantProfile;
/**
 * 参赛者资料保存。成功时返回 {changed:[字段名]}：改动只在函数内部算得出来，
 * 因为函数自己就把 participant 改了（调用方拿不到「改动前」的值）。
 * 对比前用 profileFieldSnapshot 存值：skills 是数组，存引用会被后续赋值污染基线。
 */
function patchContestantProfile(participant,data){
  const locked=lockedContestantProfile(participant);
  if(contestantBasicFields.some(key=>Object.hasOwn(data,key)&&String(data[key]??"").trim()!==locked[key].trim()))return {status:403,message:"基本信息不可修改"};
  const next={...participant,...locked};
  for (const key of contestantEditableFields) {
  if (Object.hasOwn(data, key)) {
    next[key] =
      key === "skills"
        ? (Array.isArray(data[key]) ? data[key] : [])
        : data[key];
  }
}
  if(!isProfileComplete(next))return {status:400,message:"required fields missing"};
  const before=profileFieldSnapshot(participant);
  Object.assign(participant,locked);
  for(const key of contestantEditableFields)if(Object.hasOwn(data,key))participant[key]=next[key];
  participant.entryType="个人报名";
  participant.participationMode=participationModeFor(participant.grade);
  // 选手修改个人资料只更新资料本身，不改动录取状态（保留原有 status）。
  participant.updatedAt=new Date().toISOString();
  return {changed:contestantEditableFields.filter(key=>Object.hasOwn(data,key)&&JSON.stringify(before[key]??"")!==JSON.stringify(participant[key]??""))};
}
function isAccepted(p){return Boolean(p&&(p.status==="已录取"||p.status==="已通过"));}
function nextRoadshowCode(){const year=new Date().getFullYear();const max=(db.applications||[]).reduce((n,x)=>{const m=String(x.id||"").match(/^RO-\d{4}-(\d{6})$/);return m?Math.max(n,Number(m[1])):n;},0);return "RO-"+year+"-"+String(max+1).padStart(6,"0");}
/**
 * 组队工作区的准入门槛：只有状态为「已录取」的参赛者可以进入、加入与锁定。
 * 路演报名（已通过）与参赛报名里的其他状态（待审核 / 待复审 / 候补 / 未通过）都不算。
 */
function isTeamEligible(p){return Boolean(p&&isContestant(p)&&String(p.status||"")==="已录取");}
const TEAM_MESSAGE_TYPE="组队消息";
function teamRequests(){if(!Array.isArray(db.teamRequests))db.teamRequests=[];return db.teamRequests;}
const teamOf=p=>db.teams.find(team=>(team.memberIds||[]).includes(p?.id));
const displayNameOf=id=>String(db.applications.find(item=>String(item.id)===String(id))?.name||id||"");
/** 消息里提到队伍时统一用「队伍名 / 队伍编号」，老数据可能没有 project 字段。 */
const teamTitleOf=team=>String(team?.project||team?.id||"队伍");
/** 组队消息（自动）：发给某个参与者的定向通知，后台默认收在「自动消息」里。 */
const notifyTeamParticipant=(id,title,bodyText)=>{if(id)addNotice(title,bodyText,TEAM_MESSAGE_TYPE,String(id),{contextType:"组队"});};
/** 关闭一支队伍的所有待处理申请，并逐条给申请人发组队消息。 */
function closeTeamRequests(teamId,status,title,bodyText){
  const rows=teamRequests().filter(row=>row.teamId===teamId&&row.status==="pending");
  const at=new Date().toISOString();
  for(const row of rows){row.status=status;row.closedAt=at;notifyTeamParticipant(row.applicantId,title,typeof bodyText==="function"?bodyText(row):bodyText);}
  return rows.length;
}
/** 关闭某个申请人的所有待处理申请（例如他已经加入别的队伍 / 已经建队）。 */
function closeApplicantRequests(applicantId,status,title,bodyText){
  const rows=teamRequests().filter(row=>row.applicantId===applicantId&&row.status==="pending");
  const at=new Date().toISOString();
  for(const row of rows){row.status=status;row.closedAt=at;notifyTeamParticipant(row.applicantId,title,typeof bodyText==="function"?bodyText(row):bodyText);}
  return rows.length;
}
const pendingRequestOf=applicantId=>teamRequests().find(row=>row.applicantId===applicantId&&row.status==="pending");
/** 入队申请视图：带上队伍摘要与申请人公开资料，前端不必再查一遍。 */
function requestView(row){
  const team=db.teams.find(item=>item.id===row.teamId),applicant=db.applications.find(item=>String(item.id)===String(row.applicantId)),owner=db.applications.find(item=>String(item.id)===String(team?.ownerId));
  return {...row,team:team?{id:team.id,project:team.project,code:team.code,memberCount:(team.memberIds||[]).length,locked:Boolean(team.locked),published:Boolean(team.published)}:null,applicant:applicant?memberView(applicant):null,owner:owner?{id:owner.id,name:owner.name||""}:null};
}
function parseTeamMemberIds(value){return [...new Set(String(value??"").split(/[\s,，;；]+/).map(item=>item.trim().toUpperCase()).filter(Boolean))];}
function createPreTeam(owner,data){
  const ids=parseTeamMemberIds(data.memberIds);
  // 允许先建一支只有队长的队伍：再用「发布公开招募 + 队长确认入队申请」补充成员。
  if(ids.length>4)return {error:"too many members",status:400};
  if(ids.includes(String(owner.id).toUpperCase()))return {error:"cannot include yourself",status:400};
  if(owner.teamId||db.teams.some(item=>(item.memberIds||[]).includes(owner.id)))return {error:"already belongs to a team",status:409};
  const members=ids.map(id=>db.applications.find(item=>String(item.id||"").toUpperCase()===id));
  if(members.some(member=>!member))return {error:"member not found",status:404};
  if(members.some(member=>!isContestant(member)))return {error:"member must be contestant",status:400};
  const notAdmitted=members.filter(member=>!isTeamEligible(member));
  if(notAdmitted.length)return {error:"member not admitted: "+notAdmitted.map(member=>member.id).join("、"),status:400};
  const incomplete=members.filter(member=>memberProfileGaps(member).length);
  if(incomplete.length)return {error:"member profile incomplete: "+incomplete.map(member=>member.id+" 缺少 "+memberProfileGaps(member).map(key=>fieldLabels[key]||key).join("、")).join("；"),status:400};
  if(members.some(member=>member.teamId||db.teams.some(item=>(item.memberIds||[]).includes(member.id))))return {error:"member already belongs to a team",status:409};
  const team={id:"TEAM "+String(db.teams.length+1).padStart(2,"0"),ownerId:owner.id,code:"MC26-"+crypto.randomBytes(2).toString("hex").toUpperCase(),project:String(data.project||"").trim()||"Untitled",theme:"TBD",memberIds:[owner.id,...members.map(member=>member.id)],status:"draft",locked:false,published:false,testFixture:testFixtureMode()};
  db.teams.push(team);
  [owner,...members].forEach(member=>{member.teamId=team.id;member.teamCode=team.code;});
  return {team};
}
function deleteParticipantAccount(participant){
  const id=String(participant.id),name=String(participant.name||""),affectedTeamIds=new Set(),removedTeamIds=new Set();
  db.teams=(db.teams||[]).flatMap(team=>{
    const memberIds=Array.isArray(team.memberIds)?team.memberIds:[];
    if(!memberIds.includes(id))return [team];
    affectedTeamIds.add(team.id);
    const remaining=memberIds.filter(memberId=>memberId!==id);
    if(!remaining.length||(!team.locked&&team.ownerId===id)){
      removedTeamIds.add(team.id);
      for(const memberId of remaining){
        const member=db.applications.find(item=>String(item.id)===String(memberId));
        if(member){member.teamId="";member.teamCode="";}
      }
      return [];
    }
    return [{...team,memberIds:remaining,ownerId:team.ownerId===id?remaining[0]:team.ownerId}];
  });
  for(const application of db.applications||[])if(removedTeamIds.has(application.teamId)){application.teamId="";application.teamCode="";}
  db.teamRequests=(db.teamRequests||[]).filter(row=>String(row.applicantId)!==id&&!removedTeamIds.has(row.teamId));
  db.projects=(db.projects||[]).filter(project=>!removedTeamIds.has(project.teamId)).map(project=>Array.isArray(project.members)?{...project,members:project.members.filter(member=>member?.id!==id&&member?.name!==name)}:project);
  db.ideas=(db.ideas||[]).filter(idea=>String(idea.authorId||"")!==id);
  db.votes=(db.votes||[]).filter(vote=>String(vote.voterId||"")!==id);
  db.notices=(db.notices||[]).flatMap(notice=>String(notice.target||"")===id?[]:[{...notice,readBy:(notice.readBy||[]).filter(reader=>String(reader)!==id)}]);
  for(const [token,storedSession] of Object.entries(db.sessions||{}))if(String(storedSession.userId||"")===id)delete db.sessions[token];
  db.applications=(db.applications||[]).filter(application=>String(application.id)!==id);
  return {affectedTeamIds:[...affectedTeamIds],removedTeamIds:[...removedTeamIds]};
}

function resolvedAwards(){const rows=calcResults(),formal=["Best Overall","Best Product","Best Design","Best Technical","Most Unexpected"],used=new Set(),winners=[];for(const award of formal){const row=rows.find(x=>x.award===award&&!used.has(db.projects.find(p=>p.id===x.projectId)?.teamId));if(row){const project=db.projects.find(p=>p.id===row.projectId);used.add(project?.teamId);winners.push({...row,projectName:project?.projectName,teamId:project?.teamId});}}const people=rows.find(x=>x.award==="People's Choice");if(people){const project=db.projects.find(p=>p.id===people.projectId);winners.push({...people,projectName:project?.projectName,teamId:project?.teamId,stackable:true});}return winners;}

async function api(req,res,url){
  const method=req.method;
  if(url.pathname==="/api/config"&&method==="GET")return send(res,200,{config:{...db.config,voteOpen:votingIsOpen()}});
  if(url.pathname==="/api/starter-pack"&&method==="GET")return send(res,200,{starterPack:db.config.starterPack});
  if(url.pathname==="/api/applications"&&method==="POST"){if(!db.config.applicationOpen)return fail(res,403,"application closed");const d=await body(req);const type = d.registrationType;if (!["contestant", "roadshow"].includes(type))return fail(res, 400, "invalid registrationType");if(type==="roadshow"){if(!d.name||!d.phone||!d.email||!d.identity_type||!d.school_or_company||!d.grade_or_position)return fail(res,400,"required fields missing");if(db.applications.some(x=>!isContestant(x)&&(String(x.email||"").toLowerCase()===String(d.email).toLowerCase()||String(x.phone||"")===String(d.phone))))return fail(res,409,"duplicate application");const a={...d,id:nextRoadshowCode(),registrationType:"roadshow",entryType:"路演报名",status:"已通过",teamCode:"",teamId:"",skills:[],attend_roadshow:d.attend_roadshow!==false&&d.attend_roadshow!=="false",receive_notifications:d.receive_notifications!==false&&d.receive_notifications!=="false",createdAt:new Date().toISOString(),testFixture:testFixtureMode()};db.applications.unshift(a);if(!db.notices.some(item=>noticeKeyOf(item)===AUTO_NOTICE_KEY.signup(a.id)))addNotice("用户报名成功","你的路演报名已通过，报名码为 "+a.id+"。","报名提交",a.id,{key:AUTO_NOTICE_KEY.signup(a.id)});const t=makeToken();db.sessions[t]={role:"participant",userId:a.id,createdAt:Date.now(),testFixture:testFixtureMode()};await saveDb();return send(res,201,{application:safe(a),token:t});}if(db.config.applicationDeadline&&Date.now()>Date.parse(db.config.applicationDeadline))return fail(res,403,"application closed");if(!d.name||!d.studentId||!d.email||!d.phone||!d.motivation||!d.grade)return fail(res,400,"required fields missing");if(db.applications.some(x=>isContestant(x)&&(x.studentId===d.studentId||String(x.email||"").toLowerCase()===String(d.email).toLowerCase())))return fail(res,409,"duplicate application");const a={...d,id:"MC26-"+String(1+db.applications.reduce((max,x)=>/^MC26-\d+$/.test(x.id)?Math.max(max,Number(x.id.slice(5))):max,1000)).padStart(4,"0"),registrationType:"contestant",entryType:"个人报名",participationMode:participationModeFor(d.grade),teamCode:"",skills:d.skills||[],status:"待审核",teamId:"",createdAt:new Date().toISOString(),testFixture:testFixtureMode()};db.applications.unshift(a);if(!db.notices.some(item=>noticeKeyOf(item)===AUTO_NOTICE_KEY.signup(a.id)))addNotice("用户报名成功","你的报名已提交，报名编号为 "+a.id+"。","报名提交",a.id,{key:AUTO_NOTICE_KEY.signup(a.id)});const t=makeToken();db.sessions[t]={role:"participant",userId:a.id,createdAt:Date.now(),testFixture:testFixtureMode()};await saveDb();return send(res,201,{application:safe(a),token:t});}
  if(url.pathname==="/api/auth/participant"&&method==="POST"){const d=await body(req);const c=String(d.contact||"").toLowerCase().replace(/[\s-]/g,"");const a=db.applications.find(x=>x.id.toUpperCase()===String(d.id||"").toUpperCase()&&[x.email,x.phone].some(v=>String(v||"").toLowerCase().replace(/[\s-]/g,"")===c));if(!a)return fail(res,401,"invalid participant credentials");const t=makeToken();db.sessions[t]={role:"participant",userId:a.id,createdAt:Date.now(),testFixture:testFixtureMode()};await saveDb();return send(res,200,{participant:safe(a),token:t});}
  if(url.pathname==="/api/auth/voter"&&method==="POST"){if(!votingIsOpen())return fail(res,403,"voting not open");const identity=normalizeVoterIdentity(await body(req));if(identity.error)return fail(res,400,identity.error);const existing=duplicatePublicVote(identity);const t=makeToken();db.sessions[t]={role:"voter",userId:identity.identityHash,credentialHash:identity.credentialHash,voter:{name:identity.name,code:identity.code},createdAt:Date.now(),testFixture:testFixtureMode()};await saveDb();return send(res,200,{voter:db.sessions[t].voter,hasVoted:Boolean(existing),token:t});}
  if(url.pathname==="/api/auth/admin"&&method==="POST"){const d=await body(req);if(d.password!==adminPassword)return fail(res,401,"invalid admin password");const t=makeToken();db.sessions[t]={role:"admin",userId:"ADMIN",createdAt:Date.now(),testFixture:testFixtureMode()};await saveDb();return send(res,200,{token:t});}
  const me=person(req);
  const voter=publicVoter(req);
  if(url.pathname==="/api/me"&&method==="DELETE"){if(!me)return fail(res,401,"login required");deleteParticipantAccount(me);await saveDb();return send(res,200,{ok:true});}
  if(url.pathname==="/api/teams"&&method==="POST"&&me&&isTeamEligible(me)){
    if(!isProfileComplete(me))return fail(res,400,"profile incomplete");
    const result=createPreTeam(me,await body(req));
    if(result.error)return fail(res,result.status,result.error);
    closeApplicantRequests(me.id,"closed","入队申请已自动关闭","你已经创建了自己的队伍，之前提交的入队申请已自动关闭。");
    await saveDb();
    return send(res,201,{team:teamView(result.team,{includeCode:true})});
  }
  if(url.pathname==="/api/me"&&method==="PATCH"&&me&&isContestant(me)){const d=await body(req),result=patchContestantProfile(me,d);
    // patchContestantProfile 失败时返回 {status,message}（没有 error 字段），成功时返回 {changed}；
    // 所以这里按「有没有 status」判断失败，不能只认 result.error（否则 403/400 会被吞掉、静默成功）。
    if(result.status)return fail(res,result.status,result.message);
    // 「资料修改（自动）」：正文带上这次改了哪些字段；key 去重，重复保存同样的内容不产生新消息。
    const changed=result.changed||[];
    if(changed.length)addNotice("资料已修改","你的资料有改动："+changedFieldText(changed,noticeFieldLabels)+"。主办方会同步看到你的最新资料。","资料修改",me.id,{key:AUTO_NOTICE_KEY.profile(me.id)});
    await saveDb();return send(res,200,{participant:safe(me)});}
  if(url.pathname==="/api/me"&&method==="GET"){if(!me)return fail(res,401,"login required");return send(res,200,{participant:safe(me),team:teamView(db.teams.find(x=>x.id===me.teamId),{includeCode:true})});}
  if(url.pathname==="/api/me/vote"&&method==="GET"){if(me&&!isContestant(me))return fail(res,403,"roadshow participants do not have voting access");if(!me&&!voter)return fail(res,401,"login required");const voterId=voter?.userId||me.id;return send(res,200,{voter:voter?.voter||{code:me.id,name:me.name,grade:me.grade,college:me.college,teamId:me.teamId},vote:voteView(db.votes.find(item=>item.role==="participant"&&(item.voterId===voterId||voter&&(item.voterIdentityHash===voter.userId)))),voteOpen:votingIsOpen()});}
  if(url.pathname==="/api/me"&&method==="PATCH"){if(!me)return fail(res,401,"login required");const d=await body(req);if(!isContestant(me)){if(!["name","phone","email","identity_type","school_or_company","grade_or_position"].every(key=>String(d[key]||"").trim()))return fail(res,400,"required fields missing");Object.assign(me,{name:d.name,phone:d.phone,email:d.email,identity_type:d.identity_type,school_or_company:d.school_or_company,grade_or_position:d.grade_or_position,attend_roadshow:d.attend_roadshow===undefined?me.attend_roadshow:d.attend_roadshow!==false&&d.attend_roadshow!=="false",receive_notifications:d.receive_notifications===undefined?me.receive_notifications:d.receive_notifications!==false&&d.receive_notifications!=="false",updatedAt:new Date().toISOString()});await saveDb();return send(res,200,{participant:safe(me)});}if(!d.name||!d.studentId||!d.college||!d.major||!d.grade||!d.phone||!d.email||!d.motivation)return fail(res,400,"required fields missing");if(d.studentId&&d.studentId!==me.studentId&&db.applications.some(item=>item.id!==me.id&&item.studentId===d.studentId))return fail(res,409,"student id already exists");
    // 保存前先对比快照：内容没变就不生成「资料修改（自动）」消息。
    const profileBefore=profileFieldSnapshot(me);
    d.entryType="个人报名";d.participationMode=participationModeFor(d.grade);d.teamCode=me.teamCode;Object.assign(me,d,{id:me.id,registrationType:me.registrationType,status:me.status,teamId:me.teamId});me.updatedAt=new Date().toISOString();
    const changed=changedProfileFields(d,me,profileBefore);
    if(changed.length)addNotice("资料已修改","你的资料有改动："+changedFieldText(changed,noticeFieldLabels)+"。主办方会同步看到你的最新资料。","资料修改",me.id,{key:AUTO_NOTICE_KEY.profile(me.id)});
    await saveDb();return send(res,200,{participant:safe(me)});}
  if(url.pathname==="/api/me/notices"&&method==="GET"){if(!me)return fail(res,401,"login required");return send(res,200,{notices:db.notices.filter(x=>(x.target==="ALL"||x.target===me.id)&&noticeVisibleToParticipant(x)).map(x=>participantNoticeView(x,me)).filter(Boolean)});}
  // 标记已读：body.id 省略时把「我可见的全部通知」标为已读；带 id 时只标记那一条。
  // 已读只作用于「选手看得到的通知」（自动消息不下发，也不去改它们的已读：
  // 这样 @me/notices 与 read 两个接口对选手的可见集合始终一致）。
  const markRead=(notice,id)=>{
    if(notice.target!=="ALL"&&notice.target!==id)return false;
    if(!noticeVisibleToParticipant(notice))return false;
    const readers=new Set((notice.readBy||[]).map(String));
    if(readers.has(String(id))&&notice.readAt?.[id])return false;
    readers.add(String(id));
    notice.readBy=[...readers];
    notice.readAt={...(notice.readAt||{}),[id]:new Date().toISOString()};
    return true;
  };
  if(url.pathname==="/api/me/notices/read"&&method==="POST"){if(!me)return fail(res,401,"login required");const d=await body(req).catch(()=>({}));
    if(d&&d.id){
      // 传了 id：显式点名标记（选手端「打开通知中心时把当前未读标为已读」走这条）。
      const wanted=new Set((Array.isArray(d.id)?d.id:[d.id]).map(String));let changed=0;
      for(const x of db.notices)if(wanted.has(String(x.id))&&markRead(x,me.id))changed+=1;
      if(changed)await saveDb();
      return send(res,200,{ok:true,changed});
    }
    // 不传 id：把收件箱里可见的未读全部标为已读（选手端「全部标为已读」）。
    let changed=0;
    for(const x of db.notices)if(x.target==="ALL"||x.target===me.id){if(markRead(x,me.id))changed+=1;}
    if(changed)await saveDb();
    return send(res,200,{ok:true,changed});}
  if(url.pathname==="/api/me/notices/reply"&&method==="POST"){if(!me)return fail(res,401,"login required");const d=await body(req).catch(()=>({}));const notice=db.notices.find(x=>String(x.id)===String(d.id||""));if(!notice)return fail(res,404,"notice not found");if(notice.target!=="ALL"&&String(notice.target)!==me.id)return fail(res,403,"notice not addressed to you");if(!notice.requiresReply)return fail(res,400,"notice does not accept replies");if(!noticeContentFor(notice,me))return fail(res,403,"notice not sent to your status");if(!isContestant(me)||!isAccepted(me))return fail(res,403,"accepted contestants only");const options=replyOptionsOf(notice);const value=String(d.value||"");if(!options.some(option=>String(option.value)===value))return fail(res,400,"invalid reply value");const at=new Date().toISOString();notice.replies={...(notice.replies||{}),[me.id]:{value,at}};const readers=new Set((notice.readBy||[]).map(String));readers.add(String(me.id));notice.readBy=[...readers];notice.readAt={...(notice.readAt||{}),[me.id]:at};await saveDb();return send(res,200,{ok:true,reply:notice.replies[me.id]});}
  // 公开招募列表：匿名可见，成员走展示白名单，且不下发队伍邀请码（只有本队成员 / 主办方看得到）。
  if(url.pathname==="/api/teams"&&method==="GET"){
    // 匿名访客仍可读公开招募列表（隐私测试覆盖）；已登录但不是已录取状态一律 403。
    if(me&&!isTeamEligible(me))return fail(res,403,"not admitted");
    return send(res,200,{teams:db.teams.filter(team=>team.published&&!team.locked).map(team=>teamView(team))});
  }
  // ---- 入队申请：公开招募的队伍需要队长确认；申请 / 审批 / 拒绝 / 撤回 / 退出 / 移出都发「组队消息（自动）」----
  if(url.pathname==="/api/teams/requests"&&method==="GET"){
    if(!me)return fail(res,401,"login required");
    if(!isTeamEligible(me))return fail(res,403,"not admitted");
    const myTeam=teamOf(me);
    return send(res,200,{
      outgoing:teamRequests().filter(row=>row.applicantId===me.id&&row.status==="pending").map(row=>requestView(row)),
      incoming:myTeam&&myTeam.ownerId===me.id?teamRequests().filter(row=>row.teamId===myTeam.id&&row.status==="pending").map(row=>requestView(row)):[]
    });
  }
  if(url.pathname==="/api/teams/requests"&&method==="POST"){
    if(!me)return fail(res,401,"login required");
    if(!isTeamEligible(me))return fail(res,403,"not admitted");
    if(!isProfileComplete(me))return fail(res,400,"profile incomplete");
    if(teamOf(me))return fail(res,409,"already belongs to a team");
    // 同一时间只允许一份待处理申请：撤回或被处理之后才能申请下一支队伍。
    if(pendingRequestOf(me.id))return fail(res,409,"request already pending");
    const d=await body(req);
    const team=db.teams.find(item=>item.id===decodeURIComponent(String(d.teamId||"")));
    if(!team)return fail(res,404,"team not found");
    if(!team.published)return fail(res,409,"team is not recruiting");
    if(team.locked||team.memberIds.length>=5)return fail(res,409,"team is locked or full");
    const message=String(d.message||"").trim().slice(0,200);
    const row={id:makeId("TEAMREQ"),teamId:team.id,applicantId:me.id,message,status:"pending",createdAt:new Date().toISOString(),decidedAt:"",decidedBy:""};
    teamRequests().push(row);
    notifyTeamParticipant(team.ownerId,"新的入队申请","「"+displayNameOf(me.id)+"（"+me.id+"）」申请加入队伍「"+teamTitleOf(team)+"」。"+(message?"留言："+message+" ":"")+"请到组队工作区确认。");
    await saveDb();
    return send(res,201,{request:requestView(row)});
  }
  const teamRequestAction=url.pathname.match(/^\/api\/teams\/requests\/([^/]+)\/(approve|reject|withdraw)$/);
  if(teamRequestAction){
    if(!me)return fail(res,401,"login required");
    const row=teamRequests().find(item=>item.id===decodeURIComponent(teamRequestAction[1]));
    if(!row)return fail(res,404,"request not found");
    if(row.status!=="pending")return fail(res,409,"request already handled");
    const team=db.teams.find(item=>item.id===row.teamId);
    // 申请人自己撤回：不需要队长权限。
    if(teamRequestAction[2]==="withdraw"){
      if(row.applicantId!==me.id)return fail(res,403,"request owner required");
      row.status="withdrawn";row.decidedAt=new Date().toISOString();row.decidedBy=me.id;
      if(team)notifyTeamParticipant(team.ownerId,"入队申请已撤回","「"+displayNameOf(me.id)+"（"+me.id+"）」撤回了加入队伍「"+teamTitleOf(team)+"」的申请。");
      await saveDb();
      return send(res,200,{request:requestView(row)});
    }
    if(!team)return fail(res,404,"team not found");
    if(!(team.ownerId===me.id&&team.memberIds.includes(me.id)))return fail(res,403,"team owner required");
    if(teamRequestAction[2]==="reject"){
      row.status="rejected";row.decidedAt=new Date().toISOString();row.decidedBy=me.id;
      notifyTeamParticipant(row.applicantId,"入队申请未通过","队长暂未同意你加入队伍「"+teamTitleOf(team)+"」。你仍然可以申请其他正在招募的队伍。");
      await saveDb();
      return send(res,200,{request:requestView(row)});
    }
    const applicant=db.applications.find(item=>String(item.id)===String(row.applicantId));
    if(team.locked||team.memberIds.length>=5)return fail(res,409,"team is locked or full");
    if(!isTeamEligible(applicant)||!isProfileComplete(applicant))return fail(res,409,"applicant is not eligible");
    if(teamOf(applicant))return fail(res,409,"applicant already belongs to a team");
    team.memberIds.push(applicant.id);applicant.teamId=team.id;applicant.teamCode=team.code;
    row.status="approved";row.decidedAt=new Date().toISOString();row.decidedBy=me.id;
    notifyTeamParticipant(applicant.id,"入队申请已通过","队长已同意你加入队伍「"+teamTitleOf(team)+"」，队伍现在 "+team.memberIds.length+" 人。去组队工作区确认成员与招募状态。");
    closeApplicantRequests(applicant.id,"approved","入队申请已自动关闭","你已经加入队伍「"+teamTitleOf(team)+"」，其余待处理的入队申请已自动关闭。");
    if(team.memberIds.length>=5)closeTeamRequests(team.id,"closed","队伍已满员","队伍「"+teamTitleOf(team)+"」已满员，你的入队申请已自动关闭。");
    await saveDb();
    return send(res,200,{request:requestView(row),team:teamView(team,{includeCode:true})});
  }
  if(url.pathname==="/api/teams/join-by-code"&&method==="POST"){
    if(!me)return fail(res,401,"login required");
    if(!isTeamEligible(me))return fail(res,403,"not admitted");
    if(!isProfileComplete(me))return fail(res,400,"profile incomplete");
    if(teamOf(me))return fail(res,409,"already belongs to a team");
    const d=await body(req);
    const code=String(d.code||"").trim().toUpperCase();
    if(!code)return fail(res,400,"team code required");
    const team=db.teams.find(item=>String(item.code||"").toUpperCase()===code);
    if(!team)return fail(res,404,"team code not found");
    if(team.locked||team.memberIds.length>=5)return fail(res,409,"team is locked or full");
    // 邀请码由队长主动发出，免审批直接进队。
    team.memberIds.push(me.id);me.teamId=team.id;me.teamCode=team.code;
    closeApplicantRequests(me.id,"closed","入队申请已自动关闭","你已经凭邀请码加入队伍「"+teamTitleOf(team)+"」，之前提交的入队申请已自动关闭。");
    if(team.memberIds.length>=5)closeTeamRequests(team.id,"closed","队伍已满员","队伍「"+teamTitleOf(team)+"」已满员，你的入队申请已自动关闭。");
    await saveDb();
    return send(res,200,{team:teamView(team,{includeCode:true})});
  }
  if(url.pathname==="/api/teams"&&method==="POST"){
    if(!me)return fail(res,401,"login required");
    return fail(res,403,"not admitted");
  }
  const tm=url.pathname.match(/^\/api\/teams\/([^/]+)\/(lock|leave|recruit|kick)$/);
  if(tm){
    const team=db.teams.find(x=>x.id===decodeURIComponent(tm[1]));
    if(!team)return fail(res,404,"team not found");
    const isOwner=Boolean(me&&team.ownerId===me.id&&team.memberIds.includes(me.id));
    // 发布 / 停止公开招募：只有队长可以操作，锁定后不能改。
    if(tm[2]==="recruit"&&method==="PATCH"){
      if(!isOwner)return fail(res,403,"team owner required");
      if(team.locked)return fail(res,409,"locked team cannot be changed");
      team.published=!team.published;
      await saveDb();
      return send(res,200,{team:teamView(team,{includeCode:true})});
    }
    // 离开队伍：未锁定即可离开；非队长离开时给队长发一条组队消息。
    if(tm[2]==="leave"&&method==="POST"){
      if(!me||!team.memberIds.includes(me.id))return fail(res,403,"team member required");
      if(team.locked)return fail(res,409,"locked team cannot be changed");
      if(team.memberIds.length===1&&db.projects.some(project=>project.teamId===team.id))return fail(res,409,"submitter must keep the project team");
      const wasOwner=team.ownerId===me.id,leaverName=displayNameOf(me.id);
      team.memberIds=team.memberIds.filter(memberId=>memberId!==me.id);
      if(wasOwner)team.ownerId=team.memberIds[0]||"";
      me.teamId="";me.teamCode="";
      if(!team.memberIds.length)db.teams=db.teams.filter(item=>item.id!==team.id);
      if(!wasOwner&&team.ownerId)notifyTeamParticipant(team.ownerId,"队员退出队伍","「"+leaverName+"（"+me.id+"）」退出了队伍「"+teamTitleOf(team)+"」，队伍现在 "+team.memberIds.length+" 人。");
      await saveDb();
      return send(res,200,{ok:true});
    }
    // 队长移出队员：仅未锁定的队伍；队长本人不能被移出；被移出的人会收到组队消息。
    if(tm[2]==="kick"&&method==="POST"){
      if(!isOwner)return fail(res,403,"team owner required");
      if(team.locked)return fail(res,409,"locked team cannot be changed");
      const memberId=String((await body(req)).memberId||"").trim();
      if(!memberId)return fail(res,400,"team member required");
      if(memberId===team.ownerId)return fail(res,400,"cannot remove the team owner");
      if(!team.memberIds.includes(memberId))return fail(res,404,"team member not found");
      const target=db.applications.find(item=>String(item.id)===String(memberId));
      team.memberIds=team.memberIds.filter(id=>id!==memberId);
      if(target){target.teamId="";target.teamCode="";}
      notifyTeamParticipant(memberId,"你已被移出队伍","队长已将你移出队伍「"+teamTitleOf(team)+"」。你可以重新创建或加入其他队伍。");
      await saveDb();
      return send(res,200,{team:teamView(team,{includeCode:true})});
    }
    // 正式锁定：需要主办方开启「正式组队确认」，且 3–5 名成员全部已录取、资料完整。
    if(tm[2]==="lock"&&method==="PATCH"){
      if(!db.config.teamConfirmOpen)return fail(res,403,"team confirmation not open");
      if(!isOwner)return fail(res,403,"team owner required");
      if(!isTeamEligible(me))return fail(res,403,"not admitted");
      if(team.memberIds.length<3||team.memberIds.length>5)return fail(res,400,"team must have 3 to 5 members");
      if(team.memberIds.some(id=>{const p=db.applications.find(x=>x.id===id);return !isTeamEligible(p)||!isProfileComplete(p);}))return fail(res,400,"all members must be admitted and complete");
      team.locked=true;team.status="locked";
      closeTeamRequests(team.id,"closed","队伍已锁定","队伍「"+teamTitleOf(team)+"」已锁定，你的入队申请已自动关闭。");
      await saveDb();
      return send(res,200,{team:teamView(team,{includeCode:true})});
    }
  }
  // ---- 问答信息（qa_questions + qa_threads）：参与者提问/追问，主办方回答 / 置顶 / 隐藏 ----
  if(url.pathname==="/api/qa"&&method==="POST"){
    if(!me)return fail(res,401,"login required");
    const d=await body(req);
    const text=d.question;
    // 带 parentQuestionId 就是追问：只有原提问者本人能追问，可以连续追问（不限层数）。
    if(d.parentQuestionId){
      const result=await qaStore.createFollowUp({askerId:me.id,parentQuestionId:d.parentQuestionId,question:text});
      if(result.error)return fail(res,result.status,result.error);
      return send(res,201,{question:result.question,rootQuestionId:result.rootQuestionId,depth:result.depth});
    }
    const result=await qaStore.createQuestion({askerId:me.id,question:text});
    if(result.error)return fail(res,result.status,result.error);
    return send(res,201,{question:result.question});
  }
  if(url.pathname==="/api/qa"&&method==="GET"){
    // 主办方看全部（可按状态筛选，逗号分隔），参与者只看自己提的问题与追问（含待回答、被隐藏的）。
    if(admin(req)){
      const questions=qaStore.list({status:parseQaStatusFilter(url.searchParams.get("status"))});
      const threads=qaThreadSummary(questions);
      return send(res,200,{questions:questions.map(row=>adminQaQuestion(row,threads)),stats:qaStore.stats(),threads,storage:qaStore.mode()});
    }
    if(!me)return fail(res,401,"login required");
    // 带上 parent_question_id 与 root_question_id，前端才能把"我的追问"归到各自的问题下面。
    return send(res,200,{questions:qaStore.list({askerId:me.id}).map(questionWithId)});
  }
  // 公开列表：会话根（置顶在前 + 已回答），每条根带自己可见的追问链；不含 asker_id 等身份信息。
  if((url.pathname==="/api/qa/public")&&method==="GET"){
    const roots=qaStore.listPublic();
    const questions=roots.map(row=>publicQuestion(row,qaPublicFollowUps(row.question_id)));
    // 断开显示：某条追问自己已公开，但它所在会话的根没公开（根被隐藏 / 还没回答）时，
    // 这条追问不属于任何公开链，单独作为 detached 条目返回，由前端独立成卡。
    return send(res,200,{questions:[...questions,...qaDetachedQuestions(roots)]});
  }
  // 单条会话的完整树（仅主办方）：含未公开的追问，按层级与时间排列。
  const qaThreadMatch=url.pathname.match(/^\/api\/qa\/threads\/([^/]+)$/);
  if(qaThreadMatch&&method==="GET"){
    if(!admin(req))return fail(res,401,"admin required");
    const rootId=decodeURIComponent(qaThreadMatch[1]);
    const session=qaStore.listSession(rootId);
    if(!session.length)return fail(res,404,"thread not found");
    return send(res,200,{rootQuestionId:rootId,thread:qaStore.threadInfo(rootId),questions:session.map(questionWithId)});
  }
  const qaAnswerMatch=url.pathname.match(/^\/api\/admin\/qa\/([^/]+)$/);
  if(qaAnswerMatch&&method==="PATCH"){
    if(!admin(req))return fail(res,401,"admin required");
    const d=await body(req),questionId=decodeURIComponent(qaAnswerMatch[1]);
    let question=null;
    if(d.answer!==undefined){
      const result=await qaStore.answerQuestion({questionId,answer:d.answer,answeredBy:d.answeredBy});
      if(result.error)return fail(res,result.status,result.error);
      question=result.question;
    }
    if(d.status!==undefined){
      const result=await qaStore.setStatus({questionId,status:d.status,answeredBy:d.answeredBy});
      if(result.error)return fail(res,result.status,result.error);
      question=result.question;
    }
    if(!question)return fail(res,400,"answer or status required");
    if(["answered","pinned"].includes(question.status))notifyQaAnswered(question);
    await saveDb();
    return send(res,200,{question});
  }
  // 创意板是公开的：只给展示字段，不下发 authorId（报名编号），避免把创意和具体报名人关联起来。
  if(url.pathname==="/api/ideas"&&method==="GET")return send(res,200,{ideas:db.ideas.filter(x=>x.status==="open").map(idea=>({id:idea.id,title:idea.title,summary:idea.summary,theme:idea.theme,needs:Array.isArray(idea.needs) ? idea.needs : [],status:idea.status,createdAt:idea.createdAt}))});
  if(url.pathname==="/api/ideas"&&method==="POST"){if(!me)return fail(res,401,"login required");if(!isContestant(me)||!isAccepted(me))return fail(res,403,"accepted contestants only");const d=await body(req);if(!d.title||!d.summary)return fail(res,400,"idea title and summary required");const idea={id:makeId("IDEA"),title:d.title,summary:d.summary,theme:d.theme||"TBD",needs:d.needs||[],authorId:me.id,status:"open",createdAt:new Date().toISOString(),testFixture:testFixtureMode()};db.ideas.unshift(idea);await saveDb();return send(res,201,{idea});}
  // 项目 Gallery：匿名可见，成员走展示白名单，队伍邀请码同样不下发。
  if(url.pathname==="/api/projects"&&method==="GET")return send(res,200,{projects:db.projects.filter(x=>x.status==="published").map(project=>projectView(project))});
  if(url.pathname==="/api/projects"&&method==="POST"){if(!me)return fail(res,401,"login required");if(!isContestant(me)||!isAccepted(me))return fail(res,403,"accepted participants only");const team=db.teams.find(x=>x.id===me.teamId);if(!team)return fail(res,403,"join a team first");if(db.projects.some(project=>project.teamId===team.id))return fail(res,409,"team already has a project");const d=await body(req);const project={id:makeId("PROJECT"),teamId:team.id,...d,members:d.members||team.memberIds.map(mid=>({name:db.applications.find(x=>x.id===mid)?.name||"member",role:""})),aiTools:d.aiTools||[],status:"draft",createdAt:new Date().toISOString(),testFixture:testFixtureMode()};db.projects.push(project);await saveDb();return send(res,201,{project:projectView(project,{includeCode:true})});}
  if(url.pathname.startsWith("/api/projects/")&&method==="PATCH"){const isAdmin=admin(req);if(!me&&!isAdmin)return fail(res,401,"login required");const p=db.projects.find(x=>x.id===decodeURIComponent(url.pathname.split("/").pop()));if(!p)return fail(res,404,"project not found");const d=await body(req);if(!isAdmin&&p.teamId!==me.teamId)return fail(res,403,"project access denied");if(isAdmin)Object.assign(p,d);else for(const key of ["projectName","theme","tagline","problem","solution","demoUrl","githubUrl","coverUrl","aiTools"]){if(Object.hasOwn(d,key))p[key]=d[key];}await saveDb();return send(res,200,{project:projectView(p,{includeCode:true})});}
  if(url.pathname==="/api/votes"&&method==="POST"){const jury=admin(req);if(!votingIsOpen())return fail(res,403,"voting not open");if(!jury&&!me&&!voter)return fail(res,401,"login required");if(me&&(!isContestant(me)||!isAccepted(me)))return fail(res,403,"accepted participants only");const d=await body(req),role=jury?"jury":"participant",voterId=jury?"ADMIN":voter?.userId||me.id;if(duplicatePublicVote(voter?{credentialHash:voter.credentialHash,identityHash:voter.userId}:{credentialHash:null,identityHash:null})||db.votes.some(x=>x.voterId===voterId&&x.role===role))return fail(res,409,"vote already submitted");const selections=normalizeVoteSelections(d.selections,role);if(!selections)return fail(res,400,"invalid vote selections");const allowed=new Set(db.projects.filter(x=>x.status==="published").map(x=>x.id));if(selections.some(x=>!allowed.has(x.projectId)))return fail(res,400,"unpublished project in vote");if(me&&selections.some(x=>db.projects.find(p=>p.id===x.projectId)?.teamId===me.teamId))return fail(res,400,"cannot vote for your team");db.votes.push({id:makeId("VOTE"),voterId,role,selections,createdAt:new Date().toISOString(),voterCode:voter?.voter?.code||me?.id||"",voterCredentialHash:voter?.credentialHash||null,voterIdentityHash:voter?.userId||null,testFixture:testFixtureMode()});await saveDb();return send(res,201,{ok:true});}
  if(url.pathname==="/api/organizer/summary"&&method==="GET"){if(!admin(req))return fail(res,401,"admin required");return send(res,200,{config:{eventName:db.config.eventName,date:db.config.date,venue:db.config.venue,applicationOpen:db.config.applicationOpen,applicationDeadline:db.config.applicationDeadline,resultDate:db.config.resultDate},metrics:{applications:db.applications.length,accepted:db.applications.filter(x=>x.status==="已录取").length,pending:db.applications.filter(x=>x.status==="待审核").length,teams:db.teams.length,publishedProjects:db.projects.filter(x=>x.status==="published").length},teams:db.teams.map(t=>({id:t.id,project:t.project,theme:t.theme,status:t.status,memberCount:t.memberIds.length})),projects:db.projects.filter(x=>x.status==="published").map(p=>({id:p.id,projectName:p.projectName,theme:p.theme,tagline:p.tagline,demoUrl:p.demoUrl})),notices:db.notices.filter(x=>x.target==="ALL").slice(0,10).map(x=>({title:x.title,body:x.body,type:x.type,createdAt:x.createdAt}))});}
  if(url.pathname==="/api/admin/summary"&&method==="GET"){if(!admin(req))return fail(res,401,"admin required");return send(res,200,{applications:db.applications.map(safe),applicationStatuses:[...applicationStatuses],teams:db.teams.map(team=>teamView(team,{includeCode:true})),ideas:db.ideas,projects:db.projects.map(project=>projectView(project,{includeCode:true})),notices:db.notices.map(adminNoticeView),votes:db.votes.map(vote=>({...vote,voterCode:voterCode(vote)})),results:calcResults(),awards:resolvedAwards(),config:{...db.config,voteOpen:votingIsOpen()}});}
  if(url.pathname==="/api/admin/applications"&&method==="PATCH"){if(!admin(req))return fail(res,401,"admin required");const d=await body(req),a=db.applications.find(x=>x.id===d.id);if(!a)return fail(res,404,"application not found");if(!isContestant(a)&&d.status!==undefined&&d.status!==a.status)return fail(res,403,"roadshow applications are always 已通过");if(!applicationStatuses.has(d.status))return fail(res,400,"invalid application status");
    // 「状态修改（自动）」只在状态值真的变化时写一条，正文带上「旧状态 → 新状态」；
    // 重复点同一个状态、或只改队伍归属，都不会再刷屏。
    const previousStatus=String(a.status||"");
    a.status=d.status;if(d.teamId){a.teamId=d.teamId;const t=db.teams.find(x=>x.id===d.teamId);if(t&&!t.memberIds.includes(a.id))t.memberIds.push(a.id);}
    if(previousStatus!==String(a.status))addNotice("报名状态已更新","你的报名状态已更新："+previousStatus+" → "+a.status+"。","状态修改",a.id,{key:AUTO_NOTICE_KEY.status(a.id,Date.now())});
    if(previousStatus!==String(a.status)&&!isTeamEligible(a))closeApplicantRequests(a.id,"closed","入队申请已自动关闭","你的录取状态已变更为「"+a.status+"」，待处理的入队申请已自动关闭。");
    await saveDb();return send(res,200,{participant:safe(a)});}
  if(url.pathname==="/api/admin/config"&&method==="PATCH"){if(!admin(req))return fail(res,401,"admin required");Object.assign(db.config,await body(req));await saveDb();return send(res,200,{config:{...db.config,voteOpen:votingIsOpen()}});}
  if(url.pathname==="/api/admin/notices"&&method==="POST"){if(!admin(req))return fail(res,401,"admin required");const d=await body(req);
    // 录取结果可以按报名状态分别写标题/正文：statusContents 是 [{status,title,body}]，
    // 正文留空的状态直接丢掉 —— 那批人不会收到这条通知，也不会出现在应回复名单里。
    let contents;
    if(d.statusContents!==undefined){
      let rows=d.statusContents;
      if(typeof rows==="string"){try{rows=JSON.parse(rows||"[]");}catch{return fail(res,400,"invalid statusContents");}}
      if(!Array.isArray(rows))return fail(res,400,"invalid statusContents");
      contents = rows
  .map(row => ({
    statuses: Array.isArray(row?.statuses)
      ? row.statuses.filter(Boolean).map(String)
      : [],
    title: String(row?.title || "").trim(),
    body: String(row?.body || "")
  }))
  .filter(row =>
    row.statuses.length &&
    row.body.trim()
  );
      if(!contents.length)return fail(res,400,"at least one status needs content");
    }
    const requiresReply=d.requiresReply===true||d.requiresReply==="true"||d.requiresReply==="on";
    addNotice(d.title||"",d.body||"",d.type||"event",d.target||"ALL",{requiresReply,format:d.format,contents});
    await saveDb();return send(res,201,{ok:true});}
  if(url.pathname==="/api/admin/projects"&&method==="PATCH"){if(!admin(req))return fail(res,401,"admin required");const d=await body(req),p=db.projects.find(x=>x.id===d.id);if(!p)return fail(res,404,"project not found");p.status=d.status;await saveDb();return send(res,200,{project:projectView(p,{includeCode:true})});}
  const adminTeam=url.pathname.match(/^\/api\/admin\/teams\/([^/]+)$/);if(adminTeam&&method==="PATCH"){if(!admin(req))return fail(res,401,"admin required");const team=db.teams.find(item=>item.id===decodeURIComponent(adminTeam[1]));if(!team)return fail(res,404,"team not found");const d=await body(req);if(typeof d.locked!=="boolean")return fail(res,400,"locked flag required");if(d.locked&&!db.config.teamConfirmOpen)return fail(res,403,"team confirmation not open");team.locked=d.locked;team.status=d.locked?"locked":"draft";if(d.locked)closeTeamRequests(team.id,"closed","队伍已锁定","队伍「"+teamTitleOf(team)+"」已锁定，你的入队申请已自动关闭。");await saveDb();return send(res,200,{team:teamView(team,{includeCode:true})});}
  const adminIdea=url.pathname.match(/^\/api\/admin\/ideas\/([^/]+)$/);if(adminIdea&&method==="PATCH"){if(!admin(req))return fail(res,401,"admin required");const idea=db.ideas.find(item=>item.id===decodeURIComponent(adminIdea[1]));if(!idea)return fail(res,404,"idea not found");const d=await body(req);if(!["open","closed"].includes(d.status))return fail(res,400,"invalid idea status");idea.status=d.status;await saveDb();return send(res,200,{idea});}
  if(url.pathname==="/api/admin/results"&&method==="GET"){if(!admin(req))return fail(res,401,"admin required");return send(res,200,{results:calcResults(),awards:resolvedAwards(),votes:db.votes});}
  return fail(res,404,"API not found");
}
async function serve(req,res){const url=new URL(req.url,"http://"+(req.headers.host||"localhost"));if(url.pathname.startsWith("/api/")){try{await api(req,res,url);}catch(e){console.error(e);fail(res,500,e.message||"server error");}return;}const requested=url.pathname==="/"?"/index.html":url.pathname;const vendor=vendorFiles.get(requested);const file=vendor?path.join(root,"node_modules",vendor):path.resolve(publicRoot,"."+path.posix.normalize(requested));if(!vendor&&file!==publicRoot&&!file.startsWith(publicRoot+path.sep)){res.writeHead(403);res.end("Forbidden");return;}try{const data=await fs.readFile(file);res.writeHead(200,{"Content-Type":mime[path.extname(file)]||"application/octet-stream","Cache-Control":"no-store"});res.end(data);}catch{if(vendor){console.error("缺少前端依赖 chart.js：请先在项目根目录执行 npm install（"+file+"）");}res.writeHead(404);res.end("Not found");}}
await loadDb();
http.createServer(serve).listen(port,"127.0.0.1",()=>console.log("minicamp preview: http://localhost:"+port+" (qa storage: "+qaStore.mode()+")"));

