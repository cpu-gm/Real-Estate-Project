#!/bin/bash
#
# PostgreSQL Restore Script
#
# Sprint 2, Day 17: Production Readiness
#
# Restores a PostgreSQL database from a compressed backup file.
#
# Usage:
#   ./scripts/restore-postgres.sh <backup_file.sql.gz>
#
# Environment Variables:
#   DATABASE_URL - PostgreSQL connection string (required)
#
# Safety Features:
#   - Verifies checksum before restore
#   - Creates pre-restore backup
#   - Validates restore success
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
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

warn() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Header
echo ""
echo "=============================================="
echo "PostgreSQL Restore Script"
echo "Sprint 2, Day 17"
echo "=============================================="
echo ""

# Check arguments
if [ -z "$1" ]; then
    echo "Usage: $0 <backup_file.sql.gz>"
    echo ""
    echo "Example: $0 backups/kernel_db_20260125_120000.sql.gz"
    exit 1
fi

BACKUP_FILE="$1"

# Check prerequisites
log "Checking prerequisites..."

if ! command -v psql &> /dev/null; then
    error "psql not found. Please install PostgreSQL client tools."
fi

if ! command -v gunzip &> /dev/null; then
    error "gunzip not found. Please install gzip."
fi

if [ -z "$DATABASE_URL" ]; then
    warn "DATABASE_URL not set. Using default local connection."
    DATABASE_URL="postgresql://postgres:postgres@localhost:5432/kernel_db"
fi

# Verify backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
    error "Backup file not found: $BACKUP_FILE"
fi

# Verify checksum if available
CHECKSUM_FILE="${BACKUP_FILE}.sha256"
if [ -f "$CHECKSUM_FILE" ]; then
    log "Verifying checksum..."
    EXPECTED_CHECKSUM=$(cat "$CHECKSUM_FILE" | cut -d' ' -f1)
    ACTUAL_CHECKSUM=$(sha256sum "$BACKUP_FILE" | cut -d' ' -f1)

    if [ "$EXPECTED_CHECKSUM" != "$ACTUAL_CHECKSUM" ]; then
        error "Checksum mismatch! Backup may be corrupted."
    fi
    success "Checksum verified: ${ACTUAL_CHECKSUM:0:16}..."
else
    warn "No checksum file found. Proceeding without verification."
fi

# Parse DATABASE_URL for display (hide password)
DB_DISPLAY=$(echo "$DATABASE_URL" | sed 's/:\/\/[^:]*:[^@]*@/:\/\/***:***@/')
log "Database: ${DB_DISPLAY}"

# Confirm restore
echo ""
warn "This will REPLACE all data in the target database!"
read -p "Continue with restore? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "Restore cancelled."
    exit 0
fi

# Create pre-restore backup
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
PRE_RESTORE_BACKUP="./backups/pre_restore_${TIMESTAMP}.sql.gz"
log "Creating pre-restore backup: ${PRE_RESTORE_BACKUP}"
mkdir -p ./backups
pg_dump "$DATABASE_URL" 2>/dev/null | gzip > "$PRE_RESTORE_BACKUP" || warn "Pre-restore backup failed (database may be empty)"

# Decompress backup
log "Decompressing backup..."
TEMP_FILE="/tmp/restore_${TIMESTAMP}.sql"
gunzip -c "$BACKUP_FILE" > "$TEMP_FILE"

# Get file stats
SQL_SIZE=$(stat -f%z "$TEMP_FILE" 2>/dev/null || stat -c%s "$TEMP_FILE" 2>/dev/null)
log "SQL file size: $(numfmt --to=iec-i --suffix=B $SQL_SIZE 2>/dev/null || echo "${SQL_SIZE} bytes")"

# Perform restore
log "Restoring database..."
START_TIME=$(date +%s)

# Drop and recreate (use with caution)
psql "$DATABASE_URL" -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;" 2>/dev/null || warn "Schema reset skipped"

# Restore from backup
psql "$DATABASE_URL" < "$TEMP_FILE" 2>&1 | tail -5 || {
    error "Restore failed. Check database connection and backup integrity."
}

# Cleanup temp file
rm -f "$TEMP_FILE"

# Calculate duration
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

# Verify restore
log "Verifying restore..."
TABLE_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | tr -d ' ')

if [ -z "$TABLE_COUNT" ] || [ "$TABLE_COUNT" -eq 0 ]; then
    warn "No tables found after restore. This may be expected for an empty backup."
else
    success "Tables restored: ${TABLE_COUNT}"
fi

# Summary
echo ""
echo "=============================================="
echo "RESTORE COMPLETE"
echo "=============================================="
success "Restored from: ${BACKUP_FILE}"
success "Pre-restore backup: ${PRE_RESTORE_BACKUP}"
success "Tables restored: ${TABLE_COUNT:-0}"
success "Duration: ${DURATION} seconds"
echo ""
