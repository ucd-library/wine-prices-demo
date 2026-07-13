#!/bin/bash

# Central Google Cloud Run deployment configuration.
# Sourced by build.sh and deploy.sh — edit values here, not in the scripts.

GCP_PROJECT="ucdlib-dams"
REGION="us-west1"
SERVICE_NAME="wine-prices-app"
IMAGE="us-west1-docker.pkg.dev/ucdlib-dams/pub/wine-prices-app"

# Image tag — override per-invocation with: TAG=v1 ./build.sh
TAG="${TAG:-main}"

# Cloud Run service sizing
MEMORY="1Gi"
CPU="1"
MIN_INSTANCES="0"
MAX_INSTANCES="2"

# Environment variables set on the Cloud Run service. One KEY=VALUE per
# array entry. PORT is injected by Cloud Run — do not set it here.
# pgfarm-public is the well-known readonly public user, safe to commit.
APP_ENV=(
  "DATABASE_URL=postgresql://pgfarm-public:go-aggies@pgfarm.library.ucdavis.edu:5432/library/wine-prices?sslmode=require"
  "SEARCH_MODE=simple"
  "GCS_BUCKET=wine-prices"
)
