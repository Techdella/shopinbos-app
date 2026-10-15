<?php
/**
 * JSON-LD. One @graph per page:
 *   Organization + WebSite (everywhere, unless an SEO plugin already prints them)
 *   SoftwareApplication (home, pricing) · FAQPage (pages with question blocks)
 *   BlogPosting (blog) · HowTo (help articles with numbered steps)
 *   Product (marketplace products) · BreadcrumbList (everywhere)
 */

defined( 'ABSPATH' ) || exit;

add_action( 'wp_head', function () {
	$graph = sib_schema_graph();
	if ( $graph ) {
		echo '<script type="application/ld+json">' . wp_json_encode( [ '@context' => 'https://schema.org', '@graph' => $graph ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "</script>\n";
	}
}, 20 );

function sib_schema_graph(): array {
	$home  = home_url( '/' );
	$org   = [ '@id' => $home . '#org' ];
	$plug  = sib_seo_plugin();
	$v     = sib_virtual();
	$graph = [];

	if ( ! $plug ) {
		$graph[] = [
			'@type'  => 'Organization', '@id' => $home . '#org', 'name' => 'Shopinbos', 'url' => $home,
			'logo'   => sib_absolute( sib_img( 'logo-dark.png' ) ),
			'sameAs' => array_values( array_filter( (array) apply_filters( 'sib_schema_same_as', [] ) ) ),
			'areaServed' => 'NG',
		];
		$graph[] = [
			'@type' => 'WebSite', '@id' => $home . '#website', 'url' => $home, 'name' => 'Shopinbos', 'inLanguage' => 'en-NG', 'publisher' => $org,
			'potentialAction' => [ '@type' => 'SearchAction', 'target' => home_url( '/?s={search_term_string}' ), 'query-input' => 'required name=search_term_string' ],
		];
	}

	if ( is_front_page() || is_page( 'pricing' ) ) {
		$app = [
			'@type' => 'SoftwareApplication', 'name' => 'Shopinbos', 'applicationCategory' => 'BusinessApplication',
			'operatingSystem' => 'Android, iOS, Web', 'url' => $home, 'publisher' => $org,
			'description' => 'Sell online and reach your customers: find products, sell in your own store and on WhatsApp, Instagram, TikTok, Facebook and Google, run your store, talk to customers and get paid.',
		];
		$price = preg_replace( '/[^0-9.]/', '', (string) sib_setting( 'price_start_month' ) );
		if ( $price ) {
			$app['offers'] = [ '@type' => 'Offer', 'price' => $price, 'priceCurrency' => 'NGN' ];
		}
		$graph[] = $app;
	}

	if ( $v && 'product' === ( $v['view'] ?? '' ) ) {
		$p    = $v['product'];
		$node = [
			'@type' => 'Product', 'name' => $p['name'], 'url' => $p['url'], 'description' => $v['description'],
			'image' => $p['images'] ?: null, 'category' => $p['category']['name'] ?? null,
			'brand' => $p['sup_name'] ? [ '@type' => 'Brand', 'name' => $p['sup_name'] ] : null,
		];
		if ( empty( $v['prices_hidden'] ) && $p['cost'] > 0 ) {
			$node['offers'] = [
				'@type' => 'Offer', 'price' => (string) $p['cost'], 'priceCurrency' => $p['currency'], 'url' => $p['url'],
				'availability' => $p['in_stock'] ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
				'seller' => [ '@type' => 'Organization', 'name' => $p['sup_name'] ],
				'businessFunction' => 'http://purl.org/goodrelations/v1#Sell',
			];
		}
		$graph[] = array_filter( $node, fn( $x ) => null !== $x );
	}

	if ( is_singular() && ! $v ) {
		$post   = get_queried_object();
		$blocks = parse_blocks( $post->post_content );

		$faq = sib_schema_faq( $blocks );
		if ( count( $faq ) >= 2 ) {
			$graph[] = [ '@type' => 'FAQPage', 'mainEntity' => $faq ];
			$GLOBALS['sib_faq_in_head'] = true;
		}
		if ( is_singular( 'post' ) && ! $plug ) {
			$author  = get_userdata( (int) $post->post_author );
			$graph[] = array_filter( [
				'@type' => 'BlogPosting', 'headline' => get_the_title( $post ), 'url' => get_permalink( $post ),
				'datePublished' => get_post_time( 'c', true, $post ), 'dateModified' => get_post_modified_time( 'c', true, $post ),
				'author' => $author ? [ '@type' => 'Person', 'name' => $author->display_name, 'url' => get_author_posts_url( $author->ID ) ] : null,
				'image' => get_the_post_thumbnail_url( $post, 'large' ) ?: null, 'publisher' => $org, 'inLanguage' => 'en-NG',
			] );
		}
		if ( is_singular( [ 'post', 'sib_help', 'sib_resource' ] ) && ( $by = get_post_meta( $post->ID, 'sib_reviewed_by', true ) ) ) {
			$graph[] = [ '@type' => 'WebPage', '@id' => get_permalink( $post ) . '#page', 'url' => get_permalink( $post ), 'reviewedBy' => [ '@type' => 'Person', 'name' => $by ], 'lastReviewed' => get_post_meta( $post->ID, 'sib_reviewed', true ) ?: null ];
		}
		if ( ( $steps = sib_schema_steps( $blocks ) ) && ( is_singular( 'sib_help' ) || preg_match( '/"schema":true/', $post->post_content ) ) ) {
			$graph[] = [ '@type' => 'HowTo', 'name' => get_the_title( $post ), 'step' => $steps ];
		}
	}

	if ( ! $plug || $v ) {
		$trail = sib_breadcrumb_trail();
		if ( $trail && ! is_front_page() ) {
			$items = [ [ '@type' => 'ListItem', 'position' => 1, 'name' => 'Home', 'item' => $home ] ];
			foreach ( $trail as $i => [ $name, $url ] ) {
				$items[] = [ '@type' => 'ListItem', 'position' => $i + 2, 'name' => wp_strip_all_tags( $name ), 'item' => is_string( $url ) ? $url : '' ];
			}
			$graph[] = [ '@type' => 'BreadcrumbList', 'itemListElement' => $items ];
		}
	}
	return apply_filters( 'sib_schema_graph', $graph );
}

/** Questions from core/details blocks anywhere in the content (FAQ patterns use them). */
function sib_schema_faq( array $blocks ): array {
	$out = [];
	foreach ( $blocks as $b ) {
		if ( in_array( $b['blockName'], [ 'shopinbos/faq', 'shopinbos/compare' ], true ) ) {
			foreach ( sib_faq_items( (string) ( $b['attrs']['items'] ?? $b['attrs']['faq'] ?? '' ) ) as [ $q, $ans ] ) {
				$out[] = [ '@type' => 'Question', 'name' => wp_strip_all_tags( $q ), 'acceptedAnswer' => [ '@type' => 'Answer', 'text' => wp_strip_all_tags( $ans ) ] ];
			}
		}
		if ( 'core/details' === $b['blockName'] ) {
			$q = trim( wp_strip_all_tags( $b['attrs']['summary'] ?? ( preg_match( '#<summary>(.*?)</summary>#s', $b['innerHTML'], $m ) ? $m[1] : '' ) ) );
			$a = trim( wp_strip_all_tags( implode( ' ', array_map( fn( $ib ) => render_block( $ib ), $b['innerBlocks'] ) ) ) );
			if ( $q && $a ) {
				$out[] = [ '@type' => 'Question', 'name' => $q, 'acceptedAnswer' => [ '@type' => 'Answer', 'text' => $a ] ];
			}
		}
		if ( ! empty( $b['innerBlocks'] ) ) {
			$out = array_merge( $out, sib_schema_faq( $b['innerBlocks'] ) );
		}
	}
	return $out;
}

/** Steps from the first numbered list in a help article. */
function sib_schema_steps( array $blocks ): array {
	foreach ( $blocks as $b ) {
		if ( 'shopinbos/steps' === $b['blockName'] && ( ! empty( $b['attrs']['schema'] ) || is_singular( 'sib_help' ) ) ) {
			$steps = [];
			foreach ( sib_lines( (string) ( $b['attrs']['items'] ?? '' ) ) as $i => $line ) {
				[ $h, $d ] = sib_pair( $line );
				$steps[]   = [ '@type' => 'HowToStep', 'position' => $i + 1, 'name' => wp_strip_all_tags( $h ), 'text' => wp_strip_all_tags( $d ?: $h ) ];
			}
			return $steps;
		}
		if ( 'core/list' === $b['blockName'] && ! empty( $b['attrs']['ordered'] ) ) {
			$steps = [];
			foreach ( $b['innerBlocks'] as $i => $li ) {
				$text = trim( wp_strip_all_tags( render_block( $li ) ) );
				if ( $text ) {
					$steps[] = [ '@type' => 'HowToStep', 'position' => $i + 1, 'text' => $text ];
				}
			}
			return $steps;
		}
	}
	return [];
}

/* ---------- Questions in designed sections (home, pricing, features, compare, contact, waitlist) ----------
   Those sections are not core blocks, so collect their question/answer pairs as they render and print one
   FAQPage at the end of the page. Answer engines (Google, Bing, ChatGPT search) read it. */
function sib_faq_collect( string $html ): void {
	if ( ! str_contains( $html, 'item.toggle' ) ) {
		return;
	}
	if ( preg_match_all( '#<button[^>]*data-cv="item\.toggle"[^>]*>(.*?)<span[^>]*>[^<]*</span>\s*</button>\s*<p[^>]*class="p qa-a"[^>]*>(.*?)</p>#s', $html, $m, PREG_SET_ORDER ) ) {
		foreach ( $m as [ , $q, $a ] ) {
			$q = trim( html_entity_decode( wp_strip_all_tags( $q ), ENT_QUOTES, 'UTF-8' ) );
			$a = trim( html_entity_decode( wp_strip_all_tags( $a ), ENT_QUOTES, 'UTF-8' ) );
			if ( $q && $a && ! str_contains( $q, '{{' ) && ! str_contains( $a, '{{' ) ) {
				$GLOBALS['sib_faq_pairs'][ $q ] = $a;
			}
		}
	}
}
add_filter( 'render_block', function ( $html, $block ) {
	if ( in_array( $block['blockName'], [ 'shopinbos/canvas', 'shopinbos/contact-page', 'shopinbos/coming-soon', 'shopinbos/investors-page' ], true ) ) {
		sib_faq_collect( (string) $html );
	}
	return $html;
}, 20, 2 );
add_action( 'wp_footer', function () {
	$pairs = $GLOBALS['sib_faq_pairs'] ?? [];
	if ( count( $pairs ) < 2 || ! empty( $GLOBALS['sib_faq_in_head'] ) || ! is_singular() ) {
		return;
	}
	$items = [];
	foreach ( array_slice( $pairs, 0, 12, true ) as $q => $a ) {
		$items[] = [ '@type' => 'Question', 'name' => $q, 'acceptedAnswer' => [ '@type' => 'Answer', 'text' => $a ] ];
	}
	echo '<script type="application/ld+json">' . wp_json_encode( [ '@context' => 'https://schema.org', '@type' => 'FAQPage', 'url' => get_permalink(), 'mainEntity' => $items ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "</script>\n";
}, 5 );
