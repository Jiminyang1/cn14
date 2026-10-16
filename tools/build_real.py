"""把 research/*.json 里核实过的数据整理成游戏用的 src/engine/real.generated.ts。
运行：python3 -I tools/build_real.py （在项目根目录）"""
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
R = lambda f: json.load(open(os.path.join(ROOT, 'research', f), encoding='utf-8'))

out = {}
mort = R('mortality_intl.json')

# ---- 生命表：UN WPP 2024，单岁组，分性别 ----
qx = mort['qx']
out['QX_NAT'] = {'M': [round(v, 6) for v in qx['male']], 'F': [round(v, 6) for v in qx['female']],
                 'src': 'UN World Population Prospects 2024, China, complete life table 2024'}
# 0 岁和 1–4 岁：用 UN IGME 2024（与卫健委 4.0‰ 一致；WPP 2024 的婴儿死亡率偏高）
igme = next(c for c in mort['child_mortality'] if c['source'].startswith('UN IGME') and c['year'] == 2024)
out['Q0_NAT'] = {'M': igme['IMR_male'] / 1000, 'F': igme['IMR_female'] / 1000,
                 'U5': {'M': igme['U5MR_male'] / 1000, 'F': igme['U5MR_female'] / 1000}, 'src': 'UN IGME 2024'}

# ---- 死因：WHO Global Health Estimates 2021，按年龄段、分性别 ----
MAP = {
    'perinatal': ['perinatal_neonatal', 'sids'],
    'congenital': ['congenital_anomalies'],
    'pneumonia': ['lower_respiratory_infections', 'covid19'],
    'drown': ['drowning'],
    'traffic': ['road_injury'],
    'accident': ['falls', 'other_injuries'],
    'disaster': ['natural_disasters'],
    'suicide': ['self_harm'],
    'leukemia': ['leukemia'],
    'cancer': ['liver_cancer', 'lung_cancer', 'stomach_cancer', 'oesophagus_cancer', 'colorectal_cancer', 'other_cancers'],
    'heart': ['ischemic_heart_disease', 'hypertensive_heart_disease', 'other_cardiovascular'],
    'stroke': ['stroke'],
    'resp': ['copd_chronic_respiratory'],
    'liver': ['cirrhosis_liver_disease'],
    'diabetes': ['diabetes'],
    'kidney': ['kidney_disease'],
    'dementia': ['alzheimer_dementia'],
    'maternal': ['maternal'],
    'other': ['other'],
}
BANDS = [('0', 0, 0), ('1-14', 1, 14), ('15-34', 15, 34), ('35-59', 35, 59), ('60-79', 60, 79), ('80+', 80, 200)]
bs = mort['causes_by_age']['by_sex_2021']
cw = {}
for sx, key in (('M', 'male'), ('F', 'female')):
    rows = []
    for b, lo, hi in BANDS:
        src = bs[key][b]
        w = {g: round(sum(src.get(k, 0) for k in ks), 2) for g, ks in MAP.items()}
        w = {g: v for g, v in w.items() if v > 0}
        rows.append([lo, hi, w])
    cw[sx] = rows
out['CAUSE_REAL'] = cw
out['CAUSE_SRC'] = 'WHO Global Health Estimates 2021, China, deaths by cause, age and sex'

# ---- 各省经济与房价：《中国统计年鉴2025》（2024年数据） ----
econ = R('province_econ_housing.json')
prov = {}
for pid, v in econ['provinces'].items():
    di, co, hn = v['disp_inc'], v['consumption'], v['house_new_avg']
    r = {'inc': di['total'], 'incU': di['urban'], 'incR': di['rural'],
         'cons': co['total'], 'consU': co['urban'], 'consR': co['rural'], 'hp': hn['residential']}
    cp = v.get('capital_price') or {}
    if cp.get('new'): r['hpCap'] = cp['new']
    if cp.get('disp_inc_urban'): r['incCap'] = cp['disp_inc_urban'] if not isinstance(cp['disp_inc_urban'], dict) else cp['disp_inc_urban'].get('value')
    cty = v.get('county_price')
    if isinstance(cty, dict):
        lo, hi = cty.get('low'), cty.get('high')
        val = cty.get('value') or (lo and hi and (lo + hi) / 2)
        # 县城数据是二手挂牌价，新房一般高 0–30%，取 +10%
        if val: r['hpCounty'] = round(val * 1.1)
    bp = v.get('bride_price')
    if isinstance(bp, dict):
        lo, hi, avg = bp.get('low'), bp.get('high'), bp.get('avg')
        if lo is not None and hi:
            r['bride'] = [lo, hi]
        elif avg:
            r['bride'] = [round(avg * 0.7), round(avg * 1.3)]
        elif hi:
            r['bride'] = [round(hi * 0.4), hi]
    prov[pid] = r
