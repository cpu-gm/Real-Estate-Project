/**
 * Centralized permission system for role-based access control
 */

// Permission constants
export const PERMISSIONS = {
  // Deal permissions
  DEAL_VIEW_ALL: 'deal:view_all',         // View all deals (GP only)
  DEAL_VIEW_ASSIGNED: 'deal:view_assigned', // View only assigned deals
  DEAL_CREATE: 'deal:create',
  DEAL_EDIT: 'deal:edit',
  DEAL_SUBMIT: 'deal:submit',             // Submit for external review
  DEAL_APPROVE: 'deal:approve',           // Approve deal transitions
  DEAL_OVERRIDE: 'deal:override',         // Override gate blocks
  DEAL_ASSIGN_ANALYST: 'deal:assign_analyst', // Assign analysts to deals

  // LP permissions
  LP_INVITE: 'lp:invite',
  LP_APPROVE: 'lp:approve',
  LP_VIEW_OWN: 'lp:view_own',             // View own LP investments

  // Task permissions
  TASK_CREATE: 'task:create',
  TASK_ASSIGN: 'task:assign',
  TASK_VIEW_ALL: 'task:view_all',
  TASK_VIEW_ASSIGNED: 'task:view_assigned',

  // Document permissions
  DOC_UPLOAD: 'doc:upload',
  DOC_APPROVE: 'doc:approve',

  // Review permissions
  REQUEST_REVIEW: 'review:request',       // Request senior review
  APPROVE_REVIEW: 'review:approve',       // Approve junior's work

  // Admin permissions
  ADMIN_MANAGE_USERS: 'admin:manage_users',         // Manage organization users
  ADMIN_VERIFY_USERS: 'admin:verify_users',         // Verify pending users
  ADMIN_VIEW_ALL_ORGS: 'admin:view_all_orgs',       // View all organizations (super admin)

  // LP Document permissions
  LP_DOC_UPLOAD: 'lp_doc:upload',                   // Upload LP documents (GP/Admin)
  LP_DOC_DELETE: 'lp_doc:delete',                   // Delete LP documents (GP/Admin)
  LP_DOC_SET_PERMISSIONS: 'lp_doc:set_permissions', // Set per-LP document permissions
  LP_DOC_VIEW_ALL: 'lp_doc:view_all',               // View all LP documents
  LP_DOC_VIEW_OWN: 'lp_doc:view_own',               // View own permitted documents (LP)
  LP_PORTAL_MANAGE: 'lp_portal:manage',             // Manage LP portal access (GP/Admin)
  LP_PORTAL_ACCESS: 'lp_portal:access',             // Access LP portal (LP)

  // Broker/Listing permissions
  LISTING_CREATE: 'listing:create',                 // Create new listings
  LISTING_EDIT: 'listing:edit',                     // Edit listings
  LISTING_DISTRIBUTE: 'listing:distribute',         // Distribute OM to buyers
  LISTING_VIEW_ALL: 'listing:view_all',             // View all firm listings (brokerage admin)
  LISTING_VIEW_OWN: 'listing:view_own',             // View own listings
  OM_GENERATE: 'om:generate',                       // Generate OM from claims
  OM_APPROVE_BROKER: 'om:approve_broker',           // Broker approval on OM
  BUYER_REVIEW: 'buyer:review',                     // Review buyer responses
  COMMISSION_ENTER: 'commission:enter',             // Enter commission terms
  COMMISSION_VIEW: 'commission:view',               // View commission info

  // GP Counsel / Legal permissions
  LEGAL_MATTER_CREATE: 'legal:matter_create',       // Create legal matters
  LEGAL_MATTER_VIEW_ALL: 'legal:matter_view_all',   // View all legal matters
  LEGAL_MATTER_EDIT: 'legal:matter_edit',           // Edit legal matters
  LEGAL_MATTER_ASSIGN: 'legal:matter_assign',       // Assign matters to team
  LEGAL_TIME_ENTRY: 'legal:time_entry',             // Log time entries
  LEGAL_VENDOR_VIEW: 'legal:vendor_view',           // View vendor CRM
  LEGAL_VENDOR_MANAGE: 'legal:vendor_manage',       // Manage vendor CRM
  LEGAL_ENTITY_VIEW: 'legal:entity_view',           // View entity database
  LEGAL_ENTITY_MANAGE: 'legal:entity_manage',       // Manage entities
  LEGAL_AI_ANALYSIS: 'legal:ai_analysis',           // Run AI document analysis
  LEGAL_PLAYBOOK_VIEW: 'legal:playbook_view',       // View contract playbooks
  LEGAL_PLAYBOOK_MANAGE: 'legal:playbook_manage',   // Manage contract playbooks
  LEGAL_SHARED_SPACE: 'legal:shared_space',         // Create/manage shared spaces
  LEGAL_REPORTING: 'legal:reporting',               // View legal reports
  DD_VIEW_ALL: 'dd:view_all',                       // View all DD types
  DD_COMMENT: 'dd:comment',                         // Comment on any DD item
  LP_DATA_VIEW: 'lp:data_view',                     // View full LP data including financials
  GC_TEAM_OVERSIGHT: 'gc:team_oversight',           // GC team workload view
  GC_APPROVAL: 'gc:approval',                       // GC approval authority
};

