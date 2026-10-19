<?php
/**
 * Blog: index sections, article header, side columns and post cards (canvas v7).
 *
 * Category colours live in term meta (sib_bg, sib_fg). A post's cover is its featured image, or a theme
 * image named in the sib_cover meta. Optional post meta: sib_cover_bg, sib_cover_fit (cover|contain),
 * sib_featured (1 = lead story), sib_mins (reading time), sib_lesson (URL of a related Academy lesson).
 */

defined( 'ABSPATH' ) || exit;

function sib_blog_block_defs(): array {
	return [
		'blog-hero'     => [ __( 'Blog: hero with search', 'shopinbos' ), 'sib_render_blog_hero', [ 'pill' => [ 'string', 'The Shopinbos blog' ], 'title' => [ 'string', 'Ideas for people who [sell online] in Nigeria' ], 'text' => [ 'string', 'Guides you can use today, in plain words. WhatsApp, TikTok, payments, delivery and finding stock.' ] ] ],
		'blog-featured' => [ __( 'Blog: featured and also new', 'shopinbos' ), 'sib_render_blog_featured', [] ],
		'blog-grid'     => [ __( 'Blog: categories and posts', 'shopinbos' ), 'sib_render_blog_grid', [] ],
		'blog-popular'  => [ __( 'Blog: most read', 'shopinbos' ), 'sib_render_blog_popular', [ 'count' => [ 'number', 5 ] ] ],
		'post-head'     => [ __( 'Article: header and cover', 'shopinbos' ), 'sib_render_post_head', [] ],
		'post-toc'      => [ __( 'Article: contents and progress', 'shopinbos' ), 'sib_render_post_toc', [] ],
		'post-side'     => [ __( 'Article: side column', 'shopinbos' ), 'sib_render_post_side', [] ],
		'keep-reading'  => [ __( 'Article: keep reading', 'shopinbos' ), 'sib_render_keep_reading', [ 'count' => [ 'number', 3 ] ] ],
	];
}

add_action( 'init', function () {
	foreach ( [ 'sib_bg', 'sib_fg' ] as $key ) {
		register_term_meta( 'category', $key, [ 'type' => 'string', 'single' => true, 'show_in_rest' => true, 'sanitize_callback' => 'sanitize_hex_color' ] );
	}
	foreach ( [ 'sib_cover', 'sib_cover_bg', 'sib_cover_fit', 'sib_lesson' ] as $key ) {
		register_post_meta( 'post', $key, [ 'type' => 'string', 'single' => true, 'show_in_rest' => true, 'auth_callback' => fn() => current_user_can( 'edit_posts' ) ] );
	}
	foreach ( [ 'sib_featured', 'sib_mins', 'sib_views' ] as $key ) {
		register_post_meta( 'post', $key, [ 'type' => 'integer', 'single' => true, 'show_in_rest' => true, 'auth_callback' => fn() => current_user_can( 'edit_posts' ) ] );
	}
	sib_register_block_group( sib_blog_block_defs(), 'widgets' );
}, 11 );

/** Registers server-rendered blocks and hands their attributes to the editor script. */
function sib_register_block_group( array $defs, string $category ): void {
	$client = [];
	foreach ( $defs as $name => $def ) {
		[ $title, $cb, $attrs ] = $def;
		$schema                 = [];
		foreach ( $attrs as $k => $d ) {
			$schema[ $k ] = [ 'type' => $d[0], 'default' => $d[1] ];
			if ( isset( $d[2] ) ) {
				$schema[ $k ]['enum'] = $d[2];
			}
		}
		register_block_type( 'shopinbos/' . $name, [
			'api_version'     => 3,
			'title'           => $title,
			'category'        => $category,
			'attributes'      => $schema,
			'render_callback' => $cb,
			'editor_script'   => 'sib-editor',
			'supports'        => [ 'html' => false ],
		] );
		$client[] = [ 'name' => 'shopinbos/' . $name, 'title' => $title, 'category' => $category, 'attributes' => $schema, 'ui' => $def[3] ?? [] ];
	}
	wp_add_inline_script( 'sib-editor', 'window.SIB_BLOCKS = (window.SIB_BLOCKS || []).concat(' . wp_json_encode( $client ) . ');', 'before' );
}

