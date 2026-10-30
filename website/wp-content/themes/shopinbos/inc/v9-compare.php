<?php
/**
 * Website V9: comparisons with named competitors (the owner asked for named, sourced comparisons on these pages only).
 *  - /compare/ (static design page): the design's generic cards and table become logo cards per group (Nigerian store
 *    builders, Nigerian marketplaces, global builders, social selling) and one big table, Shopinbos against all.
 *  - /compare/{slug}/: Shopinbos vs one competitor: short answer, pricing side by side, feature table, pros and cons
 *    of both, "choose … if", switching steps, FAQ (FAQPage schema) and sources. Head-to-head pages (pairs, e.g.
 *    /compare/woocommerce-vs-shopify/) compare two competitors and show where Shopinbos fits.
 *  - All data, prices and sources live in v9/compare.json, so prices are updated in one place. Logos are the
 *    companies' own marks, in assets/img/brands/.
 *  - Slugs with no data get the V9 not-found page. New slugs (no sib_comparison post) are matched on the request
 *    path, like v9-for.php, and listed in a core sitemap (wp-sitemap-sibcompare-1.xml) once V9 is live.
 */

defined( 'ABSPATH' ) || exit;

function sib_v9_cmp_data(): array {
	static $d = null;
	if ( null === $d ) {
		$d = (array) json_decode( (string) @file_get_contents( get_theme_file_path( 'v9/compare.json' ) ), true ); // phpcs:ignore
		$d += [ 'hub' => [], 'us' => [], 'rivals' => [], 'pairs' => [], 'checked' => '', 'fx' => [] ];
	}
	return $d;
}

/** The slug in /compare/{slug}/, or null for any other address. */
function sib_v9_cmp_path_slug(): ?string {
	if ( ! function_exists( 'sib_v9_path' ) || ! preg_match( '#^/compare/([a-z0-9-]+)/$#', strtolower( sib_v9_path() ), $m ) ) {
		return null;
	}
	return $m[1];
}

function sib_v9_cmp_known( string $slug ): bool {
	$d = sib_v9_cmp_data();
	return isset( $d['rivals'][ $slug ] ) || isset( $d['pairs'][ $slug ] );
}

/* Addresses with data but no stored post must not be treated as not found (see v9-for.php). */
function sib_v9_cmp_live(): bool {
	$s = sib_v9_cmp_path_slug();
	return null !== $s && function_exists( 'sib_v9_active' ) && sib_v9_active() && sib_v9_cmp_known( $s );
}
add_filter( 'request', function ( $vars ) {
	if ( isset( $vars['error'] ) && '404' === (string) $vars['error'] && sib_v9_cmp_live() ) {
		unset( $vars['error'] );
	}
	return $vars;
} );
add_filter( 'pre_handle_404', fn( $pre ) => sib_v9_cmp_live() ? true : $pre );

add_filter( 'sib_v9_content_templates', function ( array $t ): array {
	$t['sib_v9_is_cmp'] = 'sib_v9_cmp_page';
	return $t;
} );

/** Any /compare/{slug}/ address, and any stored comparison post. */
function sib_v9_is_cmp(): bool {
	return null !== sib_v9_cmp_path_slug() || is_singular( 'sib_comparison' );
}

function sib_v9_cmp_page(): ?array {
	$slug = sib_v9_cmp_path_slug();
	if ( null === $slug && is_singular( 'sib_comparison' ) ) {
		$slug = (string) get_queried_object()->post_name;
	}
	$d = sib_v9_cmp_data();
	if ( null !== $slug && isset( $d['rivals'][ $slug ] ) ) {
		return sib_v9_cmp_single( $slug );
	}
	if ( null !== $slug && isset( $d['pairs'][ $slug ] ) ) {
		return sib_v9_cmp_pair( $slug );
	}
	return function_exists( 'sib_v9_404' ) ? sib_v9_404() : null;
}

/* ---------- Pieces ---------- */

function sib_v9_cmp_date(): string {
	$c = (string) sib_v9_cmp_data()['checked'];
	return $c ? date_i18n( 'j F Y', strtotime( $c ) ) : '';
}

function sib_v9_cmp_note(): string {
	return sprintf( 'Prices checked on %s; they change, check the provider’s site.', sib_v9_cmp_date() );
}

function sib_v9_cmp_group_label( string $key ): string {
	foreach ( (array) sib_v9_cmp_data()['hub']['groups'] as $g ) {
		if ( $g['key'] === $key ) {
			return (string) $g['label'];
		}
	}
	return '';
}

