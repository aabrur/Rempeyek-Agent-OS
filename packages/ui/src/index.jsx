/* @rempeyek/ui — presentational primitives.
   Pure, stateless, no data fetching. They render the design-system class names,
   so visual fidelity is guaranteed by the stylesheet, not by per-component CSS. */

export function Btn({ variant = "dim", className = "", children, ...rest }) {
  const v = { primary: "btn-primary", run: "btn-run", stop: "btn-stop", dim: "btn-dim" }[variant] || "btn-dim";
  return <button className={`btn ${v} ${className}`.trim()} {...rest}>{children}</button>;
}

export function Pill({ status, label, title }) {
  const text = label ?? status;
  return (
    <span className="pill" title={title || ""}>
      <span className={`dot ${status}`} />
      <span className={`lbl-${status}`}>{text}</span>
    </span>
  );
}

export function Chip({ plain, children }) {
  return <span className={`chip ${plain ? "chip-plain" : ""}`.trim()}>{children}</span>;
}

export function Panel({ title, chip, chipPlain = true, className = "", children, ...rest }) {
  return (
    <div className={`panel ${className}`.trim()} {...rest}>
      {(title || chip) && (
        <div className="panel-head">
          {title && <h2>{title}</h2>}
          {chip && <Chip plain={chipPlain}>{chip}</Chip>}
        </div>
      )}
      {children}
    </div>
  );
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}

export function Skeleton() {
  return <div className="skeleton-block" aria-hidden="true" />;
}

export function SectionRow({ label, children }) {
  return (
    <div className="section-row">
      <div className="section-label">{label}</div>
      {children}
    </div>
  );
}

export function PageHead({ title, children }) {
  return (
    <header className="page-head">
      <h1>{title}</h1>
      {children && <div className="page-meta">{children}</div>}
    </header>
  );
}

/** Full-screen overlay (token login, add-agent). Click the backdrop to close. */
export function Overlay({ open, onClose, boxClass = "", children }) {
  if (!open) return null;
  return (
    <div className="token-ov" onClick={e => { if (e.target === e.currentTarget && onClose) onClose(); }}>
      <div className={`token-box ${boxClass}`.trim()}>{children}</div>
    </div>
  );
}

export function Avatar({ agent, accent, large, onEdit }) {
  return (
    <div className={`avatar ${large ? "avatar-lg" : ""}`.trim()} style={{ "--ac": accent }}>
      {agent.avatar ? <img src={agent.avatar} alt={agent.name} /> : (agent.icon || "◈")}
      {large && onEdit && (
        <button className="avatar-edit" onClick={e => { e.stopPropagation(); onEdit(agent.id); }} title="Change profile photo">✎</button>
      )}
    </div>
  );
}
