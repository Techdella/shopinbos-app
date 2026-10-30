<?php
/**
 * Website V9: real WordPress content (blog posts, help articles, legal pages) in the V9 page designs.
 * The header and footer come from the built pages; the middle follows the V9-BlogPost, V9-HelpArticle and
 * V9-Terms artboards, with the post's own text in a .v9-prose column (styled in v9/prose.css).
 */

defined( 'ABSPATH' ) || exit;

/** The design's header (everything before the first section) and footer, from a built page. */
function sib_v9_chrome( string $from = 'blog-post' ): array {
	$html = sib_v9_page( $from );
	$a    = strpos( $html, '<section' );
	$b    = strpos( $html, '<footer class="ft"' );
	if ( false === $a || false === $b ) {
		return [ '', '' ];
	}
	return [ substr( $html, 0, $a ), substr( $html, $b ) ];
}

/** One section of a built page (by its order), e.g. the "night" sign-up band. */
function sib_v9_section( string $from, string $class ): string {
	$html = sib_v9_page( $from );
	$a    = strpos( $html, '<section class="' . $class . '"' );
	if ( false === $a ) {
		return '';
	}
	$b = strpos( $html, '</section>', $a );
	return false === $b ? '' : substr( $html, $a, $b - $a + 10 );
}

/** The post's text, with ids on its h2s so "On this page" can link to them. Returns [html, [id => heading]]. */
function sib_v9_prose( WP_Post $post ): array {
	$GLOBALS['post'] = $post; // phpcs:ignore WordPress.WP.GlobalVariablesOverride
	setup_postdata( $post );
	$html = (string) apply_filters( 'the_content', $post->post_content );
	wp_reset_postdata();
	$toc  = [];
	$html = (string) preg_replace_callback( '#<h2([^>]*)>(.*?)</h2>#s', function ( $m ) use ( &$toc ) {
		$text = trim( wp_strip_all_tags( $m[2] ) );
		if ( preg_match( '/\bid="([^"]+)"/', $m[1], $id ) ) {
			$toc[ $id[1] ] = $text;
			return $m[0];
		}
		$id = sanitize_title( $text ) ?: 's' . count( $toc );
		$toc[ $id ] = $text;
		return '<h2 id="' . esc_attr( $id ) . '"' . $m[1] . '>' . $m[2] . '</h2>';
	}, $html );
	return [ $html, $toc ];
}

function sib_v9_minutes( WP_Post $post ): int {
	return max( 1, (int) round( str_word_count( wp_strip_all_tags( $post->post_content ) ) / 220 ) );
}

function sib_v9_toc( array $toc, string $style = 'color:#6B6779;font-weight:500' ): string {
	$out = '';
	foreach ( $toc as $id => $text ) {
		$out .= '<a href="#' . esc_attr( $id ) . '" style="' . $style . '">' . esc_html( $text ) . '</a>';
	}
	return $out;
}

function sib_v9_wrap( string $middle, string $from = 'blog-post' ): string {
	[ $head, $foot ] = sib_v9_chrome( $from );
	return $head . $middle . "\n" . $foot;
}

/* ---------- Blog post (V9-BlogPost) ---------- */

