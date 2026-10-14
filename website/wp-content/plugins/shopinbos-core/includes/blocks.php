<?php
/**
 * Dynamic blocks. All render on the server (fast, cacheable, crawlable). In the editor they show
 * a live preview with settings generated from their attributes (assets/js/editor.js, no build step).
 */

defined( 'ABSPATH' ) || exit;

function sib_block_defs(): array {
	return [
		'product-strip'    => [ __( 'Marketplace products', 'shopinbos' ), 'sib_render_product_strip', [ 'count' => [ 'number', 6 ], 'columns' => [ 'number', 3 ], 'category' => [ 'string', '' ], 'sort' => [ 'string', 'trending', [ 'trending', 'newest', 'margin', 'price_low' ] ] ] ],
		'supplier-grid'    => [ __( 'Suppliers', 'shopinbos' ), 'sib_render_supplier_grid', [ 'count' => [ 'number', 6 ] ] ],
		'partner-grid'     => [ __( 'Delivery partners', 'shopinbos' ), 'sib_render_partner_grid', [ 'zone' => [ 'string', '' ], 'showAreas' => [ 'boolean', true ] ] ],
		'template-gallery' => [ __( 'Store templates', 'shopinbos' ), 'sib_render_template_gallery', [ 'teaser' => [ 'boolean', false ] ] ],
		'template-detail'  => [ __( 'Store template preview', 'shopinbos' ), 'sib_render_template_detail', [] ],
		'pricing-plans'    => [ __( 'Pricing plans', 'shopinbos' ), 'sib_render_pricing_plans', [] ],
		'breadcrumbs'      => [ __( 'Breadcrumbs', 'shopinbos' ), 'sib_render_breadcrumbs', [ 'band' => [ 'boolean', false ] ] ],
		'article-meta'     => [ __( 'Byline and dates', 'shopinbos' ), 'sib_render_article_meta', [ 'variant' => [ 'string', 'byline', [ 'byline', 'updated', 'checked' ] ] ] ],
		'toc'              => [ __( 'Table of contents', 'shopinbos' ), 'sib_render_toc', [] ],
		'author-box'       => [ __( 'Author box', 'shopinbos' ), 'sib_render_author_box', [] ],
		'related'          => [ __( 'Related pages', 'shopinbos' ), 'sib_render_related', [ 'count' => [ 'number', 3 ] ] ],
		'term-chips'       => [ __( 'Category chips', 'shopinbos' ), 'sib_render_term_chips', [] ],
		'integration-tiles' => [ __( 'Integration tiles', 'shopinbos' ), 'sib_render_integration_tiles', [] ],
		'mascot'           => [ __( 'Rex or Peggy', 'shopinbos' ), 'sib_render_mascot', [ 'who' => [ 'string', 'rex', [ 'rex', 'rex-side', 'peggy', 'peggy-wave' ] ], 'size' => [ 'number', 120 ] ] ],
		'lead-form'        => [ __( 'Email sign-up form', 'shopinbos' ), 'sib_render_lead_form', [ 'kind' => [ 'string', 'newsletter', [ 'newsletter', 'contact' ] ], 'heading' => [ 'string', '' ] ] ],
		'download-form'    => [ __( 'Guide download form', 'shopinbos' ), 'sib_render_download_form', [ 'resource' => [ 'number', 0 ] ] ],
		'tool'             => [ __( 'Free tool', 'shopinbos' ), 'sib_render_tool', [ 'tool' => [ 'string', '', array_merge( [ '' ], array_keys( sib_tools_list() ) ) ] ] ],
		'help-search'      => [ __( 'Help search', 'shopinbos' ), 'sib_render_help_search', [] ],
		'help-categories'  => [ __( 'Help categories', 'shopinbos' ), 'sib_render_help_categories', [] ],
		'help-nav'         => [ __( 'Help sidebar', 'shopinbos' ), 'sib_render_help_nav', [] ],
		'help-vote'        => [ __( 'Was this helpful?', 'shopinbos' ), 'sib_render_help_vote', [] ],
	];
}

