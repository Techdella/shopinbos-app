<?php
/**
 * Canvas sections: the header, footer and page sections built from the design canvas
 * (website/tools/canvas_build.py writes them to canvas/*.html). The Canvas section block places one
 * on a page; the header and footer blocks use them for every page.
 */

defined( 'ABSPATH' ) || exit;

/** Section files a page can use, with the name shown in the editor. */
function sib_canvas_parts(): array {
	$names = [
		'home-01' => 'Home: hero',
		'motion-home' => 'Home: 15-second video',
		'home-02' => 'Home: works with',
		'home-03' => 'Home: made for how you sell',
		'home-04' => 'Home: find stock',
		'home-05' => 'Home: connections',
		'home-06' => 'Home: everything it takes',
		'home-07' => 'Home: ads',
		'home-08' => 'Home: social week',
		'home-09' => 'Home: how it works',
		'home-10' => 'Home: products to sell',
		'home-11' => 'Home: templates',
		'home-12' => 'Home: grow with us',
		'home-13' => 'Home: questions',
		'home-14' => 'Home: closing call',
	];
	foreach ( glob( get_theme_file_path( 'canvas/*.html' ) ) as $file ) {
		$part = basename( $file, '.html' );
		if ( ! isset( $names[ $part ] ) && ! in_array( $part, [ 'header', 'footer', 'stickycta' ], true ) ) {
			$names[ $part ] = ucfirst( str_replace( '-', ' ', $part ) );
		}
	}
	return $names;
}

/** Canvas section blocks for every part of a page, e.g. all pricing-NN parts. */
function sib_canvas_blocks( string $prefix ): string {
	$out = '';
	foreach ( array_keys( sib_canvas_parts() ) as $part ) {
		if ( preg_match( '/^' . preg_quote( $prefix, '/' ) . '-\d+$/', $part ) ) {
			$out .= '<!-- wp:shopinbos/canvas {"part":"' . esc_attr( $part ) . "\"} /-->\n\n";
		}
	}
	return $out;
}

