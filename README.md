# 14亿分之1

随机出生在中国的某个角落，过完只有一次的一生。纯前端（React + TypeScript + Vite），构建产物是静态文件，可以直接部署到 Vercel 或 Cloudflare Pages。

## 开发

```
npm install
npm run dev        # http://localhost:5173
npm test           # 金标准快照：固定 seed 下的人生必须和 tests/golden.json 一致
npm run typecheck
npm run build      # 产出 dist/
npm run replay -- <局ID>   # 重放某一局（见下面「排查问题」）
```

## 部署（Cloudflare Workers）

纯静态网站：`dist` 里的文件由 Cloudflare Workers 托管（配置见 `wrangler.jsonc`），没有后端。

- 自动：GitHub 仓库连在 Cloudflare 后台（Workers Builds），推送到 `main` 就自动构建、部署；别的分支有自己的预览链接。构建命令 `npm run build`，部署命令 `npx wrangler deploy`。
- 手动：第一次先 `npx wrangler login`，之后 `npm run deploy`（构建 + 上传）。

开发用的局日志（`logs/runs`）只在 `npm run dev` 时写，线上版本不会往外发任何东西。

## 结构

- `src/engine/`：模拟引擎，不依赖界面
  - `state.ts` 当前人生 `S`；`rng.ts` 可存档的随机数；`types.ts` 数据结构（`Life` 等）
  - `lifecycle.ts` 出生、逐年推进、事件与抉择调度、同一秒出生的同伴
  - `mortality.ts` / `health.ts` 生命表、死因、大病与医保
  - `place.ts` / `career.ts` / `education.ts` 地点与收入、职业、高考志愿
  - `family.ts` / `parents.ts` / `romance.ts` 兄弟姐妹与孩子、父母、恋爱婚姻
  - `household.ts` / `finance.ts` / `housing.ts` 父母家的账、自己的账、公积金与房贷
  - `content/events.ts` 随机事件 `EVENTS`；`content/decisions.ts` 抉择 `DEC`；`content/daily.ts` 日常（年节、生活片段、状态节点）
  - `data.ts` 省份等估计值；`real.generated.ts` 由 `tools/build_real.py` 从 `research/*.json` 生成（见 DATA.md）
- `src/game/`：推进循环、速度、存档（localStorage，带格式版本和旧存档迁移）、局日志与重放
- `src/ui/`：React 组件（首页、出生登记表、一生、弹窗、结局、「怎么算的」卡片）
- `tools/calib/`：校准脚本，`npm run calib -- sim 3000`

## 加一个事件

在 `src/engine/content/events.ts` 的 `EVENTS` 里加一行：

```ts
{ id: 'xxx', a: [最小年龄, 最大年龄], w: 权重, c: () => 条件, once: 1, run: () => { eff({ h: 2 }); return '发生了什么'; } }
```

有意修改了模拟规则、结果本来就该变时：确认改动无误后运行 `UPDATE_GOLDEN=1 npm test` 重新生成 `tests/golden.json`，并在提交说明里写清楚为什么变。

## 画一张像素插画

插画都是代码画的（`src/ui/pixel/`），96×54 像素，每 250ms 一拍：

- `pix.ts`：画布、人物（成人、小孩，可以呼吸、眨眼、走路、举手、歪头、打瞌睡）、调色板 `C`、笔画块 `scrawl`（图里不画真的汉字，横幅、黑板上的“字”都用它）
- `kit.ts`：拼场景的素材：天空、房间、窗、云、树、横幅、彩带、桌凳、热气、旗，`WEAR` 衣服配色，`stand()` 站位，`hold.*` 拿在手上的东西
- 年龄段：`personAt(p, sex, age, x, feet, look)` 按年龄画婴儿、学步、小孩、青少年、成人、老人（80 岁以后拄拐）
- 季节（游戏以月为单位，所以只有季节，没有早晚）：`seasonOf(月)`；`tree(…, season)` 换叶子，`weather()` 飘花瓣、落叶、下雪，`snowCap()` 积雪，`seasonGrade()` 整体色调
- `world.ts`：右栏顶上的实时画面。`viewOf(life)` 只读这一生的状态，算出这一刻家里的样子（农村院子 / 楼房 / 大学宿舍、季节、春节中秋、在家的人、留守、刚结婚、家里办丧事、拆迁、有车）；`drawWorld(view, 帧)` 照着画。`npm run pixel -- --lives 12 --ages 3,8,15,22,35,50,70` 模拟真实的人生、按这些年龄画出来，一次检查一大批
- `scenes.ts` / `school.ts`：各个场景；`SCENES` 里登记，`Photo.tsx` 的 `DEC_SCENE` 决定哪个抉择配哪张，人生纪录里的条目用 `log(…, pic)` 配图

