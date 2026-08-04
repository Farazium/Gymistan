#!/usr/bin/env bash
# Tell Bing (and the other IndexNow engines) that the public pages changed, instead
# of waiting for a crawler to notice. Run it after a deploy that touched anything
# a visitor can see without logging in:
#
#     bash scripts/ping-indexnow.sh
#
# How it works: the key below is also served as a plain-text file at the URL in
# KEY_LOCATION, which is how the search engine proves the request came from
# someone who controls the site. Key file lives in frontend/public/, so
# `npm run build` copies it into dist/ and nginx serves it from the site root —
# if it ever 404s, the pings are silently ignored.
#
# Only the pages a search engine is allowed to have are listed: the landing page
# and the demo. Everything else sits behind a login and is disallowed in
# robots.txt; submitting those would be pointless at best.
set -euo pipefail

HOST="gymistan.dev"
KEY="810c9b7b55aeee6f50613d61dbda8df5"
KEY_LOCATION="https://${HOST}/${KEY}.txt"
URLS='["https://gymistan.dev/","https://gymistan.dev/demo"]'

echo "checking the key file is live…"
if ! curl -fsS "$KEY_LOCATION" | grep -qx "$KEY"; then
  echo "ABORT: $KEY_LOCATION does not serve the key — deploy first." >&2
  exit 1
fi

echo "submitting to IndexNow…"
code=$(curl -s -o /tmp/indexnow-response -w '%{http_code}' \
  -X POST 'https://api.indexnow.org/indexnow' \
  -H 'Content-Type: application/json; charset=utf-8' \
  -d "{\"host\":\"${HOST}\",\"key\":\"${KEY}\",\"keyLocation\":\"${KEY_LOCATION}\",\"urlList\":${URLS}}")

# 200 = accepted, 202 = accepted but the key is still being verified. Anything
# else is a real refusal and worth reading.
case "$code" in
  200|202) echo "accepted (HTTP $code)" ;;
  *) echo "REFUSED (HTTP $code):" >&2; cat /tmp/indexnow-response >&2; echo >&2; exit 1 ;;
esac
