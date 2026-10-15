<?php
/**
 * Investor relations page (/investors/): what Shopinbos is building, the opportunity, how it makes money, company
 * facts, and an enquiry form (sent to the app's Website leads as "Investor enquiry" and by email).
 * Change the contact address with the sib_investor_email filter.
 */

defined( 'ABSPATH' ) || exit;

add_action( 'init', function () {
	sib_register_block_group( [
		'investors-page' => [ __( 'Investor relations page', 'shopinbos' ), 'sib_render_investors_page', [] ],
	], 'widgets' );
}, 11 );

function sib_render_investors_page(): string {
	$email = (string) apply_filters( 'sib_investor_email', 'hello@shopinbos.com' );
	$h2    = fn( $eyebrow, $title, $lead = '' ) => '<div style="display:flex;flex-direction:column;gap:12px;max-width:720px;margin-bottom:28px"><p class="eyebrow">' . esc_html( $eyebrow ) . '</p><h2 class="disp h2">' . esc_html( $title ) . '</h2>' . ( $lead ? '<p class="lead">' . esc_html( $lead ) . '</p>' : '' ) . '</div>';
	$card  = fn( $icon, $bg, $fg, $title, $text ) => '<div class="card" style="padding:24px;display:flex;flex-direction:column;gap:10px"><span class="av" style="background:' . $bg . ';width:46px;height:46px">' . sib_icon( $icon, 22, $fg ) . '</span><b style="font-size:17.5px">' . esc_html( $title ) . '</b><span class="p" style="font-size:14.5px">' . esc_html( $text ) . '</span></div>';

	// Hero.
	$out = '<section class="ahero cv inv-hero"><div class="wrap split" style="align-items:center;gap:48px">'
		. '<div style="display:flex;flex-direction:column;gap:18px"><span class="pill" style="align-self:flex-start">' . esc_html__( 'Investor relations', 'shopinbos' ) . '</span>'
		. '<h1 class="disp h1" style="font-size:56px">' . esc_html__( 'The commerce operating system for', 'shopinbos' ) . ' <span class="grad">' . esc_html__( 'African businesses', 'shopinbos' ) . '</span></h1>'
		. '<p class="lead">' . esc_html__( 'Shopinbos gives small businesses one app to find products, sell them everywhere their customers are, get paid and deliver. We are starting in Nigeria and building for the continent.', 'shopinbos' ) . '</p>'
		. '<div class="row" style="gap:12px;flex-wrap:wrap"><a class="btn btn-acc cv-b" href="#inv-contact">' . esc_html__( 'Talk to the founders', 'shopinbos' ) . sib_icon( 'arrow', 16 ) . '</a><a class="btn btn-ghost cv-b" href="' . esc_url( home_url( '/about/' ) ) . '">' . esc_html__( 'About Shopinbos', 'shopinbos' ) . '</a></div></div>'
		. '<div class="inv-panel"><span class="dot-grid" aria-hidden="true"></span><p class="inv-k">' . esc_html__( 'At a glance', 'shopinbos' ) . '</p><dl class="inv-facts">';
	foreach ( [
		[ __( 'Company', 'shopinbos' ), __( 'Tech Della Solutions Ltd', 'shopinbos' ) ],
		[ __( 'Registration', 'shopinbos' ), 'RC 7038770 (CAC, Nigeria)' ],
		[ __( 'Headquarters', 'shopinbos' ), __( 'Lagos, Nigeria', 'shopinbos' ) ],
		[ __( 'Product', 'shopinbos' ), __( 'Shopinbos: web app and Android, iPhone next', 'shopinbos' ) ],
		[ __( 'First market', 'shopinbos' ), __( 'Nigeria, then West and East Africa', 'shopinbos' ) ],
		[ __( 'Customers', 'shopinbos' ), __( 'Small businesses, suppliers and delivery companies', 'shopinbos' ) ],
	] as [ $k, $v ] ) {
		$out .= '<div><dt>' . esc_html( $k ) . '</dt><dd>' . esc_html( $v ) . '</dd></div>';
	}
	$out .= '</dl></div></div></section>';

	// The opportunity.
	$out .= '<section class="cv" style="padding:72px 0"><div class="wrap">' . $h2( __( 'The opportunity', 'shopinbos' ), __( 'Africa’s small businesses already sell online. Their tools haven’t caught up.', 'shopinbos' ), __( 'Millions of Nigerian businesses take orders on WhatsApp, Instagram and TikTok every day. Most run on screenshots, bank transfer alerts and a rider’s phone number.', 'shopinbos' ) )
		. '<div class="g3">'
		. $card( 'chat', '#E2F5EA', '#16794A', __( 'Selling happens in chats', 'shopinbos' ), __( 'Customers discover products on social media and buy in conversation. Global store builders were designed for a checkout page, not a chat.', 'shopinbos' ) )
		. $card( 'shield', '#FFEDE4', '#B23E0A', __( 'Trust is the bottleneck', 'shopinbos' ), __( 'Buyers fear paying first; sellers fear fake orders. Pay on delivery with a delivery code and fast payouts removes that friction for both.', 'shopinbos' ) )
		. $card( 'layers', '#E7E1FF', '#5B3FD6', __( 'Too many disconnected tools', 'shopinbos' ), __( 'A seller juggles a store, a payment link, a supplier, a rider and a spreadsheet. Each hand-off loses orders and money.', 'shopinbos' ) )
		. '</div></div></section>';

	// What we're building.
	$out .= '<section class="cv" style="padding:72px 0;background:#F6F5F9"><div class="wrap">' . $h2( __( 'What we’re building', 'shopinbos' ), __( 'One app that runs the whole business', 'shopinbos' ), __( 'Shopinbos connects three sides that need each other: sellers, the suppliers who stock them and the delivery companies who reach their customers.', 'shopinbos' ) )
		. '<div class="g4">'
		. $card( 'store', '#FFF1E8', '#C2410C', __( 'Store builder', 'shopinbos' ), __( 'Rex, our AI builder, sets up a seller’s store from a short chat, with a free shopinbos.com address.', 'shopinbos' ) )
		. $card( 'chat', '#E2F5EA', '#16794A', __( 'AI shop assistant', 'shopinbos' ), __( 'Peggy answers customers, follows up and sends offers, in English or Pidgin.', 'shopinbos' ) )
		. $card( 'box', '#FFF7D6', '#8A5A00', __( 'Supplier marketplace', 'shopinbos' ), __( 'Find stock lets sellers add checked Nigerian suppliers’ products and dropship or buy wholesale.', 'shopinbos' ) )
		. $card( 'truck', '#E3EEFD', '#1F5FBF', __( 'Payments and delivery', 'shopinbos' ), __( 'Card, transfer and pay on delivery, riders booked from the order, and payouts every Friday.', 'shopinbos' ) )
		. '</div></div></section>';

	// Business model and why us.
	$out .= '<section class="cv" style="padding:72px 0"><div class="wrap split split-top" style="align-items:start;gap:48px"><div>' . $h2( __( 'Business model', 'shopinbos' ), __( 'Revenue grows with our sellers', 'shopinbos' ) ) . '<ul class="inv-list">';
	foreach ( [
		[ __( 'Seller plans', 'shopinbos' ), __( 'Monthly plans for more products, staff, automations and AI.', 'shopinbos' ) ],
		[ __( 'Marketplace', 'shopinbos' ), __( 'A share of orders sellers place with suppliers through Find stock.', 'shopinbos' ) ],
		[ __( 'Delivery', 'shopinbos' ), __( 'A margin on delivery bookings made through the app.', 'shopinbos' ) ],
		[ __( 'Add-ons', 'shopinbos' ), __( 'Custom domains, ads and premium templates.', 'shopinbos' ) ],
	] as [ $t, $d ] ) {
		$out .= '<li>' . sib_icon( 'tick', 18, '#16794A' ) . '<span><b>' . esc_html( $t ) . '</b>' . esc_html( $d ) . '</span></li>';
	}
	$out .= '</ul></div><div>' . $h2( __( 'Why Shopinbos', 'shopinbos' ), __( 'Built for how Nigeria sells', 'shopinbos' ) ) . '<ul class="inv-list">';
	foreach ( [
		[ __( 'Network effects', 'shopinbos' ), __( 'Every supplier and delivery partner makes the app more useful for every seller, and the other way round.', 'shopinbos' ) ],
		[ __( 'Local by design', 'shopinbos' ), __( 'Pay on delivery, naira pricing, WhatsApp first, plain words in English and Pidgin.', 'shopinbos' ) ],
		[ __( 'AI that does the work', 'shopinbos' ), __( 'Rex and Peggy replace tasks sellers would otherwise pay someone for.', 'shopinbos' ) ],
		[ __( 'Content that brings sellers in', 'shopinbos' ), __( 'Our free Academy, guides and tools reach sellers before they choose a platform.', 'shopinbos' ) ],
	] as [ $t, $d ] ) {
		$out .= '<li>' . sib_icon( 'tick', 18, '#16794A' ) . '<span><b>' . esc_html( $t ) . '</b>' . esc_html( $d ) . '</span></li>';
	}
	$out .= '</ul></div></div></section>';

	// Contact and updates.
	$form = '<form class="card" id="inv-form" method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" data-cv-lead="investor" style="padding:26px;display:flex;flex-direction:column;gap:12px">'
		. '<b class="disp" style="font-size:24px">' . esc_html__( 'Investor enquiries', 'shopinbos' ) . '</b><span class="p" style="font-size:14.5px">' . esc_html__( 'Our deck, financials and data room are shared on request with qualified investors. Tell us about you and we’ll reply within two working days.', 'shopinbos' ) . '</span>'
		. '<div class="g2" style="gap:12px"><input class="input" name="name" required placeholder="' . esc_attr__( 'Your name', 'shopinbos' ) . '" aria-label="' . esc_attr__( 'Your name', 'shopinbos' ) . '" autocomplete="name">'
		. '<input class="input" type="email" name="email" required placeholder="' . esc_attr__( 'Work email', 'shopinbos' ) . '" aria-label="' . esc_attr__( 'Work email', 'shopinbos' ) . '" autocomplete="email"></div>'
		. '<input class="input" name="org" placeholder="' . esc_attr__( 'Fund or organisation (optional)', 'shopinbos' ) . '" aria-label="' . esc_attr__( 'Fund or organisation', 'shopinbos' ) . '" autocomplete="organization">'
		. '<textarea class="input" name="message" rows="4" placeholder="' . esc_attr__( 'What would you like to know?', 'shopinbos' ) . '" aria-label="' . esc_attr__( 'Message', 'shopinbos' ) . '" style="padding:14px 16px;min-height:120px;resize:vertical"></textarea>'
		. '<label class="p" style="display:flex;gap:10px;align-items:flex-start;font-size:14px"><input type="checkbox" name="consent" value="1" style="margin-top:4px"> ' . esc_html__( 'Send me Shopinbos investor updates by email. You can unsubscribe at any time.', 'shopinbos' ) . '</label>'
		. '<button class="btn btn-acc" type="submit">' . esc_html__( 'Send enquiry', 'shopinbos' ) . sib_icon( 'arrow', 16 ) . '</button>'
		. '<input type="hidden" name="action" value="sib_lead"><input type="hidden" name="kind" value="investor"><input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px"></form>';
	$side = '<div style="display:flex;flex-direction:column;gap:14px"><div class="card" style="padding:24px;background:#16141F;color:#fff;border-color:#16141F;display:flex;flex-direction:column;gap:10px">'
		. '<b class="disp" style="font-size:22px">' . esc_html__( 'Contact', 'shopinbos' ) . '</b><span style="color:#C9C6D3;font-size:14.5px">' . esc_html__( 'For investment, partnership and strategic enquiries.', 'shopinbos' ) . '</span>'
		. '<a class="lnk cv-b" href="mailto:' . esc_attr( $email ) . '" style="color:#8BE3D3">' . esc_html( $email ) . sib_icon( 'arrow', 16 ) . '</a></div>'
		. '<div class="card" style="padding:22px;display:flex;flex-direction:column;gap:8px"><b>' . esc_html__( 'Company details', 'shopinbos' ) . '</b>'
		. '<span class="p" style="font-size:14.5px">' . esc_html__( 'Shopinbos is a product of Tech Della Solutions Ltd (RC 7038770), registered with the Corporate Affairs Commission, Lagos, Nigeria.', 'shopinbos' ) . '</span>'
		. '<span class="p" style="font-size:14.5px">' . esc_html__( 'Nothing on this page is an offer to sell or a solicitation to buy securities.', 'shopinbos' ) . '</span></div>'
		. '<a class="card cv-b" href="' . esc_url( home_url( '/press/' ) ) . '" style="padding:22px;display:flex;justify-content:space-between;align-items:center;color:#16141F"><b>' . esc_html__( 'Press and brand assets', 'shopinbos' ) . '</b>' . sib_icon( 'arrow', 18 ) . '</a></div>';
	$out .= '<section class="cv" id="inv-contact" style="padding:72px 0 96px;background:#F6F5F9"><div class="wrap">' . $h2( __( 'Get in touch', 'shopinbos' ), __( 'Talk to the founders', 'shopinbos' ) ) . '<div class="split split-top" style="align-items:start">' . $form . $side . '</div></div></section>';
	return $out;
}
