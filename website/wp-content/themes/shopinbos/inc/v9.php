<?php
/**
 * Website V9 (the "Website V9" design canvas), served from v9/:
 *   v9/v9.css          the design's stylesheet
 *   v9/v9.js           forms, menus and small behaviours
 *   v9/img/            images
 *   v9/pages/*.html    page markup, built by website/tools/v9_build.py
 *   inc/v9-content.php  blog posts, help articles and legal pages: real content in the V9 designs
 *
 * Staging: V9 replaces the old pages from launch (sib_launch_ts(), 1 November 00:00 Lagos). Before that only
 * browsers holding the preview cookie see it: open any page with ?v9=<preview key> (`wp shopinbos v9-link`
 * prints the link) and ?v9=off to go back. Pages the old theme served that V9 has no design for keep working.
 */

defined( 'ABSPATH' ) || exit;

const SIB_V9_COOKIE = 'sib_v9';

function sib_v9_key(): string {
	return substr( wp_hash( 'sib-v9-preview' ), 0, 12 );
}

function sib_v9_launched(): bool {
	return function_exists( 'sib_app_live' ) ? sib_app_live() : time() >= strtotime( '2026-10-31 23:00:00 UTC' );
}

function sib_v9_preview(): bool {
	return isset( $_COOKIE[ SIB_V9_COOKIE ] ) && hash_equals( sib_v9_key(), (string) $_COOKIE[ SIB_V9_COOKIE ] );
}

function sib_v9_active(): bool {
	static $on = null;
	if ( null === $on ) {
		$on = ! is_admin() && ( sib_v9_launched() || sib_v9_preview() );
	}
	return $on;
}

/* ?v9=<key> turns the preview on in this browser, ?v9=off turns it off. */
add_action( 'init', function () {
	if ( ! isset( $_GET['v9'] ) || is_admin() ) { // phpcs:ignore WordPress.Security.NonceVerification
		return;
	}
	$v = sanitize_key( wp_unslash( $_GET['v9'] ) ); // phpcs:ignore WordPress.Security.NonceVerification
	if ( 'off' === $v ) {
		setcookie( SIB_V9_COOKIE, '', time() - 3600, COOKIEPATH ?: '/', COOKIE_DOMAIN, is_ssl(), true );
	} elseif ( hash_equals( sib_v9_key(), $v ) ) {
		setcookie( SIB_V9_COOKIE, $v, time() + 30 * DAY_IN_SECONDS, COOKIEPATH ?: '/', COOKIE_DOMAIN, is_ssl(), true );
	} else {
		return;
	}
	nocache_headers();
	wp_safe_redirect( remove_query_arg( 'v9' ) );
	exit;
}, 1 );

/*
 * Page cache (LiteSpeed). Before launch every page varies on the preview cookie, previews are never cached, and
 * public pages are cached no later than the launch moment. The first request after launch empties the cache.
 */
add_action( 'send_headers', function () {
	if ( is_admin() ) {
		return;
	}
	if ( ! sib_v9_launched() ) {
		header( 'X-LiteSpeed-Vary: cookie=' . SIB_V9_COOKIE, false );
		if ( sib_v9_preview() ) {
			do_action( 'litespeed_control_set_nocache', 'V9 preview' );
			header( 'Cache-Control: no-store, private' );
		} elseif ( function_exists( 'sib_launch_ts' ) ) {
			do_action( 'litespeed_control_set_ttl', max( 60, sib_launch_ts() - time() ) );
		}
	}
} );
add_action( 'init', function () {
	if ( sib_v9_launched() && ! get_option( 'sib_v9_launch_purged' ) ) {
		update_option( 'sib_v9_launch_purged', time(), false );
		do_action( 'litespeed_purge_all' );
	}
} );

