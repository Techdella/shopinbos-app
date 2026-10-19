<?php
/**
 * Article blocks (spec §6): the reusable pieces inside blog posts, Academy lessons, Help articles
 * and guides. Same look everywhere, server-rendered, no free colours.
 *
 * List fields are one item per line. Two-part items use " | ", e.g. a step "Take one photo | In daylight".
 * Also: the CTA band and the Sunday newsletter band used before the footer.
 */

defined( 'ABSPATH' ) || exit;

/** Non-empty trimmed lines. */
function sib_lines( string $text ): array {
	return array_values( array_filter( array_map( 'trim', preg_split( '/\R/', $text ) ), 'strlen' ) );
}

/** "Heading | description" → [heading, description]. */
function sib_pair( string $line ): array {
	$p = array_map( 'trim', explode( '|', $line, 2 ) );
	return [ $p[0], $p[1] ?? '' ];
}

/** Light inline formatting allowed in block text. */
function sib_inline( string $text ): string {
	return wp_kses( $text, [ 'b' => [], 'strong' => [], 'em' => [], 'i' => [], 'a' => [ 'href' => [] ], 'br' => [] ] );
}

function sib_article_block_defs(): array {
	$lines = __( 'One per line.', 'shopinbos' );
	return [
		'callout'      => [ __( 'Callout (tip, warning, note)', 'shopinbos' ), 'sib_render_callout', [ 'kind' => [ 'string', 'tip', [ 'tip', 'warn', 'note' ] ], 'title' => [ 'string', '' ], 'text' => [ 'string', '' ] ], [ 'multiline' => [ 'text' ] ] ],
		'did-you-know' => [ __( 'Did you know', 'shopinbos' ), 'sib_render_dyk', [ 'title' => [ 'string', 'Did you know?' ], 'text' => [ 'string', '' ], 'foot' => [ 'string', '' ] ], [ 'multiline' => [ 'text' ] ] ],
		'stats'        => [ __( 'Stats', 'shopinbos' ), 'sib_render_stats', [ 'title' => [ 'string', '' ], 'items' => [ 'string', '' ], 'foot' => [ 'string', '' ], 'tone' => [ 'string', 'ink', [ 'ink', 'teal', 'light' ] ] ], [ 'multiline' => [ 'items' ], 'help' => [ 'items' => __( '2 to 4 lines: value | label, e.g. 7–9am | On the way to work', 'shopinbos' ), 'foot' => __( 'Required: where the numbers come from.', 'shopinbos' ) ] ] ],
		'checklist'    => [ __( 'Checklist', 'shopinbos' ), 'sib_render_checklist', [ 'title' => [ 'string', '' ], 'items' => [ 'string', '' ], 'interactive' => [ 'boolean', true ] ], [ 'multiline' => [ 'items' ], 'help' => [ 'items' => $lines ] ] ],
		'steps'        => [ __( 'Steps', 'shopinbos' ), 'sib_render_steps', [ 'title' => [ 'string', '' ], 'items' => [ 'string', '' ], 'schema' => [ 'boolean', false ] ], [ 'multiline' => [ 'items' ], 'help' => [ 'items' => __( '2 to 6 lines: heading | description', 'shopinbos' ) ] ] ],
		'cta-inline'   => [ __( 'Call to action (inline)', 'shopinbos' ), 'sib_render_cta_inline', [ 'eyebrow' => [ 'string', 'Free to start' ], 'title' => [ 'string', 'Get your store link in 5 minutes' ], 'text' => [ 'string', 'Rex builds your store from a few photos. Free to start, no card, no password.' ], 'button' => [ 'string', 'Start your shop' ], 'intent' => [ 'string', '' ], 'linkLabel' => [ 'string', 'See how it works' ], 'linkUrl' => [ 'string', '/' ], 'tone' => [ 'string', 'orange', [ 'orange', 'ink', 'teal' ] ], 'mascot' => [ 'string', 'rex-side', [ 'rex', 'rex-side', 'peggy', 'peggy-wave', 'none' ] ] ], [ 'multiline' => [ 'text' ] ] ],
		'quote'        => [ __( 'Seller quote', 'shopinbos' ), 'sib_render_quote', [ 'text' => [ 'string', '' ], 'name' => [ 'string', '' ], 'shop' => [ 'string', '' ], 'isExample' => [ 'boolean', false ] ], [ 'multiline' => [ 'text' ], 'help' => [ 'isExample' => __( 'Only real quotes with permission, or mark as an example.', 'shopinbos' ) ] ] ],
		'do-dont'      => [ __( 'Do and don’t', 'shopinbos' ), 'sib_render_do_dont', [ 'title' => [ 'string', '' ], 'dos' => [ 'string', '' ], 'donts' => [ 'string', '' ] ], [ 'multiline' => [ 'dos', 'donts' ], 'help' => [ 'dos' => $lines, 'donts' => $lines ] ] ],
		'faq'          => [ __( 'FAQ', 'shopinbos' ), 'sib_render_faq_block', [ 'title' => [ 'string', 'Questions sellers ask' ], 'items' => [ 'string', '' ], 'openFirst' => [ 'boolean', false ] ], [ 'multiline' => [ 'items' ], 'help' => [ 'items' => __( 'One per line: question | answer', 'shopinbos' ) ] ] ],
		'takeaways'    => [ __( 'Key takeaways', 'shopinbos' ), 'sib_render_takeaways', [ 'items' => [ 'string', '' ] ], [ 'multiline' => [ 'items' ], 'help' => [ 'items' => __( '3 to 5 short lines.', 'shopinbos' ) ] ] ],
		'helpful'      => [ __( 'Was this useful?', 'shopinbos' ), 'sib_render_helpful', [] , [] ],
		'cta-band'     => [ __( 'CTA band (before the footer)', 'shopinbos' ), 'sib_render_cta_band', [ 'tone' => [ 'string', 'ink', [ 'ink', 'orange', 'teal' ] ], 'title' => [ 'string', 'Ready to try it?' ], 'text' => [ 'string', 'Get your store link in 5 minutes. Free to start, no card.' ], 'button' => [ 'string', 'Start your shop' ], 'intent' => [ 'string', '' ], 'linkLabel' => [ 'string', '' ], 'linkUrl' => [ 'string', '' ], 'mascot' => [ 'string', 'rex-side', [ 'rex', 'rex-side', 'peggy', 'peggy-wave', 'none' ] ] ], [ 'multiline' => [ 'text' ] ] ],
		'newsletter'   => [ __( 'Sunday newsletter band', 'shopinbos' ), 'sib_render_newsletter_band', [ 'title' => [ 'string', 'One useful idea for your shop, every Sunday morning' ], 'text' => [ 'string', 'A short tip you can try the same day. On WhatsApp or by email. Reply STOP any time.' ] ], [] ],
	];
}

