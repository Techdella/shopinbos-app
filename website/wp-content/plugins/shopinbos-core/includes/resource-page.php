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
		'resource-archive' => [ __( 'Guides and PDFs list', 'shopinbos' ), 'sib_render_resource_archive', [] ],
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

/** A guide's kind (guide, workbook, template, checklist): saved by setup, else from the seed file. */
function sib_resource_style( int $id ): string {
	$style = (string) get_post_meta( $id, 'sib_style', true );
	if ( $style ) {
		return $style;
	}
	static $seed = null;
	if ( null === $seed ) {
		$seed = [];
		$file = SIB_CORE_DIR . '/includes/seed/resources.json';
		foreach ( file_exists( $file ) ? (array) json_decode( (string) file_get_contents( $file ), true ) : [] as $r ) {
			$seed[ $r['slug'] ] = $r['style'];
		}
	}
	return $seed[ get_post_field( 'post_name', $id ) ] ?? 'guide';
}

/** The /resources/ page: a featured guide, filters by kind, and a grid of covers. */
function sib_render_resource_archive(): string {
	$posts = get_posts( [ 'post_type' => 'sib_resource', 'post_status' => 'publish', 'numberposts' => 60, 'orderby' => [ 'menu_order' => 'ASC', 'date' => 'DESC' ] ] );
	if ( ! $posts ) {
		return '';
	}
	$kinds = [
		'guide'     => [ __( 'Guides', 'shopinbos' ), __( 'Guide', 'shopinbos' ), '#FFF1E8', '#FF6A2B' ],
		'workbook'  => [ __( 'Workbooks', 'shopinbos' ), __( 'Workbook', 'shopinbos' ), '#E3F4EF', '#0C4A44' ],
		'template'  => [ __( 'Templates', 'shopinbos' ), __( 'Templates', 'shopinbos' ), '#FFF7D6', '#8A5A00' ],
		'checklist' => [ __( 'Checklists', 'shopinbos' ), __( 'Checklist', 'shopinbos' ), '#EEEAFF', '#5B3FD6' ],
	];
	$feat = null;
	foreach ( $posts as $i => $p ) {
		if ( 'online-sellers-starter-kit' === $p->post_name ) {
			$feat = $p;
			unset( $posts[ $i ] );
		}
	}
	$feat  = $feat ?: array_shift( $posts );
	$cover = function ( WP_Post $p, string $size, bool $eager = false ): string {
		$url = get_the_post_thumbnail_url( $p, $size );
		return $url ? '<img src="' . esc_url( $url ) . '" alt="" loading="' . ( $eager ? 'eager' : 'lazy' ) . '" width="300" height="424">' : '<span class="rs-blank">' . sib_icon( 'doc', 40 ) . '</span>';
	};
	$meta  = function ( WP_Post $p ) use ( $kinds ): string {
		$k     = $kinds[ sib_resource_style( $p->ID ) ] ?? $kinds['guide'];
		$pages = (int) get_post_meta( $p->ID, 'sib_pages', true );
		return '<span class="rs-tag" style="background:' . $k[2] . ';color:' . $k[3] . '">' . esc_html( $k[1] ) . '</span>'
			. ( $pages ? '<span class="rs-pages">' . esc_html( sprintf( _n( '%d page', '%d pages', $pages, 'shopinbos' ), $pages ) ) . ' · PDF</span>' : '<span class="rs-pages">PDF</span>' );
	};
	$sub = fn( WP_Post $p ) => wp_trim_words( wp_strip_all_tags( $p->post_excerpt ?: (string) get_post_meta( $p->ID, 'rank_math_description', true ) ?: $p->post_content ), 26 );

	$fk  = $kinds[ sib_resource_style( $feat->ID ) ] ?? $kinds['guide'];
	$out = '<section class="rs cv"><div class="wrap">';
	$out .= '<div class="rs-hero"><div class="rs-hero-copy"><span class="pill">' . esc_html__( 'Free guides and PDFs', 'shopinbos' ) . '</span>'
		. '<h1 class="disp h1">' . esc_html__( 'Print it, fill it in, sell more', 'shopinbos' ) . '</h1>'
		. '<p class="lead">' . esc_html( sprintf( __( '%d free guides, workbooks, templates and checklists for selling online in Nigeria. Pick one, leave your email and it opens straight away.', 'shopinbos' ), count( $posts ) + 1 ) ) . '</p></div>'
		. '<a class="rs-feat" href="' . esc_url( get_permalink( $feat ) ) . '" style="--rs-bg:' . $fk[2] . '"><span class="rs-feat-cover">' . $cover( $feat, 'large', true ) . '</span><span class="rs-feat-body"><span class="rs-meta"><span class="rs-tag rs-tag-hot">' . esc_html__( 'Most downloaded', 'shopinbos' ) . '</span>' . $meta( $feat ) . '</span>'
		. '<b class="rs-title">' . esc_html( get_the_title( $feat ) ) . '</b><span class="rs-sub">' . esc_html( $sub( $feat ) ) . '</span><span class="btn btn-accent">' . esc_html__( 'Get it free', 'shopinbos' ) . sib_icon( 'arrow', 16 ) . '</span></span></a></div>';

	$out .= '<div class="rs-bar"><div class="rs-chips" data-filter="rs-grid"><button type="button" class="chip" data-value="all" aria-pressed="true">' . esc_html__( 'All', 'shopinbos' ) . '</button>';
	$used = array_unique( array_map( fn( $p ) => sib_resource_style( $p->ID ), $posts ) );
	foreach ( $kinds as $key => $k ) {
		if ( in_array( $key, $used, true ) ) {
			$out .= '<button type="button" class="chip" data-value="' . $key . '" aria-pressed="false">' . esc_html( $k[0] ) . '</button>';
		}
	}
	$out .= '</div><span class="rs-count" data-filter-count="rs-grid" data-template="' . esc_attr__( '%d free PDFs', 'shopinbos' ) . '">' . esc_html( sprintf( __( '%d free PDFs', 'shopinbos' ), count( $posts ) ) ) . '</span></div>';

	$out .= '<div class="rs-grid" id="rs-grid">';
	foreach ( $posts as $p ) {
		$k    = $kinds[ sib_resource_style( $p->ID ) ] ?? $kinds['guide'];
		$out .= '<a class="rs-card" href="' . esc_url( get_permalink( $p ) ) . '" data-tags="' . esc_attr( sib_resource_style( $p->ID ) ) . '" style="--rs-bg:' . $k[2] . '">'
			. '<span class="rs-cover">' . $cover( $p, 'medium_large' ) . '</span>'
			. '<span class="rs-body"><span class="rs-meta">' . $meta( $p ) . '</span><b class="rs-title">' . esc_html( get_the_title( $p ) ) . '</b><span class="rs-sub">' . esc_html( $sub( $p ) ) . '</span>'
			. '<span class="rs-go">' . esc_html__( 'Get the free PDF', 'shopinbos' ) . sib_icon( 'arrow', 16 ) . '</span></span></a>';
	}
	return $out . '</div></div></section>';
}
