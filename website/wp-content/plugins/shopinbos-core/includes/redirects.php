<?php
/**
 * 301 redirects for URLs from the old site that now live somewhere else. They only run when the old URL
 * would otherwise be a 404, so a page created at one of these addresses always wins.
 * Add more with the sib_redirects filter: [ '/old/path/' => '/new/path/' ].
 */

defined( 'ABSPATH' ) || exit;

function sib_redirects(): array {
	return apply_filters( 'sib_redirects', [
		'/legal/privacy-2/'       => '/legal/privacy/',
		'/legal/terms-2/'         => '/legal/terms/',
		'/legal/cookies-2/'       => '/legal/cookies/',
		'/partners/agencies-2/'   => '/partners/agencies/',
		'/legal/ndpr/'            => '/legal/data-protection/',
		'/blog/bakery-40-orders-a-day/' => '/blog/snack-brand-40-orders-a-day/',
		'/privacy-policy/'        => '/legal/privacy/',
		'/cookie-policy/'         => '/legal/cookies/',
		'/ndpr-compliance/'       => '/legal/data-protection/',
		'/privacy/'               => '/legal/privacy/',
		'/terms/'                 => '/legal/terms/',
		'/partners/logistics/'    => '/delivery/',
		'/partners/logistics-2/'  => '/delivery/',
		'/partners/supplier/'     => '/for-suppliers/',
		'/partners/supplier-2/'   => '/for-suppliers/',
		'/ecommerce-partnerships/' => '/partners/',
		'/status/'                => '/help/',
		'/coming-soon/'           => '/waitlist/',
		'/solutions/fashion-apparel/' => '/solutions/fashion/',
	] );
}

add_action( 'template_redirect', function () {
	if ( ! is_404() ) {
		return;
	}
	$path = trailingslashit( (string) wp_parse_url( $_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH ) );
	$map  = sib_redirects();
	$to   = $map[ $path ] ?? null;
	// Comparison articles moved from the blog to /compare/.
	if ( ! $to && preg_match( '#^/blog/([^/]+)/$#', $path, $m ) ) {
		$cmp = get_page_by_path( $m[1], OBJECT, 'sib_comparison' );
		if ( $cmp && 'sib_comparison' === $cmp->post_type && 'publish' === $cmp->post_status ) {
			$to = get_permalink( $cmp );
		}
	}
	if ( $to ) {
		$query = (string) wp_parse_url( $_SERVER['REQUEST_URI'] ?? '', PHP_URL_QUERY );
		$url   = str_starts_with( $to, 'http' ) ? $to : home_url( $to );
		wp_safe_redirect( $url . ( $query ? '?' . $query : '' ), 301, 'Shopinbos' );
		exit;
	}
}, 1 );

/** URL bases that belong to the site's own sections (archives and canvas pages). WordPress must never guess these
 *  away to another page: an old page once called "templates", or a 404 guess, used to send /templates/ elsewhere. */
function sib_reserved_paths(): array {
	$paths = [ '/templates/', '/tools/', '/resources/', '/compare/', '/features/', '/solutions/', '/help/', '/academy/', '/gist/', '/blog/', '/investors/', '/trending/' ];
	return (array) apply_filters( 'sib_reserved_paths', $paths );
}

function sib_is_reserved_request(): bool {
	$path = trailingslashit( (string) wp_parse_url( $_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH ) );
	return in_array( $path, sib_reserved_paths(), true );
}

add_filter( 'old_slug_redirect_url', fn( $url ) => sib_is_reserved_request() ? false : $url );
add_filter( 'redirect_canonical', fn( $url ) => sib_is_reserved_request() ? false : $url );
add_filter( 'do_redirect_guess_404_permalink', fn( $guess ) => sib_is_reserved_request() ? false : $guess );