# ---- 各省人口与健康：统计年鉴2025（2024年出生、城镇化）、2020年人口普查（分性别预期寿命、民族） ----
pop = R('province_pop_health.json')
for pid, v in pop['provinces'].items():
    r = prov.setdefault(pid, {})
    r['b'] = round(v['births_2024']['value'] / 1e4, 2)
    r['u'] = v['urban_pct_2024']['value']
    le = v['le_2020']
    r['le'] = le['total']; r['leF'] = le['female']
    # 江西年鉴印刷的男性值（78.08）高于合计，疑为排印错误：用 2×合计−女性 估算
    r['leM'] = le['male'] if le['male'] < le['total'] else round(2 * le['total'] - le['female'], 2)
    g = v['minorities'].get('groups', []) if isinstance(v['minorities'], dict) else []
    r['eth'] = [[x['name'], round(x['share'], 4)] for x in g if x['share'] >= 0.01][:5]
nat = pop['national']
out['NATION_REAL'] = {
    'births': nat['births_2025']['value'], 'deaths': nat['deaths_2025']['value'], 'year': 2025,
    'srb': nat['sex_ratio_at_birth']['latest']['value'],
    'order': [nat['birth_order']['nhc_2022']['first'], nat['birth_order']['nhc_2022']['second'], nat['birth_order']['nhc_2022']['third_plus']],
}
# ---- 统计年鉴 24-26 / 24-27：各省养老金人均水平（基金支出 ÷ 领取人数，2024） ----
NAME2ID = {}
for pid, v in pop['provinces'].items(): NAME2ID[v['name']] = pid
if os.path.exists(os.path.join(ROOT, 'research', 'yearbook_A.json')):
    ya = R('yearbook_A.json')
    for nm, x in ya['t24_26'].get('avg_benefit_per_retiree', {}).items():
        if nm in NAME2ID: prov.setdefault(NAME2ID[nm], {})['penE'] = x
    for nm, x in ya['t24_27'].get('avg_benefit_per_recipient', {}).items():
        if nm in NAME2ID: prov.setdefault(NAME2ID[nm], {})['penR'] = x
# ---- 统计年鉴 2-12 / 2-13 / 6-7 / 6-12 / 24-6 / 8-25 ----
if os.path.exists(os.path.join(ROOT, 'research', 'yearbook_B.json')):
    yb = R('yearbook_B.json')
    for pid, v in pop['provinces'].items():
        pe = v['births_2024'].get('pop_end_2024_wan')
        if pe: prov.setdefault(pid, {})['pop'] = pe
    m = yb['t2_12']['rows']; nat = m['全国']; natDiv = nat[9] / nat[6]
    e = yb['t2_13']['rows']
    t = yb['t24_6']['rows']; natPop = sum(prov[p].get('pop', 0) for p in prov); natTraf = t['全国'][1] / natPop
    dz = yb['t8_25']['rows']; natDz = dz['全国'][6] / natPop
    for nm, pid in NAME2ID.items():
        r = prov.setdefault(pid, {}); pp = r.get('pop')
        if nm in m and m[nm][6]: r['divK'] = round(m[nm][9] / m[nm][6] / natDiv, 2)          # 离婚 ÷ 有配偶，相对全国
        if nm in e and e[nm][0]: r['eduHi'] = round((e[nm][15] + e[nm][18] + e[nm][21]) / e[nm][0], 3)  # 6 岁以上大专及以上占比
        if nm in t and pp: r['trafK'] = round(t[nm][1] / pp / natTraf, 2)                    # 交通事故死亡率，相对全国
        if nm in dz and pp:
            row = dz[nm]
            r['dzK'] = round((row[6] or 0) / pp / natDz, 2)                                     # 受灾人口（人次）÷ 人口，相对全国
            w = {'drought': row[1] or 0, 'flood': row[2] or 0, 'typhoon': row[3] or 0, 'hail': row[4] or 0, 'cold': row[5] or 0}
            tot = sum(w.values())
            if tot > 0: r['dzW'] = {k: round(v / tot, 3) for k, v in w.items() if v > 0}
    q7, q12 = yb['t6_7']['rows'], yb['t6_12']['rows']
    out['QUINT'] = {'urban': [v[-1] for v in q7.values()][:5], 'rural': [v[-1] for v in q12.values()][:5], 'year': 2024}
    out['EDU_NAT'] = round((e['全国'][15] + e['全国'][18] + e['全国'][21]) / e['全国'][0], 3)
