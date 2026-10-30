<?php
/**
 * Search titles and descriptions for every page, written for the words Nigerian sellers search with.
 *
 *  - sib_seo_map(): hand-written title, description and focus keyword for the main pages, by URL path.
 *  - sib_seo_auto(): a title and description for everything else (posts, guides, lessons, help, templates…),
 *    built from the page's own title and summary, kept to 60 and 155 characters.
 *  - Setup copies them into Yoast's fields (or Rank Math's) when those are empty, so the team sees and edits
 *    them in the editor; a later edit by a person is never overwritten. Pages without their own values (archives,
 *    categories) get them at runtime through the Yoast filters in seo.php.
 */

defined( 'ABSPATH' ) || exit;

/** path => [ title, description, focus keyword ] */
function sib_seo_map(): array {
	return [
		'/'                => [ 'Shopinbos: sell online in Nigeria from one app', 'Build your online store, sell on WhatsApp, Instagram and TikTok, take card, transfer and pay on delivery, book riders and get paid to your bank. Start free.', 'sell online in Nigeria' ],
		'/pricing/'        => [ 'Pricing: plans in naira for sellers | Shopinbos', 'Free plan, then from ₦6,000 a month. Lower fees as you grow, payments straight to your bank. Plans for sellers, suppliers and delivery partners.', 'online store pricing Nigeria' ],
		'/how-it-works/'   => [ 'How Shopinbos works: from first product to payout', 'See how Shopinbos works: find products, build your store with Rex, sell on WhatsApp and social media, get paid by card or on delivery, and book riders.', 'how to sell online in Nigeria' ],
		'/about/'          => [ 'About Shopinbos: the commerce app for Nigerian shops', 'Shopinbos helps Nigerian businesses sell online and reach their customers: find products, sell everywhere, get paid and deliver, all from one app.', 'Shopinbos' ],
		'/contact/'        => [ 'Contact Shopinbos: WhatsApp, email and support', 'Talk to a real person at Shopinbos on WhatsApp, by email or with our form. Support 8am to 8pm, in English or Pidgin, for sellers and partners.', 'Shopinbos contact' ],
		'/careers/'        => [ 'Careers at Shopinbos: build commerce for Africa', 'Work on the app that helps Nigerian sellers run their shops from a phone. See open roles in engineering, design, growth and seller success in Lagos.', 'Shopinbos careers' ],
		'/press/'          => [ 'Press and media kit | Shopinbos', 'Facts, logos, founder details and contacts for journalists writing about Shopinbos, the app that helps Nigerian businesses sell online.', 'Shopinbos press' ],
		'/partners/'       => [ 'Partner with Shopinbos: suppliers, delivery, agencies', 'Grow with Shopinbos as a supplier, a delivery company or an agency. Reach online shops across Nigeria and get paid for every order.', 'Shopinbos partners' ],
		'/partners/agencies/' => [ 'Agency partners: build stores for clients | Shopinbos', 'Build and run online stores for your clients on Shopinbos. Manage several shops from one login, earn on every client and get partner support.', 'ecommerce agency Nigeria' ],
		'/for-suppliers/'  => [ 'Sell wholesale to online shops in Nigeria | Shopinbos', 'Suppliers and wholesalers: list your products once and let Nigerian online shops resell them. Orders come with delivery booked, and you get paid fast.', 'wholesale suppliers Nigeria' ],
		'/delivery/'       => [ 'Delivery jobs for logistics companies | Shopinbos', 'Delivery companies and riders: get daily jobs from Shopinbos shops, with pickup details, live tracking and pay on delivery codes. Paid to your bank.', 'delivery jobs Lagos' ],
		'/marketplace/'    => [ 'Find stock: products to dropship in Nigeria | Shopinbos', 'Find products to sell from checked Nigerian suppliers. Dropship with no stock or buy wholesale, with delivery and pay on delivery built in.', 'dropshipping suppliers Nigeria' ],
		'/trending/'       => [ 'Trending TikTok products to sell in Nigeria today', 'Products trending on TikTok that Nigerian sellers can stock, updated every morning: naira prices, where to get stock, video ideas and suppliers.', 'trending tiktok products Nigeria' ],
		'/gist/'           => [ 'Gist: selling tips in 60 seconds | Shopinbos', 'Quick, animated selling tips for Nigerian online sellers: pricing, WhatsApp Status, delivery, product photos, trust and getting your first orders.', 'online selling tips' ],
		'/waitlist/'       => [ 'Join the Shopinbos waitlist: opens November 1', 'Get in first when Shopinbos opens on November 1. For sellers, suppliers and delivery partners in Nigeria. Free to join, with free setup help.', 'Shopinbos waitlist' ],
		'/investors/'      => [ 'Investor relations | Shopinbos', 'Shopinbos is building the commerce operating system for African businesses. Company facts, business model and how to reach the founders.', 'Shopinbos investors' ],
		'/thanks/'         => [ 'You’re in | Shopinbos', 'Thanks for confirming. Your first Shopinbos selling tip is on its way to your inbox or WhatsApp.', '' ],
		'/blog/'           => [ 'Online selling tips for Nigeria | Shopinbos blog', 'Plain-word guides on selling online in Nigeria: WhatsApp, Instagram and TikTok, pricing, payments, delivery, suppliers and getting repeat customers.', 'online selling tips Nigeria' ],
		'/academy/'        => [ 'Free online selling course for Nigerians | Academy', 'Short free lessons in English and Pidgin: start your shop, sell on WhatsApp, Instagram and TikTok, get paid, deliver and grow. No sign-up needed.', 'free ecommerce course Nigeria' ],
		'/help/'           => [ 'Help centre: answers for your shop | Shopinbos', 'Step-by-step answers for your Shopinbos shop: orders, payments and payouts, delivery and pay on delivery, your store and design, and your account.', 'Shopinbos help' ],
		'/resources/'      => [ 'Free PDFs and templates for online sellers in Nigeria', 'Free guides, workbooks, checklists and templates for Nigerian online sellers, from the Online Seller’s Starter Kit to pricing and launch checklists.', 'free ecommerce guides' ],
		'/tools/'          => [ 'Free tools for online sellers in Nigeria | Shopinbos', 'Free calculators and generators for Nigerian sellers: profit margin, selling price, Paystack fees, break-even, discounts, ad budget and business names.', 'free business tools Nigeria' ],
		'/templates/'      => [ 'Online store templates for Nigerian shops | Shopinbos', 'Mobile-first store templates for fashion, shoes, food, beauty, gadgets and home shops, with pay on delivery and WhatsApp ordering built in.', 'online store templates' ],
		'/compare/'        => [ 'Compare Shopinbos with Shopify, Bumpa and more', 'Honest comparisons of Shopinbos with Shopify, WooCommerce, Bumpa, Selar, Wix, Paystack Storefront, Jumia and selling only on Instagram.', 'Shopify alternative Nigeria' ],
		'/features/'       => [ 'Features: store, payments, delivery, AI | Shopinbos', 'Everything Shopinbos does: an online store built with AI, WhatsApp and social selling, card and pay on delivery, rider booking, dropshipping and Peggy.', 'ecommerce features' ],
		'/solutions/'      => [ 'Solutions for fashion, beauty, food and gadget shops', 'Shopinbos for the way your shop sells: fashion, beauty, food products and electronics, with templates, pay on delivery and same-day delivery.', 'online store for small business' ],
		'/integrations/'   => [ 'Integrations: Paystack, WhatsApp, TikTok | Shopinbos', 'Connect Shopinbos to Paystack, WhatsApp Business, Instagram, Facebook and TikTok Shop, so orders, chats and payments land in one app.', 'Shopinbos integrations' ],

		'/features/storefront/'       => [ 'Online store builder for Nigeria, made with AI', 'Tell Rex what you sell and get a real online store at yourname.mybos.store in minutes, with naira prices, pay on delivery and WhatsApp ordering.', 'online store builder Nigeria' ],
		'/features/store-management/' => [ 'Manage products, stock and orders in one app', 'Products, stock, orders and customers from every place you sell, in one app on your phone. Add a product once and sell it everywhere.', 'inventory management app Nigeria' ],
		'/features/social-selling/'   => [ 'Sell on Instagram, TikTok and Facebook | Shopinbos', 'Share products where your customers spend time, answer every chat in one inbox and turn comments into orders on Instagram, TikTok and Facebook.', 'sell on Instagram Nigeria' ],
		'/features/payments/'         => [ 'Accept payments online in Nigeria: card, transfer, POD', 'Take card, bank transfer, USSD and pay on delivery in naira, with your money paid out to your bank. Paystack fees shown up front.', 'accept payments online Nigeria' ],
		'/features/logistics/'        => [ 'Delivery for online shops: book riders | Shopinbos', 'Book a rider from the order, share live tracking with customers and collect pay on delivery with a 4-digit code. Same-day delivery in Lagos.', 'delivery service for online business' ],
		'/features/peggy-ai/'         => [ 'Peggy: AI sales assistant for your shop | Shopinbos', 'Peggy answers “how much?”, sends pay links, writes captions, books riders and tells you what to restock. Your AI shop assistant, in English or Pidgin.', 'AI sales assistant' ],
		'/features/sell-on-whatsapp/' => [ 'Sell on WhatsApp: catalogue, orders and payments', 'Your WhatsApp catalogue, order links and replies in one place. Peggy answers buyers, sends pay links and confirms payment, so you sell while you rest.', 'sell on WhatsApp' ],
		'/features/dropshipping/'     => [ 'Dropshipping in Nigeria with checked suppliers', 'Pick products from checked Nigerian suppliers, sell them under your brand and keep the difference. No stock to buy; delivery is booked for you.', 'dropshipping in Nigeria' ],
		'/features/pay-on-delivery/'  => [ 'Pay on delivery for online stores in Nigeria', 'Let customers pay the rider when the parcel arrives. A 4-digit code proves delivery, and your money is paid out to your bank.', 'pay on delivery Nigeria' ],
		'/solutions/fashion/'         => [ 'Online store for fashion brands in Nigeria', 'Sell clothes, shoes and bags online with sizes, colours, lookbooks and pre-orders, same-day delivery in Lagos and pay on delivery.', 'online fashion store Nigeria' ],
		'/solutions/beauty/'          => [ 'Online store for beauty and skincare brands', 'Sell skincare, hair and beauty products online with product pages that prove they’re original, bundles, refills and reorder reminders.', 'sell skincare online Nigeria' ],
		'/solutions/food/'            => [ 'Sell food products online in Nigeria | Shopinbos', 'Put your packed food products in one online store, sell on WhatsApp, Instagram and TikTok, and deliver across Nigeria with pay on delivery.', 'sell food products online Nigeria' ],
		'/solutions/electronics/'     => [ 'Sell phones and gadgets online in Nigeria', 'Show specs and condition clearly, offer pay on delivery to win trust and sell accessories with every phone, laptop and gadget.', 'sell gadgets online Nigeria' ],
		'/integrations/paystack/'     => [ 'Paystack integration: cards, transfer, USSD | Shopinbos', 'Shopinbos uses Paystack for card, bank transfer and USSD payments at checkout: 1.5% + ₦100, capped at ₦2,000, paid out to your bank.', 'Paystack store' ],
		'/integrations/whatsapp/'     => [ 'WhatsApp Business integration | Shopinbos', 'Connect WhatsApp Business to Shopinbos: sync your catalogue, answer chats in one inbox, send payment links and order updates automatically.', 'WhatsApp Business catalogue' ],
		'/integrations/tiktok-shop/'  => [ 'Sell on TikTok Shop from Nigeria | Shopinbos', 'Sell in TikTok videos and lives, send buyers to your Shopinbos store and keep orders, stock and delivery in one app.', 'sell on TikTok Nigeria' ],
		'/compare/woocommerce-vs-shopify/' => [ 'WooCommerce vs Shopify for small businesses (2026)', 'WooCommerce or Shopify for a small business? Costs, setup, payments and delivery compared, and when a Nigeria-first option like Shopinbos fits better.', 'WooCommerce vs Shopify' ],

		'/legal/'          => [ 'Legal: terms, privacy and policies | Shopinbos', 'The agreements and policies for everyone who uses Shopinbos: sellers, their customers, suppliers and delivery partners, each with a plain summary.', '' ],
		'/legal/terms/'    => [ 'Terms of service | Shopinbos', 'The agreement between you and Shopinbos when you use our app and website to sell: your shop, plans, payouts, and what we each promise.', '' ],
		'/legal/privacy/'  => [ 'Privacy policy | Shopinbos', 'What personal data Shopinbos collects, why, who we share it with and your rights under the Nigeria Data Protection Act 2023.', '' ],
		'/legal/refunds/'  => [ 'Refunds and returns policy | Shopinbos', 'How refunds and returns work for people who buy from Shopinbos stores, and for Shopinbos plans and add-ons.', '' ],
		'/legal/cookies/'  => [ 'Cookie policy | Shopinbos', 'The cookies shopinbos.com and Shopinbos stores use, what each one does, and how to change your choices.', '' ],
		'/legal/seller-rules/' => [ 'Seller rules | Shopinbos', 'The rules every shop on Shopinbos follows: honest listings, allowed products, delivery and customer care, so buyers can trust every store.', '' ],
		'/legal/supplier-terms/' => [ 'Supplier terms | Shopinbos', 'Terms for suppliers and wholesalers who list products in Find stock for Shopinbos shops to sell: quality, orders, delivery and payment.', '' ],
		'/legal/delivery-partner-terms/' => [ 'Delivery partner terms | Shopinbos', 'Terms for delivery companies and riders who take jobs from Shopinbos shops: pickups, delivery codes, cash handling and settlements.', '' ],
		'/legal/acceptable-use/' => [ 'Acceptable use policy | Shopinbos', 'What you can and can’t do with Shopinbos: allowed products, honest selling, messaging rules and how we act when rules are broken.', '' ],
		'/legal/data-protection/' => [ 'Data protection and NDPA compliance | Shopinbos', 'How Shopinbos meets the Nigeria Data Protection Act 2023, our role as your data processor and what sellers need to do for their customers.', 'NDPA compliance' ],
		'/legal/ip-complaints/' => [ 'Copyright and trademark complaints | Shopinbos', 'How to report a Shopinbos store that uses your brand, photos or content without permission, and what happens next.', '' ],
		'/legal/affiliate-terms/' => [ 'Affiliate programme terms | Shopinbos', 'The rules for earning a commission by referring new sellers to Shopinbos: how referrals count, how you are paid and how to promote us.', '' ],
		'/legal/website-terms/' => [ 'Website terms of use | Shopinbos', 'Terms for using shopinbos.com: the blog, Academy, free tools, guides and PDFs, and how you may use our content.', '' ],
		'/legal/security/' => [ 'Security and responsible disclosure | Shopinbos', 'How Shopinbos protects your shop and data, and how to report a security issue to us safely.', '' ],
	];
}

