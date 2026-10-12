<?php
/**
 * Title: Home page
 * Slug: shopinbos/page-home
 * Categories: shopinbos-pages
 * Description: The full shopinbos.com home page from the prototype.
 * Post Types: page
 */
foreach ( [ 'home-hero', 'integrations-marquee', 'bento-features', 'connect-tabs', 'ads-showcase', 'social-week', 'how-it-works', 'find-stock-strip', 'templates-teaser', 'grow-with-us', 'faq', 'cta-band' ] as $slug ) {
	echo '<!-- wp:pattern {"slug":"shopinbos/' . $slug . "\"} /-->\n\n";
}
