<?php
/**
 * Gist: Shopinbos's take on WhatsApp Status. Short animated story slides with quick selling tips, for people
 * who won't read a long article. Edit them in the admin under Website > Gist stories (setup imports seed/gist.json).
 * Blocks: Gist rail (a row of story circles; the viewer opens on tap) and the /gist/ page.
 */

defined( 'ABSPATH' ) || exit;

add_action( 'init', function () {
	sib_register_block_group( [
		'gist-rail' => [ __( 'Gist stories', 'shopinbos' ), 'sib_render_gist_rail', [ 'layout' => [ 'string', 'rail', [ 'rail', 'grid' ] ], 'heading' => [ 'boolean', true ] ] ],
	], 'widgets' );
}, 11 );

/** Default link, button label and circle image for the seeded story groups. */
function sib_gist_defaults(): array {
	return [
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
}

/** The seed file's story groups (setup copies them into Gist stories in the admin). */
function sib_gist_seed(): array {
	$file = SIB_CORE_DIR . '/includes/seed/gist.json';
	return file_exists( $file ) ? (array) json_decode( (string) file_get_contents( $file ), true ) : [];
}

/** Story groups with their links and circle images: the published Gist stories, else the seed file. */
function sib_gist_groups(): array {
	static $groups = null;
	if ( null !== $groups ) {
		return $groups;
	}
	$groups = [];
	$posts  = post_type_exists( 'sib_gist' ) ? get_posts( [ 'post_type' => 'sib_gist', 'post_status' => 'publish', 'numberposts' => 40, 'orderby' => [ 'menu_order' => 'ASC', 'ID' => 'ASC' ] ] ) : [];
	foreach ( $posts as $p ) {
		$g = (array) get_post_meta( $p->ID, 'sib_gist', true );
		if ( empty( $g['slides'] ) ) {
			continue;
		}
		$g['slug']  = $p->post_name;
		$g['title'] = get_the_title( $p );
		$g['label'] = ( $g['label'] ?? '' ) ?: get_the_title( $p );
		$g['thumb'] = (string) get_the_post_thumbnail_url( $p, 'thumbnail' );
		$groups[]   = $g;
	}
	if ( ! $groups ) {
		$groups = sib_gist_seed();
	}
	$extra = sib_gist_defaults();
	foreach ( $groups as &$g ) {
		[ $link, $label, $img ] = $extra[ $g['slug'] ] ?? [ '/academy/', 'Free Academy', 'c/p-hero.webp' ];
		$g          += [ 'bg' => '#FF6A2B', 'fg' => '#16141F', 'accent' => '#FFFFFF' ];
		$g['link']   = ! empty( $g['link'] ) ? ( str_starts_with( $g['link'], 'http' ) ? $g['link'] : home_url( $g['link'] ) ) : home_url( $link );
		$g['cta']    = ( $g['cta'] ?? '' ) ?: $label;
		$g['img']    = ! empty( $g['thumb'] ) ? $g['thumb'] : sib_img( $img );
		$g['share']  = home_url( '/gist/#' . $g['slug'] );
		unset( $g['thumb'] );
	}
	unset( $g );
	$groups = (array) apply_filters( 'sib_gist_groups', $groups );
	return $groups;
}

/* Gist stories in the admin: one post per story circle, with its slides. */
add_action( 'init', function () {
	register_post_type( 'sib_gist', [
		'labels'        => [ 'name' => __( 'Gist stories', 'shopinbos' ), 'singular_name' => __( 'Gist story', 'shopinbos' ), 'add_new_item' => __( 'Add Gist story', 'shopinbos' ), 'edit_item' => __( 'Edit Gist story', 'shopinbos' ), 'all_items' => __( 'Gist stories', 'shopinbos' ) ],
		'public'        => false,
		'show_ui'       => true,
		'show_in_rest'  => false,
		'menu_icon'     => 'dashicons-format-status',
		'supports'      => [ 'title', 'thumbnail', 'page-attributes', 'revisions' ],
		'map_meta_cap'  => true,
	] );
} );

function sib_gist_slide_types(): array {
	return [ 'cover' => __( 'Cover', 'shopinbos' ), 'tip' => __( 'Tip', 'shopinbos' ), 'list' => __( 'List', 'shopinbos' ), 'number' => __( 'Big number', 'shopinbos' ), 'myth' => __( 'Myth and truth', 'shopinbos' ), 'do-dont' => __( 'Do and don’t', 'shopinbos' ), 'cta' => __( 'Last slide (button)', 'shopinbos' ) ];
}

add_action( 'add_meta_boxes_sib_gist', function () {
	add_meta_box( 'sib-gist', __( 'Story look and slides', 'shopinbos' ), 'sib_gist_meta_box', 'sib_gist', 'normal', 'high' );
} );

function sib_gist_meta_box( WP_Post $post ): void {
	$g      = (array) get_post_meta( $post->ID, 'sib_gist', true ) + [ 'label' => '', 'bg' => '#FF6A2B', 'fg' => '#16141F', 'accent' => '#FFFFFF', 'link' => '', 'cta' => '', 'slides' => [] ];
	$slides = array_values( (array) $g['slides'] );
	while ( count( $slides ) < 10 ) {
		$slides[] = [];
	}
	wp_nonce_field( 'sib_gist_save', 'sib_gist_nonce' );
	$f = fn( $name, $value, $ph = '', $type = 'text' ) => '<input type="' . $type . '" name="sib_gist[' . $name . ']" value="' . esc_attr( (string) $value ) . '" placeholder="' . esc_attr( $ph ) . '" style="width:100%">';
	echo '<style>.sibg td,.sibg th{vertical-align:top;padding:6px}.sibg textarea,.sibg input,.sibg select{width:100%}.sibg-slide{border:1px solid #dcdcde;border-radius:8px;padding:10px 12px;margin:0 0 10px;background:#fff}.sibg-slide summary{cursor:pointer;font-weight:600}</style><div class="sibg">';
	echo '<table class="form-table"><tr><th>' . esc_html__( 'Circle label', 'shopinbos' ) . '</th><td>' . $f( 'label', $g['label'], __( 'Short, e.g. Pricing', 'shopinbos' ) ) . '</td></tr>';
	echo '<tr><th>' . esc_html__( 'Colours', 'shopinbos' ) . '</th><td style="display:flex;gap:12px;flex-wrap:wrap">';
	foreach ( [ 'bg' => __( 'Background', 'shopinbos' ), 'fg' => __( 'Text', 'shopinbos' ), 'accent' => __( 'Accent', 'shopinbos' ) ] as $k => $l ) {
		echo '<label style="display:flex;gap:6px;align-items:center">' . esc_html( $l ) . ' <input type="color" name="sib_gist[' . $k . ']" value="' . esc_attr( $g[ $k ] ) . '" style="width:48px;height:32px;padding:0"></label>';
	}
	echo '</td></tr><tr><th>' . esc_html__( 'Last slide button', 'shopinbos' ) . '</th><td style="display:flex;gap:8px">' . $f( 'cta', $g['cta'], __( 'Button words', 'shopinbos' ) ) . $f( 'link', $g['link'], __( 'Link, e.g. /academy/', 'shopinbos' ) ) . '</td></tr>';
	echo '<tr><th>' . esc_html__( 'Circle image', 'shopinbos' ) . '</th><td>' . esc_html__( 'Set the Featured image (right-hand side). A square photo works best.', 'shopinbos' ) . '</td></tr></table>';
	echo '<p><strong>' . esc_html__( 'Slides', 'shopinbos' ) . '</strong> ' . esc_html__( '(empty slides are skipped; keep it to 5 to 8)', 'shopinbos' ) . '</p>';
	foreach ( $slides as $i => $s ) {
		$s    = (array) $s + [ 'type' => '', 'eyebrow' => '', 'headline' => '', 'text' => '', 'items' => [], 'number' => '', 'do' => '', 'dont' => '' ];
		$name = fn( $k ) => 'sib_gist[slides][' . $i . '][' . $k . ']';
		echo '<details class="sibg-slide"' . ( $s['type'] && $i < 3 ? ' open' : '' ) . '><summary>' . esc_html( sprintf( __( 'Slide %d', 'shopinbos' ), $i + 1 ) ) . ( $s['type'] ? ': ' . esc_html( sib_gist_slide_types()[ $s['type'] ] ?? $s['type'] ) . ( $s['headline'] ? ' · ' . esc_html( $s['headline'] ) : '' ) : ' ' . esc_html__( '(empty)', 'shopinbos' ) ) . '</summary><table style="width:100%"><tr><td style="width:180px"><select name="' . $name( 'type' ) . '"><option value="">' . esc_html__( '— Not used —', 'shopinbos' ) . '</option>';
		foreach ( sib_gist_slide_types() as $k => $l ) {
			echo '<option value="' . esc_attr( $k ) . '"' . selected( $s['type'], $k, false ) . '>' . esc_html( $l ) . '</option>';
		}
		echo '</select></td><td><input name="' . $name( 'eyebrow' ) . '" value="' . esc_attr( $s['eyebrow'] ) . '" placeholder="' . esc_attr__( 'Small heading (cover only)', 'shopinbos' ) . '"></td></tr>';
		echo '<tr><td colspan="2"><input name="' . $name( 'headline' ) . '" value="' . esc_attr( $s['headline'] ) . '" placeholder="' . esc_attr__( 'Headline', 'shopinbos' ) . '"></td></tr>';
		echo '<tr><td colspan="2"><textarea rows="2" name="' . $name( 'text' ) . '" placeholder="' . esc_attr__( 'Text', 'shopinbos' ) . '">' . esc_textarea( $s['text'] ) . '</textarea></td></tr>';
		echo '<tr><td><input name="' . $name( 'number' ) . '" value="' . esc_attr( $s['number'] ) . '" placeholder="' . esc_attr__( 'Big number, e.g. ₦4,000', 'shopinbos' ) . '"></td><td><textarea rows="2" name="' . $name( 'items' ) . '" placeholder="' . esc_attr__( 'List items, one per line', 'shopinbos' ) . '">' . esc_textarea( implode( "\n", (array) $s['items'] ) ) . '</textarea></td></tr>';
		echo '<tr><td colspan="2" style="display:flex;gap:8px"><input name="' . $name( 'do' ) . '" value="' . esc_attr( $s['do'] ) . '" placeholder="' . esc_attr__( 'Do…', 'shopinbos' ) . '"><input name="' . $name( 'dont' ) . '" value="' . esc_attr( $s['dont'] ) . '" placeholder="' . esc_attr__( 'Don’t…', 'shopinbos' ) . '"></td></tr></table></details>';
	}
	echo '</div>';
}

add_action( 'save_post_sib_gist', function ( int $id ) {
	if ( ! isset( $_POST['sib_gist_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['sib_gist_nonce'] ) ), 'sib_gist_save' ) || ! current_user_can( 'edit_post', $id ) || wp_is_post_revision( $id ) ) {
		return;
	}
	$in  = (array) wp_unslash( $_POST['sib_gist'] ?? [] );
	$hex = fn( $v, $d ) => sanitize_hex_color( (string) $v ) ?: $d;
	$g   = [
		'label'  => sanitize_text_field( (string) ( $in['label'] ?? '' ) ),
		'bg'     => $hex( $in['bg'] ?? '', '#FF6A2B' ),
		'fg'     => $hex( $in['fg'] ?? '', '#16141F' ),
		'accent' => $hex( $in['accent'] ?? '', '#FFFFFF' ),
		'cta'    => sanitize_text_field( (string) ( $in['cta'] ?? '' ) ),
		'link'   => esc_url_raw( (string) ( $in['link'] ?? '' ), [ 'http', 'https' ] ) ?: ( str_starts_with( (string) ( $in['link'] ?? '' ), '/' ) ? sanitize_text_field( (string) $in['link'] ) : '' ),
		'slides' => [],
	];
	foreach ( (array) ( $in['slides'] ?? [] ) as $s ) {
		$type = sanitize_key( (string) ( $s['type'] ?? '' ) );
		if ( ! isset( sib_gist_slide_types()[ $type ] ) ) {
			continue;
		}
		$g['slides'][] = [
			'type'     => $type,
			'eyebrow'  => sanitize_text_field( (string) ( $s['eyebrow'] ?? '' ) ),
			'headline' => sanitize_text_field( (string) ( $s['headline'] ?? '' ) ),
			'text'     => sanitize_textarea_field( (string) ( $s['text'] ?? '' ) ),
			'items'    => array_values( array_filter( array_map( 'sanitize_text_field', preg_split( '/\R/', (string) ( $s['items'] ?? '' ) ) ) ) ),
			'number'   => sanitize_text_field( (string) ( $s['number'] ?? '' ) ),
			'do'       => sanitize_text_field( (string) ( $s['do'] ?? '' ) ),
			'dont'     => sanitize_text_field( (string) ( $s['dont'] ?? '' ) ),
		];
	}
	update_post_meta( $id, 'sib_gist', $g );
} );

/** Setup: copy the seed file's story groups into Gist stories (new ones only; edits are never overwritten). */
function sib_gist_import(): int {
	$made = 0;
	foreach ( sib_gist_seed() as $i => $g ) {
		if ( get_page_by_path( $g['slug'], OBJECT, 'sib_gist' ) ) {
			continue;
		}
		$id = wp_insert_post( [ 'post_type' => 'sib_gist', 'post_status' => 'publish', 'post_title' => $g['title'], 'post_name' => $g['slug'], 'menu_order' => $i ] );
		if ( $id && ! is_wp_error( $id ) ) {
			update_post_meta( $id, 'sib_gist', array_intersect_key( $g, array_flip( [ 'label', 'bg', 'fg', 'accent', 'slides' ] ) ) );
			$made++;
		}
	}
	return $made;
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