/** Trim to a length at a word boundary. */
function sib_seo_clip( string $s, int $max ): string {
	$s = trim( preg_replace( '/\s+/', ' ', wp_strip_all_tags( html_entity_decode( $s, ENT_QUOTES, 'UTF-8' ) ) ) );
	if ( mb_strlen( $s ) <= $max ) {
		return $s;
	}
	$cut = mb_substr( $s, 0, $max - 1 );
	$cut = preg_replace( '/[\s,;:–—-]+\S*$/u', '', $cut );
	return rtrim( $cut, ' ,;:–—-' ) . '…';
}

/** A title of at most 60 characters: the page's own title plus a suffix when it fits. */
function sib_seo_title_fit( string $title, array $suffixes ): string {
	$title = trim( html_entity_decode( wp_strip_all_tags( $title ), ENT_QUOTES, 'UTF-8' ) );
	foreach ( $suffixes as $suffix ) {
		if ( mb_strlen( $title . $suffix ) <= 60 ) {
			return $title . $suffix;
		}
	}
	return sib_seo_clip( $title, 60 );
}

/** A 120–155 character description from a summary, topped up with a sentence that names the keyword. */
function sib_seo_desc_fit( string $summary, string $tail ): string {
	$d = sib_seo_clip( $summary, 155 );
	if ( mb_strlen( $d ) < 115 && $tail ) {
		$d = rtrim( $d, '.…' ) . ( $d ? '. ' : '' ) . $tail;
		$d = sib_seo_clip( $d, 155 );
	}
	return $d;
}