add_action( 'init', function () {
	wp_register_script( 'sib-editor', SIB_CORE_URL . 'assets/js/editor.js', [ 'wp-blocks', 'wp-element', 'wp-components', 'wp-block-editor', 'wp-server-side-render', 'wp-i18n' ], SIB_CORE_VERSION, true );
	$client = [];
	foreach ( sib_block_defs() as $name => [ $title, $cb, $attrs ] ) {
		$schema = [];
		foreach ( $attrs as $k => $def ) {
			$schema[ $k ] = [ 'type' => $def[0], 'default' => $def[1] ];
			if ( isset( $def[2] ) ) {
				$schema[ $k ]['enum'] = $def[2];
			}
		}
		register_block_type( 'shopinbos/' . $name, [
			'api_version'     => 3,
			'title'           => $title,
			'category'        => 'widgets',
			'attributes'      => $schema,
			'render_callback' => $cb,
			'editor_script'   => 'sib-editor',
			'supports'        => [ 'html' => false ],
		] );
		$client[] = [ 'name' => 'shopinbos/' . $name, 'title' => $title, 'attributes' => $schema ];
	}
	wp_add_inline_script( 'sib-editor', 'window.SIB_BLOCKS = ' . wp_json_encode( $client ) . ';', 'before' );
} );

/* The page's chosen sign-up intent replaces plain "Start your shop" links (/go/signup with no intent). */
add_filter( 'render_block_core/button', function ( $html ) {
	if ( ! is_singular() || ! str_contains( $html, '/go/signup' ) ) {
		return $html;
	}
	$intent = (string) get_post_meta( get_the_ID(), 'sib_cta_intent', true );
	if ( ! $intent ) {
		return $html;
	}
	return preg_replace_callback( '#href="([^"]*/go/signup(?:\?[^"]*)?)"#', function ( $m ) {
		return str_contains( html_entity_decode( $m[1] ), 'intent=' ) ? $m[0] : 'href="' . esc_url( sib_post_cta_url() ) . '"';
	}, $html );
} );

/* ---------- Marketplace blocks ---------- */

function sib_render_product_strip( array $a ): string {
	$res = sib_api_get( '/products', array_filter( [ 'limit' => max( 1, min( 12, (int) $a['count'] ) ), 'sort' => $a['sort'] ?: 'trending', 'category' => $a['category'] ?: null ] ) );
	if ( ! $res['ok'] || ! $res['data'] ) {
		return is_admin() || wp_is_json_request() ? '<p class="p">' . esc_html__( 'No products to show yet.', 'shopinbos' ) . '</p>' : '';
	}
	$cols = max( 2, min( 4, (int) $a['columns'] ) );
	$out  = '<div class="g' . $cols . '">';
	foreach ( $res['data'] as $i => $row ) {
		$out .= sib_view( 'parts/product-card', [ 'p' => sib_product_vm( $row ), 'hide' => $res['prices_hidden'], 'lazy' => true ] );
	}
	return $out . '</div>';
}

function sib_render_supplier_grid( array $a ): string {
	$res = sib_api_get( '/suppliers', [ 'limit' => max( 1, min( 24, (int) $a['count'] ) ) ] );
	if ( ! $res['ok'] || ! $res['data'] ) {
		return '';
	}
	return '<div style="margin-top:32px">' . sib_view( 'parts/supplier-cards', [ 'suppliers' => array_map( 'sib_supplier_vm', $res['data'] ) ] )
		. '<p style="margin-top:24px"><a class="lnk arrow" href="' . esc_url( home_url( '/suppliers/' ) ) . '">' . esc_html__( 'See all suppliers', 'shopinbos' ) . '</a></p></div>';
}

