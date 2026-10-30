<?php
/**
 * Website V9: Gist stories, store templates, the store showcase and the investor page in the V9 look.
 *  - /gist/ (static design): the design's circles and "Today's gist" cards become the real Gist stories.
 *  - /blog/sib_gist/{slug}/: one story, played in a tap/swipe story player (v9.js), with every slide as text too.
 *    (Gist stories are not a public post type; these addresses are what WordPress gives them, so we serve them.)
 *  - /templates/ (static design): the design's example cards become the real store templates, with working filters,
 *    and the showcase stores; /templates/{slug}/ and /blog/sib_showcase/{slug}/ get their own V9 pages.
 *  - /investors/: the investor relations page (plugin: includes/investors.php) with a working enquiry form.
 */

defined( 'ABSPATH' ) || exit;

/** The request path with a trailing slash. */
function sib_v9_path(): string {
	return trailingslashit( (string) wp_parse_url( add_query_arg( [] ), PHP_URL_PATH ) );
}

function sib_v9_img( string $file ): string {
	return get_theme_file_uri( 'v9/img/' . $file );
}

/** Sign-up link with extra arguments (intent, template…). */
function sib_v9_signup( array $args = [] ): string {
	$url = html_entity_decode( sib_v9_tokens( '%%SIGNUP%%' ) );
	return $args ? $url . '&' . http_build_query( $args, '', '&', PHP_QUERY_RFC3986 ) : $url;
}

/* ====================================================================================================== */
/* Gist                                                                                                    */
/* ====================================================================================================== */

/** Story groups (plugin: sib_gist_groups) with their V9 page address. */
function sib_v9_gist_groups(): array {
	if ( ! function_exists( 'sib_gist_groups' ) ) {
		return [];
	}
	return array_map( function ( $g ) {
		$g['url']   = home_url( '/blog/sib_gist/' . $g['slug'] . '/' );
		$g['video'] = in_array( 'video', array_column( (array) $g['slides'], 'type' ), true );
		return $g;
	}, sib_gist_groups() );
}

/** The cover line of a story: its cover slide's headline, else its title. */
function sib_v9_gist_cover( array $g ): string {
	foreach ( (array) $g['slides'] as $s ) {
		if ( ! empty( $s['headline'] ) ) {
			return (string) $s['headline'];
		}
	}
	return (string) $g['title'];
}

/** One slide as plain text (for the "read it" list). */
function sib_v9_gist_line( array $s ): array {
	$head = trim( implode( ' ', array_filter( [ (string) ( $s['number'] ?? '' ), (string) ( $s['headline'] ?? '' ) ] ) ) );
	$rest = array_filter( [
		(string) ( $s['text'] ?? '' ),
		implode( ' · ', (array) ( $s['items'] ?? [] ) ),
		! empty( $s['do'] ) ? 'Do: ' . $s['do'] . '.' : '',
		! empty( $s['dont'] ) ? 'Don’t: ' . $s['dont'] . '.' : '',
	] );
	return [ $head, implode( ' ', $rest ) ];
}

/** One slide in the player (same look as the old full-screen viewer). */
function sib_v9_gist_slide( array $s, array $g, int $i, int $n ): string {
	$type  = (string) ( $s['type'] ?? 'tip' );
	$label = sprintf( 'Slide %1$d of %2$d', $i + 1, $n );
	$out   = '<div class="gs gs-is-' . esc_attr( $type ) . '" role="group" aria-roledescription="slide" aria-label="' . esc_attr( $label ) . '" data-i="' . $i . '">';
	$ga    = fn( $tag, $cls, $text, $d ) => '' === trim( (string) $text ) ? '' : '<' . $tag . ' class="' . $cls . ' ga" style="animation-delay:' . number_format( 0.12 + $d * 0.12, 2 ) . 's">' . esc_html( $text ) . '</' . $tag . '>';
	if ( 'video' === $type && ! empty( $s['video'] ) ) {
		$poster = (string) ( $s['poster'] ?? '' );
		$out   .= '<video class="gs-video" src="' . esc_url( $s['video'] ) . '"' . ( $poster ? ' poster="' . esc_url( $poster ) . '"' : '' ) . ' playsinline preload="metadata" controls' . ( ! empty( $s['headline'] ) ? ' aria-label="' . esc_attr( $s['headline'] ) . '"' : '' ) . '></video>'
			. '<button type="button" class="gs-mute" aria-label="Turn sound on" hidden><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path class="m-off" d="M23 9l-6 6M17 9l6 6"/><path class="m-on" d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg></button>';
		return $out . '</div>';
	}
	$out .= '<span class="gs-blob gs-b1" aria-hidden="true"></span><span class="gs-blob gs-b2" aria-hidden="true"></span>';
	switch ( $type ) {
		case 'cover':
			$out .= '<span class="gs-pic"><img src="' . esc_url( $g['img'] ) . '" alt="" decoding="async"></span>'
				. $ga( 'span', 'gs-eye', ( $s['eyebrow'] ?? '' ) ?: 'Gist', 0 ) . $ga( 'b', 'gs-h gs-h-xl', $s['headline'] ?? '', 1 )
				. '<span class="gs-hint" aria-hidden="true">' . esc_html__( 'Tap to start', 'shopinbos' ) . ' →</span>';
			break;
		case 'number':
			$out .= $ga( 'b', 'gs-num', $s['number'] ?? '', 0 ) . $ga( 'b', 'gs-h', $s['headline'] ?? '', 1 ) . $ga( 'p', 'gs-t', $s['text'] ?? '', 2 );
			break;
		case 'list':
			$out .= $ga( 'b', 'gs-h', $s['headline'] ?? '', 0 ) . '<ul class="gs-list">';
			foreach ( array_values( (array) ( $s['items'] ?? [] ) ) as $k => $it ) {
				$out .= '<li class="ga" style="animation-delay:' . number_format( 0.3 + $k * 0.15, 2 ) . 's">' . esc_html( $it ) . '</li>';
			}
			$out .= '</ul>';
			break;
		case 'myth':
			$out .= $ga( 'span', 'gs-tag gs-tag-no', 'Myth', 0 ) . $ga( 'b', 'gs-h gs-strike', preg_replace( '/^Myth:\s*/i', '', (string) ( $s['headline'] ?? '' ) ), 1 )
				. $ga( 'span', 'gs-tag gs-tag-yes', 'Truth', 3 ) . $ga( 'p', 'gs-t', preg_replace( '/^Truth:\s*/i', '', (string) ( $s['text'] ?? '' ) ), 4 );
			break;
		case 'do-dont':
			$out .= ( empty( $s['do'] ) ? '' : '<div class="gs-do ga" style="animation-delay:.15s"><span class="gs-tag gs-tag-yes">Do</span><b>' . esc_html( $s['do'] ) . '</b></div>' )
				. ( empty( $s['dont'] ) ? '' : '<div class="gs-dont ga" style="animation-delay:.45s"><span class="gs-tag gs-tag-no">Don’t</span><b>' . esc_html( $s['dont'] ) . '</b></div>' );
			break;
		case 'cta':
			$out .= $ga( 'b', 'gs-h', $s['headline'] ?? '', 0 ) . $ga( 'p', 'gs-t', $s['text'] ?? '', 1 )
				. '<a class="gs-cta ga" style="animation-delay:.4s" href="' . esc_url( $g['link'] ) . '" data-gist-cta>' . esc_html( $g['cta'] ) . '</a>'
				. '<a class="gs-cta2 ga" style="animation-delay:.55s" href="' . esc_url( sib_v9_signup( [ 'intent' => 'gist' ] ) ) . '">' . esc_html__( 'Or create your free store', 'shopinbos' ) . '</a>';
			break;
		default:
			$out .= $ga( 'span', 'gs-eye', $s['eyebrow'] ?? '', 0 ) . $ga( 'b', 'gs-h', $s['headline'] ?? '', 1 ) . $ga( 'p', 'gs-t', $s['text'] ?? '', 2 );
	}
	return $out . '</div>';
}

