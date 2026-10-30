<?php
/**
 * Website V9: plain WordPress pages without their own design (careers, press, partners…), search results and the
 * not-found page, in the V9 look: a hero like the design's simple pages and the page text in a .v9-prose column.
 */

defined( 'ABSPATH' ) || exit;

/** Pages that use this template (others have their own design or template). */
function sib_v9_plain_pages(): array {
	return (array) apply_filters( 'sib_v9_plain_pages', [ 'careers', 'press', 'partners', 'agencies', 'thanks' ] );
}

/** A simple hero: eyebrow, title, lead. */
function sib_v9_hero( string $eyebrow, string $title, string $lead = '', string $extra = '' ): string {
	return '<section style="background:#F6F3EE;padding:88px 0 72px"><div class="wrap" style="max-width:980px">'
		. ( $eyebrow ? '<span class="k orgd up">' . esc_html( $eyebrow ) . '</span>' : '' )
		. '<h1 class="H up d1" style="font-size:clamp(44px,5.6vw,84px);line-height:1;margin-top:16px">' . esc_html( $title ) . '</h1>'
		. ( $lead ? '<p class="lead up d2" style="margin-top:18px;max-width:640px">' . esc_html( $lead ) . '</p>' : '' )
		. $extra . '</div></section>';
}

function sib_v9_is_plain_page(): bool {
	if ( ! is_page() ) {
		return false;
	}
	$post = get_queried_object();
	return $post instanceof WP_Post && in_array( $post->post_name, sib_v9_plain_pages(), true );
}

function sib_v9_plain_page(): ?array {
	$post = get_queried_object();
	if ( ! $post instanceof WP_Post ) {
		return null;
	}
	[ $body ] = sib_v9_prose( $post );
	// The page's first paragraph becomes the lead when there is no excerpt.
	$lead = has_excerpt( $post ) ? get_the_excerpt( $post ) : '';
	if ( ! $lead && preg_match( '#^\s*<p[^>]*>(.*?)</p>#s', $body, $m ) ) {
		$lead = trim( wp_strip_all_tags( $m[1] ) );
		$body = substr( $body, strlen( $m[0] ) );
	}
	$parent  = $post->post_parent ? get_post( $post->post_parent ) : null;
	$eyebrow = $parent ? get_the_title( $parent ) : __( 'Shopinbos', 'shopinbos' );

	$h  = sib_v9_hero( $eyebrow, get_the_title( $post ), $lead );
	$h .= '<section style="padding:64px 0 120px"><div class="wrap" style="max-width:820px"><div class="v9-prose">' . $body . '</div></div></section>';
	$h .= sib_v9_section( 'about', 'night' );
	return [
		'slug'   => 'page-' . $post->post_name,
		'html'   => sib_v9_wrap( $h, 'blog-post' ),
		'title'  => get_the_title( $post ) . ' · Shopinbos',
		'crumbs' => $parent ? [ [ get_the_title( $parent ), get_permalink( $parent ) ] ] : [],
	];
}

/* ---------- Search ---------- */

function sib_v9_search(): ?array {
	$q     = get_search_query();
	$items = '';
	global $wp_query;
	foreach ( $wp_query->posts as $p ) {
		$type   = get_post_type_object( $p->post_type );
		$items .= '<a href="' . esc_url( get_permalink( $p ) ) . '" class="row" style="padding:20px 0;border-bottom:1px solid #E7E4EC;gap:16px;align-items:flex-start"><span style="flex:1;display:flex;flex-direction:column;gap:4px"><span class="k mutd">' . esc_html( $type ? $type->labels->singular_name : '' ) . '</span><b style="font-size:18px">' . esc_html( get_the_title( $p ) ) . '</b><span class="p mutd" style="font-size:15px">' . esc_html( wp_html_excerpt( wp_strip_all_tags( get_the_excerpt( $p ) ), 160, '…' ) ) . '</span></span><span aria-hidden="true">→</span></a>';
	}
	$form = '<form action="' . esc_url( home_url( '/' ) ) . '" method="get" role="search" style="display:flex;align-items:center;gap:8px;background:#fff;border-radius:999px;padding:6px 6px 6px 24px;max-width:620px;margin-top:28px;box-shadow:0 20px 50px -30px rgba(22,20,31,.4)"><input type="search" name="s" value="' . esc_attr( $q ) . '" aria-label="' . esc_attr__( 'Search', 'shopinbos' ) . '" style="flex:1;min-width:0;border:0;outline:0;font-size:16px;background:transparent"><button class="btn b-ink" style="height:46px;font-size:15px">' . esc_html__( 'Search', 'shopinbos' ) . '</button></form>';
	$h    = sib_v9_hero( __( 'Search', 'shopinbos' ), $q ? sprintf( __( 'Results for “%s”', 'shopinbos' ), $q ) : __( 'Search Shopinbos', 'shopinbos' ), '', $form );
	$h   .= '<section style="padding:48px 0 120px"><div class="wrap" style="max-width:820px">' . ( $items ?: '<p class="lead">' . esc_html__( 'Nothing found. Try another word, or browse the help centre and blog.', 'shopinbos' ) . '</p><div style="display:flex;gap:10px;margin-top:20px;flex-wrap:wrap"><a class="btn b-ink" href="/help/">' . esc_html__( 'Help centre', 'shopinbos' ) . '</a><a class="btn b-line" href="/blog/">' . esc_html__( 'Blog', 'shopinbos' ) . '</a></div>' ) . '</div></section>';
	return [
		'slug'    => 'search',
		'html'    => sib_v9_wrap( $h, 'blog-post' ),
		'title'   => ( $q ? sprintf( 'Search: %s', $q ) : 'Search' ) . ' · Shopinbos',
		'noindex' => true,
	];
}

/* ---------- Not found ---------- */

function sib_v9_404(): ?array {
	$links = [
		'/start/'        => __( 'Start selling', 'shopinbos' ),
		'/pricing/'      => __( 'Pricing', 'shopinbos' ),
		'/find-stock/'   => __( 'Find stock', 'shopinbos' ),
		'/help/'         => __( 'Help centre', 'shopinbos' ),
		'/blog/'         => __( 'Blog', 'shopinbos' ),
		'/contact/'      => __( 'Contact us', 'shopinbos' ),
	];
	$btns = '';
	foreach ( $links as $u => $l ) {
		$btns .= '<a class="btn b-line" href="' . esc_url( $u ) . '">' . esc_html( $l ) . '</a>';
	}
	$h = sib_v9_hero( '404', __( 'This page has moved or never existed.', 'shopinbos' ), __( 'Check the address, or pick up from one of these.', 'shopinbos' ), '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:28px">' . $btns . '</div>' );
	return [
		'slug'    => '404',
		'html'    => sib_v9_wrap( $h . sib_v9_section( 'about', 'night' ), 'blog-post' ),
		'title'   => __( 'Page not found · Shopinbos', 'shopinbos' ),
		'status'  => 404,
		'noindex' => true,
	];
}

add_filter( 'sib_v9_content_templates', function ( array $t ): array {
	$t['sib_v9_is_plain_page'] = 'sib_v9_plain_page';
	$t['is_search']            = 'sib_v9_search';
	return $t;
}, 5 );

/* The not-found page goes last, after every other template had its chance. */
add_filter( 'sib_v9_content_templates', function ( array $t ): array {
	$t['is_404'] = 'sib_v9_404';
	return $t;
}, 999 );
