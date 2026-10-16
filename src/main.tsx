import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { startLoop } from './game/controller';
import './styles.css';

startLoop();
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
