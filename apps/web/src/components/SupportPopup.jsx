import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, HeartHandshake, X } from "lucide-react";

const SUPPORT_INTERVAL = 60 * 60 * 1000;
const TRAKTEER_ORIGIN = "https://trakteer.id";
const TRAKTEER_EMBED = `${TRAKTEER_ORIGIN}/v1/aabrur/tip/embed/modal`;

export function SupportPopup({ ready }) {
  const dialogRef = useRef(null);
  const frameRef = useRef(null);
  const [open, setOpen] = useState(true);
  const [tipping, setTipping] = useState(false);

  const dismiss = () => { setOpen(false); setTipping(false); };

  useEffect(() => {
    if (!ready) return undefined;
    const timer = window.setInterval(() => setOpen(true), SUPPORT_INTERVAL);
    return () => window.clearInterval(timer);
  }, [ready]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (ready && open) {
      dialog.showModal();
      return () => dialog.close();
    }
    return undefined;
  }, [ready, open]);

  useEffect(() => {
    if (!tipping) return undefined;
    const receive = event => {
      if (event.origin === TRAKTEER_ORIGIN && event.source === frameRef.current?.contentWindow
        && event.data?.type === "embed.modalClosed") dismiss();
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [tipping]);

  return (
    <dialog ref={dialogRef} className={`support-popup${tipping ? " support-popup-tipping" : ""}`}
      aria-labelledby="support-title" aria-describedby={tipping ? undefined : "support-description"}
      onCancel={dismiss}
      onClick={event => { if (event.target === event.currentTarget) dismiss(); }}>
      <div className="support-content">
        <button className="support-close" type="button" aria-label="Close support popup" onClick={dismiss}>
          <X size={20} aria-hidden="true" />
        </button>
        {tipping ? (
          <>
            <h2 id="support-title">Tip through Trakteer</h2>
            <iframe ref={frameRef} className="support-frame" title="Trakteer tip form for Abrur"
              src={`${TRAKTEER_EMBED}?embedId=rempeyek`}
              onLoad={() => frameRef.current?.contentWindow?.postMessage({ type: "embed.openModal" }, TRAKTEER_ORIGIN)} />
            <a className="support-fallback" href="https://trakteer.id/aabrur" target="_blank" rel="noopener noreferrer">
              Open Trakteer in your browser <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          </>
        ) : (
          <>
            <span className="support-mark" aria-hidden="true"><HeartHandshake size={28} /></span>
            <p className="support-eyebrow">REMPEYEK AGENT OS</p>
            <h2 id="support-title">Support Rempeyek’s development</h2>
            <p id="support-description">Help fund ongoing development and improvements with a tip through Trakteer.</p>
            <div className="support-actions">
              <button className="support-cta" type="button" onClick={() => setTipping(true)}>
                Trakteer <ArrowUpRight size={18} aria-hidden="true" />
              </button>
              <button className="btn btn-dim" type="button" onClick={dismiss}>Maybe later</button>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
