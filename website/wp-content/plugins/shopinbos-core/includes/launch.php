<?php
/**
 * Launch switch, Coming soon page and app store badges.
 *
 * Settings > Shopinbos website > Launch:
 *  - "The web app is live" off: /go/ sign-up and log-in links land on /coming-soon/ (a waitlist form)
 *    instead of the app. Tick it on launch day.
 *  - "Show only the Coming soon page": hides the whole site from visitors (editors still see it), with a 503
 *    so search engines come back later.
 * Store badges: App Store and Google Play. Without a store link a badge says "Coming soon" and opens a
 * "tell me when it's live" form. Waitlist and notify-me sign-ups go to the app's Website leads.
 */

defined( 'ABSPATH' ) || exit;

function sib_app_live(): bool {
	return '1' === (string) sib_setting( 'app_live' );
}

/* /go/ while the app isn't live: the waitlist page, keeping what they came for. */
add_action( 'template_redirect', function () {
	$target = get_query_var( 'sib_go' );
	if ( ! $target || sib_app_live() ) {
		return;
	}
	$keep = array_intersect_key( wp_unslash( $_GET ), array_flip( [ 'intent', 'productSlug', 'template', 'plan', 'tool' ] ) ); // phpcs:ignore WordPress.Security.NonceVerification
	$keep = array_map( fn( $v ) => is_string( $v ) ? mb_substr( sanitize_key( $v ), 0, 80 ) : '', $keep );
	$keep['as'] = [ 'supplier' => 'supplier', 'partner' => 'delivery' ][ $target ] ?? 'seller';
	nocache_headers();
	wp_safe_redirect( add_query_arg( array_filter( $keep ), home_url( '/coming-soon/' ) ), 302, 'Shopinbos website' );
	exit;
}, 0 );

/* Site-wide Coming soon for visitors. */
add_action( 'template_redirect', function () {
	if ( '1' !== (string) sib_setting( 'site_coming_soon' ) || current_user_can( 'edit_posts' ) || is_page( 'coming-soon' ) || is_page( 'privacy' ) || is_page( 'terms' ) ) {
		return;
	}
	header( 'Retry-After: 86400' );
	nocache_headers();
	wp_safe_redirect( home_url( '/coming-soon/' ), 302 );
	exit;
}, 2 );

/** An App Store or Google Play badge. */
/** The badge and Coming soon styles, printed with the first badge so page caches that strip "unused" CSS
 *  (LiteSpeed's UCSS) can't leave them unstyled. */
function sib_launch_css( bool $page = false ): string {
	static $done = [];
	$key = $page ? 'page' : 'badge';
	if ( isset( $done[ $key ] ) ) {
		return '';
	}
	$done[ $key ] = true;
	return '<style>' . ( $page ? 'section.cv.ahero.cs{padding:56px 0 88px;background:linear-gradient(#FFF6F1 0%,#fff 100%);position:relative;overflow:hidden}.cs-perks{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}.cs-perks li{display:flex;gap:10px;align-items:center;font-weight:600}.cs-perks li::marker{content:none}.cs-blob{position:absolute;width:520px;height:520px;border-radius:999px;background:#FFE27A;opacity:.45;right:-160px;top:-200px}.cs-top{padding:22px 0;background:#FFF6F1}.cs-foot{padding:24px 0;border-top:1px solid #ECEAF2;font-size:13.5px;color:#6B6779}.cs-foot .wrap{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}.cs-foot a{color:inherit}@media (max-width:640px){section.cv.ahero.cs{padding:28px 0 56px}.cs h1{font-size:40px!important}}' : '.store-badges{display:flex;gap:10px;flex-wrap:wrap}.store-badge{position:relative;display:inline-flex;align-items:center;gap:10px;min-height:54px;padding:0 18px 0 14px;border-radius:14px;background:#16141F;color:#fff;border:1px solid #16141F;text-decoration:none;font-family:inherit;cursor:pointer;text-align:left;transition:transform .18s ease,box-shadow .18s ease}.store-badge:hover{transform:translateY(-1px);box-shadow:0 10px 22px -12px rgba(22,20,31,.5);color:#fff}.store-badge span{display:flex;flex-direction:column;font-size:17px;font-weight:800;line-height:1.1;letter-spacing:-.01em}.store-badge small{font-size:10.5px;font-weight:600;opacity:.75;letter-spacing:.02em}.store-badge em{font-style:normal;font-size:10.5px;font-weight:800;background:#FF6A2B;color:#fff;border-radius:999px;padding:3px 8px;margin-left:4px}.store-badge.is-light{background:#fff;color:#16141F;border-color:#ECEAF2}' ) . '</style>';
}

