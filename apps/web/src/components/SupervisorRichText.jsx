// Safe, dependency-free renderer for provider output. Builds React elements only (no innerHTML).

const INLINE = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\[[^\]\n]+\]\([^)\s]+\))/g;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+/;

// Providers often wrap JSON answers in ```json fences; unwrap and parse when possible.
function parseEnvelope(value) {
  if (value && typeof value === "object") return value;
  const text = String(value ?? "").trim();
  const bare = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  if (!/^[[{]/.test(bare)) return null;
  try { return JSON.parse(bare); } catch { return null; }
}

const asText = item => typeof item === "string" ? item
  : item && typeof item === "object" ? item.summary || item.message || item.title || JSON.stringify(item) : String(item ?? "");

function inline(text) {
  return text.split(INLINE).map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) return <code key={index}>{part.slice(1, -1)}</code>;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={index}>{part.slice(2, -2)}</strong>;
    const link = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (link) return /^https?:\/\//i.test(link[2]) ? <a key={index} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a> : <span key={index}>{link[1]}</span>;
    return part;
  });
}

function blocks(source) {
  const lines = String(source).replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let paragraph = [];
  const flush = () => { if (paragraph.length) out.push(<p key={out.length}>{inline(paragraph.join(" "))}</p>); paragraph = []; };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      flush();
      const code = [];
      for (i += 1; i < lines.length && !/^\s*```/.test(lines[i]); i += 1) code.push(lines[i]);
      out.push(<pre key={out.length}><code>{code.join("\n")}</code></pre>);
    } else if (/^\s{0,3}#{1,6}\s+/.test(line)) {
      flush();
      out.push(<h5 key={out.length}>{inline(line.replace(/^\s*#+\s+/, ""))}</h5>);
    } else if (LIST_ITEM.test(line)) {
      flush();
      const ordered = /^\s*\d/.test(line);
      const items = [];
      for (; i < lines.length && LIST_ITEM.test(lines[i]); i += 1) items.push(<li key={items.length}>{inline(lines[i].replace(LIST_ITEM, ""))}</li>);
      i -= 1;
      out.push(ordered ? <ol key={out.length}>{items}</ol> : <ul key={out.length}>{items}</ul>);
    } else if (!line.trim()) flush();
    else paragraph.push(line.trim());
  }
  flush();
  return out;
}

export function RichText({ value, className = "" }) {
  const data = parseEnvelope(value);
  let body;
  if (data && !Array.isArray(data) && (typeof data.summary === "string" || typeof data.message === "string")) {
    const findings = [data.findings, data.reviewFindings, data.issues].find(Array.isArray) || [];
    body = <>{blocks(data.summary ?? data.message)}{findings.length > 0 && <ul>{findings.map((item, index) => <li key={index}>{inline(asText(item))}</li>)}</ul>}</>;
  } else if (Array.isArray(data)) body = <ul>{data.map((item, index) => <li key={index}>{inline(asText(item))}</li>)}</ul>;
  else if (data) body = <pre><code>{JSON.stringify(data, null, 2)}</code></pre>;
  else body = blocks(value ?? "");
  return <div className={`sup-md ${className}`}>{body}</div>;
}

// Single-line preview: unwraps the envelope and strips markdown syntax.
export function plainText(value) {
  const data = parseEnvelope(value);
  const text = data ? asText(Array.isArray(data) ? data[0] : data) : String(value ?? "");
  return text.replace(/```[a-z]*\n?/gi, "").replace(/[*#`>]+/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\s+/g, " ").trim();
}
