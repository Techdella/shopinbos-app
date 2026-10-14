<?php
/**
 * Academy (no sign-in). Lessons (sib_lesson) belong to one track (sib_track).
 *
 *   /academy/                    Academy home (lesson archive)
 *   /academy/{track}/            Track page
 *   /academy/{track}/{lesson}/   Lesson
 *
 * A lesson's content is one "Lesson" block (intro in English and Pidgin, what you'll learn, steps, try it,
 * checklist, quick check, optional video), followed by any other blocks. Lesson order is menu_order.
 * Track fields (term meta): sib_bg, sib_fg, sib_icon, sib_order; the blurb is the term description.
 * Progress is kept on the visitor's phone (localStorage key sib-academy-v1, see assets/js/academy.js).
 */

defined( 'ABSPATH' ) || exit;

add_action( 'init', function () {
	register_taxonomy( 'sib_track', [ 'sib_lesson' ], [
		'labels'            => [ 'name' => __( 'Tracks', 'shopinbos' ), 'singular_name' => __( 'Track', 'shopinbos' ), 'add_new_item' => __( 'Add track', 'shopinbos' ) ],
		'hierarchical'      => true,
		'show_in_rest'      => true,
		'show_admin_column' => true,
		'rewrite'           => [ 'slug' => 'academy', 'with_front' => false ],
	] );
	add_rewrite_tag( '%sib_track%', '([^/]+)', 'sib_track=' );
	register_post_type( 'sib_lesson', [
		'labels'       => [ 'name' => __( 'Academy lessons', 'shopinbos' ), 'singular_name' => __( 'Lesson', 'shopinbos' ), 'add_new_item' => __( 'Add lesson', 'shopinbos' ), 'all_items' => __( 'Lessons', 'shopinbos' ) ],
		'public'       => true,
		'show_in_rest' => true,
		'menu_icon'    => 'dashicons-welcome-learn-more',
		'menu_position' => 21,
		'has_archive'  => 'academy',
		'rewrite'      => [ 'slug' => 'academy/%sib_track%', 'with_front' => false ],
		'supports'     => [ 'title', 'editor', 'excerpt', 'thumbnail', 'revisions', 'page-attributes', 'custom-fields' ],
		'template'     => [ [ 'shopinbos/lesson', [] ] ],
		'map_meta_cap' => true,
	] );
	foreach ( [ 'sib_bg', 'sib_fg', 'sib_icon' ] as $key ) {
		register_term_meta( 'sib_track', $key, [ 'type' => 'string', 'single' => true, 'show_in_rest' => true ] );
	}
	register_term_meta( 'sib_track', 'sib_order', [ 'type' => 'integer', 'single' => true, 'show_in_rest' => true ] );

	sib_register_block_group( [
		'lesson'           => [ __( 'Lesson', 'shopinbos' ), 'sib_render_lesson', [
			'minutes'   => [ 'number', 4 ],
			'introEn'   => [ 'string', '' ],
			'introPcm'  => [ 'string', '' ],
			'learn'     => [ 'string', '' ],
			'steps'     => [ 'string', '' ],
			'tryEn'     => [ 'string', '' ],
			'tryPcm'    => [ 'string', '' ],
			'checks'    => [ 'string', '' ],
			'quiz'      => [ 'string', '' ],
			'options'   => [ 'string', '' ],
			'correct'   => [ 'number', 1 ],
			'why'       => [ 'string', '' ],
			'video'     => [ 'string', '' ],
			'videoTitle' => [ 'string', '' ],
		], [ 'multiline' => [ 'introEn', 'introPcm', 'learn', 'steps', 'tryEn', 'tryPcm', 'checks', 'options', 'why' ], 'help' => [
			'learn'   => __( '“In this lesson you’ll learn”: 4 lines.', 'shopinbos' ),
			'steps'   => __( 'One per line: heading | description', 'shopinbos' ),
			'checks'  => __( 'Checklist: one per line.', 'shopinbos' ),
			'options' => __( 'Quick check answers: one per line.', 'shopinbos' ),
			'correct' => __( 'Number of the right answer (1, 2 or 3).', 'shopinbos' ),
			'video'   => __( 'YouTube video ID or link. Leave empty if there is no video yet.', 'shopinbos' ),
		] ] ],
		'academy-hero'      => [ __( 'Academy: hero with search', 'shopinbos' ), 'sib_render_academy_hero', [] ],
		'academy-stats'     => [ __( 'Academy: numbers strip', 'shopinbos' ), 'sib_render_academy_stats', [] ],
		'academy-tracks'    => [ __( 'Academy: tracks grid', 'shopinbos' ), 'sib_render_academy_tracks', [] ],
		'academy-preview'   => [ __( 'Academy: track preview', 'shopinbos' ), 'sib_render_academy_preview', [] ],
		'academy-ways'      => [ __( 'Academy: learn the way that suits you', 'shopinbos' ), 'sib_render_academy_ways', [] ],
		'academy-downloads' => [ __( 'Academy: free downloads', 'shopinbos' ), 'sib_render_academy_downloads', [] ],
		'academy-help'      => [ __( 'Academy: questions', 'shopinbos' ), 'sib_render_academy_help', [ 'items' => [ 'string', "Do I need an account to use the Academy? | No. Every lesson and download is free and open. We save your progress on this phone so you can pick up where you stopped.\nAre the lessons in Pidgin? | Every lesson has an English and a Pidgin version. Tap the language switch at the top of a lesson. Yorùbá, Hausa and Igbo are coming next.\nCan I get lessons on WhatsApp? | Yes. Send LEARN to our WhatsApp line and Peggy sends you one short lesson a day. Reply STOP at any time.\nI’m stuck on something in my shop. Who do I talk to? | Chat with a real person on WhatsApp, 8am to 8pm every day, in English or Pidgin." ] ], [ 'multiline' => [ 'items' ], 'help' => [ 'items' => __( 'One per line: question | answer', 'shopinbos' ) ] ] ],
		'track-head'        => [ __( 'Academy: track header and lessons', 'shopinbos' ), 'sib_render_track_head', [] ],
		'lesson-side'       => [ __( 'Academy: lesson sidebar', 'shopinbos' ), 'sib_render_lesson_side', [] ],
	], 'widgets' );
}, 11 );

