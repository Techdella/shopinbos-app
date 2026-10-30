<?php
/**
 * Robots, canonicals and meta tags.
 *
 * Rank Math (or Yoast) owns titles and descriptions for normal pages. We add:
 *  - noindex for campaign pages (/lp/), tag archives, search, marketplace searches and the per-page switch
 *  - full meta for the virtual marketplace pages (handed to Rank Math/Yoast when they are active)
 *  - basic description, canonical and Open Graph tags when no SEO plugin is installed
 */

defined( 'ABSPATH' ) || exit;

function sib_seo_plugin(): bool {
	return defined( 'RANK_MATH_VERSION' ) || defined( 'WPSEO_VERSION' );
}

function sib_is_noindex(): bool {
	if ( $v = sib_virtual() ) {
		return ! empty( $v['noindex'] );
	}
	if ( is_singular() && ( get_post_meta( get_queried_object_id(), 'sib_noindex', true ) || is_singular( 'sib_landing' ) || is_page( 'thanks' ) ) ) {
		return true;
	}
	return is_tag() || is_search() || is_author() && ! have_posts() || is_date();
}

add_filter( 'wp_robots', function ( $robots ) {
	if ( sib_is_noindex() ) {
		$robots['noindex'] = true;
		$robots['follow']  = true;
		unset( $robots['max-image-preview'] );
	}
	return $robots;
} );

/* Hand our answers to Rank Math and Yoast so they don't print the home page's tags on virtual pages. */
$sib_v = fn( string $k ) => fn( $value ) => ( $v = sib_virtual() ) && isset( $v[ $k ] ) ? $v[ $k ] : $value;
add_filter( 'rank_math/frontend/canonical', $sib_v( 'canonical' ) );
add_filter( 'rank_math/frontend/description', $sib_v( 'description' ) );
add_filter( 'rank_math/frontend/title', fn( $t ) => ( $v = sib_virtual() ) ? $v['title'] . ' | Shopinbos Business' : $t );
add_filter( 'rank_math/frontend/robots', function ( $r ) {
	if ( sib_is_noindex() ) {
		$r['index'] = 'noindex';
	}
	return $r;
} );
add_filter( 'wpseo_canonical', $sib_v( 'canonical' ) );
add_filter( 'wpseo_metadesc', $sib_v( 'description' ) );
add_filter( 'wpseo_title', fn( $t ) => ( $v = sib_virtual() ) ? $v['title'] . ' | Shopinbos Business' : $t );
add_filter( 'wpseo_robots', fn( $r ) => sib_is_noindex() ? 'noindex, follow' : $r );
unset( $sib_v );

/** Description for the current request (our fallback). */
function sib_meta_description(): string {
	if ( $v = sib_virtual() ) {
		return (string) $v['description'];
	}
	if ( is_singular() ) {
		$post = get_queried_object();
		return wp_trim_words( wp_strip_all_tags( has_excerpt( $post ) ? $post->post_excerpt : strip_shortcodes( $post->post_content ) ), 28, '…' );
	}
	if ( is_front_page() || is_home() ) {
		return (string) get_bloginfo( 'description' );
	}
	return wp_strip_all_tags( (string) term_description() );
}

add_action( 'wp_head', function () {
	$v = sib_virtual();
	if ( sib_seo_plugin() && ! $v ) {
		return;
	}
	if ( $v && sib_seo_plugin() ) {
		return; // Rank Math / Yoast print them using the filters above.
	}
	$desc  = sib_meta_description();
	$title = wp_get_document_title();
	$url   = $v ? ( $v['canonical'] ?? '' ) : ( is_singular() ? get_permalink() : '' );
	$image = $v['image'] ?? ( is_singular() && has_post_thumbnail() ? get_the_post_thumbnail_url( null, 'large' ) : '' );
	$image = $image ?: sib_absolute( sib_img( 'og-default.jpg' ) );
	if ( ( $k = sib_seo_context() ) && ! $v ) {
		[ $title, $desc ] = sib_seo_defaults()[ $k ];
	}
	if ( $desc ) {
		echo '<meta name="description" content="' . esc_attr( $desc ) . "\">\n";
	}
	if ( $v && $url ) {
		echo '<link rel="canonical" href="' . esc_url( $url ) . "\">\n"; // core prints it for singular pages
	}
	echo '<meta property="og:site_name" content="Shopinbos Business">' . "\n";
	echo '<meta property="og:type" content="' . ( is_singular( 'post' ) ? 'article' : 'website' ) . "\">\n";
	echo '<meta property="og:title" content="' . esc_attr( $title ) . "\">\n";
	if ( $desc ) {
		echo '<meta property="og:description" content="' . esc_attr( $desc ) . "\">\n";
	}
	if ( $url ) {
		echo '<meta property="og:url" content="' . esc_url( $url ) . "\">\n";
	}
	if ( $image ) {
		echo '<meta property="og:image" content="' . esc_url( $image ) . "\">\n";
	}
	echo '<meta name="twitter:card" content="' . ( $image ? 'summary_large_image' : 'summary' ) . "\">\n";
	echo '<meta property="og:locale" content="en_NG">' . "\n";
}, 3 );

/* Without an SEO plugin, use the same hub titles. */
add_filter( 'pre_get_document_title', function ( $t ) {
	return ! sib_seo_plugin() && ( $k = sib_seo_context() ) && ! sib_virtual() ? sib_seo_defaults()[ $k ][0] : $t;
}, 20 );

