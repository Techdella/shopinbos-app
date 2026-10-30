<?php
/**
 * V9 Academy additions, on top of the course and lesson templates in v9-content.php:
 *   - lessons: a "Do this in Shopinbos Business" box (lesson block attributes bizEn, bizPcm, bizCta)
 *   - courses: "who it's for / what you'll learn" and a course-level Shopinbos Business band (track meta
 *     sib_for, sib_learn, sib_biz, sib_biz_cta, written by `wp shopinbos setup` from seed/academy.json)
 *   - the Academy home: copy that says what the Academy is (business lessons, not app how-to)
 *   - old lesson addresses (renamed or moved to another course) redirect to the lesson
 *   - Course, LearningResource and ItemList structured data
 */

defined( 'ABSPATH' ) || exit;

/* Our templates replace the course and lesson ones, and wrap them. */
add_filter( 'sib_v9_content_templates', function ( array $t ): array {
	if ( isset( $t['sib_v9_is_course'] ) ) {
		$t['sib_v9_is_course'] = 'sib_v9_academy_course';
	}
	if ( isset( $t['sib_v9_is_lesson'] ) ) {
		$t['sib_v9_is_lesson'] = 'sib_v9_academy_lesson';
	}
	$t['sib_v9_academy_moved'] = 'sib_v9_academy_redirect';
	return $t;
}, 20 );

/** A link from a seed CTA: a token (%%SIGNUP%%), a path or a full URL. */
function sib_v9_academy_href( string $url ): string {
	$url = trim( $url );
	return str_contains( $url, '%%' ) ? sib_v9_tokens( $url ) : $url;
}

/** [ label, url ] from "Label | url". */
function sib_v9_academy_cta( string $s ): array {
	$p = array_map( 'trim', explode( '|', $s, 2 ) );
	return 2 === count( $p ) && '' !== $p[0] && '' !== $p[1] ? [ $p[0], sib_v9_academy_href( $p[1] ) ] : [ __( 'Start free with Shopinbos Business', 'shopinbos' ), sib_v9_tokens( '%%SIGNUP%%' ) ];
}

/** The "Do this in Shopinbos Business" box for a lesson, or ''. */
function sib_v9_academy_biz_box( array $a ): string {
	$en = trim( (string) ( $a['bizEn'] ?? '' ) );
	if ( '' === $en ) {
		return '';
	}
	$pcm          = trim( (string) ( $a['bizPcm'] ?? '' ) );
	[ $label, $url ] = sib_v9_academy_cta( (string) ( $a['bizCta'] ?? '' ) );
	return '<aside class="blk blk-cta sib-biz" aria-label="' . esc_attr__( 'Do this in Shopinbos Business', 'shopinbos' ) . '"><p class="eyebrow" style="color:#7EE0C8">' . esc_html__( 'Do this in Shopinbos Business', 'shopinbos' ) . '</p>'
		. '<p class="cta-text" data-lang="en" lang="en" style="max-width:none">' . esc_html( $en ) . '</p>'
		. ( '' !== $pcm ? '<p class="cta-text" data-lang="pcm" lang="pcm" hidden style="max-width:none">' . esc_html( $pcm ) . '</p>' : '' )
		. '<a class="btn" href="' . esc_url( $url ) . '">' . esc_html( $label ) . ' →</a></aside>';
}

/* A lesson: the shared template, the business box after the task, and a sharper title. */
function sib_v9_academy_lesson(): ?array {
	// A lesson reached under another course (it moved) goes to its own address.
	$own = get_permalink( get_queried_object() );
	if ( $own && trailingslashit( (string) wp_parse_url( $own, PHP_URL_PATH ) ) !== sib_v9_path() && ! is_preview() ) {
		wp_safe_redirect( $own, 301 );
		exit;
	}
	$out =function_exists( 'sib_v9_lesson' ) ? sib_v9_lesson() : null;
	if ( ! $out ) {
		return null;
	}
	$post = get_queried_object();
	$a    = sib_lesson_data( $post );
	$html = $out['html'];
	// The task is a business action, not always something done in the app, so the box carries the app link.
	$html = (string) preg_replace( '#<div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap"><a class="btn b-ink" href="[^"]*"[^>]*>' . preg_quote( esc_html__( 'Open my shop', 'shopinbos' ), '#' ) . '</a></div>#', '', $html, 1 );
	if ( $box = sib_v9_academy_biz_box( $a ) ) {
		foreach ( [ '<div class="blk blk-check">', '<div class="blk v9-quiz"', '</div><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:40px' ] as $at ) {
			if ( false !== ( $i = strpos( $html, $at ) ) ) {
				$html = substr_replace( $html, $box, $i, 0 );
				break;
			}
		}
	}
	$term          = sib_lesson_track( $post );
	$title         = get_the_title( $post );
	$out['html']   = $html;
	$out['title']  = mb_strlen( $title ) <= 38 ? $title . ' · Free lesson · Shopinbos Academy' : $title . ' · Shopinbos Academy';
	$out['description'] = wp_html_excerpt( (string) $a['introEn'], 155, '…' );
	if ( $term ) {
		$out['crumbs'][] = [ $term->name, get_term_link( $term ) ];
	}
	return $out;
}