// Role permission mappings
export const ROLE_PERMISSIONS = {
  'GP': [
    PERMISSIONS.DEAL_VIEW_ALL,
    PERMISSIONS.DEAL_CREATE,
    PERMISSIONS.DEAL_EDIT,
    PERMISSIONS.DEAL_SUBMIT,
    PERMISSIONS.DEAL_APPROVE,
    PERMISSIONS.DEAL_OVERRIDE,
    PERMISSIONS.DEAL_ASSIGN_ANALYST,
    PERMISSIONS.LP_INVITE,
    PERMISSIONS.LP_APPROVE,
    PERMISSIONS.TASK_CREATE,
    PERMISSIONS.TASK_ASSIGN,
    PERMISSIONS.TASK_VIEW_ALL,
    PERMISSIONS.DOC_UPLOAD,
    PERMISSIONS.DOC_APPROVE,
    PERMISSIONS.APPROVE_REVIEW,
    PERMISSIONS.LP_DOC_UPLOAD,
    PERMISSIONS.LP_DOC_DELETE,
    PERMISSIONS.LP_DOC_SET_PERMISSIONS,
    PERMISSIONS.LP_DOC_VIEW_ALL,
    PERMISSIONS.LP_PORTAL_MANAGE,
  ],

  'GP Analyst': [
    PERMISSIONS.DEAL_VIEW_ASSIGNED,       // Only assigned deals
    PERMISSIONS.DEAL_CREATE,              // Can draft, needs approval
    PERMISSIONS.DEAL_EDIT,                // Only on assigned deals
    PERMISSIONS.LP_INVITE,                // Can invite, GP must approve
    PERMISSIONS.TASK_CREATE,
    PERMISSIONS.TASK_VIEW_ASSIGNED,
    PERMISSIONS.DOC_UPLOAD,
    PERMISSIONS.REQUEST_REVIEW,           // Request GP review
  ],

  'Lender': [
    PERMISSIONS.DEAL_VIEW_ASSIGNED,       // See only deals submitted to them
    PERMISSIONS.DEAL_APPROVE,             // Approve/reject loan submissions
    PERMISSIONS.TASK_VIEW_ASSIGNED,       // Only assigned tasks
  ],

  'Counsel': [
    PERMISSIONS.DEAL_VIEW_ASSIGNED,       // Task-based access
    PERMISSIONS.DOC_APPROVE,              // Approve legal docs
    PERMISSIONS.TASK_VIEW_ASSIGNED,
  ],

  'Regulator': [
    PERMISSIONS.DEAL_VIEW_ALL,
    PERMISSIONS.TASK_VIEW_ALL,
    // Read-only - no action permissions
  ],

  'Auditor': [
    PERMISSIONS.DEAL_VIEW_ALL,
    PERMISSIONS.TASK_VIEW_ALL,
    // Read-only - no action permissions
  ],

  'LP': [
    PERMISSIONS.LP_VIEW_OWN,
    PERMISSIONS.LP_DOC_VIEW_OWN,
    PERMISSIONS.LP_PORTAL_ACCESS,
    // View own investment data and permitted documents only
  ],

  'Admin': [
    // Admin has all GP permissions plus admin-specific ones
    PERMISSIONS.DEAL_VIEW_ALL,
    PERMISSIONS.DEAL_CREATE,
    PERMISSIONS.DEAL_EDIT,
    PERMISSIONS.DEAL_SUBMIT,
    PERMISSIONS.DEAL_APPROVE,
    PERMISSIONS.DEAL_OVERRIDE,
    PERMISSIONS.DEAL_ASSIGN_ANALYST,
    PERMISSIONS.LP_INVITE,
    PERMISSIONS.LP_APPROVE,
    PERMISSIONS.TASK_CREATE,
    PERMISSIONS.TASK_ASSIGN,
    PERMISSIONS.TASK_VIEW_ALL,
    PERMISSIONS.DOC_UPLOAD,
    PERMISSIONS.DOC_APPROVE,
    PERMISSIONS.APPROVE_REVIEW,
    // Admin-specific permissions
    PERMISSIONS.ADMIN_MANAGE_USERS,
    PERMISSIONS.ADMIN_VERIFY_USERS,
    // LP Document management
    PERMISSIONS.LP_DOC_UPLOAD,
    PERMISSIONS.LP_DOC_DELETE,
    PERMISSIONS.LP_DOC_SET_PERMISSIONS,
    PERMISSIONS.LP_DOC_VIEW_ALL,
    PERMISSIONS.LP_PORTAL_MANAGE,
  ],

  'Broker': [
    // Broker can manage listings and distribute to buyers
    PERMISSIONS.LISTING_CREATE,
    PERMISSIONS.LISTING_EDIT,
    PERMISSIONS.LISTING_VIEW_OWN,
    PERMISSIONS.LISTING_DISTRIBUTE,
    PERMISSIONS.OM_GENERATE,
    PERMISSIONS.OM_APPROVE_BROKER,
    PERMISSIONS.BUYER_REVIEW,
    PERMISSIONS.COMMISSION_ENTER,
    PERMISSIONS.COMMISSION_VIEW,
    PERMISSIONS.DOC_UPLOAD,
    PERMISSIONS.TASK_VIEW_ASSIGNED,
  ],

  'Brokerage Admin': [
    // Brokerage Admin has all Broker permissions plus firm management
    PERMISSIONS.LISTING_CREATE,
    PERMISSIONS.LISTING_EDIT,
    PERMISSIONS.LISTING_VIEW_OWN,
    PERMISSIONS.LISTING_VIEW_ALL,        // Can see all firm listings
    PERMISSIONS.LISTING_DISTRIBUTE,
    PERMISSIONS.OM_GENERATE,
    PERMISSIONS.OM_APPROVE_BROKER,
    PERMISSIONS.BUYER_REVIEW,
    PERMISSIONS.COMMISSION_ENTER,
    PERMISSIONS.COMMISSION_VIEW,
    PERMISSIONS.DOC_UPLOAD,
    PERMISSIONS.TASK_VIEW_ALL,
    PERMISSIONS.ADMIN_MANAGE_USERS,      // Can manage brokers in firm
  ],

  'GP Counsel': [
    // In-house legal counsel - full visibility, advisory role (non-blocking)
    PERMISSIONS.DEAL_VIEW_ALL,
    PERMISSIONS.TASK_VIEW_ALL,
    PERMISSIONS.LP_DOC_VIEW_ALL,
    PERMISSIONS.LP_DATA_VIEW,             // Full LP data including financials
    PERMISSIONS.DD_VIEW_ALL,              // All 6 DD types
    PERMISSIONS.DD_COMMENT,               // Can comment on any DD item
    PERMISSIONS.LEGAL_MATTER_CREATE,
    PERMISSIONS.LEGAL_MATTER_VIEW_ALL,
    PERMISSIONS.LEGAL_MATTER_EDIT,
    PERMISSIONS.LEGAL_TIME_ENTRY,
    PERMISSIONS.LEGAL_VENDOR_VIEW,
    PERMISSIONS.LEGAL_ENTITY_VIEW,
    PERMISSIONS.LEGAL_AI_ANALYSIS,
    PERMISSIONS.LEGAL_PLAYBOOK_VIEW,
    PERMISSIONS.LEGAL_SHARED_SPACE,
    PERMISSIONS.DOC_UPLOAD,
    PERMISSIONS.REQUEST_REVIEW,
  ],

  'General Counsel': [
    // GC has all GP Counsel permissions plus team oversight
    PERMISSIONS.DEAL_VIEW_ALL,
    PERMISSIONS.TASK_VIEW_ALL,
    PERMISSIONS.LP_DOC_VIEW_ALL,
    PERMISSIONS.LP_DATA_VIEW,
    PERMISSIONS.DD_VIEW_ALL,
    PERMISSIONS.DD_COMMENT,
    PERMISSIONS.LEGAL_MATTER_CREATE,
    PERMISSIONS.LEGAL_MATTER_VIEW_ALL,
    PERMISSIONS.LEGAL_MATTER_EDIT,
    PERMISSIONS.LEGAL_MATTER_ASSIGN,      // Can assign matters to team
    PERMISSIONS.LEGAL_TIME_ENTRY,
    PERMISSIONS.LEGAL_VENDOR_VIEW,
    PERMISSIONS.LEGAL_VENDOR_MANAGE,      // Manage vendor relationships
    PERMISSIONS.LEGAL_ENTITY_VIEW,
    PERMISSIONS.LEGAL_ENTITY_MANAGE,      // Manage entity database
    PERMISSIONS.LEGAL_AI_ANALYSIS,
    PERMISSIONS.LEGAL_PLAYBOOK_VIEW,
    PERMISSIONS.LEGAL_PLAYBOOK_MANAGE,    // Customize playbooks
    PERMISSIONS.LEGAL_SHARED_SPACE,
    PERMISSIONS.LEGAL_REPORTING,          // View legal reports
    PERMISSIONS.DOC_UPLOAD,
    PERMISSIONS.REQUEST_REVIEW,
    PERMISSIONS.GC_TEAM_OVERSIGHT,        // Team workload view
    PERMISSIONS.GC_APPROVAL,              // Approval authority
  ],
};

