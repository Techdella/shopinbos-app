<?php
/**
 * Read-only client for the app's public marketplace API (/api/public).
 *
 * - Every answer is cached for 15 minutes.
 * - A last-good copy is kept for 7 days. If the API is down we serve it, and hide prices
 *   once that copy is older than 24 hours (prices may have changed).
 * - 404s are cached briefly so a missing slug can't hammer the app.
 */

defined( 'ABSPATH' ) || exit;

const SIB_API_TTL       = 15 * MINUTE_IN_SECONDS;
const SIB_API_KEEP      = 7 * DAY_IN_SECONDS;
const SIB_API_PRICE_MAX = DAY_IN_SECONDS;

function sib_demo_mode(): bool {
	return '1' === (string) sib_setting( 'demo_mode' ) || '' === (string) sib_setting( 'api_base' );
}

/**
 * @return array{ok:bool,status:int,data:mixed,meta:array,fetched_at:int,stale:bool,prices_hidden:bool}
 */
function sib_api_get( string $path, array $query = [] ): array {
	if ( sib_demo_mode() ) {
		return sib_demo_api( $path, $query );
	}
	ksort( $query );
	$path  = '/' . ltrim( $path, '/' );
	$key   = md5( $path . '?' . http_build_query( $query ) );
	$fresh = get_transient( 'sib_api_' . $key );
	if ( is_array( $fresh ) ) {
		return sib_api_result( $fresh, false );
	}

	$url      = add_query_arg( array_map( 'rawurlencode', $query ), untrailingslashit( (string) sib_setting( 'api_base' ) ) . $path );
	$response = wp_remote_get( $url, [
		'timeout'    => 6,
		'headers'    => [ 'Accept' => 'application/json', 'Origin' => home_url() ],
		'user-agent' => 'ShopinbosWebsite/' . SIB_CORE_VERSION . '; ' . home_url(),
	] );
	$code = is_wp_error( $response ) ? 0 : (int) wp_remote_retrieve_response_code( $response );
	$body = is_wp_error( $response ) ? null : json_decode( (string) wp_remote_retrieve_body( $response ), true );

	if ( 200 === $code && is_array( $body ) && array_key_exists( 'data', $body ) ) {
		$entry = [ 'status' => 200, 'data' => $body['data'], 'meta' => $body['meta'] ?? [], 'fetched_at' => time() ];
		set_transient( 'sib_api_' . $key, $entry, SIB_API_TTL );
		set_transient( 'sib_api_last_' . $key, $entry, SIB_API_KEEP );
		return sib_api_result( $entry, false );
	}
	if ( 404 === $code || 410 === $code ) {
		$entry = [ 'status' => 404, 'data' => null, 'meta' => [], 'fetched_at' => time() ];
		set_transient( 'sib_api_' . $key, $entry, 5 * MINUTE_IN_SECONDS );
		delete_transient( 'sib_api_last_' . $key );
		return sib_api_result( $entry, false );
	}
	if ( 400 === $code ) {
		return sib_api_result( [ 'status' => 400, 'data' => null, 'meta' => [], 'fetched_at' => time() ], false );
	}

	// API down or erroring: last good copy, if we have one.
	$last = get_transient( 'sib_api_last_' . $key );
	if ( is_array( $last ) ) {
		// Retry in a minute rather than on every request.
		set_transient( 'sib_api_' . $key, $last, MINUTE_IN_SECONDS );
		return sib_api_result( $last, true );
	}
	return sib_api_result( [ 'status' => 503, 'data' => null, 'meta' => [], 'fetched_at' => 0 ], true );
}

function sib_api_result( array $entry, bool $stale ): array {
	$status = (int) ( $entry['status'] ?? 503 );
	$age    = $entry['fetched_at'] ? time() - (int) $entry['fetched_at'] : PHP_INT_MAX;
	return [
		'ok'            => 200 === $status,
		'status'        => $status,
		'data'          => $entry['data'] ?? null,
		'meta'          => $entry['meta'] ?? [],
		'fetched_at'    => (int) ( $entry['fetched_at'] ?? 0 ),
		'stale'         => $stale,
		'prices_hidden' => 200 === $status && $age > SIB_API_PRICE_MAX,
	];
}

/** All pages of a list endpoint (used by the nightly sitemap). */
function sib_api_get_all( string $path, array $query = [], int $max_pages = 50 ): array {
	$items = [];
	for ( $page = 1; $page <= $max_pages; $page++ ) {
		$res = sib_api_get( $path, $query + [ 'page' => $page, 'limit' => 100 ] );
		if ( ! $res['ok'] || ! is_array( $res['data'] ) ) {
			return [ 'ok' => false, 'items' => $items ];
		}
		$items = array_merge( $items, $res['data'] );
		$total = (int) ( $res['meta']['total'] ?? 0 );
		if ( count( $res['data'] ) < 100 || count( $items ) >= $total ) {
			break;
		}
	}
	return [ 'ok' => true, 'items' => $items ];
}

function sib_api_flush_cache(): void {
	global $wpdb;
	$wpdb->query( "DELETE FROM {$wpdb->options} WHERE option_name LIKE '\\_transient\\_sib\\_api\\_%' OR option_name LIKE '\\_transient\\_timeout\\_sib\\_api\\_%'" );
	if ( wp_using_ext_object_cache() && function_exists( 'wp_cache_flush_group' ) ) {
		wp_cache_flush_group( 'transient' );
	}
}

function sib_api_status(): string {
	if ( sib_demo_mode() ) {
		return __( 'sample data (not calling the app)', 'shopinbos' );
	}
	$res = wp_remote_get( untrailingslashit( (string) sib_setting( 'api_base' ) ) . '/health', [ 'timeout' => 4 ] );
	if ( is_wp_error( $res ) ) {
		return sprintf( __( 'unreachable (%s)', 'shopinbos' ), $res->get_error_message() );
	}
	return 200 === wp_remote_retrieve_response_code( $res ) ? __( 'connected', 'shopinbos' ) : sprintf( __( 'answered %d', 'shopinbos' ), wp_remote_retrieve_response_code( $res ) );
}
