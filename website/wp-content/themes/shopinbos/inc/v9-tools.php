<?php
/**
 * Website V9: the free tools (/tools/, /tools/{slug}/) and the free PDFs (/resources/, /resources/{slug}/).
 *  - Tools keep the plugin's fields (sib_tool_markup()) and maths (assets/js/tools.js, enqueued here because
 *    V9 pages dequeue every other script), in a V9 card. Results can be saved in the app or emailed (lead kind "tool").
 *  - Guides keep the lead form (sib_render_lead_form(), kind "download"); the plugin's footer script sends it
 *    and shows the download button. Fields and notices are styled in v9/prose.css ("Tools and resources").
 */

defined( 'ABSPATH' ) || exit;

add_filter( 'sib_v9_content_templates', function ( array $t ): array {
	$t['sib_v9_is_tool']          = 'sib_v9_tool';
	$t['sib_v9_is_tools']         = 'sib_v9_tools';
	$t['sib_v9_is_resource']      = 'sib_v9_resource';
	$t['sib_v9_is_resources']     = 'sib_v9_resources';
	return $t;
} );

function sib_v9_is_tool(): bool {
	return is_singular( 'sib_tool' ) && function_exists( 'sib_tool_markup' );
}

function sib_v9_is_tools(): bool {
	return is_post_type_archive( 'sib_tool' );
}

function sib_v9_is_resource(): bool {
	return is_singular( 'sib_resource' ) && function_exists( 'sib_render_lead_form' );
}

function sib_v9_is_resources(): bool {
	return is_post_type_archive( 'sib_resource' );
}

/* The tool maths (and the QR maker) on tool pages: after V9 has dequeued everything else. */
add_action( 'wp_enqueue_scripts', function () {
	if ( empty( $GLOBALS['sib_v9_tool'] ) || 'tool' !== ( $GLOBALS['sib_v9_page'] ?? '' ) ) {
		return;
	}
	if ( in_array( $GLOBALS['sib_v9_tool'], [ 'whatsapp-link', 'qr-label' ], true ) ) {
		wp_enqueue_script( 'sib-qrcode' ); // before the tools script, so the QR code draws on first run
	}
	wp_enqueue_script( 'sib-tools' );
}, 1000 );

/** Search title for a tool or guide, in the V9 "… · Shopinbos" form. A tool's own search title (setup stores it) wins. */
function sib_v9_tools_title( WP_Post $post, string $suffix = '' ): string {
	$own = 'sib_tool' === $post->post_type ? trim( (string) get_post_meta( $post->ID, 'rank_math_title', true ) ) : '';
	if ( '' !== $own && ! preg_match( '/%%?[a-z_]+%%?/', $own ) ) {
		return preg_replace( '/\s*[|·]\s*Shopinbos$/', '', $own ) . ' · Shopinbos';
	}
	return get_the_title( $post ) . $suffix . ' · Shopinbos';
}

function sib_v9_tools_desc( WP_Post $post ): string {
	$own = 'sib_tool' === $post->post_type ? trim( (string) get_post_meta( $post->ID, 'rank_math_description', true ) ) : '';
	if ( '' !== $own && ! preg_match( '/%%?[a-z_]+%%?/', $own ) ) {
		return $own;
	}
	return function_exists( 'sib_seo_auto' ) ? (string) sib_seo_auto( $post )[1] : '';
}

/* ---------- Tools ---------- */

/** The /tools/ sections, in order: [title, short line, tool keys]. Tools not listed fall into the last one. */
function sib_v9_tool_groups(): array {
	return [
		'money'    => [ __( 'Money and pricing', 'shopinbos' ), __( 'Prices, profit, discounts and costs, worked out in naira.', 'shopinbos' ), [ 'profit-margin', 'selling-price', 'markup', 'discount', 'wholesale-price', 'break-even', 'paystack-fee', 'landed-cost', 'naira-dollar' ] ],
		'selling'  => [ __( 'Selling and marketing', 'shopinbos' ), __( 'Words, links and ad plans that bring in orders.', 'shopinbos' ), [ 'product-description', 'caption', 'whatsapp-link', 'ad-budget' ] ],
		'orders'   => [ __( 'Orders and delivery', 'shopinbos' ), __( 'Invoices, receipts, delivery prices and product labels.', 'shopinbos' ), [ 'invoice', 'receipt', 'delivery-fee', 'qr-label' ] ],
		'business' => [ __( 'Business basics', 'shopinbos' ), __( 'Names, slogans, VAT, savings and POS sums.', 'shopinbos' ), [ 'business-name', 'slogan', 'vat', 'ajo', 'pos-charges' ] ],
	];
}

