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
| `status` | `ENUM('pending','answered','pinned','hidden')` | 见下方状态说明 |
| `answered_by` | `VARCHAR(64)` | 回答人（主办方标识） |
| `updated_at` | `TIMESTAMP` | 最后更新时间 |

`status` 四种取值：

| 值 | 含义 | 公开页是否显示 |
| --- | --- | --- |
| `pending` | 待回答 | 不显示（仅提问者本人与主办方可见）；后台不给状态下拉，只能回答问题 |
| `answered` | 已回答 | 显示，公开列表按提问时间倒序 |
| `pinned` | 置顶 | 显示，且固定排在公开列表最前面 |
| `hidden` | 隐藏（软删除） | 不显示（提问者本人仍能看到） |

存储层在 `storage/qa-store.mjs`：MySQL 可用时读写 `qa_questions` 表；MySQL 不可用（离线开发）时自动回退到 `data/qa.json`，接口行为完全一致。启动日志会显示当前模式：`minicamp preview: http://localhost:4173 (qa storage: table|json)`。旧库的 `status` 若只有 `pending/answered`，服务启动时会自动升级枚举，不需要手工改表。

接口：

| 方法与路径 | 权限 | 说明 |
| --- | --- | --- |
| `GET /api/qa/public` | 公开 | 置顶 + 已回答，置顶在最前；**响应不含 `asker_id`**，避免泄露报名编号（`/api/qa/answered` 是等价别名） |
| `POST /api/qa` | 参与者登录 | 提问，body：`{ "question": "..." }`；相同内容的待回答问题返回 409 |
| `GET /api/qa` | 参与者 | 查看自己的提问（含 `pending` / `hidden`） |
| `GET /api/qa?status=pending,hidden` | 主办方 | 查看全部问答（逗号分隔可多选状态），返回 `stats` 与 `storage` |
| `PATCH /api/admin/qa/{questionId}` | 主办方 | 回答与状态可一起提交：`{ "answer": "...", "status": "pinned", "answeredBy": "组委会" }`；`status` 取 `pending/answered/pinned/hidden`，没有答案时不允许设为 `answered/pinned` |

前端与后台页面：

- 公开页面 `/qa.html`：导航中位于「活动介绍」和「组队工作区」之间的 **Q&A**。页面自上而下为 **提问区 → 置顶问题 → 我的提问 → 其他已回答**（后两段登录后才有「我的提问」）；置顶区与我的提问区每条问题各占一行，其他已回答为多列卡片网格；顶部搜索框对所有区域同时生效，可搜问题内容和答案。
- 参与者侧**答案始终直接显示，不做折叠**：卡片依次是状态/时间、问题、答案。未回答的问题显示"主办方还没有回答这个问题"。
- 去重：登录后自己的提问只出现在「我的提问」区，不会在置顶区或公开区再出现一遍。
- 未登录访客看到"登录后即可提问"的提示卡（**登录后该提示卡消失，换成提问表单**），按钮跳到 `profile.html?returnTo=qa.html`，登录成功后自动回到 Q&A 页（搜索词也会保留）。
- 主办方后台 `/admin.html` → 侧边栏第 3 项 **Q&A 问答**：每张卡片左侧是问题（上）与答案（下），右侧竖排居中。**还没有答案的问题右侧只有「回答问题」**（没有状态下拉，确认回答后自动变为已回答）；**已有答案的问题右侧是「状态」下拉框 +「更改答案」**（下拉只有 已回答 / 置顶 / 隐藏）。排序为**置顶永远在最前，其余一律按提问时间倒序**（不按状态分组）。
- 状态流转规则：没有答案时不能设为已回答/置顶（接口返回 400，卡片内显示行内错误）；**已经有答案的问题不能退回待回答**（下拉里没有该选项，接口也会拒绝并返回 `answered question cannot go back to pending`），但可在 已回答 / 置顶 / 隐藏 之间切换。
- 后台的"展开"是编辑态：点右侧按钮后该卡片只显示一个更高的答案文本框，状态与按钮隐藏，文本框下方靠右是「确认」；确认后退出编辑态，首次回答问题会同时把状态设为已回答（公开）。
- 通知：主办方首次把问答设为已回答或置顶时，系统会给提问者发一条「问答」类型的站内通知（通知中心可见，内容含问题与答案）；同一条问题只通知一次，反复保存答案不会重复提醒。接口拒绝时（例如没有答案就设为公开）卡片内会显示行内错误。
- 后台与 Q&A 页的按钮统一为同一高度与内边距；全局 `select` 统一了自绘箭头、内边距与聚焦样式（原生下拉展开后的**选项列表**由系统绘制，只能设字体与配色，无法自定义内边距/高度，需要完全自定义就要换成自绘下拉组件）。

> 注意：`qa_questions` 的数据会在服务启动时读入内存，**不要在服务运行期间用 SQL 直接改这张表**（删掉的记录会在下次写入时被内存状态写回）。停服务后再用 SQL 维护，或用服务接口操作。

验证：

    npm run qa-store-test   # 存储层单元测试：表模式的 SQL、参数、时间戳、hydrate 与四种状态（无需 MySQL）
    npm run qa-import       # 把离线期间的 data/qa.json 记录导入数据库（见下）

接上 MySQL 后确认表已生效：启动日志出现 `(qa storage: table)`，用主办方 token 调 `GET /api/qa` 返回 `{"questions":[],"stats":{...}}`。

## 已部署站点的增量升级（加问答表）

线上已经在跑，只想加上问答表、不动既有数据时，二选一：

1. **推荐：直接发新代码并重启服务**。启动时会自动执行 `CREATE TABLE IF NOT EXISTS qa_questions ...`，`app_state` 与所有既有数据不受影响。先备份再执行：

       mysqldump -u <user> -p <database> > backup-$(date +%F).sql
       pm2 restart minicamp     # 或 systemctl restart <service>

2. **或先手工建表，再发代码**（想先确认表结构、或服务重启窗口不好安排时）：

       mysql -u <user> -p <database> < storage/qa-upgrade.sql

`storage/qa-upgrade.sql` 只做新增，不含任何 `DROP`。如果之前手工建过只含 6 个字段的 `qa_questions`，服务启动时会自动补齐 `status / answered_by / updated_at`，不需要重建表。

升级后确认：重启日志出现 `(qa storage: table)`；用主办方 token 调 `GET /api/qa` 返回 `{"questions":[],"stats":{"total":0,...}}` 即表示表已生效。若日志显示 `qa storage: json`，说明服务连不上 MySQL，此时问答会写到服务器的 `data/qa.json`——请先修好数据库连接，再把该文件里的记录按需导入表中。

### 两个容易踩的坑

**1. 改了代码没生效 / 接口返回 404，先查是不是有旧进程占着端口。**

`node server.mjs` 不会热重载，旧进程会一直用启动时加载的那份代码。典型现象：新加的接口 404，但页面看起来一切正常。

    netstat -ano | findstr :4173      # 看 LISTENING 那一行末尾的 PID
    taskkill /PID <pid> /F
    npm start

**2. 问答数据在服务启动时整表读入内存，直接用 SQL 改了表要重启服务才会同步。**

例如手工 `DELETE FROM qa_questions` 之后，接口可能仍返回已删除的记录（内存里还有副本），重启后即一致。反过来，通过接口产生的写入都会立即落库，不会丢。