<?php
/**
 * Inline SVG icons from the prototype (24px grid, 1.8 stroke unless noted).
 */

defined( 'ABSPATH' ) || exit;

function sib_theme_icon( string $name, int $size = 22, string $stroke = 'currentColor' ): string {
	$paths = [
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
