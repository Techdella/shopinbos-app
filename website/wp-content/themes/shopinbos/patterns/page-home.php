<?php
/**
 * Title: Home page
 * Slug: shopinbos/page-home
 * Categories: shopinbos-pages
 * Description: The full shopinbos.com home page from the design canvas.
 * Post Types: page
 */
foreach ( array_keys( sib_canvas_parts() ) as $part ) {
	if ( str_starts_with( $part, 'home-' ) ) {
		echo '<!-- wp:shopinbos/canvas {"part":"' . esc_attr( $part ) . "\"} /-->\n\n";
	}
}