/* Count article views (logged-out visitors only) for "Most read". Cached pages skip this, so it is a rough guide. */
add_action( 'template_redirect', function () {
	if ( is_singular( 'post' ) && ! is_user_logged_in() && ! is_preview() && ! preg_match( '/bot|crawl|spider|slurp|preview/i', $_SERVER['HTTP_USER_AGENT'] ?? '' ) ) {
		$id = get_queried_object_id();
		update_post_meta( $id, 'sib_views', (int) get_post_meta( $id, 'sib_views', true ) + 1 );
	}
} );

/* ---------- data helpers ---------- */

function sib_post_cat( $post ): ?WP_Term {
	$cats = get_the_category( $post );
	return $cats ? $cats[0] : null;
}

/** [background, text] colours for a category. */
function sib_cat_colors( ?WP_Term $term ): array {
	$bg = $term ? (string) get_term_meta( $term->term_id, 'sib_bg', true ) : '';
	$fg = $term ? (string) get_term_meta( $term->term_id, 'sib_fg', true ) : '';
	return [ $bg ?: '#F6F5F9', $fg ?: '#16141F' ];
}

function sib_post_mins( $post ): int {
	$post = get_post( $post );
	$set  = (int) get_post_meta( $post->ID, 'sib_mins', true );
	return $set ?: max( 1, (int) round( str_word_count( sib_post_plain_text( $post ) ) / 200 ) );
}

/** Post text for word counts, including the text inside article blocks (stored as block attributes). */
function sib_post_plain_text( WP_Post $post ): string {
	$text = wp_strip_all_tags( strip_shortcodes( $post->post_content ) );
	if ( preg_match_all( '#<!-- wp:shopinbos/[a-z-]+ (\{.*?\}) /?-->#s', $post->post_content, $m ) ) {
		foreach ( $m[1] as $json ) {
			$attrs = json_decode( $json, true );
			if ( is_array( $attrs ) ) {
				$text .= ' ' . wp_strip_all_tags( implode( ' ', array_filter( $attrs, 'is_string' ) ) );
			}
		}
	}
	return str_replace( '|', ' ', $text );
}

function sib_mins_label( int $mins ): string {
	/* translators: %d: minutes */
	return sprintf( _n( '%d min read', '%d min read', $mins, 'shopinbos' ), $mins );
}

function sib_post_dek( $post ): string {
	$post = get_post( $post );
	return $post->post_excerpt ? $post->post_excerpt : wp_trim_words( wp_strip_all_tags( strip_shortcodes( $post->post_content ) ), 26 );
}

/** Cover image wrapped in its coloured frame. $size is a CSS height in px. */
function sib_post_cover( $post, int $height, string $class = 'pc-media', bool $eager = false ): string {
	$post  = get_post( $post );
	$bg    = (string) get_post_meta( $post->ID, 'sib_cover_bg', true ) ?: sib_cat_colors( sib_post_cat( $post ) )[0];
	$fit   = 'contain' === get_post_meta( $post->ID, 'sib_cover_fit', true ) ? 'is-contain' : '';
	$load  = $eager ? 'eager' : 'lazy';
	$img   = '';
	if ( has_post_thumbnail( $post ) ) {
		$img = get_the_post_thumbnail( $post, $height > 300 ? 'large' : 'medium_large', [ 'class' => $fit, 'alt' => '', 'loading' => $load ] );
	} elseif ( $file = (string) get_post_meta( $post->ID, 'sib_cover', true ) ) {
		$img = '<img src="' . esc_url( sib_img( basename( $file ) ) ) . '" alt="" class="' . $fit . '" loading="' . $load . '"' . ( $eager ? ' fetchpriority="high"' : '' ) . '>';
	}
	return '<div class="' . esc_attr( $class ) . '" style="background:' . esc_attr( $bg ) . ';height:' . $height . 'px">' . $img;
}

