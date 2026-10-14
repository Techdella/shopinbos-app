<?php
/**
 * Legal pages (canvas v7): child pages of /legal/ using the "Legal" template.
 *
 * Content is ordinary blocks: an "In plain words" summary block, then one group per section
 * (class lgl-sec) holding an H2, paragraphs and a paragraph with class in-short. Sections are numbered
 * by CSS, and the contents list is built from the H2s. Page meta: sib_updated, sib_effective (Y-m-d),
 * sib_legal_email.
 */

defined( 'ABSPATH' ) || exit;

function sib_legal_block_defs(): array {
	return [
		'legal-hero'    => [ __( 'Legal: header and document tabs', 'shopinbos' ), 'sib_render_legal_hero', [] ],
		'legal-toc'     => [ __( 'Legal: contents', 'shopinbos' ), 'sib_render_legal_toc', [] ],
		'legal-summary' => [ __( 'Legal: in plain words', 'shopinbos' ), 'sib_render_legal_summary', [ 'title' => [ 'string', 'In plain words' ], 'items' => [ 'string', '' ], 'note' => [ 'string', 'This summary helps you understand the terms. The full text below is what applies.' ] ], [ 'multiline' => [ 'items' ], 'help' => [ 'items' => __( 'One point per line.', 'shopinbos' ) ] ] ],
		'legal-contact' => [ __( 'Legal: questions card', 'shopinbos' ), 'sib_render_legal_contact', [] ],
		'legal-index'   => [ __( 'Legal: list of documents', 'shopinbos' ), 'sib_render_legal_index', [] ],
	];
}

add_action( 'init', function () {
	foreach ( [ 'sib_updated', 'sib_effective', 'sib_legal_email' ] as $key ) {
		register_post_meta( 'page', $key, [ 'type' => 'string', 'single' => true, 'show_in_rest' => true, 'auth_callback' => fn() => current_user_can( 'edit_pages' ) ] );
	}
	sib_register_block_group( sib_legal_block_defs(), 'widgets' );
}, 11 );

/** The /legal/ parent page. */
function sib_legal_parent(): ?WP_Post {
	return get_page_by_path( 'legal' );
}

/** Legal documents in tab order. */
function sib_legal_docs(): array {
	$parent = sib_legal_parent();
	return $parent ? get_pages( [ 'child_of' => $parent->ID, 'parent' => $parent->ID, 'sort_column' => 'menu_order,post_title', 'post_status' => 'publish' ] ) : [];
}

function sib_legal_date( string $ymd ): string {
	return $ymd ? date_i18n( 'j F Y', strtotime( $ymd ) ) : '';
}

function sib_render_legal_hero(): string {
	$post = get_post();
	if ( ! $post ) {
		return '';
	}
	$updated   = (string) get_post_meta( $post->ID, 'sib_updated', true ) ?: get_the_modified_date( 'Y-m-d', $post );
	$effective = (string) get_post_meta( $post->ID, 'sib_effective', true );
	$dates     = sprintf( __( 'Last updated %s', 'shopinbos' ), sib_legal_date( $updated ) ) . ( $effective ? ' · ' . sprintf( __( 'Applies from %s', 'shopinbos' ), sib_legal_date( $effective ) ) : '' );
	$out       = '<section class="lgl-hero"><div class="wrap col" style="gap:16px;align-items:flex-start"><span class="pill-label left">' . esc_html__( 'Legal', 'shopinbos' ) . '</span>'
		. '<h1 class="disp h1" style="margin:0">' . esc_html( get_the_title( $post ) ) . '</h1>'
		. ( $post->post_excerpt ? '<p class="lead" style="max-width:720px">' . esc_html( $post->post_excerpt ) . '</p>' : '' )
		. '<p class="meta" style="margin:0">' . esc_html( $dates ) . '</p>';
	$docs = sib_legal_docs();
	if ( count( $docs ) > 1 ) {
		$out .= '<nav class="seg docs" aria-label="' . esc_attr__( 'Legal documents', 'shopinbos' ) . '">';
		foreach ( $docs as $d ) {
			$out .= '<a class="segb" href="' . esc_url( get_permalink( $d ) ) . '"' . ( $d->ID === $post->ID ? ' aria-current="page"' : '' ) . '>' . esc_html( get_the_title( $d ) ) . '</a>';
		}
		$out .= '</nav>';
	}
	return $out . '</div></section>';
}

/** H2s anywhere in the page, including inside section groups. */
function sib_legal_headings( array $blocks ): array {
	$out = [];
	foreach ( $blocks as $b ) {
		if ( 'core/heading' === $b['blockName'] && 2 === (int) ( $b['attrs']['level'] ?? 2 ) ) {
			$text  = trim( wp_strip_all_tags( $b['innerHTML'] ) );
			$out[] = [ $text, $b['attrs']['anchor'] ?? sanitize_title( $text ) ];
		}
		if ( ! empty( $b['innerBlocks'] ) ) {
			$out = array_merge( $out, sib_legal_headings( $b['innerBlocks'] ) );
		}
	}
	return $out;
}