/**
 * Check if a role has a specific permission
 * @param {string} role - The user's role
 * @param {string} permission - The permission to check
 * @returns {boolean}
 */
export function canPerform(role, permission) {
  const rolePerms = ROLE_PERMISSIONS[role];
  if (!rolePerms) return false;
  return rolePerms.includes(permission);
}

/**
 * Check if a role can view all deals or only assigned ones
 * @param {string} role - The user's role
 * @returns {'all' | 'assigned' | 'none'}
 */
export function getDealVisibility(role) {
  if (canPerform(role, PERMISSIONS.DEAL_VIEW_ALL)) {
    return 'all';
  }
  if (canPerform(role, PERMISSIONS.DEAL_VIEW_ASSIGNED)) {
    return 'assigned';
  }
  return 'none';
}

/**
 * Check if a role is an internal team role
 * @param {string} role - The user's role
 * @returns {boolean}
 */
export function isInternalRole(role) {
  return ['GP', 'GP Analyst', 'Admin'].includes(role);
}

/**
 * Check if a role is an admin role
 * @param {string} role - The user's role
 * @returns {boolean}
 */
export function isAdminRole(role) {
  return role === 'Admin';
}

/**
 * Check if a role is an external party
 * @param {string} role - The user's role
 * @returns {boolean}
 */
