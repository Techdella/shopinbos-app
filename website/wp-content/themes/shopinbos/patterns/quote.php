<?php
/**
 * Title: Seller quote
 * Slug: shopinbos/quote
 * Categories: shopinbos-content
 * Description: A quote from a real seller, with name, shop and city.
 */
echo sib_block_group_open( 'sec', 'section' ) . sib_block_group_open( 'wrap' );
echo '<!-- wp:quote {"className":"is-style-seller"} -->' . "\n" . '<blockquote class="wp-block-quote is-style-seller">' . sib_block_p( '“What the seller said, in their words. Keep it short and specific.”', '' ) . '<cite>Name, Shop name, City</cite></blockquote>' . "\n<!-- /wp:quote -->\n\n";
echo sib_block_group_close() . sib_block_group_close( 'section' );
