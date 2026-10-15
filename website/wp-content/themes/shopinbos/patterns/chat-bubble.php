<?php
/**
 * Title: Rex or Peggy says…
 * Slug: shopinbos/chat-bubble
 * Categories: shopinbos-content
 * Description: A tip from Rex (store building) or Peggy (selling). Swap the image to change who is talking.
 */
echo sib_block_group_open( 'chat-bubble' );
echo sib_block_html( '<img src="' . sib_theme_img( 'peggy.webp' ) . '" alt="Peggy" width="56" height="56" loading="lazy">' );
echo sib_block_group_open( 'bubble-body' ) . sib_block_p( '<strong>Peggy’s tip</strong>', '' ) . sib_block_p( 'Write the tip here, in a friendly voice. One or two sentences.', '' ) . sib_block_group_close();
echo sib_block_group_close();
