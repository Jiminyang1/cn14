// 逐位确定的 exp / log / cos / pow。
// JS 规范没有规定 Math.exp、Math.log、Math.cos、Math.pow 的精度，各浏览器、各 Node 版本在最后一位上会不一样（实测 Chrome 152 和 Node 24 就不同），
// 同一个种子在不同环境里就可能跑出不一样的人生，重放也对不上。这里把 fdlibm 5.3（Sun，见文件末尾的版权声明）的实现移植成纯 JS：
// JS 的加减乘除在所有平台上都是逐位确定的 IEEE 754 双精度运算，所以这些函数在任何浏览器和 Node 里结果都完全相同，误差小于 1 ulp。
// 引擎里会影响模拟结果的数学函数一律用这里的；Math.sqrt（IEEE 要求正确舍入）、floor、round、abs、min、max 本来就是确定的，照常用。

const dv = new DataView(new ArrayBuffer(8));
const hi = (x: number) => { dv.setFloat64(0, x); return dv.getInt32(0); };
const lo = (x: number) => { dv.setFloat64(0, x); return dv.getUint32(4); };
const withHi = (x: number, h: number) => { dv.setFloat64(0, x); dv.setInt32(0, h); return dv.getFloat64(0); };
const fromWords = (h: number, l: number) => { dv.setInt32(0, h); dv.setUint32(4, l); return dv.getFloat64(0); };

// ===== exp（e_exp.c） =====
const halF = [0.5, -0.5];
const o_threshold = 7.09782712893383973096e+02, u_threshold = -7.45133219101941108420e+02;
const ln2HI = [6.93147180369123816490e-01, -6.93147180369123816490e-01];
const ln2LO = [1.90821492927058770002e-10, -1.90821492927058770002e-10];
const invln2 = 1.44269504088896338700e+00;
const P1 = 1.66666666666666019037e-01, P2 = -2.77777777770155933842e-03, P3 = 6.61375632143793436117e-05,
  P4 = -1.65339022054652515390e-06, P5 = 4.13813679705723846039e-08;
const twom1000 = 9.33263618503218878990e-302, huge = 1.0e+300;

export function fexp(x: number): number {
  let hx = hi(x);
  const xsb = (hx >>> 31) & 1;
  hx &= 0x7fffffff;
  let k = 0, h = 0, l = 0;
  if (hx >= 0x40862E42) { // |x| >= 709.78...
    if (hx >= 0x7ff00000) {
      if (((hx & 0xfffff) | lo(x)) !== 0) return x + x; // NaN
      return xsb === 0 ? x : 0; // exp(±inf)
    }
    if (x > o_threshold) return Infinity;
    if (x < u_threshold) return 0;
  }
  if (hx > 0x3fd62e42) { // |x| > 0.5 ln2
    if (hx < 0x3FF0A2B2) { // |x| < 1.5 ln2
      h = x - ln2HI[xsb]; l = ln2LO[xsb]; k = 1 - xsb - xsb;
    } else {
      k = (invln2 * x + halF[xsb]) | 0; // C 的 (int) 也是向零截断
      h = x - k * ln2HI[0];
      l = k * ln2LO[0];
    }
    x = h - l;
  } else if (hx < 0x3e300000) { // |x| < 2^-28
    if (huge + x > 1) return 1 + x;
  }
  const t = x * x;
  const c = x - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  if (k === 0) return 1 - ((x * c) / (c - 2.0) - x);
  const y = 1 - ((l - (x * c) / (2.0 - c)) - h);
  if (k >= -1021) return withHi(y, hi(y) + (k << 20));
  return withHi(y, hi(y) + ((k + 1000) << 20)) * twom1000;
}

// ===== log（e_log.c） =====
const ln2_hi = 6.93147180369123816490e-01, ln2_lo = 1.90821492927058770002e-10, two54 = 1.80143985094819840000e+16;
const Lg1 = 6.666666666666735130e-01, Lg2 = 3.999999999940941908e-01, Lg3 = 2.857142874366239149e-01, Lg4 = 2.222219843214978396e-01,
  Lg5 = 1.818357216161805012e-01, Lg6 = 1.531383769920937332e-01, Lg7 = 1.479819860511658591e-01;

