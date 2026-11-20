#!/bin/sh
# Restore a backup into an EMPTY database:
#   TARGET_DATABASE_URL=… restore.sh [key|latest]
#   TARGET_DB_NAME=<db on the same cluster as DATABASE_URL> restore.sh [key|latest]
# Refuses to restore into the live database unless RESTORE_INTO_LIVE=yes.
. /usr/local/bin/lib.sh
if [ -z "${TARGET_DATABASE_URL:-}" ] && [ -n "${TARGET_DB_NAME:-}" ]; then
  need DATABASE_URL
  TARGET_DATABASE_URL=$(with_db "$DATABASE_URL" "$TARGET_DB_NAME")
fi
need TARGET_DATABASE_URL BUCKET_NAME AWS_ENDPOINT_URL_S3 AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
key=${1:-latest}
[ "$key" = latest ] && key=$(latest_key)
[ -n "$key" ] || die "no backups under $BACKUP_PREFIX/"
if [ "${TARGET_DATABASE_URL}" = "${DATABASE_URL:-}" ] && [ "${RESTORE_INTO_LIVE:-}" != yes ]; then
  die "TARGET_DATABASE_URL is the live database; set RESTORE_INTO_LIVE=yes to confirm"
fi
log "downloading $key"
s3 s3 cp --only-show-errors "s3://$BUCKET_NAME/$key" /tmp/restore.dump
want=$(s3 s3api head-object --bucket "$BUCKET_NAME" --key "$key" \
  --query 'Metadata.sha256' --output text)
got=$(sha256sum /tmp/restore.dump | cut -d' ' -f1)
[ "$want" = "$got" ] || die "checksum mismatch"
log "restoring (checksum ok)"
pg_restore --no-owner --no-privileges --exit-on-error --single-transaction \
  ${RESTORE_CLEAN:+--clean --if-exists} \
  --dbname="$TARGET_DATABASE_URL" /tmp/restore.dump
log "restored $key"
