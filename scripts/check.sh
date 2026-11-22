#!/usr/bin/env bash
# Local mirror of .github/workflows/ci.yml: tsc, vitest, gitleaks over this branch's commits.
# Every step runs even when one fails; exit 0 only when all steps passed ("skipped" is not a pass).
set -u

usage() {
  cat <<'EOF'
Usage: npm run check -- [--build] [--pr <number>]

  --build        also run `npm run build` (off by default: it overwrites .next of a dev server
                 running in the same checkout)
  --pr <number>  post the result as a comment on that pull request (gh pr comment)
EOF
}

build=0
pr=""
while [ $# -gt 0 ]; do
  case "$1" in
    --build) build=1 ;;
    --pr)
      [ $# -ge 2 ] || { usage >&2; exit 2; }
      pr="$2"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
  shift
done

cd "$(git rev-parse --show-toplevel)" || exit 2

results=()
all_pass=1

# run_step <label> <command...>: exit 0 = pass, 3 = skipped, anything else = fail.
run_step() {
  local label="$1"; shift
  local start end status
  echo "==> $label"
  start=$(date +%s)
  "$@"
  status=$?
  end=$(date +%s)
  case $status in
    0) status=pass ;;
    3) status=skipped; all_pass=0 ;;
    *) status=fail; all_pass=0 ;;
  esac
  echo "<== $label: $status ($((end - start)) s)"
  echo
  results+=("$label|$status|$((end - start))")
}

gitleaks_branch() {
  if ! git rev-parse --verify --quiet origin/main >/dev/null; then
    echo "origin/main not found (git fetch origin)"
    return 1
  fi
  if command -v gitleaks >/dev/null 2>&1; then
    git log -p origin/main..HEAD | gitleaks stdin --no-banner
  elif command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    git log -p origin/main..HEAD | docker run --rm -i ghcr.io/gitleaks/gitleaks:latest stdin --no-banner
  else
    echo "neither gitleaks nor a running docker found"
    return 3
  fi
}

run_step "tsc" npx tsc --noEmit
run_step "vitest" npx vitest run
run_step "gitleaks" gitleaks_branch
[ $build -eq 1 ] && run_step "build" npm run build

sha=$(git rev-parse --short HEAD)
if [ $all_pass -eq 1 ]; then overall=pass; else overall=fail; fi

echo "Summary for $sha:"
for r in "${results[@]}"; do
  IFS='|' read -r label status secs <<< "$r"
  printf '  %-9s %-8s %s s\n' "$label" "$status" "$secs"
done
echo "Overall: $overall"

if [ -n "$pr" ]; then
  body="### Lokale Prüfung

Commit \`$sha\`

| Schritt | Ergebnis | Dauer |
|---|---|---|"
  for r in "${results[@]}"; do
    IFS='|' read -r label status secs <<< "$r"
    body="$body
| $label | $status | $secs s |"
  done
  body="$body

Gesamt: **$overall**"
  gh pr comment "$pr" --body "$body" || { echo "Posting the comment failed" >&2; exit 1; }
fi

[ $all_pass -eq 1 ]
