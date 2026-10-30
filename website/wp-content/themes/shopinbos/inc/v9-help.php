<?php
/**
 * Website V9: the help centre (how to use Shopinbos Business, the supplier screens and the delivery partner screens).
 *   /help/                 topic cards with counts, popular questions, search (?q=), a topic list (?topic=)
 *   /help/<topic>/         one topic's articles (the sib_help_category archive)
 *   /help/<topic>/<slug>/  an article: steps with pictures, "Was this helpful?", related articles, HowTo/FAQPage data
 * Replaces the first V9 help templates in v9-content.php / v9-fill.php by registering later (priority 20).
 * Articles and pictures are seeded by `wp shopinbos setup` (plugin: includes/seed/help.php, seed/help-img/).
 */

defined( 'ABSPATH' ) || exit;

/** Topic look on the help home: [icon background, icon colour, svg paths]. The design's eight, then the rest. */
function sib_v9_help_topic_icons(): array {
	$tool = '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"></path>';
	return [
		'products'                         => [ '#EEF7D6', '#4A6B0E', '<path d="M20 12l-8 8-9-9V3h8z"></path><circle cx="7.5" cy="7.5" r="1.5"></circle>' ],
		'orders'                           => [ '#FFEDE4', '#B23E0A', '<path d="M6 7h12l-1 13H7z"></path><path d="M9 7a3 3 0 0 1 6 0"></path>' ],
		'marketing-and-ads'                => [ '#E2F6F1', '#0C4A44', '<path d="M3 11v2a2 2 0 0 0 2 2h2l5 4V5L7 9H5a2 2 0 0 0-2 2z"></path><path d="M16 9a4 4 0 0 1 0 6"></path>' ],
		'plans-and-billing'                => [ '#FDF0D5', '#8A5A08', '<path d="M4 4h16v16H4z"></path><path d="M8 9h8M8 13h8M8 17h5"></path>' ],
		'supplier-getting-started'         => [ '#FFF1BF', '#8A5A08', '<path d="M21 8l-9-5-9 5 9 5 9-5z"></path><path d="M3 8v8l9 5 9-5V8"></path>' ],
		'delivery-partner-getting-started' => [ '#E2F6F1', '#0C4A44', '<path d="M3 6h11v10H3zM14 9h4l3 3v4h-7"></path><circle cx="7" cy="17.5" r="1.8"></circle><circle cx="17" cy="17.5" r="1.8"></circle>' ],
		'_default'                         => [ '#F4F3F7', '#16141F', $tool ],
	];
}

/** Seller topics in the order they show, then the two partner topics. */
function sib_v9_help_topics(): array {
	$order = function_exists( 'sib_seed_help_topics' ) ? array_column( sib_seed_help_topics(), 1 ) : []; // seed file, when loaded
	if ( ! $order ) {
		$order = [ 'getting-started', 'payments-and-payouts', 'delivery-and-pay-on-delivery', 'whatsapp-and-social', 'sourcing-and-dropshipping', 'rex-and-peggy', 'store-and-design', 'account-and-security', 'products', 'orders', 'marketing-and-ads', 'plans-and-billing', 'supplier-getting-started', 'delivery-partner-getting-started' ];
	}
	$out = [];
	foreach ( $order as $slug ) {
		$t = get_term_by( 'slug', $slug, 'sib_help_category' );
		if ( $t && $t->count > 0 ) {
			$out[ $slug ] = $t;
		}
	}
	return $out;
}

/** "Popular questions" on the help home (same list as sib_seed_help_popular() in the plugin's seed). */
function sib_v9_help_popular(): array {
	return [ 'when-will-i-get-my-money', 'how-pay-on-delivery-works', 'connect-whatsapp-facebook-and-instagram', 'book-a-rider-for-an-order', 'connect-your-own-domain', 'what-are-ai-credits', 'add-a-dropship-product', 'cancel-or-refund-an-order' ];
}

function sib_v9_help_is_partner_topic( string $slug ): bool {
	return in_array( $slug, [ 'supplier-getting-started', 'delivery-partner-getting-started' ], true );
}