/* /academy/{track}/{lesson}/: put the lesson's track in its link. */
add_filter( 'post_type_link', function ( $link, $post ) {
	if ( 'sib_lesson' !== $post->post_type || ! str_contains( $link, '%sib_track%' ) ) {
		return $link;
	}
	$t = sib_lesson_track( $post );
	return str_replace( '%sib_track%', $t ? $t->slug : 'lessons', $link );
}, 10, 2 );

/* Lesson archives: all lessons in track order. */
add_action( 'pre_get_posts', function ( WP_Query $q ) {
	if ( ! is_admin() && $q->is_main_query() && ( $q->is_post_type_archive( 'sib_lesson' ) || $q->is_tax( 'sib_track' ) ) ) {
		$q->set( 'posts_per_page', 100 );
		$q->set( 'orderby', [ 'menu_order' => 'ASC', 'title' => 'ASC' ] );
	}
} );

add_action( 'wp_enqueue_scripts', function () {
	if ( is_post_type_archive( 'sib_lesson' ) || is_tax( 'sib_track' ) || is_singular( 'sib_lesson' ) ) {
		wp_enqueue_script( 'sib-academy', SIB_CORE_URL . 'assets/js/academy.js', [], SIB_CORE_VERSION, [ 'strategy' => 'defer', 'in_footer' => true ] );
	}
} );

/* ---------- data ---------- */

function sib_lesson_track( $post ): ?WP_Term {
	$terms = get_the_terms( $post, 'sib_track' );
	return $terms && ! is_wp_error( $terms ) ? $terms[0] : null;
}

/** Tracks in order, each with its lessons. Cached per request. */
function sib_academy_tracks(): array {
	static $tracks = null;
	if ( null !== $tracks ) {
		return $tracks;
	}
	$terms = get_terms( [ 'taxonomy' => 'sib_track', 'hide_empty' => false, 'parent' => 0 ] );
	$terms = is_wp_error( $terms ) ? [] : $terms;
	usort( $terms, fn( $a, $b ) => ( (int) get_term_meta( $a->term_id, 'sib_order', true ) ?: 99 ) <=> ( (int) get_term_meta( $b->term_id, 'sib_order', true ) ?: 99 ) );
	$tracks = [];
	foreach ( $terms as $t ) {
		$lessons = get_posts( [ 'post_type' => 'sib_lesson', 'numberposts' => 100, 'post_status' => 'publish', 'orderby' => [ 'menu_order' => 'ASC', 'title' => 'ASC' ], 'tax_query' => [ [ 'taxonomy' => 'sib_track', 'terms' => $t->term_id ] ] ] );
		$tracks[] = [
			'term'    => $t,
			'bg'      => (string) get_term_meta( $t->term_id, 'sib_bg', true ) ?: '#F6F5F9',
			'fg'      => (string) get_term_meta( $t->term_id, 'sib_fg', true ) ?: '#16141F',
			'icon'    => (string) get_term_meta( $t->term_id, 'sib_icon', true ) ?: 'book',
			'lessons' => $lessons,
			'mins'    => array_sum( array_map( fn( $l ) => sib_lesson_data( $l )['minutes'], $lessons ) ),
		];
	}
	return $tracks;
}

function sib_academy_track( WP_Term $term ): ?array {
	foreach ( sib_academy_tracks() as $t ) {
		if ( $t['term']->term_id === $term->term_id ) {
			return $t;
		}
	}
	return null;
}

/** The attributes of a lesson's Lesson block, with defaults. */
function sib_lesson_data( $post ): array {
	static $cache = [];
	$post = get_post( $post );
	if ( isset( $cache[ $post->ID ] ) ) {
		return $cache[ $post->ID ];
	}
	$attrs = [];
	foreach ( parse_blocks( $post->post_content ) as $b ) {
		if ( 'shopinbos/lesson' === $b['blockName'] ) {
			$attrs = $b['attrs'];
			break;
		}
	}
	$defaults = [ 'minutes' => 4, 'introEn' => '', 'introPcm' => '', 'learn' => '', 'steps' => '', 'tryEn' => '', 'tryPcm' => '', 'checks' => '', 'quiz' => '', 'options' => '', 'correct' => 1, 'why' => '', 'video' => '', 'videoTitle' => '' ];
	$data     = array_merge( $defaults, $attrs );
	$data['minutes'] = max( 1, (int) $data['minutes'] );
	return $cache[ $post->ID ] = $data;
}

function sib_track_icon( string $icon, int $size, string $color ): string {
	return sib_icon( 'wa' === $icon ? 'whatsapp' : $icon, $size, $color );
}

function sib_lessons_label( int $n ): string {
	/* translators: %d: number of lessons */
	return sprintf( _n( '%d lesson', '%d lessons', $n, 'shopinbos' ), $n );
}

function sib_academy_url(): string {
	return get_post_type_archive_link( 'sib_lesson' ) ?: home_url( '/academy/' );
}

function sib_tick_svg( int $size = 14 ): string {
	return '<svg width="' . $size . '" height="' . $size . '" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>';
}

/* ---------- Academy home ---------- */

