#!/bin/sh
set -eu

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  echo "Usage: $0 DOCKERHUB_USER/IMAGE_NAME [TAG]" >&2
  exit 2
fi

image="$1"
tag="${2:-latest}"
docker buildx build --platform linux/amd64 -f Dockerfile -t "${image}:${tag}" --push .
