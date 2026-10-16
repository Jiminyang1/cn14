import { useState } from 'react';
import { game } from '../game/controller';

// 局 ID：点一下复制，排查问题时用它找到这一局的日志
export function RunId() {
  const [copied, setCopied] = useState(false);
  const id = game.run?.id;
  if (!id) return null;
  const copy = () => { navigator.clipboard?.writeText(id).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }, () => {}); };
  return <button className="runid" type="button" title="局 ID：反馈问题时附上它" onClick={copy}>{copied ? '已复制' : '局 ' + id}</button>;
}