function sib_render_partner_grid( array $a ): string {
	$res = sib_api_get( '/logistics/partners', array_filter( [ 'limit' => 60, 'zone' => $a['zone'] ?: null ] ) );
	if ( ! $res['ok'] || ! $res['data'] ) {
		return '';
	}
	$partners = array_map( 'sib_partner_vm', $res['data'] );
	$zones    = [];
	foreach ( $partners as $l ) {
		foreach ( $l['zone_keys'] as $z ) {
			$zones[ $z ] = sib_zone_label( $z );
		}
	}
	$order = array_flip( [ 'lagos', 'abuja', 'ibadan', 'port-harcourt', 'kano', 'enugu' ] );
	uksort( $zones, fn( $x, $y ) => ( $order[ $x ] ?? 99 ) <=> ( $order[ $y ] ?? 99 ) ?: strcmp( $x, $y ) );
	$id  = wp_unique_id( 'sib-partners-' );
	$out = '';
	if ( ! empty( $a['showAreas'] ) && ! $a['zone'] && count( $zones ) > 1 ) {
		$out .= '<div class="chips" role="group" aria-label="' . esc_attr__( 'Filter by area', 'shopinbos' ) . '" data-filter="' . esc_attr( $id ) . '" style="margin:26px 0 20px">'
			. '<button type="button" class="chip" data-value="all" aria-pressed="true">' . esc_html__( 'Everywhere', 'shopinbos' ) . '</button>';
		foreach ( $zones as $k => $label ) {
			$out .= '<button type="button" class="chip" data-value="' . esc_attr( $k ) . '" aria-pressed="false">' . esc_html( $label ) . '</button>';
		}
		$out .= '</div>';
	}
	$out .= '<div class="g3" id="' . esc_attr( $id ) . '"' . ( $a['zone'] ? ' style="margin-top:26px"' : '' ) . '>';
	foreach ( $partners as $l ) {
		$out .= '<a class="card" data-tags="' . esc_attr( implode( ' ', $l['zone_keys'] ) ) . '" href="' . esc_url( $l['url'] ) . '" style="padding:20px;display:flex;flex-direction:column;gap:10px;text-decoration:none;color:inherit">'
			. '<div class="row between"><b style="font-size:16.5px">' . esc_html( $l['name'] ) . '</b>' . ( $l['rating'] ? '<span style="font-size:13px;font-weight:700">★ ' . esc_html( $l['rating'] ) . '</span>' : '' ) . '</div>'
			. '<span style="font-size:14px;color:#6B6779">' . esc_html( $l['speed'] ?: implode( ', ', $l['types'] ) ) . '</span>'
			. '<span class="tag ' . ( $l['cod'] ? 'tag-ok' : '' ) . '" style="align-self:flex-start">' . ( $l['cod'] ? esc_html__( 'Pay on delivery', 'shopinbos' ) : esc_html__( 'Prepaid only', 'shopinbos' ) ) . '</span></a>';
	}
	return $out . '</div>';
}

/* ---------- Store templates ---------- */

function sib_template_vm( WP_Post $t ): array {
	$key = (string) get_post_meta( $t->ID, 'sib_tpl_key', true ) ?: $t->post_name;
	return [
		'name' => get_the_title( $t ),
		'key'  => $key,
		'kind' => (string) get_post_meta( $t->ID, 'sib_tpl_kind', true ),
		'bg'   => (string) get_post_meta( $t->ID, 'sib_tpl_bg', true ) ?: '#F3F3F3',
		'ink'  => (string) get_post_meta( $t->ID, 'sib_tpl_ink', true ) ?: '#121212',
		'img'  => (string) get_the_post_thumbnail_url( $t, 'large' ),
		'url'  => get_permalink( $t ),
		'demo' => (string) get_post_meta( $t->ID, 'sib_tpl_demo', true ),
		'use'  => sib_go_url( 'template', [ 'template' => $key ] ),
	];
}

function sib_template_card( array $t, bool $teaser ): string {
	$img = $t['img'] ? '<img src="' . esc_url( $t['img'] ) . '" alt="' . esc_attr( sprintf( __( '%s template preview', 'shopinbos' ), $t['name'] ) ) . '" width="400" height="' . ( $teaser ? 500 : 300 ) . '" loading="lazy" style="width:100%;aspect-ratio:' . ( $teaser ? '4/5' : '4/3' ) . ';object-fit:cover;border-radius:' . ( $teaser ? 12 : 14 ) . 'px;display:block">' : '';
	if ( $teaser ) {
		return '<a href="' . esc_url( $t['url'] ) . '" style="text-decoration:none;color:inherit;display:flex;flex-direction:column;gap:10px">'
			. '<span style="display:block;background:' . esc_attr( $t['bg'] ) . ';border-radius:22px;padding:14px">'
			. '<span style="display:flex;justify-content:space-between;color:' . esc_attr( $t['ink'] ) . ';font-weight:800;font-size:13px;margin-bottom:10px"><span>' . esc_html( $t['name'] ) . '</span><span style="opacity:0.6">Shop</span></span>' . $img . '</span>'
			. '<span style="font-weight:800;font-size:15px">' . esc_html( $t['name'] ) . ' <span style="color:#6B6779;font-weight:600">· ' . esc_html( $t['kind'] ) . '</span></span></a>';
	}
	return '<div data-tags="' . esc_attr( sanitize_title( $t['kind'] ) ) . '" style="display:flex;flex-direction:column;gap:12px">'
		. '<a href="' . esc_url( $t['url'] ) . '" style="background:' . esc_attr( $t['bg'] ) . ';border-radius:26px;padding:18px;display:flex;flex-direction:column;gap:12px;text-decoration:none">'
		. '<span style="display:flex;justify-content:space-between;color:' . esc_attr( $t['ink'] ) . ';font-weight:800;font-size:14px"><span>' . esc_html( $t['name'] ) . '</span><span style="opacity:0.65;font-weight:600">Shop · About · Bag</span></span>'
		. $img . '<span style="color:' . esc_attr( $t['ink'] ) . ';font-weight:800;font-size:20px">' . esc_html__( 'New season is here', 'shopinbos' ) . '</span></a>'
		. '<div class="row between" style="gap:10px"><span><b style="font-size:16px">' . esc_html( $t['name'] ) . '</b><span style="color:#6B6779;font-size:14px"> · ' . esc_html( $t['kind'] ) . '</span></span>'
		. '<a class="btn btn-ink btn-s" href="' . esc_url( $t['use'] ) . '">' . esc_html__( 'Use this', 'shopinbos' ) . '</a></div></div>';
}

