<?php
/**
 * Title: Integration tiles
 * Slug: shopinbos/integration-tiles
 * Categories: shopinbos-content
 * Description: Tiles for the integration pages (live list from Integrations).
 */
echo sib_block_group_open( 'sec', 'section' ) . sib_block_group_open( 'wrap' );
echo sib_block_sec_head( 'Integrations', 'Works with the apps you already use' );
echo "<!-- wp:shopinbos/integration-tiles /-->\n\n";
echo sib_block_group_close() . sib_block_group_close( 'section' );
