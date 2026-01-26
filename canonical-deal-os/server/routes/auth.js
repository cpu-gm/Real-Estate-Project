import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getPrisma } from "../db.js";
import { checkRateLimit, resetRateLimit, logSecurityEvent } from "../services/rate-limiter.js";
import { SignupSchema } from "../middleware/route-schemas.js";
import { createValidationLogger } from "../services/validation-logger.js";

// =============================================================================
// JWT SECRET VALIDATION (T1.1 - P1 Security Sprint)
// =============================================================================
// SECURITY: Enforce 64+ byte (512-bit) secret with graceful shutdown on failure
// =============================================================================

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Validate JWT secret at startup - graceful shutdown on failure
 * Per user requirements:
 * - Minimum 64 bytes (512-bit) for financial application security
 * - Graceful shutdown with clear logging
 * - Block known default secrets
 */
function validateJWTSecret() {
  const timestamp = new Date().toISOString();

  // Check if secret exists
  if (!JWT_SECRET || JWT_SECRET.trim() === '') {
    console.error(`[${timestamp}] [SECURITY] FATAL: JWT_SECRET environment variable is required`);
    console.error(`[${timestamp}] [SECURITY] This is a critical security requirement.`);
    console.error(`[${timestamp}] [SECURITY] Generate a secure secret with:`);
    console.error(`[${timestamp}] [SECURITY]   node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"`);
    process.exit(1);
  }

  // Block known default/weak secrets
  const blockedSecrets = [
    'dev-secret-change-in-production',
    'dev-secret',
    'secret',
    'password',
    'change-me',
    'your-secret-key',
    'jwt-secret'
  ];

  if (blockedSecrets.includes(JWT_SECRET.toLowerCase())) {
    console.error(`[${timestamp}] [SECURITY] FATAL: JWT_SECRET is using a known weak/default value`);
    console.error(`[${timestamp}] [SECURITY] This secret is NOT secure for production use.`);
    console.error(`[${timestamp}] [SECURITY] Generate a secure secret with:`);
    console.error(`[${timestamp}] [SECURITY]   node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"`);
    process.exit(1);
  }

  // Enforce minimum length (64 bytes = 512 bits)
  // Base64 encoded 64 bytes = ~88 characters, raw string should be at least 64 chars
  // We check actual byte length for base64 secrets
  let secretBytes;
  try {
    // Try to decode as base64 first
    const decoded = Buffer.from(JWT_SECRET, 'base64');
    // If it decodes to something reasonable, use that length
    if (decoded.length >= 32 && JWT_SECRET.match(/^[A-Za-z0-9+/=]+$/)) {
      secretBytes = decoded.length;
    } else {
      // Not base64, use raw string length
      secretBytes = Buffer.from(JWT_SECRET).length;
    }
  } catch {
    secretBytes = Buffer.from(JWT_SECRET).length;
  }

  const MIN_SECRET_BYTES = 64; // 512 bits

  if (secretBytes < MIN_SECRET_BYTES) {
    console.error(`[${timestamp}] [SECURITY] FATAL: JWT_SECRET must be at least ${MIN_SECRET_BYTES} bytes (512-bit)`);
    console.error(`[${timestamp}] [SECURITY] Current secret is only ${secretBytes} bytes`);
    console.error(`[${timestamp}] [SECURITY] For financial applications, we require strong secrets.`);
    console.error(`[${timestamp}] [SECURITY] Generate a secure secret with:`);
    console.error(`[${timestamp}] [SECURITY]   node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"`);
    process.exit(1);
  }

  console.log(`[${timestamp}] [SECURITY] JWT_SECRET validation passed (${secretBytes} bytes, 512-bit minimum met)`);
}

// Run validation at module load time
validateJWTSecret();

// =============================================================================
// END JWT SECRET VALIDATION
// =============================================================================

const JWT_EXPIRES_IN = "7d";
const SALT_ROUNDS = 10;

// Structured logging helper
function log(level, category, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
  console.log(`[${timestamp}] [${level}] [${category}] ${message}${metaStr}`);
}

// Consistent CORS headers (must match server/index.js)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-User-Id, X-Canonical-User-Id, X-Actor-Role, X-Idempotency-Key",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS"
};

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...corsHeaders
  });
  res.end(JSON.stringify(payload));
}

function sendError(res, status, message, details = null) {
  sendJson(res, status, { message, details });
}

