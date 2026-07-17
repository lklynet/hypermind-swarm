#!/bin/sh

set -eu

image="${1:?usage: $0 IMAGE}"
suffix="$$"
volume="hypermind-storage-upgrade-${suffix}"
seed_container="hypermind-storage-seed-${suffix}"
test_container="hypermind-storage-test-${suffix}"

cleanup() {
  docker rm -f "$seed_container" "$test_container" >/dev/null 2>&1 || true
  docker volume rm "$volume" >/dev/null 2>&1 || true
}

trap cleanup EXIT INT TERM

wait_for_start() {
  container="$1"

  i=0
  while [ "$i" -lt 30 ]; do
    if docker logs "$container" 2>&1 | grep -Fq "Hypermind Node running"; then
      return 0
    fi

    if [ "$(docker inspect -f '{{.State.Running}}' "$container" 2>/dev/null || true)" != "true" ]; then
      docker logs "$container" 2>&1 || true
      return 1
    fi

    i=$((i + 1))
    sleep 1
  done

  docker logs "$container" 2>&1 || true
  return 1
}

docker volume create "$volume" >/dev/null

# Simulate storage created by releases that ran the application as root.
docker run -d --name "$seed_container" \
  --user root \
  --entrypoint node \
  -e HOST=127.0.0.1 \
  -e STORAGE_PATH=/app/storage \
  -e POW_PREFIX=0 \
  -e VERIFICATION_POW_PREFIX=0 \
  -v "$volume":/app/storage \
  "$image" server.js >/dev/null

wait_for_start "$seed_container"
docker rm -f "$seed_container" >/dev/null

owner_before=$(docker run --rm --user root --entrypoint stat \
  -v "$volume":/app/storage "$image" -c '%u' /app/storage/CORESTORE)
test "$owner_before" = "0"

# The current image must migrate that storage and still run the server as node.
docker run -d --name "$test_container" \
  -e HOST=127.0.0.1 \
  -e STORAGE_PATH=/app/storage \
  -e POW_PREFIX=0 \
  -e VERIFICATION_POW_PREFIX=0 \
  -v "$volume":/app/storage \
  "$image" >/dev/null

wait_for_start "$test_container"

owner_after=$(docker run --rm --user root --entrypoint stat \
  -v "$volume":/app/storage "$image" -c '%u' /app/storage/CORESTORE)
test "$owner_after" = "1000"

pid_one_uid=$(docker exec "$test_container" sh -c "sed -n 's/^Uid:[[:space:]]*\\([0-9]*\\).*/\\1/p' /proc/1/status")
test "$pid_one_uid" = "1000"

echo "Existing root-owned storage migrated; application is running as UID 1000"
