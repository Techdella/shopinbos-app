<?php
/**
 * Website V9: put real data into the static designs.
 *  - Pricing: plans, comparison tables, fees and credits from the plugin's pricing.json (one source of truth).
 *  - Help centre: real topics, articles and search.
 *  - Bracket placeholders the design left for the business ([support number], [date]…): filled from settings,
 *    then from Settings → Shopinbos → "Website text to fill in" (one "[placeholder] => text" per line).
 *    `wp shopinbos v9-placeholders` lists what is still open.
 */

defined( 'ABSPATH' ) || exit;

/* ---------- Pricing ---------- */

function sib_v9_price( int $n ): string {
	return function_exists( 'sib_naira' ) ? sib_naira( $n ) : '₦' . number_format( $n );
}

function sib_v9_cell( $v ): string {
	if ( true === $v ) {
		return '<span style="color:#16794A;font-weight:800">✓</span>';
	}
	if ( false === $v ) {
		return '<span style="color:#B5B1C0">–</span>';
	}
	return esc_html( (string) $v );
}

/** A comparison table in the design's .tbl style. */
function sib_v9_table( array $plans, array $rows ): string {
	$cols = 'grid-template-columns:1.8fr repeat(' . count( $plans ) . ',1fr)';
	$out  = '<div class="tbl v9-tbl" style="margin-top:40px;--cols:' . count( $plans ) . '"><div class="tr" style="display:grid;' . $cols . ';padding:0 24px 16px;font-weight:800;font-size:15px"><span></span>';
	foreach ( $plans as $p ) {
		$out .= '<span style="text-align:center">' . esc_html( $p['name'] ) . '</span>';
	}
	$out .= '</div>';
	$i    = 0;
	foreach ( $rows as $r ) {
		if ( isset( $r['group'] ) ) {
			$out .= '<div class="k mutd" style="padding:28px 24px 10px">' . esc_html( $r['group'] ) . '</div>';
			$i    = 0;
			continue;
		}
		$out .= '<div class="tr" style="display:grid;' . $cols . ';padding:16px 24px;font-size:15px;border-radius:14px' . ( $i++ % 2 ? ';background:#F6F3EE' : '' ) . '"><span>' . esc_html( $r['label'] ) . '</span>';
		foreach ( $r['values'] as $v ) {
			$out .= '<span style="text-align:center">' . sib_v9_cell( $v ) . '</span>';
		}
		$out .= '</div>';
	}
	return $out . '</div>';
}

/** Plan cards in the design's style (night card for the popular plan). */
function sib_v9_plan_cards( array $aud, string $signup ): string {
	$n   = count( $aud['plans'] );
	$out = '<div class="plans bn" style="grid-template-columns:repeat(' . $n . ',1fr);margin-top:40px">';
	foreach ( $aud['plans'] as $p ) {
		$pop  = ! empty( $p['popular'] );
		$mut  = $pop ? '#B8B4C4' : '#6B6779';
		$free = 0 === (int) $p['month'];
		$out .= '<div class="bc ' . ( $pop ? 'c-night' : 'c-wh' ) . ' lift" style="padding:32px;gap:6px">'
			. ( $pop ? '<span class="tg" style="position:absolute;right:20px;top:20px;background:#FF6A2B;color:#16141F">' . esc_html__( 'Most popular', 'shopinbos' ) . '</span>' : '' )
			. '<div class="H h3">' . esc_html( $p['name'] ) . '</div><div style="font-size:15px;color:' . $mut . '">' . esc_html( $p['for'] ) . '</div>'
			. '<div class="H" style="font-size:' . ( $n > 3 ? '46' : '56' ) . 'px;margin:22px 0 2px;line-height:1"><span class="pm">' . ( $free ? 'Free' : esc_html( sib_v9_price( (int) $p['month'] ) ) ) . '</span><span class="py">' . ( $free ? 'Free' : esc_html( sib_v9_price( (int) round( $p['year'] / 12 ) ) ) ) . '</span></div>'
			. '<div style="font-size:14px;color:' . $mut . '"><span class="pm">' . ( $free ? esc_html__( 'forever', 'shopinbos' ) : esc_html__( 'per month', 'shopinbos' ) ) . '</span><span class="py">' . ( $free ? esc_html__( 'forever', 'shopinbos' ) : esc_html( sprintf( 'per month, %s billed yearly', sib_v9_price( (int) $p['year'] ) ) ) ) . '</span></div>'
			. '<div style="font-size:14px;font-weight:700;margin-top:10px">+ ' . esc_html( $p['fee'] ) . '</div>'
			. '<a class="btn ' . ( $pop ? 'b-org' : ( $free ? 'b-line' : 'b-ink' ) ) . '" href="' . esc_url( $signup . ( false === strpos( $signup, '?' ) ? '?' : '&' ) . 'plan=' . rawurlencode( $p['key'] ) ) . '" style="margin:22px 0 22px">' . esc_html( $p['cta'] ) . '</a><div style="display:grid;gap:12px">';
		foreach ( $p['points'] as $pt ) {
			$out .= '<div class="tick" style="font-size:15px"><b>✓</b>' . esc_html( $pt ) . '</div>';
		}
		$out .= '</div></div>';
	}
	return $out . '</div>';
}

