# 14亿分之1

随机出生在中国的某个角落，过完只有一次的一生。纯前端（React + TypeScript + Vite），构建产物是静态文件，可以直接部署到 Vercel 或 Cloudflare Pages。

## 开发

```
npm install
npm run dev        # http://localhost:5173
npm test           # 金标准快照：固定 seed 下的人生必须和 tests/golden.json 一致
npm run typecheck
npm run build      # 产出 dist/
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
- `src/game/`：推进循环、速度、存档（localStorage，带格式版本和旧存档迁移）
- `src/ui/`：React 组件（首页、出生登记表、一生、弹窗、结局、「怎么算的」卡片）
- `tools/calib/`：校准脚本，`npm run calib -- sim 3000`

## 加一个事件

在 `src/engine/content/events.ts` 的 `EVENTS` 里加一行：

```ts
{ id: 'xxx', a: [最小年龄, 最大年龄], w: 权重, c: () => 条件, once: 1, run: () => { eff({ h: 2 }); return '发生了什么'; } }
```

有意修改了模拟规则、结果本来就该变时：确认改动无误后运行 `UPDATE_GOLDEN=1 npm test` 重新生成 `tests/golden.json`，并在提交说明里写清楚为什么变。
