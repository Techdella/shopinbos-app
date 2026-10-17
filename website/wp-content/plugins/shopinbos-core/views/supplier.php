<?php
/**
 * /suppliers/{slug}/
 *
 * @var array $ctx
 */
defined( 'ABSPATH' ) || exit;
$s = $ctx['supplier'];
?>
<section class="bg-peach">
	<div class="wrap" style="padding-top:28px;padding-bottom:56px;display:flex;flex-direction:column;gap:28px">
		<?php echo sib_view( 'parts/crumbs', [ 'crumbs' => $ctx['crumbs'] ] ); // phpcs:ignore ?>
		<div class="split">
			<div class="col-22">
				<p class="eyebrow"><?php esc_html_e( 'Checked supplier', 'shopinbos' ); ?></p>
				<h1 class="disp h2"><?php echo esc_html( $s['name'] ); ?></h1>
				<div class="row wrapflex" style="gap:8px">
					<?php foreach ( array_filter( [ $s['loc'], $s['rating'] ? '★ ' . $s['rating'] . ( $s['reviews'] ? ' (' . $s['reviews'] . ')' : '' ) : '', $s['reply'], $s['count'] ? sprintf( _n( '%d product', '%d products', $s['count'], 'shopinbos' ), $s['count'] ) : '' ] ) as $t ) : ?>
						<span class="tag tag-white"><?php echo esc_html( $t ); ?></span>
					<?php endforeach; ?>
				</div>
				<?php if ( $s['about'] ) : ?><p class="lead"><?php echo esc_html( $s['about'] ); ?></p><?php endif; ?>
				<div class="row wrapflex">
					<a class="btn btn-ink" href="<?php echo esc_url( sib_go_url( 'view_products', [ 'supplierSlug' => $s['slug'] ] ) ); ?>"><?php esc_html_e( 'Sell their products', 'shopinbos' ); ?><?php echo sib_icon( 'arrow', 16 ); // phpcs:ignore ?></a>
					<a class="btn btn-ghost" href="<?php echo esc_url( sib_go_url( 'request_quote', [ 'supplierSlug' => $s['slug'] ] ) ); ?>"><?php esc_html_e( 'Ask for a wholesale quote', 'shopinbos' ); ?></a>
				</div>
			</div>
			<?php if ( $s['img'] ) : ?>
				<img src="<?php echo esc_url( $s['img'] ); ?>" alt="" width="560" height="420" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:28px" fetchpriority="high">
			<?php endif; ?>
		</div>
	</div>
</section>
<section class="sec">
	<div class="wrap" style="display:flex;flex-direction:column;gap:24px">
		<h2 class="disp h3"><?php printf( esc_html__( 'Products from %s', 'shopinbos' ), esc_html( $s['name'] ) ); ?></h2>
		<?php if ( $s['products'] ) : ?>
			<div class="g4"><?php foreach ( $s['products'] as $i => $p ) {
				$p['sup_name'] = $p['sup_name'] ?: $s['name'];
				$p['sup_loc']  = $p['sup_loc'] ?: $s['loc'];
				echo sib_view( 'parts/product-card', [ 'p' => $p, 'hide' => $ctx['prices_hidden'], 'lazy' => $i > 3 ] ); // phpcs:ignore
			} ?></div>
		<?php else : ?>
			<p class="p"><?php esc_html_e( 'Their products are being checked. They’ll show here soon.', 'shopinbos' ); ?></p>
		<?php endif; ?>
	</div>
</section>
