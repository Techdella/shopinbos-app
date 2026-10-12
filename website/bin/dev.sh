#!/usr/bin/env bash
# Local WordPress for the Shopinbos website: PHP's built-in server + SQLite, no MySQL needed.
#   website/bin/dev.sh            install (first run) and serve on http://localhost:8088
#   PORT=9000 website/bin/dev.sh  another port
# Everything lives in website/.dev (git-ignored). Delete that folder to start over.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
DEV="$HERE/.dev"
PORT="${PORT:-8088}"
URL="http://localhost:$PORT"
WP="php $DEV/wp-cli.phar --path=$DEV/wp"
[ "$(id -u)" = "0" ] && WP="$WP --allow-root"

mkdir -p "$DEV"
if [ ! -f "$DEV/wp-cli.phar" ]; then
  curl -sSL -o "$DEV/wp-cli.phar" https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar
fi
if [ ! -d "$DEV/wp" ]; then
  $WP core download --locale=en_US --skip-content
  mkdir -p "$DEV/wp/wp-content/plugins" "$DEV/wp/wp-content/themes" "$DEV/wp/wp-content/uploads"
  curl -sSL -o "$DEV/sqlite.zip" https://downloads.wordpress.org/plugin/sqlite-database-integration.latest-stable.zip
  (cd "$DEV/wp/wp-content/plugins" && unzip -q "$DEV/sqlite.zip")
  cp "$DEV/wp/wp-content/plugins/sqlite-database-integration/db.copy" "$DEV/wp/wp-content/db.php"
  sed -i "s#{SQLITE_IMPLEMENTATION_FOLDER_PATH}#$DEV/wp/wp-content/plugins/sqlite-database-integration#; s#{SQLITE_PLUGIN}#sqlite-database-integration/load.php#" "$DEV/wp/wp-content/db.php"
  ln -s "$HERE/wp-content/themes/shopinbos" "$DEV/wp/wp-content/themes/shopinbos"
  ln -s "$HERE/wp-content/plugins/shopinbos-core" "$DEV/wp/wp-content/plugins/shopinbos-core"
  $WP config create --dbname=wp --dbuser=wp --dbpass=wp --skip-check --extra-php <<PHP
define( 'WP_DEBUG', true );
define( 'WP_DEBUG_LOG', true );
define( 'WP_DEBUG_DISPLAY', false );
define( 'WP_ENVIRONMENT_TYPE', 'local' );
PHP
  $WP core install --url="$URL" --title="Shopinbos" --admin_user=admin --admin_password=admin --admin_email=dev@example.com --skip-email
  $WP option update home "$URL"
  $WP option update siteurl "$URL"
  $WP theme activate shopinbos
  $WP plugin activate sqlite-database-integration shopinbos-core
  $WP option patch insert sib_settings demo_mode 1 2>/dev/null || $WP option update sib_settings '{"demo_mode":"1"}' --format=json
  $WP shopinbos setup --samples
fi
[ "${1:-}" = "--no-serve" ] && exit 0
echo "Shopinbos website on $URL (admin / admin)"
cd "$DEV/wp" && exec php -S "localhost:$PORT" "$HERE/bin/router.php"
