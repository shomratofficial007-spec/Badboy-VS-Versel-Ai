#!/usr/bin/env bash
set -euo pipefail

: "${GH_TOKEN:?GH_TOKEN is required}"
: "${WORKFLOW_NAMES:?WORKFLOW_NAMES is required}"
: "${PR_HEAD_SHA:?PR_HEAD_SHA is required}"
: "${PR_NUMBER:?PR_NUMBER is required}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
: "${APK_WORKFLOW_NAMES:?APK_WORKFLOW_NAMES is required}"

api_url="https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/runs?head_sha=${PR_HEAD_SHA}&event=pull_request&per_page=100"
files_url="https://api.github.com/repos/${GITHUB_REPOSITORY}/pulls/${PR_NUMBER}/files"
changed_files=""
for page in $(seq 1 10); do
  page_response="$(curl --silent --show-error --fail \
    -H "Authorization: Bearer ${GH_TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "${files_url}?per_page=100&page=${page}")"
  page_files="$(jq -r '.[].filename' <<< "${page_response}")"
  changed_files+=$'\n'${page_files}
  page_count="$(jq 'length' <<< "${page_response}")"
  if [[ "${page_count}" -lt 100 ]]; then
    break
  fi
done

# Match the actual path filters of the mobile and APK workflows. A workflow
# that GitHub will not trigger for this PR must not be treated as required.
mobile_scope=false
android_scope=false
if grep -Eq '^(artifacts/mobile/|functions/|wrangler\.json$|artifacts/mobile/wrangler\.json$|lib/|package\.json$|pnpm-lock\.yaml$|pnpm-workspace\.yaml$|\.github/workflows/(mobile-checks|android-apk|android-apk-free)\.yml$)' <<< "${changed_files}"; then
  mobile_scope=true
fi
if grep -Eq '^(artifacts/mobile/|functions/|wrangler\.json$|package\.json$|pnpm-lock\.yaml$|pnpm-workspace\.yaml$|\.github/workflows/(android-apk|android-apk-free)\.yml$)' <<< "${changed_files}"; then
  android_scope=true
fi

IFS=';' read -r -a configured_workflows <<< "${WORKFLOW_NAMES}"
IFS='|' read -r -a apk_workflows <<< "${APK_WORKFLOW_NAMES}"
required_workflows=()
for workflow_name in "${configured_workflows[@]}"; do
  case "${workflow_name}" in
    "Mobile checks")
      if [[ "${mobile_scope}" != true ]]; then
        echo "Skipping Mobile checks: no mobile/backend-scoped files changed."
        continue
      fi
      ;;
  esac
  required_workflows+=("${workflow_name}")
done

if [[ "${#required_workflows[@]}" -eq 0 && "${android_scope}" != true ]]; then
  echo "No applicable upstream workflows were selected."
  exit 0
fi

for attempt in $(seq 1 360); do
  response="$(curl --silent --show-error --fail \
    -H "Authorization: Bearer ${GH_TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "${api_url}")"

  pending=0
  failed=0
  for workflow_name in "${required_workflows[@]}"; do
    run="$(jq -c --arg name "${workflow_name}" \
      -f .github/scripts/select-latest-workflow-run.jq \
      <<< "${response}")"

    if [[ -z "${run}" ]]; then
      echo "Waiting for '${workflow_name}' to be created for ${PR_HEAD_SHA}."
      pending=$((pending + 1))
      continue
    fi

    status="$(jq -r '.status' <<< "${run}")"
    conclusion="$(jq -r '.conclusion // empty' <<< "${run}")"
    run_url="$(jq -r '.html_url' <<< "${run}")"
    echo "${workflow_name}: status=${status}, conclusion=${conclusion}, url=${run_url}"

    if [[ "${status}" != "completed" ]]; then
      pending=$((pending + 1))
    elif [[ "${conclusion}" != "success" ]]; then
      echo "::error::Upstream workflow '${workflow_name}' concluded '${conclusion}'."
      failed=$((failed + 1))
    fi
  done

  if [[ "${android_scope}" == true ]]; then
    apk_found=0
    apk_pending=0
    apk_failed=0
    for workflow_name in "${apk_workflows[@]}"; do
      run="$(jq -c --arg name "${workflow_name}" \
        -f .github/scripts/select-latest-workflow-run.jq \
        <<< "${response}")"
      if [[ -z "${run}" ]]; then
        continue
      fi

      apk_found=$((apk_found + 1))
      status="$(jq -r '.status' <<< "${run}")"
      conclusion="$(jq -r '.conclusion // empty' <<< "${run}")"
      run_url="$(jq -r '.html_url' <<< "${run}")"
      echo "APK alternative ${workflow_name}: status=${status}, conclusion=${conclusion}, url=${run_url}"

      if [[ "${status}" != "completed" ]]; then
        apk_pending=$((apk_pending + 1))
      elif [[ "${conclusion}" != "success" ]]; then
        echo "::error::APK workflow '${workflow_name}' concluded '${conclusion}'."
        apk_failed=$((apk_failed + 1))
      fi
    done

    if [[ "${apk_found}" -eq 0 ]]; then
      echo "Waiting for either APK workflow to be created for ${PR_HEAD_SHA}."
      pending=$((pending + 1))
    elif [[ "${apk_failed}" -gt 0 ]]; then
      failed=$((failed + apk_failed))
    elif [[ "${apk_pending}" -gt 0 ]]; then
      pending=$((pending + apk_pending))
    else
      echo "At least one applicable APK workflow ran; all triggered APK workflows passed."
    fi
  fi

  if [[ "${failed}" -gt 0 ]]; then
    exit 1
  fi
  if [[ "${pending}" -eq 0 ]]; then
    echo "All applicable upstream workflows passed for ${PR_HEAD_SHA}."
    exit 0
  fi

  echo "Waiting for ${pending} applicable upstream workflow(s) (attempt ${attempt}/360)."
  sleep 10
done

echo "::error::Timed out waiting for applicable upstream workflows."
exit 1