function sib_render_academy_hero(): string {
	$tags = [ __( 'Product photos', 'shopinbos' ), __( 'Pricing', 'shopinbos' ), __( 'Pay on delivery', 'shopinbos' ), __( 'Dropshipping', 'shopinbos' ) ];
	$out  = '<section class="acad-hero"><img src="' . esc_url( sib_img( 'rex.webp' ) ) . '" alt="" class="hide-m" width="120" height="120" style="position:absolute;left:6%;top:150px;width:120px;height:auto;transform:rotate(-8deg)">'
		. '<img src="' . esc_url( sib_img( 'peggy-wave.webp' ) ) . '" alt="" class="hide-m" width="110" height="110" style="position:absolute;right:7%;top:120px;width:110px;height:auto;transform:rotate(6deg)">'
		. '<div class="sticker" style="left:9%;top:330px">' . sib_icon( 'clock', 16, '#B23E0A' ) . esc_html__( '4 min lessons', 'shopinbos' ) . '</div>'
		. '<div class="sticker" style="right:8%;top:300px">' . sib_icon( 'globe', 16, '#0C4A44' ) . esc_html__( 'English and Pidgin', 'shopinbos' ) . '</div>'
		. '<div class="wrap ahero-in" style="gap:20px;position:relative"><span class="pill-label" style="border-color:#16794A;color:#16794A">' . sib_icon( 'lock', 14, '#16794A' ) . esc_html__( 'Free · No sign-up needed', 'shopinbos' ) . '</span>'
		. '<h1 class="disp h1" style="max-width:900px;margin:0">' . esc_html__( 'Learn to sell online,', 'shopinbos' ) . ' <span class="grad">' . esc_html__( 'one short lesson', 'shopinbos' ) . '</span> ' . esc_html__( 'at a time', 'shopinbos' ) . '</h1>'
		. '<p class="lead" style="max-width:620px">' . esc_html__( 'Short lessons for people who sell online: in their own store, on WhatsApp, Instagram, TikTok and Facebook. Open any lesson now. No account, no password.', 'shopinbos' ) . '</p>'
		. '<form class="prompt" role="search" method="get" action="' . esc_url( home_url( '/' ) ) . '"><input type="search" name="s" aria-label="' . esc_attr__( 'What do you want to learn?', 'shopinbos' ) . '" placeholder="' . esc_attr__( 'What do you want to learn? e.g. how to price my products', 'shopinbos' ) . '">'
		. '<input type="hidden" name="post_type[]" value="sib_lesson"><input type="hidden" name="post_type[]" value="sib_help"><input type="hidden" name="post_type[]" value="post">'
		. '<div class="row between" style="gap:10px"><div class="row wrapflex" style="gap:8px">';
	foreach ( $tags as $i => $t ) {
		$out .= '<a class="tag' . ( $i > 1 ? ' hide-m' : '' ) . '" style="background:#F6F5F9" href="' . esc_url( add_query_arg( [ 's' => $t, 'post_type' => [ 'sib_lesson', 'sib_help', 'post' ] ], home_url( '/' ) ) ) . '">' . esc_html( $t ) . '</a>';
	}
	return $out . '</div><button class="send" type="submit" aria-label="' . esc_attr__( 'Search lessons', 'shopinbos' ) . '">' . sib_icon( 'search', 20, '#FFFFFF' ) . '</button></div></form></div></section>';
}

function sib_render_academy_stats(): string {
	$lessons = array_merge( ...array_map( fn( $t ) => $t['lessons'], sib_academy_tracks() ?: [ [ 'lessons' => [] ] ] ) );
	$n       = count( $lessons );
	$avg     = $n ? (int) round( array_sum( array_map( fn( $l ) => sib_lesson_data( $l )['minutes'], $lessons ) ) / $n ) : 4;
	$items   = [ [ (string) $n, __( 'short lessons', 'shopinbos' ) ], [ sprintf( __( '%d min', 'shopinbos' ), $avg ), __( 'average lesson', 'shopinbos' ) ], [ '2', __( 'languages, more coming', 'shopinbos' ) ], [ '₦0', __( 'free, forever', 'shopinbos' ) ] ];
	$out     = '<section style="padding:0 0 56px"><div class="wrap"><div class="g4 keep2 stats-strip">';
	foreach ( $items as $i => [ $v, $l ] ) {
		$out .= '<div class="col" style="gap:4px"><b class="disp bigstat" style="font-size:44px' . ( 3 === $i ? ';color:#FFB18F' : '' ) . '">' . esc_html( $v ) . '</b><span>' . esc_html( $l ) . '</span></div>';
	}
	return $out . '</div></div></section>';
}

/** Progress bar and label that academy.js fills from the phone's saved progress. */
function sib_track_progress( array $t, string $bar_bg, string $bar_fg ): string {
	$ids = implode( ',', wp_list_pluck( $t['lessons'], 'ID' ) );
	return '<div class="col" style="gap:6px" data-track-progress="' . esc_attr( $ids ) . '"><div class="row between" style="font-size:12.5px;font-weight:700"><span data-progress-text>' . esc_html__( 'Not started', 'shopinbos' ) . '</span><span data-progress-pct>0%</span></div>'
		. '<div class="bar" style="background:' . esc_attr( $bar_bg ) . '"><span data-progress-bar style="width:0;background:' . esc_attr( $bar_fg ) . '"></span></div></div>';
}

function sib_render_academy_tracks(): string {
	$tracks = sib_academy_tracks();
	if ( ! $tracks ) {
		return '';
	}
	$out = '<section style="padding:24px 0 72px"><div class="wrap col" style="gap:28px"><div class="col" style="gap:12px;align-items:center;text-align:center"><span class="pill-label">' . esc_html__( 'Pick where to start', 'shopinbos' ) . '</span>'
		. '<h2 class="disp h2" style="margin:0">' . esc_html( sprintf( __( '%s tracks, from first store to steady sales', 'shopinbos' ), ucfirst( sib_number_word( count( $tracks ) ) ) ) ) . '</h2></div><div class="g3">';
	foreach ( $tracks as $t ) {
		$out .= '<a class="trk" href="' . esc_url( get_term_link( $t['term'] ) ) . '"><div class="trk-top" style="background:' . esc_attr( $t['bg'] ) . ';color:' . esc_attr( $t['fg'] ) . '">'
			. '<div class="row between"><span class="trk-ic">' . sib_track_icon( $t['icon'], 22, $t['fg'] ) . '</span><span class="tag" style="background:#fff;color:' . esc_attr( $t['fg'] ) . '">' . esc_html( sib_lessons_label( count( $t['lessons'] ) ) . ' · ' . sprintf( __( '%d min', 'shopinbos' ), $t['mins'] ) ) . '</span></div>'
			. sib_track_progress( $t, 'rgba(255,255,255,0.7)', $t['fg'] ) . '</div>'
			. '<div class="col" style="padding:4px 10px 12px;gap:8px"><b class="disp" style="font-size:21px">' . esc_html( $t['term']->name ) . '</b><span class="p" style="font-size:14.5px">' . esc_html( $t['term']->description ) . '</span></div></a>';
	}
	return $out . '</div></div></section>';
}