/** Track extras written by setup. */
function sib_v9_academy_track_meta( WP_Term $term ): array {
	$m = fn( $k ) => (string) get_term_meta( $term->term_id, $k, true );
	return [ 'for' => $m( 'sib_for' ), 'learn' => sib_v9_lines( $m( 'sib_learn' ) ), 'biz' => $m( 'sib_biz' ), 'cta' => $m( 'sib_biz_cta' ) ];
}

/** Course cards: the short "who it's for" line instead of the cut-off SEO description. */
function sib_v9_academy_short_cards( string $html ): string {
	if ( ! function_exists( 'sib_academy_tracks' ) ) {
		return $html;
	}
	$map = [];
	foreach ( sib_academy_tracks() as $t ) {
		$for = sib_v9_academy_track_meta( $t['term'] )['for'];
		if ( $for && $t['term']->description ) {
			$map[ '<p class="p mutd" style="font-size:15px">' . esc_html( wp_html_excerpt( $t['term']->description, 120, '…' ) ) . '</p>' ] = '<p class="p mutd" style="font-size:15px">' . esc_html( $for ) . '</p>';
		}
	}
	return strtr( $html, $map );
}

/* A course: the shared template plus who it is for, what you learn and a Shopinbos Business band. */
function sib_v9_academy_course(): ?array {
	$out = function_exists( 'sib_v9_course' ) ? sib_v9_course() : null;
	if ( ! $out ) {
		return null;
	}
	$term = get_queried_object();
	$m    = sib_v9_academy_track_meta( $term );
	$html = $out['html'];

	if ( $m['for'] || $m['learn'] ) {
		$who = '<section class="sec" style="background:#fff;padding-bottom:0"><div class="wrap g2" style="max-width:880px;display:grid;grid-template-columns:1fr 1.4fr;gap:40px;align-items:start">'
			. ( $m['for'] ? '<div><span class="k orgd">' . esc_html__( 'Who it’s for', 'shopinbos' ) . '</span><p class="lead" style="margin-top:12px;color:#16141F">' . esc_html( $m['for'] ) . '</p></div>' : '<div></div>' )
			. ( $m['learn'] ? '<div class="v9-prose"><div class="blk blk-take" style="border-radius:22px"><b>' . esc_html__( 'What you’ll learn', 'shopinbos' ) . '</b><ul class="ticks">' . implode( '', array_map( fn( $l ) => '<li>' . esc_html( $l ) . '</li>', $m['learn'] ) ) . '</ul></div></div>' : '' )
			. '</div></section>';
		$hero_end = strpos( $html, '</section>' ); // the course header
		if ( false !== $hero_end ) {
			$html = substr_replace( $html, $who, $hero_end + strlen( '</section>' ), 0 );
		}
	}

	[ $label, $url ] = sib_v9_academy_cta( $m['cta'] );
	$band = '<section class="sec" style="background:#fff;padding-top:0"><div class="wrap" style="max-width:880px"><div class="bc c-night sib-biz-band" style="padding:clamp(24px,4vw,36px);gap:14px;min-height:0">'
		. '<span class="k" style="color:#7EE0C8">' . esc_html__( 'Do this in Shopinbos Business', 'shopinbos' ) . '</span>'
		. '<p class="lead" style="color:#E7E4EE;margin:0">' . esc_html( $m['biz'] ?: __( 'Shopinbos Business is the app that runs your shop from your phone: your store, orders, payments, delivery and customers in one place.', 'shopinbos' ) ) . '</p>'
		. '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px"><a class="btn b-org" style="white-space:normal;height:auto;min-height:54px;padding:12px 24px;text-align:center" href="' . esc_url( $url ) . '">' . esc_html( $label ) . ' →</a><a class="btn" style="white-space:normal;height:auto;min-height:54px;padding:12px 24px;text-align:center;background:transparent;color:#fff;box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.35)" href="/help/">' . esc_html__( 'How-to guides in the Help centre', 'shopinbos' ) . '</a></div></div></div></section>';
	$lessons_h = strpos( $html, '<h2 class="H h2">' . esc_html__( 'Lessons', 'shopinbos' ) . '</h2>' );
	$after     = false !== $lessons_h ? strpos( $html, '</section>', $lessons_h ) : false;
	if ( false !== $after ) {
		$html = substr_replace( $html, $band, $after + strlen( '</section>' ), 0 );
	}

	$out['html']  = sib_v9_academy_short_cards( $html );
	$out['title'] = $term->name . ': free course · Shopinbos Academy';
	$about        = trim( (string) $term->description );
	if ( mb_strlen( $about ) > 158 ) {
		$first = preg_split( '/(?<=\.)\s+/', $about, 2 )[0];
		$about = wp_html_excerpt( $first . ' ' . sprintf( __( 'Free course in English and Pidgin: %d short lessons, each with a real task.', 'shopinbos' ), count( sib_academy_track( $term )['lessons'] ?? [] ) ), 158, '…' );
	}
	$out['description'] = $about;
	return $out;
}

