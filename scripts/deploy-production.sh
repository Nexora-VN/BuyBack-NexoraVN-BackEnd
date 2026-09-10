#!/usr/bin/env bash
# Run on the production VPS, as deploy, via SSH stdin. Never source application env.
set -Eeuo pipefail
umask 077

service="${1:?service required}"
image="${2:?immutable image required}"
revision="${3:?commit SHA required}"
run_number="${4:?workflow run number required}"
deploy_dir=/home/deploy/buyback
case "$service" in
  backend) expected_repo=ghcr.io/nexora-vn/buyback-nexoravn-backend ;;
  frontend) expected_repo=ghcr.io/nexora-vn/buyback-nexoravn-frontend ;;
  *) echo "Unsupported service" >&2; exit 2 ;;
esac
[[ "$image" == "$expected_repo@sha256:"* && "${image##*@sha256:}" =~ ^[a-f0-9]{64}$ ]] || { echo "Invalid image digest" >&2; exit 2; }
[[ "$revision" =~ ^[a-f0-9]{40}$ && "$run_number" =~ ^[0-9]+$ ]] || exit 2
cd "$deploy_dir"
test -f docker-compose.yml
command -v flock >/dev/null
# Shared across BOTH repositories. Never cancel an active DB migration.
exec 9>"$deploy_dir/.deploy.lock"
flock -w 900 9 || { echo "Deployment lock timed out" >&2; exit 1; }
mkdir -p "$deploy_dir/.deploy-state"
state="$deploy_dir/.deploy-state/$service"
if [[ -f "$state.last-attempt" ]]; then
  read -r last_run < "$state.last-attempt"
  [[ "$last_run" =~ ^[0-9]+$ ]] || { echo "Invalid deploy state" >&2; exit 1; }
  if (( run_number < last_run )); then
    echo "Skipping superseded deployment"; exit 0
  fi
fi
# Require the existing stack rather than silently creating a different project/network.
docker network inspect buyback-network >/dev/null
actual_service=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.service"}}' "buyback-$service")
actual_project=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "buyback-$service")
[[ "$actual_service" == "$service" && "$actual_project" == buyback ]] || { echo "Unexpected production container" >&2; exit 1; }
previous_image=$(docker inspect --format '{{.Image}}' "buyback-$service")
printf '%s\n' "$previous_image" > "$state.previous-image"
printf '%s\n' "$run_number" > "$state.last-attempt"

override=$(mktemp "$deploy_dir/.deploy-$service.XXXXXX.json")
cleanup() { rm -f -- "$override"; }
trap cleanup EXIT
printf '{"services":{"%s":{"image":"%s"}}}\n' "$service" "$image" > "$override"
compose=(docker compose --project-directory "$deploy_dir" -p buyback -f "$deploy_dir/docker-compose.yml" -f "$override")
# Quiet validation: docker compose config without -q can expose resolved env secrets.
"${compose[@]}" config -q
echo "Pulling $service image for $revision"
docker pull "$image"
if [[ "$service" == backend ]]; then
  test -f "$deploy_dir/backend/.env.prod"
  echo "Applying committed Prisma migrations; old backend remains running."
  # This one-off container uses the new image and existing env/network; it does not start dependencies.
  if ! "${compose[@]}" run --rm --no-deps -T --entrypoint pnpm backend prisma migrate deploy; then
    echo "MIGRATION FAILED: application containers have not been replaced. Fix the migration; no DB rollback attempted." >&2
    exit 1
  fi
fi
echo "Updating only $service"
if ! "${compose[@]}" up -d --no-deps --no-build --pull never --wait --wait-timeout 180 "$service"; then
  echo "DEPLOY FAILED: inspect buyback-$service on VPS. No automatic rollback. Previous image: $previous_image" >&2
  exit 1
fi
actual_image=$(docker inspect --format '{{.Image}}' "buyback-$service")
expected_image=$(docker image inspect --format '{{.Id}}' "$image")
[[ "$actual_image" == "$expected_image" ]] || { echo "Running image differs from release" >&2; exit 1; }
health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "buyback-$service")
[[ "$health" == healthy ]] || { echo "Healthcheck not healthy: $health" >&2; exit 1; }
# Retain the successful override for operator restarts/rollback; original compose is untouched.
cp "$override" "$state.compose.json"
printf '%s\n' "$image" > "$state.image"
printf '%s\n' "$revision" > "$state.sha"
echo "DEPLOY SUCCESS: $service $revision"