function sib_render_legal_toc(): string {
	$post  = get_post();
	$heads = $post ? sib_legal_headings( parse_blocks( $post->post_content ) ) : [];
	$out   = '<nav class="lgl-toc" aria-label="' . esc_attr__( 'Contents', 'shopinbos' ) . '"><p class="eyebrow" style="color:#6B6779;margin:0 0 8px">' . esc_html__( 'Contents', 'shopinbos' ) . '</p>';
	foreach ( $heads as $i => [ $t, $id ] ) {
		$out .= '<a class="tocb" href="#' . esc_attr( $id ) . '"><span class="n">' . ( $i + 1 ) . '</span>' . esc_html( $t ) . '</a>';
	}
	$email = $post ? sib_legal_email( $post ) : 'legal@shopinbos.com';
	return $out . '<div class="card" style="margin-top:18px;padding:16px;display:flex;flex-direction:column;gap:6px"><b style="font-size:14px">' . esc_html__( 'Questions?', 'shopinbos' ) . '</b>'
		. '<span style="font-size:13.5px;color:#6B6779;line-height:1.5">' . esc_html__( 'Ask us in plain words. We reply within 2 working days.', 'shopinbos' ) . '</span>'
		. '<a class="lnk" href="mailto:' . esc_attr( $email ) . '" style="font-size:13.5px">' . esc_html( $email ) . '</a></div></nav>';
}

function sib_legal_email( WP_Post $post ): string {
	$email = (string) get_post_meta( $post->ID, 'sib_legal_email', true );
	return is_email( $email ) ? $email : 'legal@shopinbos.com';
}

function sib_render_legal_summary( array $a ): string {
	$items = sib_lines( $a['items'] );
	if ( ! $items ) {
		return '';
	}
	$out = '<aside class="lgl-sum"><span class="row" style="gap:10px"><span class="av" style="background:#fff;width:36px;height:36px"><img src="' . esc_url( sib_img( 'peggy.webp' ) ) . '" alt="" width="26" height="26" style="width:26px;height:26px;object-fit:contain"></span><b class="disp" style="font-size:22px">' . esc_html( $a['title'] ) . '</b></span><ul>';
	foreach ( $items as $l ) {
		$out .= '<li>' . sib_inline( $l ) . '</li>';
	}
	return $out . '</ul>' . ( $a['note'] ? '<p class="note" style="margin:0">' . esc_html( $a['note'] ) . '</p>' : '' ) . '</aside>';
}

function sib_render_legal_contact(): string {
	$post  = get_post();
	$email = $post ? sib_legal_email( $post ) : 'legal@shopinbos.com';
	return '<aside class="card" style="padding:26px;display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap"><span class="av" style="background:#E2F6F1;width:48px;height:48px">' . sib_icon( 'mail', 22, '#0C4A44' ) . '</span>'
		. '<div class="col" style="gap:6px;flex:1;min-width:220px"><b style="font-size:18px">' . esc_html__( 'Contact us about this document', 'shopinbos' ) . '</b>'
		. '<p class="p" style="margin:0">' . esc_html__( 'Tech Della Solutions Ltd (RC 7038770), Lagos, Nigeria.', 'shopinbos' ) . ' <a href="mailto:' . esc_attr( $email ) . '">' . esc_html( $email ) . '</a></p>'
		. '<p class="p" style="margin:0">' . esc_html__( 'For anything about your shop, chat with us on WhatsApp, 8am to 8pm every day.', 'shopinbos' ) . '</p></div>'
		. '<a class="btn btn-ghost btn-s" href="' . esc_url( sib_whatsapp_url( 'I have a question about ' . get_the_title() ) ) . '">' . sib_icon( 'whatsapp', 16 ) . esc_html__( 'Chat with us', 'shopinbos' ) . '</a></aside>';
}

function sib_render_legal_index(): string {
	$docs = sib_legal_docs();
	if ( ! $docs ) {
		return '';
	}
	$out = '<div class="g2" style="margin-top:8px">';
	foreach ( $docs as $d ) {
		$out .= '<a class="card" style="padding:22px;display:flex;flex-direction:column;gap:8px;text-decoration:none;color:inherit" href="' . esc_url( get_permalink( $d ) ) . '"><b style="font-size:18px">' . esc_html( get_the_title( $d ) ) . '</b>'
			. '<span class="p" style="font-size:14.5px">' . esc_html( $d->post_excerpt ) . '</span><span class="lnk">' . esc_html__( 'Read', 'shopinbos' ) . sib_icon( 'arrow', 16 ) . '</span></a>';
	}
	return $out . '</div>';
}

/* Section headings on legal pages get ids so the contents list can link to them. */
add_filter( 'render_block_core/heading', function ( $html ) {
	if ( ! is_page() || str_contains( $html, ' id="' ) || ! preg_match( '#^\s*<h2#', $html ) || 'page-legal' !== get_page_template_slug() ) {
		return $html;
	}
	$id = sanitize_title( wp_strip_all_tags( $html ) );
	return $id ? preg_replace( '#^(\s*<h2)#', '$1 id="' . esc_attr( $id ) . '"', $html, 1 ) : $html;
} );