add_filter( 'sib_v9_fill', function ( string $html, string $slug ): string {
	if ( 'pricing' !== $slug || ! function_exists( 'sib_pricing_data' ) ) {
		return $html;
	}
	$d    = sib_pricing_data();
	$aud  = $d['audiences'] ?? [];
	$app  = rtrim( (string) ( function_exists( 'sib_setting' ) ? sib_setting( 'app_url' ) : '' ) ?: 'https://app.shopinbos.com', '/' );
	$sell = $aud['sellers'] ?? null;
	if ( ! $sell ) {
		return $html;
	}
	// Plans: seller cards with the monthly/yearly switch.
	$html = (string) preg_replace( '#\s*·\s*save \[x\]%#', ' · 2 months free', $html );
	$a = strpos( $html, '<div class="plans bn rvs"' );
	$b = false === $a ? false : strpos( $html, '<p class="mutd"', $a );
	if ( false !== $b ) { // the plans grid and the end of the monthly/yearly switch
		$html = substr( $html, 0, $a ) . sib_v9_plan_cards( $sell, $app . '/signup?source=website' ) . "</div>\n" . substr( $html, $b );
	}
	$html = (string) preg_replace( '#<p class="mutd"[^>]*>Prices in \[brackets\][^<]*</p>#', '<p class="mutd" style="font-size:14px;margin-top:24px">' . esc_html( $sell['lead'] ) . ' ' . esc_html__( 'Prices in naira. VAT is added where it applies.', 'shopinbos' ) . '</p>', $html );

	// Comparison: sellers, then supplier and delivery partner plans.
	$tables = sib_v9_table( $sell['plans'], $sell['table'] );
	foreach ( [ 'suppliers' => '%%SUPPLIER%%', 'delivery' => '%%PARTNER%%' ] as $k => $link ) {
		if ( empty( $aud[ $k ] ) ) {
			continue;
		}
		$a       = $aud[ $k ];
		$tables .= '<div id="' . esc_attr( $k ) . '" style="margin-top:96px;display:flex;flex-direction:column;gap:16px;max-width:820px"><h2 class="H h2">' . esc_html( $a['title'] ) . '</h2><p class="lead" style="color:#6B6779">' . esc_html( $a['lead'] ) . '</p></div>'
			. sib_v9_plan_cards( $a, sib_v9_tokens( $link ) ) . sib_v9_table( $a['plans'], $a['table'] );
	}
	$html = (string) preg_replace_callback( '#<div class="tbl rv".*?</div></div></div></section>#s', fn() => $tables . '</div></section>', $html, 1 );

	// Fees: the per-sale fee is the plan fee; payouts are instant.
	$fees = array_map( fn( $p ) => $p['fee'], $sell['plans'] );
	$html = (string) preg_replace(
		'#<div class="H h3" style="margin-top:auto">Card and transfer</div><div class="H"([^>]*)>\[x\]%</div><p class="p mutd"([^>]*)>[^<]*</p>#',
		'<div class="H h3" style="margin-top:auto">' . esc_html__( 'Card and transfer', 'shopinbos' ) . '</div><div class="H"$1>' . esc_html( preg_replace( '/[^0-9.%]/', '', end( $fees ) ) . '–' . preg_replace( '/[^0-9.%]/', '', reset( $fees ) ) ) . '</div><p class="p mutd"$2>' . esc_html__( 'per sale, set by your plan. Shown on every payment.', 'shopinbos' ) . '</p>',
		$html
	);
	$html = (string) preg_replace(
		'#<div class="H h3" style="margin-top:auto">Pay on delivery</div><div class="H"([^>]*)>\[x\]%</div><p class="p mutd"([^>]*)>[^<]*</p>#',
		'<div class="H h3" style="margin-top:auto">' . esc_html__( 'Pay on delivery', 'shopinbos' ) . '</div><div class="H"$1>' . esc_html__( 'Same fee', 'shopinbos' ) . '</div><p class="p mutd"$2>' . esc_html__( 'per confirmed delivery, on Growth and Pro', 'shopinbos' ) . '</p>',
		$html
	);

	// Credits: what each job costs, from the credit table.
	$cost = [];
	foreach ( (array) ( $d['credit_costs']['Sellers'] ?? [] ) as $row ) {
		$cost[ $row[0] ] = $row[1];
	}
	$credit = [
		'Build a store with Rex'   => [ 'AI store setup (theme, sections, sample copy)', null ],
		'A short video'            => [ 'Social media caption or ad copy', [ 'A caption or ad', 'Ready to post on Status, Instagram or TikTok.' ] ],
		'A drafted reply'          => [ 'AI chat replies to your customers', null ],
		'A product photo clean-up' => [ 'Remove an image background', null ],
	];
	foreach ( $credit as $title => [ $key, $swap ] ) {
		if ( ! isset( $cost[ $key ] ) ) {
			continue;
		}
		$n    = $cost[ $key ];
		$html = (string) preg_replace_callback(
			'#(<div class="H h3"[^>]*>)' . preg_quote( $title, '#' ) . '(</div><p class="p mutd"[^>]*>)([^<]*)(</p><div class="k orgd"[^>]*>)\[n\] credits#',
			fn( $m ) => $m[1] . esc_html( $swap[0] ?? $title ) . $m[2] . esc_html( $swap[1] ?? $m[3] ) . $m[4] . esc_html( preg_match( '/^\d+$/', $n ) ? $n . ' credits' : $n . ' credit' . ( 0 === strpos( $n, '1 ' ) ? '' : 's' ) ),
			$html
		);
	}
	$html = str_replace( 'Amounts are placeholders until launch.', 'Free includes 20 a month, Starter 150, Growth 500 and Pro 1,500.', $html );
	$html = str_replace( 'Starter, Grow or Pro, you get the same tools.', 'Free, Starter, Growth or Pro, you get the same tools.', $html );
	$html = str_replace( 'Is the Starter plan really free?', 'Is the Free plan really free?', $html );
	$html = str_replace( 'You only pay a small fee when a customer pays you.', 'You only pay 3% when a customer pays you, and less on a paid plan.', $html );
	return str_replace( 'Every plan includes some each month, and you can top up. [Confirm amounts.]', 'Every plan includes some each month (20 to 1,500), and you can top up from ₦2,000.', $html );
}, 10, 2 );

