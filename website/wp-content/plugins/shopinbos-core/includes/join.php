<?php
/**
 * Waitlist landing page for ads: /join/ (short link) → /lp/join/ (a Campaign page with the "Join the waitlist"
 * block). No menu: one job, join the waitlist. Step 1: pick seller, supplier or delivery partner. Step 2: a short
 * form for that role. Step 3: you're in, with a WhatsApp share and a link to the rest of the website.
 *
 * Answers go through the normal lead pipeline (kind "waitlist"), so they show in the app at /admin/leads with the
 * role, the extra answers and the ad source (utm_* and fbclid). On success the Meta pixel gets a Lead event and
 * TikTok a SubmitForm event (the pixels only load on campaign pages, after cookie consent).
 * After launch the role buttons go straight to sign-up.
 */

defined( 'ABSPATH' ) || exit;

add_action( 'init', function () {
	sib_register_block_group( [
		'join' => [ __( 'Join the waitlist (ads landing)', 'shopinbos' ), 'sib_render_join', [] ],
	], 'widgets' );
	add_rewrite_rule( '^join/?$', 'index.php?sib_join=1', 'top' );
}, 11 );
add_filter( 'query_vars', fn( $v ) => array_merge( $v, [ 'sib_join' ] ) );

/* /join/ keeps the ad's query string (utm_*, fbclid). */
add_action( 'template_redirect', function () {
	if ( ! get_query_var( 'sib_join' ) ) {
		return;
	}
	$q = isset( $_SERVER['QUERY_STRING'] ) ? (string) wp_unslash( $_SERVER['QUERY_STRING'] ) : ''; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput
	wp_safe_redirect( home_url( '/lp/join/' ) . ( $q ? '?' . $q : '' ), 302 );
	exit;
}, 1 );

/** The three ways in: [label, one line, icon, background, colour, sign-up intent after launch]. */
function sib_join_roles(): array {
	return [
		'seller'   => [ __( 'I’m a seller', 'shopinbos' ), __( 'I sell online, or I want to start', 'shopinbos' ), 'store', '#FFF1E8', '#C2410C', 'signup' ],
		'supplier' => [ __( 'I’m a supplier', 'shopinbos' ), __( 'I have products for shops to sell: maker, wholesaler or importer', 'shopinbos' ), 'box', '#FFF7D6', '#8A5A00', 'supplier_signup' ],
		'delivery' => [ __( 'I do deliveries', 'shopinbos' ), __( 'I run a delivery company, or I ride', 'shopinbos' ), 'truck', '#E3EEFD', '#1F5FBF', 'partner_signup' ],
	];
}