/* English for Nigeria. */
add_filter( 'language_attributes', fn( $out ) => preg_replace( '/lang="[^"]*"/', 'lang="en-NG"', $out ) );

/* ---------- Better defaults when Yoast is active ---------- */

/** Title and description for the home page and the main hubs, used when the editor hasn't set their own. */
function sib_seo_defaults(): array {
	return [
		'home'      => [ 'Shopinbos Business: everything you need to sell online', 'Shopinbos Business is everything you need to sell online in Nigeria: build your online store, sell on WhatsApp, Instagram and TikTok, take card, transfer and pay on delivery, book riders and get paid straight to your bank. Start free.' ],
		'blog'      => [ 'Online selling tips for Nigeria | Shopinbos Business blog', 'Plain-word guides on selling online in Nigeria: WhatsApp, Instagram and TikTok, pricing, payments, delivery, suppliers and getting repeat customers.' ],
		'academy'   => [ 'Free online selling course for Nigerians | Shopinbos Business Academy', 'Short free lessons in English and Pidgin: start your shop, sell on WhatsApp, Instagram and TikTok, get paid, deliver and grow. No sign-up needed.' ],
		'help'      => [ 'Help centre | Shopinbos Business', 'Step-by-step answers for your Shopinbos Business shop: orders, payments and payouts, delivery and pay on delivery, your store and design, and your account.' ],
		'resources' => [ 'Free PDFs and templates for online sellers in Nigeria | Shopinbos Business', 'Free guides, workbooks, checklists and templates for Nigerian online sellers, from the Online Seller’s Starter Kit to pricing and launch checklists.' ],
		'tools'     => [ 'Free tools for online sellers in Nigeria | Shopinbos Business', 'Free calculators and generators for Nigerian sellers: profit margin, selling price, Paystack fees, break-even, discounts, ad budget, business names and more.' ],
		'templates' => [ 'Online store templates for Nigerian shops | Shopinbos Business', 'Mobile-first store templates for fashion, shoes, food, beauty, gadgets and home shops, with pay on delivery and WhatsApp ordering built in.' ],
		'compare'   => [ 'Compare Shopinbos Business with other platforms | Shopinbos Business', 'Honest comparisons of Shopinbos Business with Shopify, WooCommerce, Bumpa, Selar, Wix, Paystack Storefront, Jumia and selling only on Instagram.' ],
	];
}

function sib_seo_context(): string {
	if ( is_front_page() ) {
		return 'home';
	}
	if ( is_home() ) {
		return 'blog';
	}
	foreach ( [ 'sib_lesson' => 'academy', 'sib_help' => 'help', 'sib_resource' => 'resources', 'sib_tool' => 'tools', 'sib_template' => 'templates', 'sib_comparison' => 'compare' ] as $type => $key ) {
		if ( is_post_type_archive( $type ) ) {
			return $key;
		}
	}
	return '';
}

add_filter( 'wpseo_title', function ( $t ) {
	$k = sib_seo_context();
	if ( $k && ( ! is_singular() || ! get_post_meta( get_queried_object_id(), '_yoast_wpseo_title', true ) ) ) {
		return sib_seo_defaults()[ $k ][0];
	}
	return $t;
}, 20 );

add_filter( 'wpseo_metadesc', function ( $d ) {
	if ( $d ) {
		return $d;
	}
	if ( $k = sib_seo_context() ) {
		return sib_seo_defaults()[ $k ][1];
	}
	if ( is_singular() || is_category() || is_tax() ) {
		return sib_meta_description();
	}
	return $d;
}, 20 );
add_filter( 'wpseo_opengraph_desc', fn( $d ) => $d ?: apply_filters( 'wpseo_metadesc', '' ), 20 );
add_filter( 'wpseo_opengraph_title', function ( $t ) {
	$k = sib_seo_context();
	return $k ? sib_seo_defaults()[ $k ][0] : $t;
}, 20 );
add_filter( 'wpseo_locale', fn() => 'en_NG' );

/* A branded share image wherever the page has none of its own. */
add_action( 'wpseo_add_opengraph_images', function ( $images ) {
	if ( method_exists( $images, 'has_images' ) && $images->has_images() ) {
		return;
	}
	$images->add_image( [ 'url' => sib_absolute( sib_img( 'og-default.jpg' ) ), 'width' => 1200, 'height' => 630, 'type' => 'image/jpeg' ] );
} );
add_filter( 'wpseo_twitter_image', fn( $img ) => $img ?: sib_absolute( sib_img( 'og-default.jpg' ) ) );

/* The company behind Shopinbos in Yoast's schema. */
add_filter( 'wpseo_schema_organization', function ( $data ) {
	$data['name']         = 'Shopinbos';
	$data['legalName']    = 'Tech Della Solutions Ltd';
	$data['identifier']   = 'RC 7038770';
	$data['areaServed']   = 'NG';
	$data['parentOrganization'] = [ '@type' => 'Organization', 'name' => 'Tech Della Solutions Ltd', 'identifier' => 'RC 7038770' ];
	$data['contactPoint'] = [ '@type' => 'ContactPoint', 'contactType' => 'customer support', 'email' => 'support@shopinbos.com', 'areaServed' => 'NG', 'availableLanguage' => [ 'English', 'Nigerian Pidgin' ] ];
	return $data;
} );

/* Theme colour for mobile browsers. */
add_action( 'wp_head', fn() => print( '<meta name="theme-color" content="#FFFFFF">' . "\n" ), 2 );