function sib_render_template_gallery( array $a ): string {
	$teaser = ! empty( $a['teaser'] );
	$posts  = get_posts( [ 'post_type' => 'sib_template', 'numberposts' => $teaser ? 4 : 48, 'orderby' => [ 'menu_order' => 'ASC', 'date' => 'ASC' ], 'post_status' => 'publish' ] );
	if ( ! $posts ) {
		return '';
	}
	$items = array_map( 'sib_template_vm', $posts );
	if ( $teaser ) {
		return '<div class="g4">' . implode( '', array_map( fn( $t ) => sib_template_card( $t, true ), $items ) ) . '</div>';
	}
	$kinds = array_unique( array_filter( array_map( fn( $t ) => $t['kind'], $items ) ) );
	$id    = wp_unique_id( 'sib-tpl-' );
	$out   = '<div class="chips" role="group" aria-label="' . esc_attr__( 'Filter templates', 'shopinbos' ) . '" data-filter="' . esc_attr( $id ) . '">'
		. '<button type="button" class="chip" data-value="all" aria-pressed="true">' . esc_html__( 'All', 'shopinbos' ) . '</button>';
	foreach ( $kinds as $k ) {
		$out .= '<button type="button" class="chip" data-value="' . esc_attr( sanitize_title( $k ) ) . '" aria-pressed="false">' . esc_html( $k ) . '</button>';
	}
	return $out . '</div><div class="g3" id="' . esc_attr( $id ) . '">' . implode( '', array_map( fn( $t ) => sib_template_card( $t, false ), $items ) ) . '</div>';
}

function sib_render_template_detail(): string {
	$post = get_post();
	if ( ! $post || 'sib_template' !== $post->post_type ) {
		return '';
	}
	$t = sib_template_vm( $post );
	return '<div class="split split-top"><div style="background:' . esc_attr( $t['bg'] ) . ';border-radius:28px;padding:22px">'
		. ( $t['img'] ? '<img src="' . esc_url( $t['img'] ) . '" alt="" style="width:100%;border-radius:18px;display:block" fetchpriority="high">' : '' ) . '</div>'
		. '<div class="col-22"><p class="eyebrow">' . esc_html( $t['kind'] ?: __( 'Store template', 'shopinbos' ) ) . '</p><h1 class="disp h2">' . esc_html( $t['name'] ) . '</h1>'
		. '<p class="lead">' . esc_html( get_the_excerpt( $post ) ) . '</p>'
		. '<ul class="ticks"><li>' . esc_html__( 'Works on phones first and loads fast on 4G', 'shopinbos' ) . '</li><li>' . esc_html__( 'Pay on delivery and WhatsApp ordering built in', 'shopinbos' ) . '</li><li>' . esc_html__( 'Rex fits it to your logo and colours', 'shopinbos' ) . '</li></ul>'
		. '<div class="row wrapflex"><a class="btn btn-acc" href="' . esc_url( $t['use'] ) . '">' . esc_html__( 'Use this template', 'shopinbos' ) . sib_icon( 'arrow', 16 ) . '</a>'
		. ( $t['demo'] ? '<a class="btn btn-ghost" href="' . esc_url( $t['demo'] ) . '" rel="noopener">' . esc_html__( 'See a live store', 'shopinbos' ) . '</a>' : '' ) . '</div></div></div>';
}

/* ---------- Pricing ---------- */

