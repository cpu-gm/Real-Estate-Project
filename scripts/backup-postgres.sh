#!/bin/bash
#
# PostgreSQL Backup Script
#
# Sprint 2, Day 17: Production Readiness
#
# Creates compressed, checksummed backups of the PostgreSQL database.
#
# Usage:
#   ./scripts/backup-postgres.sh [output_dir]
#
# Environment Variables:
#   DATABASE_URL - PostgreSQL connection string (required)
#   BACKUP_DIR   - Default backup directory (optional, defaults to ./backups)
#
# Output:
#   - Compressed backup: backups/kernel_db_YYYYMMDD_HHMMSS.sql.gz
#   - Checksum file: backups/kernel_db_YYYYMMDD_HHMMSS.sql.gz.sha256
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${1:-${BACKUP_DIR:-./backups}}"
BACKUP_FILE="kernel_db_${TIMESTAMP}.sql"
COMPRESSED_FILE="${BACKUP_FILE}.gz"

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
echo "PostgreSQL Backup Script"
echo "Sprint 2, Day 17"
echo "=============================================="
echo ""

# Check prerequisites
log "Checking prerequisites..."

if ! command -v pg_dump &> /dev/null; then
    error "pg_dump not found. Please install PostgreSQL client tools."
fi

if ! command -v gzip &> /dev/null; then
    error "gzip not found. Please install gzip."
fi

if [ -z "$DATABASE_URL" ]; then
    warn "DATABASE_URL not set. Using default local connection."
    DATABASE_URL="postgresql://postgres:postgres@localhost:5432/kernel_db"
fi

# Create backup directory
log "Creating backup directory: ${BACKUP_DIR}"
mkdir -p "${BACKUP_DIR}"

# Parse DATABASE_URL for display (hide password)
DB_DISPLAY=$(echo "$DATABASE_URL" | sed 's/:\/\/[^:]*:[^@]*@/:\/\/***:***@/')
log "Database: ${DB_DISPLAY}"

# Create backup
log "Creating backup: ${BACKUP_FILE}"
START_TIME=$(date +%s)

pg_dump "$DATABASE_URL" > "${BACKUP_DIR}/${BACKUP_FILE}" 2>&1 || {
    error "pg_dump failed. Check database connection and credentials."
}

# Check if backup file was created and has content
if [ ! -s "${BACKUP_DIR}/${BACKUP_FILE}" ]; then
    error "Backup file is empty. Database may be empty or connection failed."
fi

UNCOMPRESSED_SIZE=$(stat -f%z "${BACKUP_DIR}/${BACKUP_FILE}" 2>/dev/null || stat -c%s "${BACKUP_DIR}/${BACKUP_FILE}" 2>/dev/null)
log "Uncompressed size: $(numfmt --to=iec-i --suffix=B $UNCOMPRESSED_SIZE 2>/dev/null || echo "${UNCOMPRESSED_SIZE} bytes")"

# Compress backup
log "Compressing backup..."
gzip -f "${BACKUP_DIR}/${BACKUP_FILE}"

COMPRESSED_SIZE=$(stat -f%z "${BACKUP_DIR}/${COMPRESSED_FILE}" 2>/dev/null || stat -c%s "${BACKUP_DIR}/${COMPRESSED_FILE}" 2>/dev/null)
log "Compressed size: $(numfmt --to=iec-i --suffix=B $COMPRESSED_SIZE 2>/dev/null || echo "${COMPRESSED_SIZE} bytes")"

# Calculate compression ratio
if [ "$UNCOMPRESSED_SIZE" -gt 0 ]; then
    RATIO=$(echo "scale=1; (1 - $COMPRESSED_SIZE / $UNCOMPRESSED_SIZE) * 100" | bc 2>/dev/null || echo "N/A")
    log "Compression ratio: ${RATIO}%"
fi

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
success "Backup file: ${BACKUP_DIR}/${COMPRESSED_FILE}"
success "Checksum file: ${BACKUP_DIR}/${COMPRESSED_FILE}.sha256"
success "SHA-256: ${CHECKSUM:0:16}..."
success "Duration: ${DURATION} seconds"
echo ""

# Output for automation
echo "BACKUP_FILE=${BACKUP_DIR}/${COMPRESSED_FILE}"
echo "CHECKSUM_FILE=${BACKUP_DIR}/${COMPRESSED_FILE}.sha256"
echo "CHECKSUM=${CHECKSUM}"
