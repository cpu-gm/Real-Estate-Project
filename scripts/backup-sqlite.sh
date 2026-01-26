#!/bin/bash
#
# SQLite Backup Script
#
# Sprint 2, Day 17: Production Readiness
#
# Creates backups of SQLite databases (BFF cache, local data).
#
# Usage:
#   ./scripts/backup-sqlite.sh [database_path] [output_dir]
#
# Default:
#   Backs up canonical-deal-os/store.db to ./backups/
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

# Configuration
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DB_PATH="${1:-canonical-deal-os/store.db}"
BACKUP_DIR="${2:-./backups}"
DB_NAME=$(basename "$DB_PATH" .db)
BACKUP_FILE="${DB_NAME}_${TIMESTAMP}.db"
COMPRESSED_FILE="${BACKUP_FILE}.gz"

# Header
echo ""
echo "=============================================="
echo "SQLite Backup Script"
echo "Sprint 2, Day 17"
echo "=============================================="
echo ""

# Check prerequisites
if ! command -v sqlite3 &> /dev/null; then
    error "sqlite3 not found. Please install SQLite."
fi

# Check if database exists
if [ ! -f "$DB_PATH" ]; then
    error "Database not found: $DB_PATH"
fi

# Create backup directory
log "Creating backup directory: ${BACKUP_DIR}"
mkdir -p "${BACKUP_DIR}"

# Create backup using SQLite backup command
log "Creating backup of: ${DB_PATH}"
START_TIME=$(date +%s)

sqlite3 "$DB_PATH" ".backup '${BACKUP_DIR}/${BACKUP_FILE}'"

# Check backup was created
if [ ! -f "${BACKUP_DIR}/${BACKUP_FILE}" ]; then
    error "Backup file was not created"
fi

UNCOMPRESSED_SIZE=$(stat -f%z "${BACKUP_DIR}/${BACKUP_FILE}" 2>/dev/null || stat -c%s "${BACKUP_DIR}/${BACKUP_FILE}" 2>/dev/null)
log "Uncompressed size: $(numfmt --to=iec-i --suffix=B $UNCOMPRESSED_SIZE 2>/dev/null || echo "${UNCOMPRESSED_SIZE} bytes")"

# Compress
log "Compressing backup..."
gzip -f "${BACKUP_DIR}/${BACKUP_FILE}"

COMPRESSED_SIZE=$(stat -f%z "${BACKUP_DIR}/${COMPRESSED_FILE}" 2>/dev/null || stat -c%s "${BACKUP_DIR}/${COMPRESSED_FILE}" 2>/dev/null)
log "Compressed size: $(numfmt --to=iec-i --suffix=B $COMPRESSED_SIZE 2>/dev/null || echo "${COMPRESSED_SIZE} bytes")"

# Generate checksum
log "Generating SHA-256 checksum..."
CHECKSUM=$(sha256sum "${BACKUP_DIR}/${COMPRESSED_FILE}" | cut -d' ' -f1)
echo "${CHECKSUM}  ${COMPRESSED_FILE}" > "${BACKUP_DIR}/${COMPRESSED_FILE}.sha256"

# Calculate duration
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

# Summary
echo ""
echo "=============================================="
echo "BACKUP COMPLETE"
echo "=============================================="
success "Source: ${DB_PATH}"
success "Backup: ${BACKUP_DIR}/${COMPRESSED_FILE}"
success "Checksum: ${CHECKSUM:0:16}..."
success "Duration: ${DURATION} seconds"
echo ""
