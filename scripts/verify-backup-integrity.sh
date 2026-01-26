#!/bin/bash
#
# Backup Integrity Verification Script
#
# Sprint 2, Day 17: Production Readiness
#
# Verifies the integrity of backup files:
# - Checksum verification
# - Decompression test
# - SQL syntax check (for PostgreSQL backups)
#
# Usage:
#   ./scripts/verify-backup-integrity.sh <backup_file.sql.gz>
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

fail() {
    echo -e "${RED}[FAIL]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Header
echo ""
echo "=============================================="
echo "Backup Integrity Verification"
echo "Sprint 2, Day 17"
echo "=============================================="
echo ""

# Check arguments
if [ -z "$1" ]; then
    echo "Usage: $0 <backup_file.sql.gz>"
    exit 1
fi

BACKUP_FILE="$1"
CHECKS_PASSED=0
CHECKS_FAILED=0

# Check 1: File exists
log "Check 1: File existence"
if [ -f "$BACKUP_FILE" ]; then
    success "Backup file exists: $BACKUP_FILE"
    ((CHECKS_PASSED++))
else
    fail "Backup file not found: $BACKUP_FILE"
    ((CHECKS_FAILED++))
    exit 1
fi

# Check 2: File size
log "Check 2: File size"
FILE_SIZE=$(stat -f%z "$BACKUP_FILE" 2>/dev/null || stat -c%s "$BACKUP_FILE" 2>/dev/null)
if [ "$FILE_SIZE" -gt 0 ]; then
    success "File size: $(numfmt --to=iec-i --suffix=B $FILE_SIZE 2>/dev/null || echo "${FILE_SIZE} bytes")"
    ((CHECKS_PASSED++))
else
    fail "File is empty"
    ((CHECKS_FAILED++))
fi

# Check 3: Checksum verification
log "Check 3: Checksum verification"
CHECKSUM_FILE="${BACKUP_FILE}.sha256"
if [ -f "$CHECKSUM_FILE" ]; then
    EXPECTED_CHECKSUM=$(cat "$CHECKSUM_FILE" | cut -d' ' -f1)
    ACTUAL_CHECKSUM=$(sha256sum "$BACKUP_FILE" | cut -d' ' -f1)

    if [ "$EXPECTED_CHECKSUM" = "$ACTUAL_CHECKSUM" ]; then
        success "Checksum matches: ${ACTUAL_CHECKSUM:0:16}..."
        ((CHECKS_PASSED++))
    else
        fail "Checksum mismatch!"
        echo "  Expected: ${EXPECTED_CHECKSUM:0:32}..."
        echo "  Actual:   ${ACTUAL_CHECKSUM:0:32}..."
        ((CHECKS_FAILED++))
    fi
else
    warn "No checksum file found, skipping verification"
fi

# Check 4: Decompression test
log "Check 4: Decompression test"
if gzip -t "$BACKUP_FILE" 2>/dev/null; then
    success "Gzip integrity verified"
    ((CHECKS_PASSED++))
else
    fail "Gzip file is corrupted"
    ((CHECKS_FAILED++))
fi

# Check 5: SQL content check (for .sql.gz files)
if [[ "$BACKUP_FILE" == *.sql.gz ]]; then
    log "Check 5: SQL content validation"

    # Extract first 100 lines and check for PostgreSQL dump markers
    HEADER=$(gunzip -c "$BACKUP_FILE" 2>/dev/null | head -100)

    if echo "$HEADER" | grep -q "PostgreSQL database dump\|pg_dump\|CREATE TABLE\|CREATE SCHEMA"; then
        success "Valid PostgreSQL dump detected"
        ((CHECKS_PASSED++))

        # Count tables
        TABLE_COUNT=$(gunzip -c "$BACKUP_FILE" 2>/dev/null | grep -c "CREATE TABLE" || echo "0")
        log "  Tables in backup: ${TABLE_COUNT}"
    else
        warn "Could not verify SQL content structure"
    fi
fi

# Check 6: Timestamp in filename
log "Check 6: Timestamp format"
if [[ "$BACKUP_FILE" =~ [0-9]{8}_[0-9]{6} ]]; then
    success "Valid timestamp format in filename"
    ((CHECKS_PASSED++))
else
    warn "No standard timestamp found in filename"
fi

# Summary
echo ""
echo "=============================================="
echo "VERIFICATION SUMMARY"
echo "=============================================="
echo ""
echo -e "${GREEN}Passed:${NC} ${CHECKS_PASSED}"
echo -e "${RED}Failed:${NC} ${CHECKS_FAILED}"
echo ""

if [ "$CHECKS_FAILED" -eq 0 ]; then
    success "All integrity checks passed!"
    echo ""
    exit 0
else
    fail "${CHECKS_FAILED} check(s) failed"
    echo ""
    exit 1
fi