/* The Academy home: say what the Academy teaches, and point app how-to at the Help centre. */
add_filter( 'sib_v9_fill', function ( string $html, string $slug ): string {
	if ( 'academy' !== $slug ) {
		return $html;
	}
	$html = strtr( sib_v9_academy_short_cards( $html ), [
		'Learn to sell. <span class="it" style="color:#FFB18F">Free, at your pace.</span>' => 'Learn to run a business. <span class="it" style="color:#FFB18F">Free, at your pace.</span>',
		'Short lessons in English and Pidgin, made for your phone. From your first sale to growing a real brand.' => 'Short business lessons in English and Pidgin, made for your phone: pricing, cash flow, sourcing, branding, marketing, delivery and keeping customers.',
		'Each course is a handful of short lessons with a task at the end. Do it in your own shop as you go.' => 'Each course is six to eight short lessons, and each lesson ends with a real task for your business. Start with the course you need most.',
		'One real shop.'                                          => 'One real business.',
		'Short videos that load on slow data, with written notes.' => 'Short written lessons that load on slow data.',
		'Each lesson ends with a task in your own shop.'          => 'Each lesson ends with a real task for your business.',
	] );
	// Between the course grid and "How the Academy works": where app how-to lives.
	$note = '<section class="sec" style="background:#fff;padding-bottom:0"><div class="wrap"><div class="bc c-mint" style="display:flex;flex-direction:row;flex-wrap:wrap;gap:16px 28px;align-items:center;justify-content:space-between;padding:28px 32px;min-height:0">'
		. '<div style="display:flex;flex-direction:column;gap:6px;max-width:640px"><b style="font-size:18px">' . esc_html__( 'Looking for how to use Shopinbos Business?', 'shopinbos' ) . '</b><span class="p" style="font-size:15.5px;color:#2E4A46">' . esc_html__( 'The Academy teaches the business. Step-by-step guides for the app are in the Help centre.', 'shopinbos' ) . '</span></div>'
		. '<a class="btn b-ink" href="/help/">' . esc_html__( 'Open the Help centre', 'shopinbos' ) . '</a></div></div></section>';
	$at   = strpos( $html, '<h2 class="H h2">How the Academy works</h2>' );
	$sec  = false !== $at ? strrpos( substr( $html, 0, $at ), '<section' ) : false;
	if ( false !== $sec ) {
		$html = substr_replace( $html, $note, $sec, 0 );
	}
	return $html;
}, 20, 2 );

/* Old lesson addresses (a lesson renamed, or moved to another course) go to the lesson. */
function sib_v9_academy_moved(): bool {
	return null !== sib_v9_academy_moved_to();
}

function sib_v9_academy_moved_to(): ?string {
	static $to = false;
	if ( false !== $to ) {
		return $to;
	}
	$to = null;
	if ( ! is_404() || ! preg_match( '#^/academy/(?:[^/]+/)?([^/]+)/$#', strtolower( sib_v9_path() ), $m ) ) {
		return $to;
	}
	global $wpdb;
	$slug = sanitize_title( rawurldecode( $m[1] ) );
	$raw  = $m[1];
	$id   = (int) $wpdb->get_var( $wpdb->prepare( "SELECT ID FROM {$wpdb->posts} WHERE post_type = 'sib_lesson' AND post_status = 'publish' AND post_name IN (%s, %s) LIMIT 1", $slug, $raw ) );
	if ( ! $id ) {
		$id = (int) $wpdb->get_var( $wpdb->prepare( "SELECT p.ID FROM {$wpdb->postmeta} m JOIN {$wpdb->posts} p ON p.ID = m.post_id WHERE m.meta_key = '_wp_old_slug' AND m.meta_value IN (%s, %s) AND p.post_type = 'sib_lesson' AND p.post_status = 'publish' ORDER BY p.ID DESC LIMIT 1", $slug, $raw ) );
	}
	if ( $id ) {
		$url = get_permalink( $id );
		if ( $url && trailingslashit( (string) wp_parse_url( $url, PHP_URL_PATH ) ) !== sib_v9_path() ) {
			$to = $url;
		}
	}
	return $to;
}