function sib_v9_blog_post(): ?array {
	$post = get_queried_object();
	if ( ! $post instanceof WP_Post ) {
		return null;
	}
	[ $body, $toc ] = sib_v9_prose( $post );
	$cat            = get_the_category( $post->ID );
	$cat            = $cat ? $cat[0]->name : __( 'Guides', 'shopinbos' );
	$dek            = (string) ( get_post_meta( $post->ID, 'sib_dek', true ) ?: ( has_excerpt( $post ) ? get_the_excerpt( $post ) : '' ) );
	$img            = get_the_post_thumbnail_url( $post, 'full' );
	$share          = function_exists( 'sib_whatsapp_share_url' ) ? sib_whatsapp_share_url( get_the_title( $post ) . ' ' . get_permalink( $post ) ) : 'https://wa.me/?text=' . rawurlencode( get_permalink( $post ) );

	$h  = '<section style="padding:72px 0 40px"><div class="wrap" style="max-width:980px"><a href="/blog/" class="more mutd" style="font-size:14px">← ' . esc_html__( 'Blog', 'shopinbos' ) . '</a>';
	$h .= '<div style="display:flex;gap:10px;align-items:center;margin-top:28px"><span class="tg og">' . esc_html( $cat ) . '</span><span class="mutd" style="font-size:14px">' . esc_html( sprintf( '%d min read · %s', sib_v9_minutes( $post ), get_the_date( 'j F Y', $post ) ) ) . '</span></div>';
	$h .= '<h1 class="H up" style="font-size:clamp(40px,5vw,72px);line-height:1;margin-top:18px">' . esc_html( get_the_title( $post ) ) . '</h1>';
	$h .= '<div style="display:flex;gap:12px;align-items:center;margin-top:28px"><img decoding="async" src="' . esc_url( get_theme_file_uri( 'v9/img/ca93d894250e7589d5b88c477d36f7d7.webp' ) ) . '" alt="" style="width:44px;height:44px;border-radius:99px;background:#FF6A2B;padding:8px"><div><b>' . esc_html__( 'Shopinbos team', 'shopinbos' ) . '</b><div class="mutd" style="font-size:13.5px">' . esc_html__( 'Guides for sellers', 'shopinbos' ) . '</div></div></div></div></section>';
	if ( $img ) {
		$h .= '<section style="padding:0 0 40px"><div class="wrap"><div style="height:560px;border-radius:32px;overflow:hidden" class="grow v9-feat"><img fetchpriority="high" decoding="async" src="' . esc_url( $img ) . '" alt="' . esc_attr( get_the_title( $post ) ) . '" style="width:100%;height:100%;object-fit:cover"></div></div></section>';
	}
	$h .= '<section style="padding:56px 0 120px"><div class="wrap g2" style="display:grid;grid-template-columns:260px 1fr;gap:72px;max-width:1120px">';
	$h .= '<aside class="hm"><div style="position:sticky;top:24px;display:flex;flex-direction:column;gap:12px;font-size:14.5px">' . ( $toc ? '<span class="k mutd">' . esc_html__( 'On this page', 'shopinbos' ) . '</span>' . sib_v9_toc( $toc ) : '' );
	$h .= '<div style="margin-top:20px;display:flex;gap:8px;flex-wrap:wrap"><a class="tg" href="' . esc_url( $share ) . '" target="_blank" rel="noopener">' . esc_html__( 'Share on WhatsApp', 'shopinbos' ) . '</a><a class="tg" href="' . esc_url( get_permalink( $post ) ) . '" data-copy>' . esc_html__( 'Copy link', 'shopinbos' ) . '</a></div></div></aside>';
	$h .= '<article style="min-width:0;max-width:700px">' . ( $dek ? '<p class="lead" style="font-size:21px;color:#16141F">' . esc_html( $dek ) . '</p>' : '' ) . '<div class="v9-prose">' . $body . '</div></article></div></section>';
	$h .= sib_v9_related( $post );
	$h .= sib_v9_section( 'blog-post', 'night' );

	return [
		'slug'   => 'blog-post',
		'html'   => sib_v9_wrap( $h ),
		'title'  => (string) ( get_post_meta( $post->ID, 'sib_meta_title', true ) ?: get_the_title( $post ) ) . ' · Shopinbos',
		'crumbs' => [ [ __( 'Blog', 'shopinbos' ), home_url( '/blog/' ) ] ],
	];
}

/** "Keep reading": three posts from the same category, in the design's card style. */
function sib_v9_related( WP_Post $post ): string {
	$cats  = wp_get_post_categories( $post->ID );
	$posts = get_posts( [ 'post_type' => 'post', 'numberposts' => 3, 'post__not_in' => [ $post->ID ], 'category__in' => $cats, 'orderby' => 'date' ] );
	if ( count( $posts ) < 3 ) {
		$posts = array_merge( $posts, get_posts( [ 'post_type' => 'post', 'numberposts' => 3 - count( $posts ), 'post__not_in' => array_merge( [ $post->ID ], wp_list_pluck( $posts, 'ID' ) ) ] ) );
	}
	if ( ! $posts ) {
		return '';
	}
	$cards = '';
	foreach ( $posts as $p ) {
		$cat    = get_the_category( $p->ID );
		$img    = get_the_post_thumbnail_url( $p, 'large' );
		$dek    = (string) ( get_post_meta( $p->ID, 'sib_dek', true ) ?: get_the_excerpt( $p ) );
		$cards .= '<a href="' . esc_url( get_permalink( $p ) ) . '" class="lift" style="min-width:0;display:flex;flex-direction:column">'
			. '<div class="zm" style="height:240px;border-radius:24px;overflow:hidden;background:#EFEBE4">' . ( $img ? '<img decoding="async" loading="lazy" src="' . esc_url( $img ) . '" alt="" style="width:100%;height:100%;object-fit:cover">' : '' ) . '</div>'
			. '<div style="display:flex;gap:10px;align-items:center;margin-top:18px"><span class="tg og">' . esc_html( $cat ? $cat[0]->name : 'Guides' ) . '</span><span class="mutd" style="font-size:13px">' . esc_html( sib_v9_minutes( $p ) . ' min read' ) . '</span></div>'
			. '<div class="H" style="font-size:24px;line-height:1.1;margin-top:12px">' . esc_html( get_the_title( $p ) ) . '</div>'
			. '<p class="p mutd" style="margin-top:8px;font-size:15.5px">' . esc_html( wp_html_excerpt( $dek, 140, '…' ) ) . '</p></a>';
	}
	return '<section class="sec" style="background:#F6F3EE;"><div class="wrap"><div style="display:flex;flex-direction:column;gap:20px;max-width:980px;"><h2 class="H h2">' . esc_html__( 'Keep reading', 'shopinbos' ) . '</h2></div><div class="g3" style="display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:48px">' . $cards . '</div></div></section>';
}