/** A logo in a white tile. $r: a rival, or null for Shopinbos. */
function sib_v9_cmp_logo( ?array $r, int $size = 56 ): string {
	$pad = (int) round( $size * 0.16 );
	if ( null === $r ) {
		return '<span class="v9c-logo" style="width:' . $size . 'px;height:' . $size . 'px;background:#FF6A2B;padding:' . $pad . 'px"><img src="' . esc_url( sib_v9_img( 'ca93d894250e7589d5b88c477d36f7d7.webp' ) ) . '" alt="Shopinbos logo" width="' . ( $size - 2 * $pad ) . '" height="' . ( $size - 2 * $pad ) . '" decoding="async" loading="lazy"></span>';
	}
	return '<span class="v9c-logo" style="width:' . $size . 'px;height:' . $size . 'px;padding:' . $pad . 'px"><img src="' . esc_url( get_theme_file_uri( 'assets/img/brands/' . $r['logo'] ) ) . '" alt="' . esc_attr( $r['name'] . ' logo' ) . '" width="' . ( $size - 2 * $pad ) . '" height="' . ( $size - 2 * $pad ) . '" decoding="async" loading="lazy"></span>';
}

/** A fact cell: mark + text. */
function sib_v9_cmp_cell( array $f, bool $short = false ): string {
	$marks = [ 'yes' => [ '✓', 'Yes' ], 'part' => [ '~', 'Partly' ], 'no' => [ '–', 'No' ], 'check' => [ '?', 'Not confirmed' ] ];
	$m     = $marks[ $f[0] ] ?? $marks['check'];
	return '<span class="v9c-m v9c-' . esc_attr( $f[0] ) . '" title="' . esc_attr( $m[1] ) . '" aria-label="' . esc_attr( $m[1] ) . '">' . $m[0] . '</span> ' . esc_html( $short ? $f[1] : $f[2] );
}

function sib_v9_cmp_list( array $items, string $mark, string $cls ): string {
	$out = '';
	foreach ( $items as $it ) {
		$out .= '<li class="tick"><b class="' . $cls . '" aria-hidden="true">' . $mark . '</b><span>' . esc_html( $it ) . '</span></li>';
	}
	return '<ul class="v9c-ul">' . $out . '</ul>';
}

/** Pricing card for Shopinbos or a rival. */
function sib_v9_cmp_price_card( ?array $r ): string {
	$d = sib_v9_cmp_data();
	if ( null === $r ) {
		$rows = $d['us']['pricing'];
		$cur  = 'Naira';
		$note = $d['us']['pricing_note'];
		$name = 'Shopinbos';
		$link = '<a class="more" href="/pricing/" style="font-size:14px">See every plan →</a>';
	} else {
		$rows = $r['pricing']['plans'];
		$cur  = $r['pricing']['currency'];
		$note = $r['pricing']['note'];
		$name = $r['name'];
		$link = '';
	}
	$list = '';
	foreach ( $rows as $p ) {
		$list .= '<div class="v9c-plan"><b>' . esc_html( $p[0] ) . '</b><span>' . esc_html( $p[1] ) . ( ! empty( $p[2] ) ? '<small class="mutd">' . esc_html( $p[2] ) . '</small>' : '' ) . '</span></div>';
	}
	return '<div class="bc ' . ( null === $r ? 'c-mint' : 'c-wh' ) . ' v9c-card" style="gap:14px"><div style="display:flex;gap:14px;align-items:center">' . sib_v9_cmp_logo( $r, 48 ) . '<div><div class="H h3" style="font-size:24px">' . esc_html( $name ) . '</div><span class="k mutd" style="font-size:11px">' . esc_html( $cur ) . '</span></div></div>'
		. '<div>' . $list . '</div><p class="mutd" style="font-size:14px;margin:0">' . esc_html( $note ) . '</p>' . $link . '</div>';
}

