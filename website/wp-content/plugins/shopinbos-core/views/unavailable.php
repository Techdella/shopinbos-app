<?php
/**
 * 404, 410 and 503 for marketplace pages.
 *
 * @var array $ctx
 */
defined( 'ABSPATH' ) || exit;
$copy = [
	404 => __( 'It may have been renamed. Have a look at what’s on the marketplace today.', 'shopinbos' ),
	410 => __( 'The supplier has taken this down. There are plenty more products to sell.', 'shopinbos' ),
	503 => __( 'We can’t reach the marketplace right now. Try again in a few minutes, or see live products in the app.', 'shopinbos' ),
];
?>
<section class="bg-mist">
	<div class="wrap empty" style="padding-top:96px;padding-bottom:120px">
		<img src="<?php echo sib_img( 'rex-side.webp' ); ?>" alt="" width="140" height="140" style="width:140px">
		<h1 class="disp h2"><?php echo esc_html( $ctx['title'] ); ?></h1>
		<p class="lead mw-520"><?php echo esc_html( $copy[ $ctx['status'] ] ?? $copy[404] ); ?></p>
		<div class="row wrapflex" style="justify-content:center">
			<a class="btn btn-ink" href="<?php echo esc_url( home_url( '/marketplace/' ) ); ?>"><?php esc_html_e( 'Find stock', 'shopinbos' ); ?></a>
			<a class="btn btn-ghost" href="<?php echo esc_url( sib_go_url( 'view_products' ) ); ?>"><?php esc_html_e( 'Open the app', 'shopinbos' ); ?></a>
		</div>
	</div>
</section>
