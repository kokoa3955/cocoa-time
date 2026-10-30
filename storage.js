import { emptyState, validateState,            } from './core.js';
let db             ;
export async function openStore()                 {
  db = await new Promise((resolve, reject) => {
    const r = indexedDB.open('cocoa-time', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('state');
    r.onerror = () => reject(r.error);
    r.onsuccess = () => resolve(r.result);
  });
  return new Promise((resolve, reject) => {
    const r = db.transaction('state').objectStore('state').get('main');
    r.onsuccess = () => {
      try {
        resolve(r.result ? validateState(r.result) : emptyState());
      } catch (e) {
        reject(e);
      }
    };
    r.onerror = () => reject(r.error);
  });
}
// One atomic write, with optimistic concurrency checking across Safari tabs.
export function saveStore(next       , revision        )                 {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('state', 'readwrite'),
      s = tx.objectStore('state'),
      r = s.get('main');
    let result       ;
    let cause               = null;
    r.onsuccess = () => {
      if ((r.result?.revision || 0) !== revision) {
        cause = Error(
          '別の画面で更新されました。再読み込みしてから操作してください。',
        );
        tx.abort();
        return;
      }
      result = { ...next, revision: revision + 1 };
      s.put(result, 'main');
    };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () =>
      reject(cause || tx.error || Error('保存できませんでした。'));
    tx.onabort = () => reject(cause || Error('保存が中断されました。'));
  });
}
