<?php
/**
 * Sample marketplace data from the website prototype, shaped exactly like the app's public API.
 * Only used when "Use sample marketplace data" is on, or no API base is set (local and staging).
 */

defined( 'ABSPATH' ) || exit;

function sib_demo_data(): array {
	static $data = null;
	if ( null !== $data ) {
		return $data;
	}
	$suppliers = [
		'aba-leatherworks'     => [ 'Aba Leatherworks', 'Aba, Abia', 'Leather slides, lace-ups and bags', 4.8, 'fashion', 'leather-slides.webp' ],
		'mama-tola-textiles'   => [ 'Mama Tola Textiles', 'Yaba, Lagos', 'Two-piece sets, blazers, ready-to-wear', 4.9, 'fashion', 'linen-set.webp' ],
		'computer-village-hub' => [ 'Computer Village Hub', 'Ikeja, Lagos', 'Earbuds, chargers and phone accessories', 4.5, 'gadgets', 'earbuds.webp' ],
	];
	$sup = [];
	foreach ( $suppliers as $slug => [ $name, $city, $what, $rating, $cat, $img ] ) {
		$sup[ $slug ] = [
			'id' => 'demo-' . $slug, 'businessName' => $name, 'displayName' => $name, 'slug' => $slug, 'description' => $what,
			'logoUrl' => null, 'bannerUrl' => sib_absolute( sib_img( $img ) ), 'country' => 'NG', 'city' => $city, 'businessType' => 'manufacturer',
			'categories' => [ $cat ], 'rating' => $rating, 'ratingCount' => 120, 'trustScore' => 92, 'responseTimeLabel' => 'Replies within 2 hours',
		];
	}
	$cats = [
		'fashion' => [ 'Clothes', 'fashion' ],
		'shoes'   => [ 'Shoes', 'shoes' ],
		'gadgets' => [ 'Gadgets', 'gadgets' ],
	];
	$p = [
		[ 'leather-slides', 'Leather slides', 'aba-leatherworks', 'shoes', 6000, 13000, [ [ 10, 5200 ], [ 50, 4600 ] ], 'Ships in 24 hours', 140, 'leather-slides.webp' ],
		[ 'suede-lace-ups', 'Suede lace-ups', 'aba-leatherworks', 'shoes', 9500, 21000, [ [ 10, 8400 ], [ 50, 7600 ] ], 'Ships in 24 hours', 62, 'suede-lace-ups.webp' ],
		[ 'linen-two-piece-set', 'Linen two-piece set', 'mama-tola-textiles', 'fashion', 12500, 29500, [ [ 6, 11000 ], [ 30, 9800 ] ], 'Same day in Lagos', 35, 'linen-set.webp' ],
		[ 'check-blazer', 'Check blazer', 'mama-tola-textiles', 'fashion', 15000, 34000, [ [ 6, 13500 ], [ 30, 12200 ] ], 'Same day in Lagos', 18, 'check-blazer.webp' ],
		[ 'camel-wrap-coat', 'Camel wrap coat', 'mama-tola-textiles', 'fashion', 17500, 38500, [ [ 6, 15800 ], [ 30, 14500 ] ], 'Same day in Lagos', 22, 'camel-coat.webp' ],
		[ 'white-linen-shirt', 'White linen shirt', 'mama-tola-textiles', 'fashion', 7500, 18500, [ [ 10, 6700 ], [ 40, 6100 ] ], 'Same day in Lagos', 64, 'linen-shirt.webp' ],
		[ 'knit-sweater', 'Ribbed knit sweater', 'mama-tola-textiles', 'fashion', 8000, 17500, [ [ 10, 7200 ], [ 40, 6600 ] ], 'Same day in Lagos', 0, 'knit-sweater.webp' ],
		[ 'wireless-earbuds', 'Wireless earbuds', 'computer-village-hub', 'gadgets', 9000, 17500, [ [ 20, 7900 ], [ 100, 7100 ] ], 'Same day in Lagos', 300, 'earbuds.webp' ],
	];
	$products = [];
	foreach ( $p as $i => [ $slug, $name, $s, $cat, $cost, $sell, $tiers, $ships, $stock, $img ] ) {
		$t = [];
		foreach ( $tiers as $n => [ $min, $price ] ) {
			$t[] = array_filter( [ 'minQty' => $min, 'maxQty' => isset( $tiers[ $n + 1 ] ) ? $tiers[ $n + 1 ][0] - 1 : null, 'price' => $price ], fn( $v ) => null !== $v );
		}
		$products[ $slug ] = [
			'id' => 'demo-' . $slug, 'name' => $name, 'slug' => $slug,
			'description' => sprintf( '%s from %s. Ships with your label, so your customer only sees your shop.', $name, $sup[ $s ]['displayName'] ),
			'images' => [ sib_absolute( sib_img( $img ) ) ], 'wholesalePrice' => $cost, 'wholesalePriceTo' => null, 'suggestedRetailPrice' => $sell, 'currency' => 'NGN',
			'moq' => $tiers[0][0], 'stockQuantity' => $stock, 'pricingTiers' => $t, 'dropshipAvailable' => true, 'bulkOrderAvailable' => true,
			'sampleAvailable' => false, 'deliveryRegions' => [ 'Lagos', 'Abuja', 'Nationwide' ], 'processingTime' => $ships, 'trendScore' => 100 - $i,
			'createdAt' => gmdate( 'c', strtotime( '-' . ( $i + 3 ) . ' days' ) ),
			'supplier' => $sup[ $s ], 'category' => [ 'id' => 'demo-' . $cat, 'name' => $cats[ $cat ][0], 'slug' => $cat ],
		];
	}
	$partners = [];
	foreach ( [
		[ 'shopinbos-riders', 'Shopinbos Riders', 'Same-day bikes', [ 'lagos', 'abuja' ], true, 'Lagos' ],
		[ 'swift-dispatch', 'Swift Dispatch Ltd', 'Bikes and vans, evening runs', [ 'lagos' ], true, 'Lagos' ],
		[ 'kwik', 'Kwik', 'Same-day bikes', [ 'lagos' ], true, 'Lagos' ],
		[ 'dreacot', 'Dreacot', 'Bikes and vans', [ 'lagos', 'ibadan' ], true, 'Lagos' ],
		[ 'gig-logistics', 'GIG Logistics', 'Interstate, 2 to 4 days', [ 'lagos', 'abuja', 'ibadan', 'port-harcourt', 'nationwide' ], false, 'Lagos' ],
		[ 'shipbubble', 'Shipbubble', 'Compare courier rates', [ 'lagos', 'abuja', 'ibadan', 'port-harcourt', 'nationwide' ], false, 'Lagos' ],
	] as $i => [ $slug, $name, $speed, $zones, $cod, $city ] ) {
		$partners[ $slug ] = [
			'id' => 'demo-' . $slug, 'companyName' => $name, 'displayName' => $name, 'slug' => $slug,
			'description' => $name . ' delivers for Shopinbos shops. ' . $speed . '.', 'logoUrl' => null, 'country' => 'NG', 'city' => $city,
			'coverageZones' => $zones, 'vehicleTypes' => [ 'bike', 'van' ], 'deliveryTypes' => $cod ? [ 'same_day', 'cod' ] : [ 'interstate' ],
			'pricingModel' => 'zone', 'basePrice' => 1500 + 500 * $i, 'estimatedSpeed' => $speed, 'rating' => 4.4 + ( $i % 5 ) / 10,
			'ratingCount' => 40 + $i * 13, 'reliabilityScore' => 95 - $i, 'createdAt' => gmdate( 'c' ),
		];
	}
	$categories = [];
	foreach ( [ 'fashion', 'shoes', 'gadgets' ] as $i => $c ) {
		$categories[] = [ 'id' => 'demo-' . $c, 'name' => $cats[ $c ][0], 'slug' => $c, 'description' => null, 'imageUrl' => null, 'parentId' => null, 'sortOrder' => $i,
			'_count' => [ 'supplierProducts' => count( array_filter( $products, fn( $p ) => $p['category']['slug'] === $c ) ) ] ];
	}
	return $data = [ 'products' => $products, 'suppliers' => $sup, 'partners' => $partners, 'categories' => $categories ];
}

