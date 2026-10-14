<?php
/**
 * Shopinbos block theme.
 *
 * The theme owns the look: tokens (theme.json), styles, patterns, templates, header and footer.
 * Data and behaviour (marketplace pages, tools, forms, schema, sign-up links) live in the
 * shopinbos-core plugin. Theme functions are prefixed sib_theme_.
 */

defined( 'ABSPATH' ) || exit;

define( 'SIB_THEME_VERSION', '1.0.0' );

require_once __DIR__ . '/inc/icons.php';
require_once __DIR__ . '/inc/chrome.php';
require_once __DIR__ . '/inc/canvas.php';
require_once __DIR__ . '/inc/pattern-helpers.php';

add_action( 'after_setup_theme', function () {
	add_theme_support( 'wp-block-styles' );
	add_theme_support( 'editor-styles' );
	add_theme_support( 'responsive-embeds' );
	add_theme_support( 'post-thumbnails' );
	add_editor_style( [ 'assets/css/site.css', 'assets/css/canvas.css' ] );
	register_nav_menus( [
		'primary'        => __( 'Main menu', 'shopinbos' ),
		'footer_sell'    => __( 'Footer: Sell', 'shopinbos' ),
		'footer_join'    => __( 'Footer: Join', 'shopinbos' ),
		'footer_company' => __( 'Footer: Learn', 'shopinbos' ),
		'footer_legal'   => __( 'Footer: Legal', 'shopinbos' ),
	] );
} );

/**
 * Root-relative URL of a file in the theme's assets/img folder. Root-relative so pattern content
 * saved into pages keeps working when the site moves from staging to production.
 */
function sib_theme_img( string $file ): string {
	return esc_url( (string) wp_parse_url( get_theme_file_uri( 'assets/img/' . $file ), PHP_URL_PATH ) );
}

add_action( 'wp_enqueue_scripts', function () {
	$css = get_theme_file_path( 'assets/css/site.css' );
	$js  = get_theme_file_path( 'assets/js/site.js' );
	wp_enqueue_style( 'sib-site', get_theme_file_uri( 'assets/css/site.css' ), [], SIB_THEME_VERSION . '.' . filemtime( $css ) );
	wp_enqueue_style( 'sib-canvas', get_theme_file_uri( 'assets/css/canvas.css' ), [ 'sib-site' ], SIB_THEME_VERSION . '.' . filemtime( get_theme_file_path( 'assets/css/canvas.css' ) ) );
	wp_enqueue_script( 'sib-site', get_theme_file_uri( 'assets/js/site.js' ), [], SIB_THEME_VERSION . '.' . filemtime( $js ), [ 'strategy' => 'defer', 'in_footer' => true ] );
} );

/* Preload the two fonts every page uses above the fold. */
add_action( 'wp_head', function () {
	foreach ( [ 'plus-jakarta-sans-latin.woff2', 'bricolage-grotesque-latin.woff2' ] as $font ) {
		printf( '<link rel="preload" href="%s" as="font" type="font/woff2" crossorigin>' . "\n", esc_url( get_theme_file_uri( 'assets/fonts/' . $font ) ) );
	}
}, 2 );

/* Speed: drop things we never use on the front end. */
add_action( 'init', function () {
	remove_action( 'wp_head', 'print_emoji_detection_script', 7 );
	remove_action( 'wp_print_styles', 'print_emoji_styles' );
	remove_action( 'admin_print_scripts', 'print_emoji_detection_script' );
	remove_action( 'admin_print_styles', 'print_emoji_styles' );
	remove_action( 'wp_head', 'wp_generator' );
	remove_action( 'wp_head', 'wlwmanifest_link' );
	remove_action( 'wp_head', 'rsd_link' );
} );
add_filter( 'should_load_separate_core_block_assets', '__return_true' );

/* Button styles that match the prototype's .btn variants. */
add_action( 'init', function () {
	$styles = [
		'accent' => __( 'Orange', 'shopinbos' ),
		'ink'    => __( 'Ink', 'shopinbos' ),
		'ghost'  => __( 'Outline', 'shopinbos' ),
		'forest' => __( 'Forest (Rex)', 'shopinbos' ),
		'glass'  => __( 'Glass (on dark)', 'shopinbos' ),
	];
	foreach ( $styles as $name => $label ) {
		register_block_style( 'core/button', [ 'name' => $name, 'label' => $label ] );
	}
	register_block_style( 'core/group', [ 'name' => 'card', 'label' => __( 'Card', 'shopinbos' ) ] );
	register_block_style( 'core/table', [ 'name' => 'compare', 'label' => __( 'Comparison', 'shopinbos' ) ] );
	register_block_style( 'core/quote', [ 'name' => 'seller', 'label' => __( 'Seller quote', 'shopinbos' ) ] );

	register_block_pattern_category( 'shopinbos-pages', [ 'label' => __( 'Shopinbos: full pages', 'shopinbos' ) ] );
	register_block_pattern_category( 'shopinbos-sections', [ 'label' => __( 'Shopinbos: sections', 'shopinbos' ) ] );
	register_block_pattern_category( 'shopinbos-content', [ 'label' => __( 'Shopinbos: content blocks', 'shopinbos' ) ] );
} );

/* Writers build pages from our patterns; hide the core and remote pattern libraries. */
add_action( 'after_setup_theme', function () {
	remove_theme_support( 'core-block-patterns' );
} );
add_filter( 'should_load_remote_block_patterns', '__return_false' );