/** [title, description, keyword] for a post of any type. */
function sib_seo_auto( WP_Post $post ): array {
	$path = (string) wp_parse_url( get_permalink( $post ), PHP_URL_PATH );
	$map  = sib_seo_map();
	if ( isset( $map[ $path ] ) ) {
		return $map[ $path ];
	}
	$t       = get_the_title( $post );
	$summary = has_excerpt( $post ) ? $post->post_excerpt : wp_trim_words( strip_shortcodes( $post->post_content ), 40, '' );
	switch ( $post->post_type ) {
		case 'post':
			return [ sib_seo_title_fit( $t, [ ' | Shopinbos' ] ), sib_seo_desc_fit( $summary, 'A plain-word guide for people selling online in Nigeria.' ), '' ];
		case 'sib_resource':
			return [ sib_seo_title_fit( $t, [ ' (free PDF) | Shopinbos', ': free PDF', ' | Shopinbos' ] ), sib_seo_desc_fit( $summary, 'Free PDF for Nigerian online sellers: download it straight away.' ), '' ];
		case 'sib_lesson':
			return [ sib_seo_title_fit( $t, [ ' | Free Shopinbos Academy', ' | Shopinbos Academy', ' | Shopinbos' ] ), sib_seo_desc_fit( $summary, 'A short free lesson from the Shopinbos Academy, in plain English and Pidgin.' ), '' ];
		case 'sib_help':
			return [ sib_seo_title_fit( $t, [ ' | Shopinbos Help', ' | Shopinbos' ] ), sib_seo_desc_fit( $summary, 'Step-by-step help for your Shopinbos shop. Still stuck? Chat with us on WhatsApp.' ), '' ];
		case 'sib_template':
			return [ sib_seo_title_fit( $t . ' online store template', [ ' | Shopinbos' ] ), sib_seo_desc_fit( $summary, 'A free, mobile-first store template with pay on delivery and WhatsApp ordering built in.' ), 'online store template' ];
		case 'sib_tool':
			return [ sib_seo_title_fit( $t, [ ': free for Nigerian sellers', ' (free) | Shopinbos', ' | Shopinbos' ] ), sib_seo_desc_fit( $summary, 'Free, in naira. Unlock once with your email and WhatsApp.' ), strtolower( $t ) ];
		case 'sib_comparison':
			return [ sib_seo_title_fit( $t, [ ' (2026): honest comparison', ' (2026) | Shopinbos', ' | Shopinbos' ] ), sib_seo_desc_fit( $summary, 'An honest comparison for Nigerian sellers: prices, payments, delivery and support.' ), strtolower( $t ) ];
		case 'sib_trend':
			return [ sib_seo_title_fit( $t, [ ' | Shopinbos' ] ), sib_seo_desc_fit( $summary, 'Products trending on TikTok that Nigerian sellers can stock, with naira prices and suppliers.' ), 'trending tiktok products' ];
		case 'sib_city':
			return [ sib_seo_title_fit( 'Sell online in ' . $t, [ ' | Shopinbos' ] ), sib_seo_desc_fit( $summary, 'Online store, pay on delivery and same-day riders for sellers in ' . $t . '.' ), 'sell online in ' . strtolower( $t ) ];
		default:
			return [ sib_seo_title_fit( $t, [ ' | Shopinbos' ] ), sib_seo_desc_fit( $summary, 'Shopinbos: sell online in Nigeria from one app.' ), '' ];
	}
}

