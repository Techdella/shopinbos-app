<?php
/**
 * Compare pages (/compare/{slug}/, sib_comparison). The Compare block holds a whole comparison: hero with
 * "vs" chips and the date it was last checked, verdict cards, the feature table (with rows where the other
 * product is stronger: being fair is the point), switching steps, FAQ, links to other comparisons and
 * search phrases. Comparisons older than 90 days are flagged in the admin list.
 */

defined( 'ABSPATH' ) || exit;

add_action( 'init', function () {
	sib_register_block_group( [
		'compare' => [ __( 'Comparison', 'shopinbos' ), 'sib_render_compare', [
			'competitor'  => [ 'string', '' ],
			'lastChecked' => [ 'string', '' ],
			'h1'          => [ 'string', '' ],
			'sub'         => [ 'string', '' ],
			'chooseUs'    => [ 'string', '' ],
			'chooseThem'  => [ 'string', '' ],
			'rows'        => [ 'string', '' ],
			'steps'       => [ 'string', '' ],
			'faq'         => [ 'string', '' ],
			'kws'         => [ 'string', '' ],
		], [ 'multiline' => [ 'sub', 'chooseUs', 'chooseThem', 'rows', 'steps', 'faq', 'kws' ], 'help' => [
			'lastChecked' => __( 'Required. YYYY-MM-DD. Re-check every 90 days.', 'shopinbos' ),
			'chooseUs'    => __( '“Choose Shopinbos if…”: 4 lines.', 'shopinbos' ),
			'chooseThem'  => __( '“Choose them if…”: 4 lines. Be fair.', 'shopinbos' ),
			'rows'        => __( 'One per line: feature | Shopinbos | them | winner (us, them or tie). Never give their prices as fixed numbers unless sourced and dated.', 'shopinbos' ),
			'steps'       => __( 'Switching steps: one per line.', 'shopinbos' ),
			'faq'         => __( 'One per line: question | answer. “Is Shopinbos cheaper?” and “Can I move my store?” are added if missing.', 'shopinbos' ),
			'kws'         => __( 'Search phrases shown as chips, one per line.', 'shopinbos' ),
		] ] ],
	], 'widgets' );
	register_post_meta( 'sib_comparison', 'sib_last_checked', [ 'type' => 'string', 'single' => true, 'show_in_rest' => true, 'auth_callback' => fn() => current_user_can( 'edit_posts' ) ] );
}, 11 );

/** The Compare block's attributes for a post, or null. */
function sib_compare_data( $post ): ?array {
	foreach ( parse_blocks( get_post( $post )->post_content ) as $b ) {
		if ( 'shopinbos/compare' === $b['blockName'] ) {
			return $b['attrs'];
		}
	}
	return null;
}

