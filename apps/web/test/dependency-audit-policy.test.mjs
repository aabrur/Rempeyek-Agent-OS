import assert from "node:assert/strict";
import test from "node:test";

import {
  auditFingerprint,
  evaluateAuditPolicy,
} from "../../../scripts/dependency-audit-policy.mjs";

const reviewedReport = {
  vulnerabilities: {
    "electron-builder": {
      severity: "high",
      isDirect: true,
      range: ">=26.0.0",
      via: [{
        source: 123,
        name: "builder-advisory",
        dependency: "electron-builder",
        title: "Reviewed build-only advisory",
        url: "https://github.com/advisories/GHSA-test-test-test",
        severity: "high",
        range: "<27.0.0",
      }],
      effects: [],
      fixAvailable: false,
    },
  },
};

const policy = {
  schema: 1,
  expiresOn: "2026-08-31",
  reviewedFindingCount: 1,
  reviewedFingerprint: auditFingerprint(reviewedReport),
};

test("release audit policy accepts only the reviewed development finding", () => {
  const result = evaluateAuditPolicy({
    productionReport: {
      vulnerabilities: {},
      metadata: { vulnerabilities: { total: 0 } },
    },
    fullReport: reviewedReport,
    policy,
    now: new Date("2026-07-26T00:00:00Z"),
  });
  assert.deepEqual(result, []);
});

test("release audit policy fails closed on advisory drift, production risk, and expiry", () => {
  const changedReport = structuredClone(reviewedReport);
  changedReport.vulnerabilities["electron-builder"].via.push({
    source: 456,
    name: "new-advisory",
    dependency: "electron-builder",
    title: "New advisory on an already reviewed package",
    url: "https://github.com/advisories/GHSA-new-new-new",
    severity: "high",
    range: "<=26.15.3",
  });
  assert.ok(evaluateAuditPolicy({
    productionReport: {
      vulnerabilities: { runtime: { severity: "high" } },
      metadata: { vulnerabilities: { total: 1 } },
    },
    fullReport: changedReport,
    policy,
    now: new Date("2026-09-01T00:00:00Z"),
  }).length >= 3);
});