function sib_render_pricing_plans(): string {
	$n     = (string) sib_setting( 'starter_products' );
	$plans = [
		[ 'start', __( 'Starter', 'shopinbos' ), __( 'For new shops getting their first orders', 'shopinbos' ), false, [ __( 'Store on yourname.shopinbos.com', 'shopinbos' ), __( 'Rex store builder and brand kit', 'shopinbos' ), __( 'WhatsApp and Instagram inbox', 'shopinbos' ), __( 'Pay on delivery and riders', 'shopinbos' ), sprintf( __( 'Up to %s products', 'shopinbos' ), $n ), sprintf( __( '%s commission on sales', 'shopinbos' ), sib_setting( 'fee_commission' ) ) ] ],
		[ 'grow', __( 'Growth', 'shopinbos' ), __( 'For shops selling every day', 'shopinbos' ), true, [ __( 'Everything in Starter', 'shopinbos' ), __( 'Your own domain', 'shopinbos' ), __( 'Peggy auto-replies and daily brief', 'shopinbos' ), __( 'Dropship and wholesale from suppliers', 'shopinbos' ), __( 'Broadcasts, discounts and affiliates', 'shopinbos' ), __( '3 staff accounts', 'shopinbos' ) ] ],
		[ 'pro', __( 'Pro', 'shopinbos' ), __( 'For brands with a team', 'shopinbos' ), false, [ __( 'Everything in Growth', 'shopinbos' ), __( 'Advanced store builder', 'shopinbos' ), __( 'Sell on TikTok Shop, Google and marketplaces', 'shopinbos' ), __( 'Ads managed by Peggy', 'shopinbos' ), __( 'Imports from China', 'shopinbos' ), __( 'Unlimited staff', 'shopinbos' ) ] ],
	];
	$out = '<div class="seg" role="group" aria-label="' . esc_attr__( 'Billing', 'shopinbos' ) . '" data-toggle="billing" style="align-self:center;width:auto">'
		. '<button type="button" class="segb" data-value="month" aria-pressed="true">' . esc_html__( 'Monthly', 'shopinbos' ) . '</button>'
		. '<button type="button" class="segb" data-value="year" aria-pressed="false">' . esc_html__( 'Yearly · 2 months free', 'shopinbos' ) . '</button></div>';
	$out .= '<div class="g3" style="width:100%;align-items:stretch">';
	foreach ( $plans as [ $key, $name, $who, $best, $feats ] ) {
		$bg   = $best ? '#16141F' : '#FFFFFF';
		$fg   = $best ? '#FFFFFF' : '#16141F';
		$sub  = $best ? '#C9C6D3' : '#6B6779';
		$out .= '<div style="background:' . $bg . ';color:' . $fg . ';border:1px solid ' . ( $best ? '#16141F' : '#ECEAF2' ) . ';border-radius:28px;padding:28px;display:flex;flex-direction:column;gap:18px">'
			. '<div style="display:flex;flex-direction:column;gap:6px"><b style="font-size:20px">' . esc_html( $name ) . ( $best ? ' <span class="tag tag-acc" style="margin-left:6px">' . esc_html__( 'Most popular', 'shopinbos' ) . '</span>' : '' ) . '</b><span style="font-size:14px;color:' . $sub . '">' . esc_html( $who ) . '</span></div>'
			. '<div class="row" style="gap:6px;align-items:baseline">'
			. '<span class="disp" style="font-size:40px" data-toggle-show="billing:month">' . esc_html( (string) sib_setting( "price_{$key}_month" ) ) . '</span>'
			. '<span class="disp" style="font-size:40px" data-toggle-show="billing:year" hidden>' . esc_html( (string) sib_setting( "price_{$key}_year" ) ) . '</span>'
			. ( 'free' === strtolower( (string) sib_setting( "price_{$key}_month" ) )
				? '<span style="color:' . $sub . ';font-size:14px">' . esc_html__( 'forever', 'shopinbos' ) . '</span></div>'
				: '<span style="color:' . $sub . ';font-size:14px" data-toggle-text="billing" data-month="' . esc_attr__( '/ month', 'shopinbos' ) . '" data-year="' . esc_attr__( '/ year', 'shopinbos' ) . '">' . esc_html__( '/ month', 'shopinbos' ) . '</span></div>' )
			. '<a class="btn btn-block" data-toggle-param="billing" data-param="billing" style="background:' . ( $best ? '#FF6A2B' : '#16141F' ) . ';color:#fff" href="' . esc_url( sib_go_url( 'plan', [ 'plan' => $key, 'billing' => 'month' ] ) ) . '">' . esc_html( sprintf( __( 'Start with %s', 'shopinbos' ), $name ) ) . '</a>'
			. '<ul class="ticks" style="--tick:' . ( $best ? '#8BE3D3' : '#16794A' ) . '">';
		foreach ( $feats as $f ) {
			$out .= '<li>' . esc_html( $f ) . '</li>';
		}
		$out .= '</ul></div>';
	}
	return $out . '</div>';
}

/* ---------- Content helpers ---------- */

