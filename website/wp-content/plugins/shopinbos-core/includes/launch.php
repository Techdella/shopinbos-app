<?php
/**
 * Launch: the waitlist until launch day, then the app.
 *
 * Until the launch date (Settings > Shopinbos website > Launch, default 1 November 2026, midnight in Lagos) every
 * "Start your shop", "Become a supplier" and "Join as a delivery partner" button opens the waitlist pop-up instead
 * of the app, and /go/ sign-up links land on /waitlist/. From launch day the buttons go straight to the app: the
 * switch is automatic (checked on the server and, for cached pages, in the browser). "Go live now" switches early.
 * Log-in links always go to the app. The rest of the website is never hidden.
 *
 * Store badges: App Store and Google Play. Without a store link a badge says "Coming soon" and opens a
 * "tell me when it's live" form. Waitlist and notify-me sign-ups go to the app's Website leads.
 */

defined( 'ABSPATH' ) || exit;

/** Launch moment as a Unix timestamp: the launch date at 00:00 in Lagos. */
function sib_launch_ts(): int {
	$date = (string) sib_setting( 'launch_date' );
	if ( ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $date ) ) {
		$date = '2026-11-01';
	}
	try {
		return ( new DateTimeImmutable( $date . ' 00:00:00', new DateTimeZone( 'Africa/Lagos' ) ) )->getTimestamp();
	} catch ( Exception $e ) {
		return 1793487600; // 2026-11-01 00:00 WAT
	}
}

function sib_app_live(): bool {
	return '1' === (string) sib_setting( 'app_live' ) || time() >= sib_launch_ts();
}

/** Days left until launch (0 on launch day or after). */
function sib_launch_days_left(): int {
	return max( 0, (int) ceil( ( sib_launch_ts() - time() ) / DAY_IN_SECONDS ) );
}

/** Who a /go/ target signs up as on the waitlist. */
function sib_waitlist_as( string $target ): string {
	return [ 'supplier' => 'supplier', 'supplier_signup' => 'supplier', 'partner' => 'delivery', 'partner_signup' => 'delivery' ][ $target ] ?? 'seller';
}

/* /go/ sign-up links before launch: the waitlist page, keeping what they came for. Log-in always goes to the app. */
add_action( 'template_redirect', function () {
	$target = get_query_var( 'sib_go' );
	if ( ! $target || 'login' === $target || sib_app_live() ) {
		return;
	}
	$keep = array_intersect_key( wp_unslash( $_GET ), array_flip( [ 'intent', 'productSlug', 'template', 'plan', 'tool' ] ) ); // phpcs:ignore WordPress.Security.NonceVerification
	$keep = array_map( fn( $v ) => is_string( $v ) ? mb_substr( sanitize_key( $v ), 0, 80 ) : '', $keep );
	$keep['as'] = sib_waitlist_as( (string) $target );
	nocache_headers();
	wp_safe_redirect( add_query_arg( array_filter( $keep ), home_url( '/waitlist/' ) ), 302, 'Shopinbos website' );
	exit;
}, 0 );

/* The old Coming soon page is now /waitlist/; after launch the waitlist page sends people to sign up. */
add_action( 'template_redirect', function () {
	if ( is_page( 'coming-soon' ) ) {
		wp_safe_redirect( add_query_arg( array_map( 'sanitize_key', wp_unslash( $_GET ) ), home_url( '/waitlist/' ) ), 301 ); // phpcs:ignore WordPress.Security.NonceVerification
		exit;
	}
	if ( is_page( 'waitlist' ) && sib_app_live() && ! is_user_logged_in() ) {
		$as = sanitize_key( wp_unslash( $_GET['as'] ?? 'seller' ) ); // phpcs:ignore WordPress.Security.NonceVerification
		nocache_headers();
		wp_safe_redirect( sib_go_url( [ 'supplier' => 'supplier_signup', 'delivery' => 'partner_signup' ][ $as ] ?? 'waitlist' ), 302 );
		exit;
	}
}, 1 );