人物函数返回这一拍的身体点位（头、手、胸口），道具挂在点位上会跟着人一起动：

```ts
const me = person(p, o.sex, 36, stand(42), dress(WEAR.suit, WEAR.old), { t, ph: 5 });
hold.flowers(p, me); hold.card(p, me.handR);
```

不用开浏览器就能看图：

```
npm run pixel -- newyear --frames 0-11          # 画成 logs/pixel/sheet.png
npm run pixel -- --save base                    # 改素材之前记下所有画面的指纹
npm run pixel -- --compare base                 # 改完对比，列出变了的画面
```

开发服务器上打开 `/?pixel` 能看所有插画会动的样子，可以切深浅色。

## 排查问题：每一局都有日志，可以精确重放

每一局出生时生成一个**局 ID**（如 `20261016-1716-hp93of`，最后一段是种子），显示在一生页面左上角和结局页，点一下复制。

模拟是确定的：同样的种子 + 同样的输入（抉择、改重心、开关自动抉择）= 一模一样的一生，与帧率、倍速、中途刷新无关。在任何浏览器和 Node 里结果都逐位相同：引擎里的 exp / log / cos / pow 用的是 `src/engine/fmath.ts` 的纯 JS 实现（移植自 fdlibm），不用精度没有标准规定的 `Math.exp` 等（有测试检查）。所以日志只要记下这些输入，就能重放出任何一局。

- **开发时**（`npm run dev`）：日志实时写到 `logs/runs/`（不进 git）
  - `<局ID>.json`：最新的完整状态和输入记录（每过一年、每次抉择后更新），没跑完的局也有
  - `<局ID>.events.jsonl`：按时间顺序的输入和事件（读档、暂停、倍速、报错……）
  - `LATEST`：最近一局的 ID
- **上线后**：玩家浏览器里保留最近 20 局；结局页有「导出这一局的日志」按钮，反馈问题时附上
- **重放**：`npm run replay -- <局ID 或 导出的文件>`（不给参数就是最近一局）
  - 重放完和记录的状态逐项对比，并打印报错、时间线
  - `--until 35` 只跑到 35 岁；`--years` 打印每一年的状态；`--log` 打印完整时间线
  - 日志里记了当时的代码版本；之后改过规则的话，重放结果会不同（会提示）

界面上算展示用的数字时，如果要调用可能消耗随机数的引擎函数，用 `peek()` 包起来，否则会改变这一生的走向、重放也对不上（开发时会在日志里记一条警告）。

## 日常：让每一年都有几件小事

`src/engine/content/daily.ts` 里的年节（春节、中秋……按真实月份排进这一年）、生活片段（按人生阶段和处境挑）和状态节点（存款第一次过十万、父母退休……），每年给时间线添 2–4 条。它们只写字、不改任何状态，随机数用第二条流（`rnd2`），所以加多少内容、怎么改，人生的走向都不变（`tests/daily.test.ts` 检查），也不用重新校准。同一句话 12 年内不会重复出现。无界面的人生（同伴、校准）不排日常。

加一条生活片段：在 `FRAG` 里加一项 `{ ok: () => 条件, text: () => say('一句', [条件, '另一句'], …) }`。
