<?php
/**
 * Marketplace pages rendered on the server from the app's public API, so Google sees full HTML:
 *
 *   /marketplace/                      all products (search with ?q=, pages with ?pg=)
 *   /marketplace/{category}/           one category
 *   /marketplace/products/{slug}/      product (dropship or wholesale)
 *   /suppliers/{slug}/                 supplier and their products
 *   /delivery/partners/{slug}/         delivery partner
 *
 * The app is the single source of truth; WordPress only reads and displays.
 */

defined( 'ABSPATH' ) || exit;

/** Delivery fee used in the product page example ("your customer pays, with ₦2,500 delivery"). */
function sib_example_delivery_fee(): int {
	return (int) apply_filters( 'sib_example_delivery_fee', 2500 );
}

function sib_marketplace_rewrite_rules(): void {
	add_rewrite_rule( '^marketplace/?$', 'index.php?sib_mp=index', 'top' );
	add_rewrite_rule( '^marketplace/products/([^/]+)/?$', 'index.php?sib_mp=product&sib_slug=$matches[1]', 'top' );
	add_rewrite_rule( '^marketplace/(?!products/?$)([^/]+)/?$', 'index.php?sib_mp=category&sib_slug=$matches[1]', 'top' );
	add_rewrite_rule( '^suppliers/?$', 'index.php?sib_mp=suppliers', 'top' );
	add_rewrite_rule( '^suppliers/([^/]+)/?$', 'index.php?sib_mp=supplier&sib_slug=$matches[1]', 'top' );
	add_rewrite_rule( '^delivery/partners/?$', 'index.php?sib_mp=partners', 'top' );
	add_rewrite_rule( '^delivery/partners/([^/]+)/?$', 'index.php?sib_mp=partner&sib_slug=$matches[1]', 'top' );
}
add_action( 'init', 'sib_marketplace_rewrite_rules' );
add_filter( 'query_vars', fn( $v ) => array_merge( $v, [ 'sib_mp', 'sib_slug' ] ) );

/* Our routes are real pages: don't let WordPress call them 404s, and skip the posts query. */
add_filter( 'pre_handle_404', fn( $handled, $q ) => $q->get( 'sib_mp' ) ? true : $handled, 10, 2 );
add_filter( 'posts_pre_query', fn( $posts, $q ) => $q->is_main_query() && $q->get( 'sib_mp' ) ? [] : $posts, 10, 2 );
add_filter( 'redirect_canonical', fn( $url ) => get_query_var( 'sib_mp' ) ? false : $url );

/* ---------- View models: API rows → what the templates print ---------- */

function sib_product_vm( array $p ): array {
	$cost     = (float) ( $p['wholesalePrice'] ?? 0 );
	$sell     = isset( $p['suggestedRetailPrice'] ) && $p['suggestedRetailPrice'] ? (float) $p['suggestedRetailPrice'] : null;
	$currency = (string) ( $p['currency'] ?? 'NGN' );
	$keep     = $sell ? $sell - $cost - sib_paystack_fee( $sell + sib_example_delivery_fee() ) : null;
	$tiers    = [];
	foreach ( (array) ( $p['pricingTiers'] ?? [] ) as $t ) {
		if ( isset( $t['minQty'], $t['price'] ) ) {
			$tiers[] = [ 'min' => (int) $t['minQty'], 'max' => isset( $t['maxQty'] ) ? (int) $t['maxQty'] : null, 'price' => (float) $t['price'] ];
		}
	}
	usort( $tiers, fn( $a, $b ) => $a['min'] <=> $b['min'] );
	$supplier = (array) ( $p['supplier'] ?? [] );
	$stock    = isset( $p['stockQuantity'] ) ? (int) $p['stockQuantity'] : null;
	return [
		'name'        => (string) ( $p['name'] ?? '' ),
		'slug'        => (string) ( $p['slug'] ?? '' ),
		'url'         => home_url( '/marketplace/products/' . rawurlencode( (string) ( $p['slug'] ?? '' ) ) . '/' ),
		'description' => (string) ( $p['description'] ?? '' ),
		'images'      => array_values( array_filter( (array) ( $p['images'] ?? [] ), 'is_string' ) ),
		'img'         => (string) ( ( $p['images'] ?? [] )[0] ?? '' ),
		'currency'    => $currency,
		'cost'        => $cost,
		'sell'        => $sell,
		'keep'        => $keep,
		'cost_t'      => sib_money( $cost, $currency ),
		'sell_t'      => $sell ? sib_money( $sell, $currency ) : '',
		'keep_t'      => null !== $keep ? sib_money( $keep, $currency ) : '',
		'tiers'       => $tiers,
		'moq'         => (int) ( $p['moq'] ?? 1 ),
		'stock'       => $stock,
		'in_stock'    => null === $stock || $stock > 0,
		'ships'       => (string) ( $p['processingTime'] ?? '' ),
		'dropship'    => ! empty( $p['dropshipAvailable'] ),
		'bulk'        => ! empty( $p['bulkOrderAvailable'] ) || (bool) $tiers,
		'regions'     => (array) ( $p['deliveryRegions'] ?? [] ),
		'sup_name'    => (string) ( $supplier['displayName'] ?? $supplier['businessName'] ?? '' ),
		'sup_slug'    => (string) ( $supplier['slug'] ?? '' ),
		'sup_loc'     => (string) ( $supplier['city'] ?? '' ),
		'sup_rating'  => isset( $supplier['rating'] ) ? number_format( (float) $supplier['rating'], 1 ) : '',
		'sup_raw'     => $supplier,
		'category'    => (array) ( $p['category'] ?? [] ),
		'created'     => (string) ( $p['createdAt'] ?? '' ),
	];
}

