import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { startLoop } from './game/controller';
import './styles.css';

const root = createRoot(document.getElementById('root')!);
// 开发时打开 /?pixel 看所有像素插画（逐帧、深浅色），/?docs 看一生的所有证件，不用进游戏
if (import.meta.env.DEV && new URLSearchParams(location.search).has('pixel')) {
  import('./ui/PixelGallery').then(m => root.render(<StrictMode><m.PixelGallery /></StrictMode>));
} else if (import.meta.env.DEV && new URLSearchParams(location.search).has('docs')) {
  // /?docs 跑完一个人生，看它拿到的所有证件
  import('./ui/DocGallery').then(m => root.render(<StrictMode><m.DocGallery /></StrictMode>));
} else {
  startLoop();
  root.render(<StrictMode><App /></StrictMode>);
}