/** Features table: rows from the hub keys, columns = Shopinbos + the given rivals. */
function sib_v9_cmp_table( array $cols, bool $short = false, string $class = '' ): string {
	$d    = sib_v9_cmp_data();
	$head = '<th scope="col"><span class="sr-only">Feature</span></th>';
	foreach ( $cols as $c ) {
		$r     = 'us' === $c ? null : $d['rivals'][ $c ];
		$name  = null === $r ? 'Shopinbos' : $r['name'];
		$inner = sib_v9_cmp_logo( $r, 36 ) . '<span>' . esc_html( $name ) . '</span>';
		$head .= '<th scope="col" class="' . ( 'us' === $c ? 'v9c-us' : '' ) . '">' . ( $short && null !== $r ? '<a href="' . esc_url( '/compare/' . $c . '/' ) . '">' . $inner . '</a>' : $inner ) . '</th>';
	}
	$body = '';
	foreach ( (array) $d['hub']['rows'] as [ $key, $label ] ) {
		$body .= '<tr><th scope="row">' . esc_html( $label ) . '</th>';
		foreach ( $cols as $c ) {
			$f     = 'us' === $c ? $d['us']['facts'][ $key ] : $d['rivals'][ $c ]['facts'][ $key ];
			$body .= '<td class="' . ( 'us' === $c ? 'v9c-us' : '' ) . '">' . sib_v9_cmp_cell( (array) $f, $short ) . '</td>';
		}
		$body .= '</tr>';
	}
	return '<div class="v9c-scroll ' . esc_attr( $class ) . '" tabindex="0" role="region" aria-label="Comparison table"><table class="v9c-t"><thead><tr>' . $head . '</tr></thead><tbody>' . $body . '</tbody></table></div>'
		. '<p class="mutd v9c-key" style="font-size:13px;margin-top:14px"><span class="v9c-m v9c-yes">✓</span> yes · <span class="v9c-m v9c-part">~</span> partly or with add-ons · <span class="v9c-m v9c-no">–</span> no · <span class="v9c-m v9c-check">?</span> not confirmed, check their site</p>';
}

function sib_v9_cmp_sources( array $sources ): string {
	$items = '';
	foreach ( $sources as [ $label, $url ] ) {
		$items .= '<li><a href="' . esc_url( $url ) . '" rel="nofollow noopener" target="_blank">' . esc_html( $label ) . '</a> <span class="mutd">' . esc_html( (string) wp_parse_url( $url, PHP_URL_HOST ) ) . '</span></li>';
	}
	$items .= '<li><a href="/pricing/">Shopinbos pricing</a> <span class="mutd">shopinbos.com</span></li>';
	return '<section class="sec" style="background:#fff;padding-top:24px"><div class="wrap"><div style="max-width:980px"><h2 class="H h2" style="font-size:clamp(28px,3vw,40px)">Sources</h2>'
		. '<ol class="v9c-src">' . $items . '</ol>'
		. '<p class="mutd" style="font-size:14px;margin-top:18px">' . esc_html( sib_v9_cmp_note() ) . ' Spotted something out of date? <a href="/contact/" style="text-decoration:underline">Tell us</a> and we’ll fix it.</p></div></div></section>';
}

function sib_v9_cmp_steps( array $r ): array {
	$n = $r['name'];
	switch ( $r['group'] ) {
		case 'ng-marketplaces':
			return [ sprintf( 'Using %s with Shopinbos', $n ), [
				[ 'Keep your listings', sprintf( 'You don’t have to leave %s. Keep selling there while you build your own store.', $n ) ],
				[ 'Add your products', 'Upload photos from your phone or import a spreadsheet. Rex helps with the descriptions.' ],
				[ 'Share your store link', 'Put it on your own WhatsApp, Instagram and TikTok, where your repeat customers find you.' ],
				[ 'Turn on delivery', 'Connect a delivery partner, and pay on delivery on Growth or Pro.' ],
			] ];
		case 'social':
			return [ sprintf( 'Using %s with Shopinbos', $n ), [
				[ 'Add your products', 'Upload photos from your phone, or add products from your WhatsApp catalogue.' ],
				[ 'Put your link in your bio', 'Your free store address is name.mybos.store.' ],
				[ 'Send product links in chats', 'Customers order and pay from the link instead of sending screenshots.' ],
				[ 'Turn on delivery', 'Connect a delivery partner, and pay on delivery on Growth or Pro.' ],
			] ];
		default:
			return [ sprintf( 'Moving from %s', $n ), [
				[ 'Export your products', sprintf( 'Download your product list from %s as a spreadsheet (CSV).', $n ) ],
				[ 'Import into Shopinbos', 'Upload the spreadsheet. Photos and prices come across; Rex helps tidy the descriptions.' ],
				[ 'Connect your domain', 'Keep your web address. Your own domain works from the Starter plan.' ],
				[ 'Run both for a while', 'Keep your old store open until you’re happy, then switch your links.' ],
			] ];
	}
}