function sib_store_badge( string $store, string $style = 'dark' ): string {
	$ios   = 'ios' === $store;
	$url   = (string) sib_setting( $ios ? 'ios_url' : 'android_url' );
	$soon  = ! $url;
	$logo  = $ios
		? '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/></svg>'
		: '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path fill="#00D7FE" d="M3.6 1.8c-.3.3-.5.8-.5 1.4v17.6c0 .6.2 1.1.5 1.4l.1.1 9.9-9.9v-.2L3.7 1.7z"/><path fill="#FFCE00" d="M16.9 15.6l-3.3-3.3v-.2l3.3-3.3.1.1 3.9 2.2c1.1.6 1.1 1.7 0 2.3l-3.9 2.2z"/><path fill="#FF3A44" d="M17 15.5l-3.4-3.4L3.6 22.2c.4.4 1 .4 1.7.1L17 15.5"/><path fill="#00F076" d="M17 8.7L5.3 1.9c-.7-.4-1.3-.3-1.7.1l10 10L17 8.7z"/></svg>';
	$small = $soon ? __( 'Coming soon on', 'shopinbos' ) : ( $ios ? __( 'Download on the', 'shopinbos' ) : __( 'Get it on', 'shopinbos' ) );
	$name  = $ios ? 'App Store' : 'Google Play';
	$cls   = 'store-badge' . ( 'light' === $style ? ' is-light' : '' ) . ( $soon ? ' is-soon' : '' );
	$inner = $logo . '<span><small>' . esc_html( $small ) . '</small>' . esc_html( $name ) . '</span>' . ( $soon ? '<em>' . esc_html__( 'Notify me', 'shopinbos' ) . '</em>' : '' );
	return sib_launch_css() . ( $soon
		? '<button type="button" class="' . $cls . '" data-cv="pop.openApp" data-platform="' . ( $ios ? 'ios' : 'android' ) . '" aria-label="' . esc_attr( sprintf( __( '%s app coming soon. Tell me when it’s live', 'shopinbos' ), $name ) ) . '">' . $inner . '</button>'
		: '<a class="' . $cls . '" href="' . esc_url( $url ) . '" rel="noopener" target="_blank">' . $inner . '</a>' );
}

/** The "tell me when the app is live" pop-up (added to the site's pop-ups). */
function sib_app_notify_popup(): string {
	return '<div class="ovl" data-pop="app" hidden><div class="modal" style="width:100%;max-width:440px;padding:26px;display:flex;flex-direction:column;gap:12px;position:relative">'
		. '<span class="tag" style="background:#FFEDE4;color:#B23E0A;align-self:flex-start">' . esc_html__( 'Coming soon', 'shopinbos' ) . '</span>'
		. '<b class="disp" style="font-size:24px;line-height:1.1">' . esc_html__( 'The Shopinbos app is almost here', 'shopinbos' ) . '</b>'
		. '<span class="p" style="font-size:14.5px">' . esc_html__( 'Leave your WhatsApp number or email and we’ll tell you the day it’s live. One message, no spam.', 'shopinbos' ) . '</span>'
		. '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" data-cv-lead="app_notify" style="display:flex;flex-direction:column;gap:10px">'
		. '<select class="input" name="platform" aria-label="' . esc_attr__( 'Your phone', 'shopinbos' ) . '"><option value="android">' . esc_html__( 'Android (Google Play)', 'shopinbos' ) . '</option><option value="ios">' . esc_html__( 'iPhone (App Store)', 'shopinbos' ) . '</option><option value="web">' . esc_html__( 'Web app on my computer', 'shopinbos' ) . '</option></select>'
		. '<input class="input" name="contact" required placeholder="' . esc_attr__( 'WhatsApp number or email', 'shopinbos' ) . '" aria-label="' . esc_attr__( 'WhatsApp number or email', 'shopinbos' ) . '" autocomplete="email tel">'
		. '<button class="btn btn-acc" type="submit">' . esc_html__( 'Tell me when it’s live', 'shopinbos' ) . '</button>'
		. '<input type="hidden" name="action" value="sib_lead"><input type="hidden" name="kind" value="app_notify"><input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px"></form>'
		. '<button aria-label="' . esc_attr__( 'Close', 'shopinbos' ) . '" class="x" data-cv="pop.close"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div></div>';
}

