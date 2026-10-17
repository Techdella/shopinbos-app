<?php
/**
 * Inline SVG icons from the prototype (24px grid, 1.8 stroke unless noted).
 */

defined( 'ABSPATH' ) || exit;

function sib_theme_icon( string $name, int $size = 22, string $stroke = 'currentColor' ): string {
	$paths = [
		'whatsapp' => '<path d="M20 12a8 8 0 0 1-11.8 7L4 20l1-4A8 8 0 1 1 20 12z"/><path d="M9 9c0 3 3 6 6 6l1.2-1.4-2-1-1 .8c-1-.5-2-1.5-2.5-2.5l.8-1-1-2z"/>',
		'book'     => '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>',
		'cam'      => '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
		'grow'     => '<path d="M4 18l6-6 4 4 6-8"/><path d="M15 8h5v5"/>',
		'chart'    => '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
		'download' => '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
		'globe'    => '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
		'mail'     => '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
		'users'    => '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
		'spark'    => '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
		'lock'     => '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
		'grid'     => '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
		'pin'      => '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
		'heartbeat' => '<path d="M3 12h4l2-5 4 10 2-5h6"/>',
		'arrow'   => '<path d="M5 12h14M13 6l6 6-6 6"/>',
		'back'    => '<path d="M19 12H5M11 6l-6 6 6 6"/>',
		'tick'    => '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
		'bag'     => '<path d="M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2"/>',
		'link'    => '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
		'box'     => '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
		'layers'  => '<path d="M12 3 3 8l9 5 9-5z"/><path d="M3 13l9 5 9-5"/>',
		'chat'    => '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
		'phone'   => '<rect x="7" y="2" width="10" height="20" rx="2"/>',
		'shield'  => '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
		'store'   => '<path d="M4 9h16l-1-5H5zM4 9v11h16V9M9 20v-6h6v6"/>',
		'search'  => '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
		'heart'   => '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
		'play'    => '<path d="M7 5v14l11-7z"/>',
		'clock'   => '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
		'dots'    => '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
		'truck'   => '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/>',
		'naira'   => '<path d="M7 20V4l10 16V4M4 10h16M4 14h16"/>',
		'calc'    => '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M16 15v2"/>',
		'doc'     => '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
		'help'    => '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01"/>',
		'qr'      => '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2h-2zM18 18h2v2h-2zM18 14h2M14 18v2"/>',
	];
	$p = $paths[ $name ] ?? $paths['arrow'];
	$w = in_array( $name, [ 'arrow', 'back' ], true ) ? '2.2' : ( 'tick' === $name ? '2.4' : '1.8' );
	return sprintf(
		'<svg width="%1$d" height="%1$d" viewBox="0 0 24 24" fill="none" stroke="%2$s" stroke-width="%3$s" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none">%4$s</svg>',
		$size,
		esc_attr( $stroke ),
		$w,
		$p
	);
}

/** Rounded square holding an icon, used on "how it works" cards. */
function sib_theme_icon_box( string $name, string $bg = '#F6F5F9' ): string {
	return '<span style="width:44px;height:44px;border-radius:14px;background:' . esc_attr( $bg ) . ';display:flex;align-items:center;justify-content:center">' . sib_theme_icon( $name, 22, '#16141F' ) . '</span>';
}

/**
 * Logo for a brand mentioned on the site (assets/img/brands), matched by name, e.g. "Instagram Shop" or
 * "GIG Logistics". Returns an <img>, or '' when we have no logo for it.
 */
function sib_brand_logo( string $name, int $size = 28 ): string {
	$n   = strtolower( $name );
	$map = [
		'instagram and facebook ads' => 'meta.svg', 'google shopping ads' => 'googleads.svg', 'google ads' => 'googleads.svg',
		'whatsapp' => 'whatsapp.svg', 'instagram' => 'instagram.svg', 'facebook' => 'facebook.svg', 'tiktok' => 'tiktok.svg', 'google' => 'google.svg',
		'paystack' => 'paystack.png', 'flutterwave' => 'flutterwave.png', 'jumia' => 'jumia.png', 'konga' => 'konga.png', 'gig' => 'gig-logistics.png',
		'kwik' => 'kwik.png', 'shipbubble' => 'shipbubble.png', 'nipost' => 'nipost.png', 'shopify' => 'shopify.svg', 'woocommerce' => 'woocommerce.svg',
		'amazon' => 'amazon.svg', 'bumpa' => 'bumpa.png', 'catlog' => 'catlog.png', '1688' => '1688.png', 'alibaba' => 'alibabadotcom.svg', 'meta' => 'meta.svg',
	];
	foreach ( $map as $key => $file ) {
		if ( str_contains( $n, $key ) ) {
			return '<img class="brand-logo" src="' . sib_theme_img( 'brands/' . $file ) . '" alt="" width="' . $size . '" height="' . $size . '" loading="lazy">';
		}
	}
	return '';
}

/** Icon for Shopinbos's own services in lists of apps (no brand logo). */
function sib_service_icon( string $name, int $size = 20 ): string {
	$n   = strtolower( $name );
	$map = [ 'store' => 'store', 'pay on delivery' => 'naira', 'bank' => 'naira', 'transfer' => 'naira', 'payment link' => 'link', 'invoice' => 'doc', 'rider' => 'truck',
		'dreacot' => 'truck', 'creator' => 'users', 'affiliate' => 'users', 'csv' => 'doc', 'excel' => 'doc', 'posts' => 'layers', 'sms' => 'phone', 'email' => 'mail' ];
	foreach ( $map as $key => $icon ) {
		if ( str_contains( $n, $key ) ) {
			return sib_theme_icon( $icon, $size, '#16141F' );
		}
	}
	return '';
}
