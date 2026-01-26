# CRE Deal Management Platform - 2026 Design System

Last updated: 2026-01-25
Version: 1.0
Owner: Product and Design
Scope: Visual system and component rules for the Vite UI

## 0) Design North Star

Design principle:
Calm authority over cleverness. Density without chaos. Truth is visible, but never loud.

Your UI should feel like:
Bloomberg + GitHub + modern banking core

Quiet confidence.
Nothing animated unless it explains state.
Nothing colorful unless it encodes meaning.
Nothing hidden that affects authority or truth.
This is not a "product UI." It is an operating system for decisions.

## 1) Visual Direction

### 1.1 Typography

Primary (UI and dense data)
- Inter Variable
- Weight range: 400-650
- Optical size ON
- Reason: neutral, legible at density, enterprise-safe

Secondary (numbers, tables, provenance)
- IBM Plex Mono
- Used for: hashes, event IDs, timestamps, provenance breadcrumbs, audit diffs

Display / Emphasis (sparingly)
- Source Serif 4
- Used only for: section headers in read-heavy views (IC memo, Counsel), long-form explanations
- Never used in dashboards

Type scale (px)
- 11: micro meta (timestamps, hashes)
- 12: table body dense
- 13: table body relaxed
- 14: primary UI body
- 16: section headers
- 18: panel headers
- 22: screen titles (rare)
- 28: hero numbers (KPIs only)
- No H1/H2 theatrics

### 1.2 Color Palette (Trust-first)

Neutrals (foundation)
- Ink-900: #0B1220 (primary text)
- Ink-700: #2A3345
- Ink-500: #6B7280
- Slate-200: #E5E7EB
- Slate-100: #F3F4F6
- Paper: #FAFAFB

Functional colors (muted, non-saturated)
- Verified / Immutable: Deep Teal #0F766E
- Pending / Provisional: Amber-Gray #A16207
- Stale / Outdated: Desaturated Blue-Gray
- Risk / Conflict: Muted Red #991B1B
- System / Kernel: Indigo-Gray
- AI-Derived: Violet-Gray (never purple)

Rule:
No bright colors. If it looks good on a pitch deck, it is wrong here.

### 1.3 Grid and Layout

Base grid:
- 12-column desktop, 8-column tablet

Gutters:
- 24px desktop, 16px compact

Panels:
- Always snap to grid
- Max width: 1440px (no ultra-wide chaos)
- Reading lanes: never exceed 720px for text

Density modes:
- Compact (default) for power users
- Relaxed for LPs and Counsel
- Toggle is global but never changes semantic meaning

### 1.4 Spacing System

8-pt base. Expose only:
- 2, 4, 8: micro
- 12, 16: UI default
- 24: panel separation
- 32: section separation
- 48: screen separation

If someone asks for 10px, the answer is no.

### 1.5 Iconography

Lucide-style outline icons
- 1.25px stroke
- No filled icons
- Icons are semantic markers, not decoration

Special icon rules:
- Shield: authority gated
- Clock: freshness
- Chain: immutable
- Spark: AI-derived (must always be labeled)

### 1.6 Motion Rules (extremely conservative)

Allowed:
- State change fades (120ms)
- Panel slide-in (180ms, ease-out)
- Timeline progression

Never:
- Bounce
- Spring
- Attention-seeking animation
- AI "thinking" animations

Motion exists only to explain state transitions.

## 2) Trust Stack Language (How Truth Feels)

### 2.1 Truth Class (always visible, never dominant)

Visual pattern:
- Small pill + icon
- Muted background
- Text-first, color-second

Examples:
- Verified - Immutable
- Derived - AI-Assisted
- User-Provided - Unverified

Hover shows provenance chain.

### 2.2 Freshness

Freshness is temporal truth.

Pattern:
- Relative time ("Updated 3h ago")
- Color fades as staleness increases
- After threshold: subtle warning overlay, never red unless critical

No popups. No alarms. Just quiet decay.

### 2.3 Authority Gating

Never block with modals unless irreversible.

Pattern:
- Disabled action + lock icon
- Inline explanation: "Requires GP approval (Level 2)"
- Hover shows who can approve and audit trail of last approval

Authority is explainable, not mysterious.

### 2.4 Auditability

Audit is not a separate screen. It is a layer.

