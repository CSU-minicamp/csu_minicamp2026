# minicamp 2026 校园黑客松官网

面向中南大学学生的 minicamp 2026 校园黑客松官网，包含公开活动介绍、报名、参与者资料、组队与 Idea、项目提交、Project Gallery、投票和主办方工作台。

## 本地预览

请确保已安装 Node.js，然后在项目目录执行：

    node server.mjs

在浏览器打开 http://localhost:4173/。

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

## 问答信息存储

问答信息单独存放在 `qa_questions` 表（不再塞进 `app_state` 的 JSON），字段如下：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `question_id` | `VARCHAR(32)` PK | 问题 id，形如 `Q-1A2B3C4D5E` |
| `asker_id` | `VARCHAR(64)` | 提问人 id，报名编号如 `MC26-1001`（对应 `applications.id`） |
| `question` | `TEXT` | 问题内容 |
| `asked_at` | `TIMESTAMP` | 提问时间 |
| `answer` | `TEXT NULL` | 答案，未回答为 `NULL` |
| `answered_at` | `TIMESTAMP NULL` | 回答时间，未回答为 `NULL` |
| `status` | `ENUM('pending','answered')` | 待回答 / 已回答，便于后台筛选 |
| `answered_by` | `VARCHAR(64)` | 回答人（主办方标识） |
| `updated_at` | `TIMESTAMP` | 最后更新时间 |

存储层在 `storage/qa-store.mjs`：MySQL 可用时读写 `qa_questions` 表；MySQL 不可用（离线开发）时自动回退到 `data/qa.json`，接口行为完全一致。启动日志会显示当前模式：`minicamp preview: http://localhost:4173 (qa storage: table|json)`。

接口（只提供数据层，暂无页面）：

| 方法与路径 | 权限 | 说明 |
| --- | --- | --- |
| `POST /api/qa` | 参与者登录 | 提问，body：`{ "question": "..." }` |
| `GET /api/qa` | 参与者 | 查看自己的问答 |
| `GET /api/qa?status=pending` | 主办方 | 查看全部问答（可筛选状态），返回 `stats` |
| `GET /api/qa/answered` | 公开 | 已回答问题，可直接用于 FAQ 展示 |
| `PATCH /api/admin/qa/{questionId}` | 主办方 | 回答或修正答案，body：`{ "answer": "...", "answeredBy": "组委会" }` |

验证：

    npm run qa-store-test   # 存储层单元测试：表模式的 SQL、参数、时间戳与 hydrate 映射（无需 MySQL）
    npm run qa-import       # 把离线期间的 data/qa.json 记录导入数据库（见下）

接上 MySQL 后确认表已生效：启动日志出现 `(qa storage: table)`，用主办方 token 调 `GET /api/qa` 返回 `{"questions":[],"stats":{...}}`。

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
- 问答信息独立存储于 `qa_questions` 表（见上文），已提供数据层与接口。
- 统一的通知与确认模块 `public/ui.js`（`MinicampUI.toast / confirm / alert`）：页面不再使用 `window.confirm` 等浏览器默认弹窗，需要时在页面里加一行 `<script src="ui.js"></script>` 即可。

正式部署前仍应配置生产 MySQL，接入 HTTPS、统一身份认证、限流、CSRF 防护、审计日志和备份机制。

## 技术栈

HTML、CSS、原生 JavaScript、Node.js。