function generateToken(userId, email) {
  return jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * POST /api/auth/signup
 * Create a new user account
 */
export async function handleSignup(req, res, readJsonBody) {
  try {
    // Rate limiting check (T1.4 - P1 Security Sprint)
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
               req.socket?.remoteAddress ||
               "unknown";

    const rateLimitResult = await checkRateLimit(ip, "auth:signup");
    if (!rateLimitResult.allowed) {
      log('WARN', 'AUTH', 'Rate limit exceeded for signup', { ip, attempts: rateLimitResult.attempts });
      res.setHeader("Retry-After", rateLimitResult.retryAfterSeconds);
      return sendJson(res, 429, {
        error: "Too many signup attempts",
        message: `Please try again in ${rateLimitResult.retryAfterSeconds} seconds`,
        retryAfterSeconds: rateLimitResult.retryAfterSeconds
      });
    }

    const validationLog = createValidationLogger('handleSignup');
    const rawBody = await readJsonBody(req);
    validationLog.beforeValidation(rawBody);

    // Validate with Zod schema
    const parseResult = SignupSchema.safeParse(rawBody ?? {});
    if (!parseResult.success) {
      validationLog.validationFailed(parseResult.error.errors);
      return sendJson(res, 400, {
        error: "Validation failed",
        code: 'VALIDATION_FAILED',
        errors: parseResult.error.errors
      });
    }

    const body = parseResult.data;
    validationLog.afterValidation(body);

    const {
      email, password, name, organizationId, organizationName, role,
      // Broker-specific fields
      brokerLicenseNo, brokerLicenseState, brokerageName
    } = body;

    const prisma = getPrisma();

    // Check if email already exists
    // Exception: allow test emails to create multiple accounts (for role-playing/testing)
    const testEmails = ['gavrielmajeski@gmail.com'];
    const isTestEmail = testEmails.includes(email.toLowerCase());

    if (!isTestEmail) {
      const existingUser = await prisma.authUser.findFirst({
        where: { email: email.toLowerCase() }
      });

      if (existingUser) {
        return sendError(res, 409, "An account with this email already exists");
      }
    }
    // Test emails can create unlimited accounts for role-playing

    let orgId = organizationId;
    let isOrgCreator = false; // Track if this user is creating a new org

    // If no org ID provided, create a new organization
    if (!orgId && organizationName) {
      const slug = slugify(organizationName);
      const existingOrg = await prisma.organization.findUnique({
        where: { slug }
      });

      if (existingOrg) {
        orgId = existingOrg.id;
      } else {
        const newOrg = await prisma.organization.create({
          data: {
            name: organizationName,
            slug,
            status: "ACTIVE"
          }
        });
        orgId = newOrg.id;
        isOrgCreator = true; // This user created the org
      }
    }

    if (!orgId) {
      return sendError(res, 400, "Organization is required");
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Determine user status based on role
    // Admin users are immediately active, others need verification
    // IMPORTANT: If this user is creating a new org, make them Admin automatically
    // (otherwise there's no one to approve them!)
    // EXCEPTION: Brokers keep their Broker role even when creating an org
    const isBrokerSignup = role === 'Broker' || role === 'Brokerage Admin';
    const userRole = isOrgCreator && !isBrokerSignup ? "Admin" : (role || "GP Analyst");
    const shouldBeActive = userRole === "Admin" || isOrgCreator || isBrokerSignup;
    const status = shouldBeActive ? "ACTIVE" : "PENDING";

    // Create user
    const user = await prisma.authUser.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        name,
        organizationId: orgId,
        role: userRole,
        status,
        verifiedAt: shouldBeActive ? new Date() : null,
        // Broker-specific fields (only set if role is Broker or Brokerage Admin)
        ...(isBrokerSignup && {
          brokerLicenseNo: brokerLicenseNo?.trim() || null,
          brokerLicenseState: brokerLicenseState || null
          // brokerageId will be set later when broker joins a firm
        })
      },
      include: {
        organization: true,
        brokerage: true
      }
    });

    // Create verification request for users who need approval
    // (not for admins or brokers who self-register)
    if (!shouldBeActive) {
      await prisma.userVerificationRequest.create({
        data: {
          userId: user.id,
          requestedRole: userRole,
          status: "PENDING"
        }
      });
    }

    // Generate token
    const token = generateToken(user.id, user.email);

    // Create session
    await prisma.authSession.create({
      data: {
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        userAgent: req.headers["user-agent"],
        ipAddress: ip
      }
    });

    // Reset rate limit on successful signup (T1.4)
    await resetRateLimit(ip, "auth:signup");

    // Log successful signup security event (T1.4)
    await logSecurityEvent({
      type: 'SIGNUP_SUCCESS',
      identifier: email.toLowerCase(),
      endpoint: 'auth:signup',
      allowed: true,
      actorId: user.id,
      ipAddress: ip,
      userAgent: req.headers["user-agent"],
      metadata: { role: user.role, organizationId: orgId, isOrgCreator }
    });

    return sendJson(res, 201, {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
        organization: {
          id: user.organization.id,
          name: user.organization.name
        },
        // Broker-specific fields
        ...(user.role === 'Broker' && {
          brokerLicenseNo: user.brokerLicenseNo,
          brokerLicenseState: user.brokerLicenseState,
          brokerage: user.brokerage ? {
            id: user.brokerage.id,
            name: user.brokerage.name
          } : null
        })
      },
      token,
      requiresVerification: status === "PENDING"
    });
  } catch (error) {
    console.error("Signup error:", error);
    return sendError(res, 500, "Failed to create account");
  }
}