/** Static V9 pages by path. */
function sib_v9_routes(): array {
	return [
		'/'                              => 'home',
		'/online-store/'                 => 'online-store',
		'/website-builder/'              => 'website-builder',
		'/start/'                        => 'start',
		'/templates/'                    => 'templates',
		'/pricing/'                      => 'pricing',
		'/payments/'                     => 'payments',
		'/social-selling/'               => 'social-selling',
		'/find-stock/'                   => 'find-stock',
		'/trending/'                     => 'trending',
		'/suppliers/'                    => 'suppliers',
		'/delivery/'                     => 'delivery',
		'/rex-and-peggy/'                => 'rex-and-peggy',
		'/plug/'                         => 'plug',
		'/app/'                          => 'app',
		'/academy/'                      => 'academy',
		'/blog/'                         => 'blog',
		'/gist/'                         => 'gist',
		'/compare/'                      => 'compare',
		'/compare/global-store-builder/' => 'compare-single',
		'/help/'                         => 'help',
		'/about/'                        => 'about',
		'/contact/'                      => 'contact',
	];
}

/** Old addresses that V9 replaces, sent to the new page. */
function sib_v9_redirects(): array {
	return [
		'#^/how-it-works/?$#'                                       => '/start/',
		'#^/for-suppliers/?$#'                                      => '/suppliers/',
		'#^/marketplace(/.*)?$#'                                    => '/find-stock/',
		'#^/features/?$#'                                           => '/online-store/',
		'#^/features/(storefront|store-management)/?$#'             => '/online-store/',
		'#^/features/(payments|pay-on-delivery)/?$#'                => '/payments/',
		'#^/features/(delivery|logistics)/?$#'                      => '/delivery/',
		'#^/features/(social-selling|sell-on-whatsapp)/?$#'         => '/social-selling/',
		'#^/features/peggy-ai/?$#'                                  => '/rex-and-peggy/',
		'#^/features/dropshipping/?$#'                              => '/find-stock/',
		'#^/solutions/fashion/?$#'                                  => '/for/fashion-and-beauty/',
		'#^/solutions/beauty/?$#'                                   => '/for/fashion-and-beauty/',
		'#^/solutions/food/?$#'                                     => '/for/food-and-drinks/',
		'#^/solutions/electronics/?$#'                              => '/for/gadgets-and-electronics/',
		'#^/solutions(/.*)?$#'                                      => '/for/',
		'#^/integrations(/.*)?$#'                                   => '/social-selling/',
		'#^/legal/?$#'                                              => '/legal/terms/',
		// Sign-up waitlists end at launch: the waitlist goes to Shopinbos Plug, the ads landing page to the app pilot.
		'#^/waitlist/?$#'                                           => '/plug/',
		'#^/(join|lp/join)/?$#'                                     => '/app/',
		'#^/blog/category/([^/]+)/?$#'                              => '/blog/?topic=$1',
		'#^/blog/(page/\\d+|tag/[^/]+|author/[^/]+)/?$#'           => '/blog/',
		// V9 never names other companies: comparison pages that do go to the general comparison.
		'#^/compare/(?!global-store-builder/?$)[^/]+/?$#'           => '/compare/',
	];
}

/** Fill the build's tokens: images, app links, socials. */
function sib_v9_tokens( string $html ): string {
	$app  = rtrim( (string) ( function_exists( 'sib_setting' ) ? sib_setting( 'app_url' ) : '' ) ?: 'https://app.shopinbos.com', '/' );
	$map  = [
		'%%IMG%%'      => get_theme_file_uri( 'v9/img/' ),
		'%%SIGNUP%%'   => $app . '/signup?source=website',
		'%%LOGIN%%'    => $app . '/login',
		'%%ADD%%'      => $app . '/signup?source=website&amp;intent=add_product',
		'%%SUPPLIER%%' => $app . '/supplier/signup?source=website',
		'%%PARTNER%%'  => $app . '/logistics/signup?source=website',
	];
	foreach ( [ 'instagram', 'tiktok', 'x', 'youtube', 'linkedin' ] as $s ) {
		$url                          = function_exists( 'sib_setting' ) ? (string) sib_setting( 'social_' . $s ) : '';
		if ( $url ) {
			$map[ '%%SOCIAL:' . $s . '%%' ] = esc_url( $url );
		} else { // no page set: leave the icon out
			$html = (string) preg_replace( '#<a\b[^>]*href="%%SOCIAL:' . $s . '%%"[^>]*>.*?</a>#s', '', $html );
		}
	}
	return strtr( $html, $map );
}