/** Answer an API path from the sample data. Supports the filters the website uses. */
function sib_demo_api( string $path, array $query ): array {
	$d    = sib_demo_data();
	$ok   = fn( $data, $meta = [] ) => [ 'ok' => true, 'status' => 200, 'data' => $data, 'meta' => $meta, 'fetched_at' => time(), 'stale' => false, 'prices_hidden' => false ];
	$miss = [ 'ok' => false, 'status' => 404, 'data' => null, 'meta' => [], 'fetched_at' => time(), 'stale' => false, 'prices_hidden' => false ];
	$page = max( 1, (int) ( $query['page'] ?? 1 ) );
	$lim  = max( 1, min( 100, (int) ( $query['limit'] ?? 20 ) ) );
	$list = function ( array $items ) use ( $ok, $page, $lim ) {
		$items = array_values( $items );
		return $ok( array_slice( $items, ( $page - 1 ) * $lim, $lim ), [ 'page' => $page, 'limit' => $lim, 'total' => count( $items ) ] );
	};
	$path = '/' . trim( $path, '/' );

	if ( preg_match( '#^/products/([^/]+)$#', $path, $m ) && ! in_array( $m[1], [ 'trending', 'search' ], true ) ) {
		return isset( $d['products'][ $m[1] ] ) ? $ok( $d['products'][ $m[1] ] ) : $miss;
	}
	if ( in_array( $path, [ '/products', '/products/trending', '/products/search' ], true ) ) {
		$items = array_filter( $d['products'], function ( $p ) use ( $query ) {
			if ( ! empty( $query['category'] ) && $p['category']['slug'] !== $query['category'] ) {
				return false;
			}
			if ( ! empty( $query['q'] ) && false === stripos( $p['name'], (string) $query['q'] ) ) {
				return false;
			}
			if ( ! empty( $query['supplier'] ) && $p['supplier']['slug'] !== $query['supplier'] ) {
				return false;
			}
			return true;
		} );
		return $list( $items );
	}
	if ( preg_match( '#^/suppliers/([^/]+)$#', $path, $m ) && 'search' !== $m[1] ) {
		if ( ! isset( $d['suppliers'][ $m[1] ] ) ) {
			return $miss;
		}
		$s             = $d['suppliers'][ $m[1] ];
		$s['products'] = array_values( array_filter( $d['products'], fn( $p ) => $p['supplier']['slug'] === $m[1] ) );
		$s['_count']   = [ 'products' => count( $s['products'] ) ];
		return $ok( $s );
	}
	if ( '/suppliers' === $path ) {
		return $list( array_map( function ( $s ) use ( $d ) {
			$s['_count'] = [ 'products' => count( array_filter( $d['products'], fn( $p ) => $p['supplier']['slug'] === $s['slug'] ) ) ];
			return $s;
		}, $d['suppliers'] ) );
	}
	if ( preg_match( '#^/logistics/partners/([^/]+)$#', $path, $m ) && 'search' !== $m[1] ) {
		return isset( $d['partners'][ $m[1] ] ) ? $ok( $d['partners'][ $m[1] ] ) : $miss;
	}
	if ( '/logistics/partners' === $path ) {
		$zone = $query['zone'] ?? '';
		return $list( array_filter( $d['partners'], fn( $p ) => ! $zone || in_array( $zone, $p['coverageZones'], true ) ) );
	}
	if ( '/categories' === $path ) {
		return $list( $d['categories'] );
	}
	if ( preg_match( '#^/categories/([^/]+)$#', $path, $m ) ) {
		foreach ( $d['categories'] as $c ) {
			if ( $c['slug'] === $m[1] ) {
				return $ok( $c );
			}
		}
		return $miss;
	}
	return $miss;
}
