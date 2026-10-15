<?php
/**
 * Title: Find stock to sell (live products)
 * Slug: shopinbos/find-stock-strip
 * Categories: shopinbos-sections
 * Description: Trending marketplace products read live from the app, with "Sell this" sign-up buttons.
 */
echo sib_block_group_open( 'fold bg-white', 'section' ) . sib_block_group_open( 'fold-in', 'div', [ 'bottom' => '72px' ] ) . sib_block_group_open( 'wrap' );
echo sib_block_group_open( 'sec-head' );
echo sib_block_group_open( 'col mw-640' ) . sib_block_p( 'Find stock to sell', 'eyebrow' ) . sib_block_h( 2, 'Sell without buying stock first' ) . sib_block_p( 'Add products from Nigerian suppliers to your store at your price. When it sells, they pack it with your label. You’re paid after delivery.', 'lead' ) . sib_block_group_close();
echo sib_block_buttons( [ [ 'See all products', home_url( '/marketplace/' ), 'ghost' ] ] );
echo sib_block_group_close();
echo "<!-- wp:shopinbos/product-strip {\"count\":6,\"columns\":3} /-->\n\n";
echo sib_block_group_close() . sib_block_group_close() . sib_block_group_close( 'section' );