out['PROV_REAL'] = prov
big = {}
CITY_P = {'北京': 'BJ', '上海': 'SH', '深圳': 'GD', '广州': 'GD', '杭州': 'ZJ', '成都': 'SC'}
for c, v in econ['big_cities'].items():
    e = {'p': CITY_P[c], 'hp': v['new']['value']}
    di = v.get('disp_inc_urban')
    if isinstance(di, dict): di = di.get('value')
    if di: e['inc'] = di
    else: e['inc'] = round(prov[CITY_P[c]]['incU'] * 1.1)  # 没找到城市数据：用全省城镇 × 1.1
    big[c] = e
out['BIG_REAL'] = big

# ---- 高考：2026 年各省分数线（中新网汇总各省考试院）；985 录取率的省际差异（国金证券估算，约 2020 年） ----
gk = R('gaokao.json')
lines = {}
for pid, v in gk['lines_2026'].items():
    L = v.get('physics') or v.get('all') or {}
    if not L.get('benke'): continue
    T = v.get('total', 750)
    lines[pid] = {'total': T, 'special': L.get('special') or round(L['benke'] * 1.2),
                  'benke': L['benke'], 'zhuanke': L.get('zhuanke') or round(180 * T / 750)}
out['GK_LINES'] = lines
EK = {'TJ': 5.9, 'SH': 5.3, 'BJ': 4.3, 'JL': 3.1, 'QH': 3.1, 'AH': 1.1, 'HA': 1.1}
for row in gk['tiers'].get('share_by_province', []):
    if row.get('province') == 'GD' and row.get('985_pct'): EK['GD'] = row['985_pct']
out['GK_EK'] = {k: round(v / 1.62, 2) for k, v in EK.items()}  # 相对全国平均 1.62%

# ---- 地级市：常住人口、城乡收入、房价（约 90 个城市；research/cities_*.json） ----
city = {}
for f in ('cities_A.json', 'cities_B.json', 'cities_C.json'):
    if not os.path.exists(os.path.join(ROOT, 'research', f)): continue
    for name, v in R(f).get('cities', {}).items():
        val = lambda k: (v.get(k) or {}).get('value') if isinstance(v.get(k), dict) else None
        e = {'p': v.get('prov'), 'type': v.get('type')}
        if val('pop_wan'): e['pop'] = val('pop_wan')
        if val('inc_urban'): e['incU'] = val('inc_urban')
        if val('inc_rural'): e['incR'] = val('inc_rural')
        if val('house_price'): e['hp'] = val('house_price')
        if e['p']: city[name] = e
# 房价口径：优先用政府数据（统计公报 销售额÷销售面积 的新房均价；省会用统计年鉴 35 个大中城市新建住宅均价），没有时用安居客二手挂牌价
gov = R('city_prices_gov.json').get('cities', {}) if os.path.exists(os.path.join(ROOT, 'research', 'city_prices_gov.json')) else {}
for name, e in city.items():
    g = gov.get(name) or {}
    if g.get('price'):
        e['hpNew'] = g['price']
    elif e.get('type') in ('capital', 'municipality') or name in ('北京', '上海', '天津', '重庆'):
        cap = (econ['provinces'].get(e['p']) or {}).get('capital_price') or {}
        if cap.get('city') == name and cap.get('new'): e['hpNew'] = cap['new']
out['CITY'] = city
for pid, v in pop['provinces'].items():
    pe = v['births_2024'].get('pop_end_2024_wan')
    if pe: prov.setdefault(pid, {})['pop'] = pe

ts = '// 由 tools/build_real.py 根据 research/*.json 生成，请勿手改。\n// 覆盖到 src/engine/data.ts 的估计值上（见 data.ts 末尾）。\n'
for k, v in out.items():
    ts += f'export const {k}: any = {json.dumps(v, ensure_ascii=False)};\n'
dst = os.path.join(ROOT, 'src', 'engine', 'real.generated.ts')
os.makedirs(os.path.dirname(dst), exist_ok=True)
open(dst, 'w', encoding='utf-8').write(ts)
print('wrote src/engine/real.generated.ts', {k: (len(v) if isinstance(v, (list, dict)) else v) for k, v in out.items()})