add_filter( 'block_categories_all', function ( $cats ) {
	array_unshift( $cats, [ 'slug' => 'sib-article', 'title' => __( 'Shopinbos · Article', 'shopinbos' ) ] );
	return $cats;
} );

add_action( 'init', function () {
	$client = [];
	foreach ( sib_article_block_defs() as $name => [ $title, $cb, $attrs, $ui ] ) {
		$schema = [];
		foreach ( $attrs as $k => $def ) {
			$schema[ $k ] = [ 'type' => $def[0], 'default' => $def[1] ];
			if ( isset( $def[2] ) ) {
				$schema[ $k ]['enum'] = $def[2];
			}
		}
		register_block_type( 'shopinbos/' . $name, [
			'api_version'     => 3,
			'title'           => $title,
			'category'        => 'sib-article',
			'attributes'      => $schema + [ 'anchor' => [ 'type' => 'string', 'default' => '' ] ],
			'render_callback' => $cb,
			'editor_script'   => 'sib-editor',
			'supports'        => [ 'html' => false ],
		] );
		$client[] = [ 'name' => 'shopinbos/' . $name, 'title' => $title, 'category' => 'sib-article', 'attributes' => $schema, 'ui' => $ui ];
	}
	wp_add_inline_script( 'sib-editor', 'window.SIB_BLOCKS = (window.SIB_BLOCKS || []).concat(' . wp_json_encode( $client ) . ');', 'before' );
}, 11 );

/* ---------- renderers ---------- */

