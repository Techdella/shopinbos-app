<?php
/**
 * Robots, canonicals and meta tags.
 *
 * Rank Math (or Yoast) owns titles and descriptions for normal pages. We add:
 *  - noindex for campaign pages (/lp/), tag archives, search, marketplace searches and the per-page switch
 *  - full meta for the virtual marketplace pages (handed to Rank Math/Yoast when they are active)
 *  - basic description, canonical and Open Graph tags when no SEO plugin is installed
 */

defined( 'ABSPATH' ) || exit;

function sib_seo_plugin(): bool {
	return defined( 'RANK_MATH_VERSION' ) || defined( 'WPSEO_VERSION' );
}

function sib_is_noindex(): bool {
	if ( $v = sib_virtual() ) {
		return ! empty( $v['noindex'] );
	}
	if ( is_singular() && ( get_post_meta( get_queried_object_id(), 'sib_noindex', true ) || is_singular( 'sib_landing' ) || is_page( 'thanks' ) ) ) {
		return true;
	}
	return is_tag() || is_search() || is_author() && ! have_posts() || is_date();
}

add_filter( 'wp_robots', function ( $robots ) {
	if ( sib_is_noindex() ) {
		$robots['noindex'] = true;
		$robots['follow']  = true;
		unset( $robots['max-image-preview'] );
	}
	return $robots;
} );

/* Hand our answers to Rank Math and Yoast so they don't print the home page's tags on virtual pages. */
$sib_v = fn( string $k ) => fn( $value ) => ( $v = sib_virtual() ) && isset( $v[ $k ] ) ? $v[ $k ] : $value;
add_filter( 'rank_math/frontend/canonical', $sib_v( 'canonical' ) );
add_filter( 'rank_math/frontend/description', $sib_v( 'description' ) );
add_filter( 'rank_math/frontend/title', fn( $t ) => ( $v = sib_virtual() ) ? $v['title'] . ' | Shopinbos' : $t );
add_filter( 'rank_math/frontend/robots', function ( $r ) {
	if ( sib_is_noindex() ) {
		$r['index'] = 'noindex';
	}
	return $r;
} );
add_filter( 'wpseo_canonical', $sib_v( 'canonical' ) );
add_filter( 'wpseo_metadesc', $sib_v( 'description' ) );
add_filter( 'wpseo_title', fn( $t ) => ( $v = sib_virtual() ) ? $v['title'] . ' | Shopinbos' : $t );
add_filter( 'wpseo_robots', fn( $r ) => sib_is_noindex() ? 'noindex, follow' : $r );
unset( $sib_v );

/** Description for the current request (our fallback). */
function sib_meta_description(): string {
	if ( $v = sib_virtual() ) {
		return (string) $v['description'];
	}
	if ( is_singular() ) {
		$post = get_queried_object();
		return wp_trim_words( wp_strip_all_tags( has_excerpt( $post ) ? $post->post_excerpt : strip_shortcodes( $post->post_content ) ), 28, '…' );
	}
	if ( is_front_page() || is_home() ) {
		return (string) get_bloginfo( 'description' );
	}
	return wp_strip_all_tags( (string) term_description() );
}

add_action( 'wp_head', function () {
	$v = sib_virtual();
	if ( sib_seo_plugin() && ! $v ) {
		return;
	}
	if ( $v && sib_seo_plugin() ) {
		return; // Rank Math / Yoast print them using the filters above.
	}
	$desc  = sib_meta_description();
	$title = wp_get_document_title();
	$url   = $v ? ( $v['canonical'] ?? '' ) : ( is_singular() ? get_permalink() : '' );
	$image = $v['image'] ?? ( is_singular() && has_post_thumbnail() ? get_the_post_thumbnail_url( null, 'large' ) : '' );
	if ( $desc ) {
		echo '<meta name="description" content="' . esc_attr( $desc ) . "\">\n";
	}
	if ( $v && $url ) {
		echo '<link rel="canonical" href="' . esc_url( $url ) . "\">\n"; // core prints it for singular pages
	}
	echo '<meta property="og:site_name" content="Shopinbos">' . "\n";
	echo '<meta property="og:type" content="' . ( is_singular( 'post' ) ? 'article' : 'website' ) . "\">\n";
	echo '<meta property="og:title" content="' . esc_attr( $title ) . "\">\n";
	if ( $desc ) {
		echo '<meta property="og:description" content="' . esc_attr( $desc ) . "\">\n";
	}
	if ( $url ) {
		echo '<meta property="og:url" content="' . esc_url( $url ) . "\">\n";
	}
	if ( $image ) {
		echo '<meta property="og:image" content="' . esc_url( $image ) . "\">\n";
	}
	echo '<meta name="twitter:card" content="' . ( $image ? 'summary_large_image' : 'summary' ) . "\">\n";
	echo '<meta property="og:locale" content="en_NG">' . "\n";
}, 3 );

/* English for Nigeria. */
add_filter( 'language_attributes', fn( $out ) => preg_replace( '/lang="[^"]*"/', 'lang="en-NG"', $out ) );
