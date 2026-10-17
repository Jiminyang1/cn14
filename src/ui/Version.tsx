// 版本标记：右上角写「Beta 0.1.0」（版本号取 package.json），鼠标停上去看代码版本（git 提交号，局日志里记的也是它）。
// 正式发布以前都是 Beta。样式写在这里，不放进 styles.css
import type { CSSProperties } from 'react';
import pkg from '../../package.json';
import { VERSION } from '../game/controller';

export const APP_VERSION: string = pkg.version;

const tag: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 7px', flex: 'none',
  border: '1px solid var(--rule)', borderRadius: 3, background: 'var(--card)',
  color: 'var(--muted)', font: '11px var(--mono)', letterSpacing: '.02em', whiteSpace: 'nowrap',
};
const corner: CSSProperties = { position: 'fixed', top: 10, right: 12, zIndex: 20 };

/** fixed：固定在页面右上角（首页、出生登记、结局）；不传就是放在页头里的一个小标签 */
export function VersionTag({ fixed = false }: { fixed?: boolean }) {
  return <span style={fixed ? { ...tag, ...corner } : tag} title={`版本 ${APP_VERSION} · 代码 ${VERSION}`}>Beta {APP_VERSION}</span>;
}
