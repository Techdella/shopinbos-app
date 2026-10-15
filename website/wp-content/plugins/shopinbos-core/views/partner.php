<?php
/**
 * /delivery/partners/{slug}/
 *
 * @var array $ctx
 */
defined( 'ABSPATH' ) || exit;
$l = $ctx['partner'];
?>
<section class="bg-forest on-dark">
	<div class="wrap" style="padding-top:28px;padding-bottom:64px;display:flex;flex-direction:column;gap:28px">
		<div class="on-dark-crumbs"><?php echo sib_view( 'parts/crumbs', [ 'crumbs' => $ctx['crumbs'] ] ); // phpcs:ignore ?></div>
		<div class="split">
			<div class="col-22">
				<p class="eyebrow" style="color:#8BE3D3"><?php esc_html_e( 'Delivery partner', 'shopinbos' ); ?></p>
				<h1 class="disp h2"><?php echo esc_html( $l['name'] ); ?></h1>
				<?php if ( $l['about'] ) : ?><p class="lead"><?php echo esc_html( $l['about'] ); ?></p><?php endif; ?>
				<div class="row wrapflex">
					<a class="btn btn-acc" href="<?php echo esc_url( sib_go_url( 'book_delivery', [ 'logisticsSlug' => $l['slug'] ] ) ); ?>"><?php printf( esc_html__( 'Deliver with %s', 'shopinbos' ), esc_html( $l['name'] ) ); ?><?php echo sib_icon( 'arrow', 16 ); // phpcs:ignore ?></a>
				</div>
			</div>
			<div style="background:#fff;color:#16141F;border-radius:28px;padding:22px;display:flex;flex-direction:column;gap:4px">
				<?php
				$rows = array_filter( [
					__( 'Speed', 'shopinbos' )        => $l['speed'],
					__( 'Starts from', 'shopinbos' )  => $ctx['prices_hidden'] ? '' : $l['price_t'],
					__( 'Based in', 'shopinbos' )     => $l['city'],
					__( 'Vehicles', 'shopinbos' )     => implode( ', ', array_map( 'ucfirst', $l['vehicles'] ) ),
					__( 'Delivery types', 'shopinbos' ) => implode( ', ', $l['types'] ),
					__( 'Rating', 'shopinbos' )       => $l['rating'] ? '★ ' . $l['rating'] . ( $l['reviews'] ? ' (' . $l['reviews'] . ')' : '' ) : '',
					__( 'On time', 'shopinbos' )      => null !== $l['reliability'] ? $l['reliability'] . '%' : '',
				] );
				foreach ( $rows as $k => $v ) : ?>
					<div class="kv"><span class="muted"><?php echo esc_html( $k ); ?></span><b><?php echo esc_html( $v ); ?></b></div>
				<?php endforeach; ?>
				<span class="tag <?php echo $l['cod'] ? 'tag-ok' : ''; ?>" style="align-self:flex-start;margin-top:10px"><?php echo $l['cod'] ? esc_html__( 'Pay on delivery', 'shopinbos' ) : esc_html__( 'Prepaid only', 'shopinbos' ); ?></span>
			</div>
		</div>
	</div>
</section>
<?php if ( $l['zones'] ) : ?>
<section class="sec">
	<div class="wrap col-22">
		<h2 class="disp h3"><?php esc_html_e( 'Where they deliver', 'shopinbos' ); ?></h2>
		<div class="row wrapflex" style="gap:8px">
			<?php foreach ( $l['zones'] as $z ) : ?><span class="chip"><?php echo esc_html( sib_zone_label( sanitize_title( $z ) ) ); ?></span><?php endforeach; ?>
		</div>
		<p class="p"><?php esc_html_e( 'Turn them on in the app under Delivery. Your customers see their live price at checkout.', 'shopinbos' ); ?></p>
	</div>
</section>
<?php endif; ?>
