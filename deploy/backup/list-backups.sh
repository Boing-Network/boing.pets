#!/bin/sh
# List backups (newest last) with sizes.
. /usr/local/bin/lib.sh
need BUCKET_NAME AWS_ENDPOINT_URL_S3 AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
s3 s3 ls "s3://$BUCKET_NAME/$BACKUP_PREFIX/" | grep '\.dump$' | sort
