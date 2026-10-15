<?php
/**
 * Title: Store templates teaser
 * Slug: shopinbos/templates-teaser
 * Categories: shopinbos-sections
 * Description: Four store templates with a link to the full gallery.
 */
echo sib_block_group_open( 'bg-white', 'section', [ 'bottom' => '120px' ] ) . sib_block_group_open( 'wrap' );
echo sib_block_group_open( 'sec-head' );
echo sib_block_group_open( 'col mw-640' ) . sib_block_p( 'Templates', 'eyebrow' ) . sib_block_h( 2, 'A store that looks like your brand' ) . sib_block_p( 'Start from a template, let Rex fit it to your logo and colours, then change anything. On a laptop, the advanced builder gives you every section and setting.', 'lead' ) . sib_block_group_close();
echo sib_block_buttons( [ [ 'See all templates', home_url( '/templates/' ), 'ghost' ] ] );
echo sib_block_group_close();
echo "<!-- wp:shopinbos/template-gallery {\"teaser\":true} /-->\n\n";
echo sib_block_group_close() . sib_block_group_close( 'section' );
