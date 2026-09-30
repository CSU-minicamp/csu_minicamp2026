# 欢迎页数据配置（`public/data/editions.json`）

站点首页（欢迎页 `index.html`）的**届次卡片**与**历届作品**都由本文件驱动，改内容不需要动代码。
页面在浏览器里通过 `fetch("data/editions.json")` 读取，服务器已把 `.json` 配成 `application/json`，
并且静态文件带 `Cache-Control: no-store`，改完刷新即可看到效果。

- 文件：`public/data/editions.json`
- 渲染脚本：`public/welcome.js`
- 渲染样式：`public/welcome.css`

> 读取失败时页面不会白屏：届次区与作品区会显示一小段错误提示，其余内容照常显示。
> 所以修改后请先确认 JSON 合法（不能有注释、不能有尾逗号）。

---

## 1. 顶层结构

```jsonc
{
  "meta":     { … },   // 可选：页脚「数据更新于 …」
  "editions": [ … ],   // 届次卡片，按数组顺序渲染
  "works":    [ … ]    // 历届作品，按「届次筛选 + 数组顺序」渲染
}
```

---

## 2. `meta`（可选）

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `title` | string | 否 | 目标品牌名，默认 `MiniCamp`。 |
| `subtitle` | string | 否 | 副标题，默认 `中南大学校园黑客松`。 |
| `description` | string | 否 | 一句话简介。**目前欢迎页没有渲染它**（页面文案写在 HTML 里），留作文档与将来使用。 |
| `updatedAt` | string | 否 | 资料更新日期（`YYYY-MM-DD`），显示在页脚右下角。留空则不显示。 |

---

## 3. `editions[]`：届次卡片

欢迎页最重要的出口。每张卡片告诉访客「这一届是什么、什么时候、点进去能看什么」。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `year` | string | **是** | 届次年份，同时作为作品归属的匹配键，例如 `"2026"`。 |
| `label` | string | 否 | 年份下方的小标题，默认 `2026 届`。 |
| `name` | string | 否 | 届次全称，例如 `MiniCamp 2026 校园黑客松`。 |
| `status` | string | 否 | 见下方「status 取值」。默认 `past`。 |
| `statusLabel` | string | 否 | 卡片右上角徽章文案；留空则按 `status` 自动生成。 |
| `summary` | string | 否 | 一到两句介绍，纯文本。 |
| `facts` | array | 否 | `[{ "label": "时间", "value": "2026 年 9 月 26–27 日" }]`，最多建议 4 条。 |
| `page` | object | 否 | 站内页面入口，见下方。 |
| `externalUrl` | string\|null | 否 | 站外链接（例如旧官网），有值时卡片底部多出一个「站外链接 ↗」。 |
| `cover` | string\|null | 否 | 卡片封面图路径，相对 `public/`；目前欢迎页只用于 `works`，届次卡片可先留 `null`。 |

### `status` 取值

| 值 | 徽章样式 | 用途 |
|---|---|---|
| `current` | 绿色实心 | 当前正在进行（还没结束）的届次。 |
| `finished` | 黄色 | 已结束、但仍然**有**页面可回顾（2026 届现在就是这个状态）。 |
| `archived` | 黄色 | 同上，用于更早的、已有回顾页的届次。 |
| `coming-soon` | 灰色 | 资料/页面还没做好，卡片整体弱化，CTA 变成不可点击的说明文字。 |
| `past` | 灰色 | 其他历史届次，默认值。 |

### `page` 对象

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `href` | string | 否 | 站内相对路径，例如 `2026info.html`。 |
| `cta` | string | 否 | 按钮文案，默认 `查看详情`。 |
| `available` | boolean | 否 | **`false` 时按钮不可点击**，只显示 `note` 文案（2025 届现在就是这个状态）。默认 `true`。 |
| `note` | string | 否 | CTA 下方的补充说明；`available: false` 时它就是唯一的说明文字。 |

> 2025 届回顾页准备好之后，只需要把 `page.available` 改成 `true`（或直接删掉这一行），
> 按钮就会自动出现在欢迎页上。届时把 `2025minicamp.html` 建好即可，无需改样式或脚本。

---

## 4. `works[]`：历届作品

欢迎页的「历届作品」区按届次筛选渲染这些条目。**内容先留空完全没问题**，占位卡片会明确显示为「待补充」。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | string | 否 | 唯一标识，建议 `年份-序号`，例如 `"2026-01"`。目前渲染没有用到，留作数据管理与将来跳转锚点用。 |
| `year` | string | **是** | 所属届次，要和 `editions[].year` 一致，否则筛选不到。 |
| `title` | string | 否 | 作品名；留空显示 `作品名称待补充`。 |
| `tagline` | string | 否 | 一句话介绍（建议写成 Problem → Solution）。 |
| `team` | string | 否 | 队伍名。为空时显示 `队伍名待补充`。 |
| `tags` | string[] | 否 | 技术/方向标签，例如 `["Web", "AI", "硬件"]`。 |
| `award` | string | 否 | 获奖名称，例如 `最佳产品`；有值时高亮显示，留空不显示。 |
| `cover` | string\|null | 否 | 封面图路径，相对 `public/`，例如 `"assets/works/2026-01.png"`；为 `null` 时显示占位框。 |
| `links` | object | 否 | 见下方。 |
| `note` | string | 否 | 卡片底部的补充说明。 |
| `placeholder` | boolean | 否 | **`true` 时卡片渲染为「待补充」占位样式**（虚线边框、不响应悬浮）。填好真实内容后删掉这个字段（或改成 `false`）。 |

### `links` 对象

| 字段 | 类型 | 说明 |
|---|---|---|
| `demo` | string\|null | 可体验的 Demo 地址。 |
| `repo` | string\|null | 代码仓库地址（自愿公开）。 |
| `detail` | string\|null | 站内详情页，例如 `"gallery.html#project-xxx"`。 |

三个都是 `null` 时，卡片不显示操作链接。

---

## 5. 示例

### 新增一条真实作品

```json
{
  "id": "2026-01",
  "year": "2026",
  "title": "校园快递代拿地图",
  "tagline": "把「谁顺路」变成一张实时地图，让代拿从群里喊话变成可视化匹配。",
  "team": "TEAM 07",
  "tags": ["Web", "地图", "AI Coding"],
  "award": "最佳产品",
  "cover": "assets/works/2026-01.png",
  "links": {
    "demo": "https://example.com/demo",
    "repo": null,
    "detail": null
  },
  "note": ""
}
```

### 开放 2025 届回顾页

```json
{
  "year": "2025",
  "label": "2025 届",
  "name": "InnoSeed Mini Camp 2025",
  "status": "archived",
  "statusLabel": "往届回顾",
  "summary": "……",
  "facts": [ … ],
  "page": {
    "href": "2025minicamp.html",
    "cta": "查看 2025 届回顾",
    "available": true,
    "note": "第一届 Mini Camp 的赛题、现场与作品。"
  }
}
```

---

## 6. 常见坑

- **JSON 不能有注释和尾逗号**，否则整份文件解析失败，页面会提示读取失败。
- `works[].year` 与 `editions[].year` 必须都是**字符串**（`"2026"` 而不是 `2026`），否则筛选按钮匹配不上。
- 路径都相对 `public/`，不要写成 `/public/assets/...` 或绝对路径。
- `placeholder: true` 的条目会按占位样式渲染；正式内容请去掉这个字段。
- 本文件是**静态资源**，`server.mjs` 只做静态托管，不存在需要重启服务的缓存问题。