add_action( 'init', function () {
	sib_register_block_group( [
		'coming-soon' => [ __( 'Coming soon and waitlist', 'shopinbos' ), 'sib_render_coming_soon', [] ],
		'store-badges' => [ __( 'App store badges', 'shopinbos' ), 'sib_render_store_badges', [] ],
	], 'widgets' );
}, 11 );

function sib_render_store_badges(): string {
	return '<div class="store-badges">' . sib_store_badge( 'android' ) . sib_store_badge( 'ios' ) . '</div>';
}

function sib_render_coming_soon(): string {
	$as     = sanitize_key( wp_unslash( $_GET['as'] ?? 'seller' ) ); // phpcs:ignore WordPress.Security.NonceVerification
	$intent = sanitize_key( wp_unslash( $_GET['intent'] ?? '' ) ); // phpcs:ignore WordPress.Security.NonceVerification
	$opt    = fn( $v, $l ) => '<option value="' . $v . '"' . selected( $as, $v, false ) . '>' . esc_html( $l ) . '</option>';
	$form   = '<form class="card" method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" data-cv-lead="waitlist" style="padding:24px;display:flex;flex-direction:column;gap:12px;box-shadow:rgba(255,106,43,.45) 0 30px 60px -36px">'
		. '<b style="font-size:18px">' . esc_html__( 'Get early access', 'shopinbos' ) . '</b>'
		. '<input class="input" name="name" placeholder="' . esc_attr__( 'Your first name', 'shopinbos' ) . '" aria-label="' . esc_attr__( 'Your first name', 'shopinbos' ) . '" autocomplete="given-name">'
		. '<input class="input" name="contact" required placeholder="' . esc_attr__( 'WhatsApp number or email', 'shopinbos' ) . '" aria-label="' . esc_attr__( 'WhatsApp number or email', 'shopinbos' ) . '" autocomplete="email tel">'
		. '<select class="input" name="as" aria-label="' . esc_attr__( 'I want to', 'shopinbos' ) . '">' . $opt( 'seller', __( 'I want to sell online', 'shopinbos' ) ) . $opt( 'supplier', __( 'I’m a supplier or wholesaler', 'shopinbos' ) ) . $opt( 'delivery', __( 'I’m a delivery company or rider', 'shopinbos' ) ) . '</select>'
		. '<input class="input" name="sells" placeholder="' . esc_attr__( 'What do you sell? (optional)', 'shopinbos' ) . '" aria-label="' . esc_attr__( 'What do you sell', 'shopinbos' ) . '">'
		. '<button class="btn btn-acc" type="submit">' . esc_html__( 'Join the waitlist', 'shopinbos' ) . sib_icon( 'arrow', 16 ) . '</button>'
		. '<span class="meta">' . esc_html__( 'We’ll message you once when your spot is ready. No spam.', 'shopinbos' ) . '</span>'
		. '<input type="hidden" name="action" value="sib_lead"><input type="hidden" name="kind" value="waitlist"><input type="hidden" name="intent" value="' . esc_attr( $intent ) . '"><input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px"></form>';
	$perks = [ __( 'Your store built with Rex in 5 minutes', 'shopinbos' ), __( 'Sell on WhatsApp, Instagram, TikTok and your own site', 'shopinbos' ), __( 'Pay on delivery, riders and Friday payouts', 'shopinbos' ), __( 'Early sellers get help setting up, free', 'shopinbos' ) ];
	$list  = '<ul class="cs-perks">' . implode( '', array_map( fn( $p ) => '<li>' . sib_icon( 'tick', 18, '#16794A' ) . esc_html( $p ) . '</li>', $perks ) ) . '</ul>';
	return sib_launch_css( true ) . '<section class="ahero cv cs">'
		. '<span class="cs-blob"></span><div class="wrap split" style="gap:56px;position:relative">'
		. '<div style="display:flex;flex-direction:column;gap:18px"><span class="pill" style="align-self:flex-start"><span class="gist-dot"></span>' . esc_html__( 'Launching soon', 'shopinbos' ) . '</span>'
		. '<h1 class="disp h1" style="font-size:60px">' . esc_html__( 'Shopinbos is', 'shopinbos' ) . ' <span class="grad">' . esc_html__( 'almost here', 'shopinbos' ) . '</span></h1>'
		. '<p class="lead">' . esc_html__( 'We’re putting the finishing touches to the web app and the Android app. Join the waitlist and we’ll tell you the moment your shop can go live.', 'shopinbos' ) . '</p>'
		. $list . '<div class="store-badges">' . sib_store_badge( 'android' ) . sib_store_badge( 'ios' ) . '</div></div>'
		. '<div style="display:flex;flex-direction:column;gap:16px">' . $form . '<a class="lnk cv-b" style="align-self:center" href="' . esc_url( home_url( '/academy/' ) ) . '">' . esc_html__( 'While you wait: free lessons in the Academy', 'shopinbos' ) . sib_icon( 'arrow', 16 ) . '</a></div>'
		. '</div></section>';
}