/** Articles in a topic, in their set order. */
function sib_v9_help_posts( WP_Term $t, int $n = -1 ): array {
	return get_posts( [
		'post_type'   => 'sib_help',
		'numberposts' => $n,
		'orderby'     => [ 'menu_order' => 'ASC', 'title' => 'ASC' ],
		'tax_query'   => [ [ 'taxonomy' => 'sib_help_category', 'terms' => $t->term_id ] ], // phpcs:ignore WordPress.DB.SlowDBQuery
	] );
}

function sib_v9_help_term( WP_Post $p ): ?WP_Term {
	$terms = get_the_terms( $p, 'sib_help_category' );
	return $terms && ! is_wp_error( $terms ) ? $terms[0] : null;
}

function sib_v9_help_arrow( int $s = 18 ): string {
	return '<svg width="' . $s . '" height="' . $s . '" viewBox="0 0 24 24" fill="none" stroke="#6B6779" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"></path></svg>';
}

/** One article as a row: title, its summary and topic. */
function sib_v9_help_row( WP_Post $p, bool $topic = true ): string {
	$t   = $topic ? sib_v9_help_term( $p ) : null;
	$sum = has_excerpt( $p ) ? get_the_excerpt( $p ) : '';
	return '<a href="' . esc_url( get_permalink( $p ) ) . '" class="row" style="padding:18px 0;font-size:16.5px;border-bottom:1px solid #E7E4EC;border-top:0;align-items:flex-start"><span style="flex:1;min-width:0"><b style="font-weight:600">' . esc_html( get_the_title( $p ) ) . '</b>'
		. ( $sum ? '<span class="mutd" style="display:block;font-size:14.5px;margin-top:4px;line-height:1.5">' . esc_html( $sum ) . '</span>' : '' )
		. ( $t ? '<span class="k mutd" style="display:block;margin-top:8px;font-size:11px">' . esc_html( $t->name ) . '</span>' : '' ) . '</span>' . sib_v9_help_arrow() . '</a>';
}

/** Help search: WordPress search first (best title matches first), then any single word. */
function sib_v9_help_search( string $q ): array {
	$found = get_posts( [ 'post_type' => 'sib_help', 'post_status' => 'publish', 's' => $q, 'numberposts' => 20 ] );
	if ( count( $found ) < 3 ) {
		$ids = wp_list_pluck( $found, 'ID' );
		foreach ( preg_split( '/[^\p{L}\p{N}]+/u', strtolower( $q ) ) as $w ) {
			if ( mb_strlen( $w ) < 4 ) {
				continue;
			}
			foreach ( get_posts( [ 'post_type' => 'sib_help', 'post_status' => 'publish', 's' => $w, 'numberposts' => 10, 'exclude' => $ids ] ) as $p ) {
				$found[] = $p;
				$ids[]   = $p->ID;
			}
		}
	}
	return array_slice( $found, 0, 20 );
}

function sib_v9_help_form( string $q = '', string $max = '620px' ): string {
	return '<form action="/help/#questions" method="get" role="search" style="display:flex;align-items:center;gap:8px;background:#fff;border-radius:999px;padding:6px 6px 6px 22px;width:100%;max-width:' . $max . ';box-shadow:inset 0 0 0 1.5px #E3E0E8">'
		. '<input type="search" name="q" value="' . esc_attr( $q ) . '" placeholder="' . esc_attr__( 'Try “payouts”, “pay on delivery”, “domain”…', 'shopinbos' ) . '" aria-label="' . esc_attr__( 'Search help', 'shopinbos' ) . '" style="flex:1;min-width:0;border:0;outline:0;font-size:16px;background:transparent">'
		. '<button class="btn b-ink" style="height:46px;font-size:15px">' . esc_html__( 'Search', 'shopinbos' ) . '</button></form>';
}

/* ---------- /help/ ---------- */