function sib_chipw( WP_Term $cat ): string {
	return '<span class="chipw" style="left:12px;top:12px;color:' . esc_attr( sib_cat_colors( $cat )[1] ) . '">' . esc_html( $cat->name ) . '</span>';
}

/** The standard post card (grid, keep reading). */
function sib_post_card( $post, int $height = 220 ): string {
	$post = get_post( $post );
	$cat  = sib_post_cat( $post );
	$mins = sib_post_mins( $post );
	return '<a class="postcard" href="' . esc_url( get_permalink( $post ) ) . '">' . sib_post_cover( $post, $height ) . ( $cat ? sib_chipw( $cat ) : '' ) . '</div>'
		. '<div class="pc-body"><b class="disp clamp2 pc-title">' . esc_html( get_the_title( $post ) ) . '</b><span class="p clamp2" style="font-size:14.5px">' . esc_html( sib_post_dek( $post ) ) . '</span>'
		. '<span class="meta"><time datetime="' . esc_attr( get_the_date( 'Y-m-d', $post ) ) . '">' . esc_html( get_the_date( 'j M Y', $post ) ) . '</time><span class="dot"></span><span>' . esc_html( sib_mins_label( $mins ) ) . '</span></span></div></a>';
}

/** Top-level categories with posts, in the order set by the sib_order term meta. */
function sib_blog_categories(): array {
	$terms = get_terms( [ 'taxonomy' => 'category', 'hide_empty' => true, 'parent' => 0 ] );
	if ( is_wp_error( $terms ) ) {
		return [];
	}
	usort( $terms, fn( $a, $b ) => ( (int) get_term_meta( $a->term_id, 'sib_order', true ) ?: 99 ) <=> ( (int) get_term_meta( $b->term_id, 'sib_order', true ) ?: 99 ) ?: strcmp( $a->name, $b->name ) );
	return $terms;
}

function sib_blog_url(): string {
	$page = (int) get_option( 'page_for_posts' );
	return $page ? get_permalink( $page ) : home_url( '/blog/' );
}

function sib_featured_post(): ?WP_Post {
	$f = get_posts( [ 'numberposts' => 1, 'meta_key' => 'sib_featured', 'meta_value' => 1, 'post_status' => 'publish' ] );
	if ( ! $f ) {
		$f = get_posts( [ 'numberposts' => 1, 'post_status' => 'publish' ] );
	}
	return $f ? $f[0] : null;
}

/* ---------- blog index ---------- */

function sib_render_blog_hero( array $a ): string {
	if ( is_category() ) {
		$term  = get_queried_object();
		$title = esc_html( $term->name );
		$text  = $term->description ?: sprintf( __( 'Every guide we have written about %s, newest first.', 'shopinbos' ), mb_strtolower( $term->name ) );
		$pill  = __( 'The Shopinbos blog', 'shopinbos' );
	} else {
		$title = preg_replace( '/\[(.+?)\]/', '<span class="grad">$1</span>', esc_html( $a['title'] ) );
		$text  = $a['text'];
		$pill  = $a['pill'];
	}
	return '<section class="ahero" style="background:linear-gradient(180deg,#FFF6F1 0%,#FFFFFF 100%)"><div class="wrap ahero-in">'
		. '<span class="pill-label">' . esc_html( $pill ) . '</span><h1 class="disp h1" style="max-width:860px;margin:0">' . $title . '</h1>'
		. '<p class="lead" style="max-width:600px">' . esc_html( $text ) . '</p>'
		. '<form class="searchpill" role="search" method="get" action="' . esc_url( home_url( '/' ) ) . '">' . sib_icon( 'search', 20, '#6B6779' )
		. '<input type="search" name="s" aria-label="' . esc_attr__( 'Search the blog', 'shopinbos' ) . '" placeholder="' . esc_attr__( 'Search, e.g. pay on delivery', 'shopinbos' ) . '"><input type="hidden" name="post_type" value="post">'
		. '<button class="btn btn-ink btn-s" type="submit">' . esc_html__( 'Search', 'shopinbos' ) . '</button></form></div></section>';
}