/** What pop-up forms ask for: email (default), whatsapp or either (Settings > Shopinbos website > Pop-ups). */
function sib_popup_collect(): string {
	$mode = (string) sib_setting( 'popup_collect' );
	return in_array( $mode, [ 'email', 'whatsapp', 'either' ], true ) ? $mode : 'email';
}

/** Rewrite the pop-ups' contact fields and the words around them for the chosen mode. */
function sib_popup_contact_mode( string $html ): string {
	$mode = sib_popup_collect();
	if ( 'either' === $mode ) {
		return $html;
	}
	$email = 'email' === $mode;
	$label = $email ? __( 'Your email', 'shopinbos' ) : __( 'WhatsApp number', 'shopinbos' );
	$attrs = $email
		? 'type="email" inputmode="email" autocomplete="email" placeholder="' . esc_attr( $label ) . '" aria-label="' . esc_attr( $label ) . '"'
		: 'type="tel" inputmode="tel" autocomplete="tel" placeholder="' . esc_attr( $label ) . '" aria-label="' . esc_attr( $label ) . '"';
	$html = preg_replace_callback( '/<input\b[^>]*\bname="contact"[^>]*>/', function ( $m ) use ( $attrs ) {
		$tag = preg_replace( '/\s(?:type|inputmode|autocomplete|placeholder|aria-label)="[^"]*"/', '', $m[0] );
		return preg_replace( '/^<input\b/', '<input ' . $attrs, $tag );
	}, $html );
	$words = $email ? [
		'Free PDF. We send it to your WhatsApp or email.' => __( 'Free PDF. We email it to you straight away.', 'shopinbos' ),
		'Check your WhatsApp. Want to start your shop while you read?' => __( 'Check your email. Want to start your shop while you read?', 'shopinbos' ),
		'Free, sent to your WhatsApp.' => __( 'Free, sent to your email.', 'shopinbos' ),
		'The top 5 products to sell this week, on WhatsApp. Free.' => __( 'The top 5 products to sell this week, in your inbox. Free.', 'shopinbos' ),
		'Leave your WhatsApp number or email and we’ll tell you' => __( 'Leave your email and we’ll tell you', 'shopinbos' ),
	] : [
		'Free PDF. We send it to your WhatsApp or email.' => __( 'Free PDF. We send it to your WhatsApp.', 'shopinbos' ),
		'Leave your WhatsApp number or email and we’ll tell you' => __( 'Leave your WhatsApp number and we’ll tell you', 'shopinbos' ),
	];
	return strtr( $html, $words );
}
