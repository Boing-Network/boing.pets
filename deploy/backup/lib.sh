#!/bin/sh
# Shared helpers. Never echo DATABASE_URL or AWS_* values.
set -eu

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { log "ERROR: $*"; exit 1; }

need() {
  for v in "$@"; do
    eval "val=\${$v:-}"
    [ -n "$val" ] || die "missing env $v"
  done
}

s3() { aws --endpoint-url "$AWS_ENDPOINT_URL_S3" "$@"; }

: "${BACKUP_PREFIX:=pg/boing_living_pets}"

# Newest backup key (keys sort by their UTC timestamp).
latest_key() {
  s3 s3api list-objects-v2 --bucket "$BUCKET_NAME" --prefix "$BACKUP_PREFIX/" \
    --query 'Contents[].Key' --output text \
    | tr '\t' '\n' | grep '\.dump$' | sort | tail -n 1
}

# Same URL, different database name (keeps user, password, host, params).
with_db() {
  printf '%s' "$1" | sed -E "s#^(postgres(ql)?://[^/]+)/[^?]*#\1/$2#"
}

COUNTS_SQL="select format('%s.%s', table_schema, table_name),
  (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I',
    table_schema, table_name), false, true, '')))[1]::text
  from information_schema.tables
  where table_schema not in ('pg_catalog', 'information_schema')
    and table_type = 'BASE TABLE' order by 1"

# "schema.table<TAB>rows" for every user table, from one query.
table_counts() {
  psql "$1" -Atq -F "$(printf '\t')" -v ON_ERROR_STOP=1 -c "$COUNTS_SQL"
}