function sib_render_blog_featured(): string {
	if ( is_paged() || is_category() ) {
		return '';
	}
	$lead = sib_featured_post();
	if ( ! $lead ) {
		return '';
	}
	$side = get_posts( [ 'numberposts' => 3, 'post__not_in' => [ $lead->ID ], 'post_status' => 'publish' ] );
	$cat  = sib_post_cat( $lead );
	$out  = '<section style="padding:16px 0 40px"><div class="wrap feat2"><a class="postcard" style="padding:12px" href="' . esc_url( get_permalink( $lead ) ) . '">'
		. sib_post_cover( $lead, 380, 'pc-media feat-media', true )
		. '<span class="chipw" style="left:16px;top:16px;background:#FF6A2B;color:#fff">' . esc_html__( 'New', 'shopinbos' ) . '</span>'
		. ( $cat ? '<span class="chipw" style="left:74px;top:16px;color:' . esc_attr( sib_cat_colors( $cat )[1] ) . '">' . esc_html( $cat->name ) . '</span>' : '' )
		. '<span class="chipw" style="right:16px;bottom:16px">' . sib_icon( 'clock', 14, '#16141F' ) . esc_html( sib_mins_label( sib_post_mins( $lead ) ) ) . '</span></div>'
		. '<div class="col" style="padding:8px 12px 14px;gap:10px"><h2 class="disp pc-title" style="font-size:32px;line-height:1.12;margin:0">' . esc_html( get_the_title( $lead ) ) . '</h2>'
		. '<span class="p" style="font-size:16px">' . esc_html( sib_post_dek( $lead ) ) . '</span><span class="lnk" style="color:#B23E0A">' . esc_html__( 'Read the guide', 'shopinbos' ) . sib_icon( 'arrow', 16 ) . '</span></div></a>';
	if ( $side ) {
		$out .= '<div class="col" style="gap:14px"><p class="eyebrow" style="color:#6B6779;padding-left:4px">' . esc_html__( 'Also new', 'shopinbos' ) . '</p>';
		foreach ( $side as $p ) {
			$c  = sib_post_cat( $p );
			[ $bg, $fg ] = sib_cat_colors( $c );
			$out .= '<a class="postcard side-card" href="' . esc_url( get_permalink( $p ) ) . '">' . sib_post_cover( $p, 120 ) . '</div>'
				. '<div class="col" style="gap:8px;padding-right:8px">' . ( $c ? '<span class="tag" style="background:' . esc_attr( $bg ) . ';color:' . esc_attr( $fg ) . ';align-self:flex-start">' . esc_html( $c->name ) . '</span>' : '' )
				. '<b class="clamp2 pc-title" style="font-size:16.5px;line-height:1.3">' . esc_html( get_the_title( $p ) ) . '</b><span class="meta">' . esc_html( sib_mins_label( sib_post_mins( $p ) ) ) . '</span></div></a>';
		}
		$out .= '</div>';
	}
	return $out . '</div></section>';
}

function sib_render_blog_grid(): string {
	global $wp_query;
	$terms = sib_blog_categories();
	$cur   = is_category() ? get_queried_object_id() : 0;
	$out   = '<section id="all-posts" style="padding:24px 0 72px"><div class="wrap col" style="gap:24px"><div class="row between wrapflex" style="gap:14px">'
		. '<nav class="row wrapflex" style="gap:8px" aria-label="' . esc_attr__( 'Categories', 'shopinbos' ) . '"><a class="chip" href="' . esc_url( sib_blog_url() ) . '#all-posts"' . ( $cur ? '' : ' aria-current="page"' ) . '>' . esc_html__( 'All', 'shopinbos' ) . '</a>';
	foreach ( $terms as $t ) {
		$out .= '<a class="chip" href="' . esc_url( get_term_link( $t ) ) . '"' . ( $cur === $t->term_id ? ' aria-current="page"' : '' ) . '>' . esc_html( $t->name ) . '</a>';
	}
	$total = (int) $wp_query->found_posts;
	/* translators: %d: number of posts */
	$out .= '</nav><span class="meta">' . esc_html( sprintf( _n( '%d article', '%d articles', $total, 'shopinbos' ), $total ) ) . '</span></div>';
	if ( ! have_posts() ) {
		return $out . '<p class="p">' . esc_html__( 'Nothing here yet. Check back soon.', 'shopinbos' ) . '</p></div></section>';
	}
	$out .= '<div class="g3">';
	foreach ( $wp_query->posts as $p ) {
		$out .= sib_post_card( $p );
	}
	$out  .= '</div>';
	$pages = paginate_links( [ 'total' => (int) $wp_query->max_num_pages, 'current' => max( 1, get_query_var( 'paged' ) ), 'type' => 'list', 'prev_text' => __( 'Newer', 'shopinbos' ), 'next_text' => __( 'Older', 'shopinbos' ) ] );
	return $out . ( $pages ? '<nav class="pager" aria-label="' . esc_attr__( 'More articles', 'shopinbos' ) . '">' . $pages . '</nav>' : '' ) . '</div></section>';
}