/* ---------- Help centre index ---------- */

add_filter( 'sib_v9_fill', function ( string $html, string $slug ): string {
	if ( 'help' !== $slug ) {
		return $html;
	}
	$q     = sanitize_text_field( wp_unslash( $_GET['q'] ?? '' ) ); // phpcs:ignore WordPress.Security.NonceVerification
	$topic = sanitize_title( wp_unslash( $_GET['topic'] ?? '' ) ); // phpcs:ignore WordPress.Security.NonceVerification

	// Search box.
	$form = '<form action="/help/" method="get" role="search" class="up d3" style="display:flex;align-items:center;gap:8px;background:#fff;border-radius:999px;padding:6px 6px 6px 24px;max-width:620px;box-shadow:0 20px 50px -30px rgba(22,20,31,.4)"><input type="search" name="q" value="' . esc_attr( $q ) . '" placeholder="' . esc_attr__( 'Try “payouts”, “pay on delivery”, “domain”…', 'shopinbos' ) . '" aria-label="' . esc_attr__( 'Search help', 'shopinbos' ) . '" style="flex:1;min-width:0;border:0;outline:0;font-size:16px;background:transparent"><button class="btn b-ink" style="height:46px;font-size:15px">' . esc_html__( 'Search', 'shopinbos' ) . '</button></form>';
	$html = (string) preg_replace_callback( '#<div class="up d3"[^>]*><span[^>]*>Try “payouts”.*?</span><span class="btn b-ink"[^>]*>Search</span></div>#s', fn() => $form, $html, 1 );

	// Topic cards → their category.
	$map = [
		'Getting started'         => 'getting-started',
		'Payments and money'      => 'payments-and-payouts',
		'Delivery'                => 'delivery-and-pay-on-delivery',
		'Inbox and channels'      => 'whatsapp-and-social',
		'Find stock and dropship' => 'sourcing-and-dropshipping',
		'Domain and store design' => 'store-and-design',
		'Account and security'    => 'account-and-security',
		'Rex and Peggy'           => '',
	];
	$html = (string) preg_replace_callback( '#<a href="/help/" class="bc c-wh lift"(.*?)<div class="H h3"([^>]*)>([^<]+)</div>#s', function ( $m ) use ( $map ) {
		$t    = html_entity_decode( $m[3] );
		$href = isset( $map[ $t ] ) && $map[ $t ] ? '/help/?topic=' . $map[ $t ] . '#questions' : ( 'Rex and Peggy' === $t ? '/rex-and-peggy/' : '/help/' );
		return '<a href="' . esc_url( $href ) . '" class="bc c-wh lift"' . $m[1] . '<div class="H h3"' . $m[2] . '>' . $m[3] . '</div>';
	}, $html );

	// Questions: search results, a topic, or every article.
	$args = [ 'post_type' => 'sib_help', 'post_status' => 'publish', 'posts_per_page' => 12, 'orderby' => 'menu_order title', 'order' => 'ASC' ];
	$head = __( 'Popular questions', 'shopinbos' );
	if ( $q ) {
		$args['s'] = $q;
		$head      = sprintf( __( 'Results for “%s”', 'shopinbos' ), $q );
	} elseif ( $topic && ( $term = get_term_by( 'slug', $topic, 'sib_help_category' ) ) ) {
		$args['tax_query'] = [ [ 'taxonomy' => 'sib_help_category', 'terms' => $term->term_id ] ]; // phpcs:ignore WordPress.DB.SlowDBQuery
		$head              = $term->name;
	}
	$posts = get_posts( $args );
	$rows  = '';
	foreach ( $posts as $p ) {
		$rows .= '<a href="' . esc_url( get_permalink( $p ) ) . '" class="row" style="padding:18px 0;font-size:16.5px;border-bottom:1px solid #E7E4EC"><span style="flex:1">' . esc_html( get_the_title( $p ) ) . '</span><span aria-hidden="true">→</span></a>';
	}
	if ( ! $rows ) {
		$rows = '<p class="p" style="padding:18px 0">' . esc_html__( 'Nothing found. Try another word, or message us on WhatsApp.', 'shopinbos' ) . '</p>';
	}
	$html = (string) preg_replace( '#<h2 class="H h2">Popular questions</h2>#', '<h2 class="H h2" id="questions">' . esc_html( $head ) . '</h2>', $html, 1 );
	return (string) preg_replace_callback( '#(<div class="rv" style="border-top:1px solid \#E7E4EC">).*?(</div></div></div></section>)#s', fn( $m ) => $m[1] . $rows . $m[2], $html, 1 );
}, 10, 2 );

