import {
  emptyState,
  dayKey,
  dayStart,
  addDays,
  DAY,
  HOUR,
  aggregate,
  hourly,
  parseImport,
  mergeEvents,
  sessionsFrom,
  studyOverlap,
  exportCSV,
  validateState,
             
           
             
               
} from './core.js';
import { openStore, saveStore } from './storage.js';
const $ =                                  (q        ) =>
  document.querySelector(q)     ;
const esc = (s         ) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ] ,
  );
const fmt = (ms        ) => {
  const m = Math.floor(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}時間${m % 60}分` : `${m}分`;
};
const exact = (ms        ) => `${fmt(ms)}${Math.floor(ms / 1000) % 60}秒`;
const clock = (ms        ) =>
  new Date(ms).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
const paths                         = {
  home: 'M3 11 12 3l9 8v9a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',
  analysis: 'M4 20V10m8 10V4m8 16v-7',
  apps: 'M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z',
  limits: 'M12 3 3 7v6c0 5 9 9 9 9s9-4 9-9V7ZM8 12l3 3 5-6',
  study: 'M12 4c-4-3-9-1-9-1v16s5-2 9 1c4-3 9-1 9-1V3s-5-2-9 1Zm0 0v16',
  history: 'M3 11a9 9 0 1 1 2 7M3 4v7h7m2-4v6l4 2',
  settings: 'M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-6 0v6',
  guide: 'M4 3h13l3 3v15H4Zm4 5h8m-8 4h8m-8 4h5',
  more: 'M5 12h1m5 0h1m5 0h1',
  upload: 'M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6',
  leaf: 'M19 3C5 2 2 8 6 15c7 6 15 0 13-12ZM5 21 16 8',
};
const icon = (name        ) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.home}"/></svg>`;
const names                         = {
  home: 'ホーム',
  analysis: '分析',
  apps: 'アプリ管理',
  limits: '制限管理',
  study: '勉強モード',
  history: '履歴',
  settings: '設定',
  guide: '初期設定ガイド',
  more: 'その他',
};
let state        ,
  view = 'home',
  period = '7',
  rangeFrom = addDays(dayKey(), -6),
  rangeTo = dayKey(),
  editId = '',
  historyFilter = '',
  historyQuery = '',
  historyLimit = 60,
  busy = false;
let pending                                           = null,
  sw                                       ;
const uid = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (x) =>
    x.toString(16).padStart(2, '0'),
  ).join('');
const appName = (id        ) => state.apps.find((a) => a.id === id)?.name || id;
const activeApps = () => state.apps.filter((a) => !a.archived);
const options = (selected = '', all = false) =>
  state.apps
    .filter((a) => all || !a.archived)
    .map(
      (a) =>
        `<option value="${esc(a.id)}" ${selected === a.id ? 'selected' : ''}>${esc(a.name)}${a.archived ? '（非表示）' : ''}</option>`,
    )
    .join('');
const nav = (items          ) =>
  items
    .map(
      (k) =>
        `<button data-view="${k}" class="${view === k || (k === 'more' && ['limits', 'history', 'settings', 'guide', 'more'].includes(view)) ? 'active' : ''}" ${view === k ? 'aria-current="page"' : ''}>${icon(k)}<span>${names[k]}</span></button>`,
    )
    .join('');
const field = (
  label        ,
  name        ,
  value                 ,
  type = 'text',
  extra = '',
) =>
  `<label class="field">${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
const notice = (t        , w = false) =>
  `<div class="notice ${w ? 'warn' : ''}">${t}</div>`;
const empty = (text = '記録を取り込むと、ここに表示されます。') =>
  `<div class="empty">${icon('leaf')}<h3>まだ記録がありません</h3><p>${text}</p><button data-view="settings">記録を読み込む</button></div>`;
function toast(s        ) {
  $('#toast').textContent = s;
  $('#toast').classList.add('show');
  setTimeout(() => $('#toast').classList.remove('show'), 5500);
}
function dialog(html        ) {
  $('#dialog-content').innerHTML = html;
  $('#dialog-close').textContent = '閉じる';
  $('#dialog').scrollTop = 0;
  $                   ('#dialog').showModal();
}
function chart(
  title        ,
  labels          ,
  values                   ,
  sub = '棒をタップして詳細を確認',
) {
  if (values.length > 31) {
    const size = Math.ceil(values.length / 31),
      groupLabels           = [],
      groupValues                    = [];
    for (let i = 0; i < values.length; i += size) {
      const known = values
        .slice(i, i + size)
        .filter((v)              => v !== null);
      groupLabels.push(
        labels[i] + '〜' + labels[Math.min(i + size - 1, labels.length - 1)],
      );
      groupValues.push(known.length ? known.reduce((a, b) => a + b, 0) : null);
    }
    labels = groupLabels;
    values = groupValues;
    sub = size + '日単位の合計。時間未確定の日も除外。棒をタップして期間を確認';
  }
  const max = Math.max(...values.map((v) => v || 0), 60000);
  return `<section class="card"><div class="card-head"><h2>${title}</h2><small>時間</small></div><div class="bars" aria-label="${title}">${values.map((v, i) => `<button class="bar-cell" data-detail="${esc(labels[i])}：${v === null ? '未記録' : exact(v)}" aria-label="${esc(labels[i])} ${v === null ? '未記録' : exact(v)}"><span class="bar" style="height:${v === null ? 0 : Math.max(2, (v / max) * 115)}px;${v === null ? 'background:var(--line)' : ''}"></span><small>${labels.length > 15 ? (i % 5 === 0 ? esc(labels[i].split('〜')[0]) : '') : esc(labels[i])}</small></button>`).join('')}</div><p class="bar-detail">${sub}</p></section>`;
}
function ranking(byApp                        , title = 'よく使ったアプリ') {
  const entries = Object.entries(byApp).sort((a, b) => b[1] - a[1]);
  return `<section class="card"><div class="card-head"><h2>${title}</h2><button class="link-button" data-view="apps">アプリ管理 →</button></div>${entries.length ? entries.map(([id, n]) => `<button class="rank-button" data-detail="${esc(appName(id))}：${exact(n)}"><div class="rank-label"><span>${esc(appName(id))}</span><strong>${fmt(n)}</strong></div><div class="progress"><i style="width:${(n / Math.max(1, entries[0][1])) * 100}%"></i></div></button>`).join('') + `<p class="bar-detail">タップで秒単位の値を表示</p>` : empty()}</section>`;
}
function startWeek(d        ) {
  const weekday = new Date(dayStart(d) + 9 * HOUR).getUTCDay();
  return addDays(d, -((weekday + 6) % 7));
}
function comparison(a        , b        ) {
  return b === 0
    ? a === 0
      ? '増減なし'
      : '比較基準が0分です'
    : `${Math.abs(Math.round(((a - b) / b) * 100))}% ${a > b ? '増加' : a < b ? '減少' : '変化なし'}`;
}
function home() {
  const today = dayKey(),
    yesterday = addDays(today, -1),
    a = aggregate(state, today, today),
    y = aggregate(state, yesterday, yesterday),
    w = aggregate(state, startWeek(today), today),
    seven = aggregate(state, addDays(today, -6), today),
    used = a.total,
    goal = state.settings.goal * 60000,
    pct = Math.round((used / goal) * 100),
    issues = a.days[0].issues;
  const launches                         = Object.create(null);
  for (const e of state.events)
    if (e.type === 'open' && dayKey(e.at) === today)
      launches[e.appId] = (launches[e.appId] || 0) + 1;
  const top = Object.entries(launches).sort((a, b) => b[1] - a[1])[0];
  return `<div class="page-head"><div><h1>じぶんの時間を、<br>取り戻す。</h1><p>今日の小さな気づきを、明日のゆとりに。</p></div><button class="icon-button" data-view="settings" aria-label="記録を読み込む">${icon('upload')}</button></div>