/** A post card in the design's "Latest" style. */
function sib_v9_card( WP_Post $p, bool $lazy = true ): string {
	$cat = get_the_category( $p->ID );
	$img = get_the_post_thumbnail_url( $p, 'large' );
	$dek = (string) ( get_post_meta( $p->ID, 'sib_dek', true ) ?: get_the_excerpt( $p ) );
	return '<a href="' . esc_url( get_permalink( $p ) ) . '" class="lift" style="min-width:0;display:flex;flex-direction:column">'
		. '<div class="zm" style="height:240px;border-radius:24px;overflow:hidden;background:#EFEBE4">' . ( $img ? '<img decoding="async"' . ( $lazy ? ' loading="lazy"' : '' ) . ' src="' . esc_url( $img ) . '" alt="" style="width:100%;height:100%;object-fit:cover">' : '' ) . '</div>'
		. '<div style="display:flex;gap:10px;align-items:center;margin-top:18px"><span class="tg og">' . esc_html( $cat ? $cat[0]->name : 'Guides' ) . '</span><span class="mutd" style="font-size:13px">' . esc_html( sib_v9_minutes( $p ) . ' min read' ) . '</span></div>'
		. '<div class="H" style="font-size:24px;line-height:1.1;margin-top:12px">' . esc_html( get_the_title( $p ) ) . '</div>'
		. '<p class="p mutd" style="margin-top:8px;font-size:15.5px">' . esc_html( wp_html_excerpt( $dek, 140, '…' ) ) . '</p></a>';
}

