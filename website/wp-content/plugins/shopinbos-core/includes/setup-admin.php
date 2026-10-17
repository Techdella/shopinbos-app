<?php
/**
 * Tools > Shopinbos setup: runs the same steps as `wp shopinbos setup` from the dashboard, for hosts
 * where SSH isn't to hand (upload the theme and plugin in the file manager, then press the button).
 * Safe to repeat: pages someone has edited are left alone.
 */

defined( 'ABSPATH' ) || exit;

add_action( 'admin_menu', function () {
	add_management_page( __( 'Shopinbos setup', 'shopinbos' ), __( 'Shopinbos setup', 'shopinbos' ), 'manage_options', 'sib-setup', 'sib_setup_admin_page' );
} );

function sib_setup_admin_page(): void {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$log = null;
	if ( isset( $_POST['sib_run_setup'] ) && check_admin_referer( 'sib_run_setup' ) ) {
		$log = sib_run_setup_from_admin();
	}
	?>
	<div class="wrap">
		<h1><?php esc_html_e( 'Shopinbos setup', 'shopinbos' ); ?></h1>
		<p><?php esc_html_e( 'Builds the site pages, help articles, guides, comparisons and templates from the theme and plugin you uploaded. Run it after every upload. Pages someone has edited by hand are left alone.', 'shopinbos' ); ?></p>
		<form method="post">
			<?php wp_nonce_field( 'sib_run_setup' ); ?>
			<p><button type="submit" name="sib_run_setup" value="1" class="button button-primary"><?php esc_html_e( 'Run setup', 'shopinbos' ); ?></button></p>
		</form>
		<?php if ( null !== $log ) : ?>
			<h2><?php esc_html_e( 'Result', 'shopinbos' ); ?></h2>
			<pre style="background:#fff;border:1px solid #ccd0d4;padding:12px;max-height:480px;overflow:auto;white-space:pre-wrap"><?php echo esc_html( implode( "\n", $log ) ); ?></pre>
		<?php endif; ?>
	</div>
	<?php
}

/** Run Sib_CLI::setup() with a small stand-in for WP_CLI's output functions. Returns the log lines. */
function sib_run_setup_from_admin(): array {
	if ( ! class_exists( 'WP_CLI' ) ) {
		// phpcs:ignore Generic.Files.OneObjectStructurePerFile
		eval( 'class WP_CLI { public static $out = []; public static function log( $m ) { self::$out[] = $m; } public static function success( $m ) { self::$out[] = "Success: " . $m; } public static function warning( $m ) { self::$out[] = "Warning: " . $m; } public static function error( $m ) { throw new RuntimeException( $m ); } public static function add_command( ...$a ) {} }' ); // phpcs:ignore Squiz.PHP.Eval
	}
	if ( ! property_exists( 'WP_CLI', 'out' ) ) {
		return [ 'Run "wp shopinbos setup" from WP-CLI instead.' ];
	}
	require_once SIB_CORE_DIR . '/includes/cli.php';
	if ( function_exists( 'set_time_limit' ) ) {
		@set_time_limit( 600 ); // phpcs:ignore WordPress.PHP.NoSilencedErrors
	}
	try {
		( new Sib_CLI() )->setup( [], [] );
	} catch ( Throwable $e ) {
		WP_CLI::$out[] = 'Error: ' . $e->getMessage();
	}
	if ( function_exists( 'do_action' ) ) {
		do_action( 'litespeed_purge_all' );
	}
	return WP_CLI::$out ?: [ 'Done.' ];
}
