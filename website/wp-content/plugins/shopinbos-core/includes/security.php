<?php
/**
 * Hardening from the plan: no XML-RPC, no file editing in the dashboard, limited login attempts,
 * no user enumeration, sensible security headers. Two-step login comes from Wordfence or
 * Solid Security (see website/README.md).
 */

defined( 'ABSPATH' ) || exit;

if ( ! defined( 'DISALLOW_FILE_EDIT' ) ) {
	define( 'DISALLOW_FILE_EDIT', true );
}

add_filter( 'xmlrpc_enabled', '__return_false' );
add_filter( 'xmlrpc_methods', '__return_empty_array' );
add_filter( 'wp_headers', function ( $h ) {
	unset( $h['X-Pingback'] );
	return $h;
} );

add_action( 'send_headers', function () {
	if ( is_admin() ) {
		return;
	}
	header( 'X-Content-Type-Options: nosniff' );
	header( 'Referrer-Policy: strict-origin-when-cross-origin' );
	header( 'X-Frame-Options: SAMEORIGIN' );
	header( 'Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()' );
} );

/* Limit login attempts: 5 failures per IP in 15 minutes, then a 15-minute lockout. */
add_action( 'wp_login_failed', function () {
	$key = 'sib_login_' . md5( sib_client_ip() );
	set_transient( $key, (int) get_transient( $key ) + 1, 15 * MINUTE_IN_SECONDS );
} );
add_filter( 'authenticate', function ( $user ) {
	if ( (int) get_transient( 'sib_login_' . md5( sib_client_ip() ) ) >= 5 ) {
		return new WP_Error( 'sib_locked', __( 'Too many failed log-ins. Try again in 15 minutes.', 'shopinbos' ) );
	}
	return $user;
}, 30 );
add_action( 'wp_login', fn() => delete_transient( 'sib_login_' . md5( sib_client_ip() ) ) );

/* No user enumeration for visitors: ?author=1 and the users REST endpoint. */
add_action( 'template_redirect', function () {
	if ( isset( $_GET['author'] ) && ! is_user_logged_in() ) { // phpcs:ignore WordPress.Security.NonceVerification
		wp_safe_redirect( home_url( '/' ), 301 );
		exit;
	}
} );
add_filter( 'rest_endpoints', function ( $endpoints ) {
	if ( ! is_user_logged_in() ) {
		unset( $endpoints['/wp/v2/users'], $endpoints['/wp/v2/users/(?P<id>[\d]+)'] );
	}
	return $endpoints;
} );

/* Generic log-in errors. */
add_filter( 'login_errors', fn() => __( 'Those details didn’t work.', 'shopinbos' ) );
