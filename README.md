# minicamp 2026 校园黑客松官网

面向中南大学学生的 minicamp 2026 校园黑客松官网，包含公开活动介绍、报名、参与者资料、组队与 Idea、项目提交、Project Gallery、投票和主办方工作台。

## 本地预览

项目不依赖第三方包。请确保已安装 Node.js，然后在项目目录执行：

    node server.mjs

在浏览器打开 http://localhost:4173/。

主办方默认本地密码为 minicamp-admin，正式运行时请设置环境变量：

    $env:MINICAMP_ADMIN_PASSWORD = "your-password"
    node server.mjs

运行时数据保存到 data/minicamp.json，该文件不提交到 Git。

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

- Node.js 原生 HTTP 服务与 JSON 持久化数据层。
- 参与者和主办方 token 登录。
- 报名去重、Team Code、队伍加入与 3–5 人锁定。
- 个人资料、Bonjour Profile 字段、通知中心。
- Idea 发布、项目草稿提交、主办方审核发布、动态 Gallery。
- 参与者投票、Jury 投票、参与者/Jury 权重统计。
- 活动日期、报名状态、投票权重和 Starter Pack 可在后台配置。

正式部署前仍应将 JSON 存储替换为数据库，接入 HTTPS、统一身份认证、限流、CSRF 防护、审计日志和备份机制。

## 技术栈

HTML、CSS、原生 JavaScript、Node.js。

