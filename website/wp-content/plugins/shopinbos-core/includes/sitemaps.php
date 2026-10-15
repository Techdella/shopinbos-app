<?php
/**
 * Marketplace sitemap at /sitemap-marketplace.xml, rebuilt nightly from the app's list endpoints.
 * It is listed in robots.txt and in Rank Math's / Yoast's sitemap index. WordPress content uses
 * the SEO plugin's sitemaps (or core's /wp-sitemap.xml without one).
 *
 * We also remember every slug we've ever listed, so a product that is later deleted answers
 * 410 Gone instead of 404.
 */

defined( 'ABSPATH' ) || exit;

add_action( 'sib_nightly_sitemap', 'sib_build_sitemap' );

function sib_build_sitemap(): bool {
	$sets = [
		'product'  => [ '/products', fn( $r ) => $r['slug'] ],
		'supplier' => [ '/suppliers', fn( $r ) => $r['slug'] ],
		'partner'  => [ '/logistics/partners', fn( $r ) => $r['slug'] ],
	];
	$map  = [ 'built' => time() ];
	$seen = (array) get_option( 'sib_seen_slugs', [] );
	foreach ( $sets as $type => [ $path, $slug ] ) {
		$res = sib_api_get_all( $path );
		if ( ! $res['ok'] ) {
			return false; // keep yesterday's map rather than publish a partial one
		}
		$map[ $type ] = [];
		foreach ( $res['items'] as $row ) {
			if ( empty( $row['slug'] ) ) {
				continue;
			}
			$map[ $type ][ $row['slug'] ] = substr( (string) ( $row['createdAt'] ?? '' ), 0, 10 );
			$seen[ $type ][ $row['slug'] ] = 1;
		}
	}
	$cats            = sib_api_get( '/categories', [ 'rootOnly' => 'true' ] );
	$map['category'] = $cats['ok'] ? array_values( array_filter( array_map( fn( $c ) => ( $c['_count']['supplierProducts'] ?? 1 ) > 0 ? $c['slug'] : null, (array) $cats['data'] ) ) ) : [];
	foreach ( $seen as $type => $slugs ) {
		if ( count( $slugs ) > 20000 ) {
			$seen[ $type ] = array_slice( $slugs, -20000, null, true );
		}
	}
	update_option( 'sib_sitemap', $map, false );
	update_option( 'sib_seen_slugs', $seen, false );
	return true;
}

/** Was this slug ever on the marketplace? Then a 404 from the API means it was deleted: 410. */
function sib_sitemap_knew( string $type, string $slug ): bool {
	$seen = (array) get_option( 'sib_seen_slugs', [] );
	return isset( $seen[ $type ][ $slug ] );
}

add_action( 'init', function () {
	add_rewrite_rule( '^sitemap-marketplace\.xml$', 'index.php?sib_sitemap=1', 'top' );
} );
add_filter( 'query_vars', fn( $v ) => array_merge( $v, [ 'sib_sitemap' ] ) );
add_filter( 'redirect_canonical', fn( $url ) => get_query_var( 'sib_sitemap' ) ? false : $url );

add_action( 'template_redirect', function () {
	if ( ! get_query_var( 'sib_sitemap' ) ) {
		return;
	}
	$map = (array) get_option( 'sib_sitemap', [] );
	if ( empty( $map['built'] ) ) {
		sib_build_sitemap();
		$map = (array) get_option( 'sib_sitemap', [] );
	}
	status_header( 200 );
	header( 'Content-Type: application/xml; charset=UTF-8' );
	header( 'X-Robots-Tag: noindex' );
	$urls = [ [ home_url( '/marketplace/' ), '' ], [ home_url( '/suppliers/' ), '' ] ];
	foreach ( (array) ( $map['category'] ?? [] ) as $c ) {
		$urls[] = [ home_url( '/marketplace/' . $c . '/' ), '' ];
	}
	$paths = [ 'product' => '/marketplace/products/', 'supplier' => '/suppliers/', 'partner' => '/delivery/partners/' ];
	foreach ( $paths as $type => $base ) {
		foreach ( (array) ( $map[ $type ] ?? [] ) as $slug => $date ) {
			$urls[] = [ home_url( $base . rawurlencode( (string) $slug ) . '/' ), $date ];
		}
	}
	echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n" . '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
	foreach ( $urls as [ $loc, $date ] ) {
		echo '<url><loc>' . esc_url( $loc ) . '</loc>' . ( $date ? '<lastmod>' . esc_html( $date ) . '</lastmod>' : '' ) . "</url>\n";
	}
	echo '</urlset>';
	exit;
} );

add_filter( 'robots_txt', fn( $txt ) => $txt . 'Sitemap: ' . home_url( '/sitemap-marketplace.xml' ) . "\n", 20 );

/* List it in the SEO plugin's sitemap index too. */
$sib_sitemap_entry = fn() => '<sitemap><loc>' . esc_url( home_url( '/sitemap-marketplace.xml' ) ) . '</loc><lastmod>' . gmdate( 'c', (int) ( get_option( 'sib_sitemap' )['built'] ?? time() ) ) . "</lastmod></sitemap>\n";
add_filter( 'rank_math/sitemap/index', fn( $xml ) => $xml . $sib_sitemap_entry() );
add_filter( 'wpseo_sitemap_index', fn( $xml ) => $xml . $sib_sitemap_entry() );
unset( $sib_sitemap_entry );

/* Core sitemaps: drop users and campaign pages. */
add_filter( 'wp_sitemaps_add_provider', fn( $provider, $name ) => 'users' === $name ? false : $provider, 10, 2 );
add_filter( 'wp_sitemaps_post_types', function ( $types ) {
	unset( $types['sib_landing'] );
	return $types;
} );
add_filter( 'wp_sitemaps_taxonomies', function ( $tax ) {
	unset( $tax['post_tag'] );
	return $tax;
} );
