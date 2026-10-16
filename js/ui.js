// 界面：首页、出生卡、一生、结局。只负责显示和输入，规则都在 engine.js / content.js。

const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { } },
};
const SAVE_KEY = 'cn14.save', PREF_KEY = 'cn14.pref', PAST_KEY = 'cn14.past';
const pref = Object.assign({ len: 25 }, store.get(PREF_KEY) || {});
const LENS = [[10, '10 分钟'], [25, '25 分钟'], [45, '45 分钟']];
const SPEEDS = [1, 2, 4, 8, 16];
const QW = ['最贫困', '不太宽裕', '中等收入', '比较富裕', '最富裕'];
const dots = q => '●'.repeat(q) + '○'.repeat(5 - q);
const sexW = s => s === 'M' ? '男' : '女';

function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
  window.scrollTo(0, 0);
}

// ===== 首页 =====
const T0 = performance.now();
function renderHome() {
  $('#fileNo').textContent = 'No. ' + new Date().getFullYear() + '-' + String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
  $('#leadNum').textContent = `${NATION.year}年，中国出生了${Math.round(NATION.births / 1e4)}万个婴儿，平均每${(31557600 / NATION.births).toFixed(1)}秒一个`;
  const all = PROVS.slice().sort((a, b) => b.b - a.b);
  const rows = all.slice(0, 9).map(p => ({ n: p.n, v: p.b / BIRTH_TOTAL }));
  rows.push({ n: `其余${all.length - 9}个省区市`, v: all.slice(9).reduce((t, p) => t + p.b, 0) / BIRTH_TOTAL, other: 1 });
  const mx = Math.max(...rows.map(r => r.v));
  $('#dist').innerHTML = rows.map(r => `<div class="bar-row${r.other ? ' other' : ''}"><span>${r.n}</span><i style="--w:${(r.v / mx * 100).toFixed(1)}%"></i><b>${(r.v * 100).toFixed(1)}%</b></div>`).join('');

  $('#segLen').innerHTML = LENS.map(([v, l]) => `<button data-v="${v}" class="${pref.len === v ? 'on' : ''}">${l}</button>`).join('');
  $('#segLen').onclick = e => { const b = e.target.closest('button'); if (!b) return; pref.len = +b.dataset.v; store.set(PREF_KEY, pref); renderHome(); };


  const sv = store.get(SAVE_KEY);
  $('#btnResume').hidden = !(sv && sv.phase === 'life');
  if (sv && sv.phase === 'life') $('#btnResume').textContent = `继续上次的人生（${sv.name}，${sv.age}岁）`;

  const past = store.get(PAST_KEY) || [];
  $('#past').hidden = !past.length;
  $('#past').innerHTML = `<h4>你过过的人生</h4><ul>${past.slice(0, 12).map(p => `<li>${esc(p.name)} <span>· ${esc(p.place)} · ${p.y0}–${p.y1} · 享年${p.age}岁 · ${esc(p.cause)}</span></li>`).join('')}</ul>`;
}
function tickCounters() {
  if ($('#home').hidden) return;
  const s = (performance.now() - T0) / 1000;
  $('#cBirth').textContent = Math.floor(s * NATION.births / 31557600).toLocaleString('zh-CN');
  $('#cDeath').textContent = Math.floor(s * NATION.deaths / 31557600).toLocaleString('zh-CN');
}

