#!/bin/sh
set -eu
cd "$(dirname "$0")/.."

test_image=${1:-clinic-frontend:test}
test_container="clinic-image-tests-$$"
response_file=$(mktemp)
cleanup() {
  result=$?
  trap - EXIT
  if [ "$result" -ne 0 ]; then docker logs "$test_container" 2>/dev/null || true; fi
  docker rm --force "$test_container" >/dev/null 2>&1 || true
  rm -f "$response_file"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

docker build --tag "$test_image" frontend
docker run --detach --name "$test_container" --publish 127.0.0.1::8080 "$test_image" >/dev/null
image_address=$(docker port "$test_container" 8080/tcp)

attempt=0
until curl --fail --silent "http://$image_address/healthz" > "$response_file"; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then printf '%s\n' 'Image did not become healthy.' >&2; exit 1; fi
  sleep 1
done
grep -qx ok "$response_file"
curl --fail --silent --show-error "http://$image_address/" > "$response_file"
grep -q '<div id="root"></div>' "$response_file"
asset_path=$(sed -n 's/.*src="\([^"]*\/assets\/[^\"]*\.js\)".*/\1/p' "$response_file")
test -n "$asset_path"
curl --fail --silent --show-error "http://$image_address$asset_path" > /dev/null
curl --fail --silent --show-error "http://$image_address/?queue=smoke-test" > "$response_file"
grep -q '<div id="root"></div>' "$response_file"
test "$(docker inspect --format '{{.Config.User}}' "$test_container")" = nginx
printf '%s\n' 'Production image health, HTML, JavaScript, check-in route and non-root user checks passed.'
