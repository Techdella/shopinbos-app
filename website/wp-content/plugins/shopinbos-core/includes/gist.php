<?php
/**
 * Gist: Shopinbos's take on WhatsApp Status. Short animated story slides with quick selling tips, for people
 * who won't read a long article. Content in seed/gist.json (filter sib_gist_groups to change it).
 * Blocks: Gist rail (a row of story circles; the viewer opens on tap) and the /gist/ page.
 */

defined( 'ABSPATH' ) || exit;

add_action( 'init', function () {
	sib_register_block_group( [
		'gist-rail' => [ __( 'Gist stories', 'shopinbos' ), 'sib_render_gist_rail', [ 'layout' => [ 'string', 'rail', [ 'rail', 'grid' ] ], 'heading' => [ 'boolean', true ] ] ],
	], 'widgets' );
}, 11 );

/** Story groups with their links and circle images. */
function sib_gist_groups(): array {
	static $groups = null;
	if ( null !== $groups ) {
		return $groups;
	}
	$file   = SIB_CORE_DIR . '/includes/seed/gist.json';
	$groups = file_exists( $file ) ? (array) json_decode( (string) file_get_contents( $file ), true ) : [];
	$extra  = [
		'first-order'      => [ '/academy/start-your-shop/', 'Start your shop', 'c/p-hero.webp' ],
		'whatsapp-status'  => [ '/academy/sell-on-whatsapp/', 'Sell on WhatsApp', 'peggy-wave.webp' ],
		'pricing'          => [ '/tools/selling-price-calculator/', 'Price calculator', 'c/f-bag.webp' ],
		'product-photos'   => [ '/academy/instagram-tiktok-and-ads/', 'Photo lessons', 'c/e-camera.webp' ],
		'pay-on-delivery'  => [ '/features/pay-on-delivery/', 'Pay on delivery', 'c/p-ctar.webp' ],
		'delivery'         => [ '/academy/get-paid-and-deliver/', 'Delivery lessons', 'c/s-sneak.webp' ],
		'dropshipping'     => [ '/marketplace/', 'Find stock', 'c/h-arm.webp' ],
		'instagram-tiktok' => [ '/academy/instagram-tiktok-and-ads/', 'IG and TikTok lessons', 'c/p-fashion.webp' ],
		'repeat-customers' => [ '/academy/grow-and-keep-customers/', 'Keep customers', 'c/d-cashew.webp' ],
		'festive-season'   => [ '/academy/run-it-like-a-business/', 'Plan your season', 'c/s-heels.webp' ],
	];
	foreach ( $groups as &$g ) {
		[ $link, $label, $img ] = $extra[ $g['slug'] ] ?? [ '/academy/', 'Free Academy', 'c/p-hero.webp' ];
		$g['link']  = home_url( $link );
		$g['cta']   = $label;
		$g['img']   = sib_img( $img );
		$g['share'] = home_url( '/gist/#' . $g['slug'] );
	}
	$groups = (array) apply_filters( 'sib_gist_groups', $groups );
	return $groups;
}

function sib_render_gist_rail( array $a ): string {
	$groups = sib_gist_groups();
	if ( ! $groups ) {
		return '';
	}
	static $data_done = false;
	$grid = 'grid' === ( $a['layout'] ?? 'rail' );
	$out  = '<section class="gist cv' . ( $grid ? ' gist-grid' : '' ) . '"><div class="wrap">';
	if ( ! empty( $a['heading'] ) && ! $grid ) {
		$out .= '<div class="gist-head"><span class="gist-badge"><span class="gist-dot"></span>' . esc_html__( 'Gist', 'shopinbos' ) . '</span><b>' . esc_html__( 'Selling tips in 60 seconds. Tap a circle.', 'shopinbos' ) . '</b><a class="lnk cv-b" href="' . esc_url( home_url( '/gist/' ) ) . '">' . esc_html__( 'See all', 'shopinbos' ) . sib_icon( 'arrow', 16 ) . '</a></div>';
	}
	$out .= '<div class="gist-row" role="list">';
	foreach ( $groups as $g ) {
		$out .= '<button type="button" class="gist-item" role="listitem" data-gist="' . esc_attr( $g['slug'] ) . '" aria-label="' . esc_attr( sprintf( __( 'Watch: %s', 'shopinbos' ), $g['title'] ) ) . '">'
			. '<span class="gist-ring"><span class="gist-av" style="background:' . esc_attr( $g['bg'] ) . '"><img src="' . esc_url( $g['img'] ) . '" alt="" loading="lazy" width="80" height="80"></span></span>'
			. '<span class="gist-label">' . esc_html( $g['label'] ) . '</span>'
			. ( $grid ? '<span class="gist-sub">' . esc_html( sprintf( _n( '%d slide', '%d slides', count( $g['slides'] ), 'shopinbos' ), count( $g['slides'] ) ) ) . '</span>' : '' ) . '</button>';
	}
	$out .= '</div></div></section>';
	if ( ! $data_done ) {
		$data_done = true;
		$out      .= '<script type="application/json" id="sib-gist-data">' . wp_json_encode( array_values( $groups ), JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_UNICODE ) . '</script>';
	}
	return $out;
}

/** All slides as plain text (for search engines and anyone who prefers reading). */
function sib_gist_text(): string {
	$out = '<section class="cv" style="padding:24px 0 80px"><div class="wrap" style="display:flex;flex-direction:column;gap:14px;max-width:860px"><h2 class="disp h3">' . esc_html__( 'Read the Gist as text', 'shopinbos' ) . '</h2>';
	foreach ( sib_gist_groups() as $g ) {
		$out .= '<details class="card" style="padding:16px 20px" id="text-' . esc_attr( $g['slug'] ) . '"><summary style="font-weight:800;cursor:pointer">' . esc_html( $g['title'] ) . '</summary><ul style="margin:12px 0 0;padding-left:1.2em;display:flex;flex-direction:column;gap:8px">';
		foreach ( $g['slides'] as $s ) {
			$line = trim( implode( ' ', array_filter( [ $s['number'] ?? '', $s['headline'] ?? '', $s['text'] ?? '', implode( ', ', (array) ( $s['items'] ?? [] ) ), ! empty( $s['do'] ) ? 'Do: ' . $s['do'] . '.' : '', ! empty( $s['dont'] ) ? 'Don’t: ' . $s['dont'] . '.' : '' ] ) ) );
			if ( $line ) {
				$out .= '<li class="p" style="font-size:15px">' . esc_html( $line ) . '</li>';
			}
		}
		$out .= '</ul><p style="margin:10px 0 0"><a class="lnk" href="' . esc_url( $g['link'] ) . '">' . esc_html( $g['cta'] ) . '</a></p></details>';
	}
	return $out . '</div></section>';
}
add_shortcode( 'sib_gist_text', 'sib_gist_text' );