// ===== 出生卡 =====
function bornNow() {
  const seed = (Date.now() ^ Math.floor(Math.random() * 2 ** 31)) | 0;
  newLife(seed);
  S.yearSec = pref.len * 60 / 80;
  S.speed = 1; S.auto = false;
  renderCert();
  show('birth');
}
const fileNo = () => `${S.birthYear}-${String(Math.abs(S.seed) % 1000000).padStart(6, '0')}`;
function renderCert() {
  const p = PBY[S.born], f = S.fam, lt = LT();
  const le = leOf(S.born, S.sex, S.rural);
  const share = p.b / BIRTH_TOTAL;
  const sib = f.sibs.length ? f.sibs.map(s => `${s.rel}（${s.age}岁）`).join('、') : '无';
  const cell = (k, v, wide) => `<div${wide ? ' class="wide"' : ''}><span>${k}</span><b>${v}</b></div>`;
  $('#cert').innerHTML = `<div class="form-doc">
      <span class="doc-no">档案号 ${fileNo()}</span>
      <h2 class="form-title">出生登记表</h2>
      <div class="nm">${esc(S.name)}</div>
      <p>${esc(S.log[S.log.length - 1].t)}</p>
      <div class="ftable">
        ${cell('性别', sexW(S.sex))}${cell('民族', S.eth)}${cell('户籍', S.rural ? '农村' : '城镇')}
        ${cell('出生地', esc(placeName()), true)}
        ${cell('家境', `<span class="dots">${dots(S.q)}</span> ${QW[S.q - 1]}`)}${cell('家庭人均可支配收入' + ib('famQuint'), `约${wan(famIncome())}/年`)}${cell('兄弟姐妹', sib)}
        ${cell('母亲', `${f.mom.age}岁 · ${f.mom.job}`)}${cell('父亲', `${f.dad.age}岁 · ${f.dad.job}`)}${cell('成长', S.flags.lb === 'both' ? `留守，由${S.flags.carer}带大` : S.flags.lb ? '一方父母外出打工' : S.flags.mig ? '随父母在外地' : '和父母在一起')}
        ${cell('预期寿命' + ib('le'), le.toFixed(1) + '岁')}${cell('5岁前离世的概率' + ib('u5'), ((1 - lt.l[5]) * 100).toFixed(2) + '%')}${cell(p.n + '大专及以上人口', p.eduHi ? (p.eduHi * 100).toFixed(1) + '%' : '—')}
      </div>
      <p class="small">此刻在中国出生的婴儿里，约 ${(share * 100).toFixed(1)}% 的户籍在${p.n}，一年约 ${p.b} 万人。${S.flags.mig ? `你的父母在外打工，你出生在${esc(placeName(S.loc))}，户口仍在老家。` : S.rural ? '你是其中出生在农村的那一部分。' : ''}</p>
      <h4 style="margin-top:18px">同一秒建档的另外四个人</h4>
      <div class="peers">${S.comps.map(c => `<div class="peer"><b>${esc(c.name)}</b><span>${esc(c.place)} · ${sexW(c.sex)} · ${c.eth !== '汉族' ? c.eth + ' · ' : ''}${QW[c.q - 1]}的家庭</span></div>`).join('')}</div>
      <p class="small muted">活到平均寿命大约需要 ${pref.len} 分钟（一年约 ${S.yearSec.toFixed(1)} 秒）。中途关掉页面会保存在这个浏览器里。</p>
      <div class="apply-actions"><button class="stamp-btn" id="btnStart">开始这一生</button></div>
      <div class="seal stamp-in">已登记</div>
    </div>`;
  $('#btnStart').onclick = startLife;
}

// ===== 一生 =====
let renderedLog = 0, endShown = false;
function startLife() {
  renderedLog = 0; endShown = false; docOpen = new Set([0]); docN = -1;
  $('#log').innerHTML = '';
  $('#segSpeed').innerHTML = SPEEDS.map(v => `<button data-v="${v}">${v}×</button>`).join('');
  show('life');
  save();
  renderLife(true);
  if (S.pending) openModal();
}
function save() { if (S && !S.headless) store.set(SAVE_KEY, S); }