/** Short tag and a sign for each tool's card. */
function sib_v9_tool_look( string $tool ): array {
	return [
		'profit-margin'       => [ __( 'Pricing', 'shopinbos' ), '%', 'c-peach' ],
		'selling-price'       => [ __( 'Pricing', 'shopinbos' ), '₦', 'c-sun' ],
		'paystack-fee'        => [ __( 'Payments', 'shopinbos' ), '1.5%', 'c-mint' ],
		'whatsapp-link'       => [ __( 'Selling', 'shopinbos' ), 'wa.me', 'c-mint' ],
		'landed-cost'         => [ __( 'Importing', 'shopinbos' ), '¥→₦', 'c-lav' ],
		'break-even'          => [ __( 'Planning', 'shopinbos' ), '=0', 'c-sand' ],
		'discount'            => [ __( 'Pricing', 'shopinbos' ), '−15%', 'c-peach' ],
		'ad-budget'           => [ __( 'Marketing', 'shopinbos' ), 'Ads', 'c-sun' ],
		'business-name'       => [ __( 'Words', 'shopinbos' ), 'Aa', 'c-lav' ],
		'product-description' => [ __( 'Words', 'shopinbos' ), '¶', 'c-sand' ],
		'invoice'             => [ __( 'Orders', 'shopinbos' ), 'INV', 'c-sun' ],
		'receipt'             => [ __( 'Orders', 'shopinbos' ), 'PAID', 'c-mint' ],
		'vat'                 => [ __( 'Tax', 'shopinbos' ), '7.5%', 'c-sand' ],
		'pos-charges'         => [ __( 'Payments', 'shopinbos' ), 'POS', 'c-peach' ],
		'delivery-fee'        => [ __( 'Delivery', 'shopinbos' ), 'km', 'c-mint' ],
		'markup'              => [ __( 'Pricing', 'shopinbos' ), '+60%', 'c-sun' ],
		'wholesale-price'     => [ __( 'Pricing', 'shopinbos' ), '×12', 'c-lav' ],
		'caption'             => [ __( 'Social', 'shopinbos' ), '#', 'c-peach' ],
		'qr-label'            => [ __( 'Labels', 'shopinbos' ), 'QR', 'c-lav' ],
		'ajo'                 => [ __( 'Savings', 'shopinbos' ), 'Ajo', 'c-sand' ],
		'naira-dollar'        => [ __( 'Pricing', 'shopinbos' ), '$→₦', 'c-mint' ],
		'slogan'              => [ __( 'Words', 'shopinbos' ), '“ ”', 'c-sun' ],
	][ $tool ] ?? [ __( 'Free tool', 'shopinbos' ), '₦', 'c-sand' ];
}

function sib_v9_tool_card( WP_Post $p ): string {
	$tool             = (string) get_post_meta( $p->ID, 'sib_tool', true );
	[ $tag, $sign, $c ] = sib_v9_tool_look( $tool );
	$dek              = has_excerpt( $p ) ? get_the_excerpt( $p ) : wp_trim_words( wp_strip_all_tags( $p->post_content ), 22 );
	return '<a href="' . esc_url( get_permalink( $p ) ) . '" class="bc c-wh lift" style="gap:14px;padding:28px">'
		. '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px"><span class="bc ' . esc_attr( $c ) . ' H" style="padding:0;width:64px;height:64px;border-radius:18px;align-items:center;justify-content:center;font-size:' . ( mb_strlen( $sign ) > 3 ? '17' : '24' ) . 'px;letter-spacing:-.03em">' . esc_html( $sign ) . '</span><span class="tg">' . esc_html( $tag ) . '</span></div>'
		. '<div class="H h3" style="margin-top:12px">' . esc_html( get_the_title( $p ) ) . '</div>'
		. '<p class="p mutd" style="font-size:15.5px">' . esc_html( wp_html_excerpt( $dek, 150, '…' ) ) . '</p>'
		. '<span class="more" style="margin-top:auto;padding-top:6px">' . esc_html__( 'Open the tool', 'shopinbos' ) . ' →</span></a>';
}

/** Has this browser unlocked the free tools? (The cookie is set when the gate form is sent.) */
function sib_v9_tools_unlocked(): bool {
	return '1' === (string) ( $_COOKIE['sib_tools'] ?? '' );
}