/* Blog index: the design's featured post, topic chips and "Latest" grid, with real posts. ?topic=<category>&pg=<n> */
add_filter( 'sib_v9_fill', function ( string $html, string $slug ): string {
	if ( 'blog' !== $slug ) {
		return $html;
	}
	$topic = sanitize_title( wp_unslash( $_GET['topic'] ?? '' ) ); // phpcs:ignore WordPress.Security.NonceVerification
	$page  = max( 1, absint( $_GET['pg'] ?? 1 ) ); // phpcs:ignore WordPress.Security.NonceVerification
	$per   = 12;
	$args  = [ 'post_type' => 'post', 'post_status' => 'publish', 'posts_per_page' => $per + 1, 'paged' => $page, 'ignore_sticky_posts' => true ];
	if ( $topic ) {
		$args['category_name'] = $topic;
	}
	$q     = new WP_Query( $args );
	$posts = $q->posts;
	if ( ! $posts && $topic ) { // unknown topic: show everything
		unset( $args['category_name'] );
		$topic = '';
		$posts = ( new WP_Query( $args ) )->posts;
	}
	if ( ! $posts ) {
		return $html;
	}
	// Topic chips: the categories that have posts.
	$chips = '<a class="chip' . ( $topic ? '' : ' on' ) . '" href="/blog/">' . esc_html__( 'All', 'shopinbos' ) . '</a>';
	foreach ( get_categories( [ 'hide_empty' => true, 'orderby' => 'count', 'order' => 'DESC', 'number' => 9, 'exclude' => [ (int) get_option( 'default_category' ) ] ] ) as $c ) {
		$chips .= '<a class="chip' . ( $topic === $c->slug ? ' on' : '' ) . '" href="' . esc_url( add_query_arg( 'topic', $c->slug, '/blog/' ) ) . '">' . esc_html( $c->name ) . '</a>';
	}
	$html = (string) preg_replace( '#(<div class="up d3"[^>]*>)(?:<span class="chip[^"]*">[^<]*</span>)+#', '$1' . str_replace( '$', '\\$', $chips ), $html, 1 );

	// Featured: the newest post on page one.
	$feat = 1 === $page ? array_shift( $posts ) : null;
	if ( $feat ) {
		$cat  = get_the_category( $feat->ID );
		$img  = get_the_post_thumbnail_url( $feat, 'full' );
		$dek  = (string) ( get_post_meta( $feat->ID, 'sib_dek', true ) ?: get_the_excerpt( $feat ) );
		$card = '<a href="' . esc_url( get_permalink( $feat ) ) . '" class="g2 lift rv" style="display:grid;grid-template-columns:1.2fr 1fr;gap:56px;align-items:center">'
			. '<div class="zm" style="height:520px;border-radius:32px;overflow:hidden;background:#EFEBE4">' . ( $img ? '<img decoding="async" fetchpriority="high" src="' . esc_url( $img ) . '" alt="" style="width:100%;height:100%;object-fit:cover">' : '' ) . '</div>'
			. '<div style="display:flex;flex-direction:column;gap:16px"><span class="k orgd">' . esc_html( 'Featured · ' . ( $cat ? $cat[0]->name : 'Guides' ) ) . '</span><div class="H" style="font-size:clamp(34px,3.6vw,54px);line-height:1.02">' . esc_html( get_the_title( $feat ) ) . '</div>'
			. '<p class="lead" style="font-size:18px">' . esc_html( wp_html_excerpt( $dek, 200, '…' ) ) . '</p><span class="mutd" style="font-size:14px">' . esc_html( sib_v9_minutes( $feat ) . ' min read · Shopinbos team' ) . '</span><span class="more">' . esc_html__( 'Read the guide', 'shopinbos' ) . ' →</span></div></a>';
		$html = (string) preg_replace_callback( '#<a href="/blog/" class="g2 lift rv".*?</a>#s', fn() => $card, $html, 1 );
	} else {
		$html = (string) preg_replace( '#<section class="sec" style="background:\#fff;"><div class="wrap"><a href="/blog/" class="g2 lift rv".*?</section>#s', '', $html, 1 );
	}

	$more  = count( $posts ) > $per - ( $feat ? 1 : 0 );
	$posts = array_slice( $posts, 0, $per - ( $feat ? 1 : 0 ) );
	$cards = implode( '', array_map( 'sib_v9_card', $posts ) );
	$nav   = '';
	if ( $page > 1 || $more ) {
		$base = $topic ? add_query_arg( 'topic', $topic, '/blog/' ) : '/blog/';
		$nav  = '<div style="display:flex;gap:12px;justify-content:center;margin-top:48px">'
			. ( $page > 1 ? '<a class="btn b-line" href="' . esc_url( $page > 2 ? add_query_arg( 'pg', $page - 1, $base ) : $base ) . '">← ' . esc_html__( 'Newer', 'shopinbos' ) . '</a>' : '' )
			. ( $more ? '<a class="btn b-ink" href="' . esc_url( add_query_arg( 'pg', $page + 1, $base ) ) . '">' . esc_html__( 'More guides', 'shopinbos' ) . ' →</a>' : '' ) . '</div>';
	}
	return (string) preg_replace_callback( '#(<div class="g3 rvs"[^>]*>).*?</div></div></section>#s', fn( $m ) => $m[1] . $cards . '</div>' . $nav . '</div></section>', $html, 1 );
}, 10, 2 );

/* ---------- Help article (V9-HelpArticle) ---------- */

