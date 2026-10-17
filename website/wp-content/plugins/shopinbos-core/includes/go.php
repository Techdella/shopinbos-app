<?php
/**
 * /go/ links: every sign-up and log-in button on the site points at /go/..., which redirects to
 * the app with the intent, the source and the visitor's first-touch UTM tags.
 *
 *   /go/signup?intent=dropship&productSlug=leather-slides
 *     → https://app.shopinbos.com/signup?intent=dropship&productSlug=leather-slides&source=website&utm_source=…
 *
 * Keeping the app URL out of page content means staging and production can point at different
 * apps, and full-page caching still works (UTMs are read per request from a cookie).
 */

defined( 'ABSPATH' ) || exit;

/** Query keys passed through to the app. The app's intent router reads the first six. */
const SIB_GO_KEYS = [ 'intent', 'productSlug', 'supplierSlug', 'logisticsSlug', 'categorySlug', 'source', 'template', 'plan', 'billing', 'tool', 'quantity' ];
const SIB_UTM_KEYS = [ 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'ttclid' ];

/** Where each /go/ target lands in the app. */
function sib_go_targets(): array {
	return [
		'signup'   => '/signup',
		'login'    => '/login',
		'supplier' => '/supplier/signup',
		'partner'  => '/logistics/signup',
	];
}

/**
 * Root-relative /go/ link for an intent. Intents (from the website plan): add, dropship, request_quote,
 * template, plan, book_delivery, supplier_signup, partner_signup, tool_result, view_products.
 */
function sib_go_url( string $intent = '', array $args = [] ): string {
	$target = match ( $intent ) {
		'login'           => 'login',
		'supplier_signup' => 'supplier',
		'partner_signup'  => 'partner',
		default           => 'signup',
	};
	$query = array_filter( array_merge( 'login' === $intent ? [] : [ 'intent' => $intent ], $args ), fn( $v ) => '' !== (string) $v );
	unset( $query['place'] );
	$path = wp_parse_url( home_url( '/go/' . $target ), PHP_URL_PATH );
	return $query ? $path . '?' . http_build_query( $query, '', '&', PHP_QUERY_RFC3986 ) : $path;
}

function sib_go_rewrite_rules(): void {
	add_rewrite_rule( '^go/(signup|login|supplier|partner)/?$', 'index.php?sib_go=$matches[1]', 'top' );
}
add_action( 'init', 'sib_go_rewrite_rules' );
add_filter( 'query_vars', fn( $v ) => array_merge( $v, [ 'sib_go' ] ) );

/** Build the app URL for a /go/ request. Pure function so it can be tested. */
function sib_go_build( string $target, array $get, array $utm_cookie ): string {
	$targets = sib_go_targets();
	$path    = $targets[ $target ] ?? '/signup';
	$out     = [];
	foreach ( SIB_GO_KEYS as $k ) {
		if ( isset( $get[ $k ] ) && is_string( $get[ $k ] ) && preg_match( '/^[A-Za-z0-9_.\-]{1,120}$/', $get[ $k ] ) ) {
			$out[ $k ] = $get[ $k ];
		}
	}
	if ( 'login' !== $target ) {
		$out['source'] = $out['source'] ?? 'website';
	}
	foreach ( SIB_UTM_KEYS as $k ) {
		$v = $get[ $k ] ?? ( $utm_cookie[ $k ] ?? null );
		if ( is_string( $v ) && '' !== $v ) {
			$out[ $k ] = mb_substr( sanitize_text_field( $v ), 0, 120 );
		}
	}
	$base = untrailingslashit( (string) sib_setting( 'app_url' ) );
	return $base . $path . ( $out ? '?' . http_build_query( $out, '', '&', PHP_QUERY_RFC3986 ) : '' );
}

add_action( 'template_redirect', function () {
	$target = get_query_var( 'sib_go' );
	if ( ! $target ) {
		return;
	}
	$cookie = [];
	if ( ! empty( $_COOKIE['sib_utm'] ) ) {
		$decoded = json_decode( wp_unslash( (string) $_COOKIE['sib_utm'] ), true );
		$cookie  = is_array( $decoded ) ? $decoded : [];
	}
	$url = sib_go_build( (string) $target, wp_unslash( $_GET ), $cookie ); // phpcs:ignore WordPress.Security.NonceVerification
	nocache_headers();
	header( 'X-Robots-Tag: noindex, nofollow' );
	add_filter( 'allowed_redirect_hosts', function ( $hosts ) {
		$hosts[] = wp_parse_url( (string) sib_setting( 'app_url' ), PHP_URL_HOST );
		return $hosts;
	} );
	wp_safe_redirect( $url, 302, 'Shopinbos website' );
	exit;
}, 1 );

/* Keep crawlers out of /go/. */
add_filter( 'robots_txt', function ( $txt ) {
	$ours = "Disallow: /go/\nDisallow: /download/\nDisallow: /confirm/\n";
	return str_contains( $txt, "Disallow: /wp-admin/\n" ) ? str_replace( "Disallow: /wp-admin/\n", "Disallow: /wp-admin/\n" . $ours, $txt ) : $txt . $ours;
} );
