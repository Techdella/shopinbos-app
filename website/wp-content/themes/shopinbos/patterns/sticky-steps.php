<?php
/**
 * Title: How it works (editable sticky steps)
 * Slug: shopinbos/sticky-steps
 * Categories: shopinbos-content
 * Description: Folded section with numbered cards that stack on scroll. Add a screenshot to each card.
 */
$steps = [
	[ '01', 'First step', 'What the seller does, in the app, in one or two sentences.', 'white', 'ink' ],
	[ '02', 'Second step', 'What Shopinbos, Rex or Peggy does for them.', 'mint-soft', 'forest' ],
	[ '03', 'Third step', 'The result: an order, a delivery, money in the bank.', 'peach', 'ink' ],
];
echo sib_block_group_open( 'fold bg-mist', 'section' ) . sib_block_group_open( 'wrap fold-in' );
echo sib_block_group_open( 'col mw-720' ) . sib_block_p( 'How it works', 'eyebrow' ) . sib_block_h( 2, 'How it works, step by step' ) . sib_block_group_close();
echo '<!-- wp:group {"className":"stack","style":{"spacing":{"margin":{"top":"40px"}}},"layout":{"type":"default"}} -->' . "\n" . '<div class="wp-block-group stack" style="margin-top:40px">';
foreach ( $steps as [ $n, $t, $d, $bg, $fg ] ) {
	$attrs = [ 'className' => 'scard', 'backgroundColor' => $bg, 'textColor' => $fg, 'layout' => [ 'type' => 'default' ] ];
	echo '<!-- wp:group ' . wp_json_encode( $attrs ) . " -->\n<div class=\"wp-block-group scard has-{$fg}-color has-{$bg}-background-color has-text-color has-background\">";
	echo sib_block_group_open( 'col' ) . sib_block_p( $n, 'disp snum' ) . sib_block_h( 3, $t, 'disp h2' ) . sib_block_p( $d, 'lead' ) . sib_block_group_close();
	echo '<!-- wp:image {"sizeSlug":"full","linkDestination":"none","className":"step-shot"} -->' . "\n" . '<figure class="wp-block-image size-full step-shot"><img src="' . sib_theme_img( 'rex.webp' ) . '" alt=""/></figure>' . "\n<!-- /wp:image -->\n\n";
	echo sib_block_group_close();
}
echo sib_block_group_close();
echo sib_block_group_close() . sib_block_group_close( 'section' );