<section class="card hero"><div><div class="eyebrow">TODAY</div><p class="muted">今日の記録済み使用時間</p><div class="value">${a.knownDays ? fmt(used) : issues ? '時間未確定' : '未記録'}</div><span class="pill ${used <= goal ? 'green' : ''}">${a.knownDays && y.knownDays ? '昨日比 ' + comparison(used, y.total) : '比較する記録を待っています'}</span></div><div class="ring" style="--angle:${Math.min(360, pct * 3.6)}deg"><div><strong>${a.knownDays ? pct + '%' : '—'}</strong><small>目標枠の使用率</small></div></div></section>
<div class="stats"><div class="stat"><small>目標まで残り</small><strong>${a.knownDays ? fmt(Math.max(0, goal - used)) : '—'}</strong><small>1日 ${state.settings.goal}分</small></div><div class="stat"><small>今週の合計</small><strong>${w.knownDays ? fmt(w.total) : '—'}</strong><small>${w.knownDays}日分の記録</small></div><div class="stat"><small>直近7日の平均</small><strong>${seven.average === null ? '—' : fmt(seven.average)}</strong><small>集計可能な記録日のみ</small></div></div>
${!state.apps.length ? notice('はじめにアプリを登録して、記録方法を設定しましょう。 <button class="link-button" data-view="guide">初期設定をはじめる →</button>') : ''}
${issues ? notice(`今日の要確認記録 ${issues}件は時間に含めていません。<button class="link-button" data-view="history">履歴を確認 →</button>`, true) : ''}
${used > goal ? notice('本日の記録済み時間が目標を超えました。次のひと区切りで休憩を。iOSの制限状況は設定アプリで確認してください。', true) : ''}
<div class="grid">${chart(
    'この7日間',
    seven.days.map((d) => d.day.slice(5).replace('-', '/')),
    seven.days.map((d) => (d.known ? d.total : null)),
  )}${ranking(a.byApp)}</div>
<section class="card" style="margin-top:18px"><div class="card-head"><h2>今日の記録について</h2><span class="pill">端末内に保存</span></div><div class="row"><span class="grow muted">推定 / 手動転記</span><strong>${fmt(a.days[0].estimated)} / ${fmt(a.days[0].manual)}</strong></div><div class="row"><span class="grow muted">起動イベント数</span><strong>${a.days[0].launches}回</strong></div><div class="row"><span class="grow muted">起動が多いアプリ</span><strong>${top ? esc(appName(top[0])) + ' · ' + top[1] + '回' : '—'}</strong></div><p class="footer-note">最終取り込み：${state.lastImport ? clock(Date.parse(state.lastImport)) : 'まだありません'}<br>最新のファイルを取り込むまで数値は更新されません。<br>登録・記録したアプリのみ。iPhone全体の使用時間ではありません。</p></section>`;
}
function analysis() {
  const a = aggregate(state, rangeFrom, rangeTo),
    today = dayKey(),
    month = today.slice(0, 7) + '-01',
    m = aggregate(state, month, today),
    cats                         = Object.create(null);
  for (const [id, n] of Object.entries(a.byApp)) {
    const c = state.apps.find((x) => x.id === id)?.category || '未分類';
    cats[c] = (cats[c] || 0) + n;
  }
  const len = a.days.length,
    prev = aggregate(state, addDays(rangeFrom, -len), addDays(rangeFrom, -1)),
    paired = a.sessions.filter(
      (s) =>
        s.status === 'paired' &&
        s.start >= dayStart(rangeFrom) &&
        s.start < dayStart(addDays(rangeTo, 1)),
    ),
    avgSession = paired.length
      ? paired.reduce((n, s) => n + s.end  - s.start, 0) / paired.length
      : null;
  const week = a.days.filter(
      (d) =>
        d.known &&
        ![0, 6].includes(new Date(dayStart(d.day) + 9 * HOUR).getUTCDay()),
    ),
    weekend = a.days.filter(
      (d) =>
        d.known &&
        [0, 6].includes(new Date(dayStart(d.day) + 9 * HOUR).getUTCDay()),
    );
  const mean = (d               ) =>
    d.length ? fmt(d.reduce((n, x) => n + x.total, 0) / d.length) : '—';
  const longest = [...a.days]
    .filter((d) => d.known)
    .sort((a, b) => b.total - a.total)[0];
  const thisWeek = aggregate(state, startWeek(today), today),
    lastWeek = aggregate(
      state,
      addDays(startWeek(today), -7),
      addDays(startWeek(today), -1),
    ),
    lastMonthEnd = addDays(month, -1),
    lastMonth = aggregate(
      state,
      lastMonthEnd.slice(0, 7) + '-01',
      lastMonthEnd,
    );
  const periodOptions = [
    ['today', '今日'],
    ['yesterday', '昨日'],
    ['7', '直近7日'],
    ['week', '今週'],
    ['lastweek', '先週'],
    ['month', '今月'],
    ['lastmonth', '先月'],
    ['custom', '指定'],
  ];
  return `<div class="page-head"><div><h1>時間を、見つめる。</h1><p>比較できる記録から、自分のペースを知る。</p></div></div><div class="segmented">${periodOptions.map(([k, t]) => `<button data-period="${k}" class="${period === k ? 'active' : ''}">${t}</button>`).join('')}</div><form id="range-form" class="form-grid">${field('開始日（日本時間）', 'from', rangeFrom, 'date', 'required')}${field('終了日', 'to', rangeTo, 'date', 'required')}<button type="submit">この期間を表示</button></form>