/**
 * POST /api/auth/login
 * Login with email and password
 */
export async function handleLogin(req, res, readJsonBody) {
  try {
    // Rate limiting check (T1.4 - P1 Security Sprint)
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
               req.socket?.remoteAddress ||
               "unknown";

    const rateLimitResult = await checkRateLimit(ip, "auth:login");
    if (!rateLimitResult.allowed) {
      log('WARN', 'AUTH', 'Rate limit exceeded for login', { ip, attempts: rateLimitResult.attempts });
      res.setHeader("Retry-After", rateLimitResult.retryAfterSeconds);
      return sendJson(res, 429, {
        error: "Too many login attempts",
        message: `Please try again in ${rateLimitResult.retryAfterSeconds} seconds`,
        retryAfterSeconds: rateLimitResult.retryAfterSeconds
      });
    }

    const body = await readJsonBody(req);
    const { email, password } = body || {};

    log('INFO', 'AUTH', `Login attempt`, { email: email || 'not provided' });

    if (!email || !password) {
      log('WARN', 'AUTH', `Login failed - missing credentials`, { email: email || 'not provided' });
      return sendError(res, 400, "Email and password are required");
    }

    const prisma = getPrisma();

    // Find user (use findFirst since test emails can have multiple accounts)
    // For multiple accounts, get the most recently created one
    log('INFO', 'AUTH', `Looking up user in database`, { email: email.toLowerCase() });
    const user = await prisma.authUser.findFirst({
      where: { email: email.toLowerCase() },
      include: {
        organization: true,
        brokerage: true
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!user) {
      log('WARN', 'AUTH', `Login failed - user not found`, { email: email.toLowerCase() });
      // Log failed login attempt - user not found (T1.4)
      await logSecurityEvent({
        type: 'LOGIN_FAILED',
        identifier: email.toLowerCase(),
        endpoint: 'auth:login',
        allowed: false,
        ipAddress: ip,
        userAgent: req.headers["user-agent"],
        metadata: { reason: 'user_not_found' }
      });
      return sendError(res, 401, "Invalid email or password");
    }

    log('INFO', 'AUTH', `User found`, { userId: user.id, role: user.role, status: user.status });

    if (!user.passwordHash) {
      log('WARN', 'AUTH', `Login failed - SSO account`, { userId: user.id });
      return sendError(res, 401, "This account uses SSO. Please sign in with your provider.");
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      log('WARN', 'AUTH', `Login failed - invalid password`, { userId: user.id });
      // Log failed login attempt (T1.4)
      await logSecurityEvent({
        type: 'LOGIN_FAILED',
        identifier: email.toLowerCase(),
        endpoint: 'auth:login',
        allowed: false,
        actorId: user.id,
        ipAddress: ip,
        userAgent: req.headers["user-agent"],
        metadata: { reason: 'invalid_password' }
      });
      return sendError(res, 401, "Invalid email or password");
    }

    // Check user status
    if (user.status === "SUSPENDED") {
      log('WARN', 'AUTH', `Login failed - account suspended`, { userId: user.id });
      return sendError(res, 403, "Your account has been suspended. Contact your administrator.");
    }

    // Generate token
    const token = generateToken(user.id, user.email);
    log('INFO', 'AUTH', `Token generated`, { userId: user.id });

    // Create session
    await prisma.authSession.create({
      data: {
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        userAgent: req.headers["user-agent"],
        ipAddress: req.headers["x-forwarded-for"] || req.socket?.remoteAddress
      }
    });

    log('INFO', 'AUTH', `Login successful`, { userId: user.id, role: user.role, org: user.organization.name });

    // Reset rate limit on successful login (T1.4)
    await resetRateLimit(ip, "auth:login");

    // Log successful login security event
    await logSecurityEvent({
      type: 'LOGIN_SUCCESS',
      identifier: email.toLowerCase(),
      endpoint: 'auth:login',
      allowed: true,
      actorId: user.id,
      ipAddress: ip,
      userAgent: req.headers["user-agent"],
      metadata: { role: user.role, organizationId: user.organizationId }
    });

    return sendJson(res, 200, {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
        organization: {
          id: user.organization.id,
          name: user.organization.name
        },
        // Broker-specific fields
        ...(user.role === 'Broker' || user.role === 'Brokerage Admin' ? {
          brokerLicenseNo: user.brokerLicenseNo,
          brokerLicenseState: user.brokerLicenseState,
          brokerage: user.brokerage ? {
            id: user.brokerage.id,
            name: user.brokerage.name
          } : null
        } : {})
      },
      token,
      requiresVerification: user.status === "PENDING"
    });
  } catch (error) {
    log('ERROR', 'AUTH', `Login error`, { error: error.message, stack: error.stack });
    console.error("Login error:", error);
    return sendError(res, 500, "Failed to login");
  }
}

/**
 * POST /api/auth/logout
 * Logout and invalidate session
 */
export async function handleLogout(req, res) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return sendJson(res, 200, { message: "Logged out" });
    }

    const token = authHeader.split(" ")[1];
    const prisma = getPrisma();

    // Revoke session
    await prisma.authSession.updateMany({
      where: { token },
      data: { revokedAt: new Date() }
    });

    return sendJson(res, 200, { message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    return sendJson(res, 200, { message: "Logged out" });
  }
}

