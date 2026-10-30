<?php
/**
 * Website V9: "Who it's for" pages.
 *  - /for/ (hub) and /for/{slug}/ (one page per kind of business), content from v9/for.json.
 *    These addresses have no WordPress object: they're matched on the request path, WordPress's 404 handling is
 *    skipped for them (pre_handle_404) and the V9 renderer answers 200.
 *  - Plans come from the plugin's pricing.json; "Learn more" links are real blog posts, help articles, Academy
 *    lessons and trend reports found by keyword at render time.
 *  - The header's "Solutions → Who it's for" menu points to these pages (sib_v9_fill, every built page).
 *  - Listed in the core sitemap (wp-sitemap-sibfor-1.xml) once V9 is live.
 */

defined( 'ABSPATH' ) || exit;

/** The page data (v9/for.json). */
function sib_v9_for_data(): array {
	static $d = null;
	if ( null === $d ) {
		$d = (array) json_decode( (string) @file_get_contents( get_theme_file_path( 'v9/for.json' ) ), true ); // phpcs:ignore
		$d += [ 'hub' => [], 'pages' => [] ];
	}
	return $d;
}

/** '' for the hub, the page slug for a page, null when the path isn't one of ours. */
function sib_v9_for_slug(): ?string {
	if ( ! function_exists( 'sib_v9_path' ) ) {
		return null;
	}
	$path = sib_v9_path();
	if ( '/for/' === $path ) {
		return '';
	}
	if ( preg_match( '#^/for/([a-z0-9-]+)/$#', $path, $m ) && isset( sib_v9_for_data()['pages'][ $m[1] ] ) ) {
		return $m[1];
	}
	return null;
}

function sib_v9_is_for(): bool {
	return null !== sib_v9_for_slug();
}

/*
 * Don't let WordPress treat these addresses as not found. No rewrite rule matches them, so WordPress sets the
 * "error=404" query var, and WP::send_headers() then sends a 404 status with no-cache headers before any template
 * runs. Dropping it here (the 'request' filter runs first) leaves a harmless front-page query; the V9 renderer
 * answers at template_redirect. pre_handle_404 is a second guard.
 */
function sib_v9_for_live(): bool {
	return function_exists( 'sib_v9_active' ) && sib_v9_active() && sib_v9_is_for();
}

add_filter( 'request', function ( $vars ) {
	if ( isset( $vars['error'] ) && '404' === (string) $vars['error'] && sib_v9_for_live() ) {
		unset( $vars['error'] );
	}
	return $vars;
} );
add_filter( 'pre_handle_404', fn( $pre ) => sib_v9_for_live() ? true : $pre );

add_filter( 'sib_v9_content_templates', function ( array $t ): array {
	$t['sib_v9_is_for'] = 'sib_v9_for_page';
	return $t;
} );

/* ---------- Header menu ---------- */

/** Point the "Who it's for" menu items (desktop mega menu and phone menu) at these pages and add "See everyone". */
function sib_v9_for_menu( string $html ): string {
	if ( false !== strpos( $html, 'data-for-all' ) ) {
		return $html;
	}
	$map = [ 'Online sellers' => 'online-sellers', 'Fashion and beauty' => 'fashion-and-beauty', 'Market traders' => 'market-traders' ];
	foreach ( $map as $label => $slug ) {
		$q    = preg_quote( $label, '#' );
		$url  = '/for/' . $slug . '/';
		$html = (string) preg_replace( '#<a class="mi" href="[^"]*">((?:(?!</a>).)*?<b>' . $q . '</b>)#s', '<a class="mi" href="' . $url . '">$1', $html );
		$html = (string) preg_replace( '#<a href="[^"]*"( style="display:flex;gap:12px;align-items:center;padding:10px 0">(?:(?!</a>).)*?<span style="font-weight:600">' . $q . '</span>)#s', '<a href="' . $url . '"$1', $html );
	}
	$all  = esc_html__( 'See everyone it’s for', 'shopinbos' );
	$html = (string) preg_replace( '#(<a class="mi" href="/for/market-traders/">(?:(?!</a>).)*?</a>)#s', '$1<a class="more" data-for-all href="/for/" style="padding:8px 12px;font-size:14.5px">' . $all . ' →</a>', $html, 1 );
	$html = (string) preg_replace( '#(<a href="/for/market-traders/" style="display:flex;gap:12px;align-items:center;padding:10px 0">(?:(?!</a>).)*?</a>)#s', '$1<a data-for-all href="/for/" style="display:flex;padding:6px 0 10px;font-weight:700;font-size:15px">' . $all . ' →</a>', $html, 1 );
	return $html;
}

