/** NETWORK LOAD sparkline — rolling running/total ratio, fed by the state poll. */
export function TopoLoad({ load, accent }) {
  const buf = load.current;
  if (!buf.length) return <svg id="topoLoad" viewBox="0 0 200 44" preserveAspectRatio="none" />;
  const W = 200, H = 44, step = W / 39;
  const pts = buf.map((v, i) => `${(i * step).toFixed(1)},${(H - 6 - v * (H - 16)).toFixed(1)}`).join(" ");
  const pctNow = Math.round(buf[buf.length - 1] * 100);
  return (
    <svg id="topoLoad" viewBox="0 0 200 44" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={accent} strokeWidth="1.6" opacity=".9" />
      <text x={W - 3} y="12" textAnchor="end" fontSize="10" fill="#8E88BE" fontFamily="Cascadia Mono,monospace">{pctNow}%</text>
    </svg>
  );
}