/* ---------- Placeholders ---------- */

/** Values for the design's [placeholders]: known settings first, then the admin list. */
function sib_v9_placeholder_values(): array {
	$set = fn( $k ) => function_exists( 'sib_setting' ) ? trim( (string) sib_setting( $k ) ) : '';
	$v   = [];
	$wa  = preg_replace( '/\D/', '', $set( 'whatsapp_support' ) );
	if ( $wa ) {
		$local                  = '0' . substr( $wa, -10 );
		$v['[support number]'] = substr( $local, 0, 4 ) . ' ' . substr( $local, 4, 3 ) . ' ' . substr( $local, 7 );
	}
	foreach ( explode( "\n", (string) $set( 'v9_fills' ) ) as $line ) {
		if ( false !== strpos( $line, '=>' ) ) {
			[ $k, $val ] = array_map( 'trim', explode( '=>', $line, 2 ) );
			if ( '' !== $k ) {
				$v[ $k ] = $val;
			}
		}
	}
	return $v;
}

/** Fill the placeholders; [date] becomes today's date (blog/help/legal headers use their own dates). */
function sib_v9_fill_placeholders( string $html ): string {
	$v = sib_v9_placeholder_values() + [ '[date]' => wp_date( 'j F Y' ) ];
	// A value left empty removes the placeholder (e.g. "[Confirm amounts.] =>").
	return strtr( $html, array_map( 'esc_html', $v ) );
}
add_filter( 'sib_v9_fill', fn( $html ) => sib_v9_fill_placeholders( (string) $html ), 99 );

/** Placeholders still showing on a built page. */
function sib_v9_open_placeholders(): array {
	$open = [];
	$vals = sib_v9_placeholder_values() + [ '[date]' => '' ];
	foreach ( array_unique( sib_v9_routes() ) as $slug ) {
		$text = wp_strip_all_tags( (string) apply_filters( 'sib_v9_fill', sib_v9_page( $slug ), $slug ) );
		if ( preg_match_all( '/\[[A-Za-z][^\]\[]{0,60}\]/u', $text, $m ) ) {
			foreach ( array_unique( $m[0] ) as $p ) {
				if ( ! isset( $vals[ $p ] ) ) {
					$open[ $p ][] = $slug;
				}
			}
		}
	}
	ksort( $open );
	return $open;
}