function sib_render_blog_popular( array $a ): string {
	if ( is_paged() || is_category() ) {
		return '';
	}
	$items = get_posts( [ 'numberposts' => max( 3, (int) $a['count'] ), 'post_status' => 'publish', 'meta_key' => 'sib_views', 'orderby' => [ 'meta_value_num' => 'DESC', 'date' => 'DESC' ] ] );
	if ( count( $items ) < 3 ) {
		return '';
	}
	$academy = get_post_type_archive_link( 'sib_lesson' ) ?: home_url( '/academy/' );
	$out     = '<section style="padding:0 0 72px"><div class="wrap split split-top" style="gap:48px"><div class="col" style="gap:14px"><span class="pill-label left">' . esc_html__( 'Most read', 'shopinbos' ) . '</span>'
		. '<h2 class="disp h2" style="margin:0">' . esc_html__( 'What sellers read most this month', 'shopinbos' ) . '</h2><p class="lead">' . esc_html__( 'Start here if you are new. Each one takes less than ten minutes.', 'shopinbos' ) . '</p>'
		. '<a class="gbtn" style="align-self:flex-start;margin-top:8px" href="' . esc_url( $academy ) . '">' . sib_icon( 'book', 18, '#16141F' ) . esc_html__( 'Prefer lessons? Try the free Academy', 'shopinbos' ) . '</a></div><ol class="col" style="list-style:none;margin:0;padding:0">';
	foreach ( $items as $i => $p ) {
		$c    = sib_post_cat( $p );
		$out .= '<li><a class="most-row" href="' . esc_url( get_permalink( $p ) ) . '"><span class="disp n">' . ( $i + 1 ) . '</span><span class="col" style="gap:4px;flex:1"><b style="font-size:17px;line-height:1.35">' . esc_html( get_the_title( $p ) ) . '</b>'
			. '<span class="meta">' . ( $c ? '<span style="color:' . esc_attr( sib_cat_colors( $c )[1] ) . ';font-weight:700">' . esc_html( $c->name ) . '</span><span class="dot"></span>' : '' ) . esc_html( sib_mins_label( sib_post_mins( $p ) ) ) . '</span></span>' . sib_icon( 'arrow', 16 ) . '</a></li>';
	}
	return $out . '</ol></div></section>';
}

/* ---------- article ---------- */