/** The story player: progress bars, the slides in a swipe track, and controls (v9.js runs it). */
function sib_v9_gist_player( array $g ): string {
	$slides = array_values( (array) $g['slides'] );
	$n      = count( $slides );
	$bars   = str_repeat( '<span class="gv-bar"><i></i></span>', $n );
	$track  = '';
	foreach ( $slides as $i => $s ) {
		$track .= sib_v9_gist_slide( (array) $s, $g, $i, $n );
	}
	$ctl = fn( $cls, $label, $path ) => '<button type="button" class="' . $cls . '" aria-label="' . esc_attr( $label ) . '"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' . $path . '</svg></button>';
	return '<div class="v9-gp" data-gp data-slug="' . esc_attr( $g['slug'] ) . '" style="--g-bg:' . esc_attr( $g['bg'] ) . ';--g-fg:' . esc_attr( $g['fg'] ) . ';--g-ac:' . esc_attr( $g['accent'] ?? '#FF6A2B' ) . '" aria-label="' . esc_attr( sprintf( 'Gist story: %s', $g['title'] ) ) . '">'
		. '<div class="gv-bars" aria-hidden="true">' . $bars . '</div>'
		. '<div class="gv-top"><span class="gv-av"><img src="' . esc_url( $g['img'] ) . '" alt=""></span><b class="gv-name">' . esc_html( $g['label'] ) . '</b><span class="gv-brand">Gist</span></div>'
		. '<div class="v9-gp-track" tabindex="0" aria-label="' . esc_attr__( 'Slides. Use the arrow keys to move.', 'shopinbos' ) . '">' . $track . '</div></div>'
		. '<div class="v9-gp-ctl" hidden>'
		. $ctl( 'gp-prev', __( 'Previous slide', 'shopinbos' ), '<path d="M15 6l-6 6 6 6"/>' )
		. $ctl( 'gp-pause', __( 'Pause', 'shopinbos' ), '<path class="i-pause" d="M9 5v14M15 5v14"/><path class="i-play" d="M7 4v16l13-8z"/>' )
		. '<span class="gp-count mutd" aria-live="polite">1 / ' . $n . '</span>'
		. $ctl( 'gp-next', __( 'Next slide', 'shopinbos' ), '<path d="M9 6l6 6-6 6"/>' ) . '</div>';
}

/** A story circle (the design's rail style). */
function sib_v9_gist_circle( array $g ): string {
	return '<a href="' . esc_url( $g['url'] ) . '" class="v9-gist-c" data-gist-slug="' . esc_attr( $g['slug'] ) . '" aria-label="' . esc_attr( sprintf( 'Watch: %s', $g['title'] ) ) . '">'
		. '<span class="v9-gist-ring" style="background:conic-gradient(from 210deg,' . esc_attr( $g['bg'] ) . ',#FF6A2B,' . esc_attr( $g['bg'] ) . ')"><img decoding="async" loading="lazy" src="' . esc_url( $g['img'] ) . '" alt="" style="background:' . esc_attr( $g['bg'] ) . '">'
		. ( $g['video'] ? '<span class="v9-gist-play" aria-hidden="true"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4v16l13-8z"/></svg></span>' : '' ) . '</span>'
		. '<span class="v9-gist-l">' . esc_html( $g['label'] ) . '</span></a>';
}

/** A story card in the design's "Today's gist" style. */
function sib_v9_gist_card( array $g ): string {
	$fg   = esc_attr( $g['fg'] );
	$n    = count( (array) $g['slides'] );
	$bars = '';
	for ( $i = 0; $i < min( $n, 8 ); $i++ ) {
		$bars .= '<i style="flex:1;height:3px;border-radius:9px;background:' . $fg . ';opacity:' . ( 0 === $i ? '0.9' : '0.25' ) . '"></i>';
	}
	$pill = 'font-size:12.5px;font-weight:700;border-radius:99px;padding:8px 14px;background:rgba(255,255,255,.18);box-shadow:inset 0 0 0 1px ' . $fg . '33';
	return '<a href="' . esc_url( $g['url'] ) . '" class="lift v9-gcard" style="min-width:0;height:500px;border-radius:28px;background:' . esc_attr( $g['bg'] ) . ';color:' . $fg . ';padding:24px;display:flex;flex-direction:column;gap:14px;position:relative;overflow:hidden">'
		. '<div style="display:flex;gap:4px">' . $bars . '</div>'
		. '<div style="display:flex;gap:10px;align-items:center"><img decoding="async" loading="lazy" src="' . esc_url( sib_v9_img( 'ca93d894250e7589d5b88c477d36f7d7.webp' ) ) . '" alt="" style="width:30px;height:30px;border-radius:99px;background:#FF6A2B;padding:5px"><b style="font-size:13px">Shopinbos Gist</b><span style="font-size:12px;opacity:.7">· ' . esc_html( $g['label'] ) . '</span></div>'
		. '<div class="H" style="font-size:28px;line-height:1.12;margin-top:12px">' . esc_html( sib_v9_gist_cover( $g ) ) . '</div>'
		. '<img decoding="async" loading="lazy" src="' . esc_url( $g['img'] ) . '" alt="" style="width:100%;height:170px;object-fit:cover;border-radius:16px;margin-top:auto;background:rgba(255,255,255,.18)">'
		. '<div style="display:flex;gap:8px;flex-wrap:wrap"><span style="' . $pill . '">' . esc_html( $g['video'] ? __( '▶ Watch', 'shopinbos' ) : __( 'Watch', 'shopinbos' ) ) . '</span><span style="' . $pill . '">' . esc_html( sprintf( _n( '%d slide', '%d slides', $n, 'shopinbos' ), $n ) ) . '</span></div></a>';
}

/* /gist/: real stories in the design's circles and cards. */
add_filter( 'sib_v9_fill', function ( string $html, string $slug ): string {
	if ( 'gist' !== $slug ) {
		return $html;
	}
	$groups = sib_v9_gist_groups();
	if ( ! $groups ) {
		return $html;
	}
	$circles = implode( '', array_map( 'sib_v9_gist_circle', $groups ) );
	$html    = (string) preg_replace_callback(
		'#<div class="up d3" style="display:flex;gap:18px;margin-top:48px;overflow:hidden;padding:6px 2px">.*?</div></div></section>#s',
		fn() => '<div class="up d3 v9-gist-rail" role="list" style="display:flex;gap:18px;margin-top:48px;padding:6px 2px 10px">' . $circles . '</div></div></section>',
		$html,
		1
	);
	// "Today's gist": one card per story. The design's topic chips have no data behind them: a count instead.
	$html  = (string) preg_replace(
		'#(<h2 class="H h2">Today’s gist</h2></div>)<div style="display:flex;gap:8px;flex-wrap:wrap">(?:<span class="chip[^"]*">[^<]*</span>)+</div>#u',
		'$1<p class="mutd" style="font-size:15px;margin:0">' . esc_html( sprintf( '%d stories. Tap one to watch, or read it as text.', count( $groups ) ) ) . '</p>',
		$html,
		1
	);
	// Two rows of cards, then "See all": the rest stay in the page (hidden) so the button needs no reload.
	$cap   = 6;
	$all   = ! empty( $_GET['all'] ); // phpcs:ignore WordPress.Security.NonceVerification
	$cards = '';
	foreach ( $groups as $i => $g ) {
		$card   = sib_v9_gist_card( $g );
		$cards .= ( ! $all && $i >= $cap ) ? (string) preg_replace( '/^<a /', '<a hidden data-gist-more ', $card ) : $card;
	}
	$more = ( ! $all && count( $groups ) > $cap ) ? '<div style="display:flex;justify-content:center;margin-top:32px"><a class="btn b-line" href="/gist/?all=1#all-gist" id="all-gist" data-gist-all>' . esc_html( sprintf( 'See all %d stories', count( $groups ) ) ) . '</a></div>' : '';
	return (string) preg_replace_callback(
		'#<div class="g3 rvs" style="display:grid;grid-template-columns:repeat\(3,1fr\);gap:20px;margin-top:40px">.*?</div></div></section>#s',
		fn() => '<div class="g3 v9-gist-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:40px">' . $cards . '</div>' . $more . '</div></section>',
		$html,
		1
	);
}, 10, 2 );

