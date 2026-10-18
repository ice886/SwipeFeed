/** 数字/时间/文本格式化工具 */

/** 12345 -> "1.2万"，123456789 -> "1.2亿" */
export function formatCount(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '0';
  if (n >= 100_000_000) return `${trimZero((n / 100_000_000).toFixed(1))}亿`;
  if (n >= 10_000) return `${trimZero((n / 10_000).toFixed(1))}万`;
  return String(Math.floor(n));
}

function trimZero(s: string): string {
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}

function toMs(input: string | number | Date): number {
  if (input instanceof Date) return input.getTime();
  if (typeof input === 'number') return input;
  const t = Date.parse(input);
  return Number.isNaN(t) ? Date.now() : t;
}

/** 相对时间：刚刚 / n分钟前 / n小时前 / n天前 / 具体日期 */
export function timeAgo(input: string | number | Date): string {
  const ts = toMs(input);
  const diff = Date.now() - ts;
  if (diff < 0) return formatDate(ts);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / minute)}分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)}小时前`;
  if (diff < 30 * day) return `${Math.floor(diff / day)}天前`;
  return formatDate(ts);
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** "2026-10-17 14:03" */
export function formatDate(input: string | number | Date): string {
  const d = new Date(toMs(input));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "mm:ss" */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${pad(m)}:${pad(rest)}`;
}

/** 字节数 -> 可读大小 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** 从文本提取 #话题（与后端约定一致：# 紧跟中英文/数字/下划线） */
export function extractTags(text: string): string[] {
  const re = /#([A-Za-z0-9_一-龥]+)/g;
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.add(m[1]);
  }
  return [...out];
}
