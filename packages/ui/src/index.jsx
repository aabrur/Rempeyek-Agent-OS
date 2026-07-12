/* @rempeyek/ui — presentational primitives.
   Pure, stateless, no data fetching. They render the design-system class names,
   so visual fidelity is guaranteed by the stylesheet, not by per-component CSS. */

import { useEffect, useRef } from "react";

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
export function Overlay({ open, onClose, boxClass = "", labelledBy, label, children }) {
  const boxRef = useRef(null);
  const returnFocusRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    returnFocusRef.current = document.activeElement;
    boxRef.current?.focus();
    const onKeyDown = event => {
      if (event.key === "Escape" && onClose) { onClose(); return; }
      if (event.key !== "Tab" || !boxRef.current) return;
      const focusable = [...boxRef.current.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) { event.preventDefault(); boxRef.current.focus(); return; }
      const first = focusable[0], last = focusable.at(-1), active = document.activeElement;
      if (event.shiftKey && (active === first || !boxRef.current.contains(active))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); returnFocusRef.current?.focus?.(); };
  }, [open]);
  if (!open) return null;
  return (
    <div className="token-ov" onClick={e => { if (e.target === e.currentTarget && onClose) onClose(); }}>
      <div ref={boxRef} role="dialog" aria-modal="true" aria-labelledby={labelledBy} aria-label={label} tabIndex={-1} className={`token-box ${boxClass}`.trim()}>{children}</div>
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
