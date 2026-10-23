// 電波が弱いときのために、直近に読み込めた内容を端末に残す
export function saveCache(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 容量不足などは無視 */ }
}
export function loadCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch { return null; }
}
export function removeCache(key: string) {
  try { localStorage.removeItem(key); } catch { /* 無視 */ }
}
