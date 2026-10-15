<?php
/**
 * Title: Templates page header
 * Slug: shopinbos/templates-hero
 * Categories: shopinbos-sections
 * Description: Header for the store templates gallery.
 * Inserter: no
 */
echo sib_block_group_open( 'bg-mist', 'section' ) . sib_block_group_open( 'wrap col', 'div', [ 'top' => '56px', 'bottom' => '36px' ] );
echo sib_block_p( 'Store templates', 'eyebrow' ) . sib_block_h( 1, 'Pick a look. Rex fits it to your brand.', 'disp h2 mw-760' );
echo sib_block_p( 'Every template works on phones first, loads fast on 4G, and has pay on delivery and WhatsApp ordering built in. Change templates any time without losing products.', 'lead mw-640' );
echo sib_block_group_close() . sib_block_group_close( 'section' );