function sib_v9_page( string $slug ): string {
	$file = get_theme_file_path( 'v9/pages/' . $slug . '.html' );
	return is_readable( $file ) ? sib_v9_tokens( (string) file_get_contents( $file ) ) : '';
}

/** Page titles and descriptions for V9 pages (SEO map entries win when present). */
function sib_v9_meta( string $slug ): array {
	static $titles = null;
	if ( null === $titles ) {
		$titles = (array) json_decode( (string) @file_get_contents( get_theme_file_path( 'v9/pages/titles.json' ) ), true ); // phpcs:ignore
	}
	$t = (string) ( $titles[ $slug ] ?? 'Shopinbos' );
	$t = trim( preg_replace( '/^Shopinbos\s*·\s*/u', '', $t ) );
	if ( 'plug' === $slug ) {
		return [ 'Shopinbos Plug · Plug is life', '' ];
	}
	$t = trim( preg_replace( '/\s*·\s*(coming soon|message sent|join form)$/iu', '', $t ) );
	return [ 'home' === $slug ? 'Shopinbos · Sell everywhere your customers are' : $t . ' · Shopinbos', '' ];
}

/* Route: static V9 pages, old addresses, and the templates that wrap real content. */
add_action( 'template_redirect', function () {
	if ( ! sib_v9_active() || is_feed() || ( defined( 'REST_REQUEST' ) && REST_REQUEST ) ) {
		return;
	}
	$path = trailingslashit( (string) wp_parse_url( add_query_arg( [] ), PHP_URL_PATH ) );
	foreach ( sib_v9_redirects() as $re => $to ) {
		if ( preg_match( $re, $path ) ) {
			// Keep the visitor's tracking (utm_*, fbclid) on the new page.
			$to = (string) preg_replace( $re, $to, $path );
			$q  = (string) wp_parse_url( add_query_arg( [] ), PHP_URL_QUERY );
			$to = $q ? $to . ( false === strpos( $to, '?' ) ? '?' : '&' ) . $q : $to;
			wp_safe_redirect( home_url( $to ), 301 );
			exit;
		}
	}
	$routes = sib_v9_routes();
	if ( isset( $routes[ $path ] ) && ! is_search() ) {
		// Index pages (blog, help) swap the design's sample cards for real posts.
		sib_v9_render( $routes[ $path ], (string) apply_filters( 'sib_v9_fill', sib_v9_page( $routes[ $path ] ), $routes[ $path ] ) );
	}
	// Real content in V9 templates (blog posts, help, academy, compare, trending).
	foreach ( (array) apply_filters( 'sib_v9_content_templates', [] ) as $match => $render ) {
		if ( call_user_func( $match ) ) {
			$out = call_user_func( $render );
			if ( is_array( $out ) ) {
				sib_v9_render( $out['slug'], $out['html'], $out );
			}
		}
	}
}, 0 ); // before the plugin's own redirects (/join → /lp/join/ at priority 1)

/**
 * Print a whole V9 page and stop. $meta: title, description, canonical (optional).
 */