function sib_v9_cmp_others( string $not ): string {
	$d     = sib_v9_cmp_data();
	$chips = '';
	foreach ( $d['rivals'] as $s => $r ) {
		if ( $s !== $not ) {
			$chips .= '<a class="chip" href="' . esc_url( '/compare/' . $s . '/' ) . '">Shopinbos vs ' . esc_html( $r['name'] ) . '</a>';
		}
	}
	foreach ( $d['pairs'] as $s => $p ) {
		if ( $s !== $not ) {
			$chips .= '<a class="chip" href="' . esc_url( '/compare/' . $s . '/' ) . '">' . esc_html( $d['rivals'][ $p['a'] ]['name'] . ' vs ' . $d['rivals'][ $p['b'] ]['name'] ) . '</a>';
		}
	}
	return '<section style="background:#fff;padding:24px 0 72px"><div class="wrap"><span class="k mutd">More comparisons</span><div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px">' . $chips . '<a class="chip on" href="/compare/">All comparisons</a></div></div></section>';
}

function sib_v9_cmp_hero( string $crumb, string $eyebrow, string $h1, string $lead, string $cards ): string {
	return '<section style="background:#F6F3EE;padding:64px 0 80px"><div class="wrap"><nav class="mutd" style="font-size:14px" aria-label="Breadcrumb"><a href="/compare/">Compare</a> / ' . esc_html( $crumb ) . '</nav>'
		. '<div class="g2" style="display:grid;grid-template-columns:1.1fr .9fr;gap:56px;align-items:center;margin-top:28px">'
		. '<div style="display:flex;flex-direction:column;gap:22px"><span class="k orgd up">' . esc_html( $eyebrow ) . '</span><h1 class="H h1 up d1" style="font-size:clamp(40px,5vw,76px)">' . $h1 . '</h1><p class="lead up d2">' . esc_html( $lead ) . '</p>'
		. '<div class="stack up d3" style="display:flex;gap:12px;flex-wrap:wrap"><a class="btn b-ink" href="' . esc_url( sib_v9_signup() ) . '">Start free</a><a class="btn b-line" href="#pricing">Compare prices</a></div></div>'
		. '<div class="bn g2 up d2" style="grid-template-columns:1fr 1fr">' . $cards . '</div></div></div></section>';
}

function sib_v9_cmp_brand_card( ?array $r ): string {
	$d     = sib_v9_cmp_data();
	$night = null === $r;
	return '<div class="bc v9c-brand ' . ( $night ? 'c-night' : 'c-wh' ) . '" style="min-height:280px;gap:10px">' . sib_v9_cmp_logo( $r, 56 )
		. '<div class="H h3" style="margin-top:auto">' . esc_html( $night ? 'Shopinbos' : $r['name'] ) . '</div><p class="p ' . ( $night ? 'mut' : 'mutd' ) . '" style="font-size:14.5px">' . esc_html( $night ? $d['us']['short'] : $r['short'] ) . '</p></div>';
}

function sib_v9_cmp_answer( string $q, string $a ): string {
	return '<section class="sec" style="background:#fff;padding-bottom:0"><div class="wrap"><div class="bc c-sand" style="padding:40px;gap:14px;max-width:1000px"><span class="k orgd">The short answer</span><h2 class="H h3" style="font-size:clamp(24px,2.4vw,32px)">' . esc_html( $q ) . '</h2><p class="lead" style="font-size:18.5px;color:#16141F">' . esc_html( $a ) . '</p><p class="mutd" style="font-size:13.5px;margin:0">' . esc_html( sprintf( 'Checked on %s.', sib_v9_cmp_date() ) ) . '</p></div></div></section>';
}

function sib_v9_cmp_proscons( ?array $r ): string {
	$d    = sib_v9_cmp_data();
	$name = null === $r ? 'Shopinbos' : $r['name'];
	$pros = null === $r ? $d['us']['pros'] : $r['pros'];
	$cons = null === $r ? $d['us']['cons'] : $r['cons'];
	return '<div class="bc ' . ( null === $r ? 'c-mint' : 'c-wh' ) . ' v9c-card" style="gap:16px"><div style="display:flex;gap:14px;align-items:center">' . sib_v9_cmp_logo( $r, 44 ) . '<div class="H h3" style="font-size:24px">' . esc_html( $name ) . '</div></div>'
		. '<span class="k tl">Pros</span>' . sib_v9_cmp_list( (array) $pros, '✓', '' )
		. '<span class="k orgd" style="margin-top:8px">Cons</span>' . sib_v9_cmp_list( (array) $cons, '–', 'v9c-con' ) . '</div>';
}

