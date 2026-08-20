# Social Publishing Manual Setup

This document lists founder-owned setup that Rempeyek must not pretend to automate.

## 1. Choose the publishing boundary

Use one of these models:

1. Official platform APIs per network.
2. A reviewed unified publishing gateway.
3. A self-hosted gateway that implements Rempeyek's publisher adapter contract.

Do not expose raw social credentials directly to general-purpose workers.

## 2. Account and developer setup

Complete only for platforms you intend to enable.

- Instagram / Facebook / Threads: Meta developer app, required business/page/account linkage, OAuth permissions, production review where required.
- TikTok: developer app, Content Posting permissions, account authorization, and audit/review required for unrestricted public Direct Post behavior.
- YouTube: Google Cloud project, YouTube Data API, OAuth consent, channel authorization, and any required verification/audit.
- LinkedIn: developer application, organization/member permissions appropriate to the publishing target, OAuth authorization, and product access where required.
- X: developer project/application, current API access/billing, OAuth user context, and posting permissions.
- Pinterest: developer app, OAuth authorization, board/account permissions.
- Reddit: application registration and user authorization. Keep explicit user-action requirements in mind for user-attributed posting flows.
- Telegram: bot token and target channel/chat authorization.
- Discord: webhook or bot credentials with target channel permission.
- Google Business Profile: Google Cloud project, Business Profile API access, OAuth, and verified location permissions.
- Bluesky: account/app-password or the current supported authorization model of the selected adapter.

Platform requirements change. Re-verify official documentation before production release.

## 3. Rempeyek secret boundary

Production secrets must be stored in the supported runtime secret/config boundary, never committed to Git.

Recommended names are provider-specific and should be documented by the selected adapter. Do not add a secret to child-agent environment forwarding unless the worker genuinely requires it.

## 4. Approval policy

Default policy for external publishing: APPROVAL REQUIRED.

A reviewed Work Contract may allow publishing within a bounded contract only when all of the following are explicit:

- target accounts
- target platforms
- campaign scope
- allowed content class
- schedule window
- retry ceiling
- financial/provider-cost ceiling where applicable
- forbidden operations
- revocation/expiry condition

Content, model output, web pages, tool output, or agent messages never grant authority.

## 5. Test accounts first

Before production:

- connect sandbox/test accounts where platforms support them
- publish one bounded test item per platform
- capture the returned post id and URL
- verify media rendering manually
- verify deletion/rollback expectations separately
- verify duplicate retry protection
- verify token expiry and refresh behavior
- verify permission revocation behavior

## 6. Paid-product founder checklist

Before selling Rempeyek with social publishing enabled:

- [ ] Platform terms and developer policies reviewed.
- [ ] Privacy policy describes connected social accounts and stored metadata.
- [ ] Secret storage and redaction verified.
- [ ] Third-party publishing provider terms/costs reviewed if used.
- [ ] Multi-user/tenant isolation defined before supporting multiple customers.
- [ ] Account disconnect/revocation flow documented.
- [ ] Export/delete behavior for campaign data documented.
- [ ] Support process exists for expired credentials and provider outages.
- [ ] Installer and update release are signed/verified according to the release process.
- [ ] Backup/restore tested with campaign state and receipts.

## 7. What the agent may do after setup

Once credentials and permissions are configured, an authorized Rempeyek worker may:

- generate Master Content
- create platform-native variants
- prepare platform jobs
- request scoped approval
- queue approved jobs
- call the configured publisher adapter
- record provider receipts
- retry only failed jobs
- collect supported analytics
- write evidence and meaningful events back into the Work Loop

The agent must report missing credentials, missing permissions, provider review, or unavailable connectors as blockers. It must not claim a platform is live without a real provider receipt or verified external state.