add_filter( 'sib_v9_fill', fn( $html, $slug ) => sib_v9_for_menu( (string) $html ), 30, 2 );

/* ---------- Pieces ---------- */

function sib_v9_for_cta_url( string $kind, string $plan = '' ): string {
	$token = [ 'supplier' => '%%SUPPLIER%%', 'partner' => '%%PARTNER%%' ][ $kind ] ?? '%%SIGNUP%%';
	$url   = html_entity_decode( sib_v9_tokens( $token ) );
	return $plan ? $url . ( false === strpos( $url, '?' ) ? '?' : '&' ) . 'plan=' . rawurlencode( $plan ) : $url;
}

/** The plan for an audience and key from pricing.json, with the audience's other plans. */
function sib_v9_for_plan( array $want ): ?array {
	if ( ! function_exists( 'sib_pricing_data' ) ) {
		return null;
	}
	$aud = sib_pricing_data()['audiences'][ $want['audience'] ?? '' ] ?? null;
	if ( ! $aud ) {
		return null;
	}
	foreach ( (array) $aud['plans'] as $p ) {
		if ( ( $p['key'] ?? '' ) === ( $want['key'] ?? '' ) ) {
			return [ $p, $aud ];
		}
	}
	return null;
}

function sib_v9_for_price( array $p ): string {
	return 0 === (int) $p['month'] ? __( 'Free', 'shopinbos' ) : sprintf( '%s/mo', sib_v9_price( (int) $p['month'] ) );
}

/** Real posts, help articles, Academy lessons and trend reports that match the page's words. */
function sib_v9_for_links( array $words, int $max = 6 ): array {
	$types = [ 'post' => __( 'Blog', 'shopinbos' ), 'sib_help' => __( 'Help', 'shopinbos' ), 'sib_lesson' => __( 'Academy', 'shopinbos' ), 'sib_trend' => __( 'Trending', 'shopinbos' ) ];
	$found = [];
	// Titles that name the word first, then posts that only mention it.
	foreach ( [ [ 'post_title' ], [ 'post_title', 'post_excerpt', 'post_content' ] ] as $cols ) {
		foreach ( $words as $w ) {
			foreach ( array_keys( $types ) as $type ) {
				// Trend reports and help articles mention everything: only match those by title.
				$loose = count( $cols ) > 1;
				if ( ! post_type_exists( $type ) || count( $found[ $type ] ?? [] ) >= 2 || ( $loose && in_array( $type, [ 'sib_trend', 'sib_help' ], true ) ) ) {
					continue;
				}
				$ps = get_posts( [ 'post_type' => $type, 'post_status' => 'publish', 's' => $w, 'search_columns' => $cols, 'numberposts' => 2, 'no_found_rows' => true, 'suppress_filters' => false ] );
				foreach ( $ps as $p ) {
					$found[ $type ][ $p->ID ] = $p;
				}
			}
		}
	}
	$found = array_filter( $found );
	// Take one of each kind in turn, so a page gets a mix.
	$out = [];
	while ( count( $out ) < $max && $found ) {
		foreach ( array_keys( $found ) as $type ) {
			$p = array_shift( $found[ $type ] );
			if ( $p && ! isset( $out[ $p->ID ] ) && count( $out ) < $max ) {
				$out[ $p->ID ] = [ $types[ $type ], $p ];
			}
			if ( ! $found[ $type ] ) {
				unset( $found[ $type ] );
			}
		}
	}
	return array_values( $out );
}

