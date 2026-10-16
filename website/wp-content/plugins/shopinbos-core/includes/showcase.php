<?php
/**
 * Store showcase: real stores built on Shopinbos, shown on /templates/ above the templates.
 * Add one under Website > Store showcase: title (store name), excerpt (one line about it), and in the box below
 * the store link, what it sells and the template; set the Featured image to a desktop screenshot (a phone
 * screenshot is optional). Setup adds Rexi (rexi.mybos.store).
 */

defined( 'ABSPATH' ) || exit;

add_action( 'init', function () {
	register_post_type( 'sib_showcase', [
		'labels'       => [ 'name' => __( 'Store showcase', 'shopinbos' ), 'singular_name' => __( 'Showcase store', 'shopinbos' ), 'add_new_item' => __( 'Add a store to the showcase', 'shopinbos' ), 'edit_item' => __( 'Edit showcase store', 'shopinbos' ), 'all_items' => __( 'Store showcase', 'shopinbos' ) ],
		'public'       => false,
		'show_ui'      => true,
		'supports'     => [ 'title', 'excerpt', 'thumbnail', 'page-attributes' ],
		'map_meta_cap' => true,
	] );
	sib_register_block_group( [
		'store-showcase' => [ __( 'Store showcase', 'shopinbos' ), 'sib_render_store_showcase', [] ],
	], 'widgets' );
}, 11 );

/* Show it in the Website menu with the other content types. */
add_filter( 'register_post_type_args', function ( $args, $type ) {
	if ( 'sib_showcase' === $type ) {
		$args['show_in_menu'] = 'sib-website';
	}
	return $args;
}, 10, 2 );

add_action( 'add_meta_boxes_sib_showcase', function () {
	add_meta_box( 'sib-showcase', __( 'Store details', 'shopinbos' ), function ( WP_Post $post ) {
		wp_nonce_field( 'sib_showcase_save', 'sib_showcase_nonce' );
		$f = fn( $k, $label, $ph ) => '<p><label><b>' . esc_html( $label ) . '</b><br><input type="text" name="sib_showcase[' . $k . ']" value="' . esc_attr( (string) get_post_meta( $post->ID, 'sib_showcase_' . $k, true ) ) . '" placeholder="' . esc_attr( $ph ) . '" style="width:100%"></label></p>';
		echo $f( 'url', __( 'Store link', 'shopinbos' ), 'https://yourstore.mybos.store' ); // phpcs:ignore WordPress.Security.EscapeOutput
		echo $f( 'sells', __( 'What it sells', 'shopinbos' ), __( 'e.g. Gadgets and accessories', 'shopinbos' ) ); // phpcs:ignore WordPress.Security.EscapeOutput
		echo $f( 'template', __( 'Template or style', 'shopinbos' ), __( 'e.g. Noir, dark and bold', 'shopinbos' ) ); // phpcs:ignore WordPress.Security.EscapeOutput
		echo $f( 'mobile', __( 'Phone screenshot link (optional)', 'shopinbos' ), __( 'Upload in Media and paste its link', 'shopinbos' ) ); // phpcs:ignore WordPress.Security.EscapeOutput
		echo '<p class="description">' . esc_html__( 'Set the Featured image to a desktop screenshot of the store’s home page (1440×900 works well).', 'shopinbos' ) . '</p>';
	}, 'sib_showcase', 'normal', 'high' );
} );

