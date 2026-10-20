<?php
/**
 * Trend reports: one post a day of products trending on TikTok, for Nigerian sellers, at /trending/{report}/.
 * Each product has why it's trending, hashtags, a typical naira price, where sellers get it, a video idea,
 * a link to watch the videos on TikTok (or the TikTok video itself when a link is pasted in the admin) and a
 * "Find suppliers on Shopinbos" button. /trending/ shows today's report first, then the latest ones.
 *
 * Setup schedules the reports in seed/trends.json (one a day, 6am Lagos); edit them under Website > Trend reports.
 */

defined( 'ABSPATH' ) || exit;

add_action( 'init', function () {
	register_post_type( 'sib_trend', [
		'labels'       => [ 'name' => __( 'Trend reports', 'shopinbos' ), 'singular_name' => __( 'Trend report', 'shopinbos' ), 'add_new_item' => __( 'Add trend report', 'shopinbos' ), 'edit_item' => __( 'Edit trend report', 'shopinbos' ), 'all_items' => __( 'Trend reports', 'shopinbos' ) ],
		'public'       => true,
		'show_in_rest' => false,
		'has_archive'  => false,
		'rewrite'      => [ 'slug' => 'trending', 'with_front' => false ],
		'supports'     => [ 'title', 'excerpt', 'thumbnail', 'revisions' ],
		'map_meta_cap' => true,
	] );
	sib_register_block_group( [
		'trend-report' => [ __( 'Trend report', 'shopinbos' ), 'sib_render_trend_report', [] ],
		'trend-feed'   => [ __( 'Trend reports feed', 'shopinbos' ), 'sib_render_trend_feed', [] ],
	], 'widgets' );
}, 11 );

add_filter( 'register_post_type_args', function ( $args, $type ) {
	if ( 'sib_trend' === $type ) {
		$args['show_in_menu'] = 'sib-website';
	}
	return $args;
}, 10, 2 );

/** Niche names and colours. */
function sib_trend_niches(): array {
	return [
		'fashion'  => [ __( 'Fashion', 'shopinbos' ), '#FFF1E8', '#C2410C' ],
		'beauty'   => [ __( 'Beauty', 'shopinbos' ), '#FCE4EC', '#A0204F' ],
		'gadgets'  => [ __( 'Gadgets', 'shopinbos' ), '#E3EEFD', '#1F5FBF' ],
		'home'     => [ __( 'Home and kitchen', 'shopinbos' ), '#E3F4EF', '#0C4A44' ],
		'food'     => [ __( 'Food products', 'shopinbos' ), '#FFF7D6', '#8A5A00' ],
		'kids'     => [ __( 'Kids and school', 'shopinbos' ), '#EEEAFF', '#5B3FD6' ],
		'festive'  => [ __( 'Gifts and festive', 'shopinbos' ), '#FFE4E1', '#B91C1C' ],
		'wellness' => [ __( 'Fitness and wellness', 'shopinbos' ), '#E2F5EA', '#16794A' ],
		'mixed'    => [ __( 'Top picks', 'shopinbos' ), '#16141F', '#FFFFFF' ],
	];
}

/** A report's data: niche, intro, products. */
function sib_trend_data( WP_Post $post ): array {
	return (array) get_post_meta( $post->ID, 'sib_trend', true ) + [ 'niche' => 'mixed', 'intro' => '', 'products' => [], 'note' => '' ];
}

/** Supplier search link for a product. */
function sib_trend_supplier_url( string $name ): string {
	return add_query_arg( 'q', rawurlencode( $name ), home_url( '/marketplace/' ) );
}