function renderLife(full) {
  $('#age').textContent = S.age;
  $('#yr').textContent = `${S.birthYear + S.age}年`;
  $('#prog').style.width = (S.t * 100).toFixed(1) + '%';
  $('#btnPause').textContent = S.paused ? '▶' : '❚❚';
  for (const b of $('#segSpeed').children) b.classList.toggle('on', +b.dataset.v === S.speed);
  $('#chkAuto').checked = !!S.auto;
  renderLog();
  if (!full && !S.dirty) return;
  if (tipOpen) return; // 正在看「怎么算的」，先不重绘侧栏
  S.dirty = false;
  $('#lfNo').textContent = '档案号 ' + fileNo();
  $('#lname').textContent = S.name;
  $('#lplace').textContent = `${sexW(S.sex)} · ${S.eth} · 现居${placeName(S.loc)} · ${S.school ? '在读' + S.school : S.age < 6 ? '学龄前' : EDU_LV[S.edu]}${statusLabel() && !S.school && S.age >= 16 ? ' · ' + statusLabel().split(' · ')[0] : ''}`;
  const st = S.st, bar = (n, v, c) => `<div class="vt"><span>${n}</span><i><u style="--v:${v}%;--c:var(${c})"></u></i><b>${Math.round(v)}</b></div>`;
  // 经济独立以前，钱的情况看「家庭状况」；开始工作（或离开学校）以后显示个人账户
  const acct = S.indep === false ? `<h5 class="acct-h">本人</h5><p class="hint" style="margin-top:2px">${S.school ? '在读' + S.school : S.age < 6 ? '学龄前' : '还没有工作'}，花销由家里负担，家里的收入和存款见「家庭状况」。开始工作以后才有自己的账户。</p>` :
    `<h5 class="acct-h">个人账户 <span class="muted small">${S.indepAt != null ? S.indepAt + '岁开始工作' : ''}</span></h5><div class="acct"><div><span>存款${ib('myMoney')}</span><b style="color:${S.money < 0 ? 'var(--bad)' : 'inherit'}">${wan(S.money)}</b></div>
     <div><span>${S.job === 'retired' ? '养老金' : '年收入'}${ib('myIncome')}</span><b>${S.job === 'retired' ? wan(S.pension || 0) : S.income ? wan(S.income) : '—'}</b></div>
     <div><span>公积金${ib('hpf')}</span><b>${S.hpf ? wan(S.hpf) : S.hpfOn ? '0元' : '没有'}</b></div>
     <div><span>房贷${ib('loan')}</span><b>${loanBal() ? wan(loanBal()) + ` · 月供${wan(loanPayY() / 12)}` : '—'}</b></div></div>
     ${(S.fam.mom.alive || S.fam.dad.alive) ? `<p class="hint">父母家里的存款约 ${wan(Math.max(0, S.famMoney || 0))}。</p>` : ''}`;
  $('#vitals').innerHTML = `<h4 class="sheet-title">体检表 <span class="muted small">0–100</span></h4>` + bar('健康', st.hl, '--hl') + bar('幸福', st.h, '--h') + bar('学识', st.kn, '--kn') + bar('人际', st.so, '--so') + acct;
  $('#family').innerHTML = familyHtml();
  renderFocus(); renderComps(); renderDocs(); renderCurve('#curve');
}
// 家庭状况：成家以前一张「家庭状况」（父母的家）；成家以后分成「我的家」和「父母」两张卡片
function familyHtml() {
  const f = S.fam, rows = [];
  const par = (who, label) => {
    const p = f[who], male = who === 'dad';
    if (!p.alive) return `<div class="fr gone"><span>${label}</span><b>已去世 · 享年${p.age}岁</b></div>`;
    const ret = parentRetired(p, male), inc = parentIncome(who);
    return `<div class="fr"><span>${label}</span><b>${p.age}岁 · ${ret ? '退休（原' + p.job + '）' : p.job}</b><em>${inc ? (ret ? '养老金 ' : '年收入 ') + wan(inc) + '/年' + ib('parentInc:' + who) : '没有收入'}</em></div>`;
  };
  rows.push(par('dad', '父亲'), par('mom', '母亲'));
  if (S.flags.parDiv) rows.push(`<div class="fr"><span></span><b class="muted">父母已离婚</b></div>`);
  if (S.flags.lb === 'both' && S.age < 16) rows.push(`<div class="fr"><span>照看人</span><b>${S.flags.carer}（父母在外打工）</b></div>`);
  if (f.sibs.length) rows.push(`<div class="fr"><span>兄弟姐妹</span><b>${f.sibs.map(x => `${x.rel} ${x.age}岁`).join('、')}</b></div>`);
  const H = S.famHouse || { type: 'rent', v: 0 }, anyParent = f.mom.alive || f.dad.alive;
  const assets = (S.famMoney || 0) + (H.v || 0) - (S.famDebt || 0);
  const parentsBox = anyParent ? `<div class="acct"><div><span>家境</span><b class="dots">${dots(S.q)}</b></div>
      <div><span>${S.indep === false ? '家庭人均可支配收入' : '父母收入合计'}${ib('famPerCap')}</span><b>${S.indep === false ? wan(parentsPerCap()) : wan(parentIncome('mom') + parentIncome('dad'))}/年</b></div>
      <div><span>住房${ib('famHouse')}</span><b>${FAM_HOUSE_N[H.type]}${H.v ? ' · 估值约' + wan(H.v) : ''}</b></div>
      <div><span>${S.famMoney < 0 ? '欠款' : '存款'}${ib('famMoney')}</span><b style="color:${S.famMoney < 0 ? 'var(--bad)' : 'inherit'}">${wan(Math.abs(S.famMoney || 0))}</b></div>
      ${S.famDebt > 0 ? `<div><span>欠款${ib('famDebt')}</span><b style="color:var(--bad)">${wan(S.famDebt)}</b></div>` : ''}
      <div><span>净资产${ib('famAssets')}</span><b style="color:${assets < 0 ? 'var(--bad)' : 'inherit'}">约${wan(assets)}</b></div><div><span>住在</span><b>${esc(H.where || '')}</b></div></div>
      ${S.flags.supportY ? `<p class="hint">父母的积蓄已经花完，你每年给他们寄生活费，累计约 ${wan(S.stats.support || 0)}。</p>` : ''}`
    : `<p class="hint">父母都已经去世。${S.stats.inherit ? `你继承了约 ${wan(S.stats.inherit)}。` : ''}</p>`;
  const ownFamily = f.married || f.partner || f.kids.length;
  const love = loveHtml();
  if (!ownFamily) return love + `<div class="sheet"><h4 class="sheet-title">家庭状况</h4><div class="fams">${rows.join('')}</div>${parentsBox}</div>`;
  const pt = f.partner, kids = f.kids;
  const hh = (S.income || 0) + (pt && pt.alive && f.married ? pt.inc : 0);
  const mine = `<div class="sheet"><h4 class="sheet-title">我的家</h4><div class="fams">
      ${pt ? `<div class="fr${pt.alive ? '' : ' gone'}"><span>${pt.sex === 'M' ? '丈夫' : '妻子'}</span><b>${esc(pt.name)} · ${pt.alive ? pt.age + '岁 · ' + (pt.edu ? EDU_LV[pt.edu] + ' · ' : '') + (pt.retired ? '退休' : pt.k != null ? ptJobName(pt) : JOBS[pt.job] ? JOBS[pt.job].n : '') : '已去世'}</b><em>${pt.alive ? (pt.retired ? '养老金 ' : '年收入 ') + wan(pt.inc) + '/年' + (pt.k != null ? ib('ptInc:partner') : '') : ''}</em></div>` : ''}
      ${!f.married && S.flags.divorced ? `<div class="fr"><span>婚姻</span><b>离异</b></div>` : ''}
      ${kids.map(k => `<div class="fr${k.alive ? '' : ' gone'}"><span>${k.sex === 'M' ? '儿子' : '女儿'}</span><b>${esc(k.name)} · ${k.alive ? (S.age - k.bornAt) + '岁' + (k.path ? ' · ' + k.path.replace(/^考上了/, '') : '') : '已离世'}</b></div>`).join('')}
      ${S.flags.grandkids ? `<div class="fr"><span>孙辈</span><b>${S.flags.grandkids}人</b></div>` : ''}
    </div>
    <div class="acct"><div><span>家庭年收入</span><b>${wan(hh)}</b></div><div><span>房子</span><b>${S.house ? esc(S.house.city) + ' · 约' + wan(S.house.v) : '租房'}</b></div></div></div>`;
  return love + mine + `<div class="sheet"><h4 class="sheet-title">父母</h4><div class="fams">${rows.join('')}</div>${parentsBox}</div>`;
}
// 恋爱中：对象的基本情况、在一起几年、感情好不好
function loveHtml() {
  const d = S.fam.dating; if (!d) return '';
  const yrs = S.age - d.metAt, ldr = d.city !== S.loc.city;
  return `<div class="sheet"><h4 class="sheet-title">恋爱中 <span class="muted small">${yrs ? '在一起' + yrs + '年' : '刚在一起'}${ldr ? ' · 异地' : ''}</span></h4>
    <div class="fams"><div class="fr"><span>${d.sex === 'M' ? '男朋友' : '女朋友'}</span><b>${esc(d.name)} · ${d.age}岁 · ${esc(d.trait)}</b></div></div>
    <div class="acct"><div><span>学历</span><b>${d.jk ? EDU_LV[d.edu] : EDU_LV[d.edu] + '在读'}</b></div><div><span>职业</span><b>${esc(ptJobName(d))}${ldr ? '（在' + esc(d.city) + '）' : ''}</b></div>
      <div><span>年收入${d.jk ? ib('ptInc:dating') : ''}</span><b>${d.inc ? wan(d.inc) + '/年' : '没有收入'}</b></div><div><span>家乡</span><b>${PBY[d.home].n}${d.rural ? '农村' : '城里'}</b></div>
      <div><span>对方家境</span><b class="dots">${dots(d.q)}</b></div><div><span>感情</span><b>${loveWord(d.love)} <span class="dots">${dots(Math.max(1, Math.round(d.love / 20)))}</span></b></div></div></div>`;
}
function renderFocus() {
  const l = focusList();
  if (!l.length) { $('#focus').innerHTML = `<h4>本年度计划</h4><p class="small muted" style="margin:0">还是个孩子，正由${carer()}带着长大。六岁以后，可以决定每一年把时间花在哪里。这段时间会自动加快。</p>`; return; }
  $('#focus').innerHTML = `<h4>本年度计划 · 这一年主要把时间花在哪里（随时可改，年底按时间比例结算）</h4>
    <div class="plan-opts">${l.map(k => `<button data-k="${k}" class="${S.focus === k ? 'on' : ''}" title="${FOCUS[k].d}">${FOCUS[k].n}<small>${FOCUS[k].d}</small></button>`).join('')}</div>`;
}
function renderLog() {
  const n = S.log.length - renderedLog;
  if (n <= 0) return;
  const html = S.log.slice(0, n).map(e => `<div class="tl ${e.k}" data-a="${e.a}"><span class="ag">${e.a}</span><p>${esc(e.t)}${e.f ? `<span class="f">${esc(e.f)}</span>` : ''}</p></div>`).join('');
  const box = $('#log');
  box.insertAdjacentHTML('afterbegin', html);
  const kids = box.children;
  for (let i = 0; i < Math.min(kids.length, n + 1); i++) kids[i].classList.toggle('same', i > 0 && kids[i - 1].dataset.a === kids[i].dataset.a);
  renderedLog = S.log.length;
  S.dirty = true;
}
// 证件夹：最新的在上面，点开看内容
const DOC_SEAL = { birth: '登记', admit: '录取', grad: '毕业', school: '学籍', job: '合同', civil: '录用', marry: '婚姻', divorce: '登记', house: '不动产', kid: '出生', ill: '医院', retire: '退休' };
let docOpen = new Set(), docN = -1;
function docHtml(d, i, open) {
  return `<div class="doc ${d.k}${open ? ' open' : ''}" data-i="${i}"><h5>${esc(d.title)}<small>${d.y}年 · ${d.a}岁</small></h5>
    <dl>${d.rows.map(r => `<dt>${esc(r[0])}</dt><dd>${esc(r[1])}</dd>`).join('')}</dl><span class="mini-seal">${DOC_SEAL[d.k] || '档'}</span></div>`;
}
function renderDocs() {
  if (!S) return;
  const docs = S.docs || [];
  if (docs.length !== docN) { if (docs.length > docN && docN >= 0) docOpen = new Set([docs.length - 1]); docN = docs.length; }
  $('#docCount').textContent = `${docs.length} 份`;
  $('#docs').innerHTML = docs.map((d, i) => [d, i]).reverse().map(([d, i]) => docHtml(d, i, docOpen.has(i))).join('');
}
// 一生曲线：幸福（实线）和健康（虚线），竖虚线是平均寿命
function renderCurve(sel, W = 300, H = 120) {
  const ys = S.years, le = leOf(S.born, S.sex, S.rural);
  const maxA = Math.max(100, S.age + 1);
  const x = a => 8 + a / maxA * (W - 16), y = v => 8 + (100 - v) / 100 * (H - 26);
  const pts = k => ys.map(r => `${x(r.a).toFixed(1)},${y(r[k]).toFixed(1)}`).join(' ');
  let ticks = '';
  for (let a = 0; a <= maxA; a += 20) ticks += `<line class="ax" x1="${x(a)}" x2="${x(a)}" y1="${H - 16}" y2="${H - 12}"/><text x="${x(a)}" y="${H - 2}" text-anchor="middle">${a}</text>`;
  $(sel).innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="一生曲线">
    <line class="ax" x1="8" x2="${W - 8}" y1="${H - 16}" y2="${H - 16}"/>${ticks}
    <line class="le" x1="${x(le)}" x2="${x(le)}" y1="6" y2="${H - 16}"/>
    ${ys.length > 1 ? `<polyline class="lhl" points="${pts('hl')}"/><polyline class="lh" points="${pts('h')}"/>` : ''}
  </svg><p class="hint" style="margin:4px 0 0">实线幸福，虚线健康；竖线是${PBY[S.born].n}${S.sex === 'M' ? '男性' : '女性'}的预期寿命 ${le.toFixed(0)} 岁。</p>`;
}
function compNow(c, age) {
  if (c.death && c.death.age < age) return { dead: true, t: `${c.death.age}岁离世 · ${CAUSE[c.death.cause]}` };
  return { dead: false, t: c.tr[age] || '' };
}
function renderComps() {
  $('#comps').innerHTML = S.comps.map(c => { const s = compNow(c, S.age); return `<div class="comp ${s.dead ? 'dead' : ''}"><b>${esc(c.name)}</b> <span class="muted">${esc(c.place)} · ${sexW(c.sex)}</span><span class="st">${esc(s.t)}</span></div>`; }).join('');
}
// ===== 弹窗：抉择与停顿 =====
let modalOpen = false, autoTimer = null;
function openModal() {
  const P = S.pending; if (!P) return;
  modalOpen = true;
  $('#modal').hidden = false;
  if (P.type === 'dec' && P.d.form === 'zhiyuan' && !S.auto) { renderZhiyuan(P.d); return; }
  if (P.type === 'dec') {
    const d = P.d;
    $('#sheet').innerHTML = `<p class="kicker">${S.birthYear + S.age}年 · ${S.age}岁 · 抉择</p><h3>${esc(d.title)}</h3><p>${esc(d.body)}</p>${d.card ? `<div class="acct pcard">${d.card.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>` : ''}${d.fact ? `<p class="fact">${esc(d.fact)}</p>` : ''}
      <div class="choices">${d.choices.map(c => `<button data-k="${c.k}"${c.off ? ' disabled' : ''}>${esc(c.label)}${c.sub ? `<small>${esc(c.sub)}</small>` : ''}</button>`).join('')}</div>
      ${S.auto ? '<p class="small muted" style="margin-top:10px">自动抉择中…</p>' : ''}`;
    $('#sheet').querySelector('.choices').onclick = e => { const b = e.target.closest('button'); if (b) chooseDec(b.dataset.k); };
    if (S.auto) {
      const k = autoPick(d);
      autoTimer = setTimeout(() => { const b = $('#sheet').querySelector(`[data-k="${k}"]`); if (b) b.classList.add('pick'); autoTimer = setTimeout(() => chooseDec(k), 700); }, 900);
    }
  } else {
    $('#sheet').innerHTML = `<p class="kicker">${S.birthYear + S.age}年 · ${S.age}岁 · 自述</p><h3>${esc(P.q)}</h3>
      <p class="small muted">想一想就好。愿意的话，留一行字，它会被记在这一生里。</p>
      <textarea id="refTxt" maxlength="300" placeholder="写点什么（可以不写）"></textarea>
      <div class="apply-actions"><button class="stamp-btn" id="refOk">继续</button></div>`;
    $('#refOk').onclick = () => {
      const t = $('#refTxt').value.trim();
      if (t) { S.notes.push({ a: S.age, q: P.q, t }); log(`你写下：“${t}”`, 'note'); }
      closeModal();
    };
  }
}
// 填报志愿：从冲/稳/保里按顺序勾选最多 3 个学校，每个学校选一个专业，再决定是否服从调剂
function renderZhiyuan(d) {
  const c = d.ctx, order = [];
  const pc = p => p >= 0.9 ? '很稳' : p >= 0.6 ? '较稳' : p >= 0.35 ? '有希望' : '冲一冲';
  const rows = c.cands.map((u, i) => {
    const ms = majorsOf(u).map(m => { const p = majorP(c.rank, u, m); return `<option value="${m.n}">${m.n}${m.heat < 0.8 ? '·热' : m.heat > 1.2 ? '·冷' : ''} ${Math.round(p * 100)}%</option>`; }).join('');
    const where = u.prov === S.home.p ? '本省' : '外省';
    return `<div class="zy-row" data-i="${i}"><label><input type="checkbox" data-i="${i}"><span class="zy-ord"></span>
      <b>${esc(u.name)}</b> <span class="tag">${TIER_N[u.tier]}</span><br><small>${esc(u.city)} · ${where}${u.fee ? ' · 学费高' : ''} · 录取把握 ${Math.round(u.p * 100)}%（${pc(u.p)}）</small></label>
      <select data-i="${i}">${ms}</select></div>`;
  });
  const grp = g => { const r = c.cands.map((u, i) => u.group === g ? rows[i] : '').join(''); return r ? `<h4 class="zy-g">${g}</h4>${r}` : ''; };
  $('#sheet').innerHTML = `<p class="kicker">${S.age}岁 · 高考</p><h3>${esc(d.title)}</h3><p>${esc(d.body)}</p>${d.fact ? `<p class="fact">${esc(d.fact)}</p>` : ''}
    ${c.cands.length ? `<p class="small muted">按顺序勾选最多 3 个志愿（平行志愿：分数优先，按你填的顺序投档）。每个学校选一个专业。热门专业要求更高。</p>
    <div class="zy">${grp('冲')}${grp('稳')}${grp('保')}</div>
    <label class="toggle" style="margin-top:8px"><input type="checkbox" id="zyAdj" checked> 服从专业调剂（不服从的话，专业没录上会被退档）</label>` : '<p>你的分数够不上任何学校。</p>'}
    <div class="choices" style="margin-top:12px">
      ${c.cands.length ? '<button data-k="submit" class="primary-choice" disabled>提交志愿</button>' : ''}
      ${d.choices.filter(x => x.k !== 'apply').map(x => `<button data-k="${x.k}">${esc(x.label)}${x.sub ? `<small>${esc(x.sub)}</small>` : ''}</button>`).join('')}
    </div>`;
  const sub = $('#sheet').querySelector('[data-k="submit"]');
  const paint = () => {
    for (const r of $('#sheet').querySelectorAll('.zy-row')) { const k = order.indexOf(+r.dataset.i); r.querySelector('.zy-ord').textContent = k >= 0 ? `第${k + 1}志愿 ` : ''; r.classList.toggle('on', k >= 0); }
    if (sub) sub.disabled = !order.length;
  };
  $('#sheet').querySelector('.zy') && ($('#sheet').querySelector('.zy').onchange = e => {
    const t = e.target; if (t.type !== 'checkbox') return;
    const i = +t.dataset.i, k = order.indexOf(i);
    if (t.checked) { if (order.length >= 3) { t.checked = false; return; } order.push(i); } else if (k >= 0) order.splice(k, 1);
    paint();
  });
  $('#sheet').querySelector('.choices').onclick = e => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.dataset.k !== 'submit') return chooseDec(b.dataset.k);
    const apps = order.map(i => ({ i, major: $('#sheet').querySelector(`select[data-i="${i}"]`).value }));
    chooseDec('apply:' + JSON.stringify({ apps, adjust: $('#zyAdj').checked }));
  };
  paint();
}
// 选定后盖一个章，再结算
let choosing = false;
function chooseDec(k) {
  clearTimeout(autoTimer);
  const P = S.pending; if (!P || P.type !== 'dec' || choosing) return;
  choosing = true;
  const b = $('#sheet').querySelector(`[data-k="${CSS.escape(k)}"]`); if (b) b.classList.add('pick');
  $('#sheet').insertAdjacentHTML('beforeend', '<div class="seal stamp-in">已 定</div>');
  setTimeout(() => { choosing = false; resolveDec(P.id, P.d, k); closeModal(); }, 420);
}
function closeModal() {
  S.pending = null; modalOpen = false; $('#modal').hidden = true;
  S.dirty = true; save(); renderLife(true);
  if (S.phase === 'end') finish();
}

// ===== 结局 =====
function finish() {
  if (endShown) return;
  endShown = true;
  store.del(SAVE_KEY);
  setTimeout(renderEnd, 1500);
}
function renderEnd() {
  const d = S.death, p = PBY[S.born], lt = LT();
  const longer = lt.l[Math.min(120, d.age + 1)];
  const past = store.get(PAST_KEY) || [];
  past.unshift({ name: S.name, place: placeName(S.home), y0: S.birthYear, y1: d.year, age: d.age, cause: CAUSE[d.cause] });
  store.set(PAST_KEY, past.slice(0, 30));
  const kids = S.fam.kids;
  const cell = (k, v, wide) => `<div${wide ? ' class="wide"' : ''}><span>${k}</span><b>${v}</b></div>`;
  $('#endBody').innerHTML = `
    <div class="folder sealed">
      <div class="folder-tab">人生档案 · <span class="mono">No. ${fileNo()}</span></div>
      <div class="folder-body">
        <p class="eyebrow">${S.birthYear}年${S.birthMonth}月 — ${d.year}年 · 享年${d.age}岁</p>
        <div class="end-h">${esc(S.name)}</div>
        <p class="end-cause">${esc(deathText(d.cause))}</p>
        <p>同一年在${p.n}出生的${S.sex === 'M' ? '男孩' : '女孩'}里，大约 ${Math.round(longer * 100)}% 会活得比${S.sex === 'M' ? '他' : '她'}更久。</p>
      </div>
      <div class="seal seal-lg stamp-in">档案<br>封存</div>
    </div>
    ${d.cause === 'suicide' ? '<p class="help">如果你也正在经历很难熬的时候，请拨打全国心理援助热线 <b>12356</b>，或者告诉身边一个你信任的人。</p>' : ''}
    <div class="form-doc end-sec">
      <h2 class="form-title">履历表</h2>
      <div class="ftable">
        ${cell('出生', esc(placeName(S.home)), true)}
        ${cell('家境', `<span class="dots">${dots(S.q)}</span>`)}${cell('学历', EDU_LV[S.edu])}${cell('做得最久的工作', mainJob(S) || '—')}
        ${cell('生活过的城市', esc(S.places.join('、')), true)}
        ${cell('婚姻', S.fam.partner ? (S.fam.partner.alive ? '已婚' : '丧偶') : S.flags.divorced ? '离异' : '未婚')}${cell('孩子', kids.length ? kids.length + '个' : '没有')}${cell('房子', S.house ? esc(S.house.city) : '没有')}
        ${cell('存款最多的时候', wan(S.stats.maxMoney))}${cell('离开时的存款', wan(S.money))}${cell('退休金', S.pension ? wan(S.pension) + '/年' : '—')}
      </div>
    </div>
    <div class="sheet end-sec"><h4 class="sheet-title">一生曲线</h4><div id="endCurve"></div></div>
    <div class="end-sec"><h4>档案里的 ${(S.docs || []).length} 份证件</h4><div class="doc-gallery">${(S.docs || []).map((x, i) => docHtml(x, i, true)).join('')}</div></div>
    ${S.notes.length ? `<div class="end-sec notes"><h4>自述</h4>${S.notes.map(n => `<p><span class="small muted">${n.a}岁 · ${esc(n.q)}</span><br>${esc(n.t)}</p>`).join('')}</div>` : ''}
    <div class="sheet end-sec"><h4 class="sheet-title">同一秒建档的人</h4>
      <table class="cmp"><tr><th></th><th>出生</th><th>学历</th><th>工作</th><th>享年</th></tr>
      <tr><td><b>${esc(S.name)}</b></td><td>${esc(placeName(S.home))}</td><td>${EDU_LV[S.edu]}</td><td>${mainJob(S) || '—'}</td><td>${d.age}岁</td></tr>
      ${S.comps.map(c => `<tr><td>${esc(c.name)}</td><td>${esc(c.place)}</td><td>${EDU_LV[c.edu]}</td><td>${esc(c.job || '—')}</td><td>${c.death.age}岁 · ${CAUSE[c.death.cause]}</td></tr>`).join('')}
      </table>
      <p class="small muted" style="margin:0">没有人选择过自己在哪里出生。</p>
    </div>
    <div class="end-sec"><h4>最后，你想对${S.sex === 'M' ? '他' : '她'}说一句话吗？</h4>
      <textarea id="lastWords" maxlength="300" placeholder="只保存在这个浏览器里"></textarea>
    </div>
    <div class="end-actions"><button class="stamp-btn" id="btnAgain">再出生一次</button><button class="btn" id="btnHome">回到首页</button></div>`;
  renderCurve('#endCurve', 680, 170);
  const saveWords = () => { const t = $('#lastWords').value.trim(); if (t) { past[0].words = t; store.set(PAST_KEY, past.slice(0, 30)); } };
  $('#btnAgain').onclick = () => { saveWords(); bornNow(); };
  $('#btnHome').onclick = () => { saveWords(); renderHome(); show('home'); };
  show('end');
}

// ===== 主循环 =====
let last = 0, lastDraw = 0;
function loop(ts) {
  const dt = Math.min(0.25, last ? (ts - last) / 1000 : 0);
  last = ts;
  tickCounters();
  if (S && !$('#life').hidden && S.phase === 'life' && !S.paused && !S.pending && !modalOpen) {
    const sp = S.speed * (S.age < 6 ? 3 : 1) * (S.ff ? 40 : 1);
    const age0 = S.age;
    tick(dt * sp / S.yearSec);
    if (S.age !== age0) { S.dirty = true; save(); }
    if (S.pending) { S.ff = false; renderLife(true); openModal(); }
    else if (S.phase === 'end') { renderLife(true); finish(); }
  }
  if (S && !$('#life').hidden && ts - lastDraw > 120) { lastDraw = ts; renderLife(false); }
  requestAnimationFrame(loop);
}

// ===== 绑定 =====
$('#btnBorn').onclick = bornNow;
$('#btnResume').onclick = () => {
  const sv = store.get(SAVE_KEY); if (!sv) return;
  S = sv; S.paused = false; S.ff = false;
  startLife();
};
$('#btnPause').onclick = () => { S.paused = !S.paused; renderLife(false); };
$('#docs').onclick = e => { const d = e.target.closest('.doc'); if (!d) return; const i = +d.dataset.i; docOpen.has(i) ? docOpen.delete(i) : docOpen.add(i); renderDocs(); };
$('#segSpeed').onclick = e => { const b = e.target.closest('button'); if (b) { S.speed = +b.dataset.v; renderLife(false); } };
$('#btnFF').onclick = () => { S.ff = true; S.paused = false; };
$('#chkAuto').onchange = e => { S.auto = e.target.checked; };
$('#btnQuit').onclick = () => { save(); S.paused = true; renderHome(); show('home'); };
$('#focus').onclick = e => { const b = e.target.closest('button[data-k]'); if (!b) return; S.focus = b.dataset.k; renderFocus(); };
document.addEventListener('visibilitychange', () => { if (document.hidden && S && S.phase === 'life') save(); });

renderHome();
requestAnimationFrame(loop);
