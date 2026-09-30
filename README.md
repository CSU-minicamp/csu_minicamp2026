# minicamp 校园黑客松官网

面向中南大学学生的 minicamp 校园黑客松官网。站点分为两层：

1. **欢迎页（站点首页 `/`，`public/index.html`）**——面向第一次听说 MiniCamp 的人，介绍 MiniCamp 是什么、有哪些内容、由谁举办，并提供**选择届次**（2025 / 2026）与**历届作品**展示。届次与作品数据由 `public/data/editions.json` 配置，格式见 [`public/data/README.md`](public/data/README.md)。
2. **2026 赛事信息页（`/2026info.html`）**——2026 届的完整赛事页面，包含活动介绍、流程、赛程、奖项、报名（参赛 / 路演）、FAQ、主办方与合作伙伴，以及报名、组队、Idea、项目提交、Project Gallery、投票和主办方工作台的入口。

> 第 2 条这个页面此前就是站点首页；欢迎页上线后它更名为 `2026info.html`，样式文件一并从
> `index.css` 更名为 `2026info.css`，脚本 `app.js` 更名为 `2026info.js`，其余脚本（`nav.js` 等）保持原名，只是文件名和站内链接做了调整。
> 注意：`public/2026info.css` / `public/2026info.js` 是 **2026info 页面的样式与脚本**，欢迎页用的是 `public/index.css` / `public/index.js`——两者不要混淆（详见下方「文件改名与待清理清单」）。

## 本地预览

请确保已安装 Node.js，然后在项目目录执行：

    npm install
    node server.mjs

在浏览器打开 http://localhost:4173/。

`npm install` 会装好两个依赖：`mysql2`（数据层）和 `chart.js`（主办方后台「分类查看」柱状图）。**没有构建步骤**——
Chart.js 不需要打包：`server.mjs` 把 `admin.html` 引用的 `/vendor/chart.umd.min.js` 直接映射到
`node_modules/chart.js/dist/chart.umd.js`（npm 包里只有官方未压缩的 UMD，没有 `.min.js`）。
所以正常情况下不依赖外网；万一本路径取不到（例如部署时漏了 `npm install`），页面会回退到 CDN 的
Chart.js（jsDelivr，带 SRI 校验），两个源都不可用时后台图表退化为数字列表，不会白屏。
前端页面仍然在 `public/` 下由 Node 静态托管。

主办方默认本地密码为 123456，正式运行时请设置环境变量：

    $env:MINICAMP_ADMIN_PASSWORD = "your-password"
    node server.mjs

默认优先使用 MySQL 持久化；如果本地 MySQL 不可用，服务会自动回退到 `data/minicamp.json`，该文件不提交到 Git。可通过 `.env.example` 配置数据库连接。**如果 MySQL 连得上、但库里还没有 `app_state` 的 `main` 行（例如新库尚未导入镜像），服务会直接报错退出，不会拿本机 `data/minicamp.json` 去填库**；确需该行为时设 `MINICAMP_ALLOW_JSON_SEED=1`。

### 本机 MySQL（Windows）

本项目已在 **MySQL 9.7 + mysql2** 上验证通过。安装好 MySQL Community Server 并启动服务（Windows 服务名形如 `MySQL97`，监听 `127.0.0.1:3306`）后：

1. 复制 `.env.example` 为 `.env`（`.env` 已在 `.gitignore` 中，不会提交），填入本机账号，例如：

       MINICAMP_PORT=4173
       MINICAMP_ADMIN_PASSWORD=你的主办方密码
       MYSQL_HOST=127.0.0.1
       MYSQL_PORT=3306
       MYSQL_USER=user
       MYSQL_PASSWORD=123456
       MYSQL_DATABASE=minicamp2026

2. 用 `npm start`（会加载 `.env`）或先设环境变量再 `node server.mjs` 启动。**数据库 `minicamp2026` 与两张表（`app_state`、`qa_questions`）都会自动创建**，不需要手工执行 SQL。
3. 启动日志出现 `(qa storage: table)` 表示问答已写入 MySQL 表；出现 `(qa storage: json)` 说明连不上数据库，这时问答会落到 `data/qa.json`，请检查账号密码与服务状态。

