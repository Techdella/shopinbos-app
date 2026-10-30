<?php
/**
 * Website V9 blog extras: bylines and author pages, category pages, share buttons, the sign-up boxes inside posts,
 * photo credits and the blog's structured data (Article, FAQPage). The post template itself is
 * sib_v9_blog_post() in v9-content.php; the content structure (answer first, takeaways, FAQ, links) comes from
 * the plugin's seed/blog-aeo.json through `wp shopinbos setup`.
 */

defined( 'ABSPATH' ) || exit;

/* ---------- Bits used by the post template ---------- */

/** Search title and description for a post: the SEO plugin fields setup fills, then older fields, then the post. */
function sib_v9_blog_seo( WP_Post $post ): array {
	$title = '';
	foreach ( [ 'rank_math_title', '_yoast_wpseo_title', 'sib_meta_title' ] as $key ) {
		$v = trim( (string) get_post_meta( $post->ID, $key, true ) );
		if ( '' !== $v && ! str_contains( $v, '%' ) ) {
			$title = $v;
			break;
		}
	}
	$desc = '';
	foreach ( [ 'rank_math_description', '_yoast_wpseo_metadesc' ] as $key ) {
		$v = trim( (string) get_post_meta( $post->ID, $key, true ) );
		if ( '' !== $v && ! str_contains( $v, '%' ) ) {
			$desc = $v;
			break;
		}
	}
	if ( '' === $desc ) {
		$desc = wp_html_excerpt( (string) ( get_post_meta( $post->ID, 'sib_dek', true ) ?: get_the_excerpt( $post ) ), 155, '…' );
	}
	return [ $title ?: get_the_title( $post ), $desc ];
}

/** The post's first category (not the default "uncategorised" one when another exists). */
function sib_v9_blog_cat( WP_Post $post ): ?WP_Term {
	$cats = get_the_category( $post->ID );
	return $cats ? $cats[0] : null;
}

function sib_v9_blog_cat_url( WP_Term $cat ): string {
	return home_url( '/blog/category/' . $cat->slug . '/' );
}

function sib_v9_blog_author_url( int $user_id ): string {
	$u = get_userdata( $user_id );
	return $u ? home_url( '/blog/author/' . $u->user_nicename . '/' ) : home_url( '/blog/' );
}

/** Role line under an author's name: user meta sib_author_role, or "Writer". */
function sib_v9_blog_role( int $user_id ): string {
	return (string) ( get_user_meta( $user_id, 'sib_author_role', true ) ?: __( 'Writer', 'shopinbos' ) );
}

/** Round avatar: the Shopinbos mark for the team account, initials for people. */
function sib_v9_blog_avatar( int $user_id, int $size = 44 ): string {
	$u = get_userdata( $user_id );
	if ( ! $u || 'shopinbos-team' === $u->user_login ) {
		return '<img decoding="async" src="' . esc_url( get_theme_file_uri( 'v9/img/ca93d894250e7589d5b88c477d36f7d7.webp' ) ) . '" alt="" width="' . $size . '" height="' . $size . '" style="flex:none;width:' . $size . 'px;height:' . $size . 'px;border-radius:99px;background:#FF6A2B;padding:' . round( $size / 5.5 ) . 'px">';
	}
	$parts    = preg_split( '/\s+/', trim( $u->display_name ) );
	$initials = mb_strtoupper( mb_substr( $parts[0] ?? '', 0, 1 ) . ( count( $parts ) > 1 ? mb_substr( end( $parts ), 0, 1 ) : '' ) );
	return '<span aria-hidden="true" style="flex:none;width:' . $size . 'px;height:' . $size . 'px;border-radius:99px;background:#16141F;color:#fff;display:grid;place-items:center;font-weight:700;font-size:' . round( $size / 2.6 ) . 'px">' . esc_html( $initials ) . '</span>';
}

/** Byline under the post title: avatar, name (to the author page) and role. */
function sib_v9_blog_byline( WP_Post $post ): string {
	$uid  = (int) $post->post_author;
	$name = get_the_author_meta( 'display_name', $uid ) ?: __( 'Shopinbos team', 'shopinbos' );
	return '<div class="v9-byline">' . sib_v9_blog_avatar( $uid ) . '<div><a href="' . esc_url( sib_v9_blog_author_url( $uid ) ) . '" rel="author"><b>' . esc_html( $name ) . '</b></a><div class="mutd" style="font-size:13.5px">' . esc_html( sib_v9_blog_role( $uid ) ) . '</div></div></div>';
}