function sib_render_post_head(): string {
	$post = get_post();
	if ( ! $post ) {
		return '';
	}
	$cat   = sib_post_cat( $post );
	$mins  = sib_post_mins( $post );
	$share = sib_whatsapp_share_url( get_the_title( $post ) . ' ' . get_permalink( $post ) );
	$crumb = '<nav class="crumbs" aria-label="' . esc_attr__( 'Breadcrumb', 'shopinbos' ) . '"><a href="' . esc_url( sib_blog_url() ) . '">' . esc_html__( 'Blog', 'shopinbos' ) . '</a><span aria-hidden="true">/</span>'
		. ( $cat ? '<a href="' . esc_url( get_term_link( $cat ) ) . '" style="color:' . esc_attr( sib_cat_colors( $cat )[1] ) . ';font-weight:700">' . esc_html( $cat->name ) . '</a>' : '' ) . '</nav>';
	return '<section class="ahero" style="padding:40px 0 28px"><div class="wrap art-head" style="margin:0 auto">' . $crumb
		. '<h1 class="disp art-h1">' . esc_html( get_the_title( $post ) ) . '</h1>'
		. ( $post->post_excerpt ? '<p class="lead" style="max-width:680px">' . esc_html( $post->post_excerpt ) . '</p>' : '' )
		. '<div class="row wrapflex" style="gap:14px;justify-content:center"><span class="row" style="gap:10px"><span class="av" style="background:#16141F;width:36px;height:36px"><img src="' . esc_url( sib_img( 'icon-white.png' ) ) . '" alt="" width="16" height="16" style="width:16px;height:auto"></span>'
		. '<span style="text-align:left"><b style="font-size:14px;display:block">' . esc_html( sib_byline_name( $post ) ) . '</b><span class="meta"><time datetime="' . esc_attr( get_the_date( 'Y-m-d', $post ) ) . '">' . esc_html( get_the_date( 'j M Y', $post ) ) . '</time> · ' . esc_html( sib_mins_label( $mins ) ) . '</span></span></span>'
		. '<span class="share"><a class="btn btn-ghost btn-s" href="' . esc_url( $share ) . '" target="_blank" rel="noopener">' . sib_icon( 'whatsapp', 16, '#16141F' ) . esc_html__( 'Share', 'shopinbos' ) . '</a>'
		. '<button type="button" class="btn btn-ghost btn-s" data-copy-link aria-label="' . esc_attr__( 'Copy link', 'shopinbos' ) . '" style="padding:0 12px">' . sib_icon( 'link', 16, '#16141F' ) . '</button></span></div></div>'
		. '<div class="wrap">' . sib_post_cover( $post, 440, 'art-cover', true ) . '</div></div></section>';
}

/** Posts are written by the team unless an author has a public bio. */
function sib_byline_name( WP_Post $post ): string {
	$author = get_userdata( (int) $post->post_author );
	return $author && $author->description ? $author->display_name : __( 'Shopinbos team', 'shopinbos' );
}

function sib_whatsapp_share_url( string $text ): string {
	return 'https://wa.me/?text=' . rawurlencode( $text );
}

/** H2 headings of a post as [number, text, id]. "1. Post products" keeps its own number. */
function sib_post_headings( WP_Post $post ): array {
	$items = [];
	foreach ( parse_blocks( $post->post_content ) as $b ) {
		if ( 'core/heading' !== $b['blockName'] || 2 !== (int) ( $b['attrs']['level'] ?? 2 ) ) {
			continue;
		}
		$text = trim( wp_strip_all_tags( $b['innerHTML'] ) );
		$id   = $b['attrs']['anchor'] ?? sanitize_title( $text );
		$n    = preg_match( '/^(\d+)\.\s*(.+)$/u', $text, $m ) ? $m[1] : (string) ( count( $items ) + 1 );
		$items[] = [ $n, $m[2] ?? $text, $id ];
		unset( $m );
	}
	return $items;
}

function sib_render_post_toc(): string {
	$post = get_post();
	$heads = $post ? sib_post_headings( $post ) : [];
	$mins  = $post ? sib_post_mins( $post ) : 1;
	$out   = '<nav class="art-toc" aria-label="' . esc_attr__( 'On this page', 'shopinbos' ) . '">';
	if ( count( $heads ) >= 2 ) {
		$out .= '<p class="eyebrow" style="color:#6B6779;margin:0 0 8px">' . esc_html__( 'On this page', 'shopinbos' ) . '</p>';
		foreach ( $heads as [ $n, $t, $id ] ) {
			$out .= '<a class="tocb" href="#' . esc_attr( $id ) . '"><span class="n">' . esc_html( $n ) . '</span>' . esc_html( $t ) . '</a>';
		}
	}
	return $out . '<div class="bar" style="margin-top:16px"><span data-read-progress="' . (int) $mins . '" style="width:0;background:#FF6A2B"></span></div><span class="meta" style="margin-top:6px" data-read-left>' . esc_html( sprintf( __( '%d min left', 'shopinbos' ), $mins ) ) . '</span></nav>';
}

