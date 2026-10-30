                                                                          
                   
             
               
                   
               
                 
                    
  
                                                                     
                     
             
                
                     
                  
  
                        
               
                                   
                     
  
                     
             
                   
              
                  
                   
                   
                     
                            
  
                       
                
                
                     
                              
                 
  
export const DAY = 86400000,
  HOUR = 3600000,
  OFFSET = 9 * HOUR;
export const emptyState = ()        => ({
  version: 1,
  revision: 0,
  apps: [],
  events: [],
  manual: [],
  studies: [],
  settings: { goal: 180, theme: 'auto', maxSession: 240 },
  lastImport: null,
});
export const dayKey = (t                  = Date.now()) =>
  new Date((typeof t === 'string' ? Date.parse(t) : t) + OFFSET)
    .toISOString()
    .slice(0, 10);
export const dayStart = (d        ) => Date.parse(d + 'T00:00:00+09:00');
export const addDays = (d        , n        ) => dayKey(dayStart(d) + n * DAY);
export const validDay = (v         )              =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(dayStart(v)) &&
  dayKey(dayStart(v)) === v;
export function timestamp(v         )         {
  if (
    typeof v !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(
      v,
    ) ||
    !validDay(v.slice(0, 10)) ||
    !Number.isFinite(Date.parse(v)) ||
    Number(v.slice(11, 13)) > 23 ||
    Number(v.slice(14, 16)) > 59 ||
    Number(v.slice(17, 19)) > 59
  )
    throw Error('日時はタイムゾーン付きISO 8601形式で指定してください。');
  const t = Date.parse(v);
  if (t < dayStart('2000-01-01') || t > Date.now() + 300000)
    throw Error('日時が範囲外です（2000年以降、未来は5分以内）。');
  return new Date(t).toISOString();
}
const obj = (v         )                          => {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    throw Error('オブジェクト形式が必要です。');
  return v                           ;
};
const str = (v         , n = 80) => {
  if (typeof v !== 'string' || !v.trim() || v.length > n)
    throw Error('文字列が空か長すぎます。');
  return v.trim();
};
const id = (v         ) => {
  const s = str(v, 80);
  if (
    ['__proto__', 'prototype', 'constructor'].includes(s) ||
    !/^[a-zA-Z0-9_-]+$/.test(s)
  )
    throw Error('IDは半角英数字・_・-のみです。');
  return s;
};
const num = (v         , min        , max        ) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max)
    throw Error('数値が範囲外です。');
  return v;
};
const bool = (v         ) => {
  if (typeof v !== 'boolean') throw Error('真偽値が必要です。');
  return v;
};
const arr = (v         , max = 100000)            => {
  if (!Array.isArray(v) || v.length > max)
    throw Error('配列が不正か件数が上限を超えています。');
  return v;
};
export const eventKey = (e       ) => `${e.appId}|${e.type}|${e.at}`;
export function validateEvents(input         )          {
  return arr(input).map((v, i) => {
    try {
      const e = obj(v);
      if (e.type !== 'open' && e.type !== 'close')
        throw Error('typeはopenまたはcloseです。');
      return { appId: id(e.appId), type: e.type, at: timestamp(e.at) };
    } catch (e) {
      throw Error(`${i + 1}行目: ${(e         ).message}`);
    }
  });
}
export function validateState(input         )        {
  const v = obj(input);
  if (v.version !== 1) throw Error('未対応のバックアップバージョンです。');
  const apps = arr(v.apps, 1000).map((x) => {
    const a = obj(x);
    return {
      id: id(a.id),
      name: str(a.name),
      category: str(a.category),
      goal: num(a.goal, 1, 1440),
      avoid: bool(a.avoid),
      archived: bool(a.archived),
    };
  });
  if (new Set(apps.map((a) => a.id)).size !== apps.length)
    throw Error('アプリIDが重複しています。');
  const events = validateEvents(v.events);
  const manual = arr(v.manual).map((x) => {
    const a = obj(x);
    if (!validDay(a.day) || a.day > dayKey())
      throw Error('手動記録の日付が不正です。');
    return { appId: id(a.appId), day: a.day, minutes: num(a.minutes, 0, 1440) };
  });
  if (new Set(manual.map((m) => m.appId + '|' + m.day)).size !== manual.length)
    throw Error('手動記録が重複しています。');
  const studies = arr(v.studies).map((x) => {
    const a = obj(x),
      start = timestamp(a.start),
      end = a.end === null ? null : timestamp(a.end);
    if (end && Date.parse(end) < Date.parse(start))
      throw Error('勉強の終了が開始より前です。');
    return { id: id(a.id), start, end, avoid: arr(a.avoid, 1000).map(id) };
  });
  const ordered = [...studies].sort((a, b) => a.start.localeCompare(b.start));
  if (new Set(studies.map((s) => s.id)).size !== studies.length)
    throw Error('勉強IDの重複');
  for (let i = 1; i < ordered.length; i++)
    if (
      !ordered[i - 1].end ||
      Date.parse(ordered[i - 1].end ) > Date.parse(ordered[i].start)
    )
      throw Error('勉強時間が重複しています。');
  const ids = new Set(apps.map((a) => a.id));
  if (
    [...events, ...manual].some((x) => !ids.has(x.appId)) ||
    studies.some((s) => s.avoid.some((x) => !ids.has(x)))
  )
    throw Error('未登録のアプリIDがあります。');
  const s = obj(v.settings);
  if (!['auto', 'light', 'dark'].includes(String(s.theme)))
    throw Error('テーマが不正です。');
  return {
    version: 1,
    revision: Number.isSafeInteger(v.revision) ? Number(v.revision) : 0,
    apps,
    events: mergeEvents([], events).events,
    manual,
    studies,
    settings: {
      goal: num(s.goal, 1, 1440),
      theme: s.theme                     ,
      maxSession: num(s.maxSession, 1, 1440),
    },
    lastImport: v.lastImport === null ? null : timestamp(v.lastImport),
  };
}
export function parseCSV(text        )             {
  const rows             = [];
  let row           = [],
    field = '',
    quoted = false,
    closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += c;
    } else if (c === '"') {
      if (field || closed) throw Error('CSVの引用符が不正です。');
      quoted = true;
    } else if (c === ',' || c === '\n' || c === '\r') {
      row.push(field);
      field = '';
      closed = false;
      if (c !== ',') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        if (row.some((x) => x !== '')) rows.push(row);
        row = [];
      }
    } else {
      if (closed) throw Error('CSVの引用符の後に余分な文字があります。');
      field += c;
    }
  }
  if (quoted) throw Error('CSVの引用符が閉じていません。');
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
export function parseImport(
  text        ,
)                                                                         {
  if (text.length > 20000000) throw Error('1回の読み込みは20MB以内です。');
  text = text.replace(/^\uFEFF/, '').trim();
  if (!text) return { kind: 'events', events: [] };
  if (text.startsWith('{') || text.startsWith('[')) {
    let v         ;
    try {
      v = JSON.parse(text);
    } catch {
      throw Error('JSONの形式が不正です。');
    }
    if (Array.isArray(v)) return { kind: 'events', events: validateEvents(v) };
    const o = obj(v);
    if ('version' in o) return { kind: 'backup', state: validateState(o) };
    return { kind: 'events', events: validateEvents([o]) };
  }
  const rows = parseCSV(text);
  let header = ['appId', 'type', 'at'];
  if (rows[0]?.[0] === 'appId') {
    header = rows.shift() ;
    if (
      header.length !== 3 ||
      !['appId', 'type', 'at'].every((x) => header.includes(x))
    )
      throw Error('CSVのヘッダーはappId,type,atです。');
  }
  return {
    kind: 'events',
    events: validateEvents(
      rows.map((r) => {
        if (r.length !== 3) throw Error('CSVは各行3列が必要です。');
        return Object.fromEntries(header.map((h, i) => [h, r[i]]));
      }),
    ),
  };
}
export function mergeEvents(old         , added         ) {
  const map = new Map(old.map((e) => [eventKey(e), e]));
  let duplicates = 0;
  for (const e of added) {
    const k = eventKey(e);
    if (map.has(k)) duplicates++;
    else map.set(k, e);
  }
  if (map.size > 100000)
    throw Error(
      'イベントは10万件までです。バックアップ後、古いデータを整理してください。',
    );
  return {
    events: [...map.values()].sort(
      (a, b) =>
        a.at.localeCompare(b.at) ||
        a.type.localeCompare(b.type) ||
        a.appId.localeCompare(b.appId),
    ),
    duplicates,
  };
}
export function sessionsFrom(events         , maxMinutes = 240)            {
  const es = mergeEvents([], events).events,
    out            = [];
  let active               = null;
  const multi = new Map                ();
  for (const e of es)
    if (e.type === 'open') multi.set(e.at, (multi.get(e.at) || 0) + 1);
  const review = (e       , end               , reason        ) =>
    out.push({
      appId: e.appId,
      start: Date.parse(e.at),
      end,
      status: 'review',
      reason,
    });
  const groups            = [];
  for (const e of es) {
    if (groups.at(-1)?.[0].at === e.at) groups.at(-1) .push(e);
    else groups.push([e]);
  }
  for (const group of groups) {
    const existing = active?.appId;
    group.sort((a, b) => {
      const priority = (e       ) =>
        e.type === 'close' && e.appId === existing
          ? 0
          : e.type === 'open'
            ? 1
            : 2;
      return priority(a) - priority(b);
    });
    for (const e of group) {
      const t = Date.parse(e.at);
      if (e.type === 'open') {
        if (active) {
          review(
            active,
            t,
            active.appId === e.appId
              ? '終了前に再度起動'
              : '別アプリと重複・終了欠落',
          );
          active = null;
        }
        if (multi.get(e.at)  > 1) {
          review(e, null, '同時刻に複数アプリが起動');
          continue;
        }
        active = e;
      } else if (!active || active.appId !== e.appId) {
        review(e, null, '起動記録がない終了');
      } else {
        const start = Date.parse(active.at),
          duration = t - start;
        out.push({
          appId: e.appId,
          start,
          end: t,
          status: duration > maxMinutes * 60000 ? 'review' : 'paired',
          reason:
            duration > maxMinutes * 60000
              ? '連続使用の確認上限を超過'
              : '開始・終了ペアからの推定',
        });
        active = null;
      }
    }
  }
  if (active) review(active, null, '終了イベントなし（使用中の可能性）');
  return out.sort((a, b) => b.start - a.start);
}
                     
              
                
                    
                 
                 
                                
                   
                 
  
export function aggregate(state       , from        , to        ) {
  if (
    !validDay(from) ||
    !validDay(to) ||
    from > to ||
    (dayStart(to) - dayStart(from)) / DAY > 366
  )
    throw Error('期間は順序を確認し、最大367日以内にしてください。');
  const days          = [];
  const map = new Map               ();
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const r = {
      day: d,
      total: 0,
      estimated: 0,
      manual: 0,
      known: false,
      byApp: {}                          ,
      launches: 0,
      issues: 0,
    };
    days.push(r);
    map.set(d, r);
  }
  const manualKeys = new Set(state.manual.map((m) => m.appId + '|' + m.day)),
    sessions = sessionsFrom(state.events, state.settings.maxSession);
  const put = (d       , a        , ms        ) => {
    d.byApp[a] = (d.byApp[a] || 0) + ms;
    d.total += ms;
  };
  for (const s of sessions) {
    if (s.status !== 'paired') {
      // Flag every affected day, including an unfinished session spanning midnight.
      // A close without an open is a point event, not an interval since that time.
      const end = s.end ?? (s.reason.startsWith('終了イベントなし') ? Date.now() : s.start);
      const first = dayKey(s.start), last = dayKey(Math.max(s.start, end - 1));
      for (const d of days)
        if (d.day >= first && d.day <= last) d.issues++;
      continue;
    }
    if (s.end === s.start) {
      const d = map.get(dayKey(s.start));
      if (d) d.known = true;
    }
    let t = Math.max(s.start, dayStart(from));
    const end = Math.min(s.end , dayStart(addDays(to, 1)));
    while (t < end) {
      const k = dayKey(t),
        next = Math.min(end, dayStart(addDays(k, 1))),
        d = map.get(k);
      if (d) {
        d.known = true;
        if (!manualKeys.has(s.appId + '|' + k)) {
          put(d, s.appId, next - t);
          d.estimated += next - t;
        }
      }
      t = next;
    }
  }
  for (const e of state.events) {
    const d = map.get(dayKey(e.at));
    if (d) {
      if (e.type === 'open') d.launches++;
    }
  }
  for (const m of state.manual) {
    const d = map.get(m.day);
    if (d) {
      d.known = true;
      put(d, m.appId, m.minutes * 60000);
      d.manual += m.minutes * 60000;
    }
  }
  const known = days.filter((d) => d.known),
    total = days.reduce((n, d) => n + d.total, 0),
    byApp                         = {};
  for (const d of days)
    for (const [a, n] of Object.entries(d.byApp))
      byApp[a] = (byApp[a] || 0) + n;
  return {
    days,
    total,
    byApp,
    average: known.length ? total / known.length : null,
    knownDays: known.length,
    sessions,
  };
}
export function hourly(state       , day        ) {
  const values = Array(24).fill(0)            ,
    manual = new Set(
      state.manual.filter((m) => m.day === day).map((m) => m.appId),
    );
  for (const s of sessionsFrom(state.events, state.settings.maxSession)) {
    if (s.status !== 'paired' || manual.has(s.appId)) continue;
    let t = Math.max(s.start, dayStart(day)),
      end = Math.min(s.end , dayStart(day) + DAY);
    while (t < end) {
      const h = Math.floor((t - dayStart(day)) / HOUR),
        next = Math.min(end, dayStart(day) + (h + 1) * HOUR);
      values[h] += next - t;
      t = next;
    }
  }
  return values;
}
export function studyOverlap(
  study       ,
  sessions           ,
  now = Date.now(),
) {
  const end = study.end ? Date.parse(study.end) : now,
    start = Date.parse(study.start);
  return sessions
    .filter(
      (s) =>
        s.status === 'paired' &&
        study.avoid.includes(s.appId) &&
        s.start < end &&
        s.end  > start,
    )
    .map((s) => ({
      appId: s.appId,
      start: Math.max(start, s.start),
      end: Math.min(end, s.end ),
      ms: Math.min(end, s.end ) - Math.max(start, s.start),
    }));
}
export const exportCSV = (events         ) =>
  'appId,type,at\r\n' +
  events.map((e) => [e.appId, e.type, e.at].join(',')).join('\r\n');