Pattern:
- Info icon on any critical field
- Click opens a side panel with: who, when, why, evidence, hash

No PDFs by default. PDFs are exports, not UX.

## 3) Component Styling

### 3.1 Navigation Shell
- Left vertical rail
- Collapsible, icon + label
- Role-aware (items disappear, not disabled)
- Top bar: global context (Deal / Org / Role), search / command palette, user + role switcher

### 3.2 Context Panes (right rail)
- 360-420px width
- Sticky
- Shows: truth metadata, authority, evidence, AI explanations
- This is where trust lives

### 3.3 Tables (critical)

Rules:
- Sticky headers
- Column provenance on hover
- Inline diffs
- No zebra striping
- Subtle row separators only

Every numeric column must support:
- Source
- Freshness
- Override history

### 3.4 Decision Cards

Used for:
- IC decisions
- Risk flags
- Exceptions

Structure:
- Claim
- Evidence
- Confidence
- Authority
- Action

Cards are neutral. Decisions add color, not cards.

### 3.5 Banners

Only three types:
- System notice
- Risk notice
- Required action

No marketing banners. Ever.

### 3.6 Modals and Drawers
- Drawers for workflows
- Modals only for irreversible actions
- Every destructive modal must show: consequences, audit entry preview

### 3.7 Timeline
- Vertical, left-anchored
- Nodes show icon, event type, actor, evidence link
- Time flows downward. Always.

### 3.8 Steppers
- Used only for deal intake and approvals
- Shows state, authority owner, blocking reason

### 3.9 Command Palette
- Cmd/Ctrl + K
- Actions only (no navigation)
- Shows required authority inline

### 3.10 Evidence Viewer
- Split view: left document or data, right extracted claims + confidence
- AI extractions are always labeled

## 4) Data Visualization Style

### 4.1 Library Rules
- Prefer simple SVG charts
- No gradients
- No 3D
- No chart junk

### 4.2 Visual Encoding
- Solid line: verified
- Dashed line: projected
- Faded area: uncertainty band
- Gray overlay: stale data

### 4.3 Thresholds
- Thresholds are lines, not colors
- Color only appears when crossing matters

## 5) Accessibility (WCAG 2.2 AA baked-in)
- Contrast >= 4.5:1
- Focus rings always visible
- Keyboard nav everywhere
- No color-only meaning
- Motion respects prefers-reduced-motion
- Density does not reduce accessibility

## 6) Key Screens (Comps - Conceptual)

Home: Decision Cockpit
- Top: active risks + pending approvals
- Middle: deal activity timeline
- Right: authority + alerts

Deal Workspace
- Center: primary work surface
- Left: navigation
- Right: trust pane

Underwriting
- Spreadsheet-like tables
- Inline assumptions
- Evidence-first review

Approvals
- Queue view
- Decision cards
- One-click approve with previewed audit entry

LP Portal
- Relaxed density
- Read-only
- Clear freshness indicators

Lender Workspace
- Covenant tracking
- Breach indicators
- Immutable histories

Counsel Workspace
- Document-heavy
- Diff views
- Source citations prominent

## 7) Implementation Mapping (Tailwind + Radix)

Tokens (example)
- --color-ink-900
- --color-verified
- --color-ai-derived
- --space-4
- --space-8
- --radius-sm (4px)
- --radius-md (6px)

Tailwind
- Extend colors, spacing, font families
- No ad-hoc hex values allowed

Radix
- Dialog -> modals
- Sheet -> drawers
- Tooltip -> provenance
- Tabs -> density modes

Implementation files:
- `canonical-deal-os/src/index.css` (CSS variables for tokens and Radix theme values)
- `canonical-deal-os/tailwind.config.js` (token mapping, typography scale, spacing)

## 8) Open Questions, Assumptions, Risks

Assumptions:
- Desktop-first
- Power users tolerate density
- Audit > aesthetics

Open questions:
- Do regulators get a unique theme or same system with stricter defaults?
- Should AI confidence be numeric or categorical?
- How visible should override history be by default?

Risks:
- Over-engineering trust UI -> mitigate with progressive disclosure
- AI labels ignored -> enforce consistent iconography
- Density fatigue -> offer per-role defaults

Final word:
If you implement this faithfully, your UI will feel inevitable, not trendy. It will signal trust without shouting it, age well into 2030, and be defensible in front of regulators, ICs, and CIOs.
