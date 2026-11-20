#!/bin/sh
# pg_dump (custom format) -> verify -> upload to Tigris -> prune old dumps.
# Env: DATABASE_URL, BUCKET_NAME, AWS_ENDPOINT_URL_S3, AWS_ACCESS_KEY_ID,
#      AWS_SECRET_ACCESS_KEY, AWS_REGION, BACKUP_RETENTION_DAYS, BACKUP_KEEP_MIN.
. /usr/local/bin/lib.sh
need DATABASE_URL BUCKET_NAME AWS_ENDPOINT_URL_S3 AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
: "${BACKUP_RETENTION_DAYS:=14}" "${BACKUP_KEEP_MIN:=3}"

stamp=$(date -u +%Y-%m-%dT%H%M%SZ)
key="$BACKUP_PREFIX/$stamp.dump"
file="/tmp/$stamp.dump"

# Hold one REPEATABLE READ transaction open, export its snapshot, record
# row counts in it, and dump from the same snapshot: the counts describe
# exactly what the dump contains (the restore check compares against them).
mkfifo /tmp/sql.in
psql "$DATABASE_URL" -Atq -F "$(printf '\t')" -v ON_ERROR_STOP=1 \
  < /tmp/sql.in > /tmp/sql.out 2>/tmp/sql.err &
psql_pid=$!
exec 3> /tmp/sql.in
printf '%s\n' "begin isolation level repeatable read read only;" \
  "select 'SNAP', pg_export_snapshot();" >&3
i=0
until grep -q '^SNAP' /tmp/sql.out 2>/dev/null; do
  i=$((i + 1)); [ "$i" -le 300 ] || die "no snapshot: $(cat /tmp/sql.err)"
  kill -0 "$psql_pid" 2>/dev/null || die "psql exited: $(cat /tmp/sql.err)"
  sleep 0.1
done
snap=$(grep '^SNAP' /tmp/sql.out | cut -f2)
log "dumping (snapshot $snap)"
pg_dump --snapshot="$snap" --format=custom --compress=9 --no-owner \
  --no-privileges --dbname="$DATABASE_URL" --file="$file"
printf '%s\n' "select 'ROW', * from ($COUNTS_SQL) c;" "select 'END';" "commit;" >&3
exec 3>&-
wait "$psql_pid" || die "psql failed: $(cat /tmp/sql.err)"
grep '^ROW' /tmp/sql.out | cut -f2- > "/tmp/$stamp.counts.tsv"
pg_restore --list "$file" > /tmp/toc.txt
tables=$(grep -c ' TABLE DATA ' /tmp/toc.txt || true)
[ "$tables" -gt 0 ] || die "dump has no table data"
size=$(wc -c < "$file" | tr -d ' ')
sum=$(sha256sum "$file" | cut -d' ' -f1)

log "uploading $key ($size bytes, $tables tables)"
s3 s3 cp --only-show-errors "$file" "s3://$BUCKET_NAME/$key" \
  --metadata "sha256=$sum,tables=$tables"
s3 s3 cp --only-show-errors "/tmp/$stamp.counts.tsv" \
  "s3://$BUCKET_NAME/$BACKUP_PREFIX/$stamp.counts.tsv"

# Retention: drop dumps older than N days, but always keep the newest K.
cutoff=$(date -u -d "@$(( $(date +%s) - BACKUP_RETENTION_DAYS * 86400 ))" +%Y-%m-%dT%H%M%SZ)
keys=$(s3 s3api list-objects-v2 --bucket "$BUCKET_NAME" --prefix "$BACKUP_PREFIX/" \
  --query 'Contents[].Key' --output text | tr '\t' '\n' | grep '\.dump$' | sort -r)
n=0; pruned=0
for k in $keys; do
  n=$((n + 1))
  [ "$n" -le "$BACKUP_KEEP_MIN" ] && continue
  ts=$(basename "$k" .dump)
  if [ "$ts" \< "$cutoff" ]; then
    s3 s3 rm --only-show-errors "s3://$BUCKET_NAME/$k"
    s3 s3 rm --only-show-errors "s3://$BUCKET_NAME/${k%.dump}.counts.tsv" || true
    pruned=$((pruned + 1))
  fi
done
log "done key=$key bytes=$size sha256=$sum kept=$((n - pruned)) pruned=$pruned"
