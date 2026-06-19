const CN_LOCALE: Intl.NumberFormatOptions = {
  maximumFractionDigits: 3,
};

export function fmtNum(n: number | null | undefined, decimals: number = 3): string {
  if (n === null || n === undefined) return '--';
  return n.toFixed(decimals);
}

export function fmtPercent(n: number | null | undefined, decimals: number = 1): string {
  if (n === null || n === undefined) return '--';
  return (n * 100).toFixed(decimals) + '%';
}

export function fmtInt(n: number | null | undefined): string {
  if (n === null || n === undefined) return '--';
  return n.toLocaleString('zh-CN');
}

export function fmtRuntime(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function fmtSigned(n: number | null | undefined): string {
  if (n === null || n === undefined) return '--';
  const sign = n >= 0 ? '+' : '';
  return sign + n.toFixed(3);
}

export function stageName(key: string): string {
  const map: Record<string, string> = {
    income: '继承阶层',
    nhood: '社区质量',
    school: '学校质量',
    earnings: '劳动收入',
    ability: '先天能力',
  };
  return map[key] || key;
}