/** A canvas section's markup with its links and images filled in. */
function sib_canvas_part( string $part ): string {
	$part = sanitize_key( $part );
	$file = get_theme_file_path( 'canvas/' . $part . '.html' );
	if ( ! $part || ! is_readable( $file ) ) {
		return '';
	}
	$html = (string) file_get_contents( $file );
	$html = preg_replace_callback( '/\{\{(img|go|url):([^}]*)\}\}/', function ( $m ) {
		if ( 'img' === $m[1] ) {
			return sib_theme_img( $m[2] );
		}
		if ( 'go' === $m[1] ) {
			$bits = explode( ':', $m[2] );
			return esc_url( match ( $bits[0] ) {
				'login'    => sib_theme_go( 'login' ),
				'supplier' => sib_theme_go( 'supplier_signup' ),
				'partner'  => sib_theme_go( 'partner_signup' ),
				'add'      => sib_theme_go( 'add', [ 'productSlug' => $bits[1] ?? '' ] ),
				'template' => sib_theme_go( 'template', [ 'template' => $bits[1] ?? '' ] ),
				default    => sib_theme_go(),
			} );
		}
		return esc_url( home_url( $m[2] ) );
	}, $html );
	// Help centre: topic links and counts, popular article links.
	$html = preg_replace_callback( '/\{\{(helpcat|helpcount|helpurl):([^}]+)\}\}/', function ( $m ) {
		$name = html_entity_decode( $m[2] );
		if ( 'helpurl' === $m[1] ) {
			$found = get_posts( [ 'post_type' => 'sib_help', 'title' => $name, 'numberposts' => 1, 'post_status' => 'publish' ] );
			return esc_url( $found ? get_permalink( $found[0] ) : home_url( '/help/' ) );
		}
		$term = get_term_by( 'name', $name, 'sib_help_category' );
		if ( 'helpcat' === $m[1] ) {
			return esc_url( $term ? get_term_link( $term ) : home_url( '/help/' ) );
		}
		$n = $term ? (int) $term->count : 0;
		return esc_html( $n ? sprintf( _n( '%d article', '%d articles', $n, 'shopinbos' ), $n ) : __( 'Coming soon', 'shopinbos' ) );
	}, $html );

	if ( str_contains( $html, '{{checked}}' ) ) {
		$checked = (string) get_post_meta( get_queried_object_id(), 'sib_last_checked', true );
		$html    = str_replace( '{{checked}}', esc_html( date_i18n( 'j F Y', $checked ? strtotime( $checked ) : time() ) ), $html );
	}
	// App Store and Google Play badges ("Coming soon" until Settings > Shopinbos website has the store link).
	$html = preg_replace_callback( '/\{\{store(link)?:(ios|android)\}\}/', function ( $m ) {
		if ( ! function_exists( 'sib_store_badge' ) ) {
			return '';
		}
		if ( ! $m[1] ) {
			return sib_store_badge( $m[2] );
		}
		$url  = (string) sib_setting( 'ios' === $m[2] ? 'ios_url' : 'android_url' );
		$name = 'ios' === $m[2] ? 'iPhone' : 'Android';
		return $url
			? '<a class="row cv-b" href="' . esc_url( $url ) . '" style="gap:8px">' . esc_html( $name ) . '</a>'
			: '<button type="button" class="row cv-b" data-cv="pop.openApp" data-platform="' . $m[2] . '" style="gap:8px">' . esc_html( $name ) . ' <span class="tag" style="background:rgba(255,255,255,.12);color:#C9C6D3;min-height:20px;font-size:10.5px">' . esc_html__( 'Coming soon', 'shopinbos' ) . '</span></button>';
	}, $html );
	// Before launch the top bar announces the launch date; cached copies swap back in the browser after launch.
	if ( 'header' === $part && function_exists( 'sib_app_live' ) && ! sib_app_live() && preg_match( '#<div class="wrap row"[^>]*><span class="tag"[^>]*>Free PDF</span>.*?</a>#s', $html, $m ) ) {
		$pre  = '<div class="wrap row" data-prelaunch style="justify-content:center;gap:10px;min-height:38px;flex-wrap:wrap;text-align:center"><span class="tag" style="background:#FF6A2B;color:#fff;min-height:22px">' . esc_html__( 'Nov 1', 'shopinbos' ) . '</span><span>' . esc_html__( 'Shopinbos opens on November 1. Sellers, suppliers and riders: get in first.', 'shopinbos' ) . '</span>'
			. '<a class="lnk cv-b" href="' . esc_url( home_url( '/waitlist/' ) ) . '" style="color:#FFB18F;font-size:13px">' . esc_html__( 'Join the waitlist', 'shopinbos' ) . sib_theme_icon( 'arrow', 16 ) . '</a>';
		$post = preg_replace( '#^<div class="wrap row"#', '<div class="wrap row" data-postlaunch hidden', $m[0] );
		$html = str_replace( $m[0], $pre . '</div>' . $post, $html );
	}
	if ( 'footer' === $part ) {
		$html = str_replace( '<a class="cv-b" href="/about/">About us</a>', '<a class="cv-b" href="/about/">About us</a><a class="cv-b" href="' . esc_url( home_url( '/investors/' ) ) . '">' . esc_html__( 'Investors', 'shopinbos' ) . '</a>', $html );
		$html = str_replace( '<a class="cv-b" href="/legal/seller-rules/">Seller rules</a>', '<a class="cv-b" href="/legal/seller-rules/">Seller rules</a><a class="cv-b" href="' . esc_url( home_url( '/legal/data-protection/' ) ) . '">' . esc_html__( 'Data protection', 'shopinbos' ) . '</a><a class="cv-b" href="' . esc_url( home_url( '/legal/' ) ) . '">' . esc_html__( 'All policies', 'shopinbos' ) . '</a>', $html );
	}
	if ( 'popups' === $part && function_exists( 'sib_app_notify_popup' ) ) {
		$html = preg_replace( '/<\/div>\s*$/', sib_app_notify_popup() . ( function_exists( 'sib_waitlist_popup' ) ? sib_waitlist_popup() : '' ) . '</div>', $html, 1 );
	}
	if ( 'popups' === $part && function_exists( 'sib_popup_contact_mode' ) ) {
		$html = sib_popup_contact_mode( $html );
	}
	$html = str_replace( '{{today}}', esc_html( wp_date( 'l j F Y', (int) wp_date( 'G' ) < 7 ? time() - DAY_IN_SECONDS : null ) ), $html );
	if ( str_contains( $html, '{{kit_id}}' ) ) {
		$kit  = get_page_by_path( 'online-sellers-starter-kit', OBJECT, 'sib_resource' );
		$html = str_replace( '{{kit_id}}', (string) ( $kit ? $kit->ID : 0 ), $html );
	}
	$html = str_replace( '{{leadurl}}', esc_url( admin_url( 'admin-post.php' ) ), $html );
	$wa   = function_exists( 'sib_whatsapp_url' ) ? sib_whatsapp_url() : 'https://wa.me/';
	$html = str_replace( '{{wa}}', esc_url( $wa ), $html );

	// Real logos in place of the canvas's letter badges.
	$html = preg_replace_callback( '/<span class="mono" data-brand="([^"]+)"([^>]*)>([^<]*)<\/span>/', function ( $m ) {
		$name = html_entity_decode( $m[1] );
		$logo = sib_brand_logo( $name, 20 ) ?: sib_service_icon( $name, 18 );
		return $logo ? '<span class="mono"' . $m[2] . ' title="' . $m[1] . '">' . $logo . '</span>' : '<span class="mono"' . $m[2] . '>' . $m[3] . '</span>';
	}, $html );

	// Light up the main menu link for the current section.
	return preg_replace_callback( '/<a class="navlink cv-b" href="([^"]+)"/', fn( $m ) => sib_theme_is_current( $m[1] ) ? str_replace( 'navlink ', 'navlink is-on ', $m[0] ) : $m[0], $html );
}