/* The browser double-checks the launch moment, so cached pages switch on time too. */
add_action( 'wp_enqueue_scripts', function () {
	wp_add_inline_script( 'sib-site', 'window.SIB_LAUNCH=' . wp_json_encode( [ 'at' => sib_launch_ts() * 1000, 'live' => sib_app_live(), 'waitlist' => home_url( '/waitlist/' ) ] ) . ';', 'before' );
}, 20 );
add_filter( 'body_class', fn( $c ) => array_merge( $c, [ sib_app_live() ? 'sib-live' : 'sib-prelaunch' ] ) );

/** The badge and Coming soon styles, printed with the first badge so page caches that strip "unused" CSS
 *  (LiteSpeed's UCSS) can't leave them unstyled. */
function sib_launch_css( bool $page = false ): string {
	static $done = [];
	$key = $page ? 'page' : 'badge';
	if ( isset( $done[ $key ] ) ) {
		return '';
	}
	$done[ $key ] = true;
	return '<style>' . ( $page ? 'section.cv.ahero.cs{padding:56px 0 88px;background:linear-gradient(#FFF6F1 0%,#fff 100%);position:relative;overflow:hidden}.cs-perks{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}.cs-perks li{display:flex;gap:10px;align-items:center;font-weight:600}.cs-perks li::marker{content:none}.cs-blob{position:absolute;width:520px;height:520px;border-radius:999px;background:#FFE27A;opacity:.45;right:-160px;top:-200px}.cs-top{padding:22px 0;background:#FFF6F1}.cs-foot{padding:24px 0;border-top:1px solid #ECEAF2;font-size:13.5px;color:#6B6779}.cs-foot .wrap{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}.cs-foot a{color:inherit}@media (max-width:640px){section.cv.ahero.cs{padding:28px 0 56px}.cs h1{font-size:40px!important}}.wl-hero{position:relative;overflow:hidden;padding:56px 0 80px;background:linear-gradient(#FFF6F1 0%,#fff 100%)}.wl-grid{position:relative;display:grid;grid-template-columns:1.25fr .75fr;gap:56px;align-items:center}.wl-copy{display:flex;flex-direction:column;gap:18px}.wl-copy h1{font-size:56px}.wl-card{background:#fff;border:1px solid #ECEAF2;border-radius:24px;padding:22px;box-shadow:rgba(255,106,43,.45) 0 30px 60px -36px;max-width:560px}.wl-film{margin:0;display:flex;flex-direction:column;align-items:center;gap:10px}.wl-film video{width:100%;max-width:340px;aspect-ratio:9/16;height:auto;border-radius:26px;background:#16141F;box-shadow:0 40px 80px -36px rgba(22,20,31,.6)}.wl-film figcaption{font-weight:700;font-size:14px;color:#6B6779}.wl-who{padding:72px 0}.wl-who h2{margin:8px 0 28px}.wl-aud{padding:24px;display:flex;flex-direction:column;gap:12px}.wl-aud .av{width:46px;height:46px}.wl-aud h3{margin:0;font-size:20px}.wl-aud ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:9px}.wl-aud li{display:flex;gap:9px;align-items:flex-start;font-size:14.5px;color:#4A4658}.wl-aud li svg{flex:none;margin-top:3px}.wl-aud .btn{margin-top:auto;align-self:flex-start}@media (max-width:900px){.wl-grid{grid-template-columns:1fr;gap:36px}.wl-copy h1{font-size:40px}}' : '.store-badges{display:flex;gap:10px;flex-wrap:wrap}.store-badge{position:relative;display:inline-flex;align-items:center;gap:10px;min-height:54px;padding:0 18px 0 14px;border-radius:14px;background:#16141F;color:#fff;border:1px solid #16141F;text-decoration:none;font-family:inherit;cursor:pointer;text-align:left;transition:transform .18s ease,box-shadow .18s ease}.store-badge:hover{transform:translateY(-1px);box-shadow:0 10px 22px -12px rgba(22,20,31,.5);color:#fff}.store-badge span{display:flex;flex-direction:column;font-size:17px;font-weight:800;line-height:1.1;letter-spacing:-.01em}.store-badge small{font-size:10.5px;font-weight:600;opacity:.75;letter-spacing:.02em}.store-badge em{font-style:normal;font-size:10.5px;font-weight:800;background:#FF6A2B;color:#fff;border-radius:999px;padding:3px 8px;margin-left:4px}.store-badge.is-light{background:#fff;color:#16141F;border-color:#ECEAF2}' ) . '</style>';
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
		'coming-soon'  => [ __( 'Waitlist page', 'shopinbos' ), 'sib_render_waitlist_page', [] ],
		'store-badges' => [ __( 'App store badges', 'shopinbos' ), 'sib_render_store_badges', [] ],
	], 'widgets' );
}, 11 );

