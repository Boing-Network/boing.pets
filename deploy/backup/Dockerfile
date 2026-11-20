# syntax=docker/dockerfile:1
# Nightly logical backup of the shared-world Postgres (boing-living-pets-db).
# pg_dump must be at least the server's major version (Fly Postgres flex 18).
FROM postgres:18-alpine
RUN apk add --no-cache aws-cli ca-certificates coreutils
COPY --chmod=0755 backup.sh restore.sh restore-check.sh list-backups.sh lib.sh /usr/local/bin/
USER postgres
WORKDIR /tmp
ENTRYPOINT []
CMD ["/usr/local/bin/backup.sh"]
