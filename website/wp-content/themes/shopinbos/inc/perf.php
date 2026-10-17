<?php
/**
 * A last pass over every front-end page, so search and speed basics hold whatever template or block made it:
 *  - one H1 per page (later H1s, e.g. in hidden tabs, become H2)
 *  - every image has alt text (from the media library, a known name, or the file name)
 *  - images are served as WebP when a WebP copy exists (theme images, and uploads converted by
 *    `wp shopinbos setup`, which writes photo.jpg.webp next to photo.jpg)
 *  - images below the first few load lazily and decode off the main thread
 */

defined( 'ABSPATH' ) || exit;

add_action( 'template_redirect', function () {
	if ( is_admin() || is_feed() || wp_doing_ajax() || is_customize_preview() || ( defined( 'REST_REQUEST' ) && REST_REQUEST ) || isset( $_GET['sib_raw'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification
		return;
	}
	ob_start( 'sib_perf_html' );
}, 0 ); // before the marketplace pages, which print and exit

/** Alt text for well-known theme images, by file name (without extension). */
function sib_perf_known_alts(): array {
	return [
		'peggy'        => 'Peggy, the Shopinbos AI shop assistant',
		'peggy-wave'   => 'Peggy, the Shopinbos shop assistant, waving',
		'rex'          => 'Rex, the Shopinbos AI store builder',
		'rex-side'     => 'Rex, the Shopinbos AI store builder',
		'person-hero'  => 'Nigerian seller smiling with her phone, selling online with Shopinbos',
		'p-hero'       => 'Nigerian seller smiling with her phone, selling online with Shopinbos',
		'icon-white'   => 'Shopinbos',
		'logo-dark'    => 'Shopinbos logo',
		'logo-light'   => 'Shopinbos logo',
		'p-fashion'    => 'Fashion seller in Lagos showing an outfit',
		'p-food'       => 'Food products seller packing an order',
		'p-gadgets'    => 'Gadgets seller showing a phone',
		'p-ctal'       => 'Shopinbos seller',
		'p-ctar'       => 'Shopinbos seller',
		'launch'       => 'Shopinbos launch film',
	];
}

/** Local file for a site URL (theme or uploads), or ''. */
function sib_perf_path( string $url ): string {
	$url  = preg_replace( '/[?#].*$/', '', html_entity_decode( $url ) );
	$base = content_url();
	$rel  = '';
	if ( str_starts_with( $url, $base ) ) {
		$rel = substr( $url, strlen( $base ) );
	} elseif ( str_starts_with( $url, '/wp-content/' ) ) {
		$rel = substr( $url, strlen( '/wp-content' ) );
	}
	return $rel ? WP_CONTENT_DIR . $rel : '';
}

/** The WebP twin of an image URL when one exists on disk. */
function sib_perf_webp( string $url ): string {
	static $cache = [];
	if ( isset( $cache[ $url ] ) ) {
		return $cache[ $url ];
	}
	$out = $url;
	if ( preg_match( '/\.(png|jpe?g)(?=$|[?#])/i', $url ) && ( $path = sib_perf_path( $url ) ) ) {
		$twin = preg_replace( '/\.(png|jpe?g)$/i', '.webp', $path );
		if ( str_contains( $path, '/uploads/' ) ) {
			$twin = $path . '.webp';
		}
		if ( is_readable( $twin ) ) {
			$out = str_contains( $path, '/uploads/' ) ? preg_replace( '/(\.(png|jpe?g))(?=$|[?#])/i', '$1.webp', $url ) : preg_replace( '/\.(png|jpe?g)(?=$|[?#])/i', '.webp', $url );
		}
	}
	return $cache[ $url ] = $out;
}

/** Alt text from the file name: "leather-slides-300x300.webp" → "Leather slides". */
function sib_perf_alt( string $src ): string {
	$name = strtolower( pathinfo( (string) wp_parse_url( $src, PHP_URL_PATH ), PATHINFO_FILENAME ) );
	$name = preg_replace( '/(\.(png|jpe?g))$/', '', $name );
	$name = preg_replace( '/-\d+x\d+$|-scaled$|-e\d+$/', '', $name );
	$known = sib_perf_known_alts();
	if ( isset( $known[ $name ] ) ) {
		return $known[ $name ];
	}
	if ( $id = attachment_url_to_postid( preg_replace( '/-\d+x\d+(?=\.\w+$)/', '', preg_replace( '/\.webp$/', '', $src ) ) ) ) {
		$alt = trim( (string) get_post_meta( $id, '_wp_attachment_image_alt', true ) );
		if ( $alt ) {
			return $alt;
		}
	}
	$name = preg_replace( '/^(c|p|d|e|f|h|s)-/', '', $name );
	$name = trim( preg_replace( '/[-_]+/', ' ', $name ) );
	return $name && ! preg_match( '/^(img|image|photo|screenshot)?\s?\d*$/', $name ) ? ucfirst( $name ) : 'Shopinbos';
}

function sib_perf_html( string $html ): string {
	if ( stripos( $html, '<html' ) === false || stripos( $html, '</body>' ) === false ) {
		return $html;
	}
	// One H1.
	$n    = 0;
	$html = preg_replace_callback( '#<h1\b([^>]*)>(.*?)</h1>#is', function ( $m ) use ( &$n ) {
		return 1 === ++$n ? $m[0] : '<h2' . $m[1] . '>' . $m[2] . '</h2>';
	}, $html );

	// Images.
	$i    = 0;
	$html = preg_replace_callback( '#<img\b[^>]*>#i', function ( $m ) use ( &$i ) {
		$tag = $m[0];
		$i++;
		if ( preg_match( '/\ssrc="([^"]+)"/', $tag, $s ) ) {
			$src  = $s[1];
			$webp = sib_perf_webp( $src );
			if ( $webp !== $src ) {
				$tag = str_replace( 'src="' . $src . '"', 'src="' . $webp . '"', $tag );
			}
			if ( ! preg_match( '/\salt="[^"]+"/', $tag ) ) {
				$alt = esc_attr( sib_perf_alt( $src ) );
				$tag = preg_match( '/\salt=""/', $tag ) ? preg_replace( '/\salt=""/', ' alt="' . $alt . '"', $tag, 1 ) : preg_replace( '/^<img\b/i', '<img alt="' . $alt . '"', $tag );
			}
		}
		// Theme photos with smaller copies (photo-480.webp, photo-640.webp): let phones pick the small one.
		if ( ! str_contains( $tag, 'srcset=' ) && preg_match( '/\ssrc="([^"]+\/themes\/[^"]+)\.webp"/', $tag, $t ) && ( $path = sib_perf_path( $t[1] . '.webp' ) ) ) {
			$set = [];
			foreach ( [ 480, 640 ] as $w ) {
				if ( is_readable( substr( $path, 0, -5 ) . '-' . $w . '.webp' ) ) {
					$set[] = $t[1] . '-' . $w . '.webp ' . $w . 'w';
				}
			}
			if ( $set && ( $size = @getimagesize( $path ) ) ) { // phpcs:ignore WordPress.PHP.NoSilencedErrors
				$set[] = $t[1] . '.webp ' . $size[0] . 'w';
				$sizes = preg_match( '/\swidth="(\d+)"/', $tag, $wm ) && (int) $wm[1] < 400 ? (int) $wm[1] . 'px' : '(max-width: 700px) 92vw, 45vw';
				$tag   = preg_replace( '/^<img\b/i', '<img srcset="' . esc_attr( implode( ', ', $set ) ) . '" sizes="' . $sizes . '"', $tag );
			}
		}
		if ( preg_match( '/\ssrcset="([^"]+)"/', $tag, $ss ) ) {
			$set = preg_replace_callback( '/(\S+)(\s+\d+[wx])/', fn( $x ) => sib_perf_webp( $x[1] ) . $x[2], $ss[1] );
			$tag = str_replace( $ss[0], ' srcset="' . $set . '"', $tag );
		}
		if ( $i > 3 && ! preg_match( '/\sloading=/', $tag ) && ! str_contains( $tag, 'fetchpriority' ) ) {
			$tag = preg_replace( '/^<img\b/i', '<img loading="lazy"', $tag );
		}
		if ( ! preg_match( '/\sdecoding=/', $tag ) ) {
			$tag = preg_replace( '/^<img\b/i', '<img decoding="async"', $tag );
		}
		return $tag;
	}, $html );

	// Background images that point at PNG/JPG files.
	$html = preg_replace_callback( '#(url\(["\']?)([^"\')\s]+\.(?:png|jpe?g))#i', fn( $m ) => $m[1] . sib_perf_webp( $m[2] ), $html );
	return $html;
}
