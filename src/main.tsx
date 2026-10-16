import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { startLoop } from './game/controller';
import './styles.css';

const root = createRoot(document.getElementById('root')!);
// 开发时打开 /?pixel 看所有像素插画（逐帧、深浅色），不用进游戏
if (import.meta.env.DEV && new URLSearchParams(location.search).has('pixel')) {
  import('./ui/PixelGallery').then(m => root.render(<StrictMode><m.PixelGallery /></StrictMode>));
} else {
  startLoop();
  root.render(<StrictMode><App /></StrictMode>);
}