function sib_v9_cmp_choose( string $a_title, array $a, string $b_title, array $b ): string {
	return '<section class="sec" style="background:#F6F3EE"><div class="wrap"><div class="bn g2" style="grid-template-columns:1fr 1fr">'
		. '<div class="bc c-mint" style="padding:40px;gap:14px"><span class="k tl">' . esc_html( $a_title ) . '</span>' . sib_v9_cmp_list( $a, '✓', '' ) . '</div>'
		. '<div class="bc c-wh" style="padding:40px;gap:14px"><span class="k mutd">' . esc_html( $b_title ) . '</span>' . sib_v9_cmp_list( $b, '→', 'v9c-arrow' ) . '</div>'
		. '</div></div></section>';
}

function sib_v9_cmp_band(): string {
	return sib_v9_section( 'compare-single', 'night' );
}

/* ---------- Shopinbos vs one competitor ---------- */

function sib_v9_cmp_single( string $slug ): array {
	$d = sib_v9_cmp_data();
	$r = $d['rivals'][ $slug ];
	$n = $r['name'];

	$h  = sib_v9_cmp_hero( sib_v9_cmp_group_label( $r['group'] ), 'Compare · checked ' . sib_v9_cmp_date(), 'Shopinbos <span class="it orgd">vs</span> ' . esc_html( $n ), sprintf( 'Pricing, features, pros and cons of %s and Shopinbos for selling in Nigeria, side by side and with sources.', $n ), sib_v9_cmp_brand_card( null ) . sib_v9_cmp_brand_card( $r ) );
	$h .= sib_v9_cmp_answer( sprintf( 'Is %s or Shopinbos better for Nigerian sellers?', $n ), $r['answer'] );

	// Pricing.
	$fx = false !== strpos( $r['pricing']['currency'], 'dollar' ) ? '<p class="mutd" style="font-size:13.5px;margin:8px 0 0">' . esc_html( $d['fx']['text'] ) . '</p>' : '';
	$h .= '<section class="sec" id="pricing" style="background:#fff"><div class="wrap"><h2 class="H h2">Pricing <span class="it orgd">side by side.</span></h2><p class="lead" style="margin-top:16px;max-width:720px">' . esc_html( sib_v9_cmp_note() ) . '</p>'
		. '<div class="bn g2" style="grid-template-columns:1fr 1fr;margin-top:40px">' . sib_v9_cmp_price_card( null ) . sib_v9_cmp_price_card( $r ) . '</div>' . $fx . '</div></section>';

	// Features.
	$h .= '<section class="sec" style="background:#fff;padding-top:0"><div class="wrap"><h2 class="H h2">Features <span class="it orgd">side by side.</span></h2><div style="margin-top:36px">' . sib_v9_cmp_table( [ 'us', $slug ] ) . '</div></div></section>';

	// Pros and cons.
	$h .= '<section class="sec" style="background:#F6F3EE"><div class="wrap"><h2 class="H h2">Pros <span class="it orgd">and cons.</span></h2><p class="lead" style="margin-top:16px;max-width:720px">' . esc_html( sprintf( 'What %s does well, where it falls short, and the same for Shopinbos.', $n ) ) . '</p>'
		. '<div class="bn g2" style="grid-template-columns:1fr 1fr;margin-top:40px">' . sib_v9_cmp_proscons( $r ) . sib_v9_cmp_proscons( null ) . '</div></div></section>';

	// Choose … if.
	$h .= str_replace( 'style="background:#F6F3EE"', 'style="background:#fff"', sib_v9_cmp_choose( 'Choose Shopinbos if', (array) $r['choose_us'], sprintf( 'Choose %s if', $n ), (array) $r['choose_them'] ) );

	// Switching steps.
	[ $title, $steps ] = sib_v9_cmp_steps( $r );
	$cards             = '';
	foreach ( $steps as $i => [ $t, $x ] ) {
		$cards .= '<div class="bc c-sand" style="gap:10px"><span class="H orgd" style="font-size:40px;line-height:1">0' . ( $i + 1 ) . '</span><div class="H h3" style="margin-top:12px;font-size:22px">' . esc_html( $t ) . '</div><p class="p mutd">' . esc_html( $x ) . '</p></div>';
	}
	$h .= '<section class="sec" style="background:#fff;padding-top:0"><div class="wrap"><h2 class="H h2">' . esc_html( $title ) . '</h2><div class="bn" style="grid-template-columns:repeat(4,1fr);margin-top:40px">' . $cards . '</div><p class="mutd" style="font-size:14px;margin-top:20px">Want a hand? <a href="/contact/" style="text-decoration:underline">Talk to us on WhatsApp</a>.</p></div></section>';

	// FAQ, sources, more, band.
	$faq = (array) $r['faq'];
	if ( function_exists( 'sib_v9_for_faq' ) ) {
		$h .= sib_v9_for_faq( $faq, sprintf( '%s vs Shopinbos', $n ) );
	}
	$h .= sib_v9_cmp_sources( (array) $r['sources'] );
	$h .= sib_v9_cmp_others( $slug );
	$h .= sib_v9_cmp_band();

	return [
		'slug'        => 'compare-page',
		'html'        => sib_v9_wrap( $h, 'compare-single' ),
		'title'       => sprintf( 'Shopinbos vs %s: pricing, features, pros and cons (%s)', $n, gmdate( 'Y', strtotime( (string) $d['checked'] ) ) ),
		'description' => wp_html_excerpt( sprintf( '%s or Shopinbos for selling in Nigeria? Prices checked %s, fees, pay on delivery, delivery, pros and cons of each, and how to switch.', $n, sib_v9_cmp_date() ), 158, '…' ),
		'crumbs'      => [ [ __( 'Compare', 'shopinbos' ), home_url( '/compare/' ) ] ],
		'canonical'   => home_url( '/compare/' . $slug . '/' ),
	];
}

