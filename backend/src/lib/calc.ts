export function wilsonScore(up: number, down: number, z = 1.96) {
const n = Math.max(0, (up ?? 0) + (down ?? 0));
if (n === 0) return 0;
const p = (up ?? 0) / n;
const z2 = z * z;
const num = p + z2 / (2 * n) - z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
const den = 1 + z2 / n;
return num / den;
}

export function mean(values: number[]) {
if (!values.length) return 0;
return values.reduce((a, b) => a + b, 0) / values.length;
}

export function stdev(values: number[]) {
if (values.length < 2) return 0;
const m = mean(values);
const v = mean(values.map(x => (x - m) ** 2));
return Math.sqrt(v);
}

export function ema(values: number[], span = 6) {
if (!values.length) return 0;
const k = 2 / (span + 1);
return values.reduce((acc, x, i) => (i === 0 ? x : acc * (1 - k) + x * k), 0);
}