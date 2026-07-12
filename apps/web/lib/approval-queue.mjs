import { randomUUID } from "node:crypto";

export function createApprovalQueue({ now = Date.now, ttlMs = 15 * 60 * 1000 } = {}) {
  const approvals = new Map(), events = [];
  const record = (id, action, actor) => events.push({ id, action, actor, at: now() });
  const refresh = approval => {
    if (approval && approval.status === "approved" && now() > approval.expiresAt) { approval.status = "expired"; record(approval.id, "expired", "system"); }
    return approval;
  };
  return {
    request(input = {}) {
      for (const field of ["type", "target", "consequence", "actor"]) if (!String(input[field] || "").trim()) throw new Error(`${field} is required`);
      const approval = { id: randomUUID(), type: input.type, target: input.target, consequence: input.consequence, actor: input.actor, status: "pending", requestedAt: now(), expiresAt: null };
      approvals.set(approval.id, approval); record(approval.id, "requested", input.actor); return { ...approval };
    },
    decide(id, { decision, actor } = {}) {
      const approval = refresh(approvals.get(id));
      if (!approval) throw new Error("approval not found");
      if (approval.status !== "pending") throw new Error("approval is not pending");
      if (!new Set(["approved", "rejected"]).has(decision)) throw new Error("decision must be approved or rejected");
      approval.status = decision; approval.decidedBy = actor || "unknown"; approval.decidedAt = now(); approval.expiresAt = decision === "approved" ? now() + ttlMs : null;
      record(id, decision, approval.decidedBy); return { ...approval };
    },
    authorize(id, scope = {}) {
      const approval = refresh(approvals.get(id));
      if (!approval) return { allowed: false, reason: "missing" };
      if (approval.status !== "approved") return { allowed: false, reason: approval.status };
      if (approval.type !== scope.type || approval.target !== scope.target) return { allowed: false, reason: "scope-mismatch" };
      approval.status = "consumed"; approval.consumedAt = now(); record(id, "consumed", scope.actor || "system");
      return { allowed: true };
    },
    get(id) { const approval = refresh(approvals.get(id)); return approval ? { ...approval } : null; },
    list() { return [...approvals.values()].map(refresh).map(item => ({ ...item })); },
    audit() { return events.map(event => ({ ...event })); },
  };
}
