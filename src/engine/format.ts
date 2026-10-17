// 数字格式。



export const wan = x => { const a = Math.abs(x); const s = a >= 1e8 ? (a / 1e8).toFixed(2) + '亿' : a >= 1e4 ? (a / 1e4).toFixed(a >= 1e6 ? 0 : 1) + '万' : Math.round(a) + ''; return (x < 0 ? '-' : '') + s + '元'; };
/** 一年的钱按月显示：一万以下写到元，例如「4708元/月」「4.3万元/月」（收入、养老金、开销这些流量都按月给玩家看，引擎也按月结算） */
export const wanM = (yearly: number) => { const m = yearly / 12; return (Math.abs(m) < 1e4 ? Math.round(m) + '元' : wan(m)) + '/月'; };