常用排错：

- `ER_ACCESS_DENIED_ERROR`：账号/密码不对，或该用户没有从 `localhost` 连接的权限。
- `EADDRINUSE 127.0.0.1:4173`：已经有一个服务在跑（可能就是你之前启动的那个）。要么停掉它，要么换个端口：`$env:MINICAMP_PORT="4200"; node server.mjs`。
- 服务只在启动时建表/连库，改完 `.env` 需要重启才生效。

## 测试数据

先停止正在运行的本地服务，再生成数据，随后重新启动服务：

    npm run test-data -- --yes

脚本默认**只打印目标库和将要做的改动、不写入**；确认目标无误后必须加 `--yes`（或设 `MINICAMP_TESTDATA_YES=1`）才会真正执行。它连的是 `MYSQL_DATABASE` 指定的库；**连不上 MySQL 时会直接拒绝执行**，不会退回去改写本地 `data/minicamp.json`（确实要写本地文件请再加 `--allow-json`）。

注意 npm 脚本本身不加载 `.env`：在干净 shell 里它会以默认的 `root`/空密码去连，从而被上述护栏拒绝（避免"目标不明就写文件"）。要写本机 MySQL，二选一：

    $env:MYSQL_USER="user"; $env:MYSQL_PASSWORD="123456"; npm run test-data -- --yes
    node --env-file-if-exists=.env scripts/test-data.mjs seed --yes

`clear-test-data` 同理。

测试数据带有内部标记，覆盖报名状态、个人资料、锁定与草稿队伍、公开与草稿项目、创意、全局与定向通知、参与者投票、Jury 评审结果，以及已开放的投票配置。注意 `seed` 会把 `applicationOpen` / `voteOpen` 强制改为 `true` 并置 `testFixtures.active`，**不要对正式库执行**。

常用测试账号：

- `TEST-APP-01` / `test-01@minicamp.local`：已锁定队伍成员，可测试个人资料、项目与投票。
- `TEST-APP-22` / `test-create-team@minicamp.local`：已录取且未组队，可测试创建队伍。
- `TEST-APP-23` / `test-join-team@minicamp.local`：已录取且未组队，可加入 `TEST-TEAM-06` 并测试锁定队伍。

需要清除时运行（同样需要 `--yes`）：

    npm run clear-test-data -- --yes

清除命令只删除带测试标记的数据，并恢复生成前的活动配置；不会删除原有报名、队伍、项目、通知或投票记录。

## 部署与反向代理

前端通过相对路径请求 `/api/*`。Node 服务（`server.mjs`）同时负责**静态页面**和 **`/api` 接口**，并绑定在本机 `127.0.0.1:4173`。因此上线时只需把域名反向代理到这个 Node 服务即可。

- 如果页面请求 `/api/...` 返回 `404`，说明前端是由域名/其他静态服务器提供的，但 `/api` 没有转发到 Node 服务——按下面配置即可解决。
- Nginx（含宝塔面板）：见 `deploy/nginx.conf`
- Caddy：见 `deploy/Caddyfile`