function sib_supplier_vm( array $s ): array {
	return [
		'name'     => (string) ( $s['displayName'] ?? $s['businessName'] ?? '' ),
		'slug'     => (string) ( $s['slug'] ?? '' ),
		'url'      => home_url( '/suppliers/' . rawurlencode( (string) ( $s['slug'] ?? '' ) ) . '/' ),
		'about'    => (string) ( $s['description'] ?? '' ),
		'loc'      => (string) ( $s['city'] ?? '' ),
		'rating'   => isset( $s['rating'] ) && $s['rating'] ? number_format( (float) $s['rating'], 1 ) : '',
		'reviews'  => (int) ( $s['ratingCount'] ?? 0 ),
		'reply'    => (string) ( $s['responseTimeLabel'] ?? '' ),
		'img'      => (string) ( $s['bannerUrl'] ?? $s['logoUrl'] ?? '' ),
		'logo'     => (string) ( $s['logoUrl'] ?? '' ),
		'cats'     => (array) ( $s['categories'] ?? [] ),
		'count'    => (int) ( $s['_count']['products'] ?? 0 ),
		'products' => array_map( 'sib_product_vm', (array) ( $s['products'] ?? [] ) ),
	];
}

/** Delivery partners mark pay-on-delivery support with one of these delivery types. */
function sib_partner_cod( array $types ): bool {
	return (bool) array_intersect( array_map( 'strtolower', $types ), [ 'cod', 'pay_on_delivery', 'cash_on_delivery' ] );
}

function sib_partner_vm( array $l ): array {
	$zones = array_values( array_filter( (array) ( $l['coverageZones'] ?? [] ), 'is_string' ) );
	return [
		'name'    => (string) ( $l['displayName'] ?? $l['companyName'] ?? '' ),
		'slug'    => (string) ( $l['slug'] ?? '' ),
		'url'     => home_url( '/delivery/partners/' . rawurlencode( (string) ( $l['slug'] ?? '' ) ) . '/' ),
		'about'   => (string) ( $l['description'] ?? '' ),
		'city'    => (string) ( $l['city'] ?? '' ),
		'speed'   => (string) ( $l['estimatedSpeed'] ?? '' ),
		'zones'   => $zones,
		'zone_keys' => array_map( 'sanitize_title', $zones ),
		'vehicles'  => (array) ( $l['vehicleTypes'] ?? [] ),
		'types'     => array_values( array_map( fn( $t ) => ucfirst( str_replace( '_', ' ', (string) $t ) ), array_filter( (array) ( $l['deliveryTypes'] ?? [] ), fn( $t ) => ! sib_partner_cod( [ (string) $t ] ) ) ) ),
		'cod'       => sib_partner_cod( (array) ( $l['deliveryTypes'] ?? [] ) ),
		'price_t'   => isset( $l['basePrice'] ) && $l['basePrice'] ? sib_money( $l['basePrice'] ) : '',
		'rating'    => isset( $l['rating'] ) && $l['rating'] ? number_format( (float) $l['rating'], 1 ) : '',
		'reviews'   => (int) ( $l['ratingCount'] ?? 0 ),
		'reliability' => isset( $l['reliabilityScore'] ) ? (int) round( (float) $l['reliabilityScore'] ) : null,
		'logo'      => (string) ( $l['logoUrl'] ?? '' ),
	];
}