function sib_render_store_badges(): string {
	return '<div class="store-badges">' . sib_store_badge( 'android' ) . sib_store_badge( 'ios' ) . '</div>';
}

/** Who can join, with what the optional field asks each of them. */
function sib_waitlist_audiences(): array {
	return [
		'seller'   => [ __( 'Seller', 'shopinbos' ), __( 'What do you sell? (optional)', 'shopinbos' ), __( 'I want to sell online', 'shopinbos' ) ],
		'supplier' => [ __( 'Supplier', 'shopinbos' ), __( 'What do you supply, and where? (optional)', 'shopinbos' ), __( 'I’m a supplier or wholesaler', 'shopinbos' ) ],
		'delivery' => [ __( 'Logistics partner', 'shopinbos' ), __( 'Cities you cover and fleet size (optional)', 'shopinbos' ), __( 'I run a delivery company or ride', 'shopinbos' ) ],
	];
}

/** The waitlist form, for the page and the pop-up. */
function sib_waitlist_form( string $as = 'seller', string $intent = '', bool $popup = false ): string {
	$aud = sib_waitlist_audiences();
	$as  = isset( $aud[ $as ] ) ? $as : 'seller';
	$uid = $popup ? 'wlp' : 'wl';
	$out = '<form class="wl-form" method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" data-cv-lead="waitlist">'
		. '<fieldset class="wl-as"><legend>' . esc_html__( 'I’m joining as', 'shopinbos' ) . '</legend>';
	foreach ( $aud as $key => [ $label, $ph ] ) {
		$out .= '<label><input type="radio" name="as" value="' . $key . '" data-wl-ph="' . esc_attr( $ph ) . '"' . checked( $as, $key, false ) . '><span>' . esc_html( $label ) . '</span></label>';
	}
	$out .= '</fieldset>'
		. '<input class="input" name="name" placeholder="' . esc_attr__( 'Your first name', 'shopinbos' ) . '" aria-label="' . esc_attr__( 'Your first name', 'shopinbos' ) . '" autocomplete="given-name">'
		. '<div class="wl-two"><input class="input" name="phone" type="tel" inputmode="tel" required autocomplete="tel" placeholder="' . esc_attr__( 'WhatsApp number', 'shopinbos' ) . '" aria-label="' . esc_attr__( 'WhatsApp number', 'shopinbos' ) . '">'
		. '<input class="input" name="email" type="email" inputmode="email" autocomplete="email" placeholder="' . esc_attr__( 'Email (optional)', 'shopinbos' ) . '" aria-label="' . esc_attr__( 'Email (optional)', 'shopinbos' ) . '"></div>'
		. '<input class="input" name="sells" data-wl-field placeholder="' . esc_attr( $aud[ $as ][1] ) . '" aria-label="' . esc_attr__( 'About your business', 'shopinbos' ) . '">'
		. '<button class="btn btn-acc" type="submit">' . esc_html__( 'Join the waitlist', 'shopinbos' ) . sib_icon( 'arrow', 16 ) . '</button>'
		. '<span class="meta">' . esc_html__( 'Free. We’ll message you on WhatsApp (and email, if you add it) when your spot opens on November 1. No spam.', 'shopinbos' ) . '</span>'
		. '<input type="hidden" name="action" value="sib_lead"><input type="hidden" name="kind" value="waitlist"><input type="hidden" name="intent" value="' . esc_attr( $intent ) . '"><input type="hidden" name="back" value=""><input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px"></form>';
	return str_replace( 'wl-form"', 'wl-form" id="' . $uid . '-form"', $out );
}

/** Countdown line, e.g. "Opens in 16 days". The browser keeps it current on cached pages. */
function sib_launch_countdown(): string {
	$d = sib_launch_days_left();
	$t = $d > 1 ? sprintf( __( 'Opens in %d days', 'shopinbos' ), $d ) : ( 1 === $d ? __( 'Opens tomorrow', 'shopinbos' ) : __( 'Open now', 'shopinbos' ) );
	return '<span class="wl-count" data-wl-count><span class="gist-dot"></span>' . esc_html( $t ) . ' · ' . esc_html( wp_date( 'j F', sib_launch_ts() ) ) . '</span>';
}

