// 人际关系里的像素头像：按这个人现在的年纪和性别画（婴儿、小孩、少年、成人、老人），衣服颜色由名字决定，同一个人一直是同一件
import { useEffect, useRef } from 'react';
import { Pix, personAt } from './pixel/pix';
import { WEAR, dress } from './pixel/kit';

const TOPS = [WEAR.blue, WEAR.brown, WEAR.green, WEAR.red, WEAR.pink, WEAR.gray, WEAR.white];
const pick = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return TOPS[h % TOPS.length]; };
// 只露出头和肩：按身高把脚放到画布下面
const feetOf = (age: number) => age < 4 ? 13 : age < 12 ? 16 : age < 18 ? 17 : age >= 65 ? 19 : 21;

export function Head({ sex, age, id, size = 30 }: { sex: 'M' | 'F'; age: number; id: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const p = new Pix(12, 12);
    personAt(p, sex, age, 1, feetOf(age), dress(pick(id), age >= 55 ? WEAR.old : {}));
    p.draw(ref.current);
  }, [sex, age, id]);
  return <canvas ref={ref} className="head-pix" width={12} height={12} style={{ width: size, height: size }} aria-hidden="true" />;
}
