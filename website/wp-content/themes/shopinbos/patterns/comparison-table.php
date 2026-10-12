<?php
/**
 * Title: Comparison table
 * Slug: shopinbos/comparison-table
 * Categories: shopinbos-content
 * Description: Honest side-by-side table. Link to the other product's pricing page and date the comparison.
 */
$rows = [ [ 'Price per month', '[PRICE]', 'Their price (link to their pricing page)' ], [ 'Pay on delivery with codes', 'Yes', '' ], [ 'WhatsApp selling', 'Catalogue, inbox and payment links', '' ], [ 'Dropship from Nigerian suppliers', 'Yes', '' ], [ 'Where they are better', '', 'Be fair: name what they do well' ] ];
$body = '';
foreach ( $rows as [ $a, $b, $c ] ) {
	$body .= "<tr><td>{$a}</td><td>{$b}</td><td>{$c}</td></tr>";
}
echo sib_block_group_open( 'sec', 'section' ) . sib_block_group_open( 'wrap col-22' );
echo sib_block_p( 'Side by side', 'eyebrow' ) . sib_block_h( 2, 'Shopinbos and [Other] compared' );
echo '<!-- wp:table {"className":"is-style-compare"} -->' . "\n" . '<figure class="wp-block-table is-style-compare"><table><thead><tr><th></th><th>Shopinbos</th><th>[Other]</th></tr></thead><tbody>' . $body . '</tbody></table><figcaption class="wp-element-caption">Checked on [date]. Prices from each product’s public pricing page.</figcaption></figure>' . "\n<!-- /wp:table -->\n\n";
echo sib_block_group_close() . sib_block_group_close( 'section' );