/** The story addressed by /blog/sib_gist/{slug}/ (or a singular Gist query). */
function sib_v9_gist_current(): ?array {
	$slug = '';
	if ( preg_match( '#^/blog/sib_gist/([^/]+)/$#', sib_v9_path(), $m ) ) {
		$slug = sanitize_title( $m[1] );
	} elseif ( is_singular( 'sib_gist' ) ) {
		$slug = (string) get_queried_object()->post_name;
	}
	if ( '' === $slug ) {
		return null;
	}
	foreach ( sib_v9_gist_groups() as $i => $g ) {
		if ( $g['slug'] === $slug ) {
			return [ $i, $g ];
		}
	}
	return null;
}

function sib_v9_is_gist(): bool {
	return null !== sib_v9_gist_current();
}

function sib_v9_gist_story(): ?array {
	$cur = sib_v9_gist_current();
	if ( ! $cur ) {
		return null;
	}
	[ $i, $g ] = $cur;
	$all       = sib_v9_gist_groups();
	$prev      = $all[ $i - 1 ] ?? null;
	$next      = $all[ $i + 1 ] ?? ( $all[0]['slug'] !== $g['slug'] ? $all[0] : null );
	$n         = count( $g['slides'] );
	$cover     = sib_v9_gist_cover( $g );
	$share     = 'https://wa.me/?text=' . rawurlencode( $g['title'] . ' (60-second tips from Shopinbos): ' . $g['url'] );

	$read = '';
	foreach ( $g['slides'] as $k => $s ) {
		[ $head, $rest ] = sib_v9_gist_line( (array) $s );
		if ( '' === $head && '' === $rest ) {
			continue;
		}
		$read .= '<li><button type="button" class="v9-gist-go" data-go="' . (int) $k . '"><span class="v9-num">' . ( $k + 1 ) . '</span><span>' . ( $head ? '<b>' . esc_html( $head ) . '</b> ' : '' ) . esc_html( $rest ) . '</span></button></li>';
	}

	$h  = '<section style="background:#F6F3EE;padding:48px 0 96px"><div class="wrap"><a href="/gist/" class="more mutd" style="font-size:14px">← ' . esc_html__( 'The Gist', 'shopinbos' ) . '</a>';
	$h .= '<div class="g2 v9-gist-split" style="display:grid;grid-template-columns:minmax(0,420px) minmax(0,1fr);gap:72px;align-items:start;margin-top:28px">';
	$h .= '<div class="v9-gp-wrap">' . sib_v9_gist_player( $g ) . '</div>';
	$h .= '<div style="display:flex;flex-direction:column;gap:20px;min-width:0"><span class="k orgd">' . esc_html( sprintf( 'Gist · %s · %d slides', $g['label'], $n ) ) . '</span>';
	$h .= '<h1 class="H" style="font-size:clamp(40px,4.6vw,68px);line-height:1">' . esc_html( $g['title'] ) . '</h1>';
	$h .= $cover !== $g['title'] ? '<p class="lead">' . esc_html( $cover ) . '</p>' : '';
	$h .= '<div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn b-ink" href="' . esc_url( $g['link'] ) . '">' . esc_html( $g['cta'] ) . ' →</a><a class="btn b-line" href="' . esc_url( $share ) . '" target="_blank" rel="noopener">' . esc_html__( 'Share on WhatsApp', 'shopinbos' ) . '</a></div>';
	$h .= '<div style="margin-top:20px"><span class="k mutd">' . esc_html__( 'Read it instead', 'shopinbos' ) . '</span><ol class="v9-gist-read">' . $read . '</ol></div>';
	$h .= '<div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:12px;padding-top:20px;border-top:1px solid #E7E4EC">'
		. ( $prev ? '<a class="more" href="' . esc_url( $prev['url'] ) . '">← ' . esc_html( $prev['label'] ) . '</a>' : '<span></span>' )
		. ( $next ? '<a class="more" href="' . esc_url( $next['url'] ) . '" data-gist-next>' . esc_html( sprintf( 'Next: %s', $next['label'] ) ) . ' →</a>' : '' ) . '</div>';
	$h .= '</div></div></div></section>';

	$others = array_values( array_filter( $all, fn( $x ) => $x['slug'] !== $g['slug'] ) );
	if ( $others ) {
		$h .= '<section class="sec" style="background:#fff;padding:80px 0"><div class="wrap"><div style="display:flex;justify-content:space-between;align-items:flex-end;gap:24px;flex-wrap:wrap"><h2 class="H h2">' . esc_html__( 'More gist', 'shopinbos' ) . '</h2><a class="more" href="/gist/">' . esc_html__( 'All stories', 'shopinbos' ) . ' →</a></div>'
			. '<div class="v9-gist-rail" role="list" style="display:flex;gap:18px;margin-top:36px;padding:6px 2px 10px">' . implode( '', array_map( 'sib_v9_gist_circle', $others ) ) . '</div></div></section>';
	}
	$h .= sib_v9_section( 'blog-post', 'night' );

	return [
		'slug'        => 'gist-story',
		'html'        => sib_v9_wrap( $h, 'gist' ),
		'title'       => $g['title'] . ' · Shopinbos Gist',
		'description' => wp_html_excerpt( $cover . ' ' . implode( ' ', array_map( fn( $s ) => (string) ( $s['text'] ?? '' ), $g['slides'] ) ), 155, '…' ),
		'canonical'   => $g['url'],
		'crumbs'      => [ [ __( 'The Gist', 'shopinbos' ), home_url( '/gist/' ) ] ],
	];
}

/* ====================================================================================================== */
/* Store templates and showcase                                                                            */
/* ====================================================================================================== */

/** Published templates as view models (plugin: sib_template_vm). */
function sib_v9_templates(): array {
	if ( ! function_exists( 'sib_template_vm' ) ) {
		return [];
	}
	$posts = get_posts( [ 'post_type' => 'sib_template', 'numberposts' => 48, 'orderby' => [ 'menu_order' => 'ASC', 'date' => 'ASC' ], 'post_status' => 'publish' ] );
	return array_map( function ( $p ) {
		$t          = sib_template_vm( $p );
		$t['about'] = $p->post_excerpt ?: wp_strip_all_tags( $p->post_content );
		$t['use']   = sib_v9_signup( [ 'intent' => 'template', 'template' => $t['key'] ] );
		$t['id']    = $p->ID;
		return $t;
	}, $posts );
}