function sib_number_word( int $n ): string {
	$w = [ 'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten' ];
	return $w[ $n ] ?? (string) $n;
}

/** Numbered lesson rows with a done mark. */
function sib_lesson_rows( array $lessons ): string {
	$out = '';
	foreach ( $lessons as $i => $l ) {
		$out .= '<a class="lrow" data-lid="' . (int) $l->ID . '" href="' . esc_url( get_permalink( $l ) ) . '"><span class="num" style="background:#F6F5F9;color:#16141F">' . ( $i + 1 ) . '</span><b style="flex:1;font-size:15.5px">' . esc_html( get_the_title( $l ) ) . '</b>'
			. '<span class="meta">' . esc_html( sprintf( __( '%d min', 'shopinbos' ), sib_lesson_data( $l )['minutes'] ) ) . '</span><span class="mark" aria-hidden="true">' . sib_tick_svg( 12 ) . '</span></a>';
	}
	return $out;
}

function sib_render_academy_preview(): string {
	$tracks = array_values( array_filter( sib_academy_tracks(), fn( $t ) => $t['lessons'] ) );
	if ( ! $tracks ) {
		return '';
	}
	$out = '<section style="background:#F6F5F9;padding:80px 0" data-preview><div class="wrap col" style="gap:28px"><div class="seg docs" role="tablist" aria-label="' . esc_attr__( 'Preview a track', 'shopinbos' ) . '">';
	foreach ( $tracks as $i => $t ) {
		$out .= '<button type="button" class="segb" role="tab" aria-selected="' . ( $i ? 'false' : 'true' ) . '" aria-controls="trk-p-' . (int) $t['term']->term_id . '" data-preview-tab>' . esc_html( $t['term']->name ) . '</button>';
	}
	$out .= '</div>';
	foreach ( $tracks as $i => $t ) {
		$first = $t['lessons'][0];
		$data  = sib_lesson_data( $first );
		$out  .= '<div class="split split-top" style="gap:40px" role="tabpanel" id="trk-p-' . (int) $t['term']->term_id . '"' . ( $i ? ' hidden' : '' ) . '><div class="col" style="gap:18px">'
			. '<span class="tag" style="background:' . esc_attr( $t['bg'] ) . ';color:' . esc_attr( $t['fg'] ) . ';align-self:flex-start">' . esc_html( sib_lessons_label( count( $t['lessons'] ) ) ) . '</span>'
			. '<h2 class="disp h2" style="margin:0">' . esc_html( $t['term']->name ) . '</h2><p class="lead">' . esc_html( $t['term']->description ) . '</p>'
			. '<div class="card" style="padding:8px;display:flex;flex-direction:column;gap:2px">' . sib_lesson_rows( $t['lessons'] ) . '</div></div>'
			. '<div class="col" style="gap:14px;position:sticky;top:96px"><a class="preview-vid" href="' . esc_url( get_permalink( $first ) ) . '" style="background:' . esc_attr( $t['bg'] ) . '"><img src="' . esc_url( sib_img( 'person-hero.webp' ) ) . '" alt="" loading="lazy"><span class="shade"></span>'
			. '<span class="chipw" style="left:16px;top:16px;color:' . esc_attr( $t['fg'] ) . '">' . esc_html( $t['term']->name ) . '</span><span class="play-btn">' . sib_icon( 'play', 28, '#FF6A2B' ) . '</span>'
			. '<span style="position:absolute;left:20px;right:20px;bottom:18px;color:#fff;display:flex;justify-content:space-between;align-items:flex-end;gap:12px"><b class="disp" style="font-size:22px;line-height:1.15">' . esc_html( get_the_title( $first ) ) . '</b><span class="tag" style="background:rgba(255,255,255,0.2);color:#fff;flex:none">' . esc_html( sprintf( __( '%d min', 'shopinbos' ), $data['minutes'] ) ) . '</span></span></a>'
			. '<div class="row wrapflex" style="gap:10px"><a class="btn btn-acc" style="flex:1" href="' . esc_url( get_permalink( $first ) ) . '">' . esc_html__( 'Start this track', 'shopinbos' ) . sib_icon( 'arrow', 16 ) . '</a>'
			. '<a class="btn btn-ghost" href="' . esc_url( sib_whatsapp_url( 'LEARN ' . $t['term']->name ) ) . '">' . sib_icon( 'whatsapp', 18 ) . esc_html__( 'Get it on WhatsApp', 'shopinbos' ) . '</a></div></div></div>';
	}
	return $out . '</div></section>';
}