/** Breadcrumb trail for the current request: [label, url][]. */
function sib_breadcrumb_trail(): array {
	if ( $v = sib_virtual() ) {
		return $v['crumbs'];
	}
	$trail = [];
	if ( is_singular() ) {
		$post = get_post();
		if ( 'post' === $post->post_type ) {
			$trail[] = [ __( 'Blog', 'shopinbos' ), home_url( '/blog/' ) ];
			$cats    = get_the_category( $post->ID );
			if ( $cats ) {
				$trail[] = [ $cats[0]->name, get_category_link( $cats[0] ) ];
			}
		} elseif ( 'sib_help' === $post->post_type ) {
			$trail[] = [ __( 'Help centre', 'shopinbos' ), home_url( '/help/' ) ];
			$terms   = get_the_terms( $post, 'sib_help_category' );
			if ( $terms && ! is_wp_error( $terms ) ) {
				$trail[] = [ $terms[0]->name, get_term_link( $terms[0] ) ];
			}
		} elseif ( 'sib_lesson' === $post->post_type ) {
			$trail[] = [ __( 'Academy', 'shopinbos' ), sib_academy_url() ];
			if ( $track = sib_lesson_track( $post ) ) {
				$trail[] = [ $track->name, get_term_link( $track ) ];
			}
		} elseif ( 'page' !== $post->post_type && ( $obj = get_post_type_object( $post->post_type ) ) && $obj->has_archive ) {
			$trail[] = [ $obj->labels->name, get_post_type_archive_link( $post->post_type ) ];
		} elseif ( $post->post_parent ) {
			foreach ( array_reverse( get_post_ancestors( $post ) ) as $anc ) {
				$trail[] = [ get_the_title( $anc ), get_permalink( $anc ) ];
			}
		}
		$trail[] = [ get_the_title( $post ), get_permalink( $post ) ];
	} elseif ( is_tax( 'sib_help_category' ) ) {
		$trail[] = [ __( 'Help centre', 'shopinbos' ), home_url( '/help/' ) ];
		$trail[] = [ single_term_title( '', false ), get_term_link( get_queried_object() ) ];
	} elseif ( is_category() || is_tag() ) {
		$trail[] = [ __( 'Blog', 'shopinbos' ), home_url( '/blog/' ) ];
		$trail[] = [ single_term_title( '', false ), get_term_link( get_queried_object() ) ];
	} elseif ( is_post_type_archive() ) {
		$trail[] = [ post_type_archive_title( '', false ), get_post_type_archive_link( get_query_var( 'post_type' ) ) ];
	}
	return $trail;
}

function sib_render_breadcrumbs( array $a ): string {
	$html = sib_view( 'parts/crumbs', [ 'crumbs' => sib_breadcrumb_trail() ] );
	if ( ! $html ) {
		return '';
	}
	return ! empty( $a['band'] ) ? '<div class="bg-mist"><div class="wrap" style="padding-top:20px">' . $html . '</div></div>' : $html;
}

function sib_render_article_meta( array $a ): string {
	$post = get_post();
	if ( ! $post ) {
		return '';
	}
	$reviewed = (string) get_post_meta( $post->ID, 'sib_reviewed', true );
	$updated  = $reviewed ?: get_the_modified_date( 'Y-m-d', $post );
	$date_t   = date_i18n( get_option( 'date_format' ), strtotime( $updated ) );
	$by       = (string) get_post_meta( $post->ID, 'sib_reviewed_by', true );
	$time     = '<time datetime="' . esc_attr( $updated ) . '">' . esc_html( $date_t ) . '</time>';
	if ( 'updated' === $a['variant'] ) {
		return '<p class="byline">' . sprintf( esc_html__( 'Updated %s', 'shopinbos' ), $time ) . '</p>';
	}
	if ( 'checked' === $a['variant'] ) {
		$area = (string) get_post_meta( $post->ID, 'sib_help_area', true );
		return '<p class="byline">' . sprintf( esc_html__( 'Last checked %s', 'shopinbos' ), $time ) . ( $area ? ' · <span>' . esc_html( sprintf( __( 'In the app: %s', 'shopinbos' ), $area ) ) . '</span>' : '' ) . '</p>';
	}
	$author = get_userdata( (int) $post->post_author );
	$mins   = max( 1, (int) round( str_word_count( wp_strip_all_tags( $post->post_content ) ) / 220 ) );
	return '<div class="byline">' . ( $author ? get_avatar( $author->ID, 40, '', '' ) . '<span><b style="color:#16141F">' . esc_html( $author->display_name ) . '</b>' : '<span>' )
		. ( $by ? ' · ' . esc_html( sprintf( __( 'Reviewed by %s', 'shopinbos' ), $by ) ) : '' ) . '</span>'
		. '<span>' . sprintf( esc_html__( 'Updated %s', 'shopinbos' ), $time ) . '</span><span>' . esc_html( sprintf( _n( '%d min read', '%d min read', $mins, 'shopinbos' ), $mins ) ) . '</span></div>';
}

