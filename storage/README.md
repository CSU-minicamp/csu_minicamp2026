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