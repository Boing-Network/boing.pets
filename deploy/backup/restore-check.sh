#!/bin/sh
# Restore test: restore the latest (or given) backup into a throwaway
# database on the same cluster, compare row counts with the counts recorded
# at backup time, then drop the throwaway database. The live DB is only read.
. /usr/local/bin/lib.sh
need DATABASE_URL BUCKET_NAME AWS_ENDPOINT_URL_S3 AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
key=${1:-latest}
[ "$key" = latest ] && key=$(latest_key)
[ -n "$key" ] || die "no backups under $BACKUP_PREFIX/"
scratch="restore_check_$(date -u +%Y%m%d%H%M%S)"
admin=$(with_db "$DATABASE_URL" postgres)
target=$(with_db "$DATABASE_URL" "$scratch")
cleanup() { psql "$admin" -q -c "drop database if exists $scratch with (force)" || true; }
trap cleanup EXIT
psql "$admin" -q -v ON_ERROR_STOP=1 -c "create database $scratch"
TARGET_DATABASE_URL=$target /usr/local/bin/restore.sh "$key"
s3 s3 cp --only-show-errors "s3://$BUCKET_NAME/${key%.dump}.counts.tsv" /tmp/want.tsv
[ -s /tmp/want.tsv ] || die "backup has no recorded row counts"
sort -o /tmp/want.tsv /tmp/want.tsv
table_counts "$target" | sort > /tmp/got.tsv
log "table rows (backup-time vs restored):"
join -t "$(printf '\t')" -a1 -a2 -e MISSING -o 0,1.2,2.2 /tmp/want.tsv /tmp/got.tsv \
  | while IFS="$(printf '\t')" read -r t w g; do printf '  %-40s %8s %8s\n' "$t" "$w" "$g"; done
if diff -q /tmp/want.tsv /tmp/got.tsv > /dev/null; then
  log "RESTORE CHECK PASSED for $key"
else
  diff /tmp/want.tsv /tmp/got.tsv || true
  die "RESTORE CHECK FAILED for $key"
fi
