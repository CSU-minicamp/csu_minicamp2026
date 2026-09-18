# minicamp 2026 校园黑客松官网

面向中南大学学生的 minicamp 2026 校园黑客松官网，包含公开活动介绍、报名、参与者资料、组队与 Idea、项目提交、Project Gallery、投票和主办方工作台。

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

默认优先使用 MySQL 持久化；如果本地 MySQL 不可用，服务会自动回退到 `data/minicamp.json`，该文件不提交到 Git。可通过 `.env.example` 配置数据库连接。

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

    npm run test-data

测试数据带有内部标记，覆盖报名状态、个人资料、锁定与草稿队伍、公开与草稿项目、创意、全局与定向通知、参与者投票、Jury 评审结果，以及已开放的投票配置。

常用测试账号：

- `TEST-APP-01` / `test-01@minicamp.local`：已锁定队伍成员，可测试个人资料、项目与投票。
- `TEST-APP-22` / `test-create-team@minicamp.local`：已录取且未组队，可测试创建队伍。
- `TEST-APP-23` / `test-join-team@minicamp.local`：已录取且未组队，可加入 `TEST-TEAM-06` 并测试锁定队伍。

需要清除时运行：

    npm run clear-test-data

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

- 官网首页：/
- Q&A 问答：/qa.html
- 个人主页：/profile.html
- 组队与 Idea：/team.html
- 项目提交：/submission.html
- 项目 Gallery：/gallery.html
- AI Coding Starter Pack：/starter-pack.html
- 参与者投票：/voting.html
- Jury 评审：/jury.html
- 主办方后台：/admin.html

## 当前实现

- Node.js 原生 HTTP 服务与 MySQL/JSON 持久化数据层。
- 静态页面、浏览器脚本、样式和图片资源统一位于 `public/`。
- 参与者和主办方 token 登录。
- 报名去重、Team Code、队伍加入与 3–5 人锁定。
- 个人资料、Bonjour Profile 字段、通知中心。
- Idea 发布、项目草稿提交、主办方审核发布、动态 Gallery。
- 参与者投票、Jury 投票、参与者/Jury 权重统计。
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