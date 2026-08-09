#!/usr/bin/env bash
#
# Push production environment variables to Vercel from a local file.
#
# Setting ~25 variables by hand in the dashboard is where typos come from, and a
# typo in GENERATION_WEBHOOK_SECRET fails silently *after* a clip has been paid
# for. This reads a gitignored file and pushes each value.
#
#   1. cp deploy/production.env.template deploy/production.env
#   2. fill in deploy/production.env   (gitignored — never commit it)
#   3. npx vercel login && npx vercel link
#   4. bash deploy/vercel-env.sh
#
# Re-runnable: existing values are removed and re-added, so this is also how you
# change one later.

set -euo pipefail

ENV_FILE="${1:-deploy/production.env}"
TARGET="${2:-production}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "No such file: $ENV_FILE"
  echo "Start from the template:  cp deploy/production.env.template $ENV_FILE"
  exit 1
fi

if ! npx vercel whoami >/dev/null 2>&1; then
  echo "Not logged in to Vercel. Run:  npx vercel login"
  exit 1
fi

echo "Pushing $ENV_FILE → Vercel ($TARGET)"
echo

pushed=0
skipped=0

while IFS= read -r line || [[ -n "$line" ]]; do
  # Skip blanks and comments
  [[ -z "${line// }" ]] && continue
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  [[ "$line" != *"="* ]] && continue

  key="${line%%=*}"
  value="${line#*=}"

  # Trim whitespace and surrounding quotes
  key="$(echo -n "$key" | tr -d '[:space:]')"
  value="$(echo -n "$value" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/")"

  if [[ -z "$value" ]]; then
    echo "  SKIP  $key  (empty)"
    skipped=$((skipped + 1))
    continue
  fi

  # Remove first so re-runs update rather than erroring on a duplicate.
  npx vercel env rm "$key" "$TARGET" --yes >/dev/null 2>&1 || true
  printf '%s' "$value" | npx vercel env add "$key" "$TARGET" >/dev/null 2>&1

  # Never echo the value — this output tends to end up in scrollback.
  echo "  ok    $key"
  pushed=$((pushed + 1))
done < "$ENV_FILE"

echo
echo "$pushed pushed, $skipped skipped (empty)."
echo
if [[ $skipped -gt 0 ]]; then
  echo "Fill the skipped values and re-run — anything empty is a variable the app"
  echo "will read as undefined at runtime."
fi
echo "Redeploy for these to take effect:  npx vercel --prod"