<div class="stats"><div class="stat"><small>期間合計</small><strong>${a.knownDays ? fmt(a.total) : '—'}</strong><small>${a.knownDays}/${len}日に記録あり</small></div><div class="stat"><small>記録日平均</small><strong>${a.average === null ? '—' : fmt(a.average)}</strong><small>時間未確定の日も除外</small></div><div class="stat"><small>直前の同日数比</small><strong>${a.knownDays && prev.knownDays ? comparison(a.total, prev.total) : '—'}</strong><small>記録日数 ${a.knownDays} 対 ${prev.knownDays}</small></div></div>
${notice('表示値は推定＋手動転記。未記録日はゼロではありません。記録量が異なる期間の比較は、利用の増減を直接表しません。')}
<div class="grid">${chart('週の比較', ['先週', '今週'], [lastWeek.knownDays ? lastWeek.total : null, thisWeek.knownDays ? thisWeek.total : null], '今週は今日まで。記録日数 ' + lastWeek.knownDays + ' / ' + thisWeek.knownDays)}${chart('月の比較', ['先月', '今月'], [lastMonth.knownDays ? lastMonth.total : null, m.knownDays ? m.total : null], '今月は今日まで。記録日数 ' + lastMonth.knownDays + ' / ' + m.knownDays)}</div><div style="height:18px"></div>${chart(
    '選択期間の推移',
    a.days.map((d) => d.day.slice(5).replace('-', '/')),
    a.days.map((d) => (d.known ? d.total : null)),
  )}
<div class="grid">${chart(
    '時間帯別 · ' + rangeTo.slice(5),
    Array.from({ length: 24 }, (_, i) => i + '時'),
    hourly(state, rangeTo),
    '終了日のペア推定のみ。手動転記に置き換えたアプリは除外。',
  )}${chart(
    '今月の推移',
    m.days.map((d) => d.day.slice(8)),
    m.days.map((d) => (d.known ? d.total : null)),
  )}</div><div style="height:18px"></div>
<div class="grid">${ranking(a.byApp, '期間内のアプリランキング')}<section class="card"><div class="card-head"><h2>カテゴリ別の割合</h2></div>${
    Object.keys(cats).length
      ? Object.entries(cats)
          .sort((a, b) => b[1] - a[1])
          .map(
            ([c, n]) =>
              `<button class="rank-button" data-detail="${esc(c)}：${exact(n)}"><div class="rank-label"><span>${esc(c)}</span><strong>${a.total ? Math.round((n / a.total) * 100) : 0}%</strong></div><div class="progress"><i style="width:${a.total ? (n / a.total) * 100 : 0}%"></i></div></button>`,
          )
          .join('') + '<p class="bar-detail">タップして内訳を確認</p>'
      : empty()
  }</section></div>