/** Plain share links (no scripts from other sites): WhatsApp, X, Facebook, LinkedIn, Telegram and copy link. */
function sib_v9_blog_share( WP_Post $post, string $where = 'side' ): string {
	$url   = get_permalink( $post );
	$title = get_the_title( $post );
	$u     = rawurlencode( $url );
	$t     = rawurlencode( html_entity_decode( $title, ENT_QUOTES, 'UTF-8' ) );
	$svg   = fn( string $d ) => '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="' . $d . '"/></svg>';
	$links = [
		[ 'WhatsApp', 'https://wa.me/?text=' . $t . '%20' . $u, 'M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z' ],
		[ 'X', 'https://x.com/intent/post?text=' . $t . '&url=' . $u, 'M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.3L5.3 21H2.2l7.2-8.3L2 3h6.4l4.4 5.8L17.8 3Zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5Z' ],
		[ 'Facebook', 'https://www.facebook.com/sharer/sharer.php?u=' . $u, 'M13.5 21v-7.5h2.5l.4-3h-2.9V8.6c0-.9.3-1.5 1.5-1.5H16.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9v2.3H8v3h2.5V21h3Z' ],
		[ 'LinkedIn', 'https://www.linkedin.com/sharing/share-offsite/?url=' . $u, 'M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9.5h4V21H3V9.5Zm6.5 0h3.8v1.6h.1c.5-1 1.8-2 3.8-2 4 0 4.8 2.6 4.8 6V21h-4v-5.2c0-1.2 0-2.8-1.7-2.8s-2 1.3-2 2.7V21h-4V9.5Z' ],
		[ 'Telegram', 'https://t.me/share/url?url=' . $u . '&text=' . $t, 'M21.4 4.1 2.9 11.3c-1.3.5-1.2 1.2-.2 1.5l4.7 1.5 1.8 5.6c.2.6.4.8.9.8.4 0 .6-.2.9-.5l2.3-2.2 4.7 3.5c.9.5 1.5.2 1.7-.8l3.1-14.6c.3-1.3-.5-1.8-1.4-1.5ZM9.8 14.5l-.4 4-1.6-5 9.9-6.3-7.9 7.3Z' ],
	];
	$out = '';
	foreach ( $links as [ $name, $href, $d ] ) {
		/* translators: %s: WhatsApp, X, Facebook… */
		$out .= '<a class="v9-sh" href="' . esc_url( $href ) . '" target="_blank" rel="noopener nofollow" aria-label="' . esc_attr( sprintf( __( 'Share on %s', 'shopinbos' ), $name ) ) . '">' . $svg( $d ) . '<span>' . esc_html( $name ) . '</span></a>';
	}
	$out .= '<a class="v9-sh" href="' . esc_url( $url ) . '" data-copy>' . $svg( 'M10.6 13.4a1 1 0 0 1 0-1.4l3.5-3.5a1 1 0 1 1 1.4 1.4L12 13.4a1 1 0 0 1-1.4 0ZM8.5 20.5a4.5 4.5 0 0 1-3.2-7.7l2.5-2.5a1 1 0 0 1 1.4 1.4l-2.5 2.5a2.5 2.5 0 1 0 3.5 3.5l2.5-2.5a1 1 0 0 1 1.4 1.4l-2.5 2.5a4.5 4.5 0 0 1-3.1 1.4Zm8.6-6.4a1 1 0 0 1-.7-1.7l2.5-2.5a2.5 2.5 0 0 0-3.5-3.5l-2.5 2.5a1 1 0 1 1-1.4-1.4L14 5a4.5 4.5 0 1 1 6.4 6.4l-2.5 2.5a1 1 0 0 1-.8.2Z' ) . '<span>' . esc_html__( 'Copy link', 'shopinbos' ) . '</span></a>';
	return '<div class="v9-share is-' . esc_attr( $where ) . '">' . $out . '</div>';
}

