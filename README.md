# 启标青春版（QiBid Lite）

> **中国招投标确定性解析引擎 · `.docx`/`.pdf`/URL 废标红线体检 CLI · 零依赖标准 MCP Server**  
> 0 Token、毫秒级、零幻觉抽取开标时间、预算限价、保证金、资格硬门槛、评分表与关键日程；输出可转发微信/钉钉群的「一页纸投标决策单」，并支持 Cherry Studio / Cursor / Claude Desktop 1 分钟挂载。

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](./LICENSE)
[![Node.js >= 22](https://img.shields.io/badge/node-%3E%3D22.19-brightgreen.svg)](https://nodejs.org)
[![Zero External Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](./package.json)

---

## 为什么做 QiBid Lite？

市面上大量招投标 AI 脚本把 200 页招标文件直接扔给大模型“碰运气”，不仅慢、费 Token，还容易把开标时间、资格硬门槛和废标条款读错。

**QiBid Lite** 开源了启标（QiBid）沉淀的**纯确定性招投标基础引擎**：
- **支持真实格式，零外部依赖**：直接解析 **`.docx`（保留原生评分表格）**、**`.pdf`（自动识别扫描件/影印版）**、**`.html` / `.md` / `.txt`** 与 **公开招标公告 URL**；
- **毫秒级、零幻觉抽取**：基于 68 份真实公开招标公告内部测试集验证——开标时间 **100%（68/68）**、资格硬字段精确率 **100% / 召回率 99.2%**、废标与技术要点 **F1 = 0.970**；
- **可转发给老板/群的一页纸 HTML 决策单**：顶部红黄绿风险条（截标倒计时 / 预算 / 废标红线 / 100 分评分核验），内置「打印 / 导出 PDF」与「一键复制群汇报摘要」；
- **批量体检横向对比（`batch`）**：一次扫完整个文件夹内多份招标文件，生成横向对比 HTML 与 Excel UTF-8 BOM CSV；
- **开箱即用标准 MCP Server**：零外部依赖，stdio JSON-RPC 2.0，内置 **7 个工具 + 3 个投标提示词模板**；
- **0 损耗接力启标桌面完整版**：一键导出标准 `.qibid` 交接目录（`看标/`），导入桌面版直接对接企业资质库写标与 21 类交标前 AI 预审，无需重复看标。

---

## 10 秒快速体验（内置脱敏样例）

```bash
# 1. 解析内置示范招标文件，生成可转发的一页纸 HTML 决策单
node bin/qibid-lite.mjs scan examples/sample-service-tender.md --html demo-report.html

# 2. 直接解析你手头的真实 .docx 招标文件、文本 PDF 或公开公告网页 URL
node bin/qibid-lite.mjs scan ./招标文件.docx --html report.html
node bin/qibid-lite.mjs scan https://example.gov.cn/notice.html --html report.html

# 3. 批量体检文件夹内多份标书，输出横向对比 HTML + Excel CSV
node bin/qibid-lite.mjs batch examples --html compare.html --csv compare.csv

# 4. 决定要投？一键导出兼容启标桌面完整版的项目交接目录
node bin/qibid-lite.mjs export-pack examples/sample-service-tender.md --out ./my-bid-project

# 5. 启动标准 MCP Server（供 Cherry Studio / Cursor / Claude Desktop 挂载）
node bin/qibid-lite.mjs --mcp
```

---

## 工作流分工：Lite 帮你 10 秒定“投不投”，桌面版帮你把标书安全写完交出去

```text
[招标文件 .docx / .pdf / 公告 URL]
        │
        ▼  (QiBid Lite · 开源免费 · 0 Token · 毫秒级)
  1. 确定性看标 & 评分表抽取 & 废标红线初检
  2. 生成一页纸 HTML 决策单（复制 6 行摘要发群 / 导出 PDF 给老板）
  3. 决定要投 → qibid-lite export-pack 导出标准 看标/ 交接目录
        │
        ▼  (启标桌面完整版 · 14 天全功能免费试用 · 本地数据不出本机)
  4. 扫描件/盖章件离线本地 OCR + 254+ 源站更正公告浮窗实时盯防
  5. 多主体企业资质/业绩库 + 零编造事实写入闸 + 六问并行写长标书
  6. 21 类交标前 AI 预审 + 围串标防误伤（DOCX 深度洗白 & 图片 dHash 查重）+ 暗标实排核页
```

---

## 在 Cherry Studio / Cursor / Claude Desktop 中挂载 MCP

```json
{
  "mcpServers": {
    "qibid-lite": {
      "command": "node",
      "args": ["/path/to/qibid-lite/bin/qibid-lite.mjs", "--mcp"]
    }
  }
}
```

### 暴露的 7 个标准 MCP 工具
1. `scan_tender` — 支持 `text` / `filePath`（`.docx`/`.pdf`/`.html`/`.md`/`.txt`）/ `url`，抽取核心事实与群汇报摘要；自动探测扫描件 PDF
2. `check_disqualify` — 按通用 / 货物 / 服务 / 工程四套废标红线规则库初检（带法规出处与整改模板）
3. `extract_scoring` — 抽取结构化评分标准表（直接解析 `.docx` 原生评分表，区分客观分/主观分）
4. `extract_key_dates` — 提取完整关键日程与法定工作日质疑窗口
5. `batch_scan_dir` — 批量体检目录下多份招标文件并可选产出对比 HTML / Excel CSV
6. `export_qibid_pack` — 生成兼容启标桌面完整版的 `看标/` 交接目录与 `qibid-pack.json`
7. `list_demo_sources` — 查看内置 12 个示范公开招投标源站

### 暴露的 3 个标准 MCP Prompts
- `tender-go-no-go`：投标立项一页纸可行性研判
- `disqualify-audit`：废标红线逐条核查与避坑清单
- `scoring-breakdown`：评分标准表与应标分工拆解（100 分核验）

---

## 青春开源版 vs 启标桌面完整版（QiBid Desktop）

| 能力维度 | QiBid Lite（开源青春版） | [启标桌面完整版](https://qibid.lingqiai.online/download/?from=lite)（14 天全功能免费试用） |
|---|---|---|
| `.docx` / 文本 `.pdf` / `.html` / URL 确定性看标与日程抽取 | ✅ | ✅ |
| 通用 / 货物 / 服务 / 工程废标红线初检 & 批量横向对比 | ✅ | ✅ |
| 可转发 HTML 一页纸决策单 & 零依赖 MCP Server（7 工具 + 3 Prompts） | ✅ | ✅ |
| 扫描版 PDF / 盖章影印件离线本地 OCR + 多模态识图 | ❌（自动探测并提示） | ✅（内置离线 OCR，文件不出本机） |
| 全国一手源站直采与更正公告自动盯防 | 仅 12 示范公开源 | ✅ **254+ 公开源站 + 29 央企/军队源 + 更正联动** |
| 内置招投标侧栏浏览器（人工登录交接 + 自动下附件） | ❌ | ✅ |
| 零编造事实写入闸 + 多主体企业资质/业绩/产品库 | ❌ | ✅（查不到绝不编造，强制留「待填」） |
| 六问闭环 + 并行写长标书 + 暗标自动排版 + 真版面核页 | ❌ | ✅（内置 LibreOffice 实排自动回填页码） |
| 21 类交标前 AI 预审 + 模拟评委打分 + 围串标防误伤 | ❌ | ✅（DOCX 元数据深度洗白 + 图片 dHash 查重） |
| 桌面置顶浮窗（常驻看进度 / 截屏自动隐身） | ❌ | ✅ |

> 👉 需要开箱即用的完整图形化投标工作台？前往官网免费试用 14 天（标书留在你自己的电脑上，到期不锁用户文件，绝不向导出 Word 写水印）：  
> **https://qibid.lingqiai.online/download/?from=lite**

---

## 许可与声明

本仓库采用 **AGPL-3.0-or-later + 商业双许可**（详见 [LICENSE](./LICENSE)）。  
个人与企业内部自用完全免费；在线 SaaS / 闭源商业集成请联络官方获取商业授权。