function sib_v9_for_faq( array $faq, string $title ): string {
	$chev  = '<span style="flex:none;width:34px;height:34px;border-radius:99px;background:#F4F3F7;display:flex;align-items:center;justify-content:center"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16141F" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg></span>';
	$items = '';
	foreach ( $faq as $i => [ $q, $a ] ) {
		$items .= '<details' . ( 0 === $i ? ' open' : '' ) . ' style="border-bottom:1px solid #E7E4EC;padding:24px 0"><summary style="font-size:19px;font-weight:600;display:flex;justify-content:space-between;gap:20px;align-items:center">' . esc_html( $q ) . $chev . '</summary><p style="font-size:16.5px;line-height:1.65;color:#5E5A6B;margin:12px 0 0;max-width:680px">' . esc_html( $a ) . '</p></details>';
	}
	$schema = [
		'@context'   => 'https://schema.org',
		'@type'      => 'FAQPage',
		'mainEntity' => array_map( fn( $f ) => [ '@type' => 'Question', 'name' => $f[0], 'acceptedAnswer' => [ '@type' => 'Answer', 'text' => $f[1] ] ], $faq ),
	];
	return '<section style="background:#F6F3EE" class="sec"><div class="wrap faqg" style="display:grid;grid-template-columns:.8fr 1.2fr;gap:72px">'
		. '<div><h2 class="H h2">' . esc_html( $title ) . ' <span class="it orgd">' . esc_html__( 'questions.', 'shopinbos' ) . '</span></h2><p class="lead" style="margin-top:20px;font-size:18px">' . esc_html__( 'Chat with us on WhatsApp, 8am to 8pm, in English or Pidgin.', 'shopinbos' ) . '</p><a class="btn b-line" href="/contact/" style="margin-top:28px">' . esc_html__( 'Talk to us', 'shopinbos' ) . '</a></div>'
		. '<div style="border-top:1px solid #E7E4EC">' . $items . '</div></div></section>'
		. '<script type="application/ld+json">' . wp_json_encode( $schema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . '</script>';
}

/** The dark sign-up band, with the right button for sellers, suppliers or delivery partners. */
function sib_v9_for_band( string $title, string $text, string $buttons, string $img ): string {
	return '<section class="night" style="padding:40px 0;overflow:hidden"><div class="wrap"><div class="ctag" style="display:grid;grid-template-columns:1.05fr .95fr;gap:56px;align-items:center;background:radial-gradient(120% 120% at 0% 100%,#2B1D2A 0%,#1C1926 55%);border-radius:36px;padding:0 0 0 64px;overflow:hidden;box-shadow:inset 0 0 0 1px rgba(255,255,255,.06)">'
		. '<div style="display:flex;flex-direction:column;gap:24px;padding:72px 0"><h2 class="H" style="font-size:clamp(40px,5vw,72px);line-height:.98">' . esc_html( $title ) . '</h2><p class="lead" style="color:#B8B4C4;max-width:480px">' . esc_html( $text ) . '</p>'
		. '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">' . $buttons . '</div>'
		. '<div style="display:flex;gap:18px;flex-wrap:wrap;font-size:14px;color:#A9A5B6"><span>✓ ' . esc_html__( 'Free to start', 'shopinbos' ) . '</span><span>✓ ' . esc_html__( 'Run it from your phone', 'shopinbos' ) . '</span><span>✓ ' . esc_html__( 'Help on WhatsApp', 'shopinbos' ) . '</span></div></div>'
		. '<div class="hm" style="height:520px"><img decoding="async" loading="lazy" src="' . esc_url( sib_v9_img( $img ) ) . '" alt="" style="width:100%;height:100%;object-fit:cover"></div>'
		. '</div></div></section>';
}

function sib_v9_for_card( string $slug, array $p ): string {
	return '<a href="' . esc_url( '/for/' . $slug . '/' ) . '" class="lift" style="min-width:0"><div class="zm" style="border-radius:24px;overflow:hidden;aspect-ratio:3/4;background:#EFEBE4"><img decoding="async" loading="lazy" src="' . esc_url( sib_v9_img( $p['img'] ) ) . '" alt="" style="width:100%;height:100%;object-fit:cover;object-position:' . esc_attr( $p['pos'] ?? '50% 50%' ) . '"></div>'
		. '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;gap:8px"><b style="font-size:17px">' . esc_html( $p['name'] ) . '</b><span aria-hidden="true">→</span></div><div style="font-size:14.5px;color:#6B6779;margin-top:4px">' . esc_html( $p['short'] ) . '</div></a>';
}

/* ---------- Render ---------- */

function sib_v9_for_page(): ?array {
	$slug = sib_v9_for_slug();
	if ( null === $slug ) {
		return null;
	}
	$out = '' === $slug ? sib_v9_for_hub() : sib_v9_for_single( $slug );
	if ( $out ) {
		$out['html'] = sib_v9_for_menu( $out['html'] );
	}
	return $out;
}

function sib_v9_for_title( string $t ): string {
	return mb_strlen( $t ) <= 58 ? $t . ' · Shopinbos' : $t;
}

function sib_v9_for_hub(): array {
	$d     = sib_v9_for_data();
	$hub   = $d['hub'];
	$pages = $d['pages'];

	$h  = '<section style="background:#F6F3EE;padding:88px 0 72px"><div class="wrap" style="max-width:980px"><span class="k orgd up">' . esc_html( $hub['eyebrow'] ) . '</span>';
	$h .= '<h1 class="H up d1" style="font-size:clamp(44px,5.6vw,84px);line-height:1;margin-top:16px">' . esc_html( $hub['h1'] ) . '</h1>';
	$h .= '<p class="lead up d2" style="margin-top:18px;max-width:680px">' . esc_html( $hub['lead'] ) . '</p>';
	$h .= '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:28px">';
	foreach ( $hub['groups'] as $i => $g ) {
		$h .= '<a class="chip" href="#g' . $i . '">' . esc_html( $g['label'] ) . '</a>';
	}
	$h .= '</div></div></section>';

	foreach ( $hub['groups'] as $i => $g ) {
		$cards = '';
		foreach ( $g['slugs'] as $s ) {
			if ( isset( $pages[ $s ] ) ) {
				$cards .= sib_v9_for_card( $s, $pages[ $s ] );
			}
		}
		$h .= '<section class="sec" id="g' . $i . '" style="background:#fff;padding:' . ( 0 === $i ? '88' : '24' ) . 'px 0 64px"><div class="wrap"><h2 class="H h2" style="font-size:clamp(32px,3.6vw,52px)">' . esc_html( $g['label'] ) . '</h2>'
			. '<div class="g4 g4m2" style="display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin-top:36px">' . $cards . '</div></div></section>';
	}
	$h .= '<div style="height:64px;background:#fff"></div>';
	$h .= sib_v9_for_faq( (array) $hub['faq'], __( 'Common', 'shopinbos' ) );
	$btns = '<a class="btn b-org" href="' . esc_url( sib_v9_for_cta_url( 'signup' ) ) . '">' . esc_html__( 'Start your shop free', 'shopinbos' ) . '</a>'
		. '<a class="btn" style="background:rgba(255,255,255,.1);color:#fff" href="' . esc_url( sib_v9_for_cta_url( 'supplier' ) ) . '">' . esc_html__( 'Join as a supplier', 'shopinbos' ) . '</a>'
		. '<a class="btn" style="background:rgba(255,255,255,.1);color:#fff" href="' . esc_url( sib_v9_for_cta_url( 'partner' ) ) . '">' . esc_html__( 'Join as a delivery partner', 'shopinbos' ) . '</a>';
	$h .= sib_v9_for_band( __( 'Find your place on Shopinbos.', 'shopinbos' ), __( 'Sellers start free. Suppliers and delivery partners join and get verified free.', 'shopinbos' ), $btns, '785d220f0731d784013ce7d3eacead8d.webp' );

	return [
		'slug'        => 'for',
		'html'        => sib_v9_wrap( $h, 'blog-post' ),
		'title'       => sib_v9_for_title( $hub['title'] ),
		'description' => $hub['description'],
	];
}

function sib_v9_for_single( string $slug ): ?array {
	$d = sib_v9_for_data();
	$p = $d['pages'][ $slug ] ?? null;
	if ( ! $p ) {
		return null;
	}
	$cta   = $p['cta'];
	$plan  = sib_v9_for_plan( (array) $p['plan'] );
	$main  = sib_v9_for_cta_url( $cta['kind'], $plan ? $plan[0]['key'] : '' );
	$check = '<b>✓</b>';

	// Hero.
	$h  = '<section style="background:#F6F3EE;padding:56px 0 80px"><div class="wrap"><a href="/for/" class="more mutd" style="font-size:14px">← ' . esc_html__( 'Who it’s for', 'shopinbos' ) . '</a>';
	$h .= '<div class="g2" style="display:grid;grid-template-columns:1.1fr .9fr;gap:64px;align-items:center;margin-top:28px"><div>';
	$h .= '<span class="k orgd up">' . esc_html( $p['eyebrow'] ) . '</span><h1 class="H up d1" style="font-size:clamp(42px,5.2vw,80px);line-height:1;margin-top:16px">' . esc_html( $p['h1'] ) . '</h1>';
	$h .= '<p class="lead up d2" style="margin-top:20px;max-width:620px">' . esc_html( $p['lead'] ) . '</p>';
	$h .= '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:32px"><a class="btn b-org" href="' . esc_url( sib_v9_for_cta_url( $cta['kind'] ) ) . '">' . esc_html( $cta['button'] ) . '</a><a class="btn b-line" href="#plan">' . esc_html__( 'Which plan fits', 'shopinbos' ) . '</a></div>';
	$h .= '</div><div style="border-radius:32px;overflow:hidden;aspect-ratio:4/5;max-height:600px;background:#EFEBE4"><img fetchpriority="high" decoding="async" src="' . esc_url( sib_v9_img( $p['img'] ) ) . '" alt="" style="width:100%;height:100%;object-fit:cover;object-position:' . esc_attr( $p['pos'] ?? '50% 50%' ) . '"></div></div></div></section>';

	// Their problems.
	$cards = '';
	foreach ( $p['problems'] as $i => [ $t, $x ] ) {
		$cards .= '<div class="bc c-sand" style="gap:10px"><span class="H orgd" style="font-size:40px;line-height:1">0' . ( $i + 1 ) . '</span><div class="H h3" style="margin-top:12px">' . esc_html( $t ) . '</div><p class="p mutd">' . esc_html( $x ) . '</p></div>';
	}
	$h .= '<section class="sec" style="background:#fff"><div class="wrap"><span class="k mutd">' . esc_html__( 'Sound familiar?', 'shopinbos' ) . '</span><h2 class="H h2" style="margin-top:14px;max-width:900px">' . esc_html__( 'What gets in the way.', 'shopinbos' ) . '</h2>'
		. '<div class="bn" style="grid-template-columns:repeat(4,1fr);margin-top:48px">' . $cards . '</div></div></section>';

	// How Shopinbos Business helps.
	$cards = '';
	foreach ( $p['helps'] as [ $t, $x ] ) {
		$cards .= '<div class="bc c-wh" style="gap:10px"><div class="tick" style="font-size:18px;font-weight:700">' . $check . esc_html( $t ) . '</div><p class="p mutd" style="padding-left:34px">' . esc_html( $x ) . '</p></div>';
	}
	$app = 'delivery' === ( $p['plan']['audience'] ?? '' ) ? __( 'the delivery partner portal', 'shopinbos' ) : ( 'suppliers' === ( $p['plan']['audience'] ?? '' ) ? __( 'the supplier portal', 'shopinbos' ) : __( 'Shopinbos Business', 'shopinbos' ) );
	$h .= '<section class="sec" style="background:#F6F3EE"><div class="wrap"><span class="k orgd">' . esc_html__( 'What you get', 'shopinbos' ) . '</span><h2 class="H h2" style="margin-top:14px;max-width:980px">' . esc_html( sprintf( __( 'How %s helps.', 'shopinbos' ), $app ) ) . '</h2>'
		. '<div class="bn" style="grid-template-columns:repeat(3,1fr);margin-top:48px">' . $cards . '</div></div></section>';

	// Which plan fits.
	if ( $plan ) {
		[ $pl, $aud ] = $plan;
		$points = '';
		foreach ( $pl['points'] as $pt ) {
			$points .= '<div class="tick" style="font-size:15px">' . $check . esc_html( $pt ) . '</div>';
		}
		$others = '';
		foreach ( $aud['plans'] as $o ) {
			$on      = $o['key'] === $pl['key'];
			$others .= '<div class="row" style="padding:14px 4px;font-size:15px' . ( $on ? ';font-weight:700' : '' ) . '"><span style="flex:1">' . esc_html( $o['name'] ) . ( $on ? ' <span class="tg og" style="margin-left:6px">' . esc_html__( 'Fits you', 'shopinbos' ) . '</span>' : '' ) . '</span><span>' . esc_html( sib_v9_for_price( $o ) ) . '</span><span class="mutd" style="min-width:150px;text-align:right">' . esc_html( $o['fee'] ) . '</span></div>';
		}
		$h .= '<section class="sec" id="plan" style="background:#fff"><div class="wrap g2" style="display:grid;grid-template-columns:1fr 1fr;gap:64px;align-items:start">'
			. '<div><span class="k mutd">' . esc_html__( 'Which plan fits', 'shopinbos' ) . '</span><h2 class="H h2" style="margin-top:14px">' . esc_html( $pl['name'] ) . ' <span class="it orgd">' . esc_html__( 'fits you best.', 'shopinbos' ) . '</span></h2>'
			. '<p class="lead" style="margin-top:20px">' . esc_html( $p['plan']['why'] ) . '</p>'
			. '<div style="margin-top:32px;border-top:1px solid #F1EFF4">' . $others . '</div>'
			. '<a class="more" href="/pricing/" style="margin-top:20px">' . esc_html__( 'Compare every plan', 'shopinbos' ) . ' →</a></div>'
			. '<div class="bc c-night" style="padding:36px;gap:6px"><span class="k" style="color:#8BE3D3">' . esc_html( $aud['label'] ) . '</span><div class="H h3" style="margin-top:8px">' . esc_html( $pl['name'] ) . '</div><div style="font-size:15px;color:#B8B4C4">' . esc_html( $pl['for'] ) . '</div>'
			. '<div class="H" style="font-size:56px;margin:22px 0 2px;line-height:1">' . esc_html( 0 === (int) $pl['month'] ? __( 'Free', 'shopinbos' ) : sib_v9_price( (int) $pl['month'] ) ) . '</div><div style="font-size:14px;color:#B8B4C4">' . esc_html( 0 === (int) $pl['month'] ? __( 'forever', 'shopinbos' ) : __( 'per month', 'shopinbos' ) ) . ' · + ' . esc_html( $pl['fee'] ) . '</div>'
			. '<a class="btn b-org" href="' . esc_url( $main ) . '" style="margin:24px 0;align-self:flex-start">' . esc_html( $pl['cta'] ) . '</a><div style="display:grid;gap:12px">' . $points . '</div>'
			. '<p style="font-size:13px;color:#A9A5B6;margin:22px 0 0">' . esc_html__( 'VAT is added where it applies.', 'shopinbos' ) . '</p></div>'
			. '</div></section>';
	}

	// A day with Shopinbos (an example).
	$steps = '';
	foreach ( $p['day']['steps'] as $i => [ $when, $what ] ) {
		$steps .= '<div class="bc c-wh" style="gap:10px"><span class="tg tl" style="align-self:flex-start">' . esc_html( $when ) . '</span><p class="p" style="margin-top:6px">' . esc_html( $what ) . '</p></div>';
	}
	$h .= '<section class="sec" style="background:#E2F6F1"><div class="wrap"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="k" style="color:#0C4A44">' . esc_html__( 'A day with Shopinbos', 'shopinbos' ) . '</span><span class="tg">' . esc_html__( 'Example', 'shopinbos' ) . '</span></div>'
		. '<h2 class="H h2" style="margin-top:14px;font-size:clamp(30px,3.4vw,48px);max-width:900px">' . esc_html( $p['day']['who'] ) . '</h2>'
		. '<div class="bn" style="grid-template-columns:repeat(3,1fr);margin-top:40px">' . $steps . '</div>'
		. '<p class="mutd" style="font-size:14px;margin-top:24px">' . esc_html__( 'This is a made-up example to show how the app fits a working day. It isn’t a real customer, and it doesn’t promise any result.', 'shopinbos' ) . '</p></div></section>';

	// Learn more: real posts found by keyword.
	$links = sib_v9_for_links( (array) ( $p['links'] ?? [] ) );
	if ( $links ) {
		$cards = '';
		foreach ( $links as [ $kind, $post ] ) {
			$cards .= '<a href="' . esc_url( get_permalink( $post ) ) . '" class="bc c-wh lift" style="gap:12px;min-height:180px"><span class="tg og" style="align-self:flex-start">' . esc_html( $kind ) . '</span><div class="H" style="font-size:22px;line-height:1.15;margin-top:auto">' . esc_html( wp_html_excerpt( get_the_title( $post ), 110, '…' ) ) . '</div><span class="more" style="font-size:14px">' . esc_html__( 'Read', 'shopinbos' ) . ' →</span></a>';
		}
		$h .= '<section class="sec" style="background:#fff"><div class="wrap"><div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-end;flex-wrap:wrap"><h2 class="H h2">' . esc_html__( 'Learn more.', 'shopinbos' ) . '</h2><div style="display:flex;gap:18px;flex-wrap:wrap"><a class="more" href="/academy/">' . esc_html__( 'Academy', 'shopinbos' ) . ' →</a><a class="more" href="/trending/">' . esc_html__( 'Trending', 'shopinbos' ) . ' →</a><a class="more" href="/help/">' . esc_html__( 'Help centre', 'shopinbos' ) . ' →</a></div></div>'
			. '<div class="bn" style="grid-template-columns:repeat(3,1fr);margin-top:40px">' . $cards . '</div></div></section>';
	}

	$h .= sib_v9_for_faq( (array) $p['faq'], $p['name'] );

	// Others like you.
	$group = [];
	foreach ( $d['hub']['groups'] as $g ) {
		if ( in_array( $slug, $g['slugs'], true ) ) {
			$group = $g['slugs'];
		}
	}
	$chips = '';
	foreach ( array_unique( array_merge( $group, array_keys( $d['pages'] ) ) ) as $s ) {
		if ( $s !== $slug && isset( $d['pages'][ $s ] ) ) {
			$chips .= '<a class="chip" href="' . esc_url( '/for/' . $s . '/' ) . '">' . esc_html( $d['pages'][ $s ]['name'] ) . '</a>';
		}
	}
	$h .= '<section style="background:#fff;padding:72px 0"><div class="wrap"><span class="k mutd">' . esc_html__( 'Also on Shopinbos', 'shopinbos' ) . '</span><div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px">' . $chips . '<a class="chip on" href="/for/">' . esc_html__( 'See everyone it’s for', 'shopinbos' ) . '</a></div></div></section>';

	// Sign-up band.
	$btns = '<a class="btn b-org" href="' . esc_url( sib_v9_for_cta_url( $cta['kind'] ) ) . '">' . esc_html( $cta['button'] ) . '</a>';
	if ( ! empty( $cta['second'] ) ) {
		[ $to, $label ] = $cta['second'];
		$href           = in_array( $to, [ 'signup', 'supplier', 'partner' ], true ) ? sib_v9_for_cta_url( $to ) : $to;
		$btns          .= '<a class="btn" style="background:rgba(255,255,255,.1);color:#fff" href="' . esc_url( $href ) . '">' . esc_html( $label ) . '</a>';
	}
	$h .= sib_v9_for_band( $cta['title'], $cta['text'], $btns, $p['img'] );

	return [
		'slug'        => 'for-page',
		'html'        => sib_v9_wrap( $h, 'blog-post' ),
		'title'       => sib_v9_for_title( $p['seo_title'] ),
		'description' => $p['seo_desc'],
		'crumbs'      => [ [ __( 'Who it’s for', 'shopinbos' ), home_url( '/for/' ) ] ],
	];
}

/* ---------- Sitemap (core sitemaps: /wp-sitemap-sibfor-1.xml), once V9 is live ---------- */

add_action( 'wp_sitemaps_init', function ( $server ) {
	if ( ! class_exists( 'WP_Sitemaps_Provider' ) || ! function_exists( 'sib_v9_launched' ) || ! sib_v9_launched() ) {
		return;
	}
	$server->registry->add_provider( 'sibfor', new class() extends WP_Sitemaps_Provider {
		public function __construct() {
			$this->name        = 'sibfor';
			$this->object_type = 'sibfor';
		}
		public function get_url_list( $page_num, $object_subtype = '' ) {
			$urls = [ [ 'loc' => home_url( '/for/' ) ] ];
			foreach ( array_keys( sib_v9_for_data()['pages'] ) as $s ) {
				$urls[] = [ 'loc' => home_url( '/for/' . $s . '/' ) ];
			}
			return $urls;
		}
		public function get_max_num_pages( $object_subtype = '' ) {
			return 1;
		}
	} );
} );
