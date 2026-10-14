<?php
/**
 * Plugin Name: Shopinbos Core
 * Description: Marketplace pages read from the Shopinbos app, content types, free tools, gated downloads, sign-up links that carry intent into the app, schema and sitemaps.
 * Version: 1.0.0
 * Requires at least: 6.5
 * Requires PHP: 8.1
 * Author: Techdella
 * License: Proprietary
 * Text Domain: shopinbos
 */

defined( 'ABSPATH' ) || exit;

define( 'SIB_CORE_VERSION', '1.0.0' );
define( 'SIB_CORE_FILE', __FILE__ );
define( 'SIB_CORE_DIR', __DIR__ );
define( 'SIB_CORE_URL', plugin_dir_url( __FILE__ ) );

foreach ( [
	'helpers',
	'settings',
	'api',
	'demo-data',
	'marketplace',
	'go',
	'content-types',
	'meta',
	'blocks',
	'article-blocks',
	'blog',
	'legal',
	'schema',
	'seo',
	'sitemaps',
	'tools',
	'leads',
	'help',
	'security',
	'analytics',
] as $file ) {
	require_once SIB_CORE_DIR . "/includes/{$file}.php";
}

if ( defined( 'WP_CLI' ) && WP_CLI ) {
	require_once SIB_CORE_DIR . '/includes/cli.php';
}

register_activation_hook( __FILE__, function () {
	sib_register_content_types();
	sib_marketplace_rewrite_rules();
	sib_go_rewrite_rules();
	sib_leads_rewrite_rules();
	flush_rewrite_rules();
	if ( ! wp_next_scheduled( 'sib_nightly_sitemap' ) ) {
		wp_schedule_event( strtotime( 'tomorrow 02:30' ), 'daily', 'sib_nightly_sitemap' );
	}
	sib_private_dir(); // creates the protected folder for gated PDFs
} );

register_deactivation_hook( __FILE__, function () {
	wp_clear_scheduled_hook( 'sib_nightly_sitemap' );
	flush_rewrite_rules();
} );