/* ---------- One competitor vs another (head to head) ---------- */

function sib_v9_cmp_pair( string $slug ): array {
	$d = sib_v9_cmp_data();
	$p = $d['pairs'][ $slug ];
	$a = $d['rivals'][ $p['a'] ];
	$b = $d['rivals'][ $p['b'] ];

	$h  = sib_v9_cmp_hero( 'Head to head', 'Compare · checked ' . sib_v9_cmp_date(), esc_html( $a['name'] ) . ' <span class="it orgd">vs</span> ' . esc_html( $b['name'] ), sprintf( 'Pricing, fees, pros and cons of %1$s and %2$s for Nigerian sellers, and where Shopinbos fits.', $a['name'], $b['name'] ), sib_v9_cmp_brand_card( $a ) . sib_v9_cmp_brand_card( $b ) );
	$h .= sib_v9_cmp_answer( sprintf( 'Is %1$s or %2$s better for Nigerian sellers?', $a['name'], $b['name'] ), $p['answer'] );
	$fx = '<p class="mutd" style="font-size:13.5px;margin:8px 0 0">' . esc_html( $d['fx']['text'] ) . '</p>';
	$h .= '<section class="sec" id="pricing" style="background:#fff"><div class="wrap"><h2 class="H h2">Pricing <span class="it orgd">side by side.</span></h2><p class="lead" style="margin-top:16px;max-width:720px">' . esc_html( sib_v9_cmp_note() ) . '</p>'
		. '<div class="bn g2" style="grid-template-columns:1fr 1fr;margin-top:40px">' . sib_v9_cmp_price_card( $a ) . sib_v9_cmp_price_card( $b ) . '</div>' . $fx . '</div></section>';
	$h .= '<section class="sec" style="background:#fff;padding-top:0"><div class="wrap"><h2 class="H h2">Features <span class="it orgd">side by side.</span></h2><p class="lead" style="margin-top:16px;max-width:720px">With Shopinbos alongside, for sellers who mainly sell in Nigeria.</p><div style="margin-top:36px">' . sib_v9_cmp_table( [ $p['a'], $p['b'], 'us' ] ) . '</div></div></section>';
	$h .= '<section class="sec" style="background:#F6F3EE"><div class="wrap"><h2 class="H h2">Pros <span class="it orgd">and cons.</span></h2><div class="bn g2" style="grid-template-columns:1fr 1fr;margin-top:40px">' . sib_v9_cmp_proscons( $a ) . sib_v9_cmp_proscons( $b ) . '</div></div></section>';
	$h .= str_replace( 'style="background:#F6F3EE"', 'style="background:#fff"', sib_v9_cmp_choose( sprintf( 'Choose %s if', $a['name'] ), (array) $a['choose_them'], sprintf( 'Choose %s if', $b['name'] ), (array) $b['choose_them'] ) );
	$h .= '<section style="background:#fff;padding:0 0 40px"><div class="wrap"><div class="bc c-night" style="padding:40px;gap:14px;flex-direction:row;flex-wrap:wrap;align-items:center;justify-content:space-between"><div style="max-width:640px"><span class="k" style="color:#8BE3D3">Selling mainly in Nigeria?</span><div class="H h3" style="margin-top:10px">Shopinbos is built for naira, pay on delivery and riders.</div></div><div style="display:flex;gap:10px;flex-wrap:wrap">'
		. '<a class="btn b-org" href="' . esc_url( '/compare/' . $p['a'] . '/' ) . '">Shopinbos vs ' . esc_html( $a['name'] ) . '</a><a class="btn" style="background:rgba(255,255,255,.1);color:#fff" href="' . esc_url( '/compare/' . $p['b'] . '/' ) . '">Shopinbos vs ' . esc_html( $b['name'] ) . '</a></div></div></div></section>';
	if ( function_exists( 'sib_v9_for_faq' ) ) {
		$h .= sib_v9_for_faq( (array) $p['faq'], sprintf( '%1$s vs %2$s', $a['name'], $b['name'] ) );
	}
	$h .= sib_v9_cmp_sources( array_merge( (array) $a['sources'], (array) $b['sources'] ) );
	$h .= sib_v9_cmp_others( $slug );
	$h .= sib_v9_cmp_band();

	return [
		'slug'        => 'compare-page',
		'html'        => sib_v9_wrap( $h, 'compare-single' ),
		'title'       => $p['title'],
		'description' => $p['description'],
		'crumbs'      => [ [ __( 'Compare', 'shopinbos' ), home_url( '/compare/' ) ] ],
		'canonical'   => home_url( '/compare/' . $slug . '/' ),
	];
}

