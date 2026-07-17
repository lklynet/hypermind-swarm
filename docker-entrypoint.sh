#!/bin/sh

set -eu

if [ "$(id -u)" = "0" ]; then
  storage_path="${STORAGE_PATH:-./storage}"

  mkdir -p -- "$storage_path"
  chown -R node:node -- "$storage_path"

  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi

exec "$@"
