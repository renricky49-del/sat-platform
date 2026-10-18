# 喵喵 SAT 通关

网页由 GitHub Pages 发布（docs/ 文件夹），数据库和登录用 Supabase。维护说明见 AGENTS.md。

## 每周日更新流程

详见 [AGENTS.md](AGENTS.md)。简要：写 `plans/weekN.json` → `tools/fetch_bank.py` 抓题 → `tools/build_week.py` 选题 → `tools/upload_week.py N` 上传到 Supabase。

## 题型代码

| 平台题型 | 代码 | 题库技能 |
|---|---|---|
| 图表题 | `chart` | Command of Evidence（带表格或图） |
| 文本证据题 | `evidence` | Command of Evidence（纯文字） |
| 细节题 | `detail` | Central Ideas and Details (CID) |
| 推断题 | `inference` | Inferences (INF) |
| 词汇题 | `wic` | Words in Context (WIC) |
| 结构目的题 | `structure` | Text Structure and Purpose (TSP) |
| 双篇题 | `crosstext` | Cross-Text Connections (CTC) |
| 笔记整合题 | `synthesis` | Rhetorical Synthesis (SYN) |
| 过渡词题 | `transition` | Transitions (TRA) |
| 标点边界题 | `boundary` | Boundaries (BOU) |
| 语法形式题 | `form` | Form, Structure, and Sense (FSS) |
| Algebra | `alg` | 数学 H |
| Advanced Math | `adv` | 数学 P |
| PSDA | `psda` | 数学 Q |
| Geometry & Trig | `geo` | 数学 S |

## 题库余量（第 1 周用完后，Hard 难度剩余）

图表题 15、细节题 10、词汇题 25、PSDA 53、Geo 96、Algebra 82、Advanced Math 125。
阅读的 Hard 题很快会用完，之后 `build_week.py` 会自动用 Medium 补，并在输出里显示数量。

## 规则速查

- 时间：一律美西时间；考试 2026-12-05，备考从 2026-10-15 算起。
- 计时：阅读 60 分钟、数学 45 分钟，只在答题时走；看解析不计时；中途退出倒计时继续，到时自动交卷。
- 错题巩固：答错当天收录，次日开始复习；答对后按 3/7/14/30 天再复习，第 30 天那次答对算掌握；答错回到次日。
- 金币：阅读/数学各有速度奖 +5、正确率奖 +5（和该题型往期平均比，第一次练只建立基线；速度奖要求正确率不下降），完成当天新题 +5，完成错题巩固 +5，每天最多 30。1 金币 = 1 美元。
- 萌宠按累计获得的金币解锁，门槛可在页面「设置」里改。

## 文件

- `src/`：页面源码（`page.html`、`style.css`、`js/*.js`），`tools/build_app.py` 合成 `docs/index.html`。
- `docs/`：GitHub Pages 发布的网站；`docs/img/` 是 Higgsfield 生成的像素猫、配饰、小窝装饰。
- `app/data/`：每周题目的本地暂存（不进仓库），用 `tools/upload_week.py` 上传。
- `supabase/schema.sql`：数据库表和权限规则。
- `cache/`：题库列表和题目详情缓存。
- `tools/pets.py`、`tools/cutout.py`：猫咪姿势对齐和抠图。
