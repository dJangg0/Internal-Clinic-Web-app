#!/bin/sh
# Exercise a fresh, isolated stack; never reuse the developer's database volumes.
set -eu
cd "$(dirname "$0")/.."

test_project="clinic-tests-$$"
response_file=$(mktemp)
export POSTGRES_DB=clinic_test POSTGRES_USER=clinic_test
export POSTGRES_PASSWORD=isolated-postgres-test-password
export REDIS_PASSWORD=isolated-redis-test-password
export FRONTEND_PORT=0 BACKEND_PORT=0 POSTGRES_PORT=0 REDIS_PORT=0

compose() {
  docker compose --file docker-compose.yml --project-name "$test_project" --env-file /dev/null "$@"
}

cleanup() {
  result=$?
  trap - EXIT
  if [ "$result" -ne 0 ]; then compose logs --no-color || true; fi
  compose down --volumes --remove-orphans >/dev/null || true
  rm -f "$response_file"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

compose config --quiet
compose up --detach --wait --wait-timeout 240
compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 < db/tests/regression.sql
compose exec -T redis sh -c 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli ping' | grep -qx PONG
frontend_address=$(compose port frontend 5173)
curl --fail --silent --show-error "http://$frontend_address/" > "$response_file"
grep -q '<div id="root"></div>' "$response_file"
printf '%s\n' 'Compose, PostgreSQL regressions, Redis and frontend smoke checks passed.'