function sib_render_post_side(): string {
	$post   = get_post();
	$out    = '<aside class="art-side"><div class="side-start"><img src="' . esc_url( sib_img( 'rex.webp' ) ) . '" alt="" width="70" height="70" loading="lazy" style="width:70px;height:70px;object-fit:contain">'
		. '<b class="disp" style="font-size:22px;line-height:1.15">' . esc_html__( 'Start your shop free', 'shopinbos' ) . '</b><span style="font-size:14px;color:#C9C6D3;line-height:1.5">' . esc_html__( 'Rex builds it with you in a few minutes. No card.', 'shopinbos' ) . '</span>'
		. '<a class="btn btn-acc btn-s" style="align-self:flex-start" href="' . esc_url( is_singular() ? sib_post_cta_url() : sib_go_url() ) . '">' . esc_html__( 'Start now', 'shopinbos' ) . sib_icon( 'arrow', 16 ) . '</a></div>';
	$lesson = $post ? sib_post_lesson( $post ) : null;
	if ( $lesson ) {
		$out .= '<a class="side-lesson" href="' . esc_url( get_permalink( $lesson ) ) . '"><span class="tag" style="background:#fff;color:#0C4A44;align-self:flex-start">' . sib_icon( 'play', 12, '#0C4A44' )
			. esc_html( sprintf( __( 'Free lesson · %d min', 'shopinbos' ), (int) get_post_meta( $lesson->ID, 'sib_minutes', true ) ?: 4 ) ) . '</span><b style="font-size:16px;line-height:1.3">' . esc_html( get_the_title( $lesson ) ) . '</b>'
			. '<span class="lnk" style="color:#0C4A44">' . esc_html__( 'Open lesson', 'shopinbos' ) . sib_icon( 'arrow', 16 ) . '</span></a>';
	}
	return $out . '</aside>';
}

/** The Academy lesson linked to a post: the sib_lesson meta (a lesson slug or URL), else none. */
function sib_post_lesson( WP_Post $post ): ?WP_Post {
	$ref = trim( (string) get_post_meta( $post->ID, 'sib_lesson', true ) );
	if ( ! $ref || ! post_type_exists( 'sib_lesson' ) ) {
		return null;
	}
	$slug = basename( untrailingslashit( wp_parse_url( $ref, PHP_URL_PATH ) ?: $ref ) );
	$hit  = get_posts( [ 'post_type' => 'sib_lesson', 'name' => $slug, 'numberposts' => 1, 'post_status' => 'publish' ] );
	return $hit ? $hit[0] : null;
}

function sib_render_keep_reading( array $a ): string {
	$post = get_post();
	if ( ! $post ) {
		return '';
	}
	$n     = max( 1, (int) $a['count'] );
	$items = get_posts( [ 'numberposts' => $n, 'post__not_in' => [ $post->ID ], 'category__in' => wp_get_post_categories( $post->ID ), 'post_status' => 'publish' ] );
	if ( count( $items ) < $n ) {
		$items = array_merge( $items, get_posts( [ 'numberposts' => $n - count( $items ), 'post__not_in' => array_merge( [ $post->ID ], wp_list_pluck( $items, 'ID' ) ), 'post_status' => 'publish' ] ) );
	}
	if ( ! $items ) {
		return '';
	}
	$out = '<section style="background:#F6F5F9;padding:72px 0"><div class="wrap col" style="gap:24px"><div class="row between wrapflex" style="gap:12px"><h2 class="disp h2" style="font-size:36px;margin:0">' . esc_html__( 'Keep reading', 'shopinbos' ) . '</h2>'
		. '<a class="gbtn" href="' . esc_url( sib_blog_url() ) . '">' . esc_html__( 'All articles', 'shopinbos' ) . sib_icon( 'arrow', 16 ) . '</a></div><div class="g3">';
	foreach ( $items as $p ) {
		$out .= sib_post_card( $p, 200 );
	}
	return $out . '</div></div></section>';
}