export function flog(x: number): number {
  let hx = hi(x);
  const lx = lo(x);
  let k = 0;
  if (hx < 0x00100000) { // x < 2^-1022
    if (((hx & 0x7fffffff) | lx) === 0) return -Infinity;
    if (hx < 0) return NaN;
    k -= 54; x *= two54; hx = hi(x);
  }
  if (hx >= 0x7ff00000) return x + x;
  k += (hx >> 20) - 1023;
  hx &= 0x000fffff;
  let i = (hx + 0x95f64) & 0x100000;
  x = withHi(x, hx | (i ^ 0x3ff00000)); // 把 x 规格化到 [sqrt(2)/2, sqrt(2))
  k += i >> 20;
  const f = x - 1.0;
  if ((0x000fffff & (2 + hx)) < 3) { // |f| < 2^-20
    if (f === 0) { if (k === 0) return 0; const dk = k; return dk * ln2_hi + dk * ln2_lo; }
    const R = f * f * (0.5 - 0.33333333333333333 * f);
    if (k === 0) return f - R;
    const dk = k; return dk * ln2_hi - ((R - dk * ln2_lo) - f);
  }
  const s = f / (2.0 + f), dk = k, z = s * s;
  i = hx - 0x6147a;
  const w = z * z;
  const j = 0x6b851 - hx;
  const t1 = w * (Lg2 + w * (Lg4 + w * Lg6));
  const t2 = z * (Lg1 + w * (Lg3 + w * (Lg5 + w * Lg7)));
  i |= j;
  const R = t2 + t1;
  if (i > 0) {
    const hfsq = 0.5 * f * f;
    if (k === 0) return f - (hfsq - s * (hfsq + R));
    return dk * ln2_hi - ((hfsq - (s * (hfsq + R) + dk * ln2_lo)) - f);
  }
  if (k === 0) return f - s * (f - R);
  return dk * ln2_hi - ((s * (f - R) - dk * ln2_lo) - f);
}

// ===== cos（s_cos.c、k_cos.c、k_sin.c、e_rem_pio2.c） =====
const C1 = 4.16666666666666019037e-02, C2 = -1.38888888888741095749e-03, C3 = 2.48015872894767294178e-05,
  C4 = -2.75573143513906633035e-07, C5 = 2.08757232129817482790e-09, C6 = -1.13596475577881948265e-11;
function kcos(x: number, y: number): number {
  const ix = hi(x) & 0x7fffffff;
  if (ix < 0x3e400000 && (x | 0) === 0) return 1; // |x| < 2^-27
  const z = x * x;
  const r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  if (ix < 0x3FD33333) return 1 - (0.5 * z - (z * r - x * y)); // |x| < 0.3
  const qx = ix > 0x3fe90000 ? 0.28125 : fromWords(ix - 0x00200000, 0); // x/4
  const hz = 0.5 * z - qx, a = 1 - qx;
  return a - (hz - (z * r - x * y));
}
const S1 = -1.66666666666666324348e-01, S2 = 8.33333333332248946124e-03, S3 = -1.98412698298579493134e-04,
  S4 = 2.75573137070700676789e-06, S5 = -2.50507602534068634195e-08, S6 = 1.58969099521155010221e-10;