add_filter( 'sib_v9_fill', function ( string $html, string $slug ): string {
	if ( 'help' !== $slug ) {
		return $html;
	}
	$q      = trim( sanitize_text_field( wp_unslash( $_GET['q'] ?? '' ) ) ); // phpcs:ignore WordPress.Security.NonceVerification
	$topic  = sanitize_title( wp_unslash( $_GET['topic'] ?? '' ) ); // phpcs:ignore WordPress.Security.NonceVerification
	$topics = sib_v9_help_topics();
	if ( ! $topics ) {
		return $html; // nothing seeded yet: keep the earlier fill
	}

	// The design's own icons for its eight topics, by title.
	$icons = [];
	preg_match_all( '#class="bc c-wh lift"[^>]*><span class="ico" style="background:([^"]+)">(<svg[^>]*>(?:(?!</svg>).)*</svg>)</span><div class="H h3"[^>]*>([^<]+)</div>#s', $html, $mm, PREG_SET_ORDER );
	foreach ( $mm as $m ) {
		$icons[ html_entity_decode( $m[3] ) ] = [ $m[1], $m[2] ];
	}
	$own  = sib_v9_help_topic_icons();
	$icon = function ( WP_Term $t ) use ( $icons, $own ): string {
		if ( isset( $icons[ $t->name ] ) ) {
			return '<span class="ico" style="background:' . esc_attr( $icons[ $t->name ][0] ) . '">' . $icons[ $t->name ][1] . '</span>';
		}
		[ $bg, $fg, $paths ] = $own[ $t->slug ] ?? $own['_default'];
		return '<span class="ico" style="background:' . $bg . '"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="' . $fg . '" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' . $paths . '</svg></span>';
	};
	$count = fn( WP_Term $t ) => sprintf( _n( '%d article', '%d articles', $t->count, 'shopinbos' ), $t->count );

	// Topic cards (sellers), linking to each topic page.
	$cards = '';
	foreach ( $topics as $s => $t ) {
		if ( sib_v9_help_is_partner_topic( $s ) ) {
			continue;
		}
		$cards .= '<a href="' . esc_url( get_term_link( $t ) ) . '" class="bc c-wh lift" style="min-height:200px;gap:10px">' . $icon( $t )
			. '<div class="H h3" style="margin-top:auto">' . esc_html( $t->name ) . '</div><p class="p mutd" style="font-size:14.5px">' . esc_html( $t->description ) . '</p>'
			. '<span class="k orgd" style="font-size:11px;margin-top:4px">' . esc_html( $count( $t ) ) . '</span></a>';
	}
	$html = (string) preg_replace_callback( '#(<div class="bn g4 g4m2 rvs"[^>]*>).*?(</div></div></section>)#s', fn( $m ) => $m[1] . $cards . $m[2], $html, 1 );

	// Suppliers and delivery partners: their own band after the topics.
	$band = '';
	foreach ( [ 'supplier-getting-started' => __( 'For suppliers', 'shopinbos' ), 'delivery-partner-getting-started' => __( 'For delivery partners', 'shopinbos' ) ] as $s => $label ) {
		if ( empty( $topics[ $s ] ) ) {
			continue;
		}
		$t     = $topics[ $s ];
		$links = '';
		foreach ( sib_v9_help_posts( $t, 4 ) as $p ) {
			$links .= '<a href="' . esc_url( get_permalink( $p ) ) . '" class="row" style="font-size:15.5px;border-top:1px solid #E7E1D6"><span style="flex:1">' . esc_html( get_the_title( $p ) ) . '</span>' . sib_v9_help_arrow( 16 ) . '</a>';
		}
		$band .= '<div class="bc c-sand" style="gap:14px"><div style="display:flex;gap:14px;align-items:center">' . $icon( $t ) . '<div><span class="k mutd" style="font-size:11px">' . esc_html( $label ) . '</span><div class="H h3">' . esc_html( $t->name ) . '</div></div></div>'
			. '<div>' . $links . '</div><a class="btn b-line" href="' . esc_url( get_term_link( $t ) ) . '" style="align-self:flex-start;height:44px;font-size:14.5px">' . esc_html( sprintf( __( 'All %d articles', 'shopinbos' ), $t->count ) ) . '</a></div>';
	}
	if ( $band ) {
		$band = '<section class="sec" style="background:#fff;padding-top:0"><div class="wrap"><div class="rv" style="display:flex;flex-direction:column;gap:12px;max-width:980px"><h2 class="H h2">' . esc_html__( 'Supply or deliver for shops?', 'shopinbos' ) . '</h2><p class="lead">' . esc_html__( 'How the supplier and delivery partner screens work, step by step.', 'shopinbos' ) . '</p></div><div class="bn g2" style="grid-template-columns:1fr 1fr;margin-top:40px">' . $band . '</div></div></section>';
		$html = (string) preg_replace( '#(<h2 class="H h2">Browse by topic</h2>.*?</section>)#s', '$1' . str_replace( '$', '\$', $band ), $html, 1 );
	}

	// Questions: search results, one topic, or the popular ones.
	$posts = [];
	$head  = __( 'Popular questions', 'shopinbos' );
	$more  = '';
	if ( '' !== $q ) {
		$posts = sib_v9_help_search( $q );
		$head  = sprintf( __( 'Results for “%s”', 'shopinbos' ), $q );
		$more  = '<p class="mutd" style="margin-top:12px;font-size:15px">' . esc_html( sprintf( _n( '%d article', '%d articles', count( $posts ), 'shopinbos' ), count( $posts ) ) ) . ' · <a href="/help/" style="text-decoration:underline">' . esc_html__( 'Clear search', 'shopinbos' ) . '</a></p>';
	} elseif ( $topic && isset( $topics[ $topic ] ) ) {
		$posts = sib_v9_help_posts( $topics[ $topic ] );
		$head  = $topics[ $topic ]->name;
		$more  = '<p style="margin-top:12px"><a class="lnk" href="' . esc_url( get_term_link( $topics[ $topic ] ) ) . '" style="text-decoration:underline">' . esc_html__( 'Open this topic', 'shopinbos' ) . '</a></p>';
	} else {
		foreach ( sib_v9_help_popular() as $s ) {
			$p = get_page_by_path( $s, OBJECT, 'sib_help' );
			if ( $p && 'publish' === $p->post_status ) {
				$posts[] = $p;
			}
		}
		if ( ! $posts ) {
			$posts = get_posts( [ 'post_type' => 'sib_help', 'numberposts' => 8, 'meta_key' => 'sib_popular', 'meta_value' => '1' ] ); // phpcs:ignore WordPress.DB.SlowDBQuery
		}
	}
	$rows = implode( '', array_map( fn( $p ) => sib_v9_help_row( $p, '' !== $q ), $posts ) );
	if ( ! $rows ) {
		$rows = '<p class="p" style="padding:18px 0">' . esc_html__( 'Nothing found. Try another word, browse the topics above, or message us on WhatsApp.', 'shopinbos' ) . '</p>';
	}
	$html = (string) preg_replace( '#<h2 class="H h2"( id="questions")?>[^<]*</h2>(</div><div class="rv" style="border-top:1px solid \#E7E4EC">)#', '<h2 class="H h2" id="questions">' . esc_html( $head ) . '</h2>' . str_replace( '$', '\$', $more ) . '$2', $html, 1 );
	$html = (string) preg_replace_callback( '#(<div class="rv" style="border-top:1px solid \#E7E4EC">).*?(</div></div></div></section>)#s', fn( $m ) => $m[1] . $rows . $m[2], $html, 1 );
	// Searching from the hero lands on the results.
	$html = str_replace( '<form action="/help/" method="get" role="search" class="up d3"', '<form action="/help/#questions" method="get" role="search" class="up d3"', $html );
	return $html;
}, 20, 2 );