/** Topic of the in-post sign-up box: page to learn more, and the words. By the post's category. */
function sib_v9_blog_topic( WP_Post $post ): array {
	$cat    = sib_v9_blog_cat( $post );
	$topics = [
		'delivery'             => [ '/delivery/', 'Delivery', 'Book a rider from the order', 'With Shopinbos Business you book delivery from each order and track it. On Growth and Pro, buyers can pay your shop at the door, so riders never handle cash.', 'See how delivery works' ],
		'payments'             => [ '/payments/', 'Payments', 'Get paid by card, transfer and USSD', 'Your Shopinbos store takes card, bank transfer and USSD, and your money is paid out to your bank through Paystack. Pay on delivery is on Growth and Pro.', 'See how payments work' ],
		'find-stock'           => [ '/find-stock/', 'Find stock', 'Source products without a big load', 'Registered sellers on Shopinbos Business can find stock from suppliers and add it to their store, to dropship or to buy wholesale.', 'See how Find stock works' ],
		'selling-on-whatsapp'  => [ '/social-selling/', 'Sell on WhatsApp', 'One store link for every chat', 'Shopinbos Business gives you a store at name.mybos.store. Share it on WhatsApp, Instagram and TikTok, and every order lands in one list.', 'See social selling' ],
		'instagram-and-tiktok' => [ '/social-selling/', 'Social selling', 'Turn “how much?” into paid orders', 'Put your Shopinbos store link in your bio and replies. Buyers see prices, pay and book delivery without a long chat.', 'See social selling' ],
		'what-to-sell'         => [ '/trending/', 'What to sell', 'See what is selling right now', 'Check products trending in Nigeria, then add the ones that fit your shop to a free Shopinbos store.', 'See trending products' ],
	];
	return $topics[ $cat ? $cat->slug : '' ] ?? [ '/online-store/', 'Your online store', 'Start your online store free', 'Rex builds your store from a few photos, and you can start on the Free plan: ₦0 a month and 3% per sale.', 'See the online store' ];
}

/** The sign-up box placed after the second section of a post. */
function sib_v9_blog_cta( WP_Post $post ): string {
	[ $url, $eyebrow, $title, $text, $more ] = sib_v9_blog_topic( $post );
	return '<aside class="v9-bcta"><span class="k">' . esc_html( $eyebrow ) . '</span><div class="H v9-bcta-t">' . esc_html( $title ) . '</div><p>' . esc_html( $text ) . '</p>'
		. '<div class="v9-bcta-b"><a class="btn b-org" href="' . esc_url( sib_v9_tokens( '%%SIGNUP%%' ) ) . '">' . esc_html__( 'Start free on Shopinbos Business', 'shopinbos' ) . '</a><a class="more" href="' . esc_url( $url ) . '">' . esc_html( $more ) . ' →</a></div></aside>';
}

/** Put the sign-up box at the end of the second section (before the third h2; before the second when there are only two). */
function sib_v9_blog_insert_cta( string $html, WP_Post $post ): string {
	if ( str_contains( $html, 'blk-cta' ) ) {
		return $html; // the post has its own call to action
	}
	preg_match_all( '#<h2\b#', $html, $m, PREG_OFFSET_CAPTURE );
	$h2 = $m[0];
	if ( count( $h2 ) < 2 ) {
		return $html;
	}
	$at = $h2[ count( $h2 ) >= 3 ? 2 : 1 ][1];
	return substr( $html, 0, $at ) . sib_v9_blog_cta( $post ) . substr( $html, $at );
}

/** End of the post: share again, then a sign-up box. */
function sib_v9_blog_end( WP_Post $post ): string {
	[ $url, , , , $more ] = sib_v9_blog_topic( $post );
	return '<div class="v9-postend"><span class="k mutd">' . esc_html__( 'Share this guide', 'shopinbos' ) . '</span>' . sib_v9_blog_share( $post, 'end' ) . '</div>'
		. '<aside class="v9-bcta is-end"><span class="k">' . esc_html__( 'Shopinbos Business', 'shopinbos' ) . '</span><div class="H v9-bcta-t">' . esc_html__( 'Ready to put this into practice?', 'shopinbos' ) . '</div>'
		. '<p>' . esc_html__( 'Open your store, take payments and book delivery from one app. Start on the Free plan: ₦0 a month and 3% per sale. No card needed.', 'shopinbos' ) . '</p>'
		. '<div class="v9-bcta-b"><a class="btn b-org" href="' . esc_url( sib_v9_tokens( '%%SIGNUP%%' ) ) . '">' . esc_html__( 'Start your shop free', 'shopinbos' ) . '</a><a class="more" href="' . esc_url( $url ) . '">' . esc_html( $more ) . ' →</a><a class="more" href="/pricing/">' . esc_html__( 'See pricing', 'shopinbos' ) . ' →</a></div></aside>';
}