/** [title, description] for the current request, from the map or the post; empty when nothing applies. */
function sib_seo_current(): array {
	if ( function_exists( 'sib_virtual' ) && sib_virtual() ) {
		return [];
	}
	$path = (string) wp_parse_url( add_query_arg( [] ), PHP_URL_PATH );
	$path = trailingslashit( preg_replace( '#/page/\d+/?$#', '/', $path ) );
	$map  = sib_seo_map();
	if ( isset( $map[ $path ] ) ) {
		return $map[ $path ];
	}
	if ( is_singular() ) {
		return sib_seo_auto( get_queried_object() );
	}
	if ( is_category() || is_tax() ) {
		$term = get_queried_object();
		$what = [ 'category' => 'Blog', 'sib_help_category' => 'Help', 'sib_track' => 'Academy' ][ $term->taxonomy ] ?? 'Shopinbos';
		$desc = wp_strip_all_tags( term_description( $term ) );
		$tail = [
			'category'          => 'Plain-word guides on ' . strtolower( $term->name ) . ' for people selling online in Nigeria.',
			'sib_help_category' => 'Step-by-step answers about ' . strtolower( $term->name ) . ' for your Shopinbos shop.',
			'sib_track'         => 'Free short lessons on ' . strtolower( $term->name ) . ' from the Shopinbos Academy.',
		][ $term->taxonomy ] ?? '';
		$title = [ 'category' => $term->name . ': selling tips for Nigeria', 'sib_help_category' => $term->name . ': help and answers', 'sib_track' => $term->name . ': free lessons' ][ $term->taxonomy ] ?? $term->name;
		return [ sib_seo_title_fit( $title, [ ' | Shopinbos ' . $what, ' | Shopinbos' ] ), sib_seo_desc_fit( $desc, $tail ), '' ];
	}
	return [];
}