function sib_render_academy_ways(): string {
	$box = '<span class="box" style="width:18px;height:18px;border-radius:6px;background:#16794A;border-color:#16794A">' . sib_tick_svg( 11 ) . '</span>';
	return '<section style="padding:88px 0"><div class="wrap"><div class="ways"><div class="col" style="text-align:center;gap:12px;color:#fff"><h2 class="disp h2" style="margin:0">' . esc_html__( 'Learn the way that suits you', 'shopinbos' ) . '</h2>'
		. '<p class="lead" style="color:#B8E9DF">' . esc_html__( 'Every lesson comes three ways. Use whichever fits your day.', 'shopinbos' ) . '</p></div><div class="g3" style="width:100%">'
		. '<div class="way"><b style="font-size:18px">' . esc_html__( 'Watch', 'shopinbos' ) . '</b><span class="p" style="font-size:14.5px">' . esc_html__( 'A 3 to 6 minute video with subtitles, where the lesson has one. Light enough for data saving mode.', 'shopinbos' ) . '</span>'
		. '<div style="margin-top:auto;height:96px;border-radius:16px;background:#FFEDE4;display:flex;align-items:center;justify-content:center;gap:12px"><span style="width:48px;height:48px;border-radius:999px;background:#FF6A2B;display:flex;align-items:center;justify-content:center">' . sib_icon( 'play', 20, '#FFFFFF' ) . '</span><span class="col" style="gap:6px;width:110px"><span class="bar"><span style="width:60%;background:#FF6A2B"></span></span><span style="font-size:12px;color:#6B6779">2:24 / 4:00</span></span></div></div>'
		. '<div class="way"><b style="font-size:18px">' . esc_html__( 'Read', 'shopinbos' ) . '</b><span class="p" style="font-size:14.5px">' . esc_html__( 'The same lesson as a short guide with a checklist you can tick as you go.', 'shopinbos' ) . '</span>'
		. '<div class="col" style="margin-top:auto;border-radius:16px;background:#F6F5F9;padding:14px;gap:8px"><span class="row" style="gap:8px;font-size:13px">' . $box . esc_html__( 'Price on the picture', 'shopinbos' ) . '</span><span class="row" style="gap:8px;font-size:13px;color:#6B6779"><span class="box" style="width:18px;height:18px;border-radius:6px;border:2px solid #D9D6E0"></span>' . esc_html__( 'How to order', 'shopinbos' ) . '</span></div></div>'
		. '<div class="way"><b style="font-size:18px">' . esc_html__( 'On WhatsApp', 'shopinbos' ) . '</b><span class="p" style="font-size:14.5px">' . esc_html__( 'Send LEARN to our line and Peggy sends one lesson a day. Reply STOP any time.', 'shopinbos' ) . '</span>'
		. '<a class="col" href="' . esc_url( sib_whatsapp_url( 'LEARN' ) ) . '" style="margin-top:auto;border-radius:16px;background:#ECE5DD;padding:12px;gap:6px;text-decoration:none;color:#16141F"><span class="bubble" style="background:#DCF8C6;align-self:flex-end;font-size:13px;padding:8px 12px">LEARN</span><span class="bubble" style="background:#fff;font-size:13px;padding:8px 12px">' . esc_html__( 'Day 1: Put the price on the picture', 'shopinbos' ) . '</span></a></div>'
		. '</div></div></div></section>';
}

/** Free downloads: real files in the theme, or links to the free online tools. */
function sib_academy_downloads(): array {
	return [
		[ __( 'Price calculator', 'shopinbos' ), __( 'Type your cost, delivery and fees. It tells you the price that leaves profit.', 'shopinbos' ), __( 'Tool', 'shopinbos' ), __( 'Works in your browser', 'shopinbos' ), 'chart', '#E2F5EA', '#16794A', home_url( '/tools/selling-price-calculator/' ), false ],
		[ __( 'Product photo checklist', 'shopinbos' ), __( 'Light, background, angles and what to avoid, in ten short tips.', 'shopinbos' ), __( 'Guide', 'shopinbos' ), __( '3 min read', 'shopinbos' ), 'cam', '#FFEDE4', '#B23E0A', home_url( '/blog/product-photo-tips-phone-and-window/' ), false ],
		[ __( '30 WhatsApp replies', 'shopinbos' ), __( 'Copy and paste answers for price, delivery, “is it original?” and more. English and Pidgin.', 'shopinbos' ), __( 'Template', 'shopinbos' ), __( 'Text file · 6 KB', 'shopinbos' ), 'chat', '#E2F6F1', '#0C4A44', sib_download_file( '30-whatsapp-replies.txt' ), true ],
		[ __( 'Delivery agreement', 'shopinbos' ), __( 'A simple agreement to use with a dispatch rider or delivery company.', 'shopinbos' ), __( 'Template', 'shopinbos' ), __( 'Text file · 3 KB', 'shopinbos' ), 'truck', '#FDF0D5', '#8A5A08', sib_download_file( 'delivery-agreement.txt' ), true ],
	];
}

function sib_download_file( string $file ): string {
	return wp_make_link_relative( get_theme_file_uri( 'assets/downloads/' . $file ) );
}

function sib_render_academy_downloads(): string {
	$out = '<section style="padding:0 0 88px"><div class="wrap col" style="gap:24px"><div class="row between wrapflex" style="align-items:flex-end;gap:12px"><div class="col" style="gap:12px"><span class="pill-label left">' . esc_html__( 'Free downloads', 'shopinbos' ) . '</span><h2 class="disp h2" style="margin:0">' . esc_html__( 'Tools you can use today', 'shopinbos' ) . '</h2></div>'
		. '<span class="p">' . esc_html__( 'No email needed. Just tap.', 'shopinbos' ) . '</span></div><div class="g4">';
	foreach ( sib_academy_downloads() as [ $t, $d, $kind, $size, $ic, $bg, $fg, $url, $file ] ) {
		$out .= '<div class="card" style="padding:20px;display:flex;flex-direction:column;gap:12px"><div class="row between"><span style="width:48px;height:48px;border-radius:14px;background:' . esc_attr( $bg ) . ';display:flex;align-items:center;justify-content:center">' . sib_icon( $ic, 22, $fg ) . '</span><span class="tag">' . esc_html( $kind ) . '</span></div>'
			. '<b style="font-size:17px">' . esc_html( $t ) . '</b><span class="p" style="font-size:14px;flex:1">' . esc_html( $d ) . '</span><span class="meta">' . esc_html( $size ) . '</span>'
			. '<a class="btn btn-ghost btn-s" href="' . esc_url( $url ) . '"' . ( $file ? ' download' : '' ) . '>' . sib_icon( $file ? 'download' : 'arrow', 16 ) . esc_html( $file ? __( 'Download', 'shopinbos' ) : __( 'Open', 'shopinbos' ) ) . '</a></div>';
	}
	return $out . '</div></div></section>';
}

