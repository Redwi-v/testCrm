#!/bin/sh
set -eu

envsubst '${SUPABASE_URL} ${SUPABASE_ANON_KEY}' \
  < /usr/share/nginx/html/runtime-config.template.js \
  > /usr/share/nginx/html/runtime-config.js