/** One product as a TikTok-style card. */
function sib_trend_card( array $p, int $rank, string $niche ): string {
	$n      = sib_trend_niches()[ $niche ] ?? sib_trend_niches()['mixed'];
	$search = 'https://www.tiktok.com/search/video?q=' . rawurlencode( (string) ( $p['tiktok_search'] ?? $p['name'] ) );
	$video  = (string) ( $p['tiktok_url'] ?? '' );
	$vid    = preg_match( '#tiktok\.com/@[\w.\-]+/video/(\d+)#', $video, $m ) ? $m[1] : '';
	$tags   = array_slice( array_filter( (array) ( $p['hashtags'] ?? [] ) ), 0, 3 );

	$media = $vid
		? '<div class="tr-reel tr-video" data-tiktok="' . esc_attr( $vid ) . '" style="--tr-bg:' . esc_attr( $n[1] ) . ';--tr-fg:' . esc_attr( $n[2] ) . '"><span class="tr-rank">#' . $rank . '</span><b class="tr-reel-name">' . esc_html( $p['name'] ) . '</b>'
			. '<button type="button" class="tr-reel-watch tr-play">' . sib_icon( 'play', 18 ) . esc_html__( 'Play the TikTok', 'shopinbos' ) . '</button></div>'
		: '<a class="tr-reel" href="' . esc_url( $search ) . '" target="_blank" rel="noopener nofollow" style="--tr-bg:' . esc_attr( $n[1] ) . ';--tr-fg:' . esc_attr( $n[2] ) . '">'
			. '<span class="tr-rank">#' . $rank . '</span><b class="tr-reel-name">' . esc_html( $p['name'] ) . '</b>'
			. ( $tags ? '<span class="tr-reel-tags">' . esc_html( implode( ' ', $tags ) ) . '</span>' : '' )
			. '<span class="tr-reel-watch">' . sib_icon( 'play', 18 ) . esc_html__( 'Watch on TikTok', 'shopinbos' ) . '</span></a>';

	$out = '<article class="tr-card" id="p' . $rank . '">' . $media . '<div class="tr-body"><h3>' . esc_html( $p['name'] ) . '</h3>';
	if ( ! empty( $p['why'] ) ) {
		$out .= '<p class="tr-why">' . esc_html( $p['why'] ) . '</p>';
	}
	$out .= '<dl class="tr-facts">';
	if ( ! empty( $p['price_ngn'] ) ) {
		$out .= '<div><dt>' . esc_html__( 'Sells for', 'shopinbos' ) . '</dt><dd>' . esc_html( $p['price_ngn'] ) . '</dd></div>';
	}
	if ( ! empty( $p['source_hint'] ) ) {
		$out .= '<div><dt>' . esc_html__( 'Get stock', 'shopinbos' ) . '</dt><dd>' . esc_html( $p['source_hint'] ) . '</dd></div>';
	}
	$out .= '</dl>';
	if ( ! empty( $p['video_idea'] ) ) {
		$out .= '<p class="tr-idea"><b>' . esc_html__( 'Film this:', 'shopinbos' ) . '</b> ' . esc_html( $p['video_idea'] ) . '</p>';
	}
	$out .= '<div class="tr-actions"><a class="btn btn-acc cv-b" href="' . esc_url( sib_trend_supplier_url( (string) ( ( $p['q'] ?? '' ) ?: $p['name'] ) ) ) . '">' . esc_html__( 'Find suppliers on Shopinbos', 'shopinbos' ) . sib_icon( 'arrow', 16 ) . '</a>'
		. '<a class="lnk" href="' . esc_url( $search ) . '" target="_blank" rel="noopener nofollow">' . esc_html__( 'See the videos', 'shopinbos' ) . '</a></div>';
	return $out . '</div></article>';
}

