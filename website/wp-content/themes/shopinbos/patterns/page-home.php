<?php
/**
 * Title: Home page
 * Slug: shopinbos/page-home
 * Categories: shopinbos-pages
 * Description: The full shopinbos.com home page from the design canvas.
 * Post Types: page
 */
// Gist stories sit right under the hero.
echo preg_replace( '/(<!-- wp:shopinbos\/canvas \{"part":"home-01"\} \/-->\n\n)/', "$1<!-- wp:shopinbos/gist-rail /-->\n\n", sib_canvas_blocks( 'home' ), 1 );
