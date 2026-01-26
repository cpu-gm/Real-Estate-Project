# 2026 UI Acceptance Criteria

Last updated: 2026-01-25
Scope: Key screens and workflows in canonical-deal-os/src/pages

## Home - Decision Cockpit (`canonical-deal-os/src/pages/Home.jsx`)
- Decision queue shows only items requiring action and includes claim, consequence, and primary action.
- "Since last login" feed is time-anchored and links to Explain or evidence.
- Truth and risk bar is always visible and clickable.
- Command palette is accessible and lists actions with required authority.
- No KPI dashboards appear above the decision queue.

## Deal Workspace (`canonical-deal-os/src/pages/DealWorkspace.jsx`, `canonical-deal-os/src/pages/DealOverview.jsx`)
- Left navigation is stable across tabs and roles.
- Right context pane is present with truth class, freshness, and authority info.
- Current lifecycle state, last event, and next allowed actions are visible.
- Disabled actions show the Kernel gating reason verbatim.
- Event timeline is accessible with evidence links and hash visibility.

## Underwriting and Due Diligence (`canonical-deal-os/src/pages/DealDueDiligence.jsx`)
- Inputs and outputs appear in a split view with persistent context.
- Each field shows provenance, truth class, and as-of time.
- Conflicts between sources require explicit human resolution.
- Scenario comparison includes diff and audit trail.
- AI suggestions require explicit acceptance and are reversible.

## Approvals and Authority (`canonical-deal-os/src/pages/EmailApprovalQueue.jsx`)
- Approval queue lists required authority and blocking items.
- Kernel rejection reasons are displayed verbatim.
- Approval confirmation includes consequence summary and audit preview.
- Actions are hidden or disabled when authority is missing.
- Approval events appear in the timeline with actor and timestamp.

## Materials and Evidence (`canonical-deal-os/src/pages/Traceability.jsx`)
- Materials list shows truth class, revision history, and lock status.
- Evidence viewer shows document and extracted claims side by side.
- Hash and provenance are visible for any critical field.
- Locked materials cannot be edited without authority override.
- Batch uploads route to a verification queue with status.

## Capital Calls (`canonical-deal-os/src/pages/CapitalCalls.jsx`)
- Allocation math includes "Explain" with inputs, formulas, and sources.
- Approval ceremony requires authority verification and audit preview.
- Wiring instructions are versioned and verified before use.
- Reconciliation requires human confirmation with match reasons.
- Closeout export includes evidence and snapshot hash.

## Distributions (`canonical-deal-os/src/pages/Distributions.jsx`)
- Distribution run shows inputs, waterfall definition version, and provenance.
- Payment batch status includes bank evidence and reconciliation state.
- Exceptions are first-class and cannot be silently dismissed.
- Approval to release funds requires explicit authority.
- Export packages include ledger and evidence links.

## LP Portal (`canonical-deal-os/src/pages/LPPortal.jsx`, `canonical-deal-os/src/pages/lp/LPHome.jsx`)
- Read-only banner is visible on all LP screens.
- Investment list includes status and last verified update.
- "What changed" section links to evidence and timestamps.
- Exports include as-of time and verification language.
- No internal risk flags, overrides, or draft materials are visible.

## Lender Portal (`canonical-deal-os/src/pages/LenderPortal.jsx`)
- Exposure summary and decision queue are the primary surfaces.
- Approval requires explicit confirmation and authority check.
- Email ingress never equals approval or consent.
- Timeline shows immutable history with evidence links.
- Risk indicators show thresholds and data freshness.

## Counsel Workspace (`canonical-deal-os/src/pages/legal/GPCounselHome.jsx`, `canonical-deal-os/src/pages/legal/LegalDocumentReview.jsx`)
- Obligations are shown by request, not by deal metrics.
- Email ingress requires confirmation before classification.
- Diff views and source citations are visible for legal changes.
- Authority boundaries are visible on entry and submission.
- Firm-internal activity is not visible to GP or lenders.

## Compliance and Audit (`canonical-deal-os/src/pages/Compliance.jsx`, `canonical-deal-os/src/pages/AuditExport.jsx`)
- Audit export requires scope, purpose, and redaction inputs.
- Proofpack download is deterministic and includes hash.
- Timeline aligns with Kernel event chain verification.
- Filters exist for sensitive actions and financial events.
- Regulator and auditor views are read-only with clear banners.

## Onboarding and Data Connections (`canonical-deal-os/src/pages/onboarding/OrgOnboardingWizard.jsx`, `canonical-deal-os/src/pages/onboarding/OnboardingStatus.jsx`)
- Initial ingestion is read-only and reversible.
- Preview shows what data is visible before activation.
- Mapping step allows "not sure yet" without blocking.
- Freshness rules are explicit and enforced.
- Disconnecting preserves audit history and snapshots.

## Inbox (`canonical-deal-os/src/pages/Inbox.jsx`)
- Items show source (email/upload/API) and classification status.
- No item advances state without explicit confirmation.
- Each item links to evidence and explainability.
- Filters for role and authority are available.
- New participant emails trigger access confirmation.

## Admin Dashboard (`canonical-deal-os/src/pages/AdminDashboard.jsx`)
- Verification queue shows evidence and audit trail.
- Role changes require confirmation and are logged.
- Bulk actions show audit preview before execution.
- Org boundaries are visible and enforced in UI.
- Cross-org data is not visible.
