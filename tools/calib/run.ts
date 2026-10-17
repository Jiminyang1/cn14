// 用法：npm run calib -- <脚本名> [参数]，例如 npm run calib -- sim 3000
const script = process.argv[2];
if (!script) {
  console.log('可用：sim diag debt loan love marr mig par sib wealth money crisis edge mortk density pers evrate div');
  process.exit(1);
}
// 让各脚本仍然从 process.argv[3] 读参数
await import(`./${script}.ts`);
export {};