/** A browser-window preview of a template (the design's card mock-up, in the template's colours). */
function sib_v9_template_mock( array $t, int $height = 440, string $host = 'yourshop.mybos.store', bool $lazy = true ): string {
	$hero = (int) round( $height * ( $height > 480 ? 0.72 : 0.62 ) );
	return '<div class="ui" style="overflow:hidden;background:' . esc_attr( $t['bg'] ) . ';height:' . $height . 'px;display:flex;flex-direction:column">'
		. '<div style="display:flex;align-items:center;gap:6px;padding:10px 14px;background:#F4F3F7"><i style="width:9px;height:9px;border-radius:9px;background:#FF8A7A"></i><i style="width:9px;height:9px;border-radius:9px;background:#FFD27A"></i><i style="width:9px;height:9px;border-radius:9px;background:#8BDB9A"></i><span style="flex:1;margin-left:10px;background:#fff;border-radius:99px;padding:4px 12px;font-size:11px;color:#6B6779;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' . esc_html( $host ) . '</span></div>'
		. '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 18px;font-size:11px;font-weight:700;letter-spacing:.08em;color:' . esc_attr( $t['ink'] ) . '"><span style="font-size:15px;letter-spacing:-.02em">' . esc_html( $t['name'] ) . '</span><span style="opacity:.65">SHOP · NEW · ABOUT</span></div>'
		. '<div style="position:relative;height:' . $hero . 'px;margin:0 14px;border-radius:14px;overflow:hidden;flex:none;background:rgba(0,0,0,.06)">' . ( $t['img'] ? '<img decoding="async"' . ( $lazy ? ' loading="lazy"' : ' fetchpriority="high"' ) . ' src="' . esc_url( $t['img'] ) . '" alt="' . esc_attr( sprintf( '%s template preview', $t['name'] ) ) . '" style="width:100%;height:100%;object-fit:cover;object-position:50% 30%">' : '' )
		. '<div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(14,12,20,.6),transparent 65%)"></div><div style="position:absolute;left:18px;bottom:16px;color:#fff"><div class="it" style="font-size:30px;line-height:1">' . esc_html__( 'New season', 'shopinbos' ) . '</div><span style="display:inline-block;margin-top:10px;background:' . esc_attr( $t['bg'] ) . ';color:' . esc_attr( $t['ink'] ) . ';font-size:11px;font-weight:800;padding:7px 14px;border-radius:99px">' . esc_html__( 'Shop now', 'shopinbos' ) . '</span></div></div>'
		. '<p style="margin:0;padding:14px 18px;font-size:13px;line-height:1.5;color:' . esc_attr( $t['ink'] ) . ';opacity:.85">' . esc_html( wp_html_excerpt( $t['about'], 110, '…' ) ) . '</p></div>';
}

function sib_v9_template_card( array $t ): string {
	return '<a href="' . esc_url( $t['url'] ) . '" class="lift" data-kind="' . esc_attr( sanitize_title( $t['kind'] ) ) . '" style="min-width:0;position:relative">' . sib_v9_template_mock( $t )
		. '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px"><div><b style="font-size:17px">' . esc_html( $t['name'] ) . '</b><div class="mutd" style="font-size:14px;margin-top:2px">' . esc_html( $t['kind'] ) . '</div></div><span class="tg tl">' . esc_html__( 'Free', 'shopinbos' ) . '</span></div></a>';
}

/** Showcase stores: posts (with their V9 page) or the built-in Rexi entry. */
function sib_v9_showcase_stores(): array {
	$out = [];
	foreach ( get_posts( [ 'post_type' => 'sib_showcase', 'post_status' => 'publish', 'numberposts' => 12, 'orderby' => [ 'menu_order' => 'ASC', 'date' => 'DESC' ] ] ) as $p ) {
		$s = [
			'slug'     => $p->post_name,
			'name'     => get_the_title( $p ),
			'about'    => $p->post_excerpt,
			'url'      => (string) get_post_meta( $p->ID, 'sib_showcase_url', true ),
			'sells'    => (string) get_post_meta( $p->ID, 'sib_showcase_sells', true ),
			'template' => (string) get_post_meta( $p->ID, 'sib_showcase_template', true ),
			'desktop'  => (string) get_the_post_thumbnail_url( $p, 'large' ) ?: (string) get_post_meta( $p->ID, 'sib_showcase_desktop', true ),
			'mobile'   => (string) get_post_meta( $p->ID, 'sib_showcase_mobile', true ),
			'page'     => home_url( '/blog/sib_showcase/' . $p->post_name . '/' ),
		];
		if ( $s['url'] ) {
			$out[] = $s;
		}
	}
	if ( ! $out && function_exists( 'sib_showcase_rexi' ) ) {
		$out[] = sib_showcase_rexi() + [ 'slug' => '', 'page' => '' ];
	}
	return $out;
}

/** A showcase store: laptop screenshot with the phone screenshot over it. */
function sib_v9_showcase_shots( array $s, bool $lazy = true ): string {
	$host = (string) wp_parse_url( $s['url'], PHP_URL_HOST );
	$ld   = $lazy ? ' loading="lazy"' : ' fetchpriority="high"';
	return '<div class="v9-sc-shots"><div class="ui" style="overflow:hidden;border-radius:20px">'
		. '<div style="display:flex;align-items:center;gap:6px;padding:10px 14px;background:#F4F3F7"><i style="width:9px;height:9px;border-radius:9px;background:#FF8A7A"></i><i style="width:9px;height:9px;border-radius:9px;background:#FFD27A"></i><i style="width:9px;height:9px;border-radius:9px;background:#8BDB9A"></i><span style="flex:1;margin-left:10px;background:#fff;border-radius:99px;padding:4px 12px;font-size:11px;color:#6B6779">' . esc_html( $host ) . '</span></div>'
		. ( $s['desktop'] ? '<img decoding="async"' . $ld . ' src="' . esc_url( $s['desktop'] ) . '" alt="' . esc_attr( sprintf( '%s online store home page on a laptop', $s['name'] ) ) . '" width="960" height="600" style="display:block;width:100%;height:auto">' : '' ) . '</div>'
		. ( $s['mobile'] ? '<img class="v9-sc-phone" decoding="async" loading="lazy" src="' . esc_url( $s['mobile'] ) . '" alt="' . esc_attr( sprintf( '%s store on a phone', $s['name'] ) ) . '" width="360" height="780">' : '' ) . '</div>';
}

/** "Real stores built on Shopinbos" (for /templates/). */
function sib_v9_showcase_section(): string {
	$stores = sib_v9_showcase_stores();
	if ( ! $stores ) {
		return '';
	}
	$cards = '';
	foreach ( $stores as $s ) {
		$more   = $s['page'] ?: $s['url'];
		$cards .= '<div class="g2 rv" style="display:grid;grid-template-columns:1.2fr .8fr;gap:56px;align-items:center">' . sib_v9_showcase_shots( $s )
			. '<div style="display:flex;flex-direction:column;gap:16px;min-width:0"><div style="display:flex;gap:8px;flex-wrap:wrap">' . ( $s['sells'] ? '<span class="tg og">' . esc_html( $s['sells'] ) . '</span>' : '' ) . '<span class="tg ok">' . esc_html__( 'Live store', 'shopinbos' ) . '</span></div>'
			. '<div class="H" style="font-size:clamp(34px,3.6vw,54px);line-height:1">' . esc_html( $s['name'] ) . '</div>' . ( $s['about'] ? '<p class="lead" style="font-size:18px">' . esc_html( $s['about'] ) . '</p>' : '' )
			. ( $s['template'] ? '<p class="mutd" style="font-size:14.5px;margin:0">' . esc_html( sprintf( 'Look: %s', $s['template'] ) ) . '</p>' : '' )
			. '<div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn b-ink" href="' . esc_url( $s['url'] ) . '" target="_blank" rel="noopener">' . esc_html__( 'Visit the store', 'shopinbos' ) . ' ↗</a>'
			. ( $s['page'] ? '<a class="btn b-line" href="' . esc_url( $more ) . '">' . esc_html__( 'How it was built', 'shopinbos' ) . '</a>' : '' ) . '</div></div></div>';
	}
	return '<section class="sec" style="background:#F6F3EE"><div class="wrap"><div class="rv" style="display:flex;flex-direction:column;gap:20px;max-width:820px"><span class="k orgd">' . esc_html__( 'Live stores', 'shopinbos' ) . '</span><h2 class="H h2">' . esc_html__( 'Real stores built on Shopinbos.', 'shopinbos' ) . '</h2><p class="lead">' . esc_html__( 'Open a store and click around: browse products, add to bag, try checkout. This is what your customers will see.', 'shopinbos' ) . '</p></div>'
		. '<div style="display:flex;flex-direction:column;gap:72px;margin-top:56px">' . $cards . '</div></div></section>';
}