/** The waitlist pop-up: sign-up buttons open it before launch. */
function sib_waitlist_popup(): string {
	return '<div class="ovl" data-pop="waitlist" hidden><div class="modal wl-modal">'
		. sib_launch_countdown()
		. '<b class="disp">' . esc_html__( 'Shopinbos opens November 1. Get in first.', 'shopinbos' ) . '</b>'
		. '<span class="p">' . esc_html__( 'Join the waitlist and we’ll save your spot. Early sellers, suppliers and delivery partners get free setup help.', 'shopinbos' ) . '</span>'
		. sib_waitlist_form( 'seller', '', true )
		. '<button aria-label="' . esc_attr__( 'Close', 'shopinbos' ) . '" class="x" data-cv="pop.close"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div></div>';
}

/** The /waitlist/ page: who it's for, the launch film, the form, and questions. */
function sib_render_waitlist_page(): string {
	$as     = sanitize_key( wp_unslash( $_GET['as'] ?? 'seller' ) ); // phpcs:ignore WordPress.Security.NonceVerification
	$intent = sanitize_key( wp_unslash( $_GET['intent'] ?? '' ) ); // phpcs:ignore WordPress.Security.NonceVerification
	$vid    = get_theme_file_uri( 'assets/video/shopinbos-launch.mp4' );
	$poster = get_theme_file_uri( 'assets/video/shopinbos-launch.webp' );

	$out = sib_launch_css( true ) . '<section class="cv wl-hero"><span class="cs-blob" aria-hidden="true"></span><div class="wrap wl-grid">'
		. '<div class="wl-copy">' . sib_launch_countdown()
		. '<h1 class="disp h1">' . esc_html__( 'Join the Shopinbos waitlist', 'shopinbos' ) . ' <span class="grad">' . esc_html__( 'before November 1', 'shopinbos' ) . '</span></h1>'
		. '<p class="lead">' . esc_html__( 'One app to sell online in Nigeria: your store, WhatsApp, Instagram and TikTok in one place, pay on delivery, riders and Friday payouts. Sellers, suppliers and delivery partners who join now get in first, with free setup help.', 'shopinbos' ) . '</p>'
		. '<div class="wl-card">' . sib_waitlist_form( $as, $intent ) . '</div>'
		. '<div class="store-badges">' . sib_store_badge( 'android' ) . sib_store_badge( 'ios' ) . '</div></div>'
		. '<figure class="wl-film"><video src="' . esc_url( $vid ) . '" poster="' . esc_url( $poster ) . '" controls playsinline preload="none" width="360" height="640" aria-label="' . esc_attr__( 'Shopinbos launch film: for the people who sell online in Nigeria', 'shopinbos' ) . '"></video><figcaption>' . esc_html__( 'Watch: Shopinbos in 34 seconds', 'shopinbos' ) . '</figcaption></figure>'
		. '</div></section>';

	$cards = [
		'seller'   => [ __( 'For sellers', 'shopinbos' ), '#FFF1E8', '#C2410C', 'store', [ __( 'Rex builds your store from a chat, in about 5 minutes', 'shopinbos' ), __( 'Sell on your own link, WhatsApp, Instagram and TikTok', 'shopinbos' ), __( 'Peggy answers customers and sends pay links', 'shopinbos' ), __( 'Pay on delivery with a code, payouts every Friday', 'shopinbos' ) ], __( 'Join as a seller', 'shopinbos' ) ],
		'supplier' => [ __( 'For suppliers and wholesalers', 'shopinbos' ), '#FFF7D6', '#8A5A00', 'box', [ __( 'List your products once in Find stock', 'shopinbos' ), __( 'Sellers across Nigeria resell them for you', 'shopinbos' ), __( 'Get orders with the delivery already booked', 'shopinbos' ), __( 'Paid to your bank for every order', 'shopinbos' ) ], __( 'Join as a supplier', 'shopinbos' ) ],
		'delivery' => [ __( 'For logistics partners', 'shopinbos' ), '#E3EEFD', '#1F5FBF', 'truck', [ __( 'Delivery jobs from sellers across your cities', 'shopinbos' ), __( 'Clear pickup and drop-off, with live tracking', 'shopinbos' ), __( 'Pay on delivery codes, so riders hand over safely', 'shopinbos' ), __( 'Same-day cash-in and weekly settlements', 'shopinbos' ) ], __( 'Join as a delivery partner', 'shopinbos' ) ],
	];
	$out .= '<section class="cv wl-who"><div class="wrap"><p class="eyebrow">' . esc_html__( 'Who it’s for', 'shopinbos' ) . '</p><h2 class="disp h2">' . esc_html__( 'Three ways in, one launch day', 'shopinbos' ) . '</h2><div class="g3">';
	foreach ( $cards as $key => [ $title, $bg, $fg, $icon, $items, $cta ] ) {
		$out .= '<div class="card wl-aud" id="for-' . $key . '"><span class="av" style="background:' . $bg . '">' . sib_icon( $icon, 22, $fg ) . '</span><h3>' . esc_html( $title ) . '</h3><ul>';
		foreach ( $items as $i ) {
			$out .= '<li>' . sib_icon( 'tick', 16, '#16794A' ) . esc_html( $i ) . '</li>';
		}
		$out .= '</ul><a class="btn btn-ghost cv-b" href="' . esc_url( add_query_arg( 'as', $key, home_url( '/waitlist/' ) ) ) . '#wl-form" data-wl-join="' . $key . '">' . esc_html( $cta ) . sib_icon( 'arrow', 16 ) . '</a></div>';
	}
	$out .= '</div></div></section>';

	$faq = [
		[ __( 'When does Shopinbos launch?', 'shopinbos' ), __( 'On November 1, 2026: the web app and the Android app on Google Play. The iPhone app follows. Everyone on the waitlist hears from us first.', 'shopinbos' ) ],
		[ __( 'Is joining the waitlist free?', 'shopinbos' ), __( 'Yes. Joining is free, and you can start selling on the free plan when we open. You only pay if you choose a paid plan later.', 'shopinbos' ) ],
		[ __( 'What happens after I join?', 'shopinbos' ), __( 'We send you one message when your spot opens, with a link to set up. Early sellers, suppliers and delivery partners get free help from our team on WhatsApp.', 'shopinbos' ) ],
		[ __( 'Can suppliers and delivery companies join too?', 'shopinbos' ), __( 'Yes. Choose Supplier or Logistics partner on the form. Suppliers list products for sellers to resell; delivery partners get jobs from sellers in the cities they cover.', 'shopinbos' ) ],
		[ __( 'Which cities do you cover?', 'shopinbos' ), __( 'We start with Lagos, Abuja, Ibadan and Port Harcourt for pay on delivery, and nationwide delivery through our partners. Sellers anywhere in Nigeria can join.', 'shopinbos' ) ],
	];
	$out .= '<section class="cv faqsec" style="background:#F6F5F9;padding:72px 0"><div class="wrap split" style="align-items:start"><div style="display:flex;flex-direction:column;gap:14px"><p class="eyebrow">' . esc_html__( 'Questions', 'shopinbos' ) . '</p><h2 class="disp h2">' . esc_html__( 'About the waitlist', 'shopinbos' ) . '</h2></div><div style="display:flex;flex-direction:column;gap:10px">';
	foreach ( $faq as $i => [ $q, $a ] ) {
		$out .= '<div class="card" style="border-radius:20px"><button data-cv="item.toggle" aria-expanded="' . ( $i ? 'false' : 'true' ) . '" style="width:100%;background:none;border:0;padding:20px 22px;display:flex;justify-content:space-between;align-items:center;gap:16px;text-align:left;font-weight:800;font-size:16.5px;color:#16141F">' . esc_html( $q ) . '<span style="font-size:22px;color:#6B6779;flex:0 0 auto">' . ( $i ? '+' : '−' ) . '</span></button><p class="p qa-a"' . ( $i ? ' hidden' : '' ) . ' style="padding:0 22px 20px">' . esc_html( $a ) . '</p></div>';
	}
	$out .= '</div></div></section>';
	return $out;
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