/** Human labels for coverage zone slugs, with the prototype's areas first. */
function sib_zone_label( string $key ): string {
	$known = [ 'lagos' => 'Lagos', 'abuja' => 'Abuja', 'ibadan' => 'Ibadan', 'port-harcourt' => 'Port Harcourt', 'kano' => 'Kano', 'enugu' => 'Enugu', 'nationwide' => 'Other states', 'states' => 'Other states' ];
	return $known[ $key ] ?? ucwords( str_replace( '-', ' ', $key ) );
}

/* ---------- Request handling ---------- */

/** Context for the current virtual page, read by SEO, schema and breadcrumbs. */
function sib_virtual(): ?array {
	return $GLOBALS['sib_virtual'] ?? null;
}

add_action( 'template_redirect', function () {
	$route = get_query_var( 'sib_mp' );
	if ( ! $route ) {
		return;
	}
	$slug = sanitize_title( (string) get_query_var( 'sib_slug' ) );
	$ctx  = sib_marketplace_context( (string) $route, $slug );
	$GLOBALS['sib_virtual'] = $ctx;

	if ( ! empty( $ctx['redirect'] ) ) {
		wp_safe_redirect( $ctx['redirect'], 301 );
		exit;
	}
	status_header( $ctx['status'] );
	if ( 503 === $ctx['status'] ) {
		header( 'Retry-After: 300' );
	}
	if ( $ctx['status'] >= 400 ) {
		nocache_headers();
	}
	add_filter( 'pre_get_document_title', fn() => $ctx['title'] . ' | Shopinbos' );
	add_filter( 'body_class', fn( $c ) => array_merge( array_diff( $c, [ 'error404', 'home', 'blog' ] ), [ 'sib-virtual', 'sib-' . $ctx['view'] ] ) );

	echo sib_view( 'layout', [ 'ctx' => $ctx ] ); // phpcs:ignore WordPress.Security.EscapeOutput
	exit;
} );

/**
 * Fetch data for a route and decide status, title, description, canonical and breadcrumbs.
 */