/* /templates/: real templates (with working filters) in place of the design's example shops, then the showcase. */
add_filter( 'sib_v9_fill', function ( string $html, string $slug ): string {
	if ( 'templates' !== $slug ) {
		return $html;
	}
	$tpls = sib_v9_templates();
	if ( ! $tpls ) {
		return $html;
	}
	// Design cards whose name is a real template link to it; otherwise the real templates replace the examples.
	$by_name = [];
	foreach ( $tpls as $t ) {
		$by_name[ strtolower( remove_accents( $t['name'] ) ) ] = $t;
	}
	$matched = 0;
	$html    = (string) preg_replace_callback( '#<a href="/website-builder/" class="lift"(.*?)<b style="font-size:17px">([^<]+)</b>#s', function ( $m ) use ( $by_name, &$matched ) {
		$t = $by_name[ strtolower( remove_accents( html_entity_decode( $m[2] ) ) ) ] ?? null;
		if ( ! $t ) {
			return $m[0];
		}
		$matched++;
		return '<a href="' . esc_url( $t['url'] ) . '" class="lift"' . $m[1] . '<b style="font-size:17px">' . $m[2] . '</b>';
	}, $html );
	if ( $matched < 3 ) {
		$kinds = array_values( array_unique( array_filter( array_column( $tpls, 'kind' ) ) ) );
		$chips = '<button type="button" class="chip on" data-kind="" aria-pressed="true">' . esc_html__( 'All', 'shopinbos' ) . '</button>';
		foreach ( $kinds as $k ) {
			$chips .= '<button type="button" class="chip" data-kind="' . esc_attr( sanitize_title( $k ) ) . '" aria-pressed="false">' . esc_html( $k ) . '</button>';
		}
		$html  = (string) preg_replace_callback( '#(<div class="up d3"[^>]*>)(?:<span class="chip[^"]*">[^<]*</span>)+#', fn( $m ) => str_replace( '<div ', '<div data-tpl-filter="v9-tpls" role="group" aria-label="' . esc_attr__( 'Filter templates', 'shopinbos' ) . '" ', $m[1] ) . $chips, $html, 1 );
		$cards = implode( '', array_map( 'sib_v9_template_card', $tpls ) );
		$html  = (string) preg_replace_callback(
			'#<div class="g3 rvs" style="display:grid;grid-template-columns:repeat\(3,1fr\);gap:28px 20px">.*?<p class="mutd" style="font-size:13px;margin-top:28px">[^<]*</p></div></section>#s',
			fn() => '<div class="g3" id="v9-tpls" style="display:grid;grid-template-columns:repeat(3,1fr);gap:28px 20px">' . $cards . '</div><p class="mutd" style="font-size:14px;margin-top:28px">' . esc_html__( 'Every template is free on every plan. Rex fits it to your logo, colours and photos.', 'shopinbos' ) . '</p></div></section>' . sib_v9_showcase_section(),
			$html,
			1
		);
	}
	return $html;
}, 10, 2 );

function sib_v9_is_template(): bool {
	return is_singular( 'sib_template' );
}

/** The design's "Every template comes with" section. */
function sib_v9_templates_includes(): string {
	$html = sib_v9_page( 'templates' );
	return preg_match( '#<section class="sec" style="background:\#fff;"><div class="wrap"><div class="rv"[^>]*><h2 class="H h2">Every template.*?</section>#s', $html, $m ) ? $m[0] : '';
}

function sib_v9_template_page(): ?array {
	$post = get_queried_object();
	if ( ! $post instanceof WP_Post || ! function_exists( 'sib_template_vm' ) ) {
		return null;
	}
	$all = sib_v9_templates();
	$t   = null;
	foreach ( $all as $x ) {
		if ( $x['id'] === $post->ID ) {
			$t = $x;
		}
	}
	if ( ! $t ) {
		return null;
	}
	[ $body ] = sib_v9_prose( $post );
	$body_txt = trim( wp_strip_all_tags( $body ) );
	$ticks    = '';
	foreach ( [ __( 'Works on phones first and loads fast on slow networks', 'shopinbos' ), __( 'Card, transfer and pay on delivery at checkout', 'shopinbos' ), __( 'WhatsApp ordering built in', 'shopinbos' ), __( 'Rex fits it to your logo, colours and photos', 'shopinbos' ) ] as $tk ) {
		$ticks .= '<div class="tick"><b>✓</b>' . esc_html( $tk ) . '</div>';
	}

	$h  = '<section style="background:#F6F3EE;padding:48px 0 96px"><div class="wrap"><a href="/templates/" class="more mutd" style="font-size:14px">← ' . esc_html__( 'All templates', 'shopinbos' ) . '</a>';
	$h .= '<div class="g2" style="display:grid;grid-template-columns:1.15fr .85fr;gap:64px;align-items:center;margin-top:28px"><div class="up d2" style="min-width:0">' . sib_v9_template_mock( $t, 560, sanitize_title( $t['name'] ) . '.mybos.store', false ) . '</div>';
	$h .= '<div style="display:flex;flex-direction:column;gap:20px;min-width:0"><span class="k orgd up">' . esc_html( ( $t['kind'] ?: __( 'Store template', 'shopinbos' ) ) . ' · ' . __( 'Free', 'shopinbos' ) ) . '</span>';
	$h .= '<h1 class="H h1 up d1" style="font-size:clamp(50px,6vw,92px)">' . esc_html( $t['name'] ) . '</h1>';
	$h .= $t['about'] ? '<p class="lead up d2">' . esc_html( $t['about'] ) . '</p>' : '';
	$h .= '<div style="display:grid;gap:12px">' . $ticks . '</div>';
	$h .= '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px"><a class="btn b-org" href="' . esc_url( $t['use'] ) . '">' . esc_html__( 'Use this template', 'shopinbos' ) . ' →</a>'
		. ( $t['demo'] ? '<a class="btn b-line" href="' . esc_url( $t['demo'] ) . '" target="_blank" rel="noopener">' . esc_html__( 'See a live store', 'shopinbos' ) . '</a>' : '<a class="btn b-line" href="/website-builder/">' . esc_html__( 'How the builder works', 'shopinbos' ) . '</a>' ) . '</div>';
	$h .= '<p class="mutd" style="font-size:14px;margin:0">' . esc_html__( 'Free on every plan. You can switch templates later without losing your products.', 'shopinbos' ) . '</p></div></div></div></section>';
	if ( $body_txt && $body_txt !== trim( $t['about'] ) ) {
		$h .= '<section style="padding:80px 0"><div class="wrap" style="max-width:780px"><div class="v9-prose">' . $body . '</div></div></section>';
	}
	$h .= sib_v9_templates_includes();
	$others = array_slice( array_values( array_filter( $all, fn( $x ) => $x['id'] !== $t['id'] ) ), 0, 3 );
	if ( $others ) {
		$h .= '<section class="sec" style="background:#F6F3EE"><div class="wrap"><div style="display:flex;justify-content:space-between;align-items:flex-end;gap:24px;flex-wrap:wrap"><h2 class="H h2">' . esc_html__( 'More templates', 'shopinbos' ) . '</h2><a class="more" href="/templates/">' . esc_html__( 'See all', 'shopinbos' ) . ' →</a></div>'
			. '<div class="g3" style="display:grid;grid-template-columns:repeat(3,1fr);gap:28px 20px;margin-top:48px">' . implode( '', array_map( 'sib_v9_template_card', $others ) ) . '</div></div></section>';
	}
	$h .= sib_v9_section( 'templates', 'night' ) ?: sib_v9_section( 'blog-post', 'night' );

	return [
		'slug'        => 'template',
		'html'        => sib_v9_wrap( $h, 'templates' ),
		'title'       => sprintf( '%s online store template · Shopinbos', $t['name'] ),
		'description' => $t['about'],
		'crumbs'      => [ [ __( 'Templates', 'shopinbos' ), home_url( '/templates/' ) ] ],
	];
}