function sib_render_compare( array $a ): string {
	$them  = $a['competitor'] ?: __( 'the other platform', 'shopinbos' );
	$date  = $a['lastChecked'] ? date_i18n( 'j F Y', strtotime( $a['lastChecked'] ) ) : '';
	$tick  = sib_icon( 'tick', 16, '#16794A' );
	$list  = fn( $lines ) => '<ul class="ticks">' . implode( '', array_map( fn( $l ) => '<li>' . sib_inline( $l ) . '</li>', sib_lines( $lines ) ) ) . '</ul>';
	$badge = [ 'us' => [ 'Shopinbos', 'tag-ok' ], 'them' => [ $them, 'tag-violet' ], 'tie' => [ __( 'Both', 'shopinbos' ), '' ] ];

	$out = '<div class="cmp">'
		// Hero
		. '<section class="land-hero"><div class="wrap col" style="gap:18px;padding-top:40px;padding-bottom:48px;align-items:center;text-align:center">'
		. '<div class="row" style="gap:10px;justify-content:center"><span class="pill-label" style="background:#16141F;color:#fff;border-color:#16141F">Shopinbos</span><span class="disp" style="font-size:20px">vs</span><span class="pill-label">' . esc_html( $them ) . '</span></div>'
		. '<h1 class="disp h1" style="max-width:900px;margin:0">' . esc_html( $a['h1'] ?: get_the_title() ) . '</h1>'
		. ( $a['sub'] ? '<p class="lead" style="max-width:680px">' . sib_inline( $a['sub'] ) . '</p>' : '' )
		. ( $date ? '<p class="meta" style="margin:0">' . esc_html( sprintf( __( 'Last checked %s', 'shopinbos' ), $date ) ) . '</p>' : '' )
		. '</div></section>'
		// Verdicts
		. '<section style="padding:8px 0 56px"><div class="wrap g2">'
		. '<div class="card cmp-verdict is-us"><b class="disp" style="font-size:22px">' . esc_html__( 'Choose Shopinbos if…', 'shopinbos' ) . '</b>' . $list( $a['chooseUs'] ) . '</div>'
		. '<div class="card cmp-verdict"><b class="disp" style="font-size:22px">' . esc_html( sprintf( __( 'Choose %s if…', 'shopinbos' ), $them ) ) . '</b>' . $list( $a['chooseThem'] ) . '</div>'
		. '</div></section>';

	// Table
	$rows = array_filter( array_map( fn( $l ) => array_map( 'trim', explode( '|', $l ) ), sib_lines( $a['rows'] ) ), fn( $r ) => count( $r ) >= 3 );
	if ( $rows ) {
		$out .= '<section class="bg-mist" style="padding:64px 0"><div class="wrap col" style="gap:20px"><h2 class="disp h2" style="margin:0">' . esc_html__( 'Side by side', 'shopinbos' ) . '</h2>'
			. '<div class="cmp-table-wrap"><table class="cmp-table"><thead><tr><th>' . esc_html__( 'Feature', 'shopinbos' ) . '</th><th>Shopinbos</th><th>' . esc_html( $them ) . '</th><th>' . esc_html__( 'Better for this', 'shopinbos' ) . '</th></tr></thead><tbody>';
		foreach ( $rows as $r ) {
			$win  = strtolower( $r[3] ?? 'tie' );
			$b    = $badge[ $win ] ?? $badge['tie'];
			$out .= '<tr><th scope="row">' . esc_html( $r[0] ) . '</th><td>' . sib_inline( $r[1] ) . '</td><td>' . sib_inline( $r[2] ) . '</td><td><span class="tag ' . $b[1] . '">' . ( 'us' === $win ? $tick : '' ) . esc_html( $b[0] ) . '</span></td></tr>';
		}
		$out .= '</tbody></table></div><p class="meta" style="margin:0">' . esc_html__( 'Features change. We check this page every three months; tell us if something is out of date.', 'shopinbos' ) . '</p></div></section>';
	}

	// Switching steps + FAQ
	$faq = sib_faq_items( (string) $a['faq'] );
	$qs  = array_map( fn( $f ) => mb_strtolower( $f[0] ), $faq );
	if ( ! preg_grep( '/cheaper/', $qs ) ) {
		$faq[] = [ sprintf( 'Is Shopinbos cheaper than %s?', $them ), 'Shopinbos is free to start, and paid plans are in naira with VAT included. See the Pricing page for today’s prices, and compare what you would pay for payments, delivery and add-ons on each.' ];
	}
	if ( ! preg_grep( '/move|switch/', $qs ) ) {
		$faq[] = [ sprintf( 'Can I move my store from %s?', $them ), 'Yes. Export your products as a spreadsheet, upload it to Shopinbos and Rex maps the fields. You can keep your domain.' ];
	}
	$out .= '<section style="padding:64px 0"><div class="wrap split split-top">';
	if ( $steps = sib_lines( $a['steps'] ) ) {
		$out .= '<div class="col" style="gap:16px"><h2 class="disp h2" style="margin:0">' . esc_html( sprintf( __( 'Moving from %s', 'shopinbos' ), $them ) ) . '</h2>'
			. sib_render_steps( [ 'title' => '', 'items' => implode( "\n", $steps ) ] ) . '</div>';
	}
	$out .= '<div class="col faq" style="gap:10px"><b class="disp" style="font-size:24px;margin-bottom:6px">' . esc_html__( 'Questions', 'shopinbos' ) . '</b>';
	foreach ( $faq as $i => [ $q, $ans ] ) {
		$out .= '<details' . ( 0 === $i ? ' open' : '' ) . '><summary>' . esc_html( $q ) . '</summary><p>' . sib_inline( $ans ) . '</p></details>';
	}
	$out .= '</div></div></section>';

	// Other comparisons and search phrases
	$others = get_posts( [ 'post_type' => 'sib_comparison', 'numberposts' => 12, 'post_status' => 'publish', 'post__not_in' => [ get_the_ID() ], 'orderby' => 'menu_order title', 'order' => 'ASC' ] );
	$kws    = sib_lines( (string) $a['kws'] );
	if ( $others || $kws ) {
		$out .= '<section style="padding:0 0 32px"><div class="wrap col" style="gap:14px">';
		if ( $others ) {
			$out .= '<b>' . esc_html__( 'More comparisons', 'shopinbos' ) . '</b><nav class="row wrapflex" style="gap:8px">' . implode( '', array_map( fn( $p ) => '<a class="chip" href="' . esc_url( get_permalink( $p ) ) . '">' . esc_html( get_the_title( $p ) ) . '</a>', $others ) ) . '</nav>';
		}
		if ( $kws ) {
			$out .= '<div class="row wrapflex" style="gap:8px;margin-top:6px">' . implode( '', array_map( fn( $k ) => '<span class="tag">' . esc_html( $k ) . '</span>', $kws ) ) . '</div>';
		}
		$out .= '</div></section>';
	}
	return $out . '</div>';
}

/* Keep the last-checked date in meta too, for the admin list. */
add_action( 'save_post_sib_comparison', function ( $id ) {
	$a = sib_compare_data( $id );
	if ( $a && ! empty( $a['lastChecked'] ) ) {
		update_post_meta( $id, 'sib_last_checked', sanitize_text_field( $a['lastChecked'] ) );
	}
} );

add_filter( 'manage_sib_comparison_posts_columns', fn( $c ) => $c + [ 'sib_checked' => __( 'Last checked', 'shopinbos' ) ] );
add_action( 'manage_sib_comparison_posts_custom_column', function ( $col, $id ) {
	if ( 'sib_checked' !== $col ) {
		return;
	}
	$d = (string) get_post_meta( $id, 'sib_last_checked', true );
	if ( ! $d ) {
		echo '<span style="color:#B42318">' . esc_html__( 'Not set', 'shopinbos' ) . '</span>';
		return;
	}
	$old = strtotime( $d ) < strtotime( '-90 days' );
	echo '<span' . ( $old ? ' style="color:#B42318;font-weight:700"' : '' ) . '>' . esc_html( date_i18n( 'j M Y', strtotime( $d ) ) ) . ( $old ? ' · ' . esc_html__( 'check again', 'shopinbos' ) : '' ) . '</span>';
}, 10, 2 );