function sib_v9_academy_redirect(): ?array {
	if ( $to = sib_v9_academy_moved_to() ) {
		wp_safe_redirect( $to, 301 );
		exit;
	}
	return null;
}

/* Structured data: Course on course pages, LearningResource (part of the Course) on lessons, a course list on /academy/. */
function sib_v9_academy_course_node( array $t, bool $full ): array {
	$term = $t['term'];
	$url  = get_term_link( $term );
	$m    = sib_v9_academy_track_meta( $term );
	$home = home_url( '/' );
	$node = [
		'@type'               => 'Course',
		'@id'                 => $url . '#course',
		'name'                => $term->name,
		'description'         => wp_strip_all_tags( (string) $term->description ),
		'url'                 => $url,
		'provider'            => [ '@type' => 'Organization', 'name' => 'Shopinbos', 'sameAs' => $home ],
		'inLanguage'          => [ 'en', 'pcm' ],
		'isAccessibleForFree' => true,
		'educationalLevel'    => 'Beginner',
		'offers'              => [ '@type' => 'Offer', 'category' => 'Free', 'price' => 0, 'priceCurrency' => 'NGN' ],
		'hasCourseInstance'   => [ '@type' => 'CourseInstance', 'courseMode' => 'Online', 'courseWorkload' => 'PT' . max( 1, (int) $t['mins'] ) . 'M' ],
	];
	if ( $m['learn'] ) {
		$node['teaches'] = $m['learn'];
	}
	if ( $m['for'] ) {
		$node['audience'] = [ '@type' => 'Audience', 'audienceType' => $m['for'] ];
	}
	if ( $full ) {
		$node['hasPart'] = array_map( fn( $l ) => [ '@type' => 'LearningResource', 'name' => get_the_title( $l ), 'url' => get_permalink( $l ) ], $t['lessons'] );
	}
	return $node;
}

add_filter( 'sib_schema_graph', function ( array $graph ): array {
	$page = (string) ( $GLOBALS['sib_v9_page'] ?? '' );
	if ( ! in_array( $page, [ 'academy', 'academy-course', 'academy-lesson' ], true ) || ! function_exists( 'sib_academy_tracks' ) ) {
		return $graph;
	}
	foreach ( $graph as $n ) { // something else already describes it
		if ( array_intersect( (array) ( $n['@type'] ?? '' ), [ 'Course', 'LearningResource' ] ) ) {
			return $graph;
		}
	}
	if ( 'academy' === $page ) {
		$tracks  = array_values( array_filter( sib_academy_tracks(), fn( $t ) => $t['lessons'] ) );
		$graph[] = [
			'@type'           => 'ItemList',
			'name'            => 'Shopinbos Academy courses',
			'itemListElement' => array_map( fn( $t, $i ) => [ '@type' => 'ListItem', 'position' => $i + 1, 'item' => sib_v9_academy_course_node( $t, false ) ], $tracks, array_keys( $tracks ) ),
		];
	} elseif ( 'academy-course' === $page && is_tax( 'sib_track' ) && ( $t = sib_academy_track( get_queried_object() ) ) ) {
		$graph[] = sib_v9_academy_course_node( $t, true );
	} elseif ( 'academy-lesson' === $page && is_singular( 'sib_lesson' ) ) {
		$post  = get_queried_object();
		$a     = sib_lesson_data( $post );
		$term  = sib_lesson_track( $post );
		$t     = $term ? sib_academy_track( $term ) : null;
		$learn = sib_v9_lines( (string) $a['learn'] );
		$graph[] = array_filter( [
			'@type'                => 'LearningResource',
			'@id'                  => get_permalink( $post ) . '#lesson',
			'name'                 => get_the_title( $post ),
			'description'          => wp_strip_all_tags( (string) $a['introEn'] ),
			'url'                  => get_permalink( $post ),
			'learningResourceType' => 'Lesson',
			'educationalLevel'     => 'Beginner',
			'inLanguage'           => '' !== trim( (string) $a['introPcm'] ) ? [ 'en', 'pcm' ] : 'en',
			'timeRequired'         => 'PT' . (int) $a['minutes'] . 'M',
			'isAccessibleForFree'  => true,
			'teaches'              => $learn ?: null,
			'provider'             => [ '@type' => 'Organization', 'name' => 'Shopinbos', 'sameAs' => home_url( '/' ) ],
			'dateModified'         => get_post_modified_time( 'c', true, $post ),
			'isPartOf'             => $t ? [ '@id' => get_term_link( $term ) . '#course' ] : null,
		], fn( $v ) => null !== $v );
		if ( $t ) {
			$graph[] = sib_v9_academy_course_node( $t, false );
		}
	}
	return $graph;
} );
