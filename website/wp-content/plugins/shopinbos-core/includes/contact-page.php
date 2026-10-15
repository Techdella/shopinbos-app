<?php
/**
 * The contact page (canvas style): ways to reach us, a message form (sent to the app's Website leads and
 * by email), which team handles what, and common questions.
 */

defined( 'ABSPATH' ) || exit;

add_action( 'init', function () {
	sib_register_block_group( [
		'contact-page' => [ __( 'Contact page', 'shopinbos' ), 'sib_render_contact_page', [] ],
	], 'widgets' );
}, 11 );

function sib_render_contact_page(): string {
	$wa      = sib_whatsapp_url( 'Hi Shopinbos, I need help with' );
	$support = (string) apply_filters( 'sib_support_email', 'support@shopinbos.com' );
	$card    = fn( $bg, $icon, $fg, $title, $text, $link, $label ) => '<a class="card cv-b" href="' . esc_url( $link ) . '" style="padding:22px;display:flex;flex-direction:column;gap:10px;text-align:left;color:#16141F">'
		. '<span class="av" style="background:' . $bg . ';width:46px;height:46px">' . sib_icon( $icon, 22, $fg ) . '</span><b style="font-size:17px">' . esc_html( $title ) . '</b>'
		. '<span class="p" style="font-size:14.5px">' . esc_html( $text ) . '</span><span class="lnk" style="margin-top:auto;color:' . $fg . '">' . esc_html( $label ) . sib_icon( 'arrow', 16 ) . '</span></a>';

	$out = '<section class="ahero cv" style="padding:56px 0 40px;background:linear-gradient(#F6F5F9 0%,#fff 100%)"><div class="wrap" style="display:flex;flex-direction:column;gap:16px;max-width:860px">'
		. '<span class="pill" style="align-self:flex-start">' . esc_html__( 'Contact us', 'shopinbos' ) . '</span>'
		. '<h1 class="disp h1" style="font-size:58px">' . esc_html__( 'Talk to a real person', 'shopinbos' ) . ' <span class="grad">' . esc_html__( 'in minutes', 'shopinbos' ) . '</span></h1>'
		. '<p class="lead">' . esc_html__( 'Questions about your shop, payments, delivery or becoming a partner? The fastest way is WhatsApp, 8am to 8pm, in English or Pidgin.', 'shopinbos' ) . '</p></div></section>';

	$out .= '<section class="cv" style="padding:8px 0 48px"><div class="wrap g4">'
		. $card( '#E2F5EA', 'chat', '#16794A', __( 'WhatsApp', 'shopinbos' ), __( 'Chat with our team. Most replies come within 5 minutes.', 'shopinbos' ), $wa, __( 'Start a chat', 'shopinbos' ) )
		. $card( '#FFEDE4', 'mail', '#B23E0A', __( 'Email', 'shopinbos' ), sprintf( __( 'Write to %s. We reply within one working day.', 'shopinbos' ), $support ), 'mailto:' . $support, __( 'Send an email', 'shopinbos' ) )
		. $card( '#E7E1FF', 'book', '#5B3FD6', __( 'Help centre', 'shopinbos' ), __( 'Step-by-step answers for orders, payouts, delivery and your store.', 'shopinbos' ), home_url( '/help/' ), __( 'Find an answer', 'shopinbos' ) )
		. $card( '#E3EEFD', 'users', '#1F5FBF', __( 'Partners', 'shopinbos' ), __( 'Suppliers, delivery companies and agencies: join and grow with us.', 'shopinbos' ), home_url( '/partners/' ), __( 'Partner with us', 'shopinbos' ) )
		. '</div></section>';

	$form = '<form class="card" method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" data-cv-lead="contact" style="padding:26px;display:flex;flex-direction:column;gap:12px">'
		. '<b class="disp" style="font-size:26px">' . esc_html__( 'Send us a message', 'shopinbos' ) . '</b><span class="p" style="font-size:14.5px">' . esc_html__( 'Tell us what you need and we’ll get back to you within one working day.', 'shopinbos' ) . '</span>'
		. '<div class="g2" style="gap:12px"><input class="input" name="name" required placeholder="' . esc_attr__( 'Your name', 'shopinbos' ) . '" aria-label="' . esc_attr__( 'Your name', 'shopinbos' ) . '" autocomplete="name">'
		. '<input class="input" type="email" name="email" required placeholder="' . esc_attr__( 'Email', 'shopinbos' ) . '" aria-label="' . esc_attr__( 'Email', 'shopinbos' ) . '" autocomplete="email"></div>'
		. '<input class="input" name="phone" placeholder="' . esc_attr__( 'WhatsApp number (optional)', 'shopinbos' ) . '" aria-label="' . esc_attr__( 'WhatsApp number', 'shopinbos' ) . '" autocomplete="tel">'
		. '<select class="input" name="topic" aria-label="' . esc_attr__( 'What is it about?', 'shopinbos' ) . '"><option value="">' . esc_html__( 'What is it about?', 'shopinbos' ) . '</option>';
	foreach ( [ 'Starting my shop', 'My orders or payouts', 'Delivery', 'Becoming a supplier', 'Becoming a delivery partner', 'Press or partnerships', 'Something else' ] as $t ) {
		$form .= '<option>' . esc_html( $t ) . '</option>';
	}
	$form .= '</select><textarea class="input" name="message" required rows="5" placeholder="' . esc_attr__( 'Your message', 'shopinbos' ) . '" aria-label="' . esc_attr__( 'Your message', 'shopinbos' ) . '" style="padding:14px 16px;min-height:140px;resize:vertical"></textarea>'
		. '<button class="btn btn-acc" type="submit">' . esc_html__( 'Send message', 'shopinbos' ) . sib_icon( 'arrow', 16 ) . '</button>'
		. '<input type="hidden" name="action" value="sib_lead"><input type="hidden" name="kind" value="contact"><input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px"></form>';

	$teams = [
		[ __( 'Sellers', 'shopinbos' ), __( 'Help with your store, orders, payouts and delivery.', 'shopinbos' ) ],
		[ __( 'Suppliers', 'shopinbos' ), __( 'Listing products in Find stock and supplier payouts.', 'shopinbos' ) ],
		[ __( 'Delivery partners', 'shopinbos' ), __( 'Joining as a company or rider, jobs and cash-in.', 'shopinbos' ) ],
		[ __( 'Press and partnerships', 'shopinbos' ), __( 'Interviews, events and working together.', 'shopinbos' ) ],
	];
	$side = '<div style="display:flex;flex-direction:column;gap:14px"><div class="card" style="padding:24px;background:#16141F;color:#fff;border-color:#16141F;display:flex;flex-direction:column;gap:12px">'
		. '<b class="disp" style="font-size:22px">' . esc_html__( 'Who you’ll talk to', 'shopinbos' ) . '</b>';
	foreach ( $teams as [ $t, $d ] ) {
		$side .= '<div style="display:flex;gap:12px;align-items:flex-start;padding-top:10px;border-top:1px solid rgba(255,255,255,.12)">' . sib_icon( 'tick', 18, '#8BE3D3' ) . '<span><b style="display:block">' . esc_html( $t ) . '</b><span style="font-size:14px;color:#C9C6D3">' . esc_html( $d ) . '</span></span></div>';
	}
	$side .= '</div><div class="card" style="padding:22px;display:flex;flex-direction:column;gap:8px"><b>' . esc_html__( 'Office', 'shopinbos' ) . '</b><span class="p" style="font-size:14.5px">' . esc_html__( 'Lagos, Nigeria. Visits by appointment only.', 'shopinbos' ) . '</span>'
		. '<span class="p" style="font-size:14.5px">' . esc_html__( 'Shopinbos is a product of Tech Della Solutions Ltd (RC 7038770).', 'shopinbos' ) . '</span>'
		. '<span class="p" style="font-size:14.5px">' . esc_html__( 'Hours: Monday to Saturday, 8am to 8pm (WAT).', 'shopinbos' ) . '</span></div></div>';

	$out .= '<section class="cv" style="padding:16px 0 64px"><div class="wrap split split-top" style="align-items:start">' . $form . $side . '</div></section>';

	$faq = [
		[ __( 'How fast do you reply?', 'shopinbos' ), __( 'On WhatsApp, usually within 5 minutes between 8am and 8pm. Emails and messages from this form within one working day.', 'shopinbos' ) ],
		[ __( 'I have a problem with an order I bought from a shop. Who do I contact?', 'shopinbos' ), __( 'Contact the shop first: their WhatsApp number is on their store. If they don’t reply within two days, message us with the order number and we’ll step in.', 'shopinbos' ) ],
		[ __( 'Can you set up my store for me?', 'shopinbos' ), __( 'Rex builds your store with you in about five minutes. If you get stuck, our team can guide you on WhatsApp, free.', 'shopinbos' ) ],
		[ __( 'Where do I report a scam or a fake shop?', 'shopinbos' ), __( 'Send us the shop link and what happened on WhatsApp or by email. We look into every report.', 'shopinbos' ) ],
	];
	$out .= '<section class="faqsec cv" style="background:#F6F5F9;padding:72px 0"><div class="wrap split" style="align-items:start"><div style="display:flex;flex-direction:column;gap:14px"><p class="eyebrow">' . esc_html__( 'Questions', 'shopinbos' ) . '</p><h2 class="disp h2">' . esc_html__( 'Before you write', 'shopinbos' ) . '</h2><p class="lead">' . esc_html__( 'The quick answers people ask us most.', 'shopinbos' ) . '</p></div><div style="display:flex;flex-direction:column;gap:10px">';
	foreach ( $faq as $i => [ $q, $a ] ) {
		$out .= '<div class="card" style="border-radius:20px"><button data-cv="item.toggle" aria-expanded="' . ( $i ? 'false' : 'true' ) . '" style="width:100%;background:none;border:0;padding:20px 22px;display:flex;justify-content:space-between;align-items:center;gap:16px;text-align:left;font-weight:800;font-size:16.5px;color:#16141F">' . esc_html( $q ) . '<span style="font-size:22px;color:#6B6779;flex:0 0 auto">' . ( $i ? '+' : '−' ) . '</span></button><p class="p qa-a"' . ( $i ? ' hidden' : '' ) . ' style="padding:0 22px 20px">' . esc_html( $a ) . '</p></div>';
	}
	return $out . '</div></div></section>';
}