add_action( 'save_post_sib_showcase', function ( int $id ) {
	if ( ! isset( $_POST['sib_showcase_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['sib_showcase_nonce'] ) ), 'sib_showcase_save' ) || ! current_user_can( 'edit_post', $id ) ) {
		return;
	}
	$in = (array) wp_unslash( $_POST['sib_showcase'] ?? [] );
	update_post_meta( $id, 'sib_showcase_url', esc_url_raw( (string) ( $in['url'] ?? '' ), [ 'https', 'http' ] ) );
	update_post_meta( $id, 'sib_showcase_mobile', esc_url_raw( (string) ( $in['mobile'] ?? '' ), [ 'https', 'http' ] ) );
	foreach ( [ 'sells', 'template' ] as $k ) {
		update_post_meta( $id, 'sib_showcase_' . $k, sanitize_text_field( (string) ( $in[ $k ] ?? '' ) ) );
	}
} );

/** Showcase stores: published posts, else the built-in Rexi entry. */
function sib_showcase_stores(): array {
	$out = [];
	foreach ( get_posts( [ 'post_type' => 'sib_showcase', 'post_status' => 'publish', 'numberposts' => 12, 'orderby' => [ 'menu_order' => 'ASC', 'date' => 'DESC' ] ] ) as $p ) {
		$out[] = [
			'name'     => get_the_title( $p ),
			'about'    => $p->post_excerpt,
			'url'      => (string) get_post_meta( $p->ID, 'sib_showcase_url', true ),
			'sells'    => (string) get_post_meta( $p->ID, 'sib_showcase_sells', true ),
			'template' => (string) get_post_meta( $p->ID, 'sib_showcase_template', true ),
			'desktop'  => (string) get_the_post_thumbnail_url( $p, 'large' ) ?: (string) get_post_meta( $p->ID, 'sib_showcase_desktop', true ),
			'mobile'   => (string) get_post_meta( $p->ID, 'sib_showcase_mobile', true ),
		];
	}
	if ( ! $out ) {
		$out[] = sib_showcase_rexi();
	}
	return array_values( array_filter( $out, fn( $s ) => $s['url'] ) );
}

function sib_showcase_rexi(): array {
	return [
		'name'     => 'Rexi',
		'about'    => __( 'Affordable gadgets, with a Black Friday countdown, deal badges, a wishlist and a chat button, built with Rex.', 'shopinbos' ),
		'url'      => 'https://rexi.mybos.store/',
		'sells'    => __( 'Gadgets and accessories', 'shopinbos' ),
		'template' => __( 'Dark and bold, with a yellow accent', 'shopinbos' ),
		'desktop'  => sib_img( 'showcase/rexi-desktop.webp' ),
		'mobile'   => sib_img( 'showcase/rexi-mobile.webp' ),
	];
}

function sib_render_store_showcase(): string {
	$stores = sib_showcase_stores();
	if ( ! $stores ) {
		return '';
	}
	$out = '<section class="cv sc-show"><div class="wrap"><div class="sc-head"><p class="eyebrow">' . esc_html__( 'Live stores', 'shopinbos' ) . '</p>'
		. '<h2 class="disp h2">' . esc_html__( 'Real stores built on Shopinbos', 'shopinbos' ) . '</h2>'
		. '<p class="lead">' . esc_html__( 'Open a store and click around: browse products, add to bag, try checkout. This is what your customers will see.', 'shopinbos' ) . '</p></div><div class="sc-grid">';
	foreach ( $stores as $s ) {
		$host = (string) wp_parse_url( $s['url'], PHP_URL_HOST );
		$out .= '<article class="sc-card"><a class="sc-shots" href="' . esc_url( $s['url'] ) . '" target="_blank" rel="noopener" aria-label="' . esc_attr( sprintf( __( 'Visit %s', 'shopinbos' ), $s['name'] ) ) . '">'
			. '<span class="sc-browser"><span class="sc-bar"><i></i><i></i><i></i><em>' . esc_html( $host ) . '</em></span>'
			. ( $s['desktop'] ? '<img src="' . esc_url( $s['desktop'] ) . '" alt="' . esc_attr( sprintf( __( '%s online store home page on a laptop', 'shopinbos' ), $s['name'] ) ) . '" loading="lazy" width="960" height="600">' : '' ) . '</span>'
			. ( $s['mobile'] ? '<span class="sc-phone"><img src="' . esc_url( $s['mobile'] ) . '" alt="' . esc_attr( sprintf( __( '%s store on a phone', 'shopinbos' ), $s['name'] ) ) . '" loading="lazy" width="360" height="780"></span>' : '' ) . '</a>'
			. '<div class="sc-body"><div class="sc-meta">' . ( $s['sells'] ? '<span class="tag">' . esc_html( $s['sells'] ) . '</span>' : '' ) . ( $s['template'] ? '<span class="sc-tpl">' . esc_html( $s['template'] ) . '</span>' : '' ) . '</div>'
			. '<h3>' . esc_html( $s['name'] ) . '</h3>' . ( $s['about'] ? '<p class="p">' . esc_html( $s['about'] ) . '</p>' : '' )
			. '<div class="sc-cta"><a class="btn btn-acc cv-b" href="' . esc_url( $s['url'] ) . '" target="_blank" rel="noopener">' . esc_html__( 'Visit the store', 'shopinbos' ) . sib_icon( 'arrow', 16 ) . '</a><a class="lnk cv-b" href="' . esc_url( sib_go_url( 'template' ) ) . '">' . esc_html__( 'Build one like it', 'shopinbos' ) . sib_icon( 'arrow', 16 ) . '</a></div></div></article>';
	}
	return $out . '</div></div></section>';
}