<section class="card" style="margin-top:18px"><h2>記録からわかること</h2><div class="row"><span class="grow">平日 / 土日の日平均</span><strong>${mean(week)} / ${mean(weekend)}</strong></div><small>祝日は判定しません。平日${week.length}日・土日${weekend.length}日分。</small><div class="row"><span class="grow">1回の平均（推定ペア）</span><strong>${avgSession === null ? '—' : fmt(avgSession)}</strong></div><div class="row"><span class="grow">記録済み合計が目標内の日</span><strong>${a.days.filter((d) => d.known && !d.issues && d.total <= state.settings.goal * 60000).length} / ${a.knownDays}日</strong></div><small>要確認ありの日を除外。未取得時間があるため、実際の達成を保証しません。</small><div class="row"><span class="grow">最も長い記録日</span><strong>${longest ? longest.day.slice(5) + ' · ' + fmt(longest.total) : '—'}</strong></div><h3 style="margin-top:22px">アプリ別・直前期間との差</h3>${
    Object.entries(a.byApp)
      .map(
        ([id, n]) =>
          `<div class="row"><span class="grow">${esc(appName(id))}</span><small>${comparison(n, prev.byApp[id] || 0)}</small></div>`,
      )
      .join('') || '<p class="muted">記録がありません。</p>'
  }</section>`;
}
function appEditor() {
  const edit = state.apps.find((a) => a.id === editId);
  return `<section class="card"><h2>${edit ? 'アプリを編集' : '記録するアプリを追加'}</h2><form id="app-form">${field('表示名', 'name', edit?.name || '', 'text', 'required maxlength="80" placeholder="アプリの名前"')}${field('記録ID（ショートカットでも同じ値を使用）', 'id', edit?.id || '', 'text', `required maxlength="80" placeholder="video_app" ${edit ? 'readonly' : ''}`)}<div class="form-grid">${field('カテゴリ', 'category', edit?.category || '未分類', 'text', 'required maxlength="80" list="categories"')}${field('1日の目標（分）', 'goal', edit?.goal || 60, 'number', 'min="1" max="1440" required')}</div><datalist id="categories"><option>SNS</option><option>動画</option><option>ゲーム</option><option>学習</option><option>仕事</option><option>その他</option></datalist><label class="check"><input type="checkbox" name="avoid" ${edit?.avoid ? 'checked' : ''}>勉強中に避けたいアプリ</label><div class="actions"><button class="primary">${edit ? '変更を保存' : '追加する'}</button>${edit ? '<button type="button" data-action="cancel-edit">キャンセル</button>' : ''}</div></form></section>`;
}
function apps() {
  const today = aggregate(state, dayKey(), dayKey());
  return `<div class="page-head"><div><h1>アプリと目標</h1><p>必要なアプリだけ、あなたのペースで。</p></div></div>${appEditor()}<section class="card"><h2>登録したアプリ · ${state.apps.length}</h2>${
    state.apps
      .map((a) => {
        const last = [...state.events].reverse().find((e) => e.appId === a.id),
          n = today.byApp[a.id] || 0;
        return `<div class="row"><div class="avatar">${esc(a.name.slice(0, 1))}</div><div class="grow"><strong>${esc(a.name)} ${a.archived ? '<span class="pill">非表示</span>' : ''}</strong><small>${esc(a.category)} · 目標 ${a.goal}分 · 今日 ${fmt(n)}</small><small>最終イベント ${last ? clock(Date.parse(last.at)) : 'なし'}</small><code>${esc(a.id)}</code><br><button class="link-button" data-shortcut="${esc(a.id)}">このアプリの記録設定 →</button></div><button class="link-button" data-edit="${esc(a.id)}">編集</button><button class="link-button" data-archive="${esc(a.id)}">${a.archived ? '戻す' : '非表示'}</button></div>`;
      })
      .join('') || empty('上のフォームで、最初のアプリを追加しましょう。')
  }</section>${notice('非表示にしても過去の記録は残ります。記録を止めるには、そのアプリのオートメーションもオフにしてください。完全削除は履歴・設定から行えます。')}`;
}
function limits() {
  const a = aggregate(state, dayKey(), dayKey());
  return `<div class="page-head"><div><h1>使いすぎに、ひと区切り。</h1><p>目標の管理と、iPhoneの制限を組み合わせる。</p></div></div>${notice('この画面の目標はiOSの設定に同期されません。アプリを実際にブロックするには、iPhoneの「設定」で操作します。', true)}<section class="card"><div class="card-head"><h2>アプリごとの目標</h2><button class="link-button" data-view="apps">編集 →</button></div>${
    activeApps()
      .map((x) => {
        const n = a.byApp[x.id] || 0;
        return `<div class="row"><div class="grow"><strong>${esc(x.name)}</strong><div class="progress"><i style="width:${Math.min(100, (n / (x.goal * 60000)) * 100)}%"></i></div><small>記録済み ${fmt(n)} / 目標 ${x.goal}分</small></div><span class="pill ${n <= x.goal * 60000 ? 'green' : ''}">${n > x.goal * 60000 ? '目標超過' : `残り${Math.max(0, Math.floor(x.goal - n / 60000))}分`}</span></div>`;
      })
      .join('') || empty('アプリ管理で目標を設定してください。')
  }</section><section class="card"><h2>3つの方法を使い分ける</h2><details open><summary>① iOS標準の制限 · 実際のブロック</summary><p>iOS 27の新しい画面では「許容時間」「スクリーンタイムのスケジュール」を使います。</p><ol><li>「設定」→「スクリーンタイム」→「許容時間」でカテゴリと時間を設定。</li><li>「スクリーンタイムのスケジュール」→「スケジュール」をオン→曜日と時間枠を設定。</li><li>時間枠ごとに許可するカテゴリを選択。「常に許可」も確認します。</li></ol><p>以下は「App使用時間の制限」「休止時間」が表示される従来の画面向けです。</p><ol><li>「設定」→「スクリーンタイム」を開く。</li><li>「アプリとWebサイトのアクティビティ」を有効にする。</li><li>「App使用時間の制限」→「制限を追加」。アプリを1つ選び、時間を設定。</li><li>パスコードを設定し、表示される場合は「使用制限終了時にブロック」をオン。</li><li>夜の制限は「休止時間」で開始・終了を指定し、「休止時間中にブロック」を確認。</li></ol><p>自分がパスコードを知っていると解除できます。OS・管理状態により表示が異なります。</p></details><details><summary>② ショートカット · 簡易的な抑止</summary><p>アプリ起動時の通知などで立ち止まるきっかけを作れます。オートメーションの無効化や通知の無視が可能です。本アプリは独自のブロック機能として実装していません。</p></details><details><summary>③ Cocoa Time · 目標と警告</summary><p>取り込んだ記録に対する進捗表示です。iPhone全体を監視せず、バックグラウンドで他のアプリを止めたり警告を送ったりしません。</p></details><details><summary>集中モードを併用する</summary><p>「設定」→「集中モード」で勉強用を作成。コントロールセンターからオンにします。通知を抑える機能で、アプリ起動そのものの禁止ではありません。勉強開始ボタンは集中モードを変更しません。</p></details><button data-doc="SCREEN_TIME_SETUP.md" style="margin-top:18px">詳しい設定手順を読む</button></section>`;
}
function study() {
  const running = state.studies.find((s) => !s.end),
    sessions = sessionsFrom(state.events, state.settings.maxSession);
  return `<div class="page-head"><div><h1>いまは、集中する時間。</h1><p>取り組む時間を記録して、あとで振り返る。</p></div></div><section class="card focus-card">${icon('study')}<div class="timer" id="timer">${running ? timerText(Date.now() - Date.parse(running.start)) : '00:00:00'}</div><p>${running ? '勉強時間を記録中 · 画面を閉じても開始時刻は保存されます' : '準備ができたら、はじめましょう。'}</p><div class="actions"><button class="primary" data-action="${running ? 'stop-study' : 'start-study'}">${running ? '勉強を終了する' : '勉強をはじめる'}</button></div><p style="margin-top:18px">iOSの集中モード・休止時間は別途オンにしてください。</p></section><section class="card"><h2>勉強中に避けたいアプリ</h2><div class="legend" style="margin-top:16px">${(running ? state.apps.filter((a) => running.avoid.includes(a.id)) : activeApps().filter((a) => a.avoid)).map((a) => `<span>${esc(a.name)}</span>`).join('') || '<small>アプリ管理で選択できます。</small>'}</div><button class="link-button" data-view="apps">対象を変更 →</button><small>対象は開始時に保存され、その回の履歴に使われます。</small></section><section class="card"><h2>勉強の記録</h2>${
    [...state.studies]
      .reverse()
      .slice(0, 60)
      .map((s) => {
        const overlap = studyOverlap(s, sessions),
          ms = overlap.reduce((n, x) => n + x.ms, 0),
          duration =
            (s.end ? Date.parse(s.end) : Date.now()) - Date.parse(s.start);
        return `<div class="history-item"><strong>${clock(Date.parse(s.start))} · ${s.end ? fmt(duration) : '記録中'}</strong><p>避けたいアプリの推定利用 ${fmt(ms)} / 勉強の経過時間 ${fmt(duration)}</p>${overlap.map((x) => `<p>${esc(appName(x.appId))} · ${clock(x.start)}〜${clock(x.end)} · ${fmt(x.ms)}</p>`).join('') || '<small>重なったペア推定はありません。未記録の場合もあります。</small>'}<div class="actions"><button class="link-button" data-study-edit="${esc(s.id)}">時刻を修正</button><button class="link-button danger" data-study-delete="${esc(s.id)}">削除</button></div></div>`;
      })
      .join('') ||
    '<div class="empty"><p>ここに勉強の履歴がたまっていきます。</p></div>'
  }</section>${notice('勉強時間は開始〜終了の経過時間です。終了忘れは修正してください。アプリ利用との重なりは取り込み済みのペア推定だけで計算し、手動の日合計からは推測しません。')}`;
}
function timerText(ms        ) {
  const sec = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(sec / 3600), Math.floor(sec / 60) % 60, sec % 60]
    .map((x) => String(x).padStart(2, '0'))
    .join(':');
}
function history() {
  const sessions = sessionsFrom(state.events, state.settings.maxSession),
    filtered = sessions.filter(
      (s) =>
        (!historyFilter || s.status === historyFilter) &&
        appName(s.appId).toLowerCase().includes(historyQuery.toLowerCase()),
    );
  return `<div class="page-head"><div><h1>記録の手帳</h1><p>推定の根拠も、不確かな記録も見えるように。</p></div></div><section class="card"><h2>標準スクリーンタイムから手動転記</h2><form id="manual-form"><label class="field">アプリ<select name="appId" required>${options('', true)}</select></label><div class="form-grid">${field('日本時間の日付', 'day', dayKey(), 'date', `required max="${dayKey()}"`)}${field('その日の合計（分）', 'minutes', '', 'number', 'required min="0" max="1440" step="0.01"')}</div><p class="tiny muted" style="margin-top:12px">同じアプリ・日の推定値をこの合計で置き換えます。手動記録は1件に更新されます。0分も入力できます。</p><button class="primary" style="margin-top:15px">手動記録を保存</button></form></section>
