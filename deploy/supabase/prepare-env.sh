#!/bin/sh
set -eu

cd "$(dirname "$0")"

if [ -e .env ]; then
  echo ".env already exists; keeping it unchanged."
  exit 1
fi

cp .env.example .env
sh utils/generate-keys.sh --update-env
sh utils/add-new-auth-keys.sh --update-env
echo
echo "Generated private secrets in deploy/supabase/.env."
echo "Set DASHBOARD_USERNAME, APP_IMAGE, and your public host in SUPABASE_PUBLIC_URL, API_EXTERNAL_URL, SITE_URL, and ADDITIONAL_REDIRECT_URLS."
echo "Keep this .env file private and back it up securely."
