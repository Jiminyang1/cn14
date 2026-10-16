// 这一年的进度条：每一帧直接改 transform（不经过 React 重绘、不触发重新排版），所以是连续滑动的，不会一格一格地跳
import { useLayoutEffect, useRef } from 'react';
import { S } from '../engine';
import { onFrame } from '../game/controller';

export function YearProgress({ className, title }: { className: string; title?: string }) {
  const bar = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    let lastT = -1;
    const paint = () => {
      const t = S ? S.t : 0;
      if (t === lastT || !bar.current) return;
      lastT = t;
      bar.current.style.transform = `scaleX(${t})`;
    };
    paint();
    return onFrame(paint);
  }, []);
  return <span className={className} title={title}><i ref={bar} /></span>;
}