/* ---------- /help/<topic>/ ---------- */

function sib_v9_is_help_topic(): bool {
	return is_tax( 'sib_help_category' );
}

function sib_v9_help_topic_page(): ?array {
	$t = get_queried_object();
	if ( ! $t instanceof WP_Term ) {
		return null;
	}
	$posts  = sib_v9_help_posts( $t );
	$topics = sib_v9_help_topics();
	$nav    = '';
	foreach ( $topics as $s => $o ) {
		$on   = $o->term_id === $t->term_id;
		$nav .= '<a href="' . esc_url( get_term_link( $o ) ) . '"' . ( $on ? ' aria-current="page"' : '' ) . ' style="display:flex;justify-content:space-between;gap:10px;padding:9px 12px;border-radius:12px;font-size:14.5px;' . ( $on ? 'background:#16141F;color:#fff;font-weight:700' : 'color:#55516A' ) . '"><span>' . esc_html( $o->name ) . '</span><span style="opacity:.6">' . (int) $o->count . '</span></a>';
	}
	$rows = implode( '', array_map( fn( $p ) => sib_v9_help_row( $p, false ), $posts ) );
	$wa   = function_exists( 'sib_whatsapp_url' ) ? sib_whatsapp_url( 'Hi Shopinbos, I have a question about ' . $t->name ) : '/contact/';

	$h  = '<section style="background:#F6F3EE;padding:64px 0 56px"><div class="wrap" style="display:flex;flex-direction:column;gap:16px">';
	$h .= '<div style="font-size:14px" class="mutd"><a href="/help/">' . esc_html__( 'Help centre', 'shopinbos' ) . '</a> / ' . esc_html( $t->name ) . '</div>';
	$h .= '<h1 class="H up" style="font-size:clamp(40px,5vw,72px);line-height:1.02">' . esc_html( $t->name ) . '</h1>';
	$h .= $t->description ? '<p class="lead up d1" style="max-width:640px">' . esc_html( $t->description ) . '. ' . esc_html( sprintf( _n( '%d article.', '%d articles.', $t->count, 'shopinbos' ), $t->count ) ) . '</p>' : '';
	$h .= '<div style="margin-top:8px;width:100%;max-width:560px">' . sib_v9_help_form() . '</div></div></section>';
	$h .= '<section style="padding:64px 0 120px"><div class="wrap g2" style="display:grid;grid-template-columns:280px 1fr;gap:64px;max-width:1180px">';
	$h .= '<aside class="hm"><span class="k mutd" style="padding:0 12px">' . esc_html__( 'Topics', 'shopinbos' ) . '</span><nav aria-label="' . esc_attr__( 'Help topics', 'shopinbos' ) . '" style="margin-top:12px;display:grid;gap:2px">' . $nav . '</nav></aside>';
	$h .= '<div style="min-width:0;max-width:760px"><h2 class="H h3" style="margin-bottom:8px">' . esc_html__( 'Articles', 'shopinbos' ) . '</h2><div style="border-top:1px solid #E7E4EC">' . ( $rows ?: '<p class="p" style="padding:18px 0">' . esc_html__( 'No articles here yet.', 'shopinbos' ) . '</p>' ) . '</div>';
	$h .= '<div class="ui" style="margin-top:40px;padding:22px;display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;box-shadow:inset 0 0 0 1px #EAE7EF"><b>' . esc_html__( 'Can’t find it?', 'shopinbos' ) . '</b><div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn b-line" href="/help/" style="height:42px;font-size:14px;padding:0 18px">' . esc_html__( 'All topics', 'shopinbos' ) . '</a><a class="btn b-ink" href="' . esc_url( $wa ) . '" style="height:42px;font-size:14px;padding:0 18px">' . esc_html__( 'Chat with us', 'shopinbos' ) . '</a></div></div></div>';
	$h .= '</div></section>';

	return [
		'slug'        => 'help-topic',
		'html'        => sib_v9_wrap( $h, 'help-article' ),
		'title'       => $t->name . ' · Shopinbos Help',
		'description' => sprintf( 'Step-by-step help with %s in Shopinbos Business: %s.', strtolower( $t->name ), strtolower( (string) $t->description ) ),
		'canonical'   => get_term_link( $t ),
		'crumbs'      => [ [ __( 'Help centre', 'shopinbos' ), home_url( '/help/' ) ], [ $t->name, get_term_link( $t ) ] ],
	];
}