/** The showcase store addressed by /blog/sib_showcase/{slug}/. */
function sib_v9_showcase_current(): ?array {
	if ( ! preg_match( '#^/blog/sib_showcase/([^/]+)/$#', sib_v9_path(), $m ) ) {
		return null;
	}
	foreach ( sib_v9_showcase_stores() as $s ) {
		if ( $s['slug'] && $s['slug'] === sanitize_title( $m[1] ) ) {
			return $s;
		}
	}
	return null;
}

function sib_v9_is_showcase(): bool {
	return null !== sib_v9_showcase_current();
}

function sib_v9_showcase_page(): ?array {
	$s = sib_v9_showcase_current();
	if ( ! $s ) {
		return null;
	}
	$host = (string) wp_parse_url( $s['url'], PHP_URL_HOST );
	$h    = '<section style="background:#F6F3EE;padding:48px 0 96px"><div class="wrap"><a href="/templates/" class="more mutd" style="font-size:14px">← ' . esc_html__( 'Templates and stores', 'shopinbos' ) . '</a>';
	$h   .= '<div style="display:flex;flex-direction:column;gap:20px;max-width:860px;margin-top:28px"><div style="display:flex;gap:8px;flex-wrap:wrap" class="up">' . ( $s['sells'] ? '<span class="tg og">' . esc_html( $s['sells'] ) . '</span>' : '' ) . '<span class="tg ok">' . esc_html__( 'Live store', 'shopinbos' ) . '</span></div>';
	$h   .= '<h1 class="H h1 up d1">' . esc_html( $s['name'] ) . '</h1>' . ( $s['about'] ? '<p class="lead up d2" style="max-width:680px">' . esc_html( $s['about'] ) . '</p>' : '' );
	$h   .= '<div style="display:flex;gap:10px;flex-wrap:wrap" class="up d3"><a class="btn b-ink" href="' . esc_url( $s['url'] ) . '" target="_blank" rel="noopener">' . esc_html( sprintf( 'Visit %s', $host ) ) . ' ↗</a><a class="btn b-org" href="' . esc_url( sib_v9_signup( [ 'intent' => 'template' ] ) ) . '">' . esc_html__( 'Build one like it', 'shopinbos' ) . '</a></div></div>';
	$h   .= '<div style="margin-top:56px" class="up d3">' . sib_v9_showcase_shots( $s, false ) . '</div></div></section>';
	$facts = array_filter( [
		__( 'What it sells', 'shopinbos' ) => $s['sells'],
		__( 'The look', 'shopinbos' )      => $s['template'],
		__( 'Address', 'shopinbos' )       => $host,
	] );
	$cells = '';
	foreach ( $facts as $k => $v ) {
		$cells .= '<div class="bc c-wh"><span class="k mutd">' . esc_html( $k ) . '</span><div class="H h3" style="margin-top:12px">' . esc_html( $v ) . '</div></div>';
	}
	$h .= '<section class="sec" style="background:#fff;padding:96px 0"><div class="wrap"><h2 class="H h2">' . esc_html__( 'About this store', 'shopinbos' ) . '</h2><div class="bn g3" style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:40px">' . $cells . '</div>'
		. '<p class="lead" style="margin-top:40px;max-width:720px">' . esc_html__( 'Open it on your phone and click around: browse products, add to bag, try checkout. Your store can look like this. Tell Rex what you sell and he sets it up with your colours, photos and a free mybos.store address.', 'shopinbos' ) . '</p></div></section>';
	$tpls = array_slice( sib_v9_templates(), 0, 3 );
	if ( $tpls ) {
		$h .= '<section class="sec" style="background:#F6F3EE"><div class="wrap"><div style="display:flex;justify-content:space-between;align-items:flex-end;gap:24px;flex-wrap:wrap"><h2 class="H h2">' . esc_html__( 'Start from a template', 'shopinbos' ) . '</h2><a class="more" href="/templates/">' . esc_html__( 'See all', 'shopinbos' ) . ' →</a></div>'
			. '<div class="g3" style="display:grid;grid-template-columns:repeat(3,1fr);gap:28px 20px;margin-top:48px">' . implode( '', array_map( 'sib_v9_template_card', $tpls ) ) . '</div></div></section>';
	}
	$h .= sib_v9_section( 'templates', 'night' ) ?: sib_v9_section( 'blog-post', 'night' );
	return [
		'slug'        => 'showcase',
		'html'        => sib_v9_wrap( $h, 'templates' ),
		'title'       => sprintf( '%s: a real Shopinbos store · Shopinbos', $s['name'] ),
		'description' => $s['about'],
		'canonical'   => $s['page'],
		'crumbs'      => [ [ __( 'Templates', 'shopinbos' ), home_url( '/templates/' ) ] ],
	];
}

/* ====================================================================================================== */
/* Investors                                                                                               */
/* ====================================================================================================== */

function sib_v9_is_investors(): bool {
	return is_page( 'investors' );
}

/** Line icons in the design's style. */
function sib_v9_icon( string $name, string $color = '#16141F' ): string {
	$p = [
		'chat'   => '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
		'shield' => '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
		'layers' => '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
		'store'  => '<path d="M4 9l1.5-5h13L20 9"/><path d="M4 9h16v11H4z"/><path d="M9 20v-6h6v6"/>',
		'box'    => '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
		'truck'  => '<path d="M3 6h11v10H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
	][ $name ] ?? '';
	return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="' . esc_attr( $color ) . '" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' . $p . '</svg>';
}