function sib_render_academy_help( array $a ): string {
	$help = get_post_type_archive_link( 'sib_help' ) ?: home_url( '/help/' );
	$out  = '<section style="background:#F6F5F9;padding:80px 0"><div class="wrap split split-top"><div class="col" style="gap:14px"><span class="pill-label left">' . esc_html__( 'Academy questions', 'shopinbos' ) . '</span><h2 class="disp h2" style="margin:0">' . esc_html__( 'Quick answers', 'shopinbos' ) . '</h2>'
		. '<p class="lead">' . esc_html__( 'Need help with your shop instead?', 'shopinbos' ) . ' <a class="lnk" style="font-size:18px;display:inline" href="' . esc_url( $help ) . '">' . esc_html__( 'Visit the Help centre', 'shopinbos' ) . '</a></p>'
		. '<a class="card row" href="' . esc_url( sib_whatsapp_url( 'Hello, I have a question about the Academy' ) ) . '" style="padding:22px;gap:16px;margin-top:8px;text-decoration:none;color:inherit"><span class="av" style="background:#25D366;width:52px;height:52px">' . sib_icon( 'whatsapp', 24, '#FFFFFF' ) . '</span>'
		. '<span class="col" style="gap:2px"><b>' . esc_html__( 'Chat with a real person', 'shopinbos' ) . '</b><span class="p" style="font-size:14px">' . esc_html__( '8am to 8pm every day, English or Pidgin', 'shopinbos' ) . '</span></span></a></div><div class="col faq" style="gap:10px">';
	foreach ( sib_faq_items( $a['items'] ) as [ $q, $ans ] ) {
		$out .= '<details><summary>' . esc_html( $q ) . '</summary><p>' . sib_inline( $ans ) . '</p></details>';
	}
	return $out . '</div></div></section>';
}

/* ---------- Track page ---------- */

function sib_render_track_head(): string {
	$term = get_queried_object();
	if ( ! $term instanceof WP_Term || ! ( $t = sib_academy_track( $term ) ) ) {
		return '';
	}
	$first = $t['lessons'][0] ?? null;
	$out   = '<section style="background:' . esc_attr( $t['bg'] ) . ';padding:28px 0 56px"><div class="wrap col" style="gap:20px">'
		. '<nav class="crumbs" aria-label="' . esc_attr__( 'Breadcrumb', 'shopinbos' ) . '"><a href="' . esc_url( sib_academy_url() ) . '">' . esc_html__( 'Academy', 'shopinbos' ) . '</a><span aria-hidden="true">/</span><span aria-current="page">' . esc_html( $term->name ) . '</span></nav>'
		. '<div class="split" style="gap:40px"><div class="col" style="gap:16px;color:' . esc_attr( $t['fg'] ) . '"><span class="trk-ic" style="width:56px;height:56px;border-radius:18px">' . sib_track_icon( $t['icon'], 26, $t['fg'] ) . '</span>'
		. '<h1 class="disp h1" style="margin:0;color:#16141F">' . esc_html( $term->name ) . '</h1><p class="lead" style="color:#2B2836">' . esc_html( $term->description ) . '</p>'
		. '<span class="row wrapflex" style="gap:8px"><span class="tag" style="background:#fff;color:' . esc_attr( $t['fg'] ) . '">' . esc_html( sib_lessons_label( count( $t['lessons'] ) ) ) . '</span><span class="tag" style="background:#fff">' . sib_icon( 'clock', 13 ) . esc_html( sprintf( __( '%d min in total', 'shopinbos' ), $t['mins'] ) ) . '</span><span class="tag" style="background:#fff">' . esc_html__( 'English and Pidgin', 'shopinbos' ) . '</span></span>'
		. ( $first ? '<a class="btn btn-ink" style="align-self:flex-start" href="' . esc_url( get_permalink( $first ) ) . '" data-continue="' . esc_attr( implode( ',', wp_list_pluck( $t['lessons'], 'ID' ) ) ) . '" data-continue-urls="' . esc_attr( implode( ' ', array_map( 'get_permalink', $t['lessons'] ) ) ) . '">' . esc_html__( 'Start this track', 'shopinbos' ) . sib_icon( 'arrow', 16 ) . '</a>' : '' )
		. '</div><div class="card" style="padding:22px;display:flex;flex-direction:column;gap:14px"><b>' . esc_html__( 'Your progress', 'shopinbos' ) . '</b>' . sib_track_progress( $t, '#ECEAF2', '#16794A' )
		. '<span class="meta">' . sib_icon( 'phone', 14 ) . esc_html__( 'No account needed. Your progress is saved on this phone.', 'shopinbos' ) . '</span></div></div></div></section>'
		. '<section style="padding:48px 0 72px"><div class="wrap" style="max-width:860px"><div class="card" style="padding:8px;display:flex;flex-direction:column;gap:2px">' . sib_lesson_rows( $t['lessons'] ) . '</div>';
	$others = array_filter( sib_academy_tracks(), fn( $o ) => $o['term']->term_id !== $term->term_id && $o['lessons'] );
	if ( $others ) {
		$out .= '<div class="col" style="gap:12px;margin-top:40px"><b>' . esc_html__( 'Other tracks', 'shopinbos' ) . '</b><div class="row wrapflex" style="gap:8px">';
		foreach ( $others as $o ) {
			$out .= '<a class="chip" href="' . esc_url( get_term_link( $o['term'] ) ) . '">' . esc_html( $o['term']->name ) . '</a>';
		}
		$out .= '</div></div>';
	}
	return $out . '</div></section>';
}