/* ---------- /compare/ (the static design page) ---------- */

add_filter( 'sib_v9_fill', function ( string $html, string $slug ): string {
	if ( 'compare' !== $slug ) {
		return $html;
	}
	$d   = sib_v9_cmp_data();
	$hub = $d['hub'];

	// Hero: the lead, and chips to jump to each group.
	$chips = '';
	foreach ( $hub['groups'] as $g ) {
		$chips .= '<a class="chip" href="#' . esc_attr( $g['key'] ) . '">' . esc_html( $g['label'] ) . '</a>';
	}
	$chips .= '<a class="chip on" href="#at-a-glance">At a glance</a>';
	$html   = (string) preg_replace(
		'#<p class="lead up d2" style="max-width:620px">.*?</p>#s',
		'<p class="lead up d2" style="max-width:680px">' . esc_html( $hub['lead'] ) . '</p><div class="up d3" style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center">' . $chips . '</div>',
		$html,
		1
	);

	// Groups of logo cards.
	$mid = '';
	foreach ( $hub['groups'] as $i => $g ) {
		$cards = '';
		foreach ( $g['slugs'] as $s ) {
			if ( empty( $d['rivals'][ $s ] ) ) {
				continue;
			}
			$r      = $d['rivals'][ $s ];
			$cards .= '<a href="' . esc_url( '/compare/' . $s . '/' ) . '" class="bc c-wh lift v9c-hcard" style="gap:10px;min-height:260px">' . sib_v9_cmp_logo( $r, 56 )
				. '<span class="k mutd" style="margin-top:auto">Shopinbos vs</span><div class="H h3" style="font-size:26px">' . esc_html( $r['name'] ) . '</div><p class="p mutd" style="font-size:14.5px">' . esc_html( $r['short'] ) . '</p>'
				. '<span class="more" style="font-size:14px;margin-top:4px">See the comparison <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"></path></svg></span></a>';
		}
		$extra = '';
		if ( 'global' === $g['key'] ) {
			foreach ( $d['pairs'] as $ps => $p ) {
				$extra .= '<a class="chip" href="' . esc_url( '/compare/' . $ps . '/' ) . '">Head to head: ' . esc_html( $d['rivals'][ $p['a'] ]['name'] . ' vs ' . $d['rivals'][ $p['b'] ]['name'] ) . ' →</a>';
			}
			$extra = $extra ? '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:22px">' . $extra . '</div>' : '';
		}
		$mid .= '<section class="sec" id="' . esc_attr( $g['key'] ) . '" style="background:' . ( $i % 2 ? '#F6F3EE' : '#fff' ) . ';padding:72px 0"><div class="wrap"><h2 class="H h2" style="font-size:clamp(30px,3.4vw,48px)">' . esc_html( $g['label'] ) . '</h2><p class="lead" style="margin-top:12px;max-width:640px">' . esc_html( $g['lead'] ) . '</p>'
			. '<div class="g4 g4m2" style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-top:36px">' . $cards . '</div>' . $extra . '</div></section>';
	}

	// The big table: Shopinbos against everyone.
	$cols = [ 'us' ];
	foreach ( $hub['groups'] as $g ) {
		foreach ( $g['slugs'] as $s ) {
			if ( isset( $d['rivals'][ $s ] ) ) {
				$cols[] = $s;
			}
		}
	}
	$fx   = '<p class="mutd" style="font-size:13px;margin-top:6px">' . esc_html( sib_v9_cmp_note() . ' ' . $d['fx']['text'] ) . ' Sources are on each comparison page.</p>';
	$mid .= '<section class="sec" id="at-a-glance" style="background:#fff"><div class="wrap"><h2 class="H h2">At a glance</h2><p class="lead" style="margin-top:12px;max-width:720px">Shopinbos next to every option above. Scroll sideways to see them all; tap a name for the full comparison.</p><div style="margin-top:36px">' . sib_v9_cmp_table( $cols, true, 'v9c-big' ) . '</div>' . $fx . '</div></section>';
	if ( function_exists( 'sib_v9_for_faq' ) && ! empty( $hub['faq'] ) ) {
		$mid .= sib_v9_for_faq( (array) $hub['faq'], 'Comparison' );
	}

	// Swap the design's generic cards and table (everything between the hero and the sign-up band).
	$a = strpos( $html, '<section class="sec" style="background:#fff;">' );
	$b = strpos( $html, '<section class="night"' );
	if ( false === $a || false === $b || $b < $a ) {
		return $html;
	}
	return substr( $html, 0, $a ) . $mid . substr( $html, $b );
}, 20, 2 );

