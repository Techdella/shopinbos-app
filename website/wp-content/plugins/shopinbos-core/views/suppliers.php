<?php
/**
 * /suppliers/
 *
 * @var array $ctx
 */
defined( 'ABSPATH' ) || exit;
?>
<section class="bg-mist">
	<div class="wrap col-22" style="padding-top:40px;padding-bottom:36px">
		<?php echo sib_view( 'parts/crumbs', [ 'crumbs' => $ctx['crumbs'] ] ); // phpcs:ignore ?>
		<h1 class="disp h2"><?php echo esc_html( $ctx['h1'] ); ?></h1>
		<p class="lead mw-640"><?php echo esc_html( $ctx['description'] ); ?></p>
	</div>
</section>
<section class="sec" style="padding-top:40px">
	<div class="wrap"><?php echo sib_view( 'parts/supplier-cards', [ 'suppliers' => $ctx['suppliers'] ] ); // phpcs:ignore ?></div>
</section>