/* Give H2/H3 headings in long-form content an id so the table of contents can link to them. */
add_filter( 'render_block_core/heading', function ( $html, $block ) {
	if ( ! is_singular( [ 'post', 'sib_help', 'sib_resource', 'sib_tool' ] ) || str_contains( $html, ' id="' ) || ! preg_match( '#^\s*<h([23])#', $html ) ) {
		return $html;
	}
	$id = sanitize_title( wp_strip_all_tags( $html ) );
	return $id ? preg_replace( '#^(\s*<h[23])#', '$1 id="' . esc_attr( $id ) . '"', $html, 1 ) : $html;
}, 10, 2 );

function sib_render_toc(): string {
	$post = get_post();
	if ( ! $post ) {
		return '';
	}
	$items = [];
	foreach ( parse_blocks( $post->post_content ) as $b ) {
		if ( 'core/heading' === $b['blockName'] && 2 === (int) ( $b['attrs']['level'] ?? 2 ) ) {
			$text    = wp_strip_all_tags( $b['innerHTML'] );
			$items[] = [ $text, $b['attrs']['anchor'] ?? sanitize_title( $text ) ];
		}
	}
	if ( count( $items ) < 2 ) {
		return '<aside></aside>';
	}
	$out = '<aside><nav class="toc" aria-label="' . esc_attr__( 'On this page', 'shopinbos' ) . '"><b style="font-size:13px;letter-spacing:0.06em;text-transform:uppercase">' . esc_html__( 'On this page', 'shopinbos' ) . '</b>';
	foreach ( $items as [ $t, $id ] ) {
		$out .= '<a href="#' . esc_attr( $id ) . '">' . esc_html( $t ) . '</a>';
	}
	return $out . '</nav></aside>';
}

function sib_render_author_box(): string {
	$post   = get_post();
	$author = $post ? get_userdata( (int) $post->post_author ) : null;
	if ( ! $author || ! $author->description ) {
		return '';
	}
	return '<div class="card" style="padding:22px;display:flex;gap:16px;align-items:flex-start">' . get_avatar( $author->ID, 56, '', '', [ 'extra_attr' => 'style="border-radius:999px;flex:none"' ] )
		. '<div style="display:flex;flex-direction:column;gap:4px"><b>' . esc_html( $author->display_name ) . '</b><p class="p" style="font-size:14px">' . esc_html( $author->description ) . '</p>'
		. '<a class="lnk arrow" href="' . esc_url( get_author_posts_url( $author->ID ) ) . '">' . esc_html__( 'More from this author', 'shopinbos' ) . '</a></div></div>';
}

function sib_render_related( array $a ): string {
	$post = get_post();
	if ( ! $post ) {
		return '';
	}
	$args = [ 'post_type' => $post->post_type, 'numberposts' => max( 1, (int) $a['count'] ), 'post__not_in' => [ $post->ID ], 'post_status' => 'publish', 'orderby' => 'rand' ];
	if ( 'post' === $post->post_type ) {
		$args['category__in'] = wp_get_post_categories( $post->ID );
		$args['orderby']      = 'date';
	} elseif ( 'sib_help' === $post->post_type ) {
		$terms = wp_get_object_terms( $post->ID, 'sib_help_category', [ 'fields' => 'ids' ] );
		if ( $terms ) {
			$args['tax_query'] = [ [ 'taxonomy' => 'sib_help_category', 'terms' => $terms ] ];
		}
		$args['orderby'] = 'title';
	}
	$items = get_posts( $args );
	if ( ! $items ) {
		return '';
	}
	if ( 'sib_help' === $post->post_type ) {
		$out = '<div class="col" style="margin-top:24px"><h2 class="disp h3">' . esc_html__( 'Related articles', 'shopinbos' ) . '</h2><ul style="margin:0;padding-left:1.2em;display:flex;flex-direction:column;gap:8px">';
		foreach ( $items as $p ) {
			$out .= '<li><a href="' . esc_url( get_permalink( $p ) ) . '">' . esc_html( get_the_title( $p ) ) . '</a></li>';
		}
		return $out . '</ul></div>';
	}
	$out = '<section class="sec bg-mist"><div class="wrap col-22"><h2 class="disp h3">' . esc_html__( 'Keep reading', 'shopinbos' ) . '</h2><div class="g3">';
	foreach ( $items as $p ) {
		$img  = get_the_post_thumbnail( $p, 'medium_large', [ 'loading' => 'lazy' ] );
		$out .= '<a class="post-card card" style="padding:12px" href="' . esc_url( get_permalink( $p ) ) . '">' . $img . '<h3 class="disp" style="font-size:19px;padding:0 6px">' . esc_html( get_the_title( $p ) ) . '</h3><p class="p" style="padding:0 6px 6px">' . esc_html( wp_trim_words( get_the_excerpt( $p ), 18 ) ) . '</p></a>';
	}
	return $out . '</div></div></section>';
}

