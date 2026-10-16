// 数字格式。



export const wan = x => { const a = Math.abs(x); const s = a >= 1e8 ? (a / 1e8).toFixed(2) + '亿' : a >= 1e4 ? (a / 1e4).toFixed(a >= 1e6 ? 0 : 1) + '万' : Math.round(a) + ''; return (x < 0 ? '-' : '') + s + '元'; };
