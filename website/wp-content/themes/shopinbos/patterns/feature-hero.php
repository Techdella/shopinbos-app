<?php
/**
 * Title: Page hero (feature, solution, industry, city)
 * Slug: shopinbos/feature-hero
 * Categories: shopinbos-content
 * Description: Eyebrow, H1 promise, lead, sign-up buttons and a visual. Replace the image with a screenshot.
 */
echo sib_block_group_open( 'bg-mist', 'section' ) . sib_block_group_open( 'wrap split', 'div', [ 'top' => '56px', 'bottom' => '72px' ] );
echo sib_block_group_open( 'col-22' ) . sib_block_p( 'Feature', 'eyebrow' ) . sib_block_h( 1, 'One-line promise of what this does for a shop', 'disp h1 h1-58' )
	. sib_block_p( 'Two sentences on who it is for and the result they get. Use the words people search for.', 'lead' )
	. sib_block_buttons( [ [ 'Start your shop', sib_theme_go( '', [ 'place' => 'feature_hero' ] ), 'accent' ], [ 'See pricing', home_url( '/pricing/' ), 'ghost' ] ] ) . sib_block_group_close();
echo '<!-- wp:image {"sizeSlug":"full","linkDestination":"none","className":"hero-visual"} -->' . "\n" . '<figure class="wp-block-image size-full hero-visual"><img src="' . sib_theme_img( 'store-hero.webp' ) . '" alt=""/></figure>' . "\n<!-- /wp:image -->\n\n";
echo sib_block_group_close() . sib_block_group_close( 'section' );