/** The report page body (block on the single template). */
function sib_render_trend_report(): string {
	$post = get_queried_object();
	if ( ! $post instanceof WP_Post || 'sib_trend' !== $post->post_type ) {
		return '';
	}
	$d     = sib_trend_data( $post );
	$n     = sib_trend_niches()[ $d['niche'] ] ?? sib_trend_niches()['mixed'];
	$items = array_values( array_filter( (array) $d['products'], fn( $p ) => ! empty( $p['name'] ) ) );

	$out = '<section class="cv tr-hero"><div class="wrap"><div class="tr-hero-meta"><span class="tag" style="background:' . esc_attr( $n[1] ) . ';color:' . esc_attr( $n[2] ) . '">' . esc_html( $n[0] ) . '</span>'
		. '<span class="tr-date">' . esc_html( sprintf( __( 'Trending on TikTok · %s', 'shopinbos' ), get_the_date( 'l j F Y', $post ) ) ) . '</span></div>'
		. '<h1 class="disp h1">' . esc_html( get_the_title( $post ) ) . '</h1>'
		. ( $d['intro'] ? '<p class="lead">' . esc_html( $d['intro'] ) . '</p>' : '' )
		. '<ol class="tr-jump">';
	foreach ( $items as $i => $p ) {
		$out .= '<li><a href="#p' . ( $i + 1 ) . '">' . esc_html( $p['name'] ) . '</a></li>';
	}
	$out .= '</ol></div></section><section class="cv tr-list"><div class="wrap">';
	foreach ( $items as $i => $p ) {
		$out .= sib_trend_card( $p, $i + 1, $d['niche'] );
		if ( 2 === $i ) {
			$out .= '<aside class="tr-mid"><b>' . esc_html__( 'Sell these without buying stock', 'shopinbos' ) . '</b><span>' . esc_html__( 'Add products from checked Nigerian suppliers to your Shopinbos store. They pack and ship with your shop’s name.', 'shopinbos' ) . '</span><a class="btn btn-ink cv-b" href="' . esc_url( sib_go_url( 'trend_report' ) ) . '">' . esc_html__( 'Start your shop', 'shopinbos' ) . sib_icon( 'arrow', 16 ) . '</a></aside>';
		}
	}
	$sources = array_values( array_unique( array_filter( array_map( fn( $p ) => (string) ( $p['evidence_url'] ?? '' ), $items ) ) ) );
	$out    .= '<p class="tr-note">' . esc_html( $d['note'] ?: __( 'How we pick: products with a clear trend on TikTok (views, hashtags and TikTok Shop sales) that Nigerian sellers can stock locally or import. Prices are typical Nigerian retail prices and change often; check with your supplier.', 'shopinbos' ) ) . '</p>';
	if ( $sources ) {
		$out .= '<details class="tr-sources"><summary>' . esc_html__( 'Sources', 'shopinbos' ) . '</summary><ul>';
		foreach ( array_slice( $sources, 0, 8 ) as $u ) {
			$out .= '<li><a href="' . esc_url( $u ) . '" target="_blank" rel="noopener nofollow">' . esc_html( (string) wp_parse_url( $u, PHP_URL_HOST ) ) . '</a></li>';
		}
		$out .= '</ul></details>';
	}
	$out .= '</div></section>';

	// Earlier reports.
	$more = get_posts( [ 'post_type' => 'sib_trend', 'post_status' => 'publish', 'numberposts' => 6, 'exclude' => [ $post->ID ] ] );
	if ( $more ) {
		$out .= '<section class="cv tr-more"><div class="wrap"><h2 class="disp h3">' . esc_html__( 'More trend reports', 'shopinbos' ) . '</h2><div class="tr-feed-grid">' . implode( '', array_map( 'sib_trend_tile', $more ) ) . '</div></div></section>';
	}
	// ItemList schema for answer engines.
	$out .= '<script type="application/ld+json">' . wp_json_encode( [ '@context' => 'https://schema.org', '@type' => 'ItemList', 'name' => get_the_title( $post ), 'itemListElement' => array_map( fn( $p, $i ) => [ '@type' => 'ListItem', 'position' => $i + 1, 'name' => $p['name'], 'description' => $p['why'] ?? '' ], $items, array_keys( $items ) ) ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . '</script>';
	return $out;
}

/** A report as a tile in a list. */
function sib_trend_tile( WP_Post $p ): string {
	$d     = sib_trend_data( $p );
	$n     = sib_trend_niches()[ $d['niche'] ] ?? sib_trend_niches()['mixed'];
	$names = array_slice( array_column( (array) $d['products'], 'name' ), 0, 3 );
	return '<a class="tr-tile" href="' . esc_url( get_permalink( $p ) ) . '" style="--tr-bg:' . esc_attr( $n[1] ) . ';--tr-fg:' . esc_attr( $n[2] ) . '">'
		. '<span class="tr-tile-top"><span class="tr-tile-niche">' . esc_html( $n[0] ) . '</span><span>' . esc_html( get_the_date( 'j M', $p ) ) . '</span></span>'
		. '<b>' . esc_html( get_the_title( $p ) ) . '</b><span class="tr-tile-items">' . esc_html( implode( ' · ', $names ) ) . '</span></a>';
}

/** /trending/: today's report in full view, then the latest reports. */
function sib_render_trend_feed(): string {
	$all = get_posts( [ 'post_type' => 'sib_trend', 'post_status' => 'publish', 'numberposts' => 13 ] );
	if ( ! $all ) {
		return '';
	}
	$today = array_shift( $all );
	$d     = sib_trend_data( $today );
	$n     = sib_trend_niches()[ $d['niche'] ] ?? sib_trend_niches()['mixed'];
	$items = array_slice( array_values( array_filter( (array) $d['products'], fn( $p ) => ! empty( $p['name'] ) ) ), 0, 6 );
	$out   = '<section class="cv tr-hero tr-feed-hero"><div class="wrap"><div class="tr-hero-meta"><span class="tr-badge"><i></i>' . esc_html__( 'Updated daily', 'shopinbos' ) . '</span><span class="tr-date">' . esc_html( get_the_date( 'l j F Y', $today ) ) . '</span></div>'
		. '<h1 class="disp h1">' . esc_html__( 'Trending TikTok products to sell in Nigeria', 'shopinbos' ) . '</h1>'
		. '<p class="lead">' . esc_html__( 'Every morning: products blowing up on TikTok that Nigerian sellers can stock, with the price they sell for, where to get them and a video idea. Then find a supplier on Shopinbos.', 'shopinbos' ) . '</p></div></section>';
	$out  .= '<section class="cv tr-list"><div class="wrap"><div class="tr-today"><span class="tag" style="background:' . esc_attr( $n[1] ) . ';color:' . esc_attr( $n[2] ) . '">' . esc_html__( 'Today', 'shopinbos' ) . ' · ' . esc_html( $n[0] ) . '</span><h2 class="disp h2"><a href="' . esc_url( get_permalink( $today ) ) . '">' . esc_html( get_the_title( $today ) ) . '</a></h2></div><div class="tr-strip">';
	foreach ( $items as $i => $p ) {
		$out .= sib_trend_card( $p, $i + 1, $d['niche'] );
	}
	$out .= '</div><p style="margin-top:18px"><a class="lnk cv-b" href="' . esc_url( get_permalink( $today ) ) . '">' . esc_html__( 'Open today’s full report', 'shopinbos' ) . sib_icon( 'arrow', 16 ) . '</a></p></div></section>';
	if ( $all ) {
		$out .= '<section class="cv tr-more"><div class="wrap"><h2 class="disp h3">' . esc_html__( 'Earlier reports', 'shopinbos' ) . '</h2><div class="tr-feed-grid">' . implode( '', array_map( 'sib_trend_tile', $all ) ) . '</div></div></section>';
	}
	return $out;
}

/* Admin: products of a report. */
add_action( 'add_meta_boxes_sib_trend', function () {
	add_meta_box( 'sib-trend', __( 'Report', 'shopinbos' ), 'sib_trend_meta_box', 'sib_trend', 'normal', 'high' );
} );

function sib_trend_meta_box( WP_Post $post ): void {
	$d = sib_trend_data( $post );
	wp_nonce_field( 'sib_trend_save', 'sib_trend_nonce' );
	echo '<style>.sibt input,.sibt textarea,.sibt select{width:100%}.sibt details{border:1px solid #dcdcde;border-radius:8px;padding:8px 12px;margin:0 0 8px;background:#fff}.sibt summary{cursor:pointer;font-weight:600}.sibt .g{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}</style><div class="sibt">';
	echo '<p><label><b>' . esc_html__( 'Niche', 'shopinbos' ) . '</b><select name="sib_trend[niche]">';
	foreach ( sib_trend_niches() as $k => $n ) {
		echo '<option value="' . esc_attr( $k ) . '"' . selected( $d['niche'], $k, false ) . '>' . esc_html( $n[0] ) . '</option>';
	}
	echo '</select></label></p><p><label><b>' . esc_html__( 'Intro', 'shopinbos' ) . '</b><textarea name="sib_trend[intro]" rows="2">' . esc_textarea( $d['intro'] ) . '</textarea></label></p>';
	$products = array_values( (array) $d['products'] );
	while ( count( $products ) < 8 ) {
		$products[] = [];
	}
	$fields = [ 'name' => __( 'Product name', 'shopinbos' ), 'q' => __( 'Supplier search words, e.g. glueless wig', 'shopinbos' ), 'price_ngn' => __( 'Sells for, e.g. ₦8,000–₦15,000', 'shopinbos' ), 'why' => __( 'Why it’s trending', 'shopinbos' ), 'video_idea' => __( 'Video idea for sellers', 'shopinbos' ), 'source_hint' => __( 'Where to get stock', 'shopinbos' ), 'hashtags' => __( 'Hashtags, space separated', 'shopinbos' ), 'tiktok_search' => __( 'TikTok search words', 'shopinbos' ), 'tiktok_url' => __( 'TikTok video link (optional: shows the video)', 'shopinbos' ), 'evidence_url' => __( 'Source link', 'shopinbos' ) ];
	foreach ( $products as $i => $p ) {
		echo '<details' . ( $i < 2 ? ' open' : '' ) . '><summary>' . esc_html( sprintf( __( 'Product %d', 'shopinbos' ), $i + 1 ) ) . ( ! empty( $p['name'] ) ? ': ' . esc_html( $p['name'] ) : '' ) . '</summary><div class="g">';
		foreach ( $fields as $k => $label ) {
			$v = 'hashtags' === $k ? implode( ' ', (array) ( $p[ $k ] ?? [] ) ) : (string) ( $p[ $k ] ?? '' );
			echo '<input name="sib_trend[products][' . $i . '][' . $k . ']" value="' . esc_attr( $v ) . '" placeholder="' . esc_attr( $label ) . '" aria-label="' . esc_attr( $label ) . '">';
		}
		echo '</div></details>';
	}
	echo '</div>';
}

add_action( 'save_post_sib_trend', function ( int $id ) {
	if ( ! isset( $_POST['sib_trend_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['sib_trend_nonce'] ) ), 'sib_trend_save' ) || ! current_user_can( 'edit_post', $id ) || wp_is_post_revision( $id ) ) {
		return;
	}
	$in  = (array) wp_unslash( $_POST['sib_trend'] ?? [] );
	$out = [ 'niche' => sanitize_key( (string) ( $in['niche'] ?? 'mixed' ) ), 'intro' => sanitize_textarea_field( (string) ( $in['intro'] ?? '' ) ), 'products' => [] ];
	foreach ( (array) ( $in['products'] ?? [] ) as $p ) {
		if ( empty( $p['name'] ) ) {
			continue;
		}
		$row = [];
		foreach ( [ 'name', 'q', 'price_ngn', 'why', 'video_idea', 'source_hint', 'tiktok_search' ] as $k ) {
			$row[ $k ] = sanitize_text_field( (string) ( $p[ $k ] ?? '' ) );
		}
		$row['hashtags']     = array_values( array_filter( array_map( 'sanitize_text_field', preg_split( '/\s+/', (string) ( $p['hashtags'] ?? '' ) ) ) ) );
		$row['tiktok_url']   = esc_url_raw( (string) ( $p['tiktok_url'] ?? '' ), [ 'https' ] );
		$row['evidence_url'] = esc_url_raw( (string) ( $p['evidence_url'] ?? '' ), [ 'https', 'http' ] );
		$out['products'][]   = $row;
	}
	update_post_meta( $id, 'sib_trend', $out );
} );

/** Setup: schedule the reports in seed/trends.json (new ones only). Returns how many were added. */
function sib_trend_import(): int {
	$file = SIB_CORE_DIR . '/includes/seed/trends.json';
	if ( ! file_exists( $file ) ) {
		return 0;
	}
	$made = 0;
	foreach ( (array) json_decode( (string) file_get_contents( $file ), true ) as $r ) {
		if ( get_page_by_path( $r['slug'], OBJECT, 'sib_trend' ) ) {
			continue;
		}
		$when = new DateTimeImmutable( $r['date'], new DateTimeZone( 'Africa/Lagos' ) );
		$gmt  = $when->setTimezone( new DateTimeZone( 'UTC' ) )->format( 'Y-m-d H:i:s' );
		$id   = wp_insert_post( [
			'post_type'     => 'sib_trend',
			'post_status'   => $when->getTimestamp() > time() ? 'future' : 'publish',
			'post_title'    => $r['title'],
			'post_name'     => $r['slug'],
			'post_excerpt'  => $r['excerpt'],
			'post_date_gmt' => $gmt,
			'post_date'     => get_date_from_gmt( $gmt ),
		] );
		if ( $id && ! is_wp_error( $id ) ) {
			update_post_meta( $id, 'sib_trend', [ 'niche' => $r['niche'], 'intro' => $r['intro'], 'products' => $r['products'] ] );
			$made++;
		}
	}
	return $made;
}

/* Publish due reports even when cron misses, and clear the page cache when one goes live. */
add_action( 'init', function () {
	if ( get_transient( 'sib_trend_due_check' ) ) {
		return;
	}
	set_transient( 'sib_trend_due_check', 1, 10 * MINUTE_IN_SECONDS );
	foreach ( get_posts( [ 'post_type' => 'sib_trend', 'post_status' => 'future', 'numberposts' => 5, 'date_query' => [ [ 'column' => 'post_date_gmt', 'before' => gmdate( 'Y-m-d H:i:s' ), 'inclusive' => true ] ], 'fields' => 'ids' ] ) as $id ) {
		wp_publish_post( $id );
	}
}, 21 );
add_action( 'transition_post_status', function ( $new, $old, $post ) {
	if ( 'sib_trend' === $post->post_type && 'publish' === $new && 'publish' !== $old ) {
		do_action( 'litespeed_purge_all' );
	}
}, 10, 3 );
