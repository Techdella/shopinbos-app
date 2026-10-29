<?php
/**
 * Seed content: feature and solution pages (seed/landings.json, from the canvas landing pages) built from
 * ordinary blocks so writers can edit every word, plus the partner pages that replace the old theme's.
 */

defined( 'ABSPATH' ) || exit;

function sib_seed_landings(): array {
	$file = SIB_CORE_DIR . '/includes/seed/landings.json';
	return file_exists( $file ) ? (array) json_decode( (string) file_get_contents( $file ), true ) : [];
}

/** A ticked list as a core/list block. */
function sib_seed_ticks( array $items, string $class = 'ticks' ): string {
	$li = implode( "\n\n", array_map( fn( $t ) => "<!-- wp:list-item -->\n<li>" . esc_html( $t ) . "</li>\n<!-- /wp:list-item -->", $items ) );
	return '<!-- wp:list {"className":"' . $class . '"} -->' . "\n<ul class=\"wp-block-list {$class}\">{$li}</ul>\n<!-- /wp:list -->\n\n";
}

function sib_seed_landing_markup( array $d ): string {
	$vis_icon = [ 'store' => 'store', 'social' => 'layers', 'pay' => 'naira', 'chat' => 'chat', 'ai' => 'spark', 'stock' => 'box', 'deliver' => 'truck' ];
	$fit      = 'contain' === $d['fit'] ? 'contain' : 'cover';
	$img      = '<div class="land-media" style="background:' . esc_attr( $d['bg'] ) . '"><img class="is-' . $fit . '" src="' . esc_url( sib_theme_img( str_contains( $d['img'], '.' ) ? $d['img'] : 'c/' . $d['img'] . '.webp' ) ) . '" alt="" loading="eager"></div>';
	$kws      = '<div class="row wrapflex" style="gap:8px">' . implode( '', array_map( fn( $k ) => '<span class="tag">' . esc_html( $k ) . '</span>', $d['kws'] ) ) . '</div>';

	// Hero
	$out = sib_block_group_open( 'land-hero', 'section' ) . sib_block_group_open( 'wrap split', 'div', [ 'top' => '48px', 'bottom' => '64px' ] )
		. sib_block_group_open( 'col-22' ) . sib_block_p( esc_html( $d['eyebrow'] ), 'eyebrow' ) . sib_block_h( 1, esc_html( $d['h1'] ), 'disp h1 h1-58' )
		. sib_block_p( esc_html( $d['sub'] ), 'lead' )
		. sib_block_buttons( [ [ 'Start your shop', '/go/signup', 'accent' ], [ 'See pricing', '/pricing/', 'ghost' ] ] )
		. sib_block_html( $kws ) . sib_block_group_close()
		. sib_block_html( $img ) . sib_block_group_close() . sib_block_group_close( 'section' );

	// Benefits
	$out .= sib_block_group_open( 'sec', 'section' ) . sib_block_group_open( 'wrap col-32' ) . sib_block_group_open( 'g3' );
	foreach ( $d['ben'] as [ $t, $x ] ) {
		$out .= sib_block_group_open( 'card benefit' ) . sib_block_h( 3, esc_html( $t ), 'tt' ) . sib_block_p( esc_html( $x ), 'p' ) . sib_block_group_close();
	}
	$out .= sib_block_group_close() . sib_block_group_close() . sib_block_group_close( 'section' );

	// Feature rows, alternating
	$out .= sib_block_group_open( 'bg-mist sec', 'section' ) . sib_block_group_open( 'wrap col-56' );
	foreach ( $d['rows'] as $i => $row ) {
		[ $t, $x, $items, $vis ] = $row + [ '', '', [], 'store' ];
		$visual = '<div class="land-vis" style="background:' . esc_attr( $d['bg'] ) . '"><span class="land-vis-ic">' . sib_theme_icon( $vis_icon[ $vis ] ?? 'store', 34, '#16141F' ) . '</span>'
			. '<ul class="land-vis-list">' . implode( '', array_map( fn( $it ) => '<li>' . sib_theme_icon( 'tick', 16, '#16794A' ) . esc_html( $it ) . '</li>', array_slice( $items, 0, 3 ) ) ) . '</ul></div>';
		$out   .= sib_block_group_open( 'split land-row' . ( $i % 2 ? ' is-flip' : '' ) )
			. sib_block_group_open( 'col-22' ) . sib_block_h( 2, esc_html( $t ), 'disp h2' ) . sib_block_p( esc_html( $x ), 'lead' ) . sib_block_group_close()
			. sib_block_html( $visual ) . sib_block_group_close();
	}
	$out .= sib_block_group_close() . sib_block_group_close( 'section' );

	// FAQ and plain text for search
	$out .= sib_block_group_open( 'sec', 'section' ) . sib_block_group_open( 'wrap split split-top' )
		. sib_block_group_open( 'col-22' ) . sib_block_h( 2, esc_html( sprintf( 'About %s on Shopinbos', mb_strtolower( $d['title'] ) ) ), 'disp h2' );
	foreach ( $d['seo'] as $para ) {
		$out .= sib_block_p( esc_html( $para ), 'p' );
	}
	if ( ! empty( $d['rel'] ) ) {
		$out .= sib_block_html( '<nav class="row wrapflex" style="gap:8px;margin-top:8px" aria-label="Explore more">' . implode( '', array_map( fn( $r ) => '<a class="chip" href="' . esc_url( $r[1] ) . '">' . esc_html( $r[0] ) . '</a>', $d['rel'] ) ) . '</nav>' );
	}
	$out .= sib_block_group_close()
		. sib_seed_b( 'faq', [ 'items' => implode( "\n", array_map( fn( $f ) => str_replace( '|', '/', $f[0] ) . ' | ' . str_replace( '|', '/', $f[1] ), $d['faq'] ) ), 'openFirst' => true ] )
		. sib_block_group_close() . sib_block_group_close( 'section' );
	return $out;
}

