<?php
/**
 * Title: Benefit grid (3 to 6 cards)
 * Slug: shopinbos/benefit-grid
 * Categories: shopinbos-content
 * Description: Section heading and benefit cards. Duplicate or delete cards to get 3 to 6.
 */
$benefits = [
	[ 'Benefit one', 'What changes for the seller, in one or two plain sentences.' ],
	[ 'Benefit two', 'Lead with the outcome. Name the channel or city if it matters.' ],
	[ 'Benefit three', 'Keep it honest. No claims we can’t back up.' ],
];
echo sib_block_group_open( 'sec', 'section' ) . sib_block_group_open( 'wrap' );
echo sib_block_sec_head( 'Why it helps', 'What you get', 'One sentence that sums up the benefits below.' );
echo sib_block_group_open( 'g3' );
foreach ( $benefits as [ $t, $d ] ) {
	echo sib_block_group_open( 'card benefit' ) . sib_block_h( 3, $t, 'tt' ) . sib_block_p( $d, 'p' ) . sib_block_group_close();
}
echo sib_block_group_close();
echo sib_block_group_close() . sib_block_group_close( 'section' );
