# 交接说明：喵喵 SAT 通关

给接手维护的 AI 助手（GPT / Codex 等）看。用中文和学生沟通。

## 这是什么

一个学生备考 SAT（考试日 2026-12-05，**所有日期一律用美西时间 America/Los_Angeles**）的每日练习网站：
Bluebook 风格答题、错题本（艾宾浩斯 1/3/7/14/30 天）、金币奖励（1 金币 = 1 美元）、像素猫解锁、家长视图、老师视图。

- 网页：`docs/index.html`，由 GitHub Pages 发布。**不要直接改它**，改 `src/` 后运行 `python3 tools/build_app.py` 重新生成。
- 数据库和登录：Supabase 项目 `xbvqmeczclyungmyyjae`（美西机房）。表结构和权限规则见 `supabase/schema.sql`。
  - `profiles`：账号身份（student / parent / teacher）。
  - `docs(col, id, data)`：所有练习数据。col 取 runs / reviews / wrong / notes / extras / days / weekly / meta。只有 student 能写；parent 只能更新 `meta/ledger`（确认金币兑换）。
  - `weeks`、`questions`：每周计划和题目，登录后才能读，只能用后台密钥写。
- 题目版权属于 College Board，**不能放进公开仓库**：`app/data/`、`cache/` 都在 .gitignore 里，题目只上传到 Supabase。

## 每周日的固定任务

学生会告诉你下周每天的阅读、数学题型。照下面做：

1. 新建 `plans/weekN.json`，格式照抄 `plans/week1.json`：
   - `days[].id` 用 `wNdX`；`dates` 是这一关可以做的日期（周末二选一就写两个日期）。
   - 阅读按学生给的题型和题数排（第 2 周起每天两种题型 8 + 5 题），每天另加 8 道 `wic`（词汇题）；数学每天 20 题（四个类型「前两个」= Algebra + Advanced Math，「后两个」= PSDA + Geometry & Trig）。
   - **难度（从第 3 周起）**：计划里写 `"rwHard": 2`，阅读的每个题型每关只放 2 道 Hard、其余用 Medium（词汇题也一样）；数学仍然全部 Hard。某一关想单独指定，可以在那一关写 `"hard": 数量`。
   - `extra`：每个出现过的题型 20 题，供额外练习。
   - 默认安排：周一到周四 + 周末一天做新题，周五和另一个周末日只做错题巩固（不用写进计划，系统自动安排）。
2. 抓题（College Board 题库接口是公开的，不需要登录）：
   ```
   python3 tools/fetch_bank.py lists
   DIFF=H,M python3 tools/fetch_bank.py details COE CID WIC INF TSP CTC SYN TRA BOU FSS H P Q S
   ```
   只需要列出这周用到的技能代码（对照表见 README.md）。
3. 选题：`python3 -I tools/build_week.py plans/weekN.json`。它会跳过以前用过的题，Hard 不够时用 Medium 补，并打印各题型用了多少 Hard、题库还剩多少。**Hard 不够时要告诉学生。**
   题目缓存在本机 `~/Library/Caches/sat-platform/`（不要放进 iCloud 项目文件夹，iCloud 会把上千个小文件移到云端，读起来极慢）。
4. 上传：`python3 tools/upload_week.py N`（需要项目文件夹里的 `.env`，里面有 SUPABASE_URL 和 SUPABASE_SERVICE_KEY；这个文件由学生自己保管，不要提交、不要打印内容）。
5. 网页代码没改就不用重新部署；改了 `src/` 就运行 `python3 tools/build_app.py`，然后 `git add -A && git commit && git push`。

## 学生在别处做错的题加进错题本

- 先在题库里按题干关键词找到原题（College Board 的题号是 8 位十六进制，比如 `2ec0e43e`；别的网站常把选项顺序打乱，要按选项内容对应字母）。
- `python3 tools/add_wrong.py 题号:学生选的字母 ...`，次日开始复习。
- 题库里找不到的题（通常是 Bluebook 模考题，官方不公布单题难度）：照截图录成 `app/data/custom/日期.json`（格式见已有文件，id 用 `ext-` 开头，图表可以裁图后用 data URI 内嵌），再加 `--custom 文件路径`。这些文件含题目原文，只放在 app/data/ 下，不进公开仓库。

## 规则（改代码前先读）

- 计时：阅读 60 分钟、数学 45 分钟，同一部分的几关共用；只在答题时计时，看解析时暂停；中途关掉页面倒计时照走，到时自动交卷。
- 每日金币：阅读、数学各有速度奖 +5 和正确率奖 +5，都跟该题型往期平均比（第一次练只记基线；速度奖要求正确率不下降）；完成当天新题 +5；完成错题巩固 +5。每天最多 30。
- 萌宠按**累计获得**的金币解锁，兑换美元不影响；门槛可以在页面「设置」里改。
- 额外练习要在当天任务完成后才开放，默认 10 题，不计金币。
- 漏做的关卡进「待补关卡」，不挤进第二天。

## 代码结构

- `src/js/00-config.js` Supabase 地址和公开密钥（公开密钥本来就放在网页里）
- `01-core.js` 工具函数、存储层（Store）
- `02-model.js` 计划、判分、计时、错题复习、金币、周报
- `03-pet.js` 像素猫与小窝
- `04-practice.js` Bluebook 答题界面、高亮批注
- `05-home.js` 外壳、首页、关卡开始页
- `06-results.js` 关卡总结、解析页、当天结算、周报弹窗
- `07-pages.js` 错题本、练习记录、额外练习、萌宠、家长、老师、设置
- `08-main.js` 登录与启动

本地调试：在 `docs/` 下起一个静态服务器，并把 `app/data/` 复制成 `docs/data/`（已在 .gitignore 里），打开 `http://localhost:端口/?local`，数据只存在浏览器里，不会碰线上数据库。
