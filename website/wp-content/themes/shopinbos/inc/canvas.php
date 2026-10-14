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