function sib_join_states(): array {
	return [ 'Lagos', 'Abuja (FCT)', 'Oyo', 'Rivers', 'Kano', 'Ogun', 'Kaduna', 'Enugu', 'Anambra', 'Delta', 'Edo', 'Kwara', 'Abia', 'Adamawa', 'Akwa Ibom', 'Bauchi', 'Bayelsa', 'Benue', 'Borno', 'Cross River', 'Ebonyi', 'Ekiti', 'Gombe', 'Imo', 'Jigawa', 'Katsina', 'Kebbi', 'Kogi', 'Nasarawa', 'Niger', 'Ondo', 'Osun', 'Plateau', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara', __( 'Outside Nigeria', 'shopinbos' ) ];
}

/** Tappable options: radio (one) or checkbox (several). */
function sib_join_chips( string $name, array $options, bool $multi = false, bool $required = false ): string {
	$out = '<div class="jn-chips">';
	foreach ( $options as $o ) {
		$out .= '<label class="jn-chip"><input type="' . ( $multi ? 'checkbox' : 'radio' ) . '" name="' . esc_attr( $name . ( $multi ? '[]' : '' ) ) . '" value="' . esc_attr( $o ) . '"' . ( $required && ! $multi ? ' required' : '' ) . '><span>' . esc_html( $o ) . '</span></label>';
	}
	return $out . '</div>';
}

function sib_join_field( string $label, string $control, string $hint = '' ): string {
	return '<div class="jn-field"><span class="jn-label">' . esc_html( $label ) . ( $hint ? ' <em>' . esc_html( $hint ) . '</em>' : '' ) . '</span>' . $control . '</div>';
}

function sib_join_state_select( string $name ): string {
	$out = '<select class="input" name="' . esc_attr( $name ) . '" aria-label="' . esc_attr__( 'State', 'shopinbos' ) . '"><option value="">' . esc_html__( 'Choose your state', 'shopinbos' ) . '</option>';
	foreach ( sib_join_states() as $s ) {
		$out .= '<option>' . esc_html( $s ) . '</option>';
	}
	return $out . '</select>';
}

/** The extra questions for each role. Field names are what the app receives. */
function sib_join_role_fields( string $role ): string {
	$cats = [ __( 'Fashion', 'shopinbos' ), __( 'Beauty', 'shopinbos' ), __( 'Food products', 'shopinbos' ), __( 'Gadgets', 'shopinbos' ), __( 'Home and kitchen', 'shopinbos' ), __( 'Kids and baby', 'shopinbos' ), __( 'Other', 'shopinbos' ) ];
	switch ( $role ) {
		case 'seller':
			return sib_join_field( __( 'What do you sell?', 'shopinbos' ), sib_join_chips( 'category', $cats, true ) )
				. sib_join_field( __( 'Where do you sell now?', 'shopinbos' ), sib_join_chips( 'channels', [ 'WhatsApp', 'Instagram', 'TikTok', 'Facebook', __( 'Jumia or Konga', 'shopinbos' ), __( 'A physical shop', 'shopinbos' ), __( 'Not selling yet', 'shopinbos' ) ], true ) )
				. sib_join_field( __( 'Where are you based?', 'shopinbos' ), sib_join_state_select( 'state' ) );
		case 'supplier':
			return sib_join_field( __( 'Business name', 'shopinbos' ), '<input class="input" name="business" autocomplete="organization" placeholder="' . esc_attr__( 'e.g. Aba Leatherworks', 'shopinbos' ) . '">' )
				. sib_join_field( __( 'What do you supply?', 'shopinbos' ), sib_join_chips( 'category', $cats, true ) )
				. sib_join_field( __( 'How do you want to sell?', 'shopinbos' ), sib_join_chips( 'sell_mode', [ __( 'Shops dropship my products', 'shopinbos' ), __( 'Wholesale to shops', 'shopinbos' ) ], true ) )
				. sib_join_field( __( 'Is your business registered with CAC?', 'shopinbos' ), sib_join_chips( 'cac', [ __( 'Yes', 'shopinbos' ), __( 'In progress', 'shopinbos' ), __( 'Not yet', 'shopinbos' ) ] ) )
				. sib_join_field( __( 'Where do you ship from?', 'shopinbos' ), sib_join_state_select( 'state' ) );
		case 'delivery':
			return sib_join_field( __( 'You are…', 'shopinbos' ), sib_join_chips( 'partner_type', [ __( 'A delivery company', 'shopinbos' ), __( 'An independent rider', 'shopinbos' ) ] ) )
				. sib_join_field( __( 'Company name', 'shopinbos' ), '<input class="input" name="business" autocomplete="organization" placeholder="' . esc_attr__( 'Leave empty if you ride on your own', 'shopinbos' ) . '">' )
				. sib_join_field( __( 'Cities you cover', 'shopinbos' ), sib_join_chips( 'cities', [ 'Lagos', 'Abuja', 'Ibadan', 'Port Harcourt', 'Kano', __( 'Interstate', 'shopinbos' ), __( 'Other', 'shopinbos' ) ], true ) )
				. sib_join_field( __( 'Riders or vehicles', 'shopinbos' ), sib_join_chips( 'fleet', [ '1', '2–5', '6–20', '20+' ] ) )
				. sib_join_field( __( 'Do you collect cash on delivery?', 'shopinbos' ), sib_join_chips( 'cod', [ __( 'Yes', 'shopinbos' ), __( 'No', 'shopinbos' ) ] ) );
	}
	return '';
}

function sib_render_join(): string {
	$roles = sib_join_roles();
	$live  = function_exists( 'sib_app_live' ) && sib_app_live();
	$date  = wp_date( 'j F', function_exists( 'sib_launch_ts' ) ? sib_launch_ts() : strtotime( '2026-11-01' ) );
	$days  = function_exists( 'sib_launch_days_left' ) ? sib_launch_days_left() : 0;
	$site  = home_url( '/' );

	$out = sib_join_css() . '<div class="jn" data-jn>'
		. '<div class="jn-top wrap"><a href="' . esc_url( $site ) . '" aria-label="Shopinbos"><img src="' . esc_url( sib_img( 'logo-dark.png' ) ) . '" alt="Shopinbos" width="178" height="17" class="jn-logo"></a>'
		. '<a class="jn-site" href="' . esc_url( $site ) . '" data-jn-explore>' . esc_html__( 'See the website', 'shopinbos' ) . sib_icon( 'arrow', 15 ) . '</a></div>'
		. '<section class="jn-hero"><div class="wrap jn-grid"><div class="jn-copy">'
		. ( $live ? '' : '<span class="jn-count"><i></i>' . esc_html( $days > 1 ? sprintf( __( 'Opens in %1$d days · %2$s', 'shopinbos' ), $days, $date ) : sprintf( __( 'Opens %s', 'shopinbos' ), $date ) ) . '</span>' )
		. '<h1 class="disp jn-h1">' . ( $live ? esc_html__( 'Shopinbos is open. Pick how you’ll use it.', 'shopinbos' ) : esc_html__( 'Get in first when Shopinbos opens', 'shopinbos' ) ) . '</h1>'
		. '<p class="jn-lead">' . esc_html__( 'One app to sell online in Nigeria: your store, WhatsApp, Instagram and TikTok in one place, pay on delivery and riders. Sellers, suppliers and delivery partners on the list get in first, with free setup help.', 'shopinbos' ) . '</p>'
		. '<ul class="jn-ticks"><li>' . esc_html__( 'Free to join', 'shopinbos' ) . '</li><li>' . esc_html__( 'We message you on WhatsApp on launch day', 'shopinbos' ) . '</li><li>' . esc_html__( 'No card, no spam', 'shopinbos' ) . '</li></ul></div>';

	// The card: step 1 (role), step 2 (form), step 3 (done).
	$out .= '<div class="jn-card" id="join"><div class="jn-step" data-step="1"><p class="jn-kicker">' . ( $live ? esc_html__( 'Create your account', 'shopinbos' ) : esc_html__( 'Step 1 of 2', 'shopinbos' ) ) . '</p><h2 class="jn-h2">' . esc_html__( 'Which one are you?', 'shopinbos' ) . '</h2><div class="jn-roles">';
	foreach ( $roles as $key => [ $label, $line, $icon, $bg, $fg, $intent ] ) {
		$inner = '<span class="jn-ico" style="background:' . esc_attr( $bg ) . '">' . sib_icon( $icon, 24, $fg ) . '</span><span class="jn-rt"><b>' . esc_html( $label ) . '</b><span>' . esc_html( $line ) . '</span></span>' . sib_icon( 'arrow', 18 );
		$out  .= $live
			? '<a class="jn-role" href="' . esc_url( sib_go_url( $intent, [ 'source' => 'join' ] ) ) . '">' . $inner . '</a>'
			: '<button type="button" class="jn-role" data-role="' . esc_attr( $key ) . '">' . $inner . '</button>';
	}
	$out .= '</div></div>';

	if ( ! $live ) {
		$out .= '<form class="jn-step jn-form" data-step="2" hidden method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">'
			. '<div class="jn-head"><button type="button" class="jn-back" data-jn-back>' . sib_icon( 'back', 16 ) . esc_html__( 'Back', 'shopinbos' ) . '</button><p class="jn-kicker">' . esc_html__( 'Step 2 of 2', 'shopinbos' ) . '</p></div>'
			. '<h2 class="jn-h2" data-jn-title></h2>'
			. sib_join_field( __( 'Your first name', 'shopinbos' ), '<input class="input" name="name" required autocomplete="given-name" placeholder="' . esc_attr__( 'e.g. Adaeze', 'shopinbos' ) . '">' )
			. '<div class="jn-two">' . sib_join_field( __( 'WhatsApp number', 'shopinbos' ), '<input class="input" name="phone" type="tel" inputmode="tel" required autocomplete="tel" placeholder="0803 412 7790">' )
			. sib_join_field( __( 'Email', 'shopinbos' ), '<input class="input" name="email" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com">', __( 'optional', 'shopinbos' ) ) . '</div>';
		foreach ( array_keys( $roles ) as $key ) {
			$out .= '<fieldset class="jn-role-fields" data-for="' . esc_attr( $key ) . '" hidden disabled><legend class="sr-only">' . esc_html( $roles[ $key ][0] ) . '</legend>' . sib_join_role_fields( $key ) . '</fieldset>';
		}
		$out .= '<button class="btn btn-acc jn-submit" type="submit">' . esc_html__( 'Join the waitlist', 'shopinbos' ) . sib_icon( 'arrow', 16 ) . '</button>'
			. '<p class="jn-small">' . esc_html__( 'We’ll message you on WhatsApp (and email, if you add it) about your Shopinbos spot. Unsubscribe any time.', 'shopinbos' ) . ' <a href="' . esc_url( home_url( '/legal/privacy/' ) ) . '">' . esc_html__( 'Privacy', 'shopinbos' ) . '</a></p>'
			. '<p class="jn-err" role="alert" hidden></p>'
			. '<input type="hidden" name="action" value="sib_lead"><input type="hidden" name="kind" value="waitlist"><input type="hidden" name="as" value=""><input type="hidden" name="intent" value="ads_landing"><input type="hidden" name="back" value="">';
		foreach ( [ 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'ttclid' ] as $k ) {
			$out .= '<input type="hidden" name="' . $k . '" value="" data-jn-utm>';
		}
		$out .= '<input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" class="jn-hp"></form>';

		$wa   = 'https://wa.me/?text=' . rawurlencode( __( 'I just joined the Shopinbos waitlist. It opens on 1 November: one app to sell online in Nigeria. Join here:', 'shopinbos' ) . ' ' . home_url( '/join/' ) );
		$out .= '<div class="jn-step jn-done" data-step="3" hidden tabindex="-1"><span class="jn-tick">' . sib_icon( 'tick', 30, '#fff' ) . '</span>'
			. '<h2 class="jn-h2" data-jn-done-title>' . esc_html__( 'You’re on the list!', 'shopinbos' ) . '</h2>'
			. '<p>' . esc_html( sprintf( __( 'We’ll message you on WhatsApp when your spot opens on %s. Save our number so the message reaches you.', 'shopinbos' ), $date ) ) . '</p>'
			. '<ol class="jn-next"><li>' . esc_html__( 'We check your details and may call to help you prepare', 'shopinbos' ) . '</li><li>' . esc_html( sprintf( __( 'On %s you get your sign-up link first', 'shopinbos' ), $date ) ) . '</li><li>' . esc_html__( 'Free setup help in your first week', 'shopinbos' ) . '</li></ol>'
			. '<a class="btn btn-wa" href="' . esc_url( $wa ) . '" target="_blank" rel="noopener">' . sib_icon( 'whatsapp', 18, '#fff' ) . esc_html__( 'Tell a friend on WhatsApp', 'shopinbos' ) . '</a>'
			. '<a class="btn btn-ghost" href="' . esc_url( home_url( '/how-it-works/' ) ) . '">' . esc_html__( 'See how Shopinbos works', 'shopinbos' ) . '</a>'
			. '<a class="jn-site" href="' . esc_url( $site ) . '">' . esc_html__( 'Explore the website', 'shopinbos' ) . sib_icon( 'arrow', 15 ) . '</a></div>';
	}
	$out .= '</div></div></section>';

	// What each role gets, then questions.
	$gets = [
		'seller'   => [ __( 'Rex builds your store from a chat, in about 5 minutes', 'shopinbos' ), __( 'Sell on your own link, WhatsApp, Instagram and TikTok', 'shopinbos' ), __( 'Pay on delivery with a code, and riders booked from the order', 'shopinbos' ), __( 'Add products from checked suppliers, no stock needed', 'shopinbos' ) ],
		'supplier' => [ __( 'List your products once in Find stock', 'shopinbos' ), __( 'Shops across Nigeria resell them under their name', 'shopinbos' ), __( 'Orders arrive with the delivery already booked', 'shopinbos' ), __( 'Your cost is paid straight to your bank', 'shopinbos' ) ],
		'delivery' => [ __( 'Delivery jobs from shops in your cities', 'shopinbos' ), __( 'Clear pickup and drop-off, with live tracking', 'shopinbos' ), __( 'Pay on delivery codes, so riders hand over safely', 'shopinbos' ), __( 'Fees paid in the app go straight to your bank', 'shopinbos' ) ],
	];
	$out .= '<section class="jn-gets"><div class="wrap"><h2 class="disp jn-h2c">' . esc_html__( 'What you get on day one', 'shopinbos' ) . '</h2><div class="jn-g3">';
	foreach ( $gets as $key => $items ) {
		$out .= '<div class="jn-get"><span class="jn-ico" style="background:' . esc_attr( $roles[ $key ][3] ) . '">' . sib_icon( $roles[ $key ][2], 22, $roles[ $key ][4] ) . '</span><b>' . esc_html( [ 'seller' => __( 'Sellers', 'shopinbos' ), 'supplier' => __( 'Suppliers', 'shopinbos' ), 'delivery' => __( 'Delivery partners', 'shopinbos' ) ][ $key ] ) . '</b><ul>';
		foreach ( $items as $i ) {
			$out .= '<li>' . esc_html( $i ) . '</li>';
		}
		$out .= '</ul></div>';
	}
	$out .= '</div><p class="jn-center"><a class="btn btn-acc" href="#join" data-jn-top>' . esc_html__( 'Join the waitlist', 'shopinbos' ) . sib_icon( 'arrow', 16 ) . '</a></p></div></section>';

	$faq = [
		[ __( 'When does Shopinbos open?', 'shopinbos' ), sprintf( __( 'On %s. People on the waitlist get their sign-up link first, on WhatsApp.', 'shopinbos' ), wp_date( 'j F Y', function_exists( 'sib_launch_ts' ) ? sib_launch_ts() : time() ) ) ],
		[ __( 'Is it free?', 'shopinbos' ), __( 'Joining the waitlist is free. Sellers can start on the Free plan; suppliers and delivery partners join and get verified free.', 'shopinbos' ) ],
		[ __( 'Do I need a laptop?', 'shopinbos' ), __( 'No. Everything works from your phone: the Shopinbos app on Android, and the web app on any phone.', 'shopinbos' ) ],
		[ __( 'Who is behind Shopinbos?', 'shopinbos' ), __( 'Shopinbos is a product of Tech Della Solutions Ltd (RC 7038770), a Nigerian company in Lagos.', 'shopinbos' ) ],
	];
	$out .= '<section class="jn-faq"><div class="wrap jn-narrow"><h2 class="disp jn-h2c">' . esc_html__( 'Questions', 'shopinbos' ) . '</h2><div class="faq">';
	foreach ( $faq as [ $q, $a ] ) {
		$out .= '<details class="wp-block-details item toggle"><summary>' . esc_html( $q ) . '</summary><p>' . esc_html( $a ) . '</p></details>';
	}
	$out .= '</div><p class="jn-center"><a class="jn-site" href="' . esc_url( $site ) . '">' . esc_html__( 'Explore the Shopinbos website', 'shopinbos' ) . sib_icon( 'arrow', 15 ) . '</a></p></div></section></div>';

	// The script prints in the footer: content filters would turn its && into &#038;.
	$script = sib_join_script( $roles );
	add_action( 'wp_footer', function () use ( $script ) {
		echo $script; // phpcs:ignore WordPress.Security.EscapeOutput
	}, 30 );
	return $out;
}

function sib_join_css(): string {
	return '<style>
body:has(.jn) .site-header, body:has(.jn) .sib-topbar, body:has(.jn) [data-prelaunch], body:has(.jn) .stickycta, body:has(.jn) .mbar { display: none !important; }
.jn { background: #fff; }
.jn-top { display: flex; justify-content: space-between; align-items: center; padding-top: 18px; padding-bottom: 18px; }
.jn-logo { height: 16px; width: auto; display: block; }
.jn-site { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; font-size: 14px; color: #16141F; text-decoration: none; }
.jn-site:hover { text-decoration: underline; }
.jn-hero { background: radial-gradient(90% 70% at 0% 0%, #FFE9DC 0%, transparent 60%), radial-gradient(70% 60% at 100% 10%, #E3F4EF 0%, transparent 60%); padding: 28px 0 72px; }
.jn-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 520px); gap: 56px; align-items: start; }
.jn-copy { display: flex; flex-direction: column; gap: 18px; padding-top: 28px; }
.jn-count { display: inline-flex; align-items: center; gap: 8px; align-self: flex-start; min-height: 32px; padding: 0 14px; border-radius: 999px; background: #16141F; color: #fff; font-weight: 800; font-size: 13px; }
.jn-count i { width: 8px; height: 8px; border-radius: 50%; background: #3DDC97; box-shadow: 0 0 0 3px rgba(61,220,151,.3); }
.jn-h1 { font-size: 56px; line-height: 1.02; letter-spacing: -.03em; margin: 0; }
.jn-lead { font-size: 18px; line-height: 1.6; color: #45424F; margin: 0; max-width: 560px; }
.jn-ticks { list-style: none; padding: 0; margin: 4px 0 0; display: flex; flex-direction: column; gap: 10px; }
.jn-ticks li { display: flex; gap: 10px; align-items: center; font-weight: 600; font-size: 15px; }
.jn-ticks li::before { content: ""; width: 20px; height: 20px; border-radius: 50%; flex: none; background: #0C4A44 url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%23fff%27 stroke-width=%273%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpath d=%27M5 12l5 5L20 7%27/%3E%3C/svg%3E") center/12px no-repeat; }
.jn-card { background: #fff; border: 1px solid #ECEAF2; border-radius: 28px; padding: 28px; box-shadow: 0 30px 60px -30px rgba(22,20,31,.25); scroll-margin-top: 16px; }
.jn-step { display: flex; flex-direction: column; gap: 14px; }
.jn-step[hidden] { display: none; }
.jn-kicker { margin: 0; font-size: 12px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: #8A879A; }
.jn-h2 { font-family: var(--f-display, inherit); font-size: 26px; line-height: 1.15; margin: 0; letter-spacing: -.02em; }
.jn-roles { display: flex; flex-direction: column; gap: 10px; }
.jn-role { display: flex; align-items: center; gap: 14px; width: 100%; text-align: left; padding: 16px; border-radius: 20px; border: 1.5px solid #ECEAF2; background: #fff; cursor: pointer; font: inherit; color: #16141F; text-decoration: none; transition: border-color .15s, transform .15s, box-shadow .15s; }
.jn-role:hover, .jn-role:focus-visible { border-color: #FF6A2B; box-shadow: 0 10px 24px -14px rgba(255,106,43,.6); transform: translateY(-1px); outline: none; }
.jn-ico { width: 48px; height: 48px; border-radius: 14px; display: flex; align-items: center; justify-content: center; flex: none; }
.jn-rt { display: flex; flex-direction: column; gap: 3px; flex: 1; min-width: 0; }
.jn-rt b { font-size: 17px; }
.jn-rt span { font-size: 14px; color: #6B6779; line-height: 1.4; }
.jn-head { display: flex; justify-content: space-between; align-items: center; }
.jn-back { display: inline-flex; align-items: center; gap: 6px; border: 0; background: none; padding: 0; font: inherit; font-weight: 700; font-size: 14px; cursor: pointer; color: #16141F; }
.jn-field { display: flex; flex-direction: column; gap: 8px; }
.jn-label { font-weight: 700; font-size: 14px; }
.jn-label em { font-style: normal; font-weight: 500; color: #8A879A; }
.jn-two { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 190px), 1fr)); gap: 14px; }
.jn-role-fields { border: 0; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.jn-role-fields[hidden] { display: none; }
.jn-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.jn-chip { position: relative; cursor: pointer; }
.jn-chip input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }
.jn-chip span { display: inline-flex; align-items: center; min-height: 40px; padding: 0 14px; border-radius: 999px; border: 1.5px solid #ECEAF2; font-weight: 600; font-size: 14px; background: #fff; transition: background .15s, border-color .15s, color .15s; }
.jn-chip input:checked + span { background: #16141F; border-color: #16141F; color: #fff; }
.jn-chip input:focus-visible + span { outline: 2px solid #FF6A2B; outline-offset: 2px; }
.jn-submit { width: 100%; justify-content: center; min-height: 54px; font-size: 16px; margin-top: 4px; }
.jn-form.is-busy .jn-submit { opacity: .6; pointer-events: none; }
.jn-small { margin: 0; font-size: 12.5px; color: #8A879A; line-height: 1.5; }
.jn-small a { color: inherit; }
.jn-err { margin: 0; padding: 10px 14px; border-radius: 12px; background: #FDECEA; color: #B42318; font-size: 14px; font-weight: 600; }
.jn-hp { position: absolute; left: -9999px; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.jn-done { align-items: flex-start; outline: none; }
.jn-done p { margin: 0; color: #45424F; line-height: 1.6; }
.jn-tick { width: 56px; height: 56px; border-radius: 50%; background: #16A34A; display: flex; align-items: center; justify-content: center; }
.jn-next { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 6px; color: #45424F; font-size: 15px; }
.jn-done .btn { width: 100%; justify-content: center; }
.btn-wa { background: #25D366; color: #fff; gap: 8px; }
.jn-gets { padding: 72px 0; }
.jn-h2c { font-size: 36px; margin: 0 0 28px; text-align: center; letter-spacing: -.02em; }
.jn-g3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; }
.jn-get { border: 1px solid #ECEAF2; border-radius: 24px; padding: 24px; display: flex; flex-direction: column; gap: 12px; }
.jn-get b { font-size: 19px; }
.jn-get ul { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 8px; color: #45424F; font-size: 15px; line-height: 1.45; }
.jn-center { text-align: center; margin: 28px 0 0; }
.jn-faq { background: #F6F5F9; padding: 72px 0 80px; }
.jn-narrow { max-width: 760px; }
@media (max-width: 900px) {
	.jn-grid { grid-template-columns: 1fr; gap: 24px; }
	.jn-copy { padding-top: 0; gap: 14px; }
	.jn-ticks { display: none; }
	.jn-g3 { grid-template-columns: 1fr; }
}
@media (max-width: 560px) {
	.jn-hero { padding: 8px 0 48px; }
	.jn-h1 { font-size: 34px; }
	.jn-lead { font-size: 16px; }
	.jn-card { padding: 20px 16px; border-radius: 24px; }
	.jn-h2 { font-size: 22px; }
	.jn-h2c { font-size: 28px; }
	.jn-role { padding: 14px; gap: 12px; }
	.jn-ico { width: 44px; height: 44px; }
	.jn-gets, .jn-faq { padding: 48px 0; }
}
</style>';
}

function sib_join_script( array $roles ): string {
	$titles = [
		'seller'   => __( 'Great. Tell us about your shop', 'shopinbos' ),
		'supplier' => __( 'Great. Tell us about your products', 'shopinbos' ),
		'delivery' => __( 'Great. Tell us about your deliveries', 'shopinbos' ),
	];
	$cfg = [
		'titles' => $titles,
		'done'   => __( 'You’re on the list, %s!', 'shopinbos' ),
		'error'  => __( 'Something went wrong. Check your WhatsApp number and try again.', 'shopinbos' ),
	];
	return '<script data-no-optimize="1" data-no-defer="1">(function(){var C=' . wp_json_encode( $cfg ) . ';var root=document.querySelector("[data-jn]");if(!root)return;
var card=root.querySelector(".jn-card"),s1=root.querySelector("[data-step=\"1\"]"),form=root.querySelector("[data-step=\"2\"]"),s3=root.querySelector("[data-step=\"3\"]");if(!form)return;
var q=new URLSearchParams(location.search),store={};try{store=JSON.parse(sessionStorage.getItem("sib_jn_utm")||"{}")}catch(e){}
form.querySelectorAll("[data-jn-utm]").forEach(function(i){var v=q.get(i.name)||store[i.name]||"";i.value=v.slice(0,120);if(v)store[i.name]=v;});try{sessionStorage.setItem("sib_jn_utm",JSON.stringify(store))}catch(e){}
function ev(n,p){try{window.posthog&&posthog.capture(n,p)}catch(e){}}
function show(step){[s1,form,s3].forEach(function(s){s.hidden=s.getAttribute("data-step")!==String(step)});if(window.innerWidth<900)card.scrollIntoView({behavior:"smooth",block:"start"});}
function pick(role){form.elements.as.value=role;form.querySelector("[data-jn-title]").textContent=C.titles[role]||"";form.querySelectorAll(".jn-role-fields").forEach(function(f){var on=f.getAttribute("data-for")===role;f.hidden=!on;f.disabled=!on;});show(2);setTimeout(function(){form.elements.name.focus({preventScroll:true})},350);ev("waitlist_role",{role:role});try{history.replaceState(null,"","#"+role)}catch(e){}}
root.querySelectorAll("[data-role]").forEach(function(b){b.addEventListener("click",function(){pick(b.getAttribute("data-role"))})});
root.querySelector("[data-jn-back]").addEventListener("click",function(){show(1);try{history.replaceState(null,"",location.pathname+location.search)}catch(e){}});
var h=location.hash.slice(1);if(C.titles[h])pick(h);
function done(name){var t=s3.querySelector("[data-jn-done-title]");if(name)t.textContent=C.done.replace("%s",name);show(3);s3.focus({preventScroll:true});
var role=form.elements.as.value;try{window.fbq&&fbq("track","Lead",{content_category:role,content_name:"waitlist"})}catch(e){}try{window.ttq&&ttq.track("SubmitForm",{content_type:role})}catch(e){}ev("waitlist_join",{role:role,source:form.elements.utm_source.value||"direct"});}
if(q.get("sib_lead")==="ok"&&q.get("sib_form")==="waitlist"){done("")}
form.addEventListener("submit",function(e){e.preventDefault();var err=form.querySelector(".jn-err");err.hidden=true;form.elements.back.value=location.href;form.classList.add("is-busy");
fetch(form.getAttribute("action"),{method:"POST",body:new FormData(form),headers:{Accept:"application/json"},credentials:"same-origin"}).then(function(r){return r.json()}).catch(function(){return null}).then(function(res){form.classList.remove("is-busy");if(res&&res.ok){done((form.elements.name.value||"").trim().split(" ")[0]);}else{err.textContent=(res&&res.message)||C.error;err.hidden=false;}});});
})();</script>';
}
