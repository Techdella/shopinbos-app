<?php
/**
 * Title: Home page
 * Slug: shopinbos/page-home
 * Categories: shopinbos-pages
 * Description: The full shopinbos.com home page from the design canvas.
 * Post Types: page
 */
// Gist stories sit right under the hero.
// Gist stories sit under the hero, and the 15-second video after the brand strip.
$blocks = preg_replace( '/(<!-- wp:shopinbos\/canvas \{"part":"home-01"\} \/-->\n\n)/', "$1<!-- wp:shopinbos/gist-rail /-->\n\n", sib_canvas_blocks( 'home' ), 1 );
echo preg_replace( '/(<!-- wp:shopinbos\/canvas \{"part":"home-02"\} \/-->\n\n)/', "$1<!-- wp:shopinbos/canvas {\"part\":\"motion-home\"} /-->\n\n", $blocks, 1 );
