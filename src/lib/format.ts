export function fmtPrice(n: number) {
  const a = Math.abs(n);
  const d = a >= 1000 ? 2 : a >= 10 ? 3 : a >= 1 ? 4 : 5;
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
