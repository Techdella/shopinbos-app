<?php
/**
 * Title: Bento grid (editable tiles)
 * Slug: shopinbos/bento-grid
 * Categories: shopinbos-content
 * Description: Tiles of different sizes. Change a tile's size with the classes c2 (two columns wide) and r2 (two rows tall).
 */
$tiles = [
	[ 'tile c2 r2', 'mint-soft', 'forest', 'Big tile', 'The headline benefit, with a screenshot or illustration below.' ],
	[ 'tile', 'ink', 'white', 'Dark tile', 'A supporting point.' ],
	[ 'tile', 'peach', 'ink', 'Warm tile', 'Another supporting point.' ],
	[ 'tile c2', 'mist', 'ink', 'Wide tile', 'Something that needs more room, like a list or a strip of products.' ],
];
echo sib_block_group_open( 'sec', 'section' ) . sib_block_group_open( 'wrap' );
echo sib_block_sec_head( 'Eyebrow', 'Section heading', 'One sentence that sums up the tiles.' );
echo sib_block_group_open( 'bento' );
foreach ( $tiles as [ $cls, $bg, $fg, $t, $d ] ) {
	$attrs = [ 'className' => $cls, 'backgroundColor' => $bg, 'textColor' => $fg, 'layout' => [ 'type' => 'default' ] ];
	echo '<!-- wp:group ' . wp_json_encode( $attrs ) . " -->\n<div class=\"wp-block-group {$cls} has-{$fg}-color has-{$bg}-background-color has-text-color has-background\">";
	echo sib_block_h( 3, $t, 'tt' ) . sib_block_p( $d, 'ts' );
	echo sib_block_group_close();
}
echo sib_block_group_close();
echo sib_block_group_close() . sib_block_group_close( 'section' );
