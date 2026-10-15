<?php
/**
 * Title: FAQ for content pages
 * Slug: shopinbos/faq-section
 * Categories: shopinbos-content
 * Description: Heading plus three questions. Questions become FAQPage schema automatically.
 */
echo sib_block_group_open( 'bg-mist', 'section', [ 'top' => '72px', 'bottom' => '96px' ] ) . sib_block_group_open( 'wrap split split-top' );
echo sib_block_group_open( 'col' ) . sib_block_p( 'Questions', 'eyebrow' ) . sib_block_h( 2, 'Good to know' ) . sib_block_group_close();
echo sib_block_group_open( 'faq' );
foreach ( [ 'A question people search for?', 'Another real question?', 'A third question?' ] as $q ) {
	echo "<!-- wp:details -->\n<details class=\"wp-block-details\"><summary>{$q}</summary><!-- wp:paragraph -->\n<p>A short, direct answer.</p>\n<!-- /wp:paragraph --></details>\n<!-- /wp:details -->\n\n";
}
echo sib_block_group_close();
echo sib_block_group_close() . sib_block_group_close( 'section' );
