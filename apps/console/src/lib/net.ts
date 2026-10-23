// 端末が「電波なし」と分かっているかどうか(機内モード・圏外など)
export const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;