/**
 * GET /api/auth/me
 * Get current user info
 */
export async function handleGetMe(req, res) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return sendError(res, 401, "Not authenticated");
    }

    const token = authHeader.split(" ")[1];
    const decoded = verifyToken(token);

    if (!decoded) {
      return sendError(res, 401, "Invalid or expired token");
    }

    const prisma = getPrisma();

    // Verify session is still valid
    const session = await prisma.authSession.findUnique({
      where: { token }
    });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      return sendError(res, 401, "Session expired");
    }

    // Get user
    const user = await prisma.authUser.findUnique({
      where: { id: decoded.userId },
      include: {
        organization: true,
        brokerage: true
      }
    });

    if (!user) {
      return sendError(res, 401, "User not found");
    }

    return sendJson(res, 200, {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
        organization: {
          id: user.organization.id,
          name: user.organization.name
        },
        // Broker-specific fields
        ...(user.role === 'Broker' || user.role === 'Brokerage Admin' ? {
          brokerLicenseNo: user.brokerLicenseNo,
          brokerLicenseState: user.brokerLicenseState,
          brokerage: user.brokerage ? {
            id: user.brokerage.id,
            name: user.brokerage.name
          } : null
        } : {})
      }
    });
  } catch (error) {
    console.error("Get me error:", error);
    return sendError(res, 500, "Failed to get user info");
  }
}

/**
 * GET /api/organizations/public
 * List public organizations for signup dropdown
 */
export async function handleListOrganizations(req, res) {
  try {
    const prisma = getPrisma();

    const organizations = await prisma.organization.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        slug: true
      },
      orderBy: { name: "asc" }
    });

    return sendJson(res, 200, { organizations });
  } catch (error) {
    console.error("List organizations error:", error);
    return sendError(res, 500, "Failed to list organizations");
  }
}

/**
 * Middleware to extract user from token
 */
export async function extractAuthUser(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    log('DEBUG', 'AUTH', 'No bearer token in request');
    return null;
  }

  const token = authHeader.split(" ")[1];
  const decoded = verifyToken(token);

  if (!decoded) {
    log('WARN', 'AUTH', 'Invalid or expired JWT token');
    return null;
  }

  const prisma = getPrisma();

  // Verify session
  const session = await prisma.authSession.findUnique({
    where: { token }
  });

  if (!session) {
    log('WARN', 'AUTH', 'Session not found in database', { userId: decoded.userId });
    return null;
  }

  if (session.revokedAt) {
    log('WARN', 'AUTH', 'Session was revoked', { userId: decoded.userId });
    return null;
  }

  if (session.expiresAt < new Date()) {
    log('WARN', 'AUTH', 'Session expired', { userId: decoded.userId });
    return null;
  }

  const user = await prisma.authUser.findUnique({
    where: { id: decoded.userId },
    include: { organization: true }
  });

  // Reject if user not found or not active
  if (!user) {
    log('WARN', 'AUTH', 'User not found', { userId: decoded.userId });
    return null;
  }

  if (user.status !== 'ACTIVE') {
    log('WARN', 'AUTH', 'User not active', { userId: user.id, status: user.status });
    return null;
  }

  return user;
}