function sib_render_term_chips(): string {
	if ( ! is_home() && ! is_category() ) {
		return '';
	}
	$tax = 'category';
	$terms = get_terms( [ 'taxonomy' => $tax, 'hide_empty' => true, 'parent' => 0 ] );
	if ( ! $terms || is_wp_error( $terms ) ) {
		return '';
	}
	$cur = get_queried_object_id();
	$out = '<nav class="chips" aria-label="' . esc_attr__( 'Categories', 'shopinbos' ) . '"><a class="chip" href="' . esc_url( home_url( '/blog/' ) ) . '"' . ( is_home() ? ' aria-current="page"' : '' ) . '>' . esc_html__( 'All', 'shopinbos' ) . '</a>';
	foreach ( $terms as $t ) {
		$out .= '<a class="chip" href="' . esc_url( get_term_link( $t ) ) . '"' . ( $cur === $t->term_id ? ' aria-current="page"' : '' ) . '>' . esc_html( $t->name ) . '</a>';
	}
	return $out . '</nav>';
}

function sib_render_integration_tiles(): string {
	$items = get_posts( [ 'post_type' => 'sib_integration', 'numberposts' => 60, 'post_status' => 'publish', 'orderby' => [ 'menu_order' => 'ASC', 'title' => 'ASC' ] ] );
	if ( ! $items ) {
		return '';
	}
	$labels = [ 'live' => [ __( 'Live', 'shopinbos' ), 'tag-ok' ], 'apply' => [ __( 'Apply', 'shopinbos' ), 'tag-amber' ], 'soon' => [ __( 'Soon', 'shopinbos' ), '' ] ];
	$mono   = [ '#FFEDE4', '#E2F6F1', '#E7E1FF', '#FDF0D5', '#E3EEFD', '#F6F5F9' ];
	$out    = '<div class="g3">';
	foreach ( $items as $i => $p ) {
		$st    = $labels[ get_post_meta( $p->ID, 'sib_integration_status', true ) ?: 'live' ] ?? $labels['live'];
		$words = preg_split( '/\s+/', preg_replace( '/[^A-Za-z0-9 ]/', '', get_the_title( $p ) ) );
		$init  = strtoupper( implode( '', array_map( fn( $w ) => $w[0] ?? '', array_slice( array_filter( $words ), 0, 2 ) ) ) );
		$out  .= '<a class="card" href="' . esc_url( get_permalink( $p ) ) . '" style="padding:18px;display:flex;gap:14px;align-items:flex-start;text-decoration:none;color:inherit">'
			. ( ( $logo = function_exists( 'sib_brand_logo' ) ? sib_brand_logo( get_the_title( $p ), 28 ) : '' )
				? '<span class="mono has-logo" style="width:44px;height:44px;border-radius:14px;background:#fff">' . $logo . '</span>'
				: '<span class="mono" style="width:44px;height:44px;border-radius:14px;font-size:14px;background:' . $mono[ $i % 6 ] . '">' . esc_html( $init ) . '</span>' )
			. '<span style="flex:1;display:flex;flex-direction:column;gap:4px"><b style="font-size:15.5px">' . esc_html( get_the_title( $p ) ) . '</b><span style="font-size:13.5px;color:#6B6779">' . esc_html( wp_trim_words( get_the_excerpt( $p ), 14 ) ) . '</span></span>'
			. '<span class="tag ' . $st[1] . '">' . esc_html( $st[0] ) . '</span></a>';
	}
	return $out . '</div>';
}

function sib_render_mascot( array $a ): string {
	$who  = in_array( $a['who'], [ 'rex', 'rex-side', 'peggy', 'peggy-wave' ], true ) ? $a['who'] : 'rex';
	$size = max( 24, min( 320, (int) $a['size'] ) );
	$alt  = str_starts_with( $who, 'rex' ) ? 'Rex' : 'Peggy';
	return '<img src="' . sib_img( $who . '.webp' ) . '" alt="' . esc_attr( $alt ) . '" width="' . $size . '" height="' . $size . '" style="width:' . $size . 'px;height:auto" loading="lazy">';
}