function sib_v9_help_article(): ?array {
	$post = get_queried_object();
	if ( ! $post instanceof WP_Post ) {
		return null;
	}
	[ $body ] = sib_v9_prose( $post );
	$terms    = get_the_terms( $post, 'sib_help_category' );
	$term     = $terms && ! is_wp_error( $terms ) ? $terms[0] : null;
	$siblings = get_posts( [
		'post_type'   => 'sib_help',
		'numberposts' => 8,
		'orderby'     => 'menu_order title',
		'order'       => 'ASC',
		'tax_query'   => $term ? [ [ 'taxonomy' => 'sib_help_category', 'terms' => $term->term_id ] ] : [], // phpcs:ignore WordPress.DB.SlowDBQuery
	] );
	$wa       = function_exists( 'sib_whatsapp_url' ) ? sib_whatsapp_url( 'Hi Shopinbos, I have a question about: ' . get_the_title( $post ) ) : '/contact/';

	$side = '';
	foreach ( $siblings as $s ) {
		$on    = $s->ID === $post->ID;
		$side .= '<a href="' . esc_url( get_permalink( $s ) ) . '" style="display:block;padding:10px 12px;border-radius:12px;font-size:14.5px;' . ( $on ? 'background:#16141F;color:#fff;font-weight:700' : 'color:#55516A' ) . '">' . esc_html( get_the_title( $s ) ) . '</a>';
	}
	$related = '';
	foreach ( array_slice( array_filter( $siblings, fn( $s ) => $s->ID !== $post->ID ), 0, 3 ) as $s ) {
		$related .= '<a href="' . esc_url( get_permalink( $s ) ) . '" class="row" style="padding:14px 0;font-size:16px;box-shadow:inset 0 -1px 0 #EAE7EF"><span style="flex:1">' . esc_html( get_the_title( $s ) ) . '</span><span aria-hidden="true">→</span></a>';
	}
	$cat = $term ? $term->name : __( 'Help', 'shopinbos' );

	$h  = '<section style="background:#F6F3EE;padding:40px 0"><div class="wrap" style="display:flex;justify-content:space-between;align-items:center;gap:24px;flex-wrap:wrap"><div style="font-size:14px" class="mutd"><a href="/help/">' . esc_html__( 'Help centre', 'shopinbos' ) . '</a> / ' . esc_html( $cat ) . '</div>';
	$h .= '<form action="/help/" method="get" role="search" style="flex:1;max-width:480px"><div style="display:flex;align-items:center;gap:8px;background:#fff;border-radius:999px;padding:6px 6px 6px 22px;box-shadow:inset 0 0 0 1.5px #E3E0E8"><input type="search" name="q" placeholder="' . esc_attr__( 'Search help', 'shopinbos' ) . '" aria-label="' . esc_attr__( 'Search help', 'shopinbos' ) . '" style="flex:1;min-width:0;border:0;outline:0;font-size:16px;background:transparent"><button class="btn b-ink" style="height:46px;font-size:15px">' . esc_html__( 'Search', 'shopinbos' ) . '</button></div></form></div></section>';
	$h .= '<section style="padding:72px 0 120px"><div class="wrap g2" style="display:grid;grid-template-columns:280px 1fr;gap:64px;max-width:1180px">';
	$h .= '<aside class="hm"><span class="k mutd" style="padding:0 12px">' . esc_html( $cat ) . '</span><div style="margin-top:12px;display:grid;gap:2px">' . $side . '</div></aside>';
	$h .= '<article style="min-width:0;max-width:720px"><h1 class="H" style="font-size:clamp(36px,4vw,56px);line-height:1.05">' . esc_html( get_the_title( $post ) ) . '</h1><p class="mutd" style="font-size:14px;margin-top:14px">' . esc_html( sprintf( 'Updated %s · %d min read', get_the_modified_date( 'j F Y', $post ), sib_v9_minutes( $post ) ) ) . '</p>';
	$h .= '<div class="v9-prose" style="margin-top:28px">' . $body . '</div>';
	$h .= '<div class="ui" style="margin-top:40px;padding:22px;display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;box-shadow:inset 0 0 0 1px #EAE7EF"><b>' . esc_html__( 'Still stuck?', 'shopinbos' ) . '</b><a class="btn b-ink" href="' . esc_url( $wa ) . '" style="height:42px;font-size:14px;padding:0 18px">' . esc_html__( 'Chat with us', 'shopinbos' ) . '</a></div>';
	$h .= $related ? '<div style="margin-top:40px"><span class="k mutd">' . esc_html__( 'Related', 'shopinbos' ) . '</span><div style="margin-top:8px">' . $related . '</div></div>' : '';
	$h .= '</article></div></section>';

	return [
		'slug'   => 'help-article',
		'html'   => sib_v9_wrap( $h, 'help-article' ),
		'title'  => get_the_title( $post ) . ' · Shopinbos Help',
		'crumbs' => [ [ __( 'Help centre', 'shopinbos' ), home_url( '/help/' ) ] ],
	];
}

/* ---------- Legal pages (V9-Terms) ---------- */

function sib_v9_legal_parent(): int {
	$p = get_page_by_path( 'legal' );
	return $p ? (int) $p->ID : 0;
}

function sib_v9_is_legal(): bool {
	$parent = sib_v9_legal_parent();
	return $parent && is_page() && (int) wp_get_post_parent_id( get_queried_object_id() ) === $parent;
}

