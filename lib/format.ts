export function fmt(n: number, currency = "EGP") {
  const symbols: Record<string, string> = { EGP: "ج.م", USD: "$", SAR: "ر.س" };
  return `${n.toLocaleString("ar-EG", { maximumFractionDigits: 0 })} ${symbols[currency] || currency}`;
}
