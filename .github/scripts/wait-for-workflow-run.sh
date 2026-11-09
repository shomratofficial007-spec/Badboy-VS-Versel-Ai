#!/usr/bin/env bash
set -euo pipefail

: "${GH_TOKEN:?GH_TOKEN is required}"
: "${WORKFLOW_NAME:?WORKFLOW_NAME is required}"
: "${PR_HEAD_SHA:?PR_HEAD_SHA is required}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"

api_url="https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/runs?head_sha=${PR_HEAD_SHA}&event=pull_request&per_page=100"

for attempt in $(seq 1 36); do
  response="$(curl --silent --show-error --fail \
    -H "Authorization: Bearer ${GH_TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "${api_url}")"

  run="$(jq -c --arg name "${WORKFLOW_NAME}" \
    '[.workflow_runs[] | select(.name == $name)] | sort_by(.run_started_at) | last // empty' \
    <<< "${response}")"

  if [[ -n "${run}" ]]; then
    status="$(jq -r '.status' <<< "${run}")"
    conclusion="$(jq -r '.conclusion // empty' <<< "${run}")"
    run_url="$(jq -r '.html_url' <<< "${run}")"
    echo "Found ${WORKFLOW_NAME}: status=${status}, conclusion=${conclusion}, url=${run_url}"

    if [[ "${status}" == "completed" ]]; then
      if [[ "${conclusion}" == "success" ]]; then
        exit 0
      fi
      echo "::error::Upstream workflow '${WORKFLOW_NAME}' concluded '${conclusion}'."
      exit 1
    fi
  else
    echo "Waiting for upstream workflow '${WORKFLOW_NAME}' to start (attempt ${attempt}/36)."
  fi

  sleep 10
done

echo "::error::Timed out waiting for upstream workflow '${WORKFLOW_NAME}'."
exit 1