/** "Photo: name on Unsplash" under the featured image, when setup recorded a credit. */
function sib_v9_blog_credit( WP_Post $post ): string {
	$c = get_post_meta( (int) get_post_thumbnail_id( $post ), 'sib_credit', true );
	if ( ! is_array( $c ) || empty( $c['name'] ) ) {
		return '';
	}
	return '<p class="v9-credit">' . esc_html__( 'Photo:', 'shopinbos' ) . ' <a href="' . esc_url( $c['url'] ?? 'https://unsplash.com/' ) . '" rel="noopener nofollow" target="_blank">' . esc_html( $c['name'] ) . '</a> ' . esc_html__( 'on Unsplash', 'shopinbos' ) . '</p>';
}

/** Alt text of a post's featured image (falls back to the title). */
function sib_v9_blog_alt( WP_Post $post ): string {
	return (string) ( get_post_meta( (int) get_post_thumbnail_id( $post ), '_wp_attachment_image_alt', true ) ?: get_the_title( $post ) );
}

/* ---------- Category and author pages: /blog/category/{slug}/ and /blog/author/{name}/ ---------- */

add_filter( 'sib_v9_content_templates', function ( array $t ): array {
	// First: a post whose address changed (old slug) is sent to its new address before the 404 page answers.
	return [ 'sib_v9_is_old_blog_slug' => 'sib_v9_old_blog_slug' ] + $t + [ 'sib_v9_is_blog_archive' => 'sib_v9_blog_archive' ];
} );

function sib_v9_is_old_blog_slug(): bool {
	return is_404() && '' !== (string) get_query_var( 'name' ) && str_starts_with( sib_v9_path(), '/blog/' );
}

function sib_v9_old_blog_slug(): ?array {
	wp_old_slug_redirect(); // exits with a 301 when WordPress knows the old address
	return null;
}

/* Twelve guides per page on category and author pages (a full 3-column grid). */
add_action( 'pre_get_posts', function ( WP_Query $q ) {
	if ( ! is_admin() && $q->is_main_query() && ( $q->is_category() || $q->is_author() ) && function_exists( 'sib_v9_active' ) && sib_v9_active() ) {
		$q->set( 'posts_per_page', 12 );
		$q->set( 'post_type', 'post' );
		$q->set( 'ignore_sticky_posts', true );
	}
} );

function sib_v9_is_blog_archive(): bool {
	return ( is_category() || is_author() ) && ! is_feed();
}

/** Page numbers: ← Newer · 1 2 3 · Older →, with WordPress's /page/N/ addresses. */
function sib_v9_blog_pager( string $base, int $page, int $pages ): string {
	if ( $pages < 2 ) {
		return '';
	}
	$url = fn( int $n ) => 1 === $n ? $base : $base . 'page/' . $n . '/';
	$out = '<nav class="v9-pager" aria-label="' . esc_attr__( 'Pages', 'shopinbos' ) . '">';
	$out .= $page > 1 ? '<a class="btn b-line" href="' . esc_url( $url( $page - 1 ) ) . '" rel="prev">← ' . esc_html__( 'Newer', 'shopinbos' ) . '</a>' : '';
	for ( $i = 1; $i <= $pages; $i++ ) {
		$out .= $i === $page ? '<span class="v9-pg on" aria-current="page">' . $i . '</span>' : '<a class="v9-pg" href="' . esc_url( $url( $i ) ) . '">' . $i . '</a>';
	}
	$out .= $page < $pages ? '<a class="btn b-ink" href="' . esc_url( $url( $page + 1 ) ) . '" rel="next">' . esc_html__( 'Older', 'shopinbos' ) . ' →</a>' : '';
	return $out . '</nav>';
}