/* ---------- Lesson ---------- */

function sib_render_lesson_side(): string {
	$post = get_post();
	$term = $post ? sib_lesson_track( $post ) : null;
	$t    = $term ? sib_academy_track( $term ) : null;
	if ( ! $t ) {
		return '<aside></aside>';
	}
	$out = '<aside class="les-side"><div class="col" style="gap:8px;padding:4px 6px"><span class="tag" style="background:' . esc_attr( $t['bg'] ) . ';color:' . esc_attr( $t['fg'] ) . ';align-self:flex-start">' . esc_html__( 'Track', 'shopinbos' ) . '</span>'
		. '<a class="disp" style="font-size:20px;font-weight:800;color:#16141F;text-decoration:none" href="' . esc_url( get_term_link( $term ) ) . '">' . esc_html( $term->name ) . '</a>' . sib_track_progress( $t, '#E6E3EE', '#16794A' ) . '</div><nav class="col" style="gap:2px" aria-label="' . esc_attr__( 'Lessons in this track', 'shopinbos' ) . '">';
	foreach ( $t['lessons'] as $i => $l ) {
		$out .= '<a class="les-item" data-lid="' . (int) $l->ID . '" href="' . esc_url( get_permalink( $l ) ) . '"' . ( $l->ID === $post->ID ? ' aria-current="page"' : '' ) . '><span class="num">' . ( $i + 1 ) . '</span>' . esc_html( get_the_title( $l ) ) . '</a>';
	}
	return $out . '</nav><div class="row" style="gap:10px;background:#fff;border-radius:16px;padding:12px;font-size:13px;color:#6B6779;align-items:flex-start">' . sib_icon( 'phone', 16, '#6B6779' ) . '<span>' . esc_html__( 'No account needed. Your progress is saved on this phone.', 'shopinbos' ) . '</span></div></aside>';
}

/** A YouTube ID from an ID or a link. */
function sib_youtube_id( string $v ): string {
	$v = trim( $v );
	if ( preg_match( '#(?:youtu\.be/|v=|embed/|shorts/)([A-Za-z0-9_-]{11})#', $v, $m ) ) {
		return $m[1];
	}
	return preg_match( '/^[A-Za-z0-9_-]{11}$/', $v ) ? $v : '';
}