function ksin(x: number, y: number, iy: number): number {
  const ix = hi(x) & 0x7fffffff;
  if (ix < 0x3e400000 && (x | 0) === 0) return x;
  const z = x * x, v = z * x, r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  if (iy === 0) return x + v * (S1 + z * r);
  return x - ((z * (0.5 * y - v * r) - y) - v * S1);
}
const invpio2 = 6.36619772367581382433e-01;
const pio2_1 = 1.57079632673412561417e+00, pio2_1t = 6.07710050650619224932e-11;
const pio2_2 = 6.07710050630396597660e-11, pio2_2t = 2.02226624879595063154e-21;
const pio2_3 = 2.02226624871116645580e-21, pio2_3t = 8.47842766036889956997e-32;
const npio2_hw = [
  0x3FF921FB, 0x400921FB, 0x4012D97C, 0x401921FB, 0x401F6A7A, 0x4022D97C, 0x4025FDBB, 0x402921FB,
  0x402C463A, 0x402F6A7A, 0x4031475C, 0x4032D97C, 0x40346B9C, 0x4035FDBB, 0x40378FDB, 0x403921FB,
  0x403AB41B, 0x403C463A, 0x403DD85A, 0x403F6A7A, 0x40407E4C, 0x4041475C, 0x4042106C, 0x4042D97C,
  0x4043A28C, 0x40446B9C, 0x404534AC, 0x4045FDBB, 0x4046C6CB, 0x40478FDB, 0x404858EB, 0x404921FB,
];
// x 除以 pi/2：返回商 n，余数 y[0] + y[1]。只实现到 |x| <= 2^19·pi/2（引擎里用不到更大的数）
function remPio2(x: number, y: number[]): number {
  const hx = hi(x), ix = hx & 0x7fffffff;
  if (ix <= 0x3fe921fb) { y[0] = x; y[1] = 0; return 0; }
  if (ix < 0x4002d97c) { // |x| < 3pi/4
    if (hx > 0) {
      let z = x - pio2_1;
      if (ix !== 0x3ff921fb) { y[0] = z - pio2_1t; y[1] = (z - y[0]) - pio2_1t; }
      else { z -= pio2_2; y[0] = z - pio2_2t; y[1] = (z - y[0]) - pio2_2t; }
      return 1;
    }
    let z = x + pio2_1;
    if (ix !== 0x3ff921fb) { y[0] = z + pio2_1t; y[1] = (z - y[0]) + pio2_1t; }
    else { z += pio2_2; y[0] = z + pio2_2t; y[1] = (z - y[0]) + pio2_2t; }
    return -1;
  }
  if (ix <= 0x413921fb) {
    const t0 = Math.abs(x);
    const n = (t0 * invpio2 + 0.5) | 0;
    const fn = n;
    let r = t0 - fn * pio2_1, w = fn * pio2_1t;
    if (n < 32 && ix !== npio2_hw[n - 1]) y[0] = r - w;
    else {
      const j = ix >> 20;
      y[0] = r - w;
      let i = j - ((hi(y[0]) >> 20) & 0x7ff);
      if (i > 16) { // 第二轮，精度 118 位
        let t = r; w = fn * pio2_2; r = t - w; w = fn * pio2_2t - ((t - r) - w); y[0] = r - w;
        i = j - ((hi(y[0]) >> 20) & 0x7ff);
        if (i > 49) { // 第三轮，151 位
          t = r; w = fn * pio2_3; r = t - w; w = fn * pio2_3t - ((t - r) - w); y[0] = r - w;
        }
      }
    }
    y[1] = (r - y[0]) - w;
    if (hx < 0) { y[0] = -y[0]; y[1] = -y[1]; return -n; }
    return n;
  }
  throw new RangeError('fcos: |x| 太大');
}
const ry = [0, 0];
export function fcos(x: number): number {
  const ix = hi(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) return kcos(x, 0);
  if (ix >= 0x7ff00000) return NaN;
  const n = remPio2(x, ry);
  switch (n & 3) {
    case 0: return kcos(ry[0], ry[1]);
    case 1: return -ksin(ry[0], ry[1], 1);
    case 2: return -kcos(ry[0], ry[1]);
    default: return ksin(ry[0], ry[1], 1);
  }
}

// ===== pow =====
// x^y = exp(y·ln x)。比 fdlibm 的 e_pow.c 简单得多，误差略大（约 |y·ln x| 个 ulp，引擎里的用法都在几个 ulp 以内），但同样逐位确定。
// 只支持 x >= 0（引擎里的底数都不是负数；生命表里会出现 0 的 k 次方）
export function fpow(x: number, y: number): number {
  if (y === 0 || x === 1) return 1;
  if (x === 0) return y > 0 ? 0 : Infinity;
  if (!(x > 0)) throw new RangeError('fpow: 底数不能为负');
  return fexp(y * flog(x));
}

/*
 * 以上 exp、log、cos 移植自 fdlibm 5.3：
 * Copyright (C) 1993 by Sun Microsystems, Inc. All rights reserved.
 * Developed at SunPro, a Sun Microsystems, Inc. business.
 * Permission to use, copy, modify, and distribute this software is freely granted,
 * provided that this notice is preserved.
 */
