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

部署：构建命令 `npm run build`，输出目录 `dist`。

## 结构

- `src/engine/`：模拟引擎，不依赖界面
  - `state.ts` 当前人生 `S`；`rng.ts` 可存档的随机数；`types.ts` 数据结构（`Life` 等）
  - `lifecycle.ts` 出生、逐年推进、事件与抉择调度、同一秒出生的同伴
  - `mortality.ts` / `health.ts` 生命表、死因、大病与医保
  - `place.ts` / `career.ts` / `education.ts` 地点与收入、职业、高考志愿
  - `family.ts` / `parents.ts` / `romance.ts` 兄弟姐妹与孩子、父母、恋爱婚姻
  - `household.ts` / `finance.ts` / `housing.ts` 父母家的账、自己的账、公积金与房贷
  - `content/events.ts` 随机事件 `EVENTS`；`content/decisions.ts` 抉择 `DEC`
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

## 排查问题：每一局都有日志，可以精确重放

每一局出生时生成一个**局 ID**（如 `20261016-1716-hp93of`，最后一段是种子），显示在一生页面左上角和结局页，点一下复制。

模拟是确定的：同样的种子 + 同样的输入（抉择、改重心、开关自动抉择）= 一模一样的一生，与帧率、倍速、中途刷新无关。所以日志只要记下这些输入，就能重放出任何一局。

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