function sib_v9_render( string $slug, string $html, array $meta = [] ): void {
	if ( '' === $html ) {
		return;
	}
	// Every page's header gets the same menu, including pages built from real content.
	if ( function_exists( 'sib_v9_for_menu' ) ) {
		$html = sib_v9_for_menu( $html );
	}
	[ $title, $desc ] = sib_v9_meta( $slug );
	$path             = (string) wp_parse_url( add_query_arg( [] ), PHP_URL_PATH );
	$map              = function_exists( 'sib_seo_map' ) ? sib_seo_map() : [];
	if ( isset( $map[ trailingslashit( $path ) ] ) ) {
		$meta['description'] = $meta['description'] ?? $map[ trailingslashit( $path ) ][1];
	}
	$title = (string) ( $meta['title'] ?? $title );
	$desc  = (string) ( $meta['description'] ?? $desc );
	if ( '' === $desc && is_singular() && function_exists( 'sib_meta_description' ) ) {
		$desc = sib_meta_description();
	}
	if ( '' === $desc && preg_match( '#<p class="lead[^"]*"[^>]*>(.*?)</p>#s', $html, $m ) ) {
		$desc = wp_html_excerpt( trim( wp_strip_all_tags( $m[1] ) ), 155, '…' );
	}

	global $wp_query;
	$status           = (int) ( $meta['status'] ?? 200 );
	$wp_query->is_404 = 404 === $status;
	status_header( $status );
	$GLOBALS['sib_virtual'] = [
		'title'       => $title,
		'description' => $desc,
		'canonical'   => $meta['canonical'] ?? home_url( trailingslashit( $path ) ),
		'noindex'     => ! empty( $meta['noindex'] ) || ! sib_v9_launched(),
		'view'        => 'v9',
		'crumbs'      => (array) ( $meta['crumbs'] ?? [] ),
		'route'       => 'v9',
		'status'      => $status,
	];
	$GLOBALS['sib_v9_page'] = $slug;
	add_filter( 'pre_get_document_title', fn() => $title, 99 );
	add_filter( 'wpseo_title', fn() => $title, 99 );
	add_filter( 'rank_math/frontend/title', fn() => $title, 99 );

	?><!doctype html>
<html lang="en-NG">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,600&amp;family=Plus+Jakarta+Sans:wght@400;500;600;700;800&amp;family=Fraunces:ital,opsz,wght@1,9..144,400;1,9..144,500&amp;family=JetBrains+Mono:wght@500&amp;display=swap">
<?php wp_head(); ?>
</head>
<body class="v9 v9-<?php echo esc_attr( $slug ); ?>">
<?php echo $html; // phpcs:ignore WordPress.Security.EscapeOutput -- built from the design files ?>
<?php wp_footer(); ?>
</body>
</html>
	<?php
	exit;
}

/* On V9 pages only the V9 stylesheet and script load. */
add_action( 'wp_enqueue_scripts', function () {
	if ( empty( $GLOBALS['sib_v9_page'] ) ) {
		return;
	}
	foreach ( wp_styles()->queue as $h ) {
		wp_dequeue_style( $h );
	}
	foreach ( wp_scripts()->queue as $h ) {
		wp_dequeue_script( $h );
	}
	$css = get_theme_file_path( 'v9/v9.css' );
	wp_enqueue_style( 'sib-v9', get_theme_file_uri( 'v9/v9.css' ), [], (string) filemtime( $css ) );
	wp_enqueue_style( 'sib-v9-prose', get_theme_file_uri( 'v9/prose.css' ), [ 'sib-v9' ], (string) filemtime( get_theme_file_path( 'v9/prose.css' ) ) );
	$js = get_theme_file_path( 'v9/v9.js' );
	if ( is_readable( $js ) ) {
		wp_enqueue_script( 'sib-v9', get_theme_file_uri( 'v9/v9.js' ), [], (string) filemtime( $js ), [ 'strategy' => 'defer', 'in_footer' => true ] );
		wp_localize_script( 'sib-v9', 'SIB_V9', [
			'post'   => admin_url( 'admin-post.php' ),
			'signup' => rtrim( (string) ( function_exists( 'sib_setting' ) ? sib_setting( 'app_url' ) : '' ) ?: 'https://app.shopinbos.com', '/' ) . '/signup',
			'wa'     => function_exists( 'sib_setting' ) ? preg_replace( '/\D/', '', (string) sib_setting( 'whatsapp_support' ) ) : '',
			// Live chat: messages open a ticket in the admin portal's Support inbox (the app's signed-out "Stuck?" form).
			'support' => rtrim( (string) ( function_exists( 'sib_setting' ) ? sib_setting( 'app_url' ) : '' ) ?: 'https://app.shopinbos.com', '/' ) . '/api/support/requests',
		] );
	}
	wp_dequeue_style( 'global-styles' );
	wp_dequeue_style( 'wp-block-library' );
	wp_dequeue_style( 'classic-theme-styles' );
}, 999 );

require_once __DIR__ . '/v9-content.php';
require_once __DIR__ . '/v9-fill.php';
require_once __DIR__ . '/v9-pages.php';
require_once __DIR__ . '/v9-tools.php';
require_once __DIR__ . '/v9-more.php';
require_once __DIR__ . '/v9-for.php';