export function isExternalRole(role) {
  return ['Lender', 'Counsel', 'LP'].includes(role);
}

/**
 * Check if a role is an oversight role (read-only)
 * @param {string} role - The user's role
 * @returns {boolean}
 */
export function isOversightRole(role) {
  return ['Regulator', 'Auditor'].includes(role);
}

/**
 * Check if a role is a broker role
 * @param {string} role - The user's role
 * @returns {boolean}
 */
export function isBrokerRole(role) {
  return ['Broker', 'Brokerage Admin'].includes(role);
}

/**
 * Check if a role is a GP Counsel role (in-house legal)
 * @param {string} role - The user's role
 * @returns {boolean}
 */
export function isGPCounselRole(role) {
  return ['GP Counsel', 'General Counsel'].includes(role);
}

/**
 * Check if a role is General Counsel (GC with oversight)
 * @param {string} role - The user's role
 * @returns {boolean}
 */
export function isGeneralCounsel(role) {
  return role === 'General Counsel';
}

/**
 * Get the category for a role
 * @param {string} role - The user's role
 * @returns {'SELLER_BUYER' | 'BROKER' | 'INVESTOR' | 'LEGAL' | 'EXTERNAL'}
 */
export function getRoleCategory(role) {
  if (['GP', 'GP Analyst', 'Admin'].includes(role)) return 'SELLER_BUYER';
  if (['Broker', 'Brokerage Admin'].includes(role)) return 'BROKER';
  if (['LP'].includes(role)) return 'INVESTOR';
  if (['GP Counsel', 'General Counsel'].includes(role)) return 'LEGAL';
  return 'EXTERNAL';
}