/** The gate over the working tool: email and WhatsApp number once, then every tool opens on this device. */
function sib_v9_tool_gate( string $tool ): string {
	$err = ( 'error' === ( $_GET['sib_lead'] ?? '' ) && 'tool' === ( $_GET['sib_form'] ?? '' ) ) ? sanitize_text_field( rawurldecode( wp_unslash( $_GET['sib_msg'] ?? '' ) ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification
	$id  = 'g' . wp_unique_id();
	$fld = fn( $n, $label, $type, $extra = '' ) => '<label class="field" for="' . $id . $n . '">' . $label . '<input class="input" id="' . $id . $n . '" name="' . $n . '" type="' . $type . '"' . $extra . '></label>';
	return '<div class="v9-gate-card" data-gate-card><form class="bc c-wh v9-gate" method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" data-gate-form novalidate>'
		. '<span class="k orgd">' . esc_html__( 'Free, one time', 'shopinbos' ) . '</span><b class="H v9-gate-h">' . esc_html__( 'Unlock all free tools', 'shopinbos' ) . '</b>'
		. '<p class="mutd" style="margin:0;font-size:15px">' . esc_html__( 'Add your email and WhatsApp number to use every Shopinbos tool. One time. Works for every tool on this phone or computer.', 'shopinbos' ) . '</p>'
		. '<input type="hidden" name="action" value="sib_lead"><input type="hidden" name="kind" value="tool"><input type="hidden" name="gate" value="1">'
		. '<input type="hidden" name="tool" value="' . esc_attr( $tool ) . '"><input type="hidden" name="back" value="' . esc_url( get_permalink() ) . '">'
		. '<label class="hp" aria-hidden="true">Website<input type="text" name="website" tabindex="-1" autocomplete="off"></label>'
		. '<div class="v9-gate-fields">'
		. $fld( 'name', esc_html__( 'Your name (optional)', 'shopinbos' ), 'text', ' autocomplete="name"' )
		. $fld( 'email', esc_html__( 'Email', 'shopinbos' ), 'email', ' required autocomplete="email" placeholder="ada@gmail.com"' )
		. $fld( 'phone', esc_html__( 'WhatsApp number', 'shopinbos' ), 'tel', ' required inputmode="tel" autocomplete="tel" placeholder="0803 412 7790"' )
		. '</div>'
		. '<label class="check v9-gate-tick"><input type="checkbox" name="consent" value="1"> ' . esc_html__( 'Send me selling tips on WhatsApp and email', 'shopinbos' ) . '</label>'
		. '<button type="submit" class="btn b-org">' . esc_html__( 'Unlock free tools', 'shopinbos' ) . '</button>'
		. '<p class="v9-gate-msg' . ( $err ? ' err' : '' ) . '" data-gate-msg role="status" aria-live="polite">' . esc_html( $err ) . '</p>'
		. '<p class="mutd" style="margin:0;font-size:12.5px">' . sprintf( esc_html__( 'We only send selling tips if you tick the box. See our %s.', 'shopinbos' ), '<a href="/legal/privacy/" style="text-decoration:underline">' . esc_html__( 'privacy policy', 'shopinbos' ) . '</a>' ) . '</p>'
		. '</form></div>';
}

/** The calculator: the plugin's fields on the left, the live result on a night card on the right, behind the gate. */
function sib_v9_tool_box( string $tool ): string {
	[ $fields, $results ] = sib_tool_markup( $tool );
	if ( ! $fields ) {
		return '';
	}
	$spec                  = function_exists( 'sib_tool_spec' ) ? sib_tool_spec( $tool ) : [ 'cta' => __( 'Save this in Shopinbos', 'shopinbos' ) ];
	$rows                  = sib_tool_rows( $tool, $results, true );
	[ $docbtns, $preview ] = sib_tool_doc( $tool, true );
	$extra = 'whatsapp-link' === $tool
		? '<div data-r-qr class="v9-qr"></div><div style="display:flex;gap:10px;flex-wrap:wrap"><button type="button" class="btn b-wh" data-copy>' . esc_html__( 'Copy link', 'shopinbos' ) . '</button><button type="button" class="btn b-gh" data-download-qr>' . esc_html__( 'Download QR', 'shopinbos' ) . '</button></div>'
		: $docbtns;
	$save  = function_exists( 'sib_go_url' ) ? sib_go_url( 'tool_result', [ 'tool' => $tool ] ) : sib_v9_tokens( '%%SIGNUP%%' );
	$open  = sib_v9_tools_unlocked();
	$box   = '<div class="v9-tool g2" data-sib-tool="' . esc_attr( $tool ) . '" style="display:grid;grid-template-columns:1.1fr .9fr;gap:16px;align-items:start">'
		. '<form class="bc c-wh v9-tool-form" onsubmit="return false" novalidate><span class="k mutd">' . esc_html__( 'Your details', 'shopinbos' ) . '</span><div class="v9-fields">' . $fields . '</div></form>'
		. '<div class="bc c-night v9-tool-out" aria-live="polite" style="gap:18px"><span class="k" style="color:#FF8A5B">' . esc_html__( 'Your result', 'shopinbos' ) . '</span><div>' . $rows . '</div>' . $extra
		. ( $spec['cta'] ? '<a class="btn b-org" href="' . esc_url( $save ) . '">' . esc_html( $spec['cta'] ) . '</a>' : '' )
		. sib_render_lead_form( [ 'kind' => 'tool', 'heading' => __( 'Or email me the result', 'shopinbos' ), 'tool' => $tool ] )
		. '</div>' . ( $preview ? '<div class="v9-doc" style="grid-column:1/-1">' . $preview . '</div>' : '' ) . '</div>';
	return '<div class="v9-gate-wrap' . ( $open ? ' is-open' : '' ) . '" data-tools-gate>'
		. '<div class="v9-gated" data-gated' . ( $open ? '' : ' inert aria-hidden="true"' ) . '>' . $box . '</div>'
		. ( $open ? '' : sib_v9_tool_gate( $tool ) ) . '</div>';
}

/** Search data for a tool page: the tool as a free web app, and its questions (the plugin skips FAQ data on V9 pages). */
function sib_v9_tool_schema( WP_Post $post ): void {
	add_filter( 'sib_schema_graph', function ( array $graph ) use ( $post ): array {
		$graph[] = [
			'@type' => 'WebApplication', 'name' => get_the_title( $post ), 'url' => get_permalink( $post ),
			'description' => has_excerpt( $post ) ? get_the_excerpt( $post ) : null, 'applicationCategory' => 'BusinessApplication',
			'operatingSystem' => 'Any (in the browser)', 'inLanguage' => 'en-NG', 'isAccessibleForFree' => true,
			'offers' => [ '@type' => 'Offer', 'price' => '0', 'priceCurrency' => 'NGN' ],
			'publisher' => [ '@id' => home_url( '/' ) . '#org' ],
		];
		$has = array_filter( $graph, fn( $n ) => is_array( $n ) && 'FAQPage' === ( $n['@type'] ?? '' ) );
		if ( ! $has && function_exists( 'sib_schema_faq' ) && count( $faq = sib_schema_faq( parse_blocks( $post->post_content ) ) ) >= 2 ) {
			$graph[] = [ '@type' => 'FAQPage', 'mainEntity' => $faq ];
		}
		return $graph;
	} );
}

function sib_v9_tool(): ?array {
	$post = get_queried_object();
	if ( ! $post instanceof WP_Post ) {
		return null;
	}
	$tool = (string) get_post_meta( $post->ID, 'sib_tool', true );
	$box  = sib_v9_tool_box( $tool );
	if ( ! $box ) {
		return null; // no tool picked: the old template still shows the page
	}
	$GLOBALS['sib_v9_tool'] = $tool;
	[ $body ]               = sib_v9_prose( $post );
	[ $tag ]                = sib_v9_tool_look( $tool );
	$dek                    = has_excerpt( $post ) ? get_the_excerpt( $post ) : '';
	sib_v9_tool_schema( $post );

	$h  = '<section style="background:#F6F3EE;padding:64px 0 96px"><div class="wrap"><a href="/tools/" class="more mutd" style="font-size:14px">← ' . esc_html__( 'Free tools', 'shopinbos' ) . '</a>';
	$h .= '<div style="display:flex;flex-direction:column;gap:18px;max-width:860px;margin-top:28px"><span class="k orgd">' . esc_html( sprintf( 'Free tool · %s', $tag ) ) . '</span>';
	$h .= '<h1 class="H up" style="font-size:clamp(40px,5vw,72px);line-height:1">' . esc_html( get_the_title( $post ) ) . '</h1>';
	$h .= $dek ? '<p class="lead">' . esc_html( $dek ) . '</p>' : '';
	$h .= '<p class="mutd" style="font-size:14px;margin:0">' . esc_html__( 'Free. Works in your browser: what you type stays on your phone or computer. The answer updates as you type.', 'shopinbos' ) . '</p></div>';
	$h .= '<div style="margin-top:44px">' . $box . '</div></div></section>';
	if ( '' !== trim( wp_strip_all_tags( $body ) ) ) {
		$h .= '<section style="padding:88px 0 96px"><div class="wrap"><article style="max-width:760px"><div class="v9-prose">' . $body . '</div></article></div></section>';
	}
	// More tools: the same section first, then others.
	$group = '';
	foreach ( sib_v9_tool_groups() as $key => $g ) {
		if ( in_array( $tool, $g[2], true ) ) {
			$group = $key;
		}
	}
	$all  = get_posts( [ 'post_type' => 'sib_tool', 'post_status' => 'publish', 'numberposts' => 60, 'post__not_in' => [ $post->ID ], 'orderby' => 'rand' ] );
	$same = $group ? sib_v9_tool_groups()[ $group ][2] : [];
	usort( $all, fn( $a, $b ) => (int) ! in_array( get_post_meta( $a->ID, 'sib_tool', true ), $same, true ) <=> (int) ! in_array( get_post_meta( $b->ID, 'sib_tool', true ), $same, true ) );
	$more = array_slice( $all, 0, 3 );
	if ( $more ) {
		$h .= '<section class="sec" style="background:#F6F3EE;padding:96px 0"><div class="wrap"><div style="display:flex;justify-content:space-between;align-items:flex-end;gap:20px;flex-wrap:wrap"><h2 class="H h2">' . esc_html__( 'More free tools', 'shopinbos' ) . '</h2><a class="btn b-line" href="/tools/">' . esc_html__( 'See all tools', 'shopinbos' ) . '</a></div>'
			. '<div class="g3" style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:40px">' . implode( '', array_map( 'sib_v9_tool_card', $more ) ) . '</div></div></section>';
	}
	$h .= sib_v9_section( 'blog-post', 'night' );

	return [
		'slug'        => 'tool',
		'html'        => sib_v9_wrap( $h ),
		'title'       => sib_v9_tools_title( $post ),
		'description' => sib_v9_tools_desc( $post ),
		'crumbs'      => [ [ __( 'Free tools', 'shopinbos' ), home_url( '/tools/' ) ] ],
	];
}

function sib_v9_tools(): ?array {
	$tools = get_posts( [ 'post_type' => 'sib_tool', 'post_status' => 'publish', 'numberposts' => 60, 'orderby' => [ 'menu_order' => 'ASC', 'title' => 'ASC' ] ] );
	if ( ! $tools ) {
		return null;
	}
	// Sort the tools into their sections, in each section's order.
	$groups = sib_v9_tool_groups();
	$keys   = array_keys( $groups );
	$byg    = array_fill_keys( $keys, [] );
	foreach ( $tools as $p ) {
		$t   = (string) get_post_meta( $p->ID, 'sib_tool', true );
		$hit = end( $keys );
		foreach ( $groups as $k => $g ) {
			if ( in_array( $t, $g[2], true ) ) {
				$hit = $k;
				break;
			}
		}
		$byg[ $hit ][] = $p;
	}
	foreach ( $byg as $k => &$list ) {
		$order = array_flip( $groups[ $k ][2] );
		usort( $list, fn( $a, $b ) => ( $order[ get_post_meta( $a->ID, 'sib_tool', true ) ] ?? 99 ) <=> ( $order[ get_post_meta( $b->ID, 'sib_tool', true ) ] ?? 99 ) );
	}
	unset( $list );
	$byg = array_filter( $byg );

	$chips = '';
	foreach ( $byg as $k => $list ) {
		$chips .= '<a class="chip" href="#' . esc_attr( $k ) . '">' . esc_html( $groups[ $k ][0] ) . ' <span class="mutd">' . count( $list ) . '</span></a>';
	}
	$h  = '<section style="background:#F6F3EE;padding:96px 0 88px"><div class="wrap" style="display:flex;flex-direction:column;gap:22px;align-items:center;text-align:center">';
	$h .= '<span class="k orgd up">' . esc_html( sprintf( __( '%d free tools', 'shopinbos' ), count( $tools ) ) ) . '</span><h1 class="H h1 up d1" style="max-width:1000px;font-size:clamp(46px,6vw,88px)">' . esc_html__( 'Do the maths', 'shopinbos' ) . ' <span class="it orgd">' . esc_html__( 'before you sell.', 'shopinbos' ) . '</span></h1>';
	$h .= '<p class="lead up d2" style="max-width:660px">' . esc_html__( 'Calculators, generators and makers for Nigerian sellers: prices, profit, VAT, invoices, receipts, delivery fees, captions and more. Free, in naira, and they work in your browser.', 'shopinbos' ) . '</p>';
	$h .= '<nav class="up d3 v9-tool-chips" aria-label="' . esc_attr__( 'Tool sections', 'shopinbos' ) . '" style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:8px">' . $chips . '</nav></div></section>';
	$first = true;
	foreach ( $byg as $k => $list ) {
		$h .= '<section class="sec v9-tool-group" id="' . esc_attr( $k ) . '" style="padding:' . ( $first ? '88px' : '0' ) . ' 0 ' . ( array_key_last( $byg ) === $k ? '112px' : '72px' ) . '"><div class="wrap">'
			. '<div style="display:flex;justify-content:space-between;align-items:flex-end;gap:20px;flex-wrap:wrap"><div style="display:flex;flex-direction:column;gap:10px;max-width:680px"><h2 class="H h2">' . esc_html( $groups[ $k ][0] ) . '</h2><p class="mutd" style="margin:0;font-size:16px">' . esc_html( $groups[ $k ][1] ) . '</p></div><span class="mutd" style="font-size:15px">' . esc_html( sprintf( _n( '%d tool', '%d tools', count( $list ), 'shopinbos' ), count( $list ) ) ) . '</span></div>'
			. '<div class="g3" style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:32px">' . implode( '', array_map( 'sib_v9_tool_card', $list ) ) . '</div></div></section>';
		$first = false;
	}

	$pdfs = get_posts( [ 'post_type' => 'sib_resource', 'post_status' => 'publish', 'numberposts' => 3, 'orderby' => [ 'menu_order' => 'ASC', 'date' => 'DESC' ] ] );
	if ( $pdfs ) {
		$h .= '<section class="sec" style="background:#F6F3EE;padding:96px 0"><div class="wrap"><div style="display:flex;justify-content:space-between;align-items:flex-end;gap:20px;flex-wrap:wrap"><div style="display:flex;flex-direction:column;gap:14px;max-width:640px"><span class="k orgd">' . esc_html__( 'Free PDFs', 'shopinbos' ) . '</span><h2 class="H h2">' . esc_html__( 'Guides to print and fill in', 'shopinbos' ) . '</h2></div><a class="btn b-line" href="/resources/">' . esc_html__( 'All free PDFs', 'shopinbos' ) . '</a></div>'
			. '<div class="g3" style="display:grid;grid-template-columns:repeat(3,1fr);gap:40px 24px;margin-top:40px">' . implode( '', array_map( 'sib_v9_resource_card', $pdfs ) ) . '</div></div></section>';
	}
	$h .= sib_v9_section( 'blog-post', 'night' );

	return [
		'slug'        => 'tools',
		'html'        => sib_v9_wrap( $h, 'blog' ),
		'title'       => __( 'Free tools for online sellers in Nigeria · Shopinbos', 'shopinbos' ),
		'description' => __( 'Free tools for Nigerian sellers: invoice and receipt makers, VAT, markup, profit, Paystack and POS charges, delivery fees, captions, QR labels and more. In naira.', 'shopinbos' ),
		'crumbs'      => [],
	];
}

/* ---------- Free PDFs ---------- */

/** [plural, singular, card class, tag class] per kind of guide. */
function sib_v9_resource_kinds(): array {
	return [
		'guide'     => [ __( 'Guides', 'shopinbos' ), __( 'Guide', 'shopinbos' ), 'c-peach', 'og' ],
		'workbook'  => [ __( 'Workbooks', 'shopinbos' ), __( 'Workbook', 'shopinbos' ), 'c-mint', 'tl' ],
		'template'  => [ __( 'Templates', 'shopinbos' ), __( 'Templates', 'shopinbos' ), 'c-sun', '' ],
		'checklist' => [ __( 'Checklists', 'shopinbos' ), __( 'Checklist', 'shopinbos' ), 'c-lav', '' ],
	];
}

function sib_v9_resource_kind( WP_Post $p ): string {
	$k = function_exists( 'sib_resource_style' ) ? sib_resource_style( $p->ID ) : (string) get_post_meta( $p->ID, 'sib_style', true );
	return isset( sib_v9_resource_kinds()[ $k ] ) ? $k : 'guide';
}

function sib_v9_resource_sub( WP_Post $p, int $words = 24 ): string {
	return wp_trim_words( wp_strip_all_tags( $p->post_excerpt ?: (string) get_post_meta( $p->ID, 'rank_math_description', true ) ?: strip_shortcodes( $p->post_content ) ), $words );
}

function sib_v9_resource_meta( WP_Post $p ): string {
	$k     = sib_v9_resource_kinds()[ sib_v9_resource_kind( $p ) ];
	$pages = (int) get_post_meta( $p->ID, 'sib_pages', true );
	return '<span class="tg ' . $k[3] . '">' . esc_html( $k[1] ) . '</span><span class="mutd" style="font-size:13px">' . esc_html( $pages ? sprintf( _n( '%d page', '%d pages', $pages, 'shopinbos' ), $pages ) . ' · PDF' : 'PDF' ) . '</span>';
}

/** A guide's cover on its kind's colour. */
function sib_v9_resource_cover( WP_Post $p, string $size = 'medium_large', string $h = '280px', bool $eager = false ): string {
	$k   = sib_v9_resource_kinds()[ sib_v9_resource_kind( $p ) ];
	$url = get_the_post_thumbnail_url( $p, $size );
	return '<div class="bc ' . $k[2] . ' zm v9-cover" style="height:' . $h . ';padding:28px 0 0;align-items:center;justify-content:flex-end;border-radius:24px">'
		. ( $url
			? '<img decoding="async"' . ( $eager ? ' fetchpriority="high"' : ' loading="lazy"' ) . ' src="' . esc_url( $url ) . '" alt="" width="300" height="424" style="width:auto;height:100%;aspect-ratio:300/424;max-width:78%;object-fit:cover;object-position:top;border-radius:8px 8px 0 0;box-shadow:0 24px 50px -24px rgba(22,20,31,.5)">'
			: '<span class="H" style="font-size:40px;margin:auto">PDF</span>' )
		. '</div>';
}

function sib_v9_resource_card( WP_Post $p ): string {
	return '<a href="' . esc_url( get_permalink( $p ) ) . '" class="lift" data-kind="' . esc_attr( sib_v9_resource_kind( $p ) ) . '" style="min-width:0;display:flex;flex-direction:column">'
		. sib_v9_resource_cover( $p )
		. '<div style="display:flex;gap:10px;align-items:center;margin-top:18px">' . sib_v9_resource_meta( $p ) . '</div>'
		. '<div class="H" style="font-size:24px;line-height:1.1;margin-top:12px">' . esc_html( get_the_title( $p ) ) . '</div>'
		. '<p class="p mutd" style="margin-top:8px;font-size:15.5px">' . esc_html( sib_v9_resource_sub( $p, 22 ) ) . '</p>'
		. '<span class="more" style="margin-top:12px">' . esc_html__( 'Get the free PDF', 'shopinbos' ) . ' →</span></a>';
}

/** The download box: the lead form for gated guides, a plain button for open ones. */
function sib_v9_resource_form( WP_Post $post ): string {
	$file = (string) get_post_meta( $post->ID, 'sib_file_path', true );
	$head = '<div style="display:flex;flex-direction:column;gap:6px"><b class="H" style="font-size:24px;letter-spacing:-.03em">' . esc_html__( 'Where should we send it?', 'shopinbos' ) . '</b>';
	// Every guide asks for an email and WhatsApp number first (the owner's rule), whatever its own gated setting.
	// Without JavaScript the form posts and comes back here with the download link.
	$back = '';
	$dl   = isset( $_GET['sib_dl'] ) ? esc_url_raw( rawurldecode( wp_unslash( $_GET['sib_dl'] ) ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification
	if ( $dl && 'ok' === ( $_GET['sib_lead'] ?? '' ) && wp_validate_redirect( $dl, '' ) ) { // phpcs:ignore WordPress.Security.NonceVerification
		$back = '<a class="btn b-ink" href="' . esc_url( $dl ) . '" rel="nofollow">' . esc_html__( 'Download the PDF', 'shopinbos' ) . '</a>';
	}
	return '<div class="bc c-wh v9-dl" id="get" style="gap:16px;box-shadow:inset 0 0 0 1px #EAE7EF,0 30px 60px -36px rgba(255,106,43,.45)">' . $head
		. '<span class="mutd" style="font-size:15px">' . esc_html__( 'Add your WhatsApp number or email. The download button shows here as soon as you send it.', 'shopinbos' ) . '</span></div>'
		. $back . sib_render_lead_form( [ 'kind' => 'download', 'resource' => $post->ID ] ) . '</div>';
}

function sib_v9_resource(): ?array {
	$post = get_queried_object();
	if ( ! $post instanceof WP_Post ) {
		return null;
	}
	$k     = sib_v9_resource_kinds()[ sib_v9_resource_kind( $post ) ];
	$pages = (int) get_post_meta( $post->ID, 'sib_pages', true );
	$pill  = $pages ? sprintf( 'Free PDF · %d pages · %s', $pages, $k[1] ) : sprintf( 'Free PDF · %s', $k[1] );
	$dek   = sib_v9_resource_sub( $post, 40 );

	$h  = '<section style="background:#F6F3EE;padding:56px 0 96px"><div class="wrap"><div class="mutd" style="font-size:14px"><a href="/">' . esc_html__( 'Home', 'shopinbos' ) . '</a> / <a href="/resources/">' . esc_html__( 'Free PDFs', 'shopinbos' ) . '</a></div>';
	$h .= '<div class="g2" style="display:grid;grid-template-columns:1.05fr .95fr;gap:64px;align-items:start;margin-top:32px">';
	$h .= '<div style="display:flex;flex-direction:column;gap:20px;min-width:0"><span class="k orgd">' . esc_html( $pill ) . '</span><h1 class="H up" style="font-size:clamp(40px,5vw,72px);line-height:1">' . esc_html( get_the_title( $post ) ) . '</h1>';
	$h .= $dek ? '<p class="lead">' . esc_html( $dek ) . '</p>' : '';
	$h .= sib_v9_resource_form( $post ) . '</div>';
	$h .= '<div class="v9-res-cover">' . sib_v9_resource_cover( $post, 'large', '640px', true ) . '</div></div></div></section>';

	$ch = function_exists( 'sib_resource_chapters' ) ? array_values( sib_resource_chapters( $post->ID ) ) : [];
	if ( $ch ) {
		$cards = '';
		foreach ( $ch as $i => $t ) {
			$t      = preg_replace( '/^(Chapter \d+:|Part \d+:|Section \d+:)\s*/i', '', (string) $t );
			$cards .= '<div class="bc c-wh" style="flex-direction:row;gap:16px;align-items:flex-start;padding:24px"><b class="H" style="font-size:32px;color:#FF6A2B;line-height:1">' . sprintf( '%02d', $i + 1 ) . '</b><b style="font-size:16.5px;line-height:1.4;padding-top:4px">' . esc_html( $t ) . '</b></div>';
		}
		$h .= '<section class="sec" style="padding:96px 0"><div class="wrap"><div style="display:flex;flex-direction:column;gap:14px;max-width:820px"><span class="k orgd">' . esc_html__( 'What’s inside', 'shopinbos' ) . '</span><h2 class="H h2">' . esc_html( sprintf( _n( '%d short chapter', '%d short chapters', count( $ch ), 'shopinbos' ), count( $ch ) ) ) . '</h2></div>'
			. '<div class="g3" style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:40px">' . $cards . '</div>'
			. '<a class="btn b-ink" href="#get" style="margin-top:40px">' . esc_html__( 'Get the free PDF', 'shopinbos' ) . '</a></div></section>';
	}

	$more = get_posts( [ 'post_type' => 'sib_resource', 'post_status' => 'publish', 'numberposts' => 3, 'post__not_in' => [ $post->ID ], 'orderby' => [ 'menu_order' => 'ASC', 'date' => 'DESC' ] ] );
	if ( $more ) {
		$h .= '<section class="sec" style="background:#F6F3EE;padding:96px 0"><div class="wrap"><div style="display:flex;justify-content:space-between;align-items:flex-end;gap:20px;flex-wrap:wrap"><h2 class="H h2">' . esc_html__( 'More free PDFs', 'shopinbos' ) . '</h2><a class="btn b-line" href="/resources/">' . esc_html__( 'See them all', 'shopinbos' ) . '</a></div>'
			. '<div class="g3" style="display:grid;grid-template-columns:repeat(3,1fr);gap:40px 24px;margin-top:40px">' . implode( '', array_map( 'sib_v9_resource_card', $more ) ) . '</div></div></section>';
	}
	$h .= sib_v9_section( 'blog-post', 'night' );

	return [
		'slug'        => 'resource',
		'html'        => sib_v9_wrap( $h ),
		'title'       => sib_v9_tools_title( $post, ' (free PDF)' ),
		'description' => sib_v9_tools_desc( $post ),
		'crumbs'      => [ [ __( 'Free PDFs', 'shopinbos' ), home_url( '/resources/' ) ] ],
	];
}

/* /resources/: featured guide, kinds as chips (?kind=), and every guide. */
function sib_v9_resources(): ?array {
	$posts = get_posts( [ 'post_type' => 'sib_resource', 'post_status' => 'publish', 'numberposts' => 60, 'orderby' => [ 'menu_order' => 'ASC', 'date' => 'DESC' ] ] );
	if ( ! $posts ) {
		return null;
	}
	$kinds = sib_v9_resource_kinds();
	$kind  = sanitize_key( wp_unslash( $_GET['kind'] ?? '' ) ); // phpcs:ignore WordPress.Security.NonceVerification
	$kind  = isset( $kinds[ $kind ] ) ? $kind : '';
	$total = count( $posts );

	$feat = null;
	if ( ! $kind ) {
		foreach ( $posts as $i => $p ) {
			if ( 'online-sellers-starter-kit' === $p->post_name ) {
				$feat = $p;
				unset( $posts[ $i ] );
			}
		}
		$feat = $feat ?: array_shift( $posts );
	}
	$used  = array_unique( array_map( 'sib_v9_resource_kind', $posts + ( $feat ? [ -1 => $feat ] : [] ) ) );
	$chips = '<a class="chip' . ( $kind ? '' : ' on' ) . '" href="/resources/">' . esc_html__( 'All', 'shopinbos' ) . '</a>';
	foreach ( $kinds as $key => $k ) {
		if ( in_array( $key, $used, true ) || $key === $kind ) {
			$chips .= '<a class="chip' . ( $key === $kind ? ' on' : '' ) . '" href="' . esc_url( add_query_arg( 'kind', $key, '/resources/' ) ) . '#all">' . esc_html( $k[0] ) . '</a>';
		}
	}
	if ( $kind ) {
		$posts = array_filter( $posts, fn( $p ) => sib_v9_resource_kind( $p ) === $kind );
	}

	$h  = '<section style="background:#F6F3EE;padding:96px 0 88px"><div class="wrap" style="display:flex;flex-direction:column;gap:22px;align-items:center;text-align:center">';
	$h .= '<span class="k orgd up">' . esc_html__( 'Free PDFs', 'shopinbos' ) . '</span><h1 class="H h1 up d1" style="max-width:1000px;font-size:clamp(46px,6vw,88px)">' . esc_html__( 'Print it, fill it in,', 'shopinbos' ) . ' <span class="it orgd">' . esc_html__( 'sell more.', 'shopinbos' ) . '</span></h1>';
	$h .= '<p class="lead up d2" style="max-width:640px">' . esc_html( sprintf( __( '%d free guides, workbooks, templates and checklists for selling online in Nigeria. Pick one, leave your WhatsApp number or email, and download it.', 'shopinbos' ), $total ) ) . '</p>';
	$h .= '<div class="up d3" style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:8px">' . $chips . '</div></div></section>';

	if ( $feat ) {
		$h .= '<section class="sec" style="padding:96px 0 0"><div class="wrap"><a href="' . esc_url( get_permalink( $feat ) ) . '" class="g2 lift" style="display:grid;grid-template-columns:1.1fr .9fr;gap:56px;align-items:center">'
			. sib_v9_resource_cover( $feat, 'large', '520px', true )
			. '<div style="display:flex;flex-direction:column;gap:16px"><span class="k orgd">' . esc_html__( 'Most downloaded', 'shopinbos' ) . '</span><div style="display:flex;gap:10px;align-items:center">' . sib_v9_resource_meta( $feat ) . '</div>'
			. '<div class="H" style="font-size:clamp(34px,3.6vw,54px);line-height:1.02">' . esc_html( get_the_title( $feat ) ) . '</div>'
			. '<p class="lead" style="font-size:18px">' . esc_html( sib_v9_resource_sub( $feat, 34 ) ) . '</p><span class="btn b-org" style="align-self:flex-start">' . esc_html__( 'Get it free', 'shopinbos' ) . ' →</span></div></a></div></section>';
	}

	$count = sprintf( _n( '%d free PDF', '%d free PDFs', count( $posts ), 'shopinbos' ), count( $posts ) );
	$h    .= '<section class="sec" id="all" style="padding:96px 0 120px"><div class="wrap"><div style="display:flex;justify-content:space-between;align-items:flex-end;gap:20px;flex-wrap:wrap"><h2 class="H h2">' . esc_html( $kind ? $kinds[ $kind ][0] : __( 'All free PDFs', 'shopinbos' ) ) . '</h2><span class="mutd" style="font-size:15px">' . esc_html( $count ) . '</span></div>'
		. '<div class="g3" style="display:grid;grid-template-columns:repeat(3,1fr);gap:48px 24px;margin-top:40px">' . implode( '', array_map( 'sib_v9_resource_card', $posts ) ) . '</div></div></section>';
	$h    .= '<section class="sec" style="background:#F6F3EE;padding:88px 0"><div class="wrap g2" style="display:grid;grid-template-columns:1fr auto;gap:32px;align-items:center"><div style="display:flex;flex-direction:column;gap:14px;max-width:720px"><span class="k orgd">' . esc_html__( 'Free tools', 'shopinbos' ) . '</span><h2 class="H" style="font-size:clamp(32px,3.4vw,48px);line-height:1.05">' . esc_html__( 'Need a number now? Try the calculators.', 'shopinbos' ) . '</h2><p class="lead">' . esc_html__( 'Profit, selling price, Paystack fees, break-even and more. Free, in naira, no sign-up.', 'shopinbos' ) . '</p></div><a class="btn b-ink" href="/tools/">' . esc_html__( 'Open the free tools', 'shopinbos' ) . '</a></div></section>';
	$h    .= sib_v9_section( 'blog-post', 'night' );

	return [
		'slug'   => 'resources',
		'html'   => sib_v9_wrap( $h, 'blog' ),
		'title'  => __( 'Free PDFs and templates for online sellers · Shopinbos', 'shopinbos' ),
		'crumbs' => [],
	];
}
