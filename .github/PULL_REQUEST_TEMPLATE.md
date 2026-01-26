## Summary
<!-- Brief description of changes -->

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to change)
- [ ] Security fix (addresses a vulnerability or security concern)
- [ ] Refactoring (no functional changes, code improvements only)
- [ ] Documentation update

## Security Checklist
**REQUIRED for all code changes. Check each item or explain why N/A.**

### Authentication & Authorization
- [ ] No usage of `resolveUserId()` - use `authUser.id` from validated JWT instead
- [ ] No trust of `X-User-Id`, `X-Actor-Role`, or other client headers for authorization
- [ ] All sensitive endpoints use `requireAuth`, `requireGP`, or `requireAdmin` guards
- [ ] Magic links include organization isolation checks

### Organization Isolation (Multi-Tenant Security)
- [ ] Cross-organization access is prevented (deal.organizationId === authUser.organizationId)
- [ ] 404 returned (not 403) for resources in other organizations (to hide existence)
- [ ] Financial operations include organization ownership verification

### Rate Limiting & Logging
- [ ] Authentication endpoints have rate limiting
- [ ] Security-sensitive operations log to SecurityEvent table
- [ ] Failed access attempts are logged with IP and user agent

### Data Validation
- [ ] Input validation using Zod schemas where applicable
- [ ] No SQL injection vulnerabilities (using Prisma parameterized queries)
- [ ] No XSS vulnerabilities in user-facing content

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] E2E tests added/updated (if applicable)
- [ ] All tests pass locally

## Reviewer Notes
<!-- Any specific areas you'd like reviewers to focus on -->

---
**Security Review Required?**
- [ ] Yes - This PR modifies authentication, authorization, or financial operations
- [ ] No - This PR doesn't affect security-sensitive code

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