/**
 * Get the label for a role
 * @param {string} role - The role ID
 * @returns {string}
 */
export function getRoleLabel(role) {
  const labels = {
    'GP': 'General Partner',
    'GP Analyst': 'GP Analyst',
    'Lender': 'Lender',
    'Counsel': 'External Counsel',
    'GP Counsel': 'In-House Counsel',
    'General Counsel': 'General Counsel',
    'Regulator': 'Regulator',
    'Auditor': 'Auditor',
    'LP': 'Limited Partner',
    'Admin': 'Administrator',
    'Broker': 'Broker',
    'Brokerage Admin': 'Brokerage Administrator',
  };
  return labels[role] || role;
}

/**
 * Get allowed actions for a role on a deal
 * @param {string} role - The user's role
 * @returns {string[]} - Array of allowed action types
 */
export function getAllowedDealActions(role) {
  const actions = [];

  if (canPerform(role, PERMISSIONS.DEAL_EDIT)) {
    actions.push('edit');
  }
  if (canPerform(role, PERMISSIONS.DEAL_SUBMIT)) {
    actions.push('submit', 'sendToLender');
  }
  if (canPerform(role, PERMISSIONS.DEAL_APPROVE)) {
    actions.push('approve', 'reject');
  }
  if (canPerform(role, PERMISSIONS.DEAL_OVERRIDE)) {
    actions.push('override');
  }
  if (canPerform(role, PERMISSIONS.DOC_UPLOAD)) {
    actions.push('uploadDocument');
  }
  if (canPerform(role, PERMISSIONS.REQUEST_REVIEW)) {
    actions.push('requestReview');
  }
  if (canPerform(role, PERMISSIONS.DEAL_ASSIGN_ANALYST)) {
    actions.push('assignAnalyst');
  }

  return actions;
}
