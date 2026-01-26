# CRE Deal Management Platform - 2026 UI Spec

Last updated: 2026-01-25
Version: 1.0
Owner: Product and Design
Scope: Vite UI for the CRE deal lifecycle platform (Kernel API + BFF orchestration)

Design system reference: `docs/DESIGN_SYSTEM_2026.md`
Component inventory: `docs/COMPONENT_INVENTORY_2026.md`
Acceptance criteria: `docs/UI_ACCEPTANCE_CRITERIA_2026.md`

## 1) Product Context

This is an enterprise-grade CRE deal lifecycle system with immutable event sourcing, authority gating, multi-tenant org isolation, and AI-assisted underwriting. The UI is presentation-only and must remain kernel-faithful: it never overrides the Kernel state machine or the event ledger.

Key system constraints that drive the UI:
- Kernel is the source of truth and enforces authority gating.
- Events are immutable and chained by SHA-256 hash.
- Materials have truth class (DOC > HUMAN > AI) and provenance.
- Multi-tenant org isolation is mandatory on every view.
- Role-based views are required (GP, LP, Admin, Broker, Lender, Counsel, Regulator, Auditor).

## 2) 2026 Design Goals

- Trust at a glance: provenance, truth class, and auditability are visible and actionable.
- Dense, decisive data: high information density without cognitive overload.
- AI with guardrails: explainability, review flows, and clear human control.
- Workflow precision: UI mirrors the state machine and authority gating.
- Operational speed: command palette, persistent context panes, bulk actions, and saved views.
- Compliance readiness: proofpacks, exportable records, and audit-friendly trails.

## 3) Personas and Role Guardrails

Primary roles:
- GP and GP Analyst: intake, underwriting, approvals, closing, operating oversight.
- Admin: user verification, role assignment, org management, compliance oversight.
- LP: read-only portal for investments, capital calls, distributions, documents.
- Broker: listing and submission workflows.
- Lender: risk and exposure monitoring.
- Counsel: legal review and document approval.
- Regulator/Auditor: read-only audit access with proofpack download.

Role guardrails:
- Actions are shown only if the Kernel would allow them.
- If an action is blocked, UI must render the Kernel reason verbatim.
- LP portal is read-only and magic-link gated.

## 4) Information Architecture and Navigation

Global navigation (role-aware):
- Deals
- Underwriting
- Materials
- Approvals
- LP Portal (LP only)
- Compliance
- Admin (Admin only)

Global utilities:
- Command palette for search and actions.
- Org switcher and role indicator.
- Notifications and exceptions center.

Deal-level navigation (tabs):
- Overview
- Pipeline and Status
- Underwriting
- Materials and Evidence
- Approvals and Authority
- Documents
- Cap Table and Distributions
- Audit and Proofpack

## 5) Core Surfaces and Requirements

### 5.1 Deal Dashboard (Deal Home)
Must:
- Display current state, last event, and next allowed actions.
- Show authority gating status and missing requirements.
- Provide a persistent context pane (deal summary, stage, key metrics).
- Surface exceptions (data disputes, material changes, distress, freezes).
Should:
- Include risk indicators (DSCR, NOI, IRR, stress mode).
- Provide quick actions for approvals, document upload, and assignment.

### 5.2 Underwriting Workspace
Must:
- Split view: model inputs on one side, results on the other.
- Show provenance for each field (source doc and extraction).
- Highlight conflicts between DOC, HUMAN, and AI inputs.
Should:
- Enable scenario comparison with diffing and audit trails.
- Provide AI suggestion review with accept/reject and notes.

### 5.3 Materials and Evidence
Must:
- List materials with truth class badges and revision history.
- Provide evidence viewer with source citation and hash metadata.
- Support locked materials after approval events.
Should:
- Allow batch upload and verification queue.
- Show lineage graph for derived materials.

### 5.4 Approvals and Authority Gating
Must:
- Present gating requirements and thresholds per event.
- Show approvers, approval status, and missing materials.
- Provide Kernel error payload on failure (no custom override).
Should:
- Offer approval queues by role and deadline.
- Provide audit log for each approval event.

