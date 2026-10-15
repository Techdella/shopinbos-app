<?php
/**
 * Title: Folded section (text and visual)
 * Slug: shopinbos/folded-section
 * Categories: shopinbos-content
 * Description: Coloured section with rounded top that tucks over the one above. Text on the left, image on the right.
 */
echo '<!-- wp:group {"tagName":"section","className":"fold","backgroundColor":"peach","layout":{"type":"default"}} -->' . "\n" . '<section class="wp-block-group fold has-peach-background-color has-background">';
echo sib_block_group_open( 'wrap fold-in split' );
echo sib_block_group_open( 'col-22' ) . sib_block_p( 'Eyebrow', 'eyebrow' ) . sib_block_h( 2, 'Section heading' ) . sib_block_p( 'A short paragraph that explains the idea. Two or three sentences at most.', 'lead' ) . sib_block_group_close();
echo '<!-- wp:image {"sizeSlug":"full","linkDestination":"none","className":"rounded-28"} -->' . "\n" . '<figure class="wp-block-image size-full rounded-28"><img src="' . sib_theme_img( 'camel-coat.webp' ) . '" alt=""/></figure>' . "\n<!-- /wp:image -->\n\n";
echo sib_block_group_close() . sib_block_group_close( 'section' );