/** Partner pages that replace the old theme's /partners/ section. */
function sib_seed_partner_pages(): array {
	$card = fn( $title, $text, $url, $label ) => sib_block_group_open( 'card benefit' ) . sib_block_h( 3, $title, 'tt' ) . sib_block_p( $text, 'p' )
		. sib_block_p( '<a class="lnk arrow" href="' . esc_url( $url ) . '">' . $label . '</a>' ) . sib_block_group_close();
	$hub = sib_block_group_open( 'land-hero', 'section' ) . sib_block_group_open( 'wrap col-22 mw-760', 'div', [ 'top' => '56px', 'bottom' => '40px' ] )
		. sib_block_p( 'Partners', 'eyebrow' ) . sib_block_h( 1, 'Grow with Shopinbos', 'disp h1 h1-58' )
		. sib_block_p( 'Thousands of Nigerian shops need products, deliveries and help setting up. Partner with us and grow with them.', 'lead' )
		. sib_block_group_close() . sib_block_group_close( 'section' )
		. sib_block_group_open( 'sec', 'section' ) . sib_block_group_open( 'wrap' ) . sib_block_group_open( 'g3' )
		. $card( 'Suppliers and wholesalers', 'List your products once and let shops sell them for you. You ship with their label and get paid after delivery.', '/for-suppliers/', 'Become a supplier' )
		. $card( 'Delivery companies and riders', 'Get delivery jobs from Shopinbos shops every day, with pay on delivery confirmed by a code.', '/delivery/', 'Deliver with us' )
		. $card( 'Agencies and freelancers', 'Build and run online stores for your clients on Shopinbos, and bring them payments and delivery that just work.', '/partners/agencies/', 'Work with us' )
		. sib_block_group_close() . sib_block_group_close() . sib_block_group_close( 'section' );
	$agencies = sib_block_group_open( 'land-hero', 'section' ) . sib_block_group_open( 'wrap col-22 mw-760', 'div', [ 'top' => '56px', 'bottom' => '40px' ] )
		. sib_block_p( 'For agencies and freelancers', 'eyebrow' ) . sib_block_h( 1, 'Build stores for your clients on Shopinbos', 'disp h1 h1-58' )
		. sib_block_p( 'If you design websites, run social media or set up shops for small businesses, Shopinbos gives your clients a store with naira payments, pay on delivery and riders already working, so you can focus on the brand.', 'lead' )
		. sib_block_group_close() . sib_block_group_close( 'section' )
		. sib_block_group_open( 'sec', 'section' ) . sib_block_group_open( 'wrap split split-top' )
		. sib_block_group_open( 'col-22' ) . sib_block_h( 2, 'Why agencies use Shopinbos', 'disp h2' )
		. sib_seed_ticks( [ 'Launch a client’s store in a day, not weeks', 'Payments, delivery and pay on delivery built in, with nothing to install', 'Your client runs the shop from their phone after you hand over', 'Templates made for Nigerian fashion, food, beauty and gadget brands' ] )
		. sib_block_p( 'Tell us about your agency and the kind of clients you work with. We will get back to you within two working days.', 'p' )
		. sib_block_group_close()
		. "<!-- wp:shopinbos/lead-form {\"kind\":\"contact\",\"heading\":\"Talk to our partnerships team\"} /-->\n\n"
		. sib_block_group_close() . sib_block_group_close( 'section' );
	return [
		[ 'partners', 'Partners', $hub, 'Partner with Shopinbos as a supplier, a delivery company or an agency.', '' ],
		[ 'agencies', 'Agency partners', $agencies, 'Build and run online stores for your clients on Shopinbos.', 'partners' ],
	];
}

/** A How it works page built from the theme's sections. */
function sib_seed_how_it_works( callable $pattern ): string {
	return sib_block_group_open( 'land-hero', 'section' ) . sib_block_group_open( 'wrap col-22 mw-760', 'div', [ 'top' => '56px', 'bottom' => '24px' ] )
		. sib_block_p( 'From first product to money in your bank', 'eyebrow' ) . sib_block_h( 1, 'How Shopinbos works', 'disp h1 h1-58' )
		. sib_block_p( 'Find products, sell them everywhere your customers are, run your store, talk to your customers and get paid. Here is how it fits together.', 'lead' )
		. sib_block_buttons( [ [ 'Start your shop', '/go/signup', 'accent' ], [ 'See pricing', '/pricing/', 'ghost' ] ] )
		. sib_block_group_close() . sib_block_group_close( 'section' )
		. $pattern( 'shopinbos/how-it-works' ) . $pattern( 'shopinbos/bento-features' ) . $pattern( 'shopinbos/connect-tabs' ) . $pattern( 'shopinbos/faq-section' );
}