function sib_render_callout( array $a ): string {
	$kind  = in_array( $a['kind'], [ 'tip', 'warn', 'note' ], true ) ? $a['kind'] : 'tip';
	$title = $a['title'] ?: [ 'tip' => __( 'Peggy’s tip', 'shopinbos' ), 'warn' => __( 'Watch out', 'shopinbos' ), 'note' => __( 'Good to know', 'shopinbos' ) ][ $kind ];
	$icon  = 'tip' === $kind
		? '<img src="' . sib_img( 'peggy.webp' ) . '" alt="" width="30" height="30" style="width:30px;height:30px;object-fit:contain">'
		: ( 'warn' === $kind
			? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8A5A08" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/></svg>'
			: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16141F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>' );
	return '<aside class="blk-call is-' . $kind . '"><span class="av">' . $icon . '</span><div><b>' . esc_html( $title ) . '</b><p>' . sib_inline( $a['text'] ) . '</p></div></aside>';
}

function sib_render_dyk( array $a ): string {
	return '<aside class="blk blk-dyk"><span class="dyk-q" aria-hidden="true">?</span><div class="col" style="gap:8px;position:relative"><p class="eyebrow">' . esc_html( $a['title'] ) . '</p><p class="dyk-text">' . sib_inline( $a['text'] ) . '</p>'
		. ( $a['foot'] ? '<p class="dyk-foot"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B23E0A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z"/></svg><span>' . sib_inline( $a['foot'] ) . '</span></p>' : '' )
		. '</div></aside>';
}

function sib_render_stats( array $a ): string {
	$items = array_slice( array_map( 'sib_pair', sib_lines( $a['items'] ) ), 0, 4 );
	$tone  = in_array( $a['tone'], [ 'ink', 'teal', 'light' ], true ) ? $a['tone'] : 'ink';
	$out   = '<aside class="blk blk-stats is-' . $tone . '">' . ( $a['title'] ? '<p class="eyebrow">' . esc_html( $a['title'] ) . '</p>' : '' ) . '<div class="statsg" style="grid-template-columns:repeat(' . max( 1, count( $items ) ) . ',minmax(0,1fr))">';
	foreach ( $items as [ $v, $l ] ) {
		$out .= '<div class="stat"><b class="disp bigstat">' . esc_html( $v ) . '</b><span>' . esc_html( $l ) . '</span></div>';
	}
	return $out . '</div>' . ( $a['foot'] ? '<p class="stats-foot">' . esc_html( $a['foot'] ) . '</p>' : '' ) . '</aside>';
}

function sib_render_checklist( array $a ): string {
	$id  = 'chk-' . substr( md5( $a['title'] . $a['items'] ), 0, 8 );
	$out = '<aside class="blk blk-check" data-checklist="' . esc_attr( $id ) . '"><div class="row between" style="margin-bottom:6px;gap:10px"><b style="font-size:17px">' . esc_html( $a['title'] ) . '</b>'
		. ( $a['interactive'] ? '<span class="tag tag-ok">' . esc_html__( 'Tap to tick', 'shopinbos' ) . '</span>' : '' ) . '</div>';
	foreach ( sib_lines( $a['items'] ) as $i => $line ) {
		$out .= '<button type="button" class="chkrow" aria-pressed="false" data-i="' . (int) $i . '"' . ( $a['interactive'] ? '' : ' disabled' ) . '><span class="box"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg></span><span class="chk-t">' . sib_inline( $line ) . '</span></button>';
	}
	return $out . '</aside>';
}

function sib_render_steps( array $a ): string {
	$out = '<aside class="blk blk-steps">' . ( $a['title'] ? '<b class="steps-title">' . esc_html( $a['title'] ) . '</b>' : '' ) . '<ol class="steps-list">';
	foreach ( sib_lines( $a['items'] ) as $i => $line ) {
		[ $h, $d ] = sib_pair( $line );
		$out      .= '<li class="stepl"><span class="num">' . ( $i + 1 ) . '</span><div class="col" style="gap:3px;padding-top:6px"><b style="font-size:16px">' . sib_inline( $h ) . '</b>' . ( $d ? '<span class="p">' . sib_inline( $d ) . '</span>' : '' ) . '</div></li>';
	}
	return $out . '</ol></aside>';
}

function sib_cta_link( array $a ): string {
	return $a['intent'] && preg_match( '/^[a-z_]+$/', $a['intent'] ) ? sib_go_url( $a['intent'] ) : ( is_singular() ? sib_post_cta_url() : sib_go_url() );
}

function sib_mascot_img( string $who, int $w, string $class = 'hide-m' ): string {
	return 'none' === $who || ! in_array( $who, [ 'rex', 'rex-side', 'peggy', 'peggy-wave' ], true ) ? '' : '<img src="' . sib_img( $who . '.webp' ) . '" alt="" width="' . $w . '" height="' . $w . '" loading="lazy" class="' . esc_attr( $class ) . '" style="width:' . $w . 'px;height:auto">';
}

function sib_render_cta_inline( array $a ): string {
	$tone = in_array( $a['tone'], [ 'orange', 'ink', 'teal' ], true ) ? $a['tone'] : 'orange';
	return '<aside class="blk blk-cta is-' . $tone . '"><span class="cta-mascot">' . sib_mascot_img( $a['mascot'], 150 ) . '</span>'
		. '<p class="eyebrow">' . esc_html( $a['eyebrow'] ) . '</p><h3 class="disp">' . esc_html( $a['title'] ) . '</h3><p class="cta-text">' . sib_inline( $a['text'] ) . '</p>'
		. '<div class="row wrapflex" style="margin-top:4px"><a class="btn btn-white" href="' . esc_url( sib_cta_link( $a ) ) . '">' . esc_html( $a['button'] ) . sib_icon( 'arrow', 16 ) . '</a>'
		. ( $a['linkLabel'] ? '<a class="lnk" style="color:inherit;padding:0 8px" href="' . esc_url( $a['linkUrl'] ?: home_url( '/' ) ) . '">' . esc_html( $a['linkLabel'] ) . '</a>' : '' ) . '</div></aside>';
}

function sib_render_quote( array $a ): string {
	$initial = $a['name'] ? mb_strtoupper( mb_substr( $a['name'], 0, 1 ) ) : '“';
	$shop    = $a['shop'] . ( $a['isExample'] ? ' · ' . __( 'example shop', 'shopinbos' ) : '' );
	return '<figure class="blk blk-quote"><span class="q-mark" aria-hidden="true">“</span><blockquote>' . sib_inline( $a['text'] ) . '</blockquote>'
		. '<figcaption class="row" style="gap:12px"><span class="av q-av">' . esc_html( $initial ) . '</span><span class="col" style="gap:0"><b style="font-size:15px">' . esc_html( $a['name'] ) . '</b><span style="font-size:13px;color:#6B6779">' . esc_html( trim( $shop, ' ·' ) ) . '</span></span></figcaption></figure>';
}

function sib_render_do_dont( array $a ): string {
	$tick = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16794A" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none;margin-top:2px"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
	$x    = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B42318" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none;margin-top:3px"><path d="M6 6l12 12M18 6 6 18"/></svg>';
	$col  = function ( $lines, $icon ) {
		return implode( '', array_map( fn( $l ) => '<p class="dd-row">' . $icon . '<span>' . sib_inline( $l ) . '</span></p>', sib_lines( $lines ) ) );
	};
	return '<aside class="col" style="gap:12px">' . ( $a['title'] ? '<b style="font-size:17px">' . esc_html( $a['title'] ) . '</b>' : '' ) . '<div class="dd">'
		. '<div class="blk dd-do"><span class="dd-head" style="color:#16794A">' . $tick . esc_html__( 'Do', 'shopinbos' ) . '</span>' . $col( $a['dos'], $tick ) . '</div>'
		. '<div class="blk dd-dont"><span class="dd-head" style="color:#B42318">' . $x . esc_html__( 'Don’t', 'shopinbos' ) . '</span>' . $col( $a['donts'], $x ) . '</div></div></aside>';
}

/** FAQ items as [question, answer]. Also read by schema.php. */
function sib_faq_items( string $items ): array {
	return array_values( array_filter( array_map( 'sib_pair', sib_lines( $items ) ), fn( $p ) => $p[0] && $p[1] ) );
}

function sib_render_faq_block( array $a ): string {
	$out = '<aside class="col faq" style="gap:10px">' . ( $a['title'] ? '<b class="disp" style="font-size:24px;margin-bottom:6px">' . esc_html( $a['title'] ) . '</b>' : '' );
	foreach ( sib_faq_items( $a['items'] ) as $i => [ $q, $ans ] ) {
		$out .= '<details' . ( 0 === $i && $a['openFirst'] ? ' open' : '' ) . '><summary>' . esc_html( $q ) . '</summary><p>' . sib_inline( $ans ) . '</p></details>';
	}
	return $out . '</aside>';
}

function sib_render_takeaways( array $a ): string {
	$out = '<aside class="blk blk-take"><b>' . esc_html__( 'Key takeaways', 'shopinbos' ) . '</b><ul class="ticks" style="--tick:#0C4A44">';
	foreach ( sib_lines( $a['items'] ) as $l ) {
		$out .= '<li>' . sib_inline( $l ) . '</li>';
	}
	return $out . '</ul></aside>';
}

function sib_render_helpful(): string {
	if ( ! is_singular() ) {
		return '';
	}
	return '<div class="helpful" data-vote="' . (int) get_the_ID() . '" data-endpoint="' . esc_url( admin_url( 'admin-post.php?action=sib_help_vote' ) ) . '" data-thanks="' . esc_attr__( 'Thanks for telling us.', 'shopinbos' ) . '">'
		. '<span class="meta" style="margin-right:6px">' . esc_html__( 'Was this useful?', 'shopinbos' ) . '</span>'
		. '<button type="button" class="btn btn-ghost btn-s" data-helpful="1">' . esc_html__( 'Yes', 'shopinbos' ) . '</button><button type="button" class="btn btn-ghost btn-s" data-helpful="0">' . esc_html__( 'Not really', 'shopinbos' ) . '</button>'
		. '<a class="lnk helpful-chat" hidden href="' . esc_url( sib_whatsapp_url( sprintf( 'I read "%s" and still need help.', get_the_title() ) ) ) . '">' . esc_html__( 'Chat with us on WhatsApp', 'shopinbos' ) . '</a></div>';
}

function sib_render_cta_band( array $a ): string {
	$tone = in_array( $a['tone'], [ 'ink', 'orange', 'teal' ], true ) ? $a['tone'] : 'ink';
	$btn  = 'ink' === $tone ? 'btn-acc' : 'btn-white';
	return '<section class="ctaband-wrap"><div class="wrap"><div class="ctab2 is-' . $tone . '"><div class="ctab2-circle" aria-hidden="true"></div>'
		. '<div class="col" style="gap:12px;position:relative;max-width:640px"><h2 class="disp bigh">' . esc_html( $a['title'] ) . '</h2><p class="ctab2-text">' . sib_inline( $a['text'] ) . '</p>'
		. '<div class="row wrapflex" style="gap:8px;margin-top:10px"><a class="btn ' . $btn . '" href="' . esc_url( sib_cta_link( $a ) ) . '">' . esc_html( $a['button'] ) . sib_icon( 'arrow', 16 ) . '</a>'
		. ( $a['linkLabel'] ? '<a class="lnk arrow" style="color:#fff;padding:0 10px" href="' . esc_url( $a['linkUrl'] ?: home_url( '/' ) ) . '">' . esc_html( $a['linkLabel'] ) . '</a>' : '' ) . '</div></div>'
		. sib_mascot_img( $a['mascot'], 150 ) . '</div></div></section>';
}

function sib_render_newsletter_band( array $a ): string {
	return '<section class="nl-wrap"><div class="wrap"><div class="nl-band split"><div class="col-22" style="gap:18px">'
		. '<span class="pill-label" style="background:transparent">' . esc_html__( 'Every Sunday', 'shopinbos' ) . '</span>'
		. '<h2 class="disp h2" style="font-size:42px">' . esc_html( $a['title'] ) . '</h2><p class="lead" style="color:#4A4536">' . esc_html( $a['text'] ) . '</p>'
		. sib_render_lead_form( [ 'kind' => 'sunday' ] ) . '</div>'
		. '<div class="hide-m nl-visual"><div class="nl-phone"><div class="row" style="gap:10px"><span class="av" style="background:#0C4A44"><img src="' . sib_img( 'peggy.webp' ) . '" alt="" width="28" height="28" style="width:28px;height:28px;object-fit:contain"></span><span class="col" style="gap:0"><b style="font-size:14px">Shopinbos Sunday</b><span style="font-size:12px;color:#6B6779">today, 8:00am</span></span></div>'
		. '<div class="bubble" style="background:#fff;max-width:100%">Good morning! This week’s idea: put the price <b>on</b> the picture. People who have to ask “how much?” often never ask.</div>'
		. '<div class="bubble" style="background:#fff;max-width:100%">Want the 2-minute lesson? Reply <b>LEARN</b>.</div><div class="bubble" style="background:#DCF8C6;align-self:flex-end">LEARN</div></div>'
		. '<div class="sticker" style="left:0;bottom:20px"><span class="av" style="background:#E2F5EA;width:32px;height:32px">' . sib_icon( 'tick', 16, '#16794A' ) . '</span>' . esc_html__( 'Free, no spam', 'shopinbos' ) . '</div></div>'
		. '</div></div></section>';
}
