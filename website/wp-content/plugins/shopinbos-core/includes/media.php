<?php
/**
 * Images: new uploads get WebP sizes, and `wp shopinbos setup` gives older JPG/PNG uploads a WebP twin
 * (photo.jpg → photo.jpg.webp, the theme serves it) and fills empty alt text from the image's title.
 */

defined( 'ABSPATH' ) || exit;

/* New uploads: WordPress writes the resized copies as WebP. */
add_filter( 'image_editor_output_format', function ( $formats ) {
	$formats['image/jpeg'] = 'image/webp';
	$formats['image/png']  = 'image/webp';
	return $formats;
} );

/* New uploads: alt text from the file name when none is given ("ankara-maxi-dress.jpg" → "Ankara maxi dress"). */
add_action( 'add_attachment', function ( $id ) {
	if ( wp_attachment_is_image( $id ) && '' === (string) get_post_meta( $id, '_wp_attachment_image_alt', true ) ) {
		update_post_meta( $id, '_wp_attachment_image_alt', sib_media_alt_from( get_the_title( $id ) ) );
	}
} );

function sib_media_alt_from( string $title ): string {
	$t = trim( preg_replace( '/[-_]+/', ' ', preg_replace( '/-\d+x\d+$|-scaled$/', '', $title ) ) );
	return $t && ! preg_match( '/^(img|image|photo|screenshot|whatsapp image)?\s?[\d\s.]*$/i', $t ) ? ucfirst( $t ) : 'Shopinbos';
}

/** Setup: WebP twins for JPG/PNG uploads and their sizes, and alt text where empty. Returns [converted, alts]. */
function sib_media_optimise( int $limit = 2000 ): array {
	$ids  = get_posts( [ 'post_type' => 'attachment', 'post_mime_type' => [ 'image/jpeg', 'image/png' ], 'post_status' => 'inherit', 'numberposts' => $limit, 'fields' => 'ids' ] );
	$made = 0;
	foreach ( $ids as $id ) {
		$file = get_attached_file( $id );
		if ( ! $file || ! is_readable( $file ) ) {
			continue;
		}
		$files = [ $file ];
		$meta  = wp_get_attachment_metadata( $id );
		foreach ( (array) ( $meta['sizes'] ?? [] ) as $size ) {
			if ( ! empty( $size['file'] ) && preg_match( '/\.(jpe?g|png)$/i', $size['file'] ) ) {
				$files[] = dirname( $file ) . '/' . $size['file'];
			}
		}
		if ( ! empty( $meta['original_image'] ) ) {
			$files[] = dirname( $file ) . '/' . $meta['original_image'];
		}
		foreach ( array_unique( $files ) as $f ) {
			$twin = $f . '.webp';
			if ( ! is_readable( $f ) || ( is_readable( $twin ) && filemtime( $twin ) >= filemtime( $f ) ) ) {
				continue;
			}
			$ed = wp_get_image_editor( $f );
			if ( is_wp_error( $ed ) ) {
				continue;
			}
			$ed->set_quality( 80 );
			$res = $ed->save( $twin, 'image/webp' );
			if ( ! is_wp_error( $res ) && is_readable( $twin ) ) {
				if ( filesize( $twin ) >= filesize( $f ) ) {
					wp_delete_file( $twin ); // keep the original when WebP isn't smaller
				} else {
					$made++;
				}
			}
		}
	}
	$alts = 0;
	foreach ( get_posts( [ 'post_type' => 'attachment', 'post_mime_type' => 'image', 'post_status' => 'inherit', 'numberposts' => $limit, 'fields' => 'ids' ] ) as $id ) {
		if ( '' === trim( (string) get_post_meta( $id, '_wp_attachment_image_alt', true ) ) ) {
			$parent = (int) wp_get_post_parent_id( $id );
			$alt    = sib_media_alt_from( get_the_title( $id ) );
			if ( 'Shopinbos' === $alt && $parent ) {
				$alt = get_the_title( $parent );
			}
			update_post_meta( $id, '_wp_attachment_image_alt', $alt );
			$alts++;
		}
	}
	return [ $made, $alts ];
}