### 5.5 LP Portal
Must:
- Read-only access to deal summaries, capital calls, distributions, and documents.
- Magic link authentication and session expiry visibility.
Should:
- Provide exportable statements and distribution history.

### 5.6 Compliance and Audit
Must:
- Event timeline with hash verification status.
- Proofpack generation and download.
- Immutable audit log with actor and IP where available.
Should:
- Quick filters for sensitive actions and financial operations.

### 5.7 Admin and Org Management
Must:
- Verification queue with approve/reject workflows.
- Role and status changes with audit logging.
- Org isolation indicators.
Should:
- Bulk operations with confirmation and audit preview.

## 6) Interaction Patterns and Components

Required patterns:
- Persistent context pane on any multi-step workflow.
- Command palette with deal search, actions, and recent items.
- Activity timeline for event sourcing and audit trails.
- Bulk actions on lists with confirmation and rollback guard.
- Inline edit with validation, but never bypass gating.

Data density:
- Default to dense tables with adjustable density.
- Use clear hierarchy for KPIs and risk indicators.
- Avoid dashboards that hide key decision data behind clicks.

State machine visibility:
- Show lifecycle state, last event, and permitted next events.
- Freeze and terminate states must override primary actions.

## 7) AI UX Requirements

AI features must be explainable, reviewable, and reversible.

Must:
- Show source citations for AI extracted data.
- Provide confidence indicator and truth class assignment.
- Require explicit human acceptance for any AI-derived material that gates approvals.
- Record AI consent and show current consent state.
- Provide rollback and diff for AI edits.

Should:
- Offer agentic workflows in constrained scopes (document triage, summary drafts).
- Provide clear boundaries for automation thresholds (ex: auto-fill only below risk tier).

## 8) Security and Trust Cues

Must:
- Org boundary is always visible (org badge or header).
- Expose identity and role in the UI.
- Show immutable event status and hash verification result.
- Hide unsafe identity data (do not trust client-provided headers).

Should:
- Provide explicit "read-only" banners for LP, Auditor, and Regulator roles.

## 9) Accessibility and Compliance

Targets:
- WCAG 2.2 AA for all UI surfaces.
- EAA readiness for EU-accessed portals.

Requirements:
- Keyboard-first navigation for all workflow actions.
- High-contrast mode and accessible data visualizations.
- No color-only meaning for risk states or approvals.

## 10) Performance and Resilience

Must:
- Optimistic UI only for non-critical actions; show pending state until Kernel confirms.
- Cache-aware loading states with consistent skeletons.
- Clear error messaging for 403 gating failures and 409 version conflicts.

Should:
- Graceful degradation when BFF cache is stale or Kernel is slow.
- Eventual consistency cues for high-latency transitions.

## 11) Data Visualization Guidelines

Must:
- Charts selected by data type (trend, comparison, distribution).
- Clear axis labels and units for financial metrics (NOI, DSCR, IRR).
Should:
- Provide drill-downs and filters for portfolio views.
- Support export for audit and LP reporting.

## 12) Implementation Notes

UI stack:
- React, TanStack Query, Radix UI, Tailwind CSS.
- Contract validation with Zod.

Design system:
- Use tokens for spacing, typography, color, and density.
- Component states must map to Kernel states and truth classes.
- Do not invent UI states that imply unverified Kernel status.

## 13) QA Checklist (UI)

- Gating: blocked actions display Kernel explanation verbatim.
- Provenance: materials show truth class and source link.
- Audit: event timeline aligns with Kernel event list and hash chain.
- Role: permissioned views hide forbidden actions and data.
- LP portal: read-only and limited to invited deal access.
- Accessibility: keyboard and screen reader checks pass for core workflows.

## 14) Deal Lifecycle Mapping (UI States)

Deal states and UI obligations:
- Draft: show intake checklist and required materials.
- UnderReview: show gating status and approval queue.
- Approved: show closing readiness and proofpack preflight.
- ReadyToClose: lock key fields, show final document set.
- Closed: show cap table and ownership snapshot.
- Operating: show performance KPIs and change detection.
- Changed: highlight disputed or changed materials.
- Distressed: prioritize risk indicators and action logs.
- Frozen: disable all changes, display hold reason.
- Terminated/Exited: read-only archive with proofpack.