function sib_marketplace_context( string $route, string $slug ): array {
	$page = max( 1, (int) ( $_GET['pg'] ?? 1 ) ); // phpcs:ignore WordPress.Security.NonceVerification
	$q    = isset( $_GET['q'] ) ? mb_substr( sanitize_text_field( wp_unslash( (string) $_GET['q'] ) ), 0, 100 ) : ''; // phpcs:ignore
	$mkt  = [ __( 'Find stock', 'shopinbos' ), home_url( '/marketplace/' ) ];
	$ctx  = [ 'route' => $route, 'slug' => $slug, 'status' => 200, 'noindex' => false, 'crumbs' => [], 'stale' => false, 'prices_hidden' => false ];

	switch ( $route ) {
		case 'index':
		case 'category':
			$cats     = sib_api_get( '/categories', [ 'rootOnly' => 'true' ] );
			$category = null;
			if ( 'category' === $route ) {
				foreach ( (array) ( $cats['data'] ?? [] ) as $c ) {
					if ( ( $c['slug'] ?? '' ) === $slug ) {
						$category = $c;
					}
				}
				if ( ! $category && $cats['ok'] ) {
					$one      = sib_api_get( '/categories/' . $slug );
					$category = $one['ok'] ? $one['data'] : null;
				}
				if ( ! $category ) {
					return sib_not_found( $ctx, $cats['ok'] ? 404 : 503 );
				}
			}
			$query = array_filter( [ 'page' => $page, 'limit' => 24, 'sort' => 'trending', 'category' => $category['slug'] ?? null, 'q' => $q ?: null ] );
			$res   = sib_api_get( '/products', $query );
			if ( ! $res['ok'] && 503 === $res['status'] ) {
				return sib_not_found( $ctx, 503 );
			}
			$name = $category['name'] ?? '';
			$base = $category ? home_url( '/marketplace/' . $category['slug'] . '/' ) : home_url( '/marketplace/' );
			return array_merge( $ctx, [
				'view'          => 'marketplace',
				'title'         => $name ? sprintf( __( '%s to sell online, from suppliers in Nigeria', 'shopinbos' ), $name ) : __( 'Find stock: products to dropship or buy wholesale in Nigeria', 'shopinbos' ),
				'h1'            => $name ? sprintf( __( '%s you can sell today', 'shopinbos' ), $name ) : __( 'Products you can sell today, from suppliers in Nigeria', 'shopinbos' ),
				'description'   => __( 'Dropship with no stock, or buy wholesale at lower prices. Every supplier is checked, and you’re paid only after your customer has their order.', 'shopinbos' ),
				'canonical'     => $page > 1 ? add_query_arg( 'pg', $page, $base ) : $base,
				'noindex'       => '' !== $q,
				'crumbs'        => $category ? [ $mkt, [ $name, $base ] ] : [ $mkt ],
				'category'      => $category,
				'categories'    => (array) ( $cats['data'] ?? [] ),
				'products'      => array_map( 'sib_product_vm', (array) ( $res['data'] ?? [] ) ),
				'total'         => (int) ( $res['meta']['total'] ?? 0 ),
				'page'          => $page,
				'pages'         => (int) ceil( ( $res['meta']['total'] ?? 0 ) / 24 ),
				'q'             => $q,
				'base'          => $base,
				'stale'         => $res['stale'],
				'prices_hidden' => $res['prices_hidden'],
			] );

		case 'product':
			$res = sib_api_get( '/products/' . $slug );
			if ( ! $res['ok'] ) {
				return sib_not_found( $ctx, 404 === $res['status'] ? ( sib_sitemap_knew( 'product', $slug ) ? 410 : 404 ) : 503 );
			}
			$p    = sib_product_vm( $res['data'] );
			$cat  = $p['category'];
			$more = [];
			if ( ! empty( $cat['slug'] ) ) {
				$rel  = sib_api_get( '/products', [ 'category' => $cat['slug'], 'limit' => 8, 'sort' => 'trending' ] );
				$more = array_values( array_filter( array_map( 'sib_product_vm', (array) ( $rel['data'] ?? [] ) ), fn( $m ) => $m['slug'] !== $slug ) );
			}
			if ( count( $more ) < 4 ) { // fill up with trending products from other categories
				$top  = sib_api_get( '/products', [ 'limit' => 8, 'sort' => 'trending' ] );
				$have = array_merge( [ $slug ], array_column( $more, 'slug' ) );
				foreach ( array_map( 'sib_product_vm', (array) ( $top['data'] ?? [] ) ) as $m ) {
					if ( ! in_array( $m['slug'], $have, true ) ) {
						$more[] = $m;
					}
				}
			}
			$more = array_slice( $more, 0, 4 );
			$crumbs = [ $mkt ];
			if ( ! empty( $cat['slug'] ) ) {
				$crumbs[] = [ $cat['name'], home_url( '/marketplace/' . $cat['slug'] . '/' ) ];
			}
			$crumbs[] = [ $p['name'], $p['url'] ];
			return array_merge( $ctx, [
				'view'          => 'product',
				'title'         => sprintf( __( '%1$s: dropship or buy wholesale from %2$s', 'shopinbos' ), $p['name'], $p['sup_name'] ),
				'description'   => wp_trim_words( $p['description'] ?: sprintf( __( 'Sell %1$s in your store with no stock, or buy wholesale from %2$s in %3$s.', 'shopinbos' ), $p['name'], $p['sup_name'], $p['sup_loc'] ), 30 ),
				'canonical'     => $p['url'],
				'crumbs'        => $crumbs,
				'product'       => $p,
				'more'          => $more,
				'image'         => $p['img'],
				'stale'         => $res['stale'],
				'prices_hidden' => $res['prices_hidden'],
			] );

		case 'suppliers':
			$res = sib_api_get( '/suppliers', [ 'limit' => 48, 'page' => $page ] );
			if ( ! $res['ok'] ) {
				return sib_not_found( $ctx, 503 );
			}
			return array_merge( $ctx, [
				'view'        => 'suppliers',
				'title'       => __( 'Checked suppliers you can sell from', 'shopinbos' ),
				'h1'          => __( 'Suppliers on Shopinbos', 'shopinbos' ),
				'description' => __( 'Nigerian manufacturers and wholesalers whose products you can dropship or buy in bulk.', 'shopinbos' ),
				'canonical'   => home_url( '/suppliers/' ),
				'crumbs'      => [ $mkt, [ __( 'Suppliers', 'shopinbos' ), home_url( '/suppliers/' ) ] ],
				'suppliers'   => array_map( 'sib_supplier_vm', (array) $res['data'] ),
				'stale'       => $res['stale'],
			] );

		case 'supplier':
			$res = sib_api_get( '/suppliers/' . $slug );
			if ( ! $res['ok'] ) {
				return sib_not_found( $ctx, 404 === $res['status'] ? ( sib_sitemap_knew( 'supplier', $slug ) ? 410 : 404 ) : 503 );
			}
			$s = sib_supplier_vm( $res['data'] );
			return array_merge( $ctx, [
				'view'          => 'supplier',
				'title'         => sprintf( __( '%1$s, %2$s: products to sell in your store', 'shopinbos' ), $s['name'], $s['loc'] ),
				'description'   => wp_trim_words( $s['about'] ?: sprintf( __( 'Dropship or buy wholesale from %1$s in %2$s on Shopinbos.', 'shopinbos' ), $s['name'], $s['loc'] ), 30 ),
				'canonical'     => $s['url'],
				'crumbs'        => [ $mkt, [ __( 'Suppliers', 'shopinbos' ), home_url( '/suppliers/' ) ], [ $s['name'], $s['url'] ] ],
				'supplier'      => $s,
				'image'         => $s['img'],
				'stale'         => $res['stale'],
				'prices_hidden' => $res['prices_hidden'],
			] );

		case 'partners':
			return array_merge( $ctx, [ 'redirect' => home_url( '/delivery/' ) ] );

		case 'partner':
			$res = sib_api_get( '/logistics/partners/' . $slug );
			if ( ! $res['ok'] ) {
				return sib_not_found( $ctx, 404 === $res['status'] ? ( sib_sitemap_knew( 'partner', $slug ) ? 410 : 404 ) : 503 );
			}
			$l = sib_partner_vm( $res['data'] );
			return array_merge( $ctx, [
				'view'          => 'partner',
				'title'         => sprintf( __( '%s: delivery for online shops', 'shopinbos' ), $l['name'] ),
				'description'   => wp_trim_words( $l['about'] ?: sprintf( __( 'Book %1$s for deliveries from your Shopinbos store. %2$s', 'shopinbos' ), $l['name'], $l['speed'] ), 30 ),
				'canonical'     => $l['url'],
				'crumbs'        => [ [ __( 'Delivery', 'shopinbos' ), home_url( '/delivery/' ) ], [ $l['name'], $l['url'] ] ],
				'partner'       => $l,
				'stale'         => $res['stale'],
				'prices_hidden' => $res['prices_hidden'],
			] );
	}
	return sib_not_found( $ctx, 404 );
}

function sib_not_found( array $ctx, int $status ): array {
	$titles = [
		404 => __( 'We couldn’t find that', 'shopinbos' ),
		410 => __( 'This is no longer on Shopinbos', 'shopinbos' ),
		503 => __( 'The marketplace is taking a short break', 'shopinbos' ),
	];
	return array_merge( $ctx, [
		'view'        => 'unavailable',
		'status'      => $status,
		'noindex'     => true,
		'title'       => $titles[ $status ] ?? $titles[404],
		'description' => '',
		'canonical'   => '',
		'crumbs'      => [ [ __( 'Find stock', 'shopinbos' ), home_url( '/marketplace/' ) ] ],
	] );
}
