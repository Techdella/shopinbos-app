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
	$body           = sib_v9_blog_insert_cta( $body, $post );
	$cat            = sib_v9_blog_cat( $post );
	$dek            = (string) ( get_post_meta( $post->ID, 'sib_dek', true ) ?: ( has_excerpt( $post ) ? get_the_excerpt( $post ) : '' ) );
	$img            = get_the_post_thumbnail_url( $post, 'full' );
	[ $seo_title, $seo_desc ] = sib_v9_blog_seo( $post );
	$tag            = $cat ? '<a class="tg og" href="' . esc_url( sib_v9_blog_cat_url( $cat ) ) . '">' . esc_html( $cat->name ) . '</a>' : '<span class="tg og">' . esc_html__( 'Guides', 'shopinbos' ) . '</span>';
	$updated        = get_post_modified_time( 'U', true, $post ) - get_post_time( 'U', true, $post ) > DAY_IN_SECONDS ? ' · ' . sprintf( /* translators: %s: date */ __( 'Updated %s', 'shopinbos' ), get_the_modified_date( 'j F Y', $post ) ) : '';

	$h  = '<section style="padding:72px 0 40px"><div class="wrap" style="max-width:980px"><a href="/blog/" class="more mutd" style="font-size:14px">← ' . esc_html__( 'Blog', 'shopinbos' ) . '</a>';
	$h .= '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:28px">' . $tag . '<span class="mutd" style="font-size:14px">' . esc_html( sprintf( '%d min read · %s', sib_v9_minutes( $post ), get_the_date( 'j F Y', $post ) ) . $updated ) . '</span></div>';
	$h .= '<h1 class="H up" style="font-size:clamp(40px,5vw,72px);line-height:1;margin-top:18px">' . esc_html( get_the_title( $post ) ) . '</h1>';
	$h .= sib_v9_blog_byline( $post ) . '</div></section>';
	if ( $img ) {
		$h .= '<section style="padding:0 0 40px"><div class="wrap"><div style="height:560px;border-radius:32px;overflow:hidden" class="grow v9-feat"><img fetchpriority="high" decoding="async" src="' . esc_url( $img ) . '" alt="' . esc_attr( sib_v9_blog_alt( $post ) ) . '" style="width:100%;height:100%;object-fit:cover"></div>' . sib_v9_blog_credit( $post ) . '</div></section>';
	}
	$h .= '<section style="padding:56px 0 120px"><div class="wrap g2" style="display:grid;grid-template-columns:260px 1fr;gap:72px;max-width:1120px">';
	$h .= '<aside class="hm"><div style="position:sticky;top:24px;display:flex;flex-direction:column;gap:12px;font-size:14.5px">' . ( $toc ? '<span class="k mutd">' . esc_html__( 'On this page', 'shopinbos' ) . '</span>' . sib_v9_toc( $toc ) : '' );
	$h .= '<span class="k mutd" style="margin-top:20px">' . esc_html__( 'Share', 'shopinbos' ) . '</span>' . sib_v9_blog_share( $post, 'side' ) . '</div></aside>';
	$h .= '<article style="min-width:0;max-width:700px">' . ( $dek ? '<p class="lead" style="font-size:21px;color:#16141F">' . esc_html( $dek ) . '</p>' : '' ) . '<div class="v9-prose">' . $body . '</div>' . sib_v9_blog_end( $post ) . '</article></div></section>';
	$h .= sib_v9_related( $post );
	$h .= sib_v9_section( 'blog-post', 'night' );

	$crumbs = [ [ __( 'Blog', 'shopinbos' ), home_url( '/blog/' ) ] ];
	if ( $cat ) {
		$crumbs[] = [ $cat->name, sib_v9_blog_cat_url( $cat ) ];
	}
	$crumbs[] = [ get_the_title( $post ), get_permalink( $post ) ];
	return [
		'slug'        => 'blog-post',
		'html'        => sib_v9_wrap( $h ),
		'title'       => $seo_title . ( str_contains( $seo_title, 'Shopinbos' ) || mb_strlen( $seo_title ) > 48 ? '' : ' · Shopinbos' ),
		'description' => $seo_desc,
		'crumbs'      => $crumbs,
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
			. '<div class="zm" style="height:240px;border-radius:24px;overflow:hidden;background:#EFEBE4">' . ( $img ? '<img decoding="async" loading="lazy" src="' . esc_url( $img ) . '" alt="' . esc_attr( sib_v9_blog_alt( $p ) ) . '" style="width:100%;height:100%;object-fit:cover">' : '' ) . '</div>'
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
		. '<div class="zm" style="height:240px;border-radius:24px;overflow:hidden;background:#EFEBE4">' . ( $img ? '<img decoding="async"' . ( $lazy ? ' loading="lazy"' : '' ) . ' src="' . esc_url( $img ) . '" alt="' . esc_attr( sib_v9_blog_alt( $p ) ) . '" style="width:100%;height:100%;object-fit:cover">' : '' ) . '</div>'
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
		$chips .= '<a class="chip' . ( $topic === $c->slug ? ' on' : '' ) . '" href="' . esc_url( sib_v9_blog_cat_url( $c ) ) . '">' . esc_html( $c->name ) . '</a>';
	}
	$html = (string) preg_replace( '#(<div class="up d3"[^>]*>)(?:<span class="chip[^"]*">[^<]*</span>)+#', '$1' . str_replace( '$', '\\$', $chips ), $html, 1 );

	// Featured: the newest post on page one.
	$feat = 1 === $page ? array_shift( $posts ) : null;
	if ( $feat ) {
		$cat  = get_the_category( $feat->ID );
		$img  = get_the_post_thumbnail_url( $feat, 'full' );
		$dek  = (string) ( get_post_meta( $feat->ID, 'sib_dek', true ) ?: get_the_excerpt( $feat ) );
		$card = '<a href="' . esc_url( get_permalink( $feat ) ) . '" class="g2 lift rv" style="display:grid;grid-template-columns:1.2fr 1fr;gap:56px;align-items:center">'
			. '<div class="zm" style="height:520px;border-radius:32px;overflow:hidden;background:#EFEBE4">' . ( $img ? '<img decoding="async" fetchpriority="high" src="' . esc_url( $img ) . '" alt="' . esc_attr( sib_v9_blog_alt( $feat ) ) . '" style="width:100%;height:100%;object-fit:cover">' : '' ) . '</div>'
			. '<div style="display:flex;flex-direction:column;gap:16px"><span class="k orgd">' . esc_html( 'Featured · ' . ( $cat ? $cat[0]->name : 'Guides' ) ) . '</span><div class="H" style="font-size:clamp(34px,3.6vw,54px);line-height:1.02">' . esc_html( get_the_title( $feat ) ) . '</div>'
			. '<p class="lead" style="font-size:18px">' . esc_html( wp_html_excerpt( $dek, 200, '…' ) ) . '</p><span class="mutd" style="font-size:14px">' . esc_html( sib_v9_minutes( $feat ) . ' min read · ' . ( get_the_author_meta( 'display_name', (int) $feat->post_author ) ?: 'Shopinbos team' ) ) . '</span><span class="more">' . esc_html__( 'Read the guide', 'shopinbos' ) . ' →</span></div></a>';
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

/* ---------- Trending: the real daily TikTok trend reports (plugin: includes/trends.php) ---------- */

/** One trending product as a V9 card. */
function sib_v9_trend_card( array $p, int $rank, string $niche, bool $big = false ): string {
	$n      = function_exists( 'sib_trend_niches' ) ? ( sib_trend_niches()[ $niche ] ?? sib_trend_niches()['mixed'] ) : [ '', '#F6F3EE', '#16141F' ];
	$search = 'https://www.tiktok.com/search/video?q=' . rawurlencode( (string) ( ( $p['tiktok_search'] ?? '' ) ?: $p['name'] ) );
	$find   = add_query_arg( 'q', rawurlencode( (string) ( ( $p['q'] ?? '' ) ?: $p['name'] ) ), home_url( '/find-stock/' ) );
	$out    = '<div class="bc c-wh lift" id="p' . $rank . '" style="padding:0;overflow:hidden;' . ( $big ? 'grid-row:span 2' : '' ) . '">'
		. '<div style="background:' . esc_attr( $n[1] ) . ';color:' . esc_attr( $n[2] ) . ';padding:22px 26px;min-height:' . ( $big ? '200' : '120' ) . 'px;display:flex;flex-direction:column;justify-content:space-between;gap:12px">'
		. '<span class="H" style="font-size:' . ( $big ? '64' : '44' ) . 'px;line-height:1">#' . $rank . '</span><div class="H h3" style="color:inherit">' . esc_html( $p['name'] ) . '</div></div>'
		. '<div style="padding:22px 26px;display:flex;flex-direction:column;gap:10px;font-size:15px;line-height:1.55">';
	if ( ! empty( $p['why'] ) ) {
		$out .= '<p class="p" style="margin:0">' . esc_html( $p['why'] ) . '</p>';
	}
	if ( ! empty( $p['price_ngn'] ) ) {
		$out .= '<div><span class="tg ok">' . esc_html( sprintf( 'Sells for %s', $p['price_ngn'] ) ) . '</span></div>';
	}
	if ( ! empty( $p['source_hint'] ) ) {
		$out .= '<div class="mutd" style="font-size:14px"><b>' . esc_html__( 'Get stock:', 'shopinbos' ) . '</b> ' . esc_html( $p['source_hint'] ) . '</div>';
	}
	if ( ! empty( $p['video_idea'] ) ) {
		$out .= '<div style="padding:12px 14px;border-radius:14px;background:#F6F3EE;font-size:14px"><b>' . esc_html__( 'Film this:', 'shopinbos' ) . '</b> ' . esc_html( $p['video_idea'] ) . '</div>';
	}
	$out .= '<div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-top:6px"><a class="btn b-ink" href="' . esc_url( $find ) . '" style="height:42px;font-size:14px;padding:0 18px">' . esc_html__( 'Find suppliers', 'shopinbos' ) . '</a><a class="more" href="' . esc_url( $search ) . '" target="_blank" rel="noopener nofollow" style="font-size:14px">' . esc_html__( 'See the videos', 'shopinbos' ) . ' →</a></div>';
	return $out . '</div></div>';
}

/** A report as a small card. */
function sib_v9_trend_tile( WP_Post $r ): string {
	$d = sib_trend_data( $r );
	$n = sib_trend_niches()[ $d['niche'] ] ?? sib_trend_niches()['mixed'];
	return '<a href="' . esc_url( get_permalink( $r ) ) . '" class="bc c-wh lift" style="gap:10px;min-height:200px"><span class="tg" style="align-self:flex-start;background:' . esc_attr( $n[1] ) . ';color:' . esc_attr( $n[2] ) . '">' . esc_html( $n[0] ) . '</span>'
		. '<div class="H h3" style="margin-top:auto">' . esc_html( get_the_title( $r ) ) . '</div><span class="mutd" style="font-size:13.5px">' . esc_html( get_the_date( 'l j F', $r ) ) . '</span></a>';
}

/* /trending/: the newest report's products in place of the design's samples, then earlier reports. */
add_filter( 'sib_v9_fill', function ( string $html, string $slug ): string {
	if ( 'trending' !== $slug || ! function_exists( 'sib_trend_data' ) ) {
		return $html;
	}
	$reports = get_posts( [ 'post_type' => 'sib_trend', 'post_status' => 'publish', 'numberposts' => 10 ] );
	if ( ! $reports ) {
		return $html;
	}
	$latest = array_shift( $reports );
	$d      = sib_trend_data( $latest );
	$items  = array_slice( array_values( array_filter( (array) $d['products'], fn( $p ) => ! empty( $p['name'] ) ) ), 0, 6 );
	$cards  = '';
	foreach ( $items as $i => $p ) {
		$cards .= sib_v9_trend_card( $p, $i + 1, $d['niche'], 0 === $i );
	}
	$sec = '<section class="sec" style="background:#fff;padding-top:48px"><div class="wrap"><div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-end;flex-wrap:wrap"><div><span class="k orgd">' . esc_html( sprintf( 'Today · %s', get_the_date( 'l j F', $latest ) ) ) . '</span><h2 class="H h2" style="margin-top:10px">' . esc_html( get_the_title( $latest ) ) . '</h2></div><a class="more" href="' . esc_url( get_permalink( $latest ) ) . '">' . esc_html__( 'Read the full report', 'shopinbos' ) . ' →</a></div>'
		. '<div class="bn g3" style="grid-template-columns:1.3fr 1fr 1fr;margin-top:32px">' . $cards . '</div>';
	if ( $reports ) {
		$sec .= '<h2 class="H h3" style="margin-top:72px">' . esc_html__( 'Earlier reports', 'shopinbos' ) . '</h2><div class="bn g3" style="grid-template-columns:repeat(3,1fr);margin-top:24px">' . implode( '', array_map( 'sib_v9_trend_tile', array_slice( $reports, 0, 9 ) ) ) . '</div>';
	}
	$sec .= '</div></section>';
	$html = str_replace( 'Updated every Monday · [date]', esc_html( 'Updated every day · ' . get_the_date( 'j F Y', $latest ) ), $html );
	$html = str_replace( 'A weekly feed of products', 'A daily feed of products', $html );
	return (string) preg_replace_callback( '#<section class="sec" style="background:\#fff;padding-top:48px">.*?</section>(?=<section class="sec" style="background:\#F6F3EE;")#s', fn() => $sec, $html, 1 );
}, 10, 2 );

/* A trend report (/trending/{slug}/). */
function sib_v9_trend_report(): ?array {
	$post = get_queried_object();
	if ( ! $post instanceof WP_Post || ! function_exists( 'sib_trend_data' ) ) {
		return null;
	}
	$d     = sib_trend_data( $post );
	$n     = sib_trend_niches()[ $d['niche'] ] ?? sib_trend_niches()['mixed'];
	$items = array_values( array_filter( (array) $d['products'], fn( $p ) => ! empty( $p['name'] ) ) );
	$cards = '';
	foreach ( $items as $i => $p ) {
		$cards .= sib_v9_trend_card( $p, $i + 1, $d['niche'] );
	}
	$more = get_posts( [ 'post_type' => 'sib_trend', 'post_status' => 'publish', 'numberposts' => 3, 'exclude' => [ $post->ID ] ] );

	$h  = '<section style="background:#F6F3EE;padding:72px 0 56px"><div class="wrap" style="max-width:980px"><a href="/trending/" class="more mutd" style="font-size:14px">← ' . esc_html__( 'Trending products', 'shopinbos' ) . '</a>';
	$h .= '<div style="display:flex;gap:10px;align-items:center;margin-top:24px;flex-wrap:wrap"><span class="tg" style="background:' . esc_attr( $n[1] ) . ';color:' . esc_attr( $n[2] ) . '">' . esc_html( $n[0] ) . '</span><span class="mutd" style="font-size:14px">' . esc_html( sprintf( 'Trending on TikTok · %s', get_the_date( 'l j F Y', $post ) ) ) . '</span></div>';
	$h .= '<h1 class="H up" style="font-size:clamp(38px,4.6vw,64px);line-height:1.02;margin-top:16px">' . esc_html( get_the_title( $post ) ) . '</h1>' . ( $d['intro'] ? '<p class="lead" style="margin-top:18px;max-width:720px">' . esc_html( $d['intro'] ) . '</p>' : '' ) . '</div></section>';
	$h .= '<section class="sec" style="background:#fff;padding-top:56px"><div class="wrap"><div class="bn g3" style="grid-template-columns:repeat(3,1fr)">' . $cards . '</div>';
	$h .= '<p class="mutd" style="font-size:14px;margin-top:40px;max-width:820px">' . esc_html( $d['note'] ?: __( 'How we pick: products with a clear trend on TikTok (views, hashtags and TikTok Shop sales) that Nigerian sellers can stock locally or import. Prices are typical Nigerian retail prices and change often; check with your supplier.', 'shopinbos' ) ) . '</p>';
	$h .= $more ? '<h2 class="H h3" style="margin-top:64px">' . esc_html__( 'More trend reports', 'shopinbos' ) . '</h2><div class="bn g3" style="grid-template-columns:repeat(3,1fr);margin-top:24px">' . implode( '', array_map( 'sib_v9_trend_tile', $more ) ) . '</div>' : '';
	$h .= '</div></section>' . sib_v9_section( 'trending', 'night' );
	$h .= '<script type="application/ld+json">' . wp_json_encode( [ '@context' => 'https://schema.org', '@type' => 'ItemList', 'name' => get_the_title( $post ), 'itemListElement' => array_map( fn( $p, $i ) => [ '@type' => 'ListItem', 'position' => $i + 1, 'name' => $p['name'], 'description' => $p['why'] ?? '' ], $items, array_keys( $items ) ) ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . '</script>';

	return [
		'slug'   => 'trending-report',
		'html'   => sib_v9_wrap( $h, 'trending' ),
		'title'  => get_the_title( $post ) . ' · Shopinbos',
		'crumbs' => [ [ __( 'Trending', 'shopinbos' ), home_url( '/trending/' ) ] ],
	];
}

add_filter( 'sib_v9_content_templates', function ( array $t ): array {
	$t['sib_v9_is_trend'] = 'sib_v9_trend_report';
	return $t;
} );

function sib_v9_is_trend(): bool {
	return is_singular( 'sib_trend' );
}

/* ---------- Academy: real courses (sib_track) and lessons (sib_lesson) ---------- */

/** Photos from the design, used in turn on course cards. */
function sib_v9_course_img( int $i ): string {
	$ids = [ '78a6733a9877bdd41e6583da623da8c5', '49aaca8689ef488a9b24ea9dce101f56', '093071d746fcb16b3ae1ee918b0919c9', '5ac187f7c7212965a47d0b3268ab2138', 'e1a6648c9c53610cdbb8ec20c5dde5bf', '94de8ef94cc6898c1e4ea9b9f534347a', '99c0c2910ffccc1e5b718ed6bf3fa984', '01af1f138e38f9e0cb7966dd03277437' ];
	return get_theme_file_uri( 'v9/img/' . $ids[ $i % count( $ids ) ] . '.webp' );
}

function sib_v9_course_card( array $t, int $i ): string {
	$n = count( $t['lessons'] );
	return '<a href="' . esc_url( get_term_link( $t['term'] ) ) . '" class="bc lift" style="background:' . esc_attr( $t['bg'] ) . ';padding:0;min-height:420px">'
		. '<div class="zm" style="height:200px"><img decoding="async" loading="lazy" src="' . esc_url( sib_v9_course_img( $i ) ) . '" alt="" style="width:100%;height:100%;object-fit:cover;object-position:50% 30%"></div>'
		. '<div style="padding:28px;display:flex;flex-direction:column;gap:8px;flex:1"><span class="k mutd">' . esc_html( sprintf( 'Course %d', $i + 1 ) ) . '</span><div class="H h3">' . esc_html( $t['term']->name ) . '</div>'
		. ( $t['term']->description ? '<p class="p mutd" style="font-size:15px">' . esc_html( wp_html_excerpt( $t['term']->description, 120, '…' ) ) . '</p>' : '' )
		. '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:auto"><span style="font-size:14px;font-weight:700">' . esc_html( sprintf( '%d lessons · %d min · Free', $n, $t['mins'] ) ) . '</span><span aria-hidden="true">→</span></div></div></a>';
}

/** Lesson rows (number, title, minutes) linking to each lesson. */
function sib_v9_lesson_rows( array $lessons, int $current = 0 ): string {
	$out = '';
	foreach ( $lessons as $i => $l ) {
		$on   = $l->ID === $current;
		$out .= '<a href="' . esc_url( get_permalink( $l ) ) . '" class="row" data-lesson-row="' . (int) $l->ID . '" style="padding:14px 8px;font-size:15.5px;border-bottom:1px solid #ECEAF2;gap:14px' . ( $on ? ';font-weight:700' : '' ) . '"><span class="v9-num" style="width:34px;height:34px;border-radius:99px;flex:none;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;background:' . ( $on ? '#16141F;color:#fff' : '#F4F3F7' ) . '">' . ( $i + 1 ) . '</span><span style="flex:1">' . esc_html( get_the_title( $l ) ) . '</span><span class="mutd" style="font-size:13px">' . esc_html( sib_lesson_data( $l )['minutes'] . ' min' ) . '</span></a>';
	}
	return $out;
}

add_filter( 'sib_v9_fill', function ( string $html, string $slug ): string {
	if ( 'academy' !== $slug || ! function_exists( 'sib_academy_tracks' ) ) {
		return $html;
	}
	$tracks = array_values( array_filter( sib_academy_tracks(), fn( $t ) => $t['lessons'] ) );
	if ( ! $tracks ) {
		return $html;
	}
	$cards = implode( '', array_map( 'sib_v9_course_card', $tracks, array_keys( $tracks ) ) );
	$html  = (string) preg_replace_callback( '#(<div class="bn g3 rvs" style="grid-template-columns:repeat\(3,1fr\);margin-top:56px">).*?(</div></div></section>)#s', fn( $m ) => '<div class="bn g3" style="grid-template-columns:repeat(3,1fr);margin-top:56px">' . $cards . $m[2], $html, 1 );
	// The "one course" preview: the first course and its lessons.
	$first = $tracks[0];
	$prev  = '<section class="sec" style="background:#F6F3EE;"><div class="wrap"><div class="g2" style="display:grid;grid-template-columns:1fr 1fr;gap:64px;align-items:center">'
		. '<div style="position:relative"><div style="height:400px;border-radius:28px;overflow:hidden"><img decoding="async" loading="lazy" src="' . esc_url( sib_v9_course_img( 0 ) ) . '" alt="" style="width:100%;height:100%;object-fit:cover"></div></div>'
		. '<div><span class="k orgd">' . esc_html( 'Course · ' . $first['term']->name ) . '</span><div class="H h2" style="margin-top:14px;font-size:clamp(32px,3.4vw,50px)">' . esc_html( sprintf( '%s lessons.', ucfirst( function_exists( 'sib_number_word' ) ? sib_number_word( count( $first['lessons'] ) ) : (string) count( $first['lessons'] ) ) ) ) . ' <span class="it orgd">' . esc_html__( 'One real shop.', 'shopinbos' ) . '</span></div>'
		. '<div style="margin-top:24px">' . sib_v9_lesson_rows( $first['lessons'] ) . '</div><a class="btn b-ink" href="' . esc_url( get_permalink( $first['lessons'][0] ) ) . '" style="margin-top:24px">' . esc_html__( 'Start the first lesson', 'shopinbos' ) . '</a></div></div></div></section>';
	$html  = (string) preg_replace_callback( '#<section class="sec" style="background:\#F6F3EE;"><div class="wrap"><div class="g2".*?</section>#s', fn() => $prev, $html, 1 );
	return str_replace( [ 'href="/academy/" class="btn', 'Start learning</a>' ], [ 'href="#courses" class="btn', 'Start learning</a>' ], $html );
}, 10, 2 );

/* A course page (/academy/{course}/). */
function sib_v9_course(): ?array {
	$term = get_queried_object();
	if ( ! $term instanceof WP_Term || ! function_exists( 'sib_academy_track' ) ) {
		return null;
	}
	$t = sib_academy_track( $term );
	if ( ! $t || ! $t['lessons'] ) {
		return null;
	}
	$all = array_values( array_filter( sib_academy_tracks(), fn( $x ) => $x['lessons'] ) );
	$pos = (int) array_search( $term->term_id, array_map( fn( $x ) => $x['term']->term_id, $all ), true );

	$h  = '<section style="background:' . esc_attr( $t['bg'] ) . ';padding:64px 0 88px"><div class="wrap" style="max-width:980px"><div class="mutd" style="font-size:14px"><a href="/academy/">' . esc_html__( 'Academy', 'shopinbos' ) . '</a> / ' . esc_html( $term->name ) . '</div>';
	$h .= '<span class="k orgd" style="display:block;margin-top:28px">' . esc_html( sprintf( 'Course %d', $pos + 1 ) ) . '</span><h1 class="H up" style="font-size:clamp(42px,5vw,76px);line-height:1;margin-top:14px">' . esc_html( $term->name ) . '</h1>';
	$h .= $term->description ? '<p class="lead" style="margin-top:18px;max-width:680px">' . esc_html( $term->description ) . '</p>' : '';
	$h .= '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:24px"><span class="tg">' . esc_html( count( $t['lessons'] ) . ' lessons' ) . '</span><span class="tg">' . esc_html( sprintf( 'About %d minutes', $t['mins'] ) ) . '</span><span class="tg">English and Pidgin</span><span class="tg">Free</span></div>';
	$h .= '<a class="btn b-ink" href="' . esc_url( get_permalink( $t['lessons'][0] ) ) . '" style="margin-top:28px">' . esc_html__( 'Start the course', 'shopinbos' ) . '</a></div></section>';
	$h .= '<section class="sec" style="background:#fff;"><div class="wrap" style="max-width:880px"><h2 class="H h2">' . esc_html__( 'Lessons', 'shopinbos' ) . '</h2><div style="margin-top:24px">';
	foreach ( $t['lessons'] as $i => $l ) {
		$d  = sib_lesson_data( $l );
		$h .= '<a href="' . esc_url( get_permalink( $l ) ) . '" class="row lift" data-lesson-row="' . (int) $l->ID . '" style="gap:18px;padding:22px 8px;border-bottom:1px solid #ECEAF2;align-items:flex-start"><span class="H v9-num" style="width:46px;height:46px;border-radius:99px;flex:none;display:flex;align-items:center;justify-content:center;background:#F4F3F7;font-size:18px">' . ( $i + 1 ) . '</span><span style="flex:1;display:flex;flex-direction:column;gap:4px"><b style="font-size:18px">' . esc_html( get_the_title( $l ) ) . '</b>'
			. ( $d['introEn'] ? '<span class="p mutd" style="font-size:15px">' . esc_html( wp_html_excerpt( $d['introEn'], 150, '…' ) ) . '</span>' : '' ) . '<span class="mutd" style="font-size:13px">' . esc_html( $d['minutes'] . ' min' . ( $d['tryEn'] ? ' · with a task' : '' ) ) . '</span></span></a>';
	}
	$h .= '</div></div></section>';
	$others = array_slice( array_values( array_filter( $all, fn( $x ) => $x['term']->term_id !== $term->term_id ) ), 0, 3 );
	if ( $others ) {
		$h .= '<section class="sec" style="background:#F6F3EE;"><div class="wrap"><h2 class="H h2">' . esc_html__( 'More courses', 'shopinbos' ) . '</h2><div class="bn g3" style="grid-template-columns:repeat(3,1fr);margin-top:40px">';
		foreach ( $others as $o ) {
			$h .= sib_v9_course_card( $o, (int) array_search( $o, $all, true ) );
		}
		$h .= '</div></div></section>';
	}
	$h .= sib_v9_section( 'academy', 'night' );
	return [
		'slug'   => 'academy-course',
		'html'   => sib_v9_wrap( $h, 'academy-course' ),
		'title'  => $term->name . ' · Shopinbos Academy',
		'crumbs' => [ [ __( 'Academy', 'shopinbos' ), home_url( '/academy/' ) ] ],
		'description' => wp_html_excerpt( (string) $term->description, 155, '…' ),
	];
}

/** Text with **bold** and line breaks, as the lesson fields are written. */
function sib_v9_inline( string $s ): string {
	return function_exists( 'sib_inline' ) ? sib_inline( $s ) : esc_html( $s );
}

function sib_v9_lines( string $s ): array {
	return function_exists( 'sib_lines' ) ? sib_lines( $s ) : array_values( array_filter( array_map( 'trim', explode( "\n", $s ) ) ) );
}

/* A lesson (/academy/{course}/{lesson}/). */
function sib_v9_lesson(): ?array {
	$post = get_queried_object();
	if ( ! $post instanceof WP_Post || ! function_exists( 'sib_lesson_data' ) ) {
		return null;
	}
	$a     = sib_lesson_data( $post );
	$term  = sib_lesson_track( $post );
	$t     = $term ? sib_academy_track( $term ) : null;
	$list  = $t ? $t['lessons'] : [ $post ];
	$pos   = (int) array_search( $post->ID, wp_list_pluck( $list, 'ID' ), true );
	$next  = $list[ $pos + 1 ] ?? null;
	$prev  = $list[ $pos - 1 ] ?? null;
	$pcm   = '' !== trim( (string) $a['introPcm'] );
	$video = function_exists( 'sib_youtube_id' ) ? sib_youtube_id( (string) $a['video'] ) : '';
	$bg    = $t['bg'] ?? '#F6F3EE';
	$lang  = fn( $en, $pc, $tag = 'p', $attr = '' ) => '<' . $tag . $attr . ' data-lang="en" lang="en">' . $en . '</' . $tag . '>' . ( '' !== $pc ? '<' . $tag . $attr . ' data-lang="pcm" lang="pcm" hidden>' . $pc . '</' . $tag . '>' : '' );

	$h  = '<section style="padding:40px 0 100px"><div class="wrap"><div style="display:flex;justify-content:space-between;gap:16px;align-items:center;flex-wrap:wrap"><div class="mutd" style="font-size:14px"><a href="/academy/">' . esc_html__( 'Academy', 'shopinbos' ) . '</a>' . ( $term ? ' / <a href="' . esc_url( get_term_link( $term ) ) . '">' . esc_html( $term->name ) . '</a>' : '' ) . ' / ' . esc_html( sprintf( 'Lesson %d', $pos + 1 ) ) . '</div>';
	$h .= $pcm ? '<div style="display:flex;gap:6px" role="group" aria-label="Language"><button type="button" class="chip on" data-lang-pick="en" aria-pressed="true">English</button><button type="button" class="chip" data-lang-pick="pcm" aria-pressed="false">Pidgin</button></div>' : '';
	$h .= '</div><div class="g2" style="display:grid;grid-template-columns:1fr 360px;gap:48px;margin-top:28px;align-items:start"><div style="min-width:0">';
	// Video, or a cover in the course colour.
	$h .= '<div style="position:relative;height:420px;border-radius:28px;overflow:hidden;background:' . esc_attr( $bg ) . '" class="v9-feat">';
	if ( $video ) {
		$h .= '<button type="button" data-video="' . esc_attr( $video ) . '" aria-label="' . esc_attr__( 'Play the lesson video', 'shopinbos' ) . '" style="all:unset;cursor:pointer;position:absolute;inset:0;display:block"><img decoding="async" src="https://i.ytimg.com/vi/' . esc_attr( $video ) . '/hqdefault.jpg" alt="" style="width:100%;height:100%;object-fit:cover"><span style="position:absolute;left:50%;top:50%;width:84px;height:84px;margin:-42px;border-radius:99px;background:#fff;display:flex;align-items:center;justify-content:center;font-size:28px">▶</span></button>';
	} else {
		$h .= '<img decoding="async" src="' . esc_url( sib_v9_course_img( (int) ( $t ? array_search( $t, sib_academy_tracks(), true ) : 0 ) ) ) . '" alt="" style="width:100%;height:100%;object-fit:cover;opacity:.9"><span class="tg" style="position:absolute;left:20px;bottom:20px;background:#fff">' . esc_html__( 'Read in a few minutes', 'shopinbos' ) . '</span>';
	}
	$h .= '</div>';
	$h .= '<div style="margin-top:32px"><span class="k orgd">' . esc_html( sprintf( 'Lesson %d of %d · %d min', $pos + 1, count( $list ), $a['minutes'] ) ) . '</span><h1 class="H" style="font-size:clamp(34px,4vw,56px);line-height:1.04;margin-top:12px">' . esc_html( get_the_title( $post ) ) . '</h1></div>';
	$h .= '<div class="v9-prose v9-lesson" style="max-width:720px;margin-top:20px">' . $lang( esc_html( $a['introEn'] ), esc_html( (string) $a['introPcm'] ), 'p', ' class="lead" style="color:#16141F"' );
	if ( $learn = sib_v9_lines( (string) $a['learn'] ) ) {
		$h .= '<div class="blk blk-take"><b>' . esc_html__( 'In this lesson you’ll learn', 'shopinbos' ) . '</b><ul class="ticks">' . implode( '', array_map( fn( $l ) => '<li>' . sib_v9_inline( $l ) . '</li>', $learn ) ) . '</ul></div>';
	}
	if ( $steps = sib_v9_lines( (string) $a['steps'] ) ) {
		$h .= '<h2>' . esc_html( sprintf( 'Do it in %d steps', count( $steps ) ) ) . '</h2><ol class="steps-list">';
		foreach ( $steps as $i => $s ) {
			$parts = array_map( 'trim', explode( '|', $s, 2 ) );
			$h    .= '<li class="stepl"><span class="num">' . ( $i + 1 ) . '</span><div class="col" style="gap:3px;padding-top:6px">' . ( isset( $parts[1] ) ? '<b style="font-size:16px">' . sib_v9_inline( $parts[0] ) . '</b><span class="p">' . sib_v9_inline( $parts[1] ) . '</span>' : '<span>' . sib_v9_inline( $parts[0] ) . '</span>' ) . '</div></li>';
		}
		$h .= '</ol>';
	}
	if ( $a['tryEn'] ) {
		$h .= '<div class="blk" style="padding:24px 26px;background:#E9F8F4"><span class="k tl">' . esc_html__( 'Your task', 'shopinbos' ) . '</span>' . $lang( sib_v9_inline( (string) $a['tryEn'] ), $a['tryPcm'] ? sib_v9_inline( (string) $a['tryPcm'] ) : '', 'div', ' style="font-size:17px;margin-top:8px;line-height:1.55;color:#16141F"' )
			. '<div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap"><a class="btn b-ink" href="' . esc_url( sib_v9_tokens( '%%SIGNUP%%' ) ) . '" style="height:46px;font-size:14.5px;color:#fff;text-decoration:none">' . esc_html__( 'Open my shop', 'shopinbos' ) . '</a></div></div>';
	}
	if ( $checks = sib_v9_lines( (string) $a['checks'] ) ) {
		$h .= '<div class="blk blk-check"><div class="row between" style="margin-bottom:6px;gap:10px"><b style="font-size:17px">' . esc_html__( 'Before you finish, tick these', 'shopinbos' ) . '</b><span class="tag tag-ok">' . esc_html__( 'Tap to tick', 'shopinbos' ) . '</span></div>';
		foreach ( $checks as $c ) {
			$h .= '<button type="button" class="chkrow" aria-pressed="false"><span class="box">✓</span><span class="chk-t">' . sib_v9_inline( $c ) . '</span></button>';
		}
		$h .= '</div>';
	}
	$opts = sib_v9_lines( (string) $a['options'] );
	if ( $a['quiz'] && count( $opts ) > 1 ) {
		$h .= '<div class="blk v9-quiz" data-correct="' . max( 0, (int) $a['correct'] - 1 ) . '" style="padding:24px;box-shadow:inset 0 0 0 1px #EAE7EF"><span class="tg" style="background:#E7E1FF;color:#5B3FD6">' . esc_html__( 'Quick check', 'shopinbos' ) . '</span><p style="font-size:19px;font-weight:700;color:#16141F;margin:12px 0">' . esc_html( $a['quiz'] ) . '</p><div style="display:grid;gap:8px">';
		foreach ( $opts as $i => $o ) {
			$h .= '<button type="button" class="chkrow" data-opt="' . (int) $i . '"><span class="num" style="width:28px;height:28px;font-size:13px">' . chr( 65 + $i ) . '</span>' . esc_html( $o ) . '</button>';
		}
		$h .= '</div><p class="v9-verdict" hidden style="margin:14px 0 0;font-size:16px"><b></b> ' . esc_html( (string) $a['why'] ) . '</p></div>';
	}
	$h .= '</div><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:40px;padding-top:22px;border-top:1px solid #ECEAF2;max-width:720px">'
		. ( $prev ? '<a class="btn b-line" href="' . esc_url( get_permalink( $prev ) ) . '">← ' . esc_html__( 'Previous', 'shopinbos' ) . '</a>' : '<span></span>' )
		. '<a class="btn b-org" data-lesson-done="' . (int) $post->ID . '" href="' . esc_url( $next ? get_permalink( $next ) : ( $term ? get_term_link( $term ) : '/academy/' ) ) . '">' . esc_html( $next ? __( 'Done, next lesson', 'shopinbos' ) : __( 'Done, finish the course', 'shopinbos' ) ) . ' →</a></div>';
	$h .= '</div><aside style="display:grid;gap:16px;min-width:0;position:sticky;top:24px"><div class="ui" style="padding:14px;border-radius:22px;box-shadow:inset 0 0 0 1px #EAE7EF"><div style="padding:6px 8px 12px"><b>' . esc_html( $term ? $term->name : get_the_title( $post ) ) . '</b><div class="mutd" style="font-size:12.5px;margin-top:6px" data-course-progress="' . esc_attr( implode( ',', wp_list_pluck( $list, 'ID' ) ) ) . '">' . esc_html( sprintf( '%d lessons', count( $list ) ) ) . '</div></div>' . sib_v9_lesson_rows( $list, $post->ID ) . '</div>';
	$h .= '<a class="bc c-mint" href="' . esc_url( function_exists( 'sib_whatsapp_share_url' ) ? sib_whatsapp_share_url( get_the_title( $post ) . ' – ' . get_permalink( $post ) ) : get_permalink( $post ) ) . '" style="gap:6px;min-height:0;padding:20px"><b>' . esc_html__( 'Send it to my WhatsApp', 'shopinbos' ) . '</b><span class="p" style="font-size:14px;color:#2E4A46">' . esc_html__( 'Read it later, even on slow data.', 'shopinbos' ) . '</span></a></aside></div></div></section>';

	return [
		'slug'        => 'academy-lesson',
		'html'        => sib_v9_wrap( $h, 'academy-lesson' ),
		'title'       => get_the_title( $post ) . ' · Shopinbos Academy',
		'description' => wp_html_excerpt( (string) $a['introEn'], 155, '…' ),
		'crumbs'      => [ [ __( 'Academy', 'shopinbos' ), home_url( '/academy/' ) ] ],
	];
}

add_filter( 'sib_v9_content_templates', function ( array $t ): array {
	$t['sib_v9_is_course'] = 'sib_v9_course';
	$t['sib_v9_is_lesson'] = 'sib_v9_lesson';
	return $t;
} );

function sib_v9_is_course(): bool {
	return is_tax( 'sib_track' );
}

function sib_v9_is_lesson(): bool {
	return is_singular( 'sib_lesson' );
}