${
  state.manual.length
    ? `<section class="card"><h2>手動転記 · ${state.manual.length}件</h2>${[
        ...state.manual,
      ]
        .sort((a, b) => b.day.localeCompare(a.day))
        .slice(0, 100)
        .map(
          (m) =>
            `<div class="row"><div class="grow"><strong>${esc(appName(m.appId))}</strong><small>${m.day} · ${m.minutes}分</small></div><button class="link-button danger" data-manual-delete="${esc(m.appId)}|${m.day}">削除</button></div>`,
        )
        .join(
          '',
        )}<small>最新100件を表示。全件はJSONバックアップに含まれます。</small></section>`
    : ''
}
<section class="card"><h2>イベントからの履歴</h2><form id="history-filter" class="form-grid">${field('アプリ名で検索', 'query', historyQuery)}<label class="field">記録の状態<select name="status"><option value="">すべて</option value="paired" ${historyFilter === 'paired' ? 'selected' : ''}>ペア推定</option><option value="review" ${historyFilter === 'review' ? 'selected' : ''}>要確認・集計対象外</option></select></label><button>絞り込む</button></form><p class="tiny muted" style="margin:15px 0">${filtered.length}件 · 「ペア推定」も正確な画面使用時間を保証しません。</p>${
    filtered
      .slice(0, historyLimit)
      .map(
        (s) =>
          `<div class="history-item"><div class="rank-label"><strong>${esc(appName(s.appId))}</strong><span class="pill">${s.status === 'paired' ? exact(s.end  - s.start) : '要確認・除外'}</span></div><p>${clock(s.start)} ${s.end !== null ? '→ ' + clock(s.end) : ''}</p><small>${esc(s.reason)}</small>${s.status === 'paired' && state.manual.some((m) => m.appId === s.appId && m.day >= dayKey(s.start) && m.day <= dayKey(s.end )) ? '<p>この期間には手動優先の日があります。</p>' : ''}</div>`,
      )
      .join('') || empty()
  }${filtered.length > historyLimit ? '<button data-action="more-history" style="margin-top:15px">さらに60件を表示</button>' : ''}</section><section class="card"><h2>アプリの完全削除</h2><p class="muted tiny">選択したアプリ・イベント・手動記録を削除します。勉強履歴の対象からも外れます。先にバックアップしてください。</p><form id="purge-form"><label class="field">対象<select name="appId">${options('', true)}</select></label><button class="danger">このアプリと記録を削除</button></form></section>`;
}
function settings() {
  return `<div class="page-head"><div><h1>あなたに合わせる。</h1><p>データも設定も、この端末の中に。</p></div></div><section class="card"><h2>記録ファイルを読み込む</h2><p class="muted tiny" style="margin-top:10px">CSV / JSONに対応。複数ファイルをまとめて選択できます。確定前に件数を確認します。</p><label class="field">「ファイル」から選択<input id="import-files" type="file" accept=".csv,.json,.txt,text/csv,application/json,text/plain" multiple></label><details><summary>テキストを貼り付けて取り込む</summary><form id="paste-form"><label class="field">CSV / JSON<textarea name="text" rows="5" placeholder="appId,type,at"></textarea></label><button>内容を確認</button></form></details><small>最終取り込み ${state.lastImport ? clock(Date.parse(state.lastImport)) : 'なし'} · ${state.events.length}イベント</small><button class="link-button" data-doc="SHORTCUTS_SETUP.md">記録の設定手順 →</button></section><section class="card"><h2>バックアップと復元</h2><p class="tiny muted" style="margin-top:10px">JSONは設定・手動記録・勉強履歴を含む完全バックアップ。CSVは起動・終了イベントのみです。復元は上のファイル選択から。</p><div class="actions"><button data-action="backup">JSONバックアップ</button><button data-action="csv">イベントCSV</button></div><button class="link-button" data-action="persist">保存の永続化をリクエスト</button>${notice('ホーム画面アプリを普段の利用場所に統一してください。Safari側とは保存領域が異なる場合があります。容量不足やサイトデータの削除で記録を失うため、定期的にJSONを保存してください。')}</section><section class="card"><h2>表示と集計</h2><form id="settings-form">${field('1日の合計目標（分）', 'goal', state.settings.goal, 'number', 'required min="1" max="1440"')}${field('連続使用の確認上限（分）', 'maxSession', state.settings.maxSession, 'number', 'required min="1" max="1440"')}<small>上限を超えたペアは全時間を集計から除外し、要確認にします。</small><label class="field">テーマ<select name="theme">${[
    ['auto', '端末に合わせる'],
    ['light', 'ライト'],
    ['dark', 'ダーク'],
  ]
    .map(
      ([v, t]) =>
        `<option value="${v}" ${state.settings.theme === v ? 'selected' : ''}>${t}</option>`,
    )
    .join(
      '',
    )}</select></label><button class="primary">設定を保存</button></form></section><section class="card"><h2>使い方とプライバシー</h2><div class="help-list">${['SETUP.md', 'SHORTCUTS_SETUP.md', 'SCREEN_TIME_SETUP.md', 'LIMITATIONS.md', 'TEST_REPORT.md'].map((d, i) => `<button data-doc="${d}">${['導入・ホーム画面への追加', 'ショートカット設定の完全手順', 'iOS標準の使用制限', 'できること・できないこと', 'テストと未検証事項'][i]} →</button>`).join('')}</div><p class="tiny muted">広告・アクセス解析・外部フォントはありません。履歴をサーバーに送信する機能はありません。Cocoa Time 1.0.1</p><button data-action="update" class="link-button">アプリの更新を確認</button></section><section class="card"><h2>データのリセット</h2><p class="tiny muted">この保存領域の全記録・設定を削除します。書き出したファイルとショートカットは削除しません。</p><button class="danger" data-action="reset" style="margin-top:15px">端末内の全データを削除</button></section>`;
}
function guide() {
  return `<div class="page-head"><div><h1>はじめの4ステップ</h1><p>最初は1つのアプリから、無理なく。</p></div></div><section class="card">${[
    [
      'apps',
      'アプリを登録',
      '名前・記録ID・カテゴリ・目標を決めます。記録IDはショートカットでも使います。',
    ],
    [
      'settings',
      'ショートカットを設定',
      '起動と終了それぞれのオートメーションでCSVを保存。手順書に沿って作成します。',
    ],
    [
      'settings',
      '記録を取り込む',
      '「設定」で保存したCSVを選び、内容を確認して反映。古いファイルを再度選んでも同一イベントは増えません。',
    ],
    [
      'limits',
      'iOSで使用制限を設定',
      '実際のアプリ制限はiPhoneの設定で行います。本アプリの目標とは別設定です。',
    ],
  ]
    .map(
      ([v, t, p], i) =>
        `<div class="step"><b>${i + 1}</b><div><h3>${t}</h3><p>${p}</p><button class="link-button" data-view="${v}">${names[v]}へ →</button></div></div>`,
    )
    .join(
      '',
    )}<button class="primary" data-doc="SHORTCUTS_SETUP.md">ショートカットの完全手順を開く</button></section>${notice('重要：自動なのはショートカット側の記録です。Cocoa Timeへの取り込みは手動です。朝の表示も、最後に取り込んだ時点のデータになります。', true)}<section class="card"><h2>初回の確認リスト</h2><ol class="muted"><li>SafariでHTTPSのアプリURLを開き、ホーム画面に追加。</li><li>ホーム画面から開き直し、そこでアプリを登録。</li><li>対象アプリを1分使い、別のアプリへ切り替える。</li><li>保存された2つのイベントを取り込み、履歴のペアを確認。</li><li>ロック・強制終了・機内モードでも試して、記録の欠落を確認。</li><li>JSONバックアップを保存しておく。</li></ol><button data-doc="SETUP.md">Windowsからの導入手順</button></section>`;
}
function render() {
  document.documentElement.dataset.theme = state.settings.theme;
  const content = (
    {
      home,
      analysis,
      apps,
      limits,
      study,
      history,
      settings,
      guide,
      more: () =>
        `<div class="page-head"><h1>その他</h1></div><div class="menu-grid">${nav(['limits', 'history', 'settings', 'guide'])}</div>`,
    }                                
  )[view]();
  $('#app').innerHTML =
    `<div class="shell"><aside class="sidebar"><div class="brand">Cocoa<span> Time</span></div><small>じぶんの時間を、取り戻す。</small><nav aria-label="メイン">${nav(['home', 'analysis', 'apps', 'limits', 'study', 'history', 'settings', 'guide'])}</nav><footer>PRIVATE BY DESIGN<br>記録は、この端末の中に。</footer></aside><main><div class="topline"><div class="brand mobile-brand">Cocoa<span> Time</span></div><span class="date">${new Date().toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'long', day: 'numeric', weekday: 'short' })} · 日本時間</span><button class="link-button" id="update" data-action="update">${sw?.waiting ? '更新があります' : 'v1.0.1'}</button></div>${content}</main></div><nav class="bottom-nav" aria-label="メイン">${nav(['home', 'analysis', 'study', 'apps', 'more'])}</nav>`;
}
async function commit(next       ) {
  if (busy) throw Error('保存中です。少し待ってから操作してください。');
  busy = true;
  try {
    state = await saveStore(validateState(next), state.revision);
    render();
  } finally {
    busy = false;
  }
}
function changeView(v        ) {
  view = v;
  render();
  window.scrollTo(0, 0);
}
function setPeriod(p        ) {
  period = p;
  const today = dayKey(),
    week = startWeek(today),
    month = today.slice(0, 7) + '-01',
    lastEnd = addDays(month, -1);
  const ranges                           = {
    today: [today, today],
    yesterday: [addDays(today, -1), addDays(today, -1)],
    '7': [addDays(today, -6), today],
    week: [week, today],
    lastweek: [addDays(week, -7), addDays(week, -1)],
    month: [month, today],
    lastmonth: [lastEnd.slice(0, 7) + '-01', lastEnd],
  };
  if (ranges[p]) [rangeFrom, rangeTo] = ranges[p];
  render();
}
async function stage(texts          ) {
  toast('ファイルを確認しています…');
  await new Promise((r) => setTimeout(r, 20));
  const parsed = texts.map(parseImport),
    backups = parsed.filter((p) => p.kind === 'backup');
  let next       , message        ;
  if (backups.length) {
    if (parsed.length !== 1)
      throw Error('完全バックアップは1ファイルだけ選んでください。');
    next = backups[0].state;
    message = `バックアップ復元：アプリ${next.apps.length}個、イベント${next.events.length}件、手動${next.manual.length}件、勉強${next.studies.length}件。現在の記録と設定をすべて置き換えます。`;
  } else {
    const added = parsed.flatMap((p) => (p.kind === 'events' ? p.events : [])),
      merged = mergeEvents(state.events, added);
    next = structuredClone(state);
    next.events = merged.events;
    const ids = new Set(next.apps.map((a) => a.id));
    for (const e of added)
      if (!ids.has(e.appId)) {
        ids.add(e.appId);
        next.apps.push({
          id: e.appId,
          name: e.appId,
          category: '未分類',
          goal: 60,
          avoid: false,
          archived: false,
        });
      }
    next.lastImport = new Date().toISOString();
    message = `${added.length}件を確認。新規${next.events.length - state.events.length}件、同一イベント${merged.duplicates}件をスキップ。未登録IDはアプリとして追加します。`;
  }
  pending = { state: validateState(next), message };
  dialog(
    `<h2>取り込み内容の確認</h2><p>${esc(message)}</p>${notice('不確かなペアは集計対象外になります。イベント時刻で並べ直します。')}<button class="primary" data-action="apply-import">この内容を反映する</button>`,
  );
}
function download(name        , text        , type        ) {
  const blob = new Blob([text], { type }),
    url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  toast(
    'ファイルを保存してください。iPhoneでは共有メニューの「ファイルに保存」も使えます。',
  );
}
function localInput(iso        ) {
  return new Date(Date.parse(iso) + 9 * HOUR).toISOString().slice(0, 19);
}
async function handleClick(e            ) {
  const b = (e.target           ).closest             ('button');
  if (!b) return;
  if (b.id === 'dialog-close') {
    $                   ('#dialog').close();
    pending = null;
    return;
  }
  if (b.dataset.view) {
    changeView(b.dataset.view);
    return;
  }
  if (b.dataset.period) {
    setPeriod(b.dataset.period);
    return;
  }
  if (b.dataset.detail) {
    const p = b.closest('.card')?.querySelector('.bar-detail');
    if (p) p.textContent = b.dataset.detail;
    else toast(b.dataset.detail);
    return;
  }
  if (b.dataset.doc) {
    const r = await fetch('./docs/' + b.dataset.doc);
    if (!r.ok)
      throw Error(
        '手順書を読み込めません。ZIP内の同名ファイルを開いてください。',
      );
    dialog(`<h2>${esc(b.dataset.doc)}</h2><pre>${esc(await r.text())}</pre>`);
    return;
  }
  if (b.dataset.shortcut) {
    const app = state.apps.find(a => a.id === b.dataset.shortcut);
    if (!app) return;
    dialog(`<h2>${esc(app.name)}の記録設定</h2>
      <p>対象アプリはショートカット側で1つずつ選択します。記録IDは <code>${esc(app.id)}</code> です。</p>
      <h3>開始用の「テキスト」</h3><pre>appId,type,at
