<?php
/**
 * Product card (prototype .pcard).
 *
 * @var array $p        product view model
 * @var bool  $hide     hide prices (stale data)
 * @var bool  $lazy
 */
defined( 'ABSPATH' ) || exit;
$hide = $hide ?? false;
?>
<div class="pcard"<?php echo isset( $tags ) ? ' data-tags="' . esc_attr( $tags ) . '"' : ''; ?>>
	<a class="pcard-link" href="<?php echo esc_url( $p['url'] ); ?>">
		<?php if ( $p['img'] ) : ?>
			<img class="pimg" src="<?php echo esc_url( $p['img'] ); ?>" alt="<?php echo esc_attr( $p['name'] ); ?>" width="400" height="400" loading="<?php echo ! empty( $lazy ) ? 'lazy' : 'eager'; ?>" decoding="async">
		<?php else : ?>
			<span class="pimg pimg-ph" aria-hidden="true"><?php echo esc_html( mb_substr( $p['name'], 0, 1 ) ); ?></span>
		<?php endif; ?>
		<span class="pinfo"><span class="pname"><?php echo esc_html( $p['name'] ); ?></span><span class="pmeta"><?php echo esc_html( trim( $p['sup_name'] . ' · ' . $p['sup_loc'], ' ·' ) ); ?></span></span>
	</a>
	<?php if ( ! $p['in_stock'] ) : ?><span class="tag tag-amber oos"><?php esc_html_e( 'Out of stock', 'shopinbos' ); ?></span><?php endif; ?>
	<div class="pfoot">
		<span style="display:flex;flex-direction:column">
			<?php if ( $hide ) : ?>
				<span class="psell"><?php esc_html_e( 'Price in the app', 'shopinbos' ); ?></span>
			<?php elseif ( $p['sell'] ) : ?>
				<span class="psell"><?php printf( esc_html__( 'Sell for %s', 'shopinbos' ), esc_html( $p['sell_t'] ) ); ?></span>
				<span class="pkeep"><?php printf( esc_html__( 'You keep %s', 'shopinbos' ), esc_html( $p['keep_t'] ) ); ?></span>
			<?php else : ?>
				<span class="psell"><?php esc_html_e( 'Supplier price', 'shopinbos' ); ?></span>
				<span class="pkeep" style="color:var(--ink)"><?php echo esc_html( $p['cost_t'] ); ?></span>
			<?php endif; ?>
		</span>
		<a class="btn btn-ink btn-s hide-m" href="<?php echo esc_url( sib_go_url( 'dropship', [ 'productSlug' => $p['slug'] ] ) ); ?>" aria-label="<?php echo esc_attr( sprintf( __( 'Sell %s in my store', 'shopinbos' ), $p['name'] ) ); ?>"><?php esc_html_e( 'Sell this', 'shopinbos' ); ?></a>
	</div>
</div>
