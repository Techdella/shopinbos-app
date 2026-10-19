<?php
/**
 * Title: Product strip from the marketplace
 * Slug: shopinbos/product-strip
 * Categories: shopinbos-content
 * Description: Live products from the app's marketplace. Pick a category in the block settings.
 */
echo sib_block_group_open( 'sec', 'section' ) . sib_block_group_open( 'wrap' );
echo sib_block_sec_head( 'Find stock', 'Products you can sell today', '', [ 'See all products', home_url( '/marketplace/' ), 'ghost' ] );
echo "<!-- wp:shopinbos/product-strip {\"count\":4,\"columns\":4} /-->\n\n";
echo sib_block_group_close() . sib_block_group_close( 'section' );