${esc(app.id)},open,[記録時刻]</pre>
      <h3>終了用の「テキスト」</h3><pre>appId,type,at
${esc(app.id)},close,[記録時刻]</pre>
      <p>[記録時刻] は文字のまま入力せず、「日付をフォーマット」の出力変数を挿入します。</p>
      <h3>日付フォーマット</h3><pre>yyyy-MM-dd'T'HH:mm:ss.SSSXXX</pre>
      <p>開始ファイル名：<code>${esc(app.id)}-open-[ファイル時刻].csv</code><br>終了ファイル名：<code>${esc(app.id)}-close-[ファイル時刻].csv</code></p>
      <p>ファイル時刻の書式は <code>yyyyMMdd-HHmmss-SSS</code>。どちらも同じ固定フォルダへ保存します。</p>
      <button class="primary" data-doc="SHORTCUTS_SETUP.md">操作手順をすべて読む</button>`);
    return;
  }
  if (b.dataset.edit) {
    editId = b.dataset.edit;
    render();
    window.scrollTo(0, 0);
    return;
  }
  if (b.dataset.archive) {
    const next = structuredClone(state),
      a = next.apps.find((a) => a.id === b.dataset.archive) ;
    a.archived = !a.archived;
    await commit(next);
    return;
  }
  if (b.dataset.manualDelete) {
    const [appId, day] = b.dataset.manualDelete.split('|');
    if (
      !confirm('この手動記録を削除しますか？同日の推定値が再び集計されます。')
    )
      return;
    await commit({
      ...state,
      manual: state.manual.filter((m) => m.appId !== appId || m.day !== day),
    });
    return;
  }
  if (b.dataset.studyDelete) {
    if (confirm('この勉強記録を削除しますか？'))
      await commit({
        ...state,
        studies: state.studies.filter((s) => s.id !== b.dataset.studyDelete),
      });
    return;
  }
  if (b.dataset.studyEdit) {
    const s = state.studies.find((s) => s.id === b.dataset.studyEdit) ;
    dialog(
      `<h2>勉強時刻を修正（日本時間）</h2><form id="study-edit-form"><input type="hidden" name="id" value="${esc(s.id)}">${field('開始', 'start', localInput(s.start), 'datetime-local', 'required step="1"')}${field('終了（空欄なら記録中）', 'end', s.end ? localInput(s.end) : '', 'datetime-local', 'step="1"')}<button class="primary">修正を保存</button></form>`,
    );
    return;
  }
  const a = b.dataset.action;
  if (a === 'cancel-edit') {
    editId = '';
    render();
  } else if (a === 'more-history') {
    historyLimit += 60;
    render();
  } else if (a === 'start-study') {
    if (state.studies.some((s) => !s.end)) throw Error('すでに記録中です。');
    await commit({
      ...state,
      studies: [
        ...state.studies,
        {
          id: uid(),
          start: new Date().toISOString(),
          end: null,
          avoid: activeApps()
            .filter((a) => a.avoid)
            .map((a) => a.id),
        },
      ],
    });
  } else if (a === 'stop-study') {
    const next = structuredClone(state),
      s = next.studies.find((s) => !s.end);
    if (s) {
      s.end = new Date().toISOString();
      await commit(next);
    }
  } else if (a === 'apply-import' && pending) {
    await commit(pending.state);
    pending = null;
    $                   ('#dialog').close();
    toast('記録を反映しました。');
  } else if (a === 'backup') {
    download(
      'cocoa-time-backup-' + dayKey() + '.json',
      JSON.stringify(state, null, 2),
      'application/json',
    );
  } else if (a === 'csv') {
    download(
      'cocoa-time-events-' + dayKey() + '.csv',
      '\uFEFF' + exportCSV(state.events),
      'text/csv;charset=utf-8',
    );
  } else if (a === 'persist') {
    const ok = await navigator.storage?.persist?.();
    toast(
      ok
        ? '永続保存が許可されています。バックアップも続けてください。'
        : '永続保存は許可されませんでした。定期的にバックアップしてください。',
    );
  } else if (a === 'reset') {
    if (
      prompt('全データを削除する場合は「削除」と入力してください。') === '削除'
    ) {
      await commit(emptyState());
      view = 'guide';
      render();
      toast('端末内の記録を削除しました。');
    }
  } else if (a === 'update') {
    if (!sw) {
      toast('HTTPSで開き、初回のオンライン読み込みを完了してください。');
      return;
    }
    await sw.update();
    if (sw.waiting) {
      if (
        confirm(
          'バックアップを推奨します。アプリを更新して再読み込みしますか？',
        )
      ) {
        sw.waiting.postMessage('ACTIVATE');
      }
    } else toast('現在、利用できる更新はありません。');
  }
}
async function handleSubmit(e             ) {
  e.preventDefault();
  const form = e.target                   ,
    f = new FormData(form),
    s = (k        ) => String(f.get(k) || '');
  const next = structuredClone(state);
  if (form.getAttribute('id') === 'app-form') {
    const app      = {
      id: s('id'),
      name: s('name'),
      category: s('category'),
      goal: Number(s('goal')),
      avoid: f.has('avoid'),
      archived: next.apps.find((a) => a.id === editId)?.archived || false,
    };
    if (editId) {
      next.apps = next.apps.map((a) => (a.id === editId ? app : a));
    } else {
      if (next.apps.some((a) => a.id === app.id))
        throw Error('その記録IDはすでに使われています。');
      next.apps.push(app);
    }
    await commit(next);
    editId = '';
    render();
    toast('アプリを保存しました。');
  } else if (form.getAttribute('id') === 'manual-form') {
    const appId = s('appId'),
      day = s('day');
    next.manual = next.manual.filter((m) => m.appId !== appId || m.day !== day);
    next.manual.push({ appId, day, minutes: Number(s('minutes')) });
    await commit(next);
    toast('手動記録を保存しました。');
  } else if (form.getAttribute('id') === 'settings-form') {
    next.settings = {
      goal: Number(s('goal')),
      maxSession: Number(s('maxSession')),
      theme: s('theme')                              ,
    };
    await commit(next);
    toast('設定を保存しました。');
  } else if (form.getAttribute('id') === 'range-form') {
    aggregate(state, s('from'), s('to'));
    rangeFrom = s('from');
    rangeTo = s('to');
    period = 'custom';
    render();
  } else if (form.getAttribute('id') === 'history-filter') {
    historyQuery = s('query');
    historyFilter = s('status');
    historyLimit = 60;
    render();
  } else if (form.getAttribute('id') === 'paste-form') await stage([s('text')]);
  else if (form.getAttribute('id') === 'purge-form') {
    const appId = s('appId');
    if (!appId) return;
    if (
      !confirm(
        `${appName(appId)}と全記録を完全削除しますか？先にJSONバックアップを保存してください。`,
      )
    )
      return;
    next.apps = next.apps.filter((a) => a.id !== appId);
    next.events = next.events.filter((e) => e.appId !== appId);
    next.manual = next.manual.filter((m) => m.appId !== appId);
    next.studies = next.studies.map((s) => ({
      ...s,
      avoid: s.avoid.filter((a) => a !== appId),
    }));
    await commit(next);
  } else if (form.getAttribute('id') === 'study-edit-form') {
    const st = next.studies.find((x) => x.id === s('id'));
    if (st) {
      st.start =
        s('start') + (s('start').length === 16 ? ':00' : '') + '+09:00';
      st.end = s('end')
        ? s('end') + (s('end').length === 16 ? ':00' : '') + '+09:00'
        : null;
      await commit(next);
      $                   ('#dialog').close();
    }
  }
}
const error = (e         ) => {
  toast((e         ).message || '処理できませんでした。');
  console.error(e);
};
document.addEventListener('click', (e) => void handleClick(e).catch(error));
document.addEventListener('submit', (e) => void handleSubmit(e).catch(error));
document.addEventListener('change', (e) => {
  const input = e.target                    ;
  if (input.id === 'import-files')
    void (async () => {
      const files = Array.from(input.files || []);
      if (!files.length) return;
      if (
        files.reduce((n, f) => n + f.size, 0) > 20000000 ||
        files.length > 1000
      )
        throw Error('1回に20MB・1000ファイルまでです。');
      await stage(await Promise.all(files.map((f) => f.text())));
    })().catch(error);
});
setInterval(() => {
  if (!state) return;
  const s = state.studies.find((s) => !s.end);
  if (s && $('#timer'))
    $('#timer').textContent = timerText(Date.now() - Date.parse(s.start));
}, 1000);
let loadedDay = dayKey();
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state && loadedDay !== dayKey()) {
    loadedDay = dayKey();
    if (view === 'analysis' && period !== 'custom') setPeriod(period);
    else render();
  }
});
try {
  state = await openStore();
  render();
  if ('serviceWorker' in navigator) {
    let controlled = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (controlled) location.reload();
      controlled = true;
    });
    sw = await navigator.serviceWorker.register('./sw.js');
    if (sw.waiting) $('#update').textContent = '更新があります';
    sw.addEventListener('updatefound', () => {
      const worker = sw?.installing;
      worker?.addEventListener('statechange', () => {
        if (
          worker.state === 'installed' &&
          navigator.serviceWorker.controller
        ) {
          $('#update').textContent = '更新があります';
          toast('アプリの更新を用意しました。設定から適用できます。');
        }
      });
    });
  }
} catch (e) {
  if (!state)
    $('#app').innerHTML =
      `<main class="error card"><h1>保存領域を開けませんでした</h1><p>${esc((e         ).message)}</p><p>通常モードのSafariで開き直してください。既存データは自動削除していません。</p><button data-action="reload" id="retry">再読み込み</button></main>`;
  else
    toast('オフライン準備に失敗しました。ネット接続後、開き直してください。');
  $('#retry')?.addEventListener('click', () => location.reload());
}