function sib_v9_blog_archive(): ?array {
	global $wp_query;
	$obj   = get_queried_object();
	$page  = max( 1, (int) get_query_var( 'paged' ) );
	$pages = (int) $wp_query->max_num_pages;
	$posts = $wp_query->posts;
	$cards = implode( '', array_map( fn( $p ) => sib_v9_card( $p ), $posts ) );
	$grid  = $cards ? '<div class="g3" style="display:grid;grid-template-columns:repeat(3,1fr);gap:40px 24px">' . $cards . '</div>' : '<p class="lead">' . esc_html__( 'No guides here yet.', 'shopinbos' ) . ' <a class="more" href="/blog/">' . esc_html__( 'See all guides', 'shopinbos' ) . ' →</a></p>';
	$paged = $page > 1 ? ' · ' . sprintf( /* translators: %d: page number */ __( 'Page %d', 'shopinbos' ), $page ) : '';

	if ( $obj instanceof WP_Term ) {
		$count = (int) $obj->count;
		$lead  = trim( wp_strip_all_tags( term_description( $obj ) ) ) ?: sprintf( /* translators: %s: topic */ __( 'Guides for Nigerian online sellers about %s.', 'shopinbos' ), strtolower( $obj->name ) );
		$chips = '<a class="chip" href="/blog/">' . esc_html__( 'All', 'shopinbos' ) . '</a>';
		foreach ( get_categories( [ 'hide_empty' => true, 'orderby' => 'count', 'order' => 'DESC', 'number' => 9 ] ) as $c ) {
			$chips .= '<a class="chip' . ( $c->term_id === $obj->term_id ? ' on' : '' ) . '" href="' . esc_url( sib_v9_blog_cat_url( $c ) ) . '">' . esc_html( $c->name ) . '</a>';
		}
		$extra = '<p class="mutd" style="margin-top:14px;font-size:14px">' . esc_html( sprintf( _n( '%d guide', '%d guides', $count, 'shopinbos' ), $count ) . $paged ) . '</p><div class="v9-chips" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:22px">' . $chips . '</div>';
		$h     = sib_v9_hero( __( 'Blog · Topic', 'shopinbos' ), $obj->name, $lead, $extra );
		$base  = sib_v9_blog_cat_url( $obj );
		$title = $obj->name . ( $page > 1 ? ' · ' . sprintf( __( 'Page %d', 'shopinbos' ), $page ) : '' ) . ': guides for online sellers · Shopinbos';
		$desc  = wp_html_excerpt( $lead, 155, '…' );
		$crumbs = [ [ __( 'Blog', 'shopinbos' ), home_url( '/blog/' ) ], [ $obj->name, $base ] ];
	} elseif ( $obj instanceof WP_User ) {
		$uid   = (int) $obj->ID;
		$name  = $obj->display_name;
		$bio   = trim( (string) $obj->description );
		$count = (int) count_user_posts( $uid, 'post', true );
		$box   = '<div class="v9-author">' . sib_v9_blog_avatar( $uid, 72 ) . '<div><span class="k orgd">' . esc_html( sib_v9_blog_role( $uid ) ) . '</span>'
			. ( $bio ? '<p style="margin-top:8px">' . esc_html( $bio ) . '</p>' : '' )
			. '<p class="mutd" style="margin-top:8px;font-size:14px">' . esc_html( sprintf( _n( '%d guide', '%d guides', $count, 'shopinbos' ), $count ) . $paged ) . '</p></div></div>';
		$h     = sib_v9_hero( __( 'Blog · Author', 'shopinbos' ), $name, '', $box );
		$base  = sib_v9_blog_author_url( $uid );
		$title = $name . ( $page > 1 ? ' · ' . sprintf( __( 'Page %d', 'shopinbos' ), $page ) : '' ) . ': guides on the Shopinbos blog';
		$desc  = wp_html_excerpt( $bio ?: sprintf( __( 'Guides for Nigerian online sellers by %s.', 'shopinbos' ), $name ), 155, '…' );
		$crumbs = [ [ __( 'Blog', 'shopinbos' ), home_url( '/blog/' ) ], [ $name, $base ] ];
		$GLOBALS['sib_v9_blog_author'] = [ 'name' => $name, 'url' => $base, 'bio' => $bio, 'role' => sib_v9_blog_role( $uid ), 'team' => 'shopinbos-team' === $obj->user_login ];
	} else {
		return null;
	}
	$h .= '<section class="sec" style="background:#fff"><div class="wrap">' . $grid . sib_v9_blog_pager( $base, $page, $pages ) . '</div></section>';
	$h .= sib_v9_section( 'blog-post', 'night' );
	return [
		'slug'        => 'blog',
		'html'        => sib_v9_wrap( $h, 'blog' ),
		'title'       => $title,
		'description' => $desc,
		'canonical'   => $page > 1 ? $base . 'page/' . $page . '/' : $base,
		'crumbs'      => $crumbs,
	];
}

