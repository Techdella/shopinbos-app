<?php
/**
 * Seed content: the Academy curriculum (seed/academy.json). The Academy teaches business concepts (pricing,
 * margins, sourcing, branding, marketing, customer service, cash flow, delivery, social selling, growth), not
 * how to use the app: "how to click X" belongs in the Help centre.
 *
 * academy.json is a list of tracks: slug, name, about (SEO description: who it is for, what you learn), bg, fg,
 * icon, for, learn[], biz + biz_cta (the course-level "Do this in Shopinbos Business" band) and lessons[].
 * Each lesson: title (its slug comes from the title, so keep ₦ and symbols out), minutes, intro, intro_pcm,
 * learn[4], steps[ [h, d] ], try, try_pcm, checks[], quiz, options[3], correct (1-3), why, video (a short
 * tagline), optional biz { en, pcm, cta: [label, url or %%SIGNUP%%] } ("Do this in Shopinbos Business" box)
 * and optional was[] (old slugs this lesson replaces, so setup renames the stored post and old links still work).
 * Pidgin text should be read by a native speaker before launch.
 */

defined( 'ABSPATH' ) || exit;

/** The curriculum, as stored in academy.json. */
function sib_seed_academy_data(): array {
	static $data = null;
	if ( null === $data ) {
		$file = __DIR__ . '/academy.json';
		$data = file_exists( $file ) ? (array) json_decode( (string) file_get_contents( $file ), true ) : [];
	}
	return $data;
}

/** [ slug, name, about, bg, fg, icon ] per track, in order. */
function sib_seed_academy_tracks(): array {
	return array_map( fn( $t ) => [ $t['slug'], $t['name'], $t['about'], $t['bg'], $t['fg'], $t['icon'] ], sib_seed_academy_data() );
}

/** track slug => lesson tuples (see sib_seed_lesson_markup), in order. */
function sib_seed_academy_lessons(): array {
	$out = [];
	foreach ( sib_seed_academy_data() as $t ) {
		$out[ $t['slug'] ] = array_map( fn( $l ) => [ $l['title'], (int) $l['minutes'], $l['intro'], $l['intro_pcm'], $l['learn'], $l['steps'], $l['try'], $l['try_pcm'], $l['checks'], $l['quiz'], $l['options'], (int) $l['correct'], $l['why'], $l['video'], $l['biz'] ?? [] ], $t['lessons'] );
	}
	return $out;
}

/** Block markup for one lesson. */
function sib_seed_lesson_markup( array $l ): string {
	[ $title, $mins, $en, $pcm, $learn, $steps, $try_en, $try_pcm, $checks, $quiz, $opts, $correct, $why, $vtitle ] = $l;
	$biz = (array) ( $l[14] ?? [] );
	// Rotate the answers so the right one is not always in the same place.
	$shift   = crc32( $title ) % count( $opts );
	$opts    = array_merge( array_slice( $opts, $shift ), array_slice( $opts, 0, $shift ) );
	$correct = ( ( $correct - 1 - $shift + count( $opts ) ) % count( $opts ) ) + 1;
	$attrs   = [
		'minutes'    => $mins,
		'introEn'    => $en,
		'introPcm'   => $pcm,
		'learn'      => implode( "\n", $learn ),
		'steps'      => implode( "\n", array_map( fn( $s ) => $s[0] . ' | ' . $s[1], $steps ) ),
		'tryEn'      => $try_en,
		'tryPcm'     => $try_pcm,
		'checks'     => implode( "\n", $checks ),
		'quiz'       => $quiz,
		'options'    => implode( "\n", $opts ),
		'correct'    => $correct,
		'why'        => $why,
		'videoTitle' => $vtitle,
	];
	if ( ! empty( $biz['en'] ) ) {
		$attrs['bizEn']  = $biz['en'];
		$attrs['bizPcm'] = $biz['pcm'] ?? '';
		$attrs['bizCta'] = implode( ' | ', (array) ( $biz['cta'] ?? [] ) );
	}
	return sib_seed_b( 'lesson', $attrs );
}
