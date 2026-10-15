<?php
/**
 * Helpers that print block markup for patterns. Core blocks are serialised exactly as the
 * editor would save them, so pages built from patterns open without "invalid block" warnings.
 */

defined( 'ABSPATH' ) || exit;

function sib_block_p( string $text, string $class = '' ): string {
	$attrs = $class ? wp_json_encode( [ 'className' => $class ] ) . ' ' : '';
	$cls   = $class ? ' class="' . esc_attr( $class ) . '"' : '';
	return "<!-- wp:paragraph {$attrs}-->\n<p{$cls}>{$text}</p>\n<!-- /wp:paragraph -->\n\n";
}

function sib_block_h( int $level, string $text, string $class = 'disp h2' ): string {
	$attrs = $class ? [ 'className' => $class ] : [];
	if ( 2 !== $level ) {
		$attrs = [ 'level' => $level ] + $attrs;
	}
	$json = $attrs ? wp_json_encode( $attrs ) . ' ' : '';
	return '<!-- wp:heading ' . $json . "-->\n<h{$level} class=\"" . esc_attr( trim( 'wp-block-heading ' . $class ) ) . "\">{$text}</h{$level}>\n<!-- /wp:heading -->\n\n";
}

/** A row of core/button blocks. $buttons: [label, url, style] where style is accent|ink|ghost|forest|glass. */
function sib_block_buttons( array $buttons, string $justify = '' ): string {
	$layout = [ 'type' => 'flex' ];
	if ( $justify ) {
		$layout['justifyContent'] = $justify;
	}
	$out = '<!-- wp:buttons ' . wp_json_encode( [ 'layout' => $layout ] ) . " -->\n<div class=\"wp-block-buttons\">";
	foreach ( $buttons as $i => [ $label, $url, $style ] ) {
		$cls  = 'is-style-' . $style;
		$out .= ( $i ? "\n\n" : '' ) . '<!-- wp:button ' . wp_json_encode( [ 'className' => $cls ] ) . " -->\n"
			. '<div class="wp-block-button ' . esc_attr( $cls ) . '"><a class="wp-block-button__link wp-element-button" href="' . esc_url( $url ) . '">' . $label . "</a></div>\n<!-- /wp:button -->";
	}
	return $out . "</div>\n<!-- /wp:buttons -->\n\n";
}

/** Opening/closing markup for a core/group. */
function sib_block_group_open( string $class, string $tag = 'div', array $padding = [] ): string {
	$attrs = [];
	if ( 'div' !== $tag ) {
		$attrs['tagName'] = $tag;
	}
	$attrs['className'] = $class;
	$style              = '';
	if ( $padding ) {
		$attrs['style'] = [ 'spacing' => [ 'padding' => $padding ] ];
		$order          = [ 'top', 'right', 'bottom', 'left' ];
		foreach ( $order as $side ) {
			if ( isset( $padding[ $side ] ) ) {
				$style .= "padding-{$side}:{$padding[$side]};";
			}
		}
		$style = ' style="' . rtrim( $style, ';' ) . '"';
	}
	$attrs['layout'] = [ 'type' => 'default' ];
	return '<!-- wp:group ' . wp_json_encode( $attrs ) . " -->\n<{$tag} class=\"wp-block-group " . esc_attr( $class ) . "\"{$style}>";
}

function sib_block_group_close( string $tag = 'div' ): string {
	return "</{$tag}>\n<!-- /wp:group -->\n\n";
}

/** Eyebrow + heading on the left, short text (or a button) on the right. */
function sib_block_sec_head( string $eyebrow, string $title, string $text = '', array $button = [], string $text_class = 'p' ): string {
	$out  = sib_block_group_open( 'sec-head' );
	$out .= sib_block_group_open( 'col' ) . sib_block_p( $eyebrow, 'eyebrow' ) . sib_block_h( 2, $title ) . sib_block_group_close();
	if ( $text ) {
		$out .= sib_block_p( $text, $text_class );
	}
	if ( $button ) {
		$out .= sib_block_buttons( [ $button ] );
	}
	return $out . sib_block_group_close();
}

function sib_block_html( string $html ): string {
	return "<!-- wp:html -->\n" . trim( $html ) . "\n<!-- /wp:html -->\n\n";
}
