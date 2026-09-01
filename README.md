# minicamp 2026 校园黑客松官网

面向中南大学学生的 minicamp 2026 校园黑客松官网，包含公开活动介绍、报名、参与者资料、组队与 Idea、项目提交、Project Gallery、投票和主办方工作台。

## 本地预览

请确保已安装 Node.js，然后在项目目录执行：

    node server.mjs

在浏览器打开 http://localhost:4173/。

主办方默认本地密码为 minicamp-admin，正式运行时请设置环境变量：

    $env:MINICAMP_ADMIN_PASSWORD = "your-password"
    node server.mjs

默认优先使用 MySQL 持久化；如果本地 MySQL 不可用，服务会自动回退到 `data/minicamp.json`，该文件不提交到 Git。可通过 `.env.example` 配置数据库连接。

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

> 本地开发若用 VS Code Live Server（5500 端口），静态可打开但 `/api` 会 404。直接用 `http://localhost:4173/` 访问 Node 服务即可，无需反代；或在 Live Server 设置中把 `/api` 代理到 `http://127.0.0.1:4173`。

## 页面入口

- 官网首页：/
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

正式部署前仍应配置生产 MySQL，接入 HTTPS、统一身份认证、限流、CSRF 防护、审计日志和备份机制。

## 技术栈

HTML、CSS、原生 JavaScript、Node.js。