最简做法（推荐）：把整个站点反代到 Node 服务，例如 Nginx：

    location / { proxy_pass http://127.0.0.1:4173; }

或 Caddy：

    your-domain.com { reverse_proxy 127.0.0.1:4173 }

正式运行时请用 pm2 / systemd / nssm 让 Node 常驻，并启用 HTTPS。

> 部署机需要先执行 `npm install`（或 `npm ci`）：`/vendor/chart.umd.min.js` 由 Node 从 `node_modules` 读取，
> 仓库里不再保存前端库副本。若采用上面的「方案 B」（Nginx 直接托管 `public/`、只反代 `/api`），
> 需要额外加一段映射，否则后台图表会退化：
>
>     location = /vendor/chart.umd.min.js {
>         alias /var/www/csu_minicamp2026/node_modules/chart.js/dist/chart.umd.js;
>     }

> 本地开发若用 VS Code Live Server（5500 端口），静态可打开但 `/api` 会 404。直接用 `http://localhost:4173/` 访问 Node 服务即可，无需反代；或在 Live Server 设置中把 `/api` 代理到 `http://127.0.0.1:4173`。

## 页面入口

- 欢迎页（站点首页，`/` 默认到这里）：`/`
- 2026 赛事信息页：`/2026info.html`
- Q&A 问答：`/qa.html`
- 个人主页：`/profile.html`
- 组队与 Idea：`/team.html`
- 项目提交：`/submission.html`
- 项目 Gallery：`/gallery.html`
- AI Coding Starter Pack：`/starter-pack.html`
- 参与者投票：`/voting.html`
- Jury 评审：`/jury.html`
- 主办方后台：`/admin.html`

### 欢迎页与届次配置

欢迎页（`index.html` + `index.css` + `index.js`）自身的结构是纯静态的，从上到下依次是：
Hero → 事实条 → MiniCamp 是什么 → 两天怎么过（MEET/ BUILD/ SHIP 流程）→ 有哪些内容（六个板块）
→ 由谁举办（三个社团）→ **选择届次** → **历届作品** → 站尾。

其中最后两个区块由 `public/data/editions.json` 驱动（静态 JSON，改内容不需要改代码，也不需要重启服务）：

- `editions[]` → 「选择届次」卡片。2026 届的 `page.href` 指向 `2026info.html`；
  2025 届目前是 `status: "coming-soon"` + `page.available: false`，卡片弱化并显示「资料整理中」。
  **2025 届回顾页做好后，把 `page.href` 指向新页面、并把 `page.available` 改成 `true` 即可**，
  欢迎页会自动把按钮换成可点击状态，无需改动 `index.js` / `index.css`。
- `works[]` → 「历届作品」卡片与届次筛选（按 `year` 筛选）。
  真实作品按字段填入并去掉 `placeholder: true`；目前放的占位条目用于演示格式。

字段说明、示例与常见坑见 [`public/data/README.md`](public/data/README.md)。JSON 解析失败时欢迎页只在对应区块提示失败，其余静态内容照常显示。

### 文件改名与待清理清单

站点分层调整后，文件名与页面的对应关系是：

| 文件 | 属于哪个页面 |
|---|---|
| `index.html` / `index.css` / `index.js` | 欢迎页（站点首页） |
| `2026info.html` / `2026info.css` / `2026info.js` | 2026 赛事信息页（原首页，脚本原名 `app.js`） |
| `nav.js` / `api.js` / `participant-fab.js` / `base.css` | 多页共用（见各文件头部注释） |

改动过程中做过三次改名，注意 `index.css` 这个**文件名被复用过**：

1. 原来的 `index.css`（2026 届页面样式）改名为 `2026info.css`；
2. 欢迎页的 `welcome.css` / `welcome.js` 改名为 `index.css` / `index.js`；
3. 2026 届页面的 `app.js` 改名为 `2026info.js`。

所以旧 `index.css` 的内容现在在 `2026info.css` 里，没有丢失。

**待手工清理**：当前实现环境不允许删除文件，因此仓库里会残留下面这些已无任何引用的文件，
它们都已被清空并写上了删除说明，保留不影响渲染，请手工删掉：

    git rm public/welcome.css public/welcome.js public/app.js

如果仓库里还有更早那次改名留下的旧 `index.css` 副本（内容与 `2026info.css` 相同），
不要删——这个文件名现在由欢迎页在用，请确认它的内容以 `/* index.css — MiniCamp 欢迎页…` 开头。

删除前可以自查引用：在 `public/` 里搜 `welcome.css`、`welcome.js`、`app.js`，
只应剩这三个文件自己的注释文字（以及 `2026info.js` 头部说明它原名 `app.js` 的那句）。

## 当前实现

- Node.js 原生 HTTP 服务与 MySQL/JSON 持久化数据层。
- 静态页面、浏览器脚本、样式和图片资源统一位于 `public/`。
- 站点分层：欢迎页（`index.html`，介绍 MiniCamp + 选择届次 + 历届作品）与 2026 赛事信息页（`2026info.html`）。欢迎页的届次与作品来自 `public/data/editions.json`，由 `index.js` 渲染，字段格式见 `public/data/README.md`；2025 届回顾页尚未创建，欢迎页上先以「资料整理中」呈现。
- 参与者和主办方 token 登录。
- 报名去重、Team Code、队伍加入与 3–5 人锁定。
- 个人资料、Bonjour Profile 字段、通知中心。
- Idea 发布、项目草稿提交、主办方审核发布、动态 Gallery。
- 参与者、路演观众和主办方六奖项投票；正式奖按组内归一化后使用 60%/40%权重，现场人气奖按原始票数统计。
- 活动日期、报名状态、投票权重和 Starter Pack 可在后台配置。
- 问答信息独立存储于 `qa_questions` 表，前台 `/qa.html` 支持搜索、折叠展开、置顶、我的提问分段展示，后台可回答与置顶/隐藏，回答后自动通知提问者（见上文）。
- 统一的通知与确认模块 `public/ui.js`（`MinicampUI.toast / confirm / alert`）：页面不再使用 `window.confirm` 等浏览器默认弹窗，需要时在页面里加一行 `<script src="ui.js"></script>` 即可。
- 通知系统（`server.mjs` 的 `addNotice / notifyQaAnswered / normalizeNotices`）：
  - **一件事一条**：每条通知带稳定事件键 `key`。问答通知用「问答:收件人:问题编号」，所以反复保存答案、在「已回答 / 置顶」之间来回切换、服务器重启都不会再刷出重复；答案内容真的改写时，同一条通知会更新正文并清空已读，收件箱重新标未读。
  - **两个视角分开**：同一份数据，选手看到「你的提问已回答 / 你的追问已回答」，主办方看到「已回答提问 / 已回答追问」（`/api/admin/summary` 返回 `adminNoticeView`：`typeLabel / recipientLabel / recipientCount / readCount / unreadCount / readBy`）。
  - **已读回传**：选手打开通知中心会自动把未读标记为已读（`POST /api/me/notices/read`，可传 `id` 单条或省略表示全部），后台「已发布通知」显示 `已读 N / M 人` 进度条，随 15 秒全量刷新更新。
  - **清理历史重复**（可选、一次性）：`MINICAMP_CLEAN_NOTICES=1 npm start`，按问题合并重复的问答通知并删除对应问题已被删除的孤立通知，日志会打印合并前后的条数。
- 通知写明「发给谁」：后台「已发布通知」标明所有人 / 指定报名者（姓名 + 报名编号），报名者通知中心显示「发给所有人」「只发给你」；通知正文与标题统一转义后渲染。
- 轮询刷新：主办方后台固定每 15 秒全量同步（报名 / 队伍 / Idea / 项目 / 投票 / 通知 / 问答，不再提供开关与间隔选择），Q&A 页与个人主页通知中心每 1 分钟刷新；所有轮询只更新内容，重绘期间由 `public/scroll.js`（`MinicampScroll.lock / lockUntil`）按住滚动位置并临时关闭 `scroll-behavior: smooth`，同步重绘与异步重绘（如 Q&A 先清空再填回）都不会把窗口带回顶部，后台正在编辑的通知 / 配置 / 主持人提示也会保留未保存的草稿。
- 后台「分类查看 / 能力结构」两栏用 `minmax(0, …fr)` + `min-width: 0`，窗口变窄时按比例收缩而不是把右栏挤没；760px 以下改为上下排列。

正式部署前仍应配置生产 MySQL，接入 HTTPS、统一身份认证、限流、CSRF 防护、审计日志和备份机制。

## 技术栈

HTML、CSS、原生 JavaScript、Node.js、MySQL（不可用时回退 JSON）。前端唯一的第三方库是 Chart.js（仅主办方后台使用），随 npm 依赖安装。