function sib_v9_investors(): ?array {
	$email = (string) apply_filters( 'sib_investor_email', 'hello@shopinbos.com' );
	$head  = fn( $eyebrow, $title, $lead = '' ) => '<div class="rv" style="display:flex;flex-direction:column;gap:20px;max-width:820px"><span class="k orgd">' . esc_html( $eyebrow ) . '</span><h2 class="H h2">' . $title . '</h2>' . ( $lead ? '<p class="lead">' . esc_html( $lead ) . '</p>' : '' ) . '</div>';
	$card  = fn( $icon, $bg, $fg, $title, $text, $cls = 'c-sand', $ibg = '#fff' ) => '<div class="bc ' . $cls . ' lift" style="min-height:240px"><span class="ico" style="background:' . $bg . '">' . sib_v9_icon( $icon, $fg ) . '</span><div class="H h3" style="margin-top:auto;padding-top:28px">' . esc_html( $title ) . '</div><p class="p mutd" style="font-size:15px;margin-top:8px">' . esc_html( $text ) . '</p></div>';
	$list  = function ( array $rows ): string {
		$o = '<div style="display:grid;gap:18px;margin-top:32px">';
		foreach ( $rows as [ $t, $d ] ) {
			$o .= '<div class="tick" style="font-size:16.5px"><b>✓</b><span><strong>' . esc_html( $t ) . '.</strong> ' . esc_html( $d ) . '</span></div>';
		}
		return $o . '</div>';
	};

	// Hero with the company facts.
	$facts = '';
	foreach ( [
		[ __( 'Company', 'shopinbos' ), __( 'Tech Della Solutions Ltd', 'shopinbos' ) ],
		[ __( 'Registration', 'shopinbos' ), 'RC 7038770 (CAC, Nigeria)' ],
		[ __( 'Headquarters', 'shopinbos' ), __( 'Lagos, Nigeria', 'shopinbos' ) ],
		[ __( 'Product', 'shopinbos' ), __( 'Shopinbos: web app and Android, iPhone next', 'shopinbos' ) ],
		[ __( 'First market', 'shopinbos' ), __( 'Nigeria, then West and East Africa', 'shopinbos' ) ],
		[ __( 'Customers', 'shopinbos' ), __( 'Small businesses, suppliers and delivery companies', 'shopinbos' ) ],
	] as [ $k, $v ] ) {
		$facts .= '<div style="display:grid;grid-template-columns:130px 1fr;gap:16px;padding:14px 0;border-top:1px solid rgba(255,255,255,.12)"><dt class="k" style="color:#8BE3D3;font-size:11.5px;padding-top:3px">' . esc_html( $k ) . '</dt><dd style="margin:0;font-size:16px;font-weight:600">' . esc_html( $v ) . '</dd></div>';
	}
	$h  = '<section style="background:#F6F3EE;padding:88px 0 96px"><div class="wrap g2" style="display:grid;grid-template-columns:1.1fr .9fr;gap:64px;align-items:center">';
	$h .= '<div style="display:flex;flex-direction:column;gap:22px;min-width:0"><span class="k orgd up">' . esc_html__( 'Investor relations', 'shopinbos' ) . '</span>'
		. '<h1 class="H up d1" style="font-size:clamp(46px,5.6vw,84px);line-height:.98">' . esc_html__( 'The commerce operating system for', 'shopinbos' ) . ' <span class="it orgd">' . esc_html__( 'African businesses.', 'shopinbos' ) . '</span></h1>'
		. '<p class="lead up d2" style="max-width:600px">' . esc_html__( 'Shopinbos gives small businesses one app to find products, sell them everywhere their customers are, get paid and deliver. We are starting in Nigeria and building for the continent.', 'shopinbos' ) . '</p>'
		. '<div class="up d3" style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn b-ink" href="#inv-contact">' . esc_html__( 'Talk to the founders', 'shopinbos' ) . ' →</a><a class="btn b-line" href="/about/">' . esc_html__( 'About Shopinbos', 'shopinbos' ) . '</a></div></div>';
	$h .= '<div class="bc c-night up d2" style="padding:36px"><span class="k" style="color:#FFB18F">' . esc_html__( 'At a glance', 'shopinbos' ) . '</span><dl style="margin:20px 0 0">' . $facts . '</dl></div></div></section>';

	// The opportunity.
	$h .= '<section class="sec" style="background:#fff"><div class="wrap">' . $head( __( 'The opportunity', 'shopinbos' ), esc_html__( 'Africa’s small businesses already sell online.', 'shopinbos' ) . ' <span class="it orgd">' . esc_html__( 'Their tools haven’t caught up.', 'shopinbos' ) . '</span>', __( 'Millions of Nigerian businesses take orders on WhatsApp, Instagram and TikTok every day. Most run on screenshots, bank transfer alerts and a rider’s phone number.', 'shopinbos' ) )
		. '<div class="bn g3 rvs" style="grid-template-columns:repeat(3,1fr);margin-top:56px">'
		. $card( 'chat', '#E2F5EA', '#16794A', __( 'Selling happens in chats', 'shopinbos' ), __( 'Customers discover products on social media and buy in conversation. Global store builders were designed for a checkout page, not a chat.', 'shopinbos' ) )
		. $card( 'shield', '#FFEDE4', '#B23E0A', __( 'Trust is the bottleneck', 'shopinbos' ), __( 'Buyers fear paying first; sellers fear fake orders. Pay on delivery with a delivery code, and payouts straight to the seller’s bank, remove that friction for both.', 'shopinbos' ) )
		. $card( 'layers', '#ECE8FF', '#5B3FD6', __( 'Too many disconnected tools', 'shopinbos' ), __( 'A seller juggles a store, a payment link, a supplier, a rider and a spreadsheet. Each hand-off loses orders and money.', 'shopinbos' ) )
		. '</div></div></section>';

	// What we're building.
	$h .= '<section class="sec" style="background:#F6F3EE"><div class="wrap">' . $head( __( 'What we’re building', 'shopinbos' ), esc_html__( 'One app that runs', 'shopinbos' ) . ' <span class="it orgd">' . esc_html__( 'the whole business.', 'shopinbos' ) . '</span>', __( 'Shopinbos connects three sides that need each other: sellers, the suppliers who stock them and the delivery companies who reach their customers.', 'shopinbos' ) )
		. '<div class="bn g4 rvs" style="grid-template-columns:repeat(4,1fr);margin-top:56px">'
		. $card( 'store', '#FFEDE4', '#C2410C', __( 'Store builder', 'shopinbos' ), __( 'Rex, our AI builder, sets up a seller’s store from a short chat, with a free mybos.store address.', 'shopinbos' ), 'c-wh' )
		. $card( 'chat', '#E2F5EA', '#16794A', __( 'AI shop assistant', 'shopinbos' ), __( 'Peggy answers customers, follows up and sends offers, in English or Pidgin.', 'shopinbos' ), 'c-wh' )
		. $card( 'box', '#FFF1BF', '#8A5A00', __( 'Supplier marketplace', 'shopinbos' ), __( 'Find stock lets sellers add checked Nigerian suppliers’ products and dropship or buy wholesale.', 'shopinbos' ), 'c-wh' )
		. $card( 'truck', '#E3EEFD', '#1F5FBF', __( 'Payments and delivery', 'shopinbos' ), __( 'Card, transfer and pay on delivery, riders booked from the order, and payouts to the bank.', 'shopinbos' ), 'c-wh' )
		. '</div></div></section>';

	// Business model and why us.
	$h .= '<section class="sec" style="background:#fff"><div class="wrap g2" style="display:grid;grid-template-columns:1fr 1fr;gap:72px;align-items:start">';
	$h .= '<div class="rv">' . '<span class="k orgd">' . esc_html__( 'Business model', 'shopinbos' ) . '</span><h2 class="H h2" style="margin-top:20px">' . esc_html__( 'Revenue grows with our sellers.', 'shopinbos' ) . '</h2>' . $list( [
		[ __( 'Seller plans', 'shopinbos' ), __( 'Monthly plans for more products, staff, automations and AI.', 'shopinbos' ) ],
		[ __( 'Marketplace', 'shopinbos' ), __( 'A share of orders sellers place with suppliers through Find stock.', 'shopinbos' ) ],
		[ __( 'Delivery', 'shopinbos' ), __( 'A margin on delivery bookings made through the app.', 'shopinbos' ) ],
		[ __( 'Add-ons', 'shopinbos' ), __( 'Custom domains, ads and premium templates.', 'shopinbos' ) ],
	] ) . '</div>';
	$h .= '<div class="rv">' . '<span class="k orgd">' . esc_html__( 'Why Shopinbos', 'shopinbos' ) . '</span><h2 class="H h2" style="margin-top:20px">' . esc_html__( 'Built for how Nigeria sells.', 'shopinbos' ) . '</h2>' . $list( [
		[ __( 'Network effects', 'shopinbos' ), __( 'Every supplier and delivery partner makes the app more useful for every seller, and the other way round.', 'shopinbos' ) ],
		[ __( 'Local by design', 'shopinbos' ), __( 'Pay on delivery, naira pricing, WhatsApp first, plain words in English and Pidgin.', 'shopinbos' ) ],
		[ __( 'AI that does the work', 'shopinbos' ), __( 'Rex and Peggy replace tasks sellers would otherwise pay someone for.', 'shopinbos' ) ],
		[ __( 'Content that brings sellers in', 'shopinbos' ), __( 'Our free Academy, guides and tools reach sellers before they choose a platform.', 'shopinbos' ) ],
	] ) . '</div></div></section>';

	// Contact: the enquiry form (lead kind "investor") and contact details.
	$state = sanitize_key( wp_unslash( $_GET['sib_lead'] ?? '' ) ); // phpcs:ignore WordPress.Security.NonceVerification
	$form_ = sanitize_key( wp_unslash( $_GET['sib_form'] ?? '' ) ); // phpcs:ignore WordPress.Security.NonceVerification
	$note  = '';
	if ( 'investor' === $form_ && 'ok' === $state ) {
		$note = '<p class="v9-lead-msg is-ok" role="status">' . esc_html__( 'Thank you. We’ll reply within two working days.', 'shopinbos' ) . '</p>';
	} elseif ( 'investor' === $form_ && 'error' === $state ) {
		$note = '<p class="v9-lead-msg" role="alert">' . esc_html( sanitize_text_field( rawurldecode( wp_unslash( $_GET['sib_msg'] ?? '' ) ) ) ?: __( 'That didn’t go through. Check the details and try again.', 'shopinbos' ) ) . '</p>'; // phpcs:ignore
	}
	$field = fn( $label, $input ) => '<label style="display:flex;flex-direction:column;gap:8px;font-size:14px;font-weight:700;min-width:0">' . esc_html( $label ) . '<span class="v9-field">' . $input . '</span></label>';
	$form  = '<form class="ui" id="inv-form" method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" data-v9-lead="investor" style="padding:36px;border-radius:32px;display:flex;flex-direction:column;gap:18px;min-width:0">'
		. '<div><div class="H h3" style="font-size:30px">' . esc_html__( 'Investor enquiries', 'shopinbos' ) . '</div><p class="p mutd" style="margin-top:6px;font-size:15px">' . esc_html__( 'Our deck, financials and data room are shared on request with qualified investors. Tell us about you and we’ll reply within two working days.', 'shopinbos' ) . '</p></div>'
		. $note
		. '<div class="g2" style="display:grid;grid-template-columns:1fr 1fr;gap:14px">'
		. $field( __( 'Your name', 'shopinbos' ), '<input type="text" name="name" required autocomplete="name" placeholder="' . esc_attr__( 'Full name', 'shopinbos' ) . '">' )
		. $field( __( 'Work email', 'shopinbos' ), '<input type="email" name="email" required autocomplete="email" placeholder="you@fund.com">' ) . '</div>'
		. $field( __( 'Fund or organisation (optional)', 'shopinbos' ), '<input type="text" name="org" autocomplete="organization">' )
		. $field( __( 'What would you like to know?', 'shopinbos' ), '<textarea name="message" rows="4"></textarea>' )
		. '<label style="display:flex;gap:10px;align-items:flex-start;font-size:14px;line-height:1.5;color:#55516A;cursor:pointer"><input type="checkbox" name="consent" value="1" style="margin-top:3px;width:18px;height:18px;flex:none;accent-color:#16141F"> ' . esc_html__( 'Send me Shopinbos investor updates by email. You can unsubscribe at any time.', 'shopinbos' ) . '</label>'
		. '<button class="btn b-ink" type="submit" style="align-self:flex-start">' . esc_html__( 'Send enquiry', 'shopinbos' ) . ' →</button>'
		. '<input type="hidden" name="action" value="sib_lead"><input type="hidden" name="kind" value="investor"><input type="hidden" name="back" value="' . esc_url( home_url( '/investors/' ) ) . '">'
		. '<input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px"></form>';
	$side  = '<div style="display:flex;flex-direction:column;gap:16px;min-width:0">'
		. '<div class="bc c-night" style="gap:10px"><div class="H h3">' . esc_html__( 'Contact', 'shopinbos' ) . '</div><p class="p" style="color:#C9C6D3;font-size:15px">' . esc_html__( 'For investment, partnership and strategic enquiries.', 'shopinbos' ) . '</p><a class="more" href="mailto:' . esc_attr( $email ) . '" style="color:#8BE3D3;margin-top:6px">' . esc_html( $email ) . ' →</a></div>'
		. '<div class="bc c-wh" style="gap:10px"><b style="font-size:17px">' . esc_html__( 'Company details', 'shopinbos' ) . '</b><p class="p mutd" style="font-size:15px">' . esc_html__( 'Shopinbos is a product of Tech Della Solutions Ltd (RC 7038770), registered with the Corporate Affairs Commission, Lagos, Nigeria.', 'shopinbos' ) . '</p><p class="p mutd" style="font-size:15px">' . esc_html__( 'Nothing on this page is an offer to sell or a solicitation to buy securities.', 'shopinbos' ) . '</p></div>'
		. '<a class="bc c-wh lift" href="/press/" style="flex-direction:row;justify-content:space-between;align-items:center;padding:24px 28px"><b style="font-size:17px">' . esc_html__( 'Press and brand assets', 'shopinbos' ) . '</b><span aria-hidden="true">→</span></a></div>';
	$h    .= '<section class="sec" id="inv-contact" style="background:#F6F3EE"><div class="wrap">' . $head( __( 'Get in touch', 'shopinbos' ), esc_html__( 'Talk to', 'shopinbos' ) . ' <span class="it orgd">' . esc_html__( 'the founders.', 'shopinbos' ) . '</span>' )
		. '<div class="g2" style="display:grid;grid-template-columns:1.3fr .7fr;gap:28px;align-items:start;margin-top:48px">' . $form . $side . '</div></div></section>';

	return [
		'slug'   => 'investors',
		'html'   => sib_v9_wrap( $h, 'blog-post' ),
		'title'  => __( 'Investor relations · Shopinbos', 'shopinbos' ),
		'crumbs' => [ [ __( 'About', 'shopinbos' ), home_url( '/about/' ) ] ],
	];
}

add_filter( 'sib_v9_content_templates', function ( array $t ): array {
	$t['sib_v9_is_gist']      = 'sib_v9_gist_story';
	$t['sib_v9_is_template']  = 'sib_v9_template_page';
	$t['sib_v9_is_showcase']  = 'sib_v9_showcase_page';
	$t['sib_v9_is_investors'] = 'sib_v9_investors';
	return $t;
} );
