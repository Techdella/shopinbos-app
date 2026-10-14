<?php
/**
 * Guide pages (/resources/{slug}/) in the design canvas's PDF style: a hero with the cover and a
 * "WhatsApp number or email" form (sent without leaving the page, then a download button), and
 * "What's inside" as numbered chapter cards.
 */

defined( 'ABSPATH' ) || exit;

add_action( 'init', function () {
	sib_register_block_group( [
		'resource-hero'   => [ __( 'Guide hero and form', 'shopinbos' ), 'sib_render_resource_hero', [] ],
		'resource-inside' => [ __( 'Guide chapters', 'shopinbos' ), 'sib_render_resource_inside', [] ],
	], 'widgets' );
}, 11 );

/** Chapters of a guide: saved by setup in sib_chapters, else the first list in the content. */
function sib_resource_chapters( int $id ): array {
	$saved = get_post_meta( $id, 'sib_chapters', true );
	if ( is_array( $saved ) && $saved ) {
		return $saved;
	}
	preg_match_all( '/<li>(.*?)<\/li>/s', (string) get_post_field( 'post_content', $id ), $m );
	return array_map( fn( $t ) => wp_strip_all_tags( $t ), $m[1] ?? [] );
}

function sib_render_resource_hero(): string {
	$id    = get_the_ID();
	$title = get_the_title( $id );
	$words = explode( ' ', $title );
	$tail  = count( $words ) > 3 ? implode( ' ', array_splice( $words, -2 ) ) : '';
	$h1    = esc_html( implode( ' ', $words ) ) . ( $tail ? ' <span class="grad">' . esc_html( $tail ) . '</span>' : '' );
	$pages = (int) get_post_meta( $id, 'sib_pages', true );
	$pill  = $pages ? sprintf( __( 'Free PDF · %d pages', 'shopinbos' ), $pages ) : __( 'Free PDF', 'shopinbos' );
	$cover = get_the_post_thumbnail_url( $id, 'large' );
	$crumb = '<div class="crumb"><a class="cv-b" href="' . esc_url( home_url( '/' ) ) . '" style="color:#6B6779;font-weight:600;font-size:13.5px">' . esc_html__( 'Home', 'shopinbos' ) . '</a><span>/</span><a class="cv-b" href="' . esc_url( home_url( '/resources/' ) ) . '" style="color:#6B6779;font-weight:600;font-size:13.5px">' . esc_html__( 'Free PDFs', 'shopinbos' ) . '</a><span>/</span><b style="color:#16141F">' . esc_html( $title ) . '</b></div>';
	$form  = '<form class="card" method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" data-cv-lead="download" style="padding:22px;display:flex;flex-direction:column;gap:12px;box-shadow:rgba(255,106,43,.45) 0 30px 60px -36px">'
		. '<b style="font-size:17px">' . esc_html__( 'Where should we send it?', 'shopinbos' ) . '</b>'
		. '<input class="input" name="name" aria-label="' . esc_attr__( 'Your first name', 'shopinbos' ) . '" placeholder="' . esc_attr__( 'Your first name', 'shopinbos' ) . '" autocomplete="given-name">'
		. '<input class="input" name="contact" required aria-label="' . esc_attr__( 'WhatsApp number or email', 'shopinbos' ) . '" placeholder="' . esc_attr__( 'WhatsApp number or email', 'shopinbos' ) . '" autocomplete="email tel">'
		. '<select class="input" name="sells" aria-label="' . esc_attr__( 'What do you sell', 'shopinbos' ) . '"><option value="">' . esc_html__( 'What do you sell?', 'shopinbos' ) . '</option><option>Fashion</option><option>Beauty</option><option>Food</option><option>Gadgets</option><option>Home</option><option>' . esc_html__( 'I haven’t started yet', 'shopinbos' ) . '</option></select>'
		. '<button class="btn btn-acc" type="submit">' . esc_html__( 'Send me the free PDF', 'shopinbos' ) . sib_icon( 'arrow', 16 ) . '</button>'
		. '<span class="meta">' . esc_html__( 'We send it once. No spam.', 'shopinbos' ) . '</span>'
		. '<input type="hidden" name="action" value="sib_lead"><input type="hidden" name="kind" value="download"><input type="hidden" name="resource" value="' . (int) $id . '"><input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px"></form>';
	$done  = '<div class="card" style="padding:22px;display:flex;gap:14px;align-items:center;background:#E2F5EA;border-color:#B7E4C7"><span class="av" style="background:#16794A">' . sib_icon( 'tick', 20, '#FFFFFF' ) . '</span><div style="flex:1;display:flex;flex-direction:column;gap:4px"><b>' . esc_html__( 'It’s on its way', 'shopinbos' ) . '</b><span class="p" style="font-size:14px">' . esc_html__( 'Check WhatsApp. You can also download it now.', 'shopinbos' ) . '</span></div><button type="button" class="btn btn-ink btn-s" data-cv="download">' . esc_html__( 'Download', 'shopinbos' ) . '</button></div>';
	$art   = $cover ? '<div class="res-cover"><img src="' . esc_url( $cover ) . '" alt="' . esc_attr( sprintf( __( 'Cover of %s', 'shopinbos' ), $title ) ) . '" width="420" height="594" fetchpriority="high"></div>' : '';
	$hero  = function ( $box, $pane ) use ( $crumb, $pill, $h1, $art, $id ) {
		return '<section class="ahero" data-pane="' . $pane . '"' . ( $pane ? ' hidden' : '' ) . ' style="padding:40px 0 72px;background:linear-gradient(#FFF6F1 0%,#fff 100%)"><div class="wrap" style="display:flex;flex-direction:column;gap:28px">' . $crumb
			. '<div class="split" style="gap:56px"><div style="display:flex;flex-direction:column;gap:18px"><span class="pill" style="align-self:flex-start">' . sib_icon( 'doc', 14, '#16141F' ) . esc_html( $pill ) . '</span>'
			. '<h1 class="disp h1" style="font-size:54px">' . $h1 . '</h1><p class="lead">' . esc_html( get_the_excerpt( $id ) ) . '</p>' . $box . '</div>' . $art . '</div></div></section>';
	};
	return '<div class="cv-panes cv" data-group="res-done">' . $hero( $form, 0 ) . $hero( $done, 1 ) . '</div>';
}

function sib_render_resource_inside(): string {
	$ch = sib_resource_chapters( get_the_ID() );
	if ( ! $ch ) {
		return '';
	}
	$out = '<section class="cv" style="padding:32px 0 80px"><div class="wrap" style="display:flex;flex-direction:column;gap:24px"><div style="display:flex;flex-direction:column;gap:12px"><span class="pill" style="align-self:flex-start">' . esc_html__( 'What’s inside', 'shopinbos' ) . '</span>'
		. '<h2 class="disp h2">' . esc_html( sprintf( _n( '%d short chapter', '%d short chapters', count( $ch ), 'shopinbos' ), count( $ch ) ) ) . '</h2></div><div class="g3">';
	foreach ( array_values( $ch ) as $i => $t ) {
		$t    = preg_replace( '/^(Chapter \d+:|Part \d+:|Section \d+:)\s*/i', '', $t );
		$out .= '<div class="card" style="padding:22px;display:flex;gap:16px;align-items:flex-start"><b class="disp" style="font-size:32px;color:#FF6A2B;line-height:1">' . sprintf( '%02d', $i + 1 ) . '</b><span style="display:flex;flex-direction:column;gap:4px"><b style="font-size:16.5px;line-height:1.35">' . esc_html( $t ) . '</b></span></div>';
	}
	return $out . '</div></div></section>';
}