/* ---------- Structured data on V9 blog pages ---------- */

/*
 * V9 pages go through sib_virtual(), so the plugin's schema.php prints only Organization, WebSite and
 * BreadcrumbList (from the crumbs) there. Posts add BlogPosting (unless an SEO plugin prints its own article
 * markup) and FAQPage from the post's FAQ blocks; author pages add a ProfilePage.
 */
add_filter( 'sib_schema_graph', function ( array $graph ): array {
	if ( empty( $GLOBALS['sib_v9_page'] ) ) {
		return $graph;
	}
	$home = home_url( '/' );
	if ( 'blog-post' === $GLOBALS['sib_v9_page'] && is_singular( 'post' ) ) {
		$post = get_queried_object();
		if ( ! $post instanceof WP_Post ) {
			return $graph;
		}
		$url = get_permalink( $post );
		if ( ! ( function_exists( 'sib_seo_plugin' ) && sib_seo_plugin() ) ) {
			$uid  = (int) $post->post_author;
			$name = get_the_author_meta( 'display_name', $uid ) ?: 'Shopinbos team';
			$team = 'shopinbos-team' === get_the_author_meta( 'user_login', $uid );
			$cat  = sib_v9_blog_cat( $post );
			[ , $desc ] = sib_v9_blog_seo( $post );
			$graph[] = array_filter( [
				'@type'            => 'BlogPosting',
				'@id'              => $url . '#article',
				'headline'         => wp_strip_all_tags( get_the_title( $post ) ),
				'description'      => $desc,
				'url'              => $url,
				'mainEntityOfPage' => $url,
				'datePublished'    => get_post_time( 'c', true, $post ),
				'dateModified'     => get_post_modified_time( 'c', true, $post ),
				'author'           => [ '@type' => $team ? 'Organization' : 'Person', 'name' => $name, 'url' => sib_v9_blog_author_url( $uid ) ],
				'publisher'        => [ '@id' => $home . '#org' ],
				'image'            => get_the_post_thumbnail_url( $post, 'large' ) ?: null,
				'articleSection'   => $cat ? $cat->name : null,
				'keywords'         => (string) get_post_meta( $post->ID, 'rank_math_focus_keyword', true ) ?: null,
				'wordCount'        => str_word_count( wp_strip_all_tags( $post->post_content ) ),
				'inLanguage'       => 'en-NG',
			] );
		}
		if ( function_exists( 'sib_schema_faq' ) ) {
			$faq = sib_schema_faq( parse_blocks( $post->post_content ) );
			if ( count( $faq ) >= 2 ) {
				$graph[] = [ '@type' => 'FAQPage', '@id' => $url . '#faq', 'mainEntity' => $faq ];
			}
		}
	}
	if ( ! empty( $GLOBALS['sib_v9_blog_author'] ) ) {
		$a       = $GLOBALS['sib_v9_blog_author'];
		$graph[] = [ '@type' => 'ProfilePage', 'url' => $a['url'], 'mainEntity' => array_filter( $a['team'] ? [ '@type' => 'Organization', 'name' => $a['name'], 'description' => $a['bio'] ?: null, 'parentOrganization' => [ '@id' => $home . '#org' ] ] : [ '@type' => 'Person', 'name' => $a['name'], 'description' => $a['bio'] ?: null, 'jobTitle' => $a['role'], 'worksFor' => [ '@id' => $home . '#org' ] ] ) ];
	}
	return $graph;
} );