function sib_render_lesson( array $a ): string {
	$post = get_post();
	if ( ! $post || 'sib_lesson' !== $post->post_type ) {
		return '<p class="p">' . esc_html__( 'This block shows a lesson on Academy lesson pages.', 'shopinbos' ) . '</p>';
	}
	$a     = array_merge( sib_lesson_data( $post ), $a );
	$term  = sib_lesson_track( $post );
	$t     = $term ? sib_academy_track( $term ) : null;
	$list  = $t ? $t['lessons'] : [ $post ];
	$pos   = array_search( $post->ID, wp_list_pluck( $list, 'ID' ), true );
	$pos   = false === $pos ? 0 : $pos;
	$prev  = $list[ $pos - 1 ] ?? null;
	$next  = $list[ $pos + 1 ] ?? null;
	$bg    = $t['bg'] ?? '#F6F5F9';
	$fg    = $t['fg'] ?? '#16141F';
	$of    = sprintf( __( 'Lesson %1$d of %2$d', 'shopinbos' ), $pos + 1, count( $list ) );
	$pcm   = trim( $a['introPcm'] ) !== '';
	$video = sib_youtube_id( (string) $a['video'] );

	$out = '<div class="col" style="gap:28px" data-lesson="' . (int) $post->ID . '" data-next="' . esc_url( $next ? get_permalink( $next ) : ( $term ? get_term_link( $term ) : sib_academy_url() ) ) . '">'
		. '<div class="col" style="gap:14px"><div class="row between wrapflex" style="gap:12px"><span class="row" style="gap:8px"><span class="tag" style="background:' . esc_attr( $bg ) . ';color:' . esc_attr( $fg ) . '">' . esc_html( $of ) . '</span><span class="tag">' . sib_icon( 'clock', 13 ) . esc_html( sprintf( __( '%d min', 'shopinbos' ), $a['minutes'] ) ) . '</span></span>'
		. ( $pcm ? '<div class="seg" role="group" aria-label="' . esc_attr__( 'Language', 'shopinbos' ) . '"><button type="button" class="segb" data-lang-pick="en" aria-pressed="true">English</button><button type="button" class="segb" data-lang-pick="pcm" aria-pressed="false">Pidgin</button></div>' : '' ) . '</div>'
		. '<h1 class="disp les-h1">' . esc_html( get_the_title( $post ) ) . '</h1>'
		. '<p class="lead" data-lang="en" lang="en">' . esc_html( $a['introEn'] ) . '</p>' . ( $pcm ? '<p class="lead" data-lang="pcm" lang="pcm" hidden>' . esc_html( $a['introPcm'] ) . '</p>' : '' ) . '</div>';

	// Video (lite embed) or a poster card when there is no video yet.
	$title = $a['videoTitle'] ?: get_the_title( $post );
	$out  .= '<div class="les-video" style="background:linear-gradient(135deg,' . esc_attr( $bg ) . ',#FFFFFF)"><img src="' . esc_url( sib_img( 'person-hero.webp' ) ) . '" alt="" loading="lazy">'
		. '<div class="col" style="position:absolute;left:28px;top:28px;gap:10px;max-width:46%"><span class="tag" style="background:#fff;align-self:flex-start">' . esc_html( $video ? __( 'Video lesson', 'shopinbos' ) : __( 'Read in a few minutes', 'shopinbos' ) ) . '</span><b class="disp hide-m" style="font-size:30px;line-height:1.1">' . esc_html( $title ) . '</b></div>';
	if ( $video ) {
		$out .= '<button type="button" class="vid-play" data-video="' . esc_attr( $video ) . '"><span>' . sib_icon( 'play', 18, '#FFFFFF' ) . '</span>' . esc_html( sprintf( __( 'Watch · %d min', 'shopinbos' ), $a['minutes'] ) ) . '</button><span class="chipw" style="right:18px;top:18px">CC · English, Pidgin</span>';
	} else {
		$out .= '<a class="vid-play" href="#learn"><span>' . sib_icon( 'book', 18, '#FFFFFF' ) . '</span>' . esc_html__( 'Start reading', 'shopinbos' ) . '</a>';
	}
	$out .= '</div>';

	if ( $learn = sib_lines( $a['learn'] ) ) {
		$out .= '<div class="card" id="learn" style="padding:24px;display:flex;flex-direction:column;gap:14px;scroll-margin-top:96px"><b style="font-size:17px">' . esc_html__( 'In this lesson you’ll learn', 'shopinbos' ) . '</b><ul class="g2 ticks" style="gap:12px;font-size:15.5px">';
		foreach ( $learn as $l ) {
			$out .= '<li>' . sib_inline( $l ) . '</li>';
		}
		$out .= '</ul></div>';
	}
	if ( $steps = sib_lines( $a['steps'] ) ) {
		$out .= '<div class="col" style="gap:16px"><h2 class="disp" style="font-size:30px;margin:0">' . esc_html( sprintf( __( 'Do it in %s steps', 'shopinbos' ), count( $steps ) ) ) . '</h2>' . sib_render_steps( [ 'title' => '', 'items' => $a['steps'] ] ) . '</div>';
	}
	if ( $a['tryEn'] ) {
		$out .= '<aside class="blk try-box"><span class="av" style="background:#FF6A2B;width:46px;height:46px">' . sib_icon( 'spark', 22, '#FFFFFF' ) . '</span><div class="col" style="gap:6px"><b style="font-size:17px">' . esc_html__( 'Try it now', 'shopinbos' ) . '</b>'
			. '<span data-lang="en" lang="en" style="font-size:16px;line-height:1.55;color:#5A2A12">' . sib_inline( $a['tryEn'] ) . '</span>'
			. ( $a['tryPcm'] ? '<span data-lang="pcm" lang="pcm" hidden style="font-size:16px;line-height:1.55;color:#5A2A12">' . sib_inline( $a['tryPcm'] ) . '</span>' : '' ) . '</div></aside>';
	}
	if ( $checks = sib_lines( $a['checks'] ) ) {
		$out .= '<aside class="blk blk-check" data-lesson-checks><div class="row between" style="margin-bottom:6px;gap:10px"><b style="font-size:17px">' . esc_html__( 'Before you finish, tick these', 'shopinbos' ) . '</b><span class="tag tag-ok">' . esc_html__( 'Tap to tick', 'shopinbos' ) . '</span></div>';
		foreach ( $checks as $i => $c ) {
			$out .= '<button type="button" class="chkrow" aria-pressed="false" data-i="' . (int) $i . '"><span class="box">' . sib_tick_svg() . '</span><span class="chk-t">' . sib_inline( $c ) . '</span></button>';
		}
		$out .= '</aside>';
	}
	$opts = sib_lines( $a['options'] );
	if ( $a['quiz'] && count( $opts ) > 1 ) {
		$out .= '<div class="card" style="padding:24px;display:flex;flex-direction:column;gap:14px" data-quiz data-correct="' . max( 0, (int) $a['correct'] - 1 ) . '"><span class="row" style="gap:8px"><span class="tag" style="background:#E7E1FF;color:#5B3FD6">' . esc_html__( 'Quick check', 'shopinbos' ) . '</span><span class="meta">' . esc_html__( '1 question', 'shopinbos' ) . '</span></span>'
			. '<b style="font-size:19px;line-height:1.35">' . esc_html( $a['quiz'] ) . '</b>';
		foreach ( $opts as $i => $o ) {
			$out .= '<button type="button" class="quiz-opt" data-opt="' . (int) $i . '"><span class="num">' . chr( 65 + $i ) . '</span>' . esc_html( $o ) . '</button>';
		}
		$out .= '<div class="quiz-verdict" hidden data-right="' . esc_attr__( 'That’s right.', 'shopinbos' ) . '" data-wrong="' . esc_attr__( 'Not quite.', 'shopinbos' ) . '"><b></b> <span style="color:#16141F">' . esc_html( $a['why'] ) . '</span></div></div>';
	}
	$out .= '<div class="row between wrapflex" style="gap:12px;padding-top:22px;border-top:1px solid #ECEAF2">'
		. ( $prev ? '<a class="btn btn-ghost" href="' . esc_url( get_permalink( $prev ) ) . '">' . sib_icon( 'back', 16 ) . esc_html__( 'Previous', 'shopinbos' ) . '</a>' : '<span></span>' )
		. '<button type="button" class="btn btn-acc" data-lesson-done data-saved="' . esc_attr__( 'Done · saved on this phone', 'shopinbos' ) . '">' . sib_icon( 'tick', 16 ) . esc_html( $next ? __( 'Mark as done and go to next', 'shopinbos' ) : __( 'Mark as done', 'shopinbos' ) ) . '</button></div>'
		. '<div class="row wrapflex" style="gap:12px"><a class="lnk" href="' . esc_url( sib_whatsapp_share_url( get_the_title( $post ) . ' – ' . get_permalink( $post ) ) ) . '">' . sib_icon( 'whatsapp', 16 ) . esc_html__( 'Send it to my WhatsApp', 'shopinbos' ) . '</a><span class="dot"></span>'
		. '<button type="button" class="lnk" onclick="window.print()">' . sib_icon( 'download', 16 ) . esc_html__( 'Save this lesson as a PDF', 'shopinbos' ) . '</button></div></div>';
	return $out;
}