/* The hub's page title (the static page's title comes from the design build). */
function sib_v9_cmp_hub_title(): string {
	return (string) ( sib_v9_cmp_data()['hub']['title'] ?? '' );
}
add_filter( 'pre_get_document_title', function ( $t ) {
	return ( 'compare' === ( $GLOBALS['sib_v9_page'] ?? '' ) && sib_v9_cmp_hub_title() ) ? sib_v9_cmp_hub_title() : $t;
}, 100 );
add_action( 'wp_head', function () {
	if ( 'compare' === ( $GLOBALS['sib_v9_page'] ?? '' ) && isset( $GLOBALS['sib_virtual'] ) && sib_v9_cmp_hub_title() ) {
		$GLOBALS['sib_virtual']['title']       = sib_v9_cmp_hub_title();
		$GLOBALS['sib_virtual']['description'] = (string) sib_v9_cmp_data()['hub']['description'];
	}
}, 0 );

/* ---------- Sitemap: comparison pages that have no stored post (stored ones are in the post-type sitemap) ---------- */

add_action( 'wp_sitemaps_init', function ( $server ) {
	if ( ! class_exists( 'WP_Sitemaps_Provider' ) || ! function_exists( 'sib_v9_launched' ) || ! sib_v9_launched() ) {
		return;
	}
	$server->registry->add_provider( 'sibcompare', new class() extends WP_Sitemaps_Provider {
		public function __construct() {
			$this->name        = 'sibcompare';
			$this->object_type = 'sibcompare';
		}
		public function get_url_list( $page_num, $object_subtype = '' ) {
			$d    = sib_v9_cmp_data();
			$urls = [];
			foreach ( array_merge( array_keys( $d['rivals'] ), array_keys( $d['pairs'] ) ) as $s ) {
				if ( ! get_page_by_path( $s, OBJECT, 'sib_comparison' ) ) {
					$urls[] = [ 'loc' => home_url( '/compare/' . $s . '/' ), 'lastmod' => gmdate( 'c', strtotime( (string) $d['checked'] ) ) ];
				}
			}
			return $urls;
		}
		public function get_max_num_pages( $object_subtype = '' ) {
			return 1;
		}
	} );
} );