/* ---------- /help/<topic>/<article>/ ---------- */

function sib_v9_help_article_v2(): ?array {
	$post = get_queried_object();
	if ( ! $post instanceof WP_Post ) {
		return null;
	}
	[ $body ] = sib_v9_prose( $post );
	$term     = sib_v9_help_term( $post );
	$siblings = $term ? sib_v9_help_posts( $term ) : [];
	$wa       = function_exists( 'sib_whatsapp_url' ) ? sib_whatsapp_url( 'Hi Shopinbos, I have a question about: ' . get_the_title( $post ) ) : '/contact/';
	$cat      = $term ? $term->name : __( 'Help', 'shopinbos' );
	$caturl   = $term ? get_term_link( $term ) : '/help/';

	$side = '';
	foreach ( $siblings as $s ) {
		$on    = $s->ID === $post->ID;
		$side .= '<a href="' . esc_url( get_permalink( $s ) ) . '"' . ( $on ? ' aria-current="page"' : '' ) . ' style="display:block;padding:10px 12px;border-radius:12px;font-size:14.5px;' . ( $on ? 'background:#16141F;color:#fff;font-weight:700' : 'color:#55516A' ) . '">' . esc_html( get_the_title( $s ) ) . '</a>';
	}
	// Related: the rest of the topic, then popular articles from elsewhere.
	$rel = array_values( array_filter( $siblings, fn( $s ) => $s->ID !== $post->ID ) );
	if ( count( $rel ) < 3 ) {
		foreach ( sib_v9_help_popular() as $slug ) {
			$p = get_page_by_path( $slug, OBJECT, 'sib_help' );
			if ( $p && $p->ID !== $post->ID && ! in_array( $p->ID, wp_list_pluck( $rel, 'ID' ), true ) ) {
				$rel[] = $p;
			}
		}
	}
	$related = '';
	foreach ( array_slice( $rel, 0, 4 ) as $s ) {
		$related .= '<a href="' . esc_url( get_permalink( $s ) ) . '" class="row" style="padding:14px 0;font-size:16px;border-top:0;box-shadow:inset 0 -1px 0 #EAE7EF"><span style="flex:1">' . esc_html( get_the_title( $s ) ) . '</span>' . sib_v9_help_arrow( 16 ) . '</a>';
	}
	$lead = has_excerpt( $post ) ? get_the_excerpt( $post ) : '';

	$h  = '<section style="background:#F6F3EE;padding:40px 0"><div class="wrap" style="display:flex;justify-content:space-between;align-items:center;gap:20px;flex-wrap:wrap"><div style="font-size:14px" class="mutd"><a href="/help/">' . esc_html__( 'Help centre', 'shopinbos' ) . '</a> / <a href="' . esc_url( $caturl ) . '">' . esc_html( $cat ) . '</a></div>';
	$h .= '<div style="flex:1;max-width:480px;min-width:260px">' . sib_v9_help_form( '', '480px' ) . '</div></div></section>';
	$h .= '<section style="padding:72px 0 120px"><div class="wrap g2" style="display:grid;grid-template-columns:280px 1fr;gap:72px;max-width:1180px">';
	$h .= '<aside class="hm"><a class="k mutd" href="' . esc_url( $caturl ) . '" style="padding:0 12px">' . esc_html( $cat ) . '</a><nav aria-label="' . esc_attr__( 'In this topic', 'shopinbos' ) . '" style="margin-top:12px;display:grid;gap:2px">' . $side . '</nav></aside>';
	$h .= '<article class="v9-help" style="min-width:0;max-width:720px"><h1 class="H" style="font-size:clamp(34px,4vw,56px);line-height:1.05">' . esc_html( get_the_title( $post ) ) . '</h1><p class="mutd" style="font-size:14px;margin-top:14px">' . esc_html( sprintf( 'Updated %s · %d min read', get_the_modified_date( 'j F Y', $post ), sib_v9_minutes( $post ) ) ) . '</p>';
	$h .= $lead ? '<p class="lead" style="margin-top:22px;color:#16141F">' . esc_html( $lead ) . '</p>' : '';
	$h .= '<div class="v9-prose" style="margin-top:24px">' . $body . '</div>';
	$h .= '<div class="ui help-vote" data-post="' . (int) $post->ID . '" data-slug="' . esc_attr( $post->post_name ) . '" data-topic="' . esc_attr( $term ? $term->slug : '' ) . '" data-endpoint="' . esc_url( admin_url( 'admin-post.php?action=sib_help_vote' ) ) . '" style="margin-top:40px;padding:22px;display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;box-shadow:inset 0 0 0 1px #EAE7EF">'
		. '<b class="hv-q">' . esc_html__( 'Was this helpful?', 'shopinbos' ) . '</b><div style="display:flex;gap:8px;flex-wrap:wrap">'
		. '<button type="button" class="btn b-line" data-helpful="1" style="height:42px;font-size:14px;padding:0 18px">' . esc_html__( 'Yes', 'shopinbos' ) . '</button>'
		. '<button type="button" class="btn b-line" data-helpful="0" style="height:42px;font-size:14px;padding:0 18px">' . esc_html__( 'No', 'shopinbos' ) . '</button>'
		. '<a class="btn b-ink" href="' . esc_url( $wa ) . '" rel="noopener" style="height:42px;font-size:14px;padding:0 18px">' . esc_html__( 'Chat with us', 'shopinbos' ) . '</a></div></div>';
	$h .= '<script>(function(){var b=document.currentScript.previousElementSibling;b.addEventListener("click",function(e){var t=e.target.closest("[data-helpful]");if(!t||b.dataset.done)return;b.dataset.done=1;var yes=t.dataset.helpful==="1";'
		. 'try{if(window.posthog&&window.posthog.capture)window.posthog.capture("help_article_feedback",{helpful:yes,article:b.dataset.slug,topic:b.dataset.topic});}catch(x){}'
		. 'try{var f=new FormData();f.append("post",b.dataset.post);f.append("helpful",yes?"1":"");fetch(b.dataset.endpoint,{method:"POST",body:f,credentials:"same-origin"});}catch(x){}'
		. 'b.querySelectorAll("[data-helpful]").forEach(function(x){x.remove();});b.querySelector(".hv-q").textContent=yes?' . wp_json_encode( __( 'Thanks for telling us.', 'shopinbos' ) ) . ':' . wp_json_encode( __( 'Sorry about that. A person can help on WhatsApp.', 'shopinbos' ) ) . ';});})();</script>';
	$h .= $related ? '<div style="margin-top:40px"><span class="k mutd">' . esc_html__( 'Related', 'shopinbos' ) . '</span><div style="margin-top:8px">' . $related . '</div></div>' : '';
	$h .= '</article></div></section>';

	// HowTo (numbered steps) and FAQPage (questions) for search engines: the plugin skips them on V9 pages.
	add_filter( 'sib_schema_graph', function ( array $graph ) use ( $post ): array {
		$blocks = parse_blocks( $post->post_content );
		if ( function_exists( 'sib_schema_steps' ) && ( $steps = sib_schema_steps( $blocks ) ) && count( $steps ) >= 2 ) {
			$img     = preg_match( '#<img src="([^"]+)"#', $post->post_content, $m ) ? $m[1] : null;
			$graph[] = array_filter( [ '@type' => 'HowTo', 'name' => get_the_title( $post ), 'description' => has_excerpt( $post ) ? get_the_excerpt( $post ) : null, 'image' => $img, 'step' => $steps, 'inLanguage' => 'en-NG' ] );
		}
		if ( function_exists( 'sib_schema_faq' ) && count( $faq = sib_schema_faq( $blocks ) ) >= 2 ) {
			$graph[] = [ '@type' => 'FAQPage', 'mainEntity' => $faq ];
		}
		return $graph;
	} );

	return [
		'slug'        => 'help-article',
		'html'        => sib_v9_wrap( $h, 'help-article' ),
		'title'       => get_the_title( $post ) . ' · Shopinbos Help',
		'description' => $lead ? wp_html_excerpt( $lead, 155, '…' ) : null,
		'crumbs'      => array_values( array_filter( [ [ __( 'Help centre', 'shopinbos' ), home_url( '/help/' ) ], $term ? [ $term->name, get_term_link( $term ) ] : null ] ) ),
	];
}

add_filter( 'sib_v9_content_templates', function ( array $t ): array {
	$t['sib_v9_is_help']       = 'sib_v9_help_article_v2';
	$t['sib_v9_is_help_topic'] = 'sib_v9_help_topic_page';
	return $t;
}, 20 );