add_action( 'init', function () {
	register_block_type( 'shopinbos/canvas', [
		'api_version'     => 3,
		'title'           => __( 'Canvas section', 'shopinbos' ),
		'description'     => __( 'A section from the Shopinbos design canvas.', 'shopinbos' ),
		'category'        => 'theme',
		'icon'            => 'layout',
		'attributes'      => [ 'part' => [ 'type' => 'string', 'default' => '' ] ],
		'supports'        => [ 'html' => false ],
		'render_callback' => fn( $a ) => sib_canvas_part( (string) ( $a['part'] ?? '' ) ),
	] );
} );

/* Editor: pick the section from a list. */
add_action( 'enqueue_block_editor_assets', function () {
	$opts = [];
	foreach ( sib_canvas_parts() as $value => $label ) {
		$opts[] = [ 'value' => $value, 'label' => $label ];
	}
	wp_register_script( 'sib-canvas-block', false, [ 'wp-blocks', 'wp-element', 'wp-components', 'wp-block-editor', 'wp-server-side-render' ], SIB_THEME_VERSION, true );
	wp_enqueue_script( 'sib-canvas-block' );
	wp_add_inline_script( 'sib-canvas-block', 'window.sibCanvasParts=' . wp_json_encode( $opts ) . ';(' . <<<'JS'
function(){var el=wp.element.createElement,be=wp.blockEditor,c=wp.components;
wp.blocks.registerBlockType('shopinbos/canvas',{edit:function(p){return el('div',be.useBlockProps(),
el(be.InspectorControls,null,el(c.PanelBody,{title:'Section'},el(c.SelectControl,{label:'Section',value:p.attributes.part,options:[{value:'',label:'Choose…'}].concat(window.sibCanvasParts),onChange:function(v){p.setAttributes({part:v})}}))),
p.attributes.part?el(wp.serverSideRender,{block:'shopinbos/canvas',attributes:p.attributes}):el(c.Placeholder,{label:'Canvas section'},el(c.SelectControl,{value:'',options:[{value:'',label:'Choose…'}].concat(window.sibCanvasParts),onChange:function(v){p.setAttributes({part:v})}})))},save:function(){return null}});}
JS
	. ')();' );
} );

/* The canvas styles hang off .site. */
add_filter( 'body_class', fn( $c ) => array_merge( $c, [ 'site' ] ) );

/* Canvas pages carry their own breadcrumb, related links and closing call; skip the template's. */
add_filter( 'render_block', function ( $html, $block ) {
	if ( in_array( $block['blockName'], [ 'shopinbos/breadcrumbs', 'shopinbos/related' ], true ) && is_singular() && has_block( 'shopinbos/canvas', get_queried_object_id() ) ) {
		return '';
	}
	return $html;
}, 10, 2 );
