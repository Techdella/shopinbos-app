<?php
/**
 * Title: CTA band with Rex and Peggy
 * Slug: shopinbos/cta-band
 * Categories: shopinbos-sections, shopinbos-content
 * Description: Dark folded closing section: "Rex is ready when you are".
 */
echo sib_block_group_open( 'fold bg-ink on-dark sib-cta', 'section' ) . sib_block_group_open( 'wrap fold-in hero-head', 'div' );
echo sib_block_html( '<img src="' . sib_theme_img( 'rex-side.webp' ) . '" alt="" width="160" height="160" loading="lazy" class="hide-m cta-rex"><img src="' . sib_theme_img( 'peggy-wave.webp' ) . '" alt="" width="140" height="140" loading="lazy" class="hide-m cta-peggy">' );
echo sib_block_h( 2, 'Rex is ready when you are', 'disp h1 hbig mw-760' );
echo sib_block_p( 'Tell Rex what you sell. Your store will be ready to share before your tea gets cold.', 'lead mw-520' );
echo sib_block_buttons( [ [ 'Start your shop', sib_theme_go( '', [ 'place' => 'cta_band' ] ), 'accent' ], [ 'See pricing', home_url( '/pricing/' ), 'glass' ] ], 'center' );
echo sib_block_group_close() . sib_block_group_close( 'section' );