function sib_v9_legal(): ?array {
	$post = get_queried_object();
	if ( ! $post instanceof WP_Post ) {
		return null;
	}
	[ $body, $toc ] = sib_v9_prose( $post );
	$updated        = (string) get_post_meta( $post->ID, 'sib_updated', true ) ?: get_the_modified_date( 'Y-m-d', $post );
	$effective      = (string) get_post_meta( $post->ID, 'sib_effective', true );
	$date           = fn( $d ) => wp_date( 'j F Y', strtotime( $d . ' 12:00' ) );
	$lead           = has_excerpt( $post ) ? get_the_excerpt( $post ) : '';
	// The five main policies first, in the design's order, then the rest.
	$order = [ 'terms', 'privacy', 'refunds', 'seller-rules', 'cookies', 'supplier-terms', 'delivery-partner-terms', 'website-terms', 'affiliate-terms' ];
	$pages = get_pages( [ 'parent' => sib_v9_legal_parent(), 'post_status' => 'publish' ] );
	usort( $pages, fn( $a, $b ) => ( array_search( $a->post_name, $order, true ) ?: 99 ) <=> ( array_search( $b->post_name, $order, true ) ?: 99 ) );
	$nav = '';
	foreach ( $pages as $p ) {
		$on   = $p->ID === $post->ID;
		$nav .= '<a href="' . esc_url( get_permalink( $p ) ) . '" style="display:block;padding:10px 14px;border-radius:12px;font-size:15px;' . ( $on ? 'background:#16141F;color:#fff;font-weight:700' : 'color:#55516A' ) . '">' . esc_html( get_the_title( $p ) ) . '</a>';
	}

	$h  = '<section style="background:#F6F3EE;padding:80px 0 64px"><div class="wrap"><span class="k orgd">' . esc_html__( 'Legal', 'shopinbos' ) . '</span><h1 class="H up" style="font-size:clamp(44px,5.4vw,80px);margin-top:16px">' . esc_html( get_the_title( $post ) ) . '</h1>';
	$h .= $lead ? '<p class="lead" style="margin-top:16px;max-width:620px">' . esc_html( $lead ) . '</p>' : '';
	$h .= '<p class="mutd" style="font-size:14px;margin-top:18px">' . esc_html( sprintf( 'Last updated %s', $date( $updated ) ) . ( $effective && strtotime( $effective ) > time() ? sprintf( ' · Takes effect %s', $date( $effective ) ) : '' ) . ' · Tech Della Solutions Ltd (RC 7038770)' ) . '</p></div></section>';
	$h .= '<section style="padding:64px 0 120px"><div class="wrap g2" style="display:grid;grid-template-columns:260px 1fr;gap:72px;max-width:1180px">';
	$h .= '<aside class="hm"><div style="display:grid;gap:4px">' . $nav . '</div>' . ( $toc ? '<div style="margin-top:32px;display:flex;flex-direction:column;gap:10px"><span class="k mutd">' . esc_html__( 'On this page', 'shopinbos' ) . '</span>' . sib_v9_toc( $toc, 'font-size:14px;color:#6B6779' ) . '</div>' : '' ) . '</aside>';
	$h .= '<article style="min-width:0;max-width:740px"><div class="v9-prose v9-legal">' . $body . '</div>';
	$h .= '<div class="ui" style="margin-top:48px;padding:22px;display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;box-shadow:inset 0 0 0 1px #EAE7EF"><span>' . esc_html__( 'Questions about this policy?', 'shopinbos' ) . '</span><a class="btn b-ink" href="/contact/" style="height:42px;font-size:14px;padding:0 18px">' . esc_html__( 'Contact us', 'shopinbos' ) . '</a></div></article></div></section>';

	return [
		'slug'   => 'legal',
		'html'   => sib_v9_wrap( $h, 'legal-terms' ),
		'title'  => get_the_title( $post ) . ' · Shopinbos',
		'crumbs' => [ [ __( 'Legal', 'shopinbos' ), home_url( '/legal/' ) ] ],
	];
}

add_filter( 'sib_v9_content_templates', function ( array $t ): array {
	$t['sib_v9_is_blog_post'] = 'sib_v9_blog_post';
	$t['sib_v9_is_help']      = 'sib_v9_help_article';
	$t['sib_v9_is_legal']     = 'sib_v9_legal';
	return $t;
} );

function sib_v9_is_blog_post(): bool {
	return is_singular( 'post' );
}

function sib_v9_is_help(): bool {
	return is_singular( 'sib_help' );
}
