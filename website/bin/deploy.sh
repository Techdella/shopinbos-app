#!/usr/bin/env bash
# Deploy the Shopinbos theme and plugin to Hostinger over SSH (staging first, then production).
#
#   SSH_TARGET=u123456@srv.hostinger.com SSH_PORT=65002 WP_PATH=domains/staging.shopinbos.com/public_html website/bin/deploy.sh
#   (optional) SSH_KEY_FILE=~/.ssh/id_hostinger
# The GitHub Actions workflow .github/workflows/website-deploy.yml runs this with repository secrets.
#
# Only wp-content/themes/shopinbos and wp-content/plugins/shopinbos-core are uploaded. WordPress core,
# other plugins, uploads and wp-config.php are managed on the server (Hostinger auto-updates).
set -euo pipefail
: "${SSH_TARGET:?set SSH_TARGET, e.g. u123456@srv123.hostinger.com}"
: "${WP_PATH:?set WP_PATH, e.g. domains/shopinbos.com/public_html}"
PORT="${SSH_PORT:-65002}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
SSH="ssh -p $PORT"
if [ -n "${SSH_KEY_FILE:-}" ]; then
  SSH="$SSH -i ${SSH_KEY_FILE/#\~/$HOME} -o IdentitiesOnly=yes"
fi

find "$HERE/wp-content" -name '*.php' -print0 | xargs -0 -n1 php -l > /dev/null

for dir in themes/shopinbos plugins/shopinbos-core; do
  rsync -az --delete -e "$SSH" "$HERE/wp-content/$dir/" "$SSH_TARGET:$WP_PATH/wp-content/$dir/"
done

# Flush rewrites (new routes), clear LiteSpeed cache if present.
$SSH "$SSH_TARGET" "cd $WP_PATH && wp rewrite flush && (wp litespeed-purge all 2>/dev/null || true)"
echo "Deployed to $SSH_TARGET:$WP_PATH"
