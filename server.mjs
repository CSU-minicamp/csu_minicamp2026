import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { createQaStore, QA_STATUSES } from "./storage/qa-store.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.join(root, "public");
const port = Number(process.env.MINICAMP_PORT || 4173);
const dbPath = path.join(root, "data", "minicamp.json");
const qaPath = path.join(root, "data", "qa.json");
const adminPassword = process.env.MINICAMP_ADMIN_PASSWORD || "123456";
const mysqlConfig = { host: process.env.MYSQL_HOST || "127.0.0.1", port: Number(process.env.MYSQL_PORT || 3306), user: process.env.MYSQL_USER || "root", password: process.env.MYSQL_PASSWORD || "", database: process.env.MYSQL_DATABASE || "minicamp2026", waitForConnections: true, connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 10), charset: "utf8mb4" };
const mime = {".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".json":"application/json; charset=utf-8",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg"};
const seed = {
  config:{eventName:"minicamp 2026",date:"2026-09-26/27",venue:"CSU Smart Classroom",applicationOpen:true,applicationDeadline:"2026-09-05T23:59:00+08:00",resultDate:"2026-09-08T18:00:00+08:00",themeReveal:"Day 1 09:45",voteStartAt:"2026-09-01T00:00:00+08:00",teamConfirmOpen:false,voteOpen:false,juryWeight:40,participantWeight:60,starterPack:{title:"AI Coding Starter Pack",intro:"Prepare your tools and environment before the event.",tools:["Codex","Claude Code","Cursor","GitHub Copilot"],steps:["Install and sign in to your tool","Prepare Node.js, Python and Git","Ask AI to plan before splitting tasks","Share complete errors and verify the result"]}},
  applications:[
    {id:"MC26-1001",name:"demo-user",studentId:"8201230001",college:"Computer Science",major:"Software Engineering",phone:"13800004021",email:"zhixing@example.com",entryType:"individual",teamCode:"",skills:["Frontend","AI Engineer"],motivation:"Build a useful campus tool.",experience:"Campus lost-and-found mini program",portfolio:"",askMeAbout:"Campus tools and frontend",canHelpWith:"Working demos",explore:"Product design",status:"待审核",teamId:"",createdAt:"2026-08-17T10:20:00+08:00"},
    {id:"MC26-1002",name:"design-user",studentId:"8301230002",college:"Arts",major:"Visual Communication",phone:"13900005218",email:"ruoqing@example.com",entryType:"pair",teamCode:"MC26-A7K2",skills:["Design","Media"],motivation:"Turn interaction ideas into real things.",experience:"Brand design and portfolio",portfolio:"https://example.com",askMeAbout:"Visual and interaction",canHelpWith:"Clear interfaces",explore:"Product",status:"已录取",teamId:"TEAM 03",createdAt:"2026-08-16T14:05:00+08:00"},
    {id:"MC26-1003",name:"hardware-user",studentId:"8101230003",college:"Automation",major:"Automation",phone:"13700008860",email:"zhou@example.com",entryType:"pair",teamCode:"MC26-A7K2",skills:["Hardware","Frontend"],motivation:"Try a campus hardware experience.",experience:"Smart car contest",portfolio:"",askMeAbout:"Hardware and sensors",canHelpWith:"Hardware prototypes",explore:"Interaction",status:"已录取",teamId:"TEAM 03",createdAt:"2026-08-16T14:18:00+08:00"}
  ],
  teams:[{id:"TEAM 03",code:"MC26-A7K2",project:"Campus encounter experiment",theme:"TBD",memberIds:["MC26-1002","MC26-1003"],status:"draft",locked:false}],
  ideas:[{id:"IDEA-01",title:"Discover better campus places",summary:"Make campus life easier to start exploring.",theme:"Build for Humans",authorId:"MC26-1001",needs:["Product","Design"],status:"open",createdAt:"2026-08-20T10:00:00+08:00"}],
  projects:[{id:"PROJECT-01",teamId:"TEAM 03",projectName:"Campus Pulse",theme:"Build for Humans",tagline:"Make real campus needs easier to see.",problem:"Campus needs and helpers often miss each other.",solution:"Connect needs, skills and people who can help.",members:[{name:"design-user",role:"design"},{name:"hardware-user",role:"engineering"}],demoUrl:"https://example.com",githubUrl:"",coverUrl:"",aiTools:["Codex"],status:"published",createdAt:"2026-08-20T16:00:00+08:00"}],
  notices:[{id:"NOTICE-01",title:"Welcome to minicamp 2026",body:"After submitting, use your participant page to update details and read notices.",type:"event",target:"ALL",readBy:[],createdAt:"2026-08-20T08:00:00+08:00"}],
  votes:[],sessions:{}
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
function publicQuestion(row){
  return {question_id:row.question_id,question:row.question,asked_at:row.asked_at,answer:row.answer,answered_at:row.answered_at,status:row.status};
}
const makeId=p=>p+"-"+crypto.randomBytes(5).toString("hex").toUpperCase();
const makeToken=()=>crypto.randomBytes(24).toString("hex");
const applicationStatuses=new Set(["待审核","已录取","已通过","候补","待复审","未通过"]);
const legacyApplicationStatuses={pending:"待审核",accepted:"已录取",waitlist:"候补",reviewing:"待复审"};
const legacySkillMap={DEV:"Frontend",PRODUCT:"Product",DESIGN:"Design","AI/DATA":"AI Engineer",HARDWARE:"Hardware",BUSINESS:"Product",CREATIVE:"Media",RESEARCH:"AI Engineer"};
const normalizeSkills=values=>(Array.isArray(values)?values:[]).map(value=>legacySkillMap[value]||value);
const isProfileComplete=p=>Boolean(p&&["name","studentId","college","major","grade","phone","email","motivation"].every(k=>String(p[k]||"").trim()));
const formalAwards=["Best Overall","Best Product","Best Design","Best Technical","Most Unexpected"];
async function readJsonDb(){try{return JSON.parse(await fs.readFile(dbPath,"utf8"));}catch{return clone(seed);}}
function normalizeTeams(){db.teams=(db.teams||[]).map(team=>({...team,ownerId:team.memberIds?.includes(team.ownerId)?team.ownerId:team.memberIds?.[0]||"",published:team.published===true}));}
function normalizeApplications(){db.applications=(db.applications||[]).map(item=>({...item,registration_type:item.registration_type||item.registrationType||"contestant",registrationType:item.registration_type||item.registrationType||"contestant",skills:normalizeSkills(item.skills),status:legacyApplicationStatuses[item.status]|| (applicationStatuses.has(item.status)?item.status:"待审核")}));}
function normalizeIdeas(){db.ideas=(db.ideas||[]).map(item=>({...item,needs:normalizeSkills(item.needs)}));}
async function loadDb(){
  try {
    let bootstrap;
    try { bootstrap=await mysql.createConnection({host:mysqlConfig.host,port:mysqlConfig.port,user:mysqlConfig.user,password:mysqlConfig.password}); await bootstrap.query("CREATE DATABASE IF NOT EXISTS "+mysqlConfig.database+" CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"); }
    finally { await bootstrap?.end().catch(()=>{}); }
    pool=mysql.createPool(mysqlConfig);
    await pool.query("CREATE TABLE IF NOT EXISTS app_state (state_key VARCHAR(64) NOT NULL PRIMARY KEY, state_json JSON NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB");
    const [rows]=await pool.query("SELECT state_json FROM app_state WHERE state_key = 'main'");
    db=rows.length ? (typeof rows[0].state_json === "string" ? JSON.parse(rows[0].state_json) : rows[0].state_json) : await readJsonDb();
  } catch(error) {
    pool=undefined;
    db=await readJsonDb();
    console.warn("MySQL unavailable; using JSON storage at "+dbPath+". "+error.message);
  }
  for(const key of Object.keys(seed))if(!(key in db))db[key]=clone(seed[key]);
  db.config={...clone(seed.config),...(db.config||{})};
  normalizeTeams();
  normalizeApplications();
  normalizeIdeas();
  await saveDb();
  await qaStore.initialize();
}
let saveQueue=Promise.resolve();
function saveDb(){saveQueue=saveQueue.catch(()=>{}).then(async()=>{if(pool)await pool.query("INSERT INTO app_state (state_key, state_json) VALUES ('main', ?) ON DUPLICATE KEY UPDATE state_json = VALUES(state_json)",[JSON.stringify(db)]);else{await fs.mkdir(path.dirname(dbPath),{recursive:true});await fs.writeFile(dbPath,JSON.stringify(db,null,2),"utf8");}});return saveQueue;}
function safe(x){if(!x)return null;const v={...x};delete v.password;return v;}
function send(res,status,data){res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"});res.end(JSON.stringify(data));}
function fail(res,status,message){send(res,status,{error:message});}
function body(req){return new Promise((resolve,reject)=>{let raw="";req.on("data",x=>{raw+=x;if(raw.length>8000000)reject(new Error("body too large"));});req.on("end",()=>{try{resolve(raw?JSON.parse(raw):{});}catch{reject(new Error("invalid JSON"));}});req.on("error",reject);});}
function session(req,role){const h=req.headers.authorization||"";const key=h.startsWith("Bearer ")?h.slice(7):"";const s=db.sessions[key];return s&&(!role||s.role===role)?s:null;}
function person(req){const s=session(req,"participant");return s&&db.applications.find(x=>x.id===s.userId);}
function publicVoter(req){return session(req,"voter");}
function admin(req){return Boolean(session(req,"admin"));}
function teamView(team){return team?{...team,members:team.memberIds.map(x=>safe(db.applications.find(a=>a.id===x))).filter(Boolean)}:null;}
function projectView(project){return {...project,team:teamView(db.teams.find(x=>x.id===project.teamId))};}
function votingIsOpen(){return Boolean(db.config.voteOpen);}
function voteView(vote){return vote?{id:vote.id,createdAt:vote.createdAt,selections:(vote.selections||[]).map(selection=>({...selection,projectName:db.projects.find(project=>project.id===selection.projectId)?.projectName||"已删除项目"}))}:null;}
function normalizeVoterIdentity(data){
  const name=String(data.name||"").normalize("NFKC").trim().replace(/\s+/g," ");
  const studentId=String(data.studentId||"").normalize("NFKC").trim().toUpperCase().replace(/[\s-]/g,"");
  if(name.length<1||name.length>40)return {error:"请输入真实姓名。"};
  if(!/^\d{8,14}$/.test(studentId))return {error:"请输入 8–14 位数字学号。"};
  const digest=value=>crypto.createHmac("sha256",process.env.MINICAMP_VOTER_SECRET||adminPassword).update(value).digest("hex");
  return {name,studentId,credentialHash:digest("studentId:"+studentId),identityHash:digest("identity:"+[name,studentId].join("|"))};
}
function duplicatePublicVote(identity){return db.votes.find(vote=>vote.role==="participant"&&(vote.voterCredentialHash===identity.credentialHash||vote.voterIdentityHash===identity.identityHash));}
function testFixtureMode(){return Boolean(db.testFixtures?.active);}
function addNotice(title,bodyText,type,target="ALL"){db.notices.unshift({id:makeId("NOTICE"),title,body:bodyText,type,target,readBy:[],createdAt:new Date().toISOString(),testFixture:testFixtureMode()});}
/** 问答回答/公开后通知提问者；一次回答只通知一次，避免反复保存答案刷屏。 */
function notifyQaAnswered(question){
  if(!question)return;
  // 注意：只能就地修改数组，不能替换 db 上的数组引用（saveDb 闭包持有的是对象引用）。
  if(!Array.isArray(db.qaAnsweredNoticeIds))db.qaAnsweredNoticeIds=[];
  if(db.qaAnsweredNoticeIds.includes(question.question_id))return;
  const body=[`你的提问：${question.question}`,"",`主办方回答：${question.answer||""}`,"","在 Q&A 页面 qa.html 可以随时查看。"];
  addNotice("你的提问已回答",body.join("\n"),"问答",question.asker_id);
  db.qaAnsweredNoticeIds.push(question.question_id);
  if(db.qaAnsweredNoticeIds.length>500)db.qaAnsweredNoticeIds.splice(0,db.qaAnsweredNoticeIds.length-500);
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
function participationModeFor(grade){return /大一|一年级|freshman/i.test(String(grade||""))?"仅参与路演及后续投票等阶段，不参与开发环节":"可参与完整活动流程";}
function isContestant(p){return Boolean(p&&((p.registration_type||p.registrationType||"contestant")==="contestant"));}
const contestantBasicFields=["name","studentId","college","major","grade","phone","email"];
const contestantEditableFields=["skills","motivation","experience","portfolio"];
function lockedContestantProfile(participant){
  const major=String(participant?.major||"");
  const grade=String(participant?.grade||"");
  const match=!grade&&major.match(/^\s*(.*?)\s*·\s*(大一|大二|大三|大四|研究生)\s*$/);
  return {name:String(participant?.name||""),studentId:String(participant?.studentId||""),college:String(participant?.college||""),major:match?match[1]:major,grade:match?match[2]:grade,phone:String(participant?.phone||""),email:String(participant?.email||"")};
}
function patchContestantProfile(participant,data){
  const locked=lockedContestantProfile(participant);
  if(contestantBasicFields.some(key=>Object.hasOwn(data,key)&&String(data[key]??"").trim()!==locked[key].trim()))return {status:403,message:"基本信息不可修改"};
  const next={...participant,...locked};
  for(const key of contestantEditableFields)if(Object.hasOwn(data,key))next[key]=key==="skills"?normalizeSkills(data[key]):data[key];
  if(!isProfileComplete(next))return {status:400,message:"required fields missing"};
  Object.assign(participant,locked);
  for(const key of contestantEditableFields)if(Object.hasOwn(data,key))participant[key]=next[key];
  participant.entryType="个人报名";
  participant.participationMode=participationModeFor(participant.grade);
  participant.updatedAt=new Date().toISOString();
  return null;
}
function isAccepted(p){return Boolean(p&&(p.status==="已录取"||p.status==="已通过"));}
function nextRoadshowCode(){const year=new Date().getFullYear();const max=(db.applications||[]).reduce((n,x)=>{const m=String(x.id||"").match(/^RO-\d{4}-(\d{6})$/);return m?Math.max(n,Number(m[1])):n;},0);return "RO-"+year+"-"+String(max+1).padStart(6,"0");}
function canPreTeam(p){return Boolean(p&&isContestant(p)&&isProfileComplete(p));}
function parseTeamMemberIds(value){return [...new Set(String(value??"").split(/[\s,，;；]+/).map(item=>item.trim().toUpperCase()).filter(Boolean))];}
function createPreTeam(owner,data){
  const ids=parseTeamMemberIds(data.memberIds);
  if(!ids.length)return {error:"member ids required",status:400};
  if(ids.length>4)return {error:"too many members",status:400};
  if(ids.includes(String(owner.id).toUpperCase()))return {error:"cannot include yourself",status:400};
  if(owner.teamId||db.teams.some(item=>(item.memberIds||[]).includes(owner.id)))return {error:"already belongs to a team",status:409};
  const members=ids.map(id=>db.applications.find(item=>String(item.id||"").toUpperCase()===id));
  if(members.some(member=>!member))return {error:"member not found",status:404};
  if(members.some(member=>!isContestant(member)))return {error:"member must be contestant",status:400};
  if(members.some(member=>!isProfileComplete(member)))return {error:"member profile incomplete",status:400};
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
  if(url.pathname==="/api/applications"&&method==="POST"){if(!db.config.applicationOpen)return fail(res,403,"application closed");const d=await body(req);const type=d.registration_type||d.registrationType||"contestant";if(type==="roadshow"){if(!d.name||!d.phone||!d.email||!d.identity_type||!d.school_or_company||!d.grade_or_position)return fail(res,400,"required fields missing");if(db.applications.some(x=>!isContestant(x)&&(String(x.email||"").toLowerCase()===String(d.email).toLowerCase()||String(x.phone||"")===String(d.phone))))return fail(res,409,"duplicate application");const a={...d,id:nextRoadshowCode(),registration_type:"roadshow",registrationType:"roadshow",entryType:"路演报名",status:"已通过",teamCode:"",teamId:"",skills:[],attend_roadshow:d.attend_roadshow!==false&&d.attend_roadshow!=="false",receive_notifications:d.receive_notifications!==false&&d.receive_notifications!=="false",createdAt:new Date().toISOString(),testFixture:testFixtureMode()};db.applications.unshift(a);addNotice("路演报名成功","你的路演报名已通过，报名码为 "+a.id+"。","roadshow",a.id);const t=makeToken();db.sessions[t]={role:"participant",userId:a.id,createdAt:Date.now(),testFixture:testFixtureMode()};await saveDb();return send(res,201,{application:safe(a),token:t});}if(db.config.applicationDeadline&&Date.now()>Date.parse(db.config.applicationDeadline))return fail(res,403,"application closed");if(!d.name||!d.studentId||!d.email||!d.phone||!d.motivation||!d.grade)return fail(res,400,"required fields missing");if(db.applications.some(x=>isContestant(x)&&(x.studentId===d.studentId||String(x.email||"").toLowerCase()===String(d.email).toLowerCase())))return fail(res,409,"duplicate application");const a={...d,id:"MC26-"+String(1+db.applications.reduce((max,x)=>/^MC26-\d+$/.test(x.id)?Math.max(max,Number(x.id.slice(5))):max,1000)).padStart(4,"0"),registration_type:"contestant",registrationType:"contestant",entryType:"个人报名",participationMode:participationModeFor(d.grade),teamCode:"",skills:d.skills||[],status:"待审核",teamId:"",createdAt:new Date().toISOString(),testFixture:testFixtureMode()};db.applications.unshift(a);addNotice("Application received","Your application is received.","application",a.id);const t=makeToken();db.sessions[t]={role:"participant",userId:a.id,createdAt:Date.now(),testFixture:testFixtureMode()};await saveDb();return send(res,201,{application:safe(a),token:t});}
  if(url.pathname==="/api/auth/participant"&&method==="POST"){const d=await body(req);const c=String(d.contact||"").toLowerCase().replace(/[\s-]/g,"");const a=db.applications.find(x=>x.id.toUpperCase()===String(d.id||"").toUpperCase()&&[x.email,x.phone].some(v=>String(v||"").toLowerCase().replace(/[\s-]/g,"")===c));if(!a)return fail(res,401,"invalid participant credentials");const t=makeToken();db.sessions[t]={role:"participant",userId:a.id,createdAt:Date.now(),testFixture:testFixtureMode()};await saveDb();return send(res,200,{participant:safe(a),token:t});}
  if(url.pathname==="/api/auth/voter"&&method==="POST"){if(!votingIsOpen())return fail(res,403,"voting not open");const identity=normalizeVoterIdentity(await body(req));if(identity.error)return fail(res,400,identity.error);const existing=duplicatePublicVote(identity);const t=makeToken();db.sessions[t]={role:"voter",userId:identity.identityHash,credentialHash:identity.credentialHash,voter:{name:identity.name,studentId:identity.studentId},createdAt:Date.now(),testFixture:testFixtureMode()};await saveDb();return send(res,200,{voter:db.sessions[t].voter,hasVoted:Boolean(existing),token:t});}
  if(url.pathname==="/api/auth/admin"&&method==="POST"){const d=await body(req);if(d.password!==adminPassword)return fail(res,401,"invalid admin password");const t=makeToken();db.sessions[t]={role:"admin",userId:"ADMIN",createdAt:Date.now(),testFixture:testFixtureMode()};await saveDb();return send(res,200,{token:t});}
  const me=person(req);
  const voter=publicVoter(req);
  if(url.pathname==="/api/me"&&method==="DELETE"){if(!me)return fail(res,401,"login required");deleteParticipantAccount(me);await saveDb();return send(res,200,{ok:true});}
  if(url.pathname==="/api/teams"&&method==="POST"&&me&&canPreTeam(me)){const result=createPreTeam(me,await body(req));if(result.error)return fail(res,result.status,result.error);await saveDb();return send(res,201,{team:teamView(result.team)});}
  if(url.pathname==="/api/teams"&&method==="POST"&&me&&canPreTeam(me)&&!isAccepted(me)){if(me.teamId||db.teams.some(item=>item.memberIds.includes(me.id)))return fail(res,409,"already belongs to a team");const d=await body(req);const team={id:"TEAM "+String(db.teams.length+1).padStart(2,"0"),ownerId:me.id,code:"MC26-"+crypto.randomBytes(2).toString("hex").toUpperCase(),project:d.project||"Untitled",theme:d.theme||"TBD",memberIds:[me.id],status:"draft",locked:false,published:false,testFixture:testFixtureMode()};db.teams.push(team);me.teamId=team.id;me.teamCode=team.code;await saveDb();return send(res,201,{team:teamView(team)});}
  if(url.pathname==="/api/teams/join-by-code"&&method==="POST"&&me&&canPreTeam(me)&&!isAccepted(me)){const d=await body(req),code=String(d.code||"").trim().toUpperCase();if(!code)return fail(res,400,"team code required");const team=db.teams.find(x=>String(x.code||"").toUpperCase()===code);if(!team)return fail(res,404,"team code not found");if(team.locked||team.memberIds.length>=5)return fail(res,409,"team is locked or full");const currentTeam=db.teams.find(item=>item.memberIds.includes(me.id)||item.id===me.teamId);if(currentTeam)return fail(res,409,"already belongs to a team");team.memberIds.push(me.id);me.teamId=team.id;me.teamCode=team.code;await saveDb();return send(res,200,{team:teamView(team)});}
  const preTeamJoin=url.pathname.match(/^\/api\/teams\/([^/]+)\/join$/);if(preTeamJoin&&method==="POST"&&me&&canPreTeam(me)&&!isAccepted(me)){const team=db.teams.find(x=>x.id===decodeURIComponent(preTeamJoin[1]));if(!team)return fail(res,404,"team not found");if(team.locked||team.memberIds.length>=5)return fail(res,409,"team is locked or full");const currentTeam=db.teams.find(item=>item.memberIds.includes(me.id)||item.id===me.teamId);if(currentTeam)return fail(res,409,currentTeam.id===team.id?"already in team":"leave current team first");team.memberIds.push(me.id);me.teamId=team.id;me.teamCode=team.code;await saveDb();return send(res,200,{team:teamView(team)});}
  if(url.pathname==="/api/me"&&method==="PATCH"&&me&&isContestant(me)){const d=await body(req);const error=patchContestantProfile(me,d);if(error)return fail(res,error.status,error.message);addNotice("资料已更新","你的能力与经历已更新，主办方将重新审核。","资料复核",me.id);await saveDb();return send(res,200,{participant:safe(me)});}
  if(url.pathname==="/api/me"&&method==="GET"){if(!me)return fail(res,401,"login required");return send(res,200,{participant:safe(me),team:teamView(db.teams.find(x=>x.id===me.teamId))});}
  if(url.pathname==="/api/me/vote"&&method==="GET"){if(me&&!isContestant(me))return fail(res,403,"roadshow participants do not have voting access");if(!me&&!voter)return fail(res,401,"login required");const voterId=voter?.userId||me.id;return send(res,200,{voter:voter?.voter||{name:me.name,grade:me.grade,college:me.college,teamId:me.teamId},vote:voteView(db.votes.find(item=>item.role==="participant"&&(item.voterId===voterId||voter&&(item.voterIdentityHash===voter.userId)))),voteOpen:votingIsOpen()});}
  if(url.pathname==="/api/me"&&method==="PATCH"){if(!me)return fail(res,401,"login required");const d=await body(req);if(!isContestant(me)){if(!["name","phone","email","identity_type","school_or_company","grade_or_position"].every(key=>String(d[key]||"").trim()))return fail(res,400,"required fields missing");Object.assign(me,{name:d.name,phone:d.phone,email:d.email,identity_type:d.identity_type,school_or_company:d.school_or_company,grade_or_position:d.grade_or_position,attend_roadshow:d.attend_roadshow===undefined?me.attend_roadshow:d.attend_roadshow!==false&&d.attend_roadshow!=="false",receive_notifications:d.receive_notifications===undefined?me.receive_notifications:d.receive_notifications!==false&&d.receive_notifications!=="false",updatedAt:new Date().toISOString()});await saveDb();return send(res,200,{participant:safe(me)});}if(!d.name||!d.studentId||!d.college||!d.major||!d.grade||!d.phone||!d.email||!d.motivation)return fail(res,400,"required fields missing");if(d.studentId&&d.studentId!==me.studentId&&db.applications.some(item=>item.id!==me.id&&item.studentId===d.studentId))return fail(res,409,"student id already exists");d.entryType="个人报名";d.participationMode=participationModeFor(d.grade);d.teamCode=me.teamCode;Object.assign(me,d,{id:me.id,registration_type:me.registration_type,registrationType:me.registrationType,status:isAccepted(me)?"待复审":me.status,teamId:me.teamId});me.updatedAt=new Date().toISOString();addNotice("资料已更新","你的报名资料已更新，主办方将重新审核。","资料复核",me.id);await saveDb();return send(res,200,{participant:safe(me)});}
  if(url.pathname==="/api/me/notices"&&method==="GET"){if(!me)return fail(res,401,"login required");return send(res,200,{notices:db.notices.filter(x=>x.target==="ALL"||x.target===me.id)});}
  if(url.pathname==="/api/me/notices/read"&&method==="POST"){if(!me)return fail(res,401,"login required");db.notices.filter(x=>x.target==="ALL"||x.target===me.id).forEach(x=>x.readBy=[...new Set([...(x.readBy||[]),me.id])]);await saveDb();return send(res,200,{ok:true});}
  if(url.pathname==="/api/teams"&&method==="GET"){if(me&&!isContestant(me))return fail(res,403,"roadshow participants do not have team access");return send(res,200,{teams:db.teams.filter(team=>team.published&&!team.locked).map(teamView)});}
  if(url.pathname==="/api/teams/join-by-code"&&method==="POST"){if(!me)return fail(res,401,"login required");if(!isContestant(me)||!isAccepted(me))return fail(res,403,"accepted contestants only");if(!isProfileComplete(me))return fail(res,400,"profile incomplete");const currentTeam=db.teams.find(item=>item.memberIds.includes(me.id)||item.id===me.teamId);if(currentTeam)return fail(res,409,"already belongs to a team");const d=await body(req),code=String(d.code||"").trim().toUpperCase();if(!code)return fail(res,400,"team code required");const team=db.teams.find(item=>String(item.code||"").toUpperCase()===code);if(!team)return fail(res,404,"team code not found");if(team.locked||team.memberIds.length>=5)return fail(res,409,"team is locked or full");team.memberIds.push(me.id);me.teamId=team.id;me.teamCode=team.code;await saveDb();return send(res,200,{team:teamView(team)});}
  if(url.pathname==="/api/teams"&&method==="POST"){if(!me)return fail(res,401,"login required");if(!isContestant(me)||!isAccepted(me))return fail(res,403,"accepted contestants only");if(!isProfileComplete(me))return fail(res,400,"profile incomplete");if(me.teamId||db.teams.some(item=>item.memberIds.includes(me.id)))return fail(res,409,"already belongs to a team");const d=await body(req);const team={id:"TEAM "+String(db.teams.length+1).padStart(2,"0"),ownerId:me.id,code:"MC26-"+crypto.randomBytes(2).toString("hex").toUpperCase(),project:d.project||"Untitled",theme:d.theme||"TBD",memberIds:[me.id],status:"draft",locked:false,published:false,testFixture:testFixtureMode()};db.teams.push(team);me.teamId=team.id;me.teamCode=team.code;await saveDb();return send(res,201,{team:teamView(team)});}
  const tm=url.pathname.match(/^\/api\/teams\/([^/]+)\/(join|lock|leave|recruit)$/);
  if(tm){const team=db.teams.find(x=>x.id===decodeURIComponent(tm[1]));if(!team)return fail(res,404,"team not found");if(tm[2]==="recruit"&&method==="PATCH"){if(!me||team.ownerId!==me.id||!team.memberIds.includes(me.id))return fail(res,403,"team owner required");if(team.locked)return fail(res,409,"locked team cannot be changed");team.published=!team.published;await saveDb();return send(res,200,{team:teamView(team)});}if(tm[2]==="join"&&method==="POST"){if(!me)return fail(res,401,"login required");if(!isContestant(me)||!isAccepted(me))return fail(res,403,"accepted contestants only");if(!isProfileComplete(me))return fail(res,400,"profile incomplete");if(team.locked||team.memberIds.length>=5)return fail(res,409,"team is locked or full");const currentTeam=db.teams.find(item=>item.memberIds.includes(me.id)||item.id===me.teamId);if(currentTeam)return fail(res,409,currentTeam.id===team.id?"already in team":"leave current team first");team.memberIds.push(me.id);me.teamId=team.id;me.teamCode=team.code;await saveDb();return send(res,200,{team:teamView(team)});}if(tm[2]==="leave"&&method==="POST"){if(!me||!team.memberIds.includes(me.id))return fail(res,403,"team member required");if(team.locked)return fail(res,409,"locked team cannot be changed");if(team.memberIds.length===1&&db.projects.some(project=>project.teamId===team.id))return fail(res,409,"submitter must keep the project team");team.memberIds=team.memberIds.filter(memberId=>memberId!==me.id);if(team.ownerId===me.id)team.ownerId=team.memberIds[0]||"";me.teamId="";me.teamCode="";if(!team.memberIds.length)db.teams=db.teams.filter(item=>item.id!==team.id);await saveDb();return send(res,200,{ok:true});}if(tm[2]==="lock"&&method==="PATCH"){if(!db.config.teamConfirmOpen)return fail(res,403,"team confirmation not open");if(!me||team.ownerId!==me.id||!team.memberIds.includes(me.id))return fail(res,403,"team owner required");if(team.memberIds.length<3||team.memberIds.length>5)return fail(res,400,"team must have 3 to 5 members");if(team.memberIds.some(id=>{const p=db.applications.find(x=>x.id===id);return !isContestant(p)||!isAccepted(p)||!isProfileComplete(p);}))return fail(res,400,"all members must be accepted and complete");team.locked=true;team.status="locked";await saveDb();return send(res,200,{team:teamView(team)});}}
  // ---- 问答信息（qa_questions）：参与者提问，主办方回答 / 置顶 / 隐藏 ----
  if(url.pathname==="/api/qa"&&method==="POST"){
    if(!me)return fail(res,401,"login required");
    const d=await body(req);
    const result=await qaStore.createQuestion({askerId:me.id,question:d.question??d.content??d.text});
    if(result.error)return fail(res,result.status,result.error);
    return send(res,201,{question:result.question});
  }
  if(url.pathname==="/api/qa"&&method==="GET"){
    // 主办方看全部（可按状态筛选，逗号分隔），参与者只看自己提的问题（含待回答）。
    if(admin(req))return send(res,200,{questions:qaStore.list({status:parseQaStatusFilter(url.searchParams.get("status"))}),stats:qaStore.stats(),storage:qaStore.mode()});
    if(!me)return fail(res,401,"login required");
    return send(res,200,{questions:qaStore.list({askerId:me.id})});
  }
  // 公开列表：置顶在前 + 已回答；不含 asker_id 等身份信息。
  if((url.pathname==="/api/qa/public"||url.pathname==="/api/qa/answered")&&method==="GET")return send(res,200,{questions:qaStore.listPublic().map(publicQuestion)});
  const qaAnswerMatch=url.pathname.match(/^\/api\/admin\/qa\/([^/]+)$/);
  if(qaAnswerMatch&&method==="PATCH"){
    if(!admin(req))return fail(res,401,"admin required");
    const d=await body(req),questionId=decodeURIComponent(qaAnswerMatch[1]);
    let question=null;
    if(d.answer!==undefined||d.content!==undefined){
      const result=await qaStore.answerQuestion({questionId,answer:d.answer??d.content,answeredBy:d.answeredBy});
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
  if(url.pathname==="/api/ideas"&&method==="GET")return send(res,200,{ideas:db.ideas.filter(x=>x.status==="open")});
  if(url.pathname==="/api/ideas"&&method==="POST"){if(!me)return fail(res,401,"login required");if(!isContestant(me)||!isAccepted(me))return fail(res,403,"accepted contestants only");const d=await body(req);if(!d.title||!d.summary)return fail(res,400,"idea title and summary required");const idea={id:makeId("IDEA"),title:d.title,summary:d.summary,theme:d.theme||"TBD",needs:d.needs||[],authorId:me.id,status:"open",createdAt:new Date().toISOString(),testFixture:testFixtureMode()};db.ideas.unshift(idea);await saveDb();return send(res,201,{idea});}
  if(url.pathname==="/api/projects"&&method==="GET")return send(res,200,{projects:db.projects.filter(x=>x.status==="published").map(projectView)});
  if(url.pathname==="/api/projects"&&method==="POST"){if(!me)return fail(res,401,"login required");if(!isContestant(me)||!isAccepted(me))return fail(res,403,"accepted participants only");const team=db.teams.find(x=>x.id===me.teamId);if(!team)return fail(res,403,"join a team first");if(db.projects.some(project=>project.teamId===team.id))return fail(res,409,"team already has a project");const d=await body(req);const project={id:makeId("PROJECT"),teamId:team.id,...d,members:d.members||team.memberIds.map(mid=>({name:db.applications.find(x=>x.id===mid)?.name||"member",role:""})),aiTools:d.aiTools||[],status:"draft",createdAt:new Date().toISOString(),testFixture:testFixtureMode()};db.projects.push(project);await saveDb();return send(res,201,{project:projectView(project)});}
  if(url.pathname.startsWith("/api/projects/")&&method==="PATCH"){const isAdmin=admin(req);if(!me&&!isAdmin)return fail(res,401,"login required");const p=db.projects.find(x=>x.id===decodeURIComponent(url.pathname.split("/").pop()));if(!p)return fail(res,404,"project not found");const d=await body(req);if(!isAdmin&&p.teamId!==me.teamId)return fail(res,403,"project access denied");if(isAdmin)Object.assign(p,d);else for(const key of ["projectName","theme","tagline","problem","solution","demoUrl","githubUrl","coverUrl","aiTools"]){if(Object.hasOwn(d,key))p[key]=d[key];}await saveDb();return send(res,200,{project:projectView(p)});}
  if(url.pathname==="/api/votes"&&method==="POST"){const jury=admin(req);if(!votingIsOpen())return fail(res,403,"voting not open");if(!jury&&!me&&!voter)return fail(res,401,"login required");if(me&&(!isContestant(me)||!isAccepted(me)))return fail(res,403,"accepted participants only");const d=await body(req),role=jury?"jury":"participant",voterId=jury?"ADMIN":voter?.userId||me.id;if(duplicatePublicVote(voter?{credentialHash:voter.credentialHash,identityHash:voter.userId}:{credentialHash:null,identityHash:null})||db.votes.some(x=>x.voterId===voterId&&x.role===role))return fail(res,409,"vote already submitted");const selections=normalizeVoteSelections(d.selections,role);if(!selections)return fail(res,400,"invalid vote selections");const allowed=new Set(db.projects.filter(x=>x.status==="published").map(x=>x.id));if(selections.some(x=>!allowed.has(x.projectId)))return fail(res,400,"unpublished project in vote");if(me&&selections.some(x=>db.projects.find(p=>p.id===x.projectId)?.teamId===me.teamId))return fail(res,400,"cannot vote for your team");db.votes.push({id:makeId("VOTE"),voterId,role,selections,createdAt:new Date().toISOString(),voterCredentialHash:voter?.credentialHash||null,voterIdentityHash:voter?.userId||null,testFixture:testFixtureMode()});await saveDb();return send(res,201,{ok:true});}
  if(url.pathname==="/api/organizer/summary"&&method==="GET"){if(!admin(req))return fail(res,401,"admin required");return send(res,200,{config:{eventName:db.config.eventName,date:db.config.date,venue:db.config.venue,applicationOpen:db.config.applicationOpen,applicationDeadline:db.config.applicationDeadline,resultDate:db.config.resultDate},metrics:{applications:db.applications.length,accepted:db.applications.filter(x=>x.status==="已录取").length,pending:db.applications.filter(x=>x.status==="待审核").length,teams:db.teams.length,publishedProjects:db.projects.filter(x=>x.status==="published").length},teams:db.teams.map(t=>({id:t.id,project:t.project,theme:t.theme,status:t.status,memberCount:t.memberIds.length})),projects:db.projects.filter(x=>x.status==="published").map(p=>({id:p.id,projectName:p.projectName,theme:p.theme,tagline:p.tagline,demoUrl:p.demoUrl})),notices:db.notices.filter(x=>x.target==="ALL").slice(0,10).map(x=>({title:x.title,body:x.body,type:x.type,createdAt:x.createdAt}))});}
  if(url.pathname==="/api/admin/summary"&&method==="GET"){if(!admin(req))return fail(res,401,"admin required");return send(res,200,{applications:db.applications.map(safe),teams:db.teams.map(teamView),ideas:db.ideas,projects:db.projects.map(projectView),notices:db.notices,votes:db.votes,results:calcResults(),awards:resolvedAwards(),config:{...db.config,voteOpen:votingIsOpen()}});}
  if(url.pathname==="/api/admin/applications"&&method==="PATCH"){if(!admin(req))return fail(res,401,"admin required");const d=await body(req),a=db.applications.find(x=>x.id===d.id);if(!a)return fail(res,404,"application not found");if(!applicationStatuses.has(d.status))return fail(res,400,"invalid application status");a.status=d.status;if(d.teamId){a.teamId=d.teamId;const t=db.teams.find(x=>x.id===d.teamId);if(t&&!t.memberIds.includes(a.id))t.memberIds.push(a.id);}addNotice("Application status updated","Your application status has changed.","application",a.id);await saveDb();return send(res,200,{participant:safe(a)});}
  if(url.pathname==="/api/admin/config"&&method==="PATCH"){if(!admin(req))return fail(res,401,"admin required");Object.assign(db.config,await body(req));await saveDb();return send(res,200,{config:{...db.config,voteOpen:votingIsOpen()}});}
  if(url.pathname==="/api/admin/notices"&&method==="POST"){if(!admin(req))return fail(res,401,"admin required");const d=await body(req);addNotice(d.title,d.body,d.type||"event",d.target||"ALL");await saveDb();return send(res,201,{ok:true});}
  if(url.pathname==="/api/admin/projects"&&method==="PATCH"){if(!admin(req))return fail(res,401,"admin required");const d=await body(req),p=db.projects.find(x=>x.id===d.id);if(!p)return fail(res,404,"project not found");p.status=d.status;await saveDb();return send(res,200,{project:projectView(p)});}
  const adminTeam=url.pathname.match(/^\/api\/admin\/teams\/([^/]+)$/);if(adminTeam&&method==="PATCH"){if(!admin(req))return fail(res,401,"admin required");const team=db.teams.find(item=>item.id===decodeURIComponent(adminTeam[1]));if(!team)return fail(res,404,"team not found");const d=await body(req);if(typeof d.locked!=="boolean")return fail(res,400,"locked flag required");if(d.locked&&!db.config.teamConfirmOpen)return fail(res,403,"team confirmation not open");team.locked=d.locked;team.status=d.locked?"locked":"draft";await saveDb();return send(res,200,{team:teamView(team)});}
  const adminIdea=url.pathname.match(/^\/api\/admin\/ideas\/([^/]+)$/);if(adminIdea&&method==="PATCH"){if(!admin(req))return fail(res,401,"admin required");const idea=db.ideas.find(item=>item.id===decodeURIComponent(adminIdea[1]));if(!idea)return fail(res,404,"idea not found");const d=await body(req);if(!["open","closed"].includes(d.status))return fail(res,400,"invalid idea status");idea.status=d.status;await saveDb();return send(res,200,{idea});}
  if(url.pathname==="/api/admin/results"&&method==="GET"){if(!admin(req))return fail(res,401,"admin required");return send(res,200,{results:calcResults(),awards:resolvedAwards(),votes:db.votes});}
  return fail(res,404,"API not found");
}
async function serve(req,res){const url=new URL(req.url,"http://"+(req.headers.host||"localhost"));if(url.pathname.startsWith("/api/")){try{await api(req,res,url);}catch(e){console.error(e);fail(res,500,e.message||"server error");}return;}const requested=url.pathname==="/"?"/index.html":url.pathname;const file=path.resolve(publicRoot,"."+path.posix.normalize(requested));if(file!==publicRoot&&!file.startsWith(publicRoot+path.sep)){res.writeHead(403);res.end("Forbidden");return;}try{const data=await fs.readFile(file);res.writeHead(200,{"Content-Type":mime[path.extname(file)]||"application/octet-stream","Cache-Control":"no-store"});res.end(data);}catch{res.writeHead(404);res.end("Not found");}}
await loadDb();
http.createServer(serve).listen(port,"127.0.0.1",()=>console.log("minicamp preview: http://localhost:"+port+" (qa storage: "+qaStore.mode()+")"));

