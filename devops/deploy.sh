#!/bin/bash

# Deploy the pushed image to Google Cloud Run.
#
#   ./devops/deploy.sh
#   TAG=v2 ./devops/deploy.sh
#
# Env vars for the service live in config.sh (APP_ENV array).

set -e
source "$(dirname "$0")/config.sh"

# Join APP_ENV with ';;' and use gcloud's custom-delimiter syntax so values
# may contain commas and '@' (e.g. connection strings)
ENV_VARS=""
for kv in "${APP_ENV[@]}"; do
  ENV_VARS="${ENV_VARS:+${ENV_VARS};;}${kv}"
done

echo "Deploying ${IMAGE}:${TAG} to Cloud Run service ${SERVICE_NAME} (${REGION})..."
gcloud run deploy "$SERVICE_NAME" \
  --project "$GCP_PROJECT" \
  --region "$REGION" \
  --image "${IMAGE}:${TAG}" \
  --allow-unauthenticated \
  --memory "$MEMORY" \
  --cpu "$CPU" \
  --min-instances "$MIN_INSTANCES" \
  --max-instances "$MAX_INSTANCES" \
  --set-env-vars "^;;^${ENV_VARS}"

gcloud run services describe "$SERVICE_NAME" \
  --project "$GCP_PROJECT" \
  --region "$REGION" \
  --format 'value(status.url)'
