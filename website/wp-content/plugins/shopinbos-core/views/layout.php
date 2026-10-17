<?php
/**
 * Page shell for virtual marketplace pages: the theme's header and footer parts around our view.
 *
 * @var array $ctx
 */
defined( 'ABSPATH' ) || exit;
?><!doctype html>
<html <?php language_attributes(); ?>>
<head>
<meta charset="<?php bloginfo( 'charset' ); ?>">
<meta name="viewport" content="width=device-width, initial-scale=1">
<?php wp_head(); ?>
</head>
<body <?php body_class(); ?>>
<?php wp_body_open(); ?>
<div class="wp-site-blocks">
<?php echo do_blocks( '<!-- wp:template-part {"slug":"header","tagName":"div"} /-->' ); // phpcs:ignore ?>
<main class="sib" id="main">
<?php
if ( ! empty( $ctx['stale'] ) && 'unavailable' !== $ctx['view'] ) {
	echo '<div class="wrap" style="padding-top:16px"><p class="stale-note" role="status">'
		. ( ! empty( $ctx['prices_hidden'] )
			? esc_html__( 'We can’t reach the marketplace right now, so prices are hidden. Sign up to see live prices in the app.', 'shopinbos' )
			: esc_html__( 'Showing the last saved copy of this page. Live prices are in the app.', 'shopinbos' ) )
		. '</p></div>';
}
echo sib_view( $ctx['view'], [ 'ctx' => $ctx ] ); // phpcs:ignore
?>
</main>
<?php echo do_blocks( '<!-- wp:template-part {"slug":"footer","tagName":"div"} /-->' ); // phpcs:ignore ?>
</div>
<?php wp_footer(); ?>
</body>
</html>
