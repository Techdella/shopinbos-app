<?php
/**
 * /marketplace/products/{slug}/ : dropship or wholesale (prototype "Supplier product").
 *
 * @var array $ctx
 */
defined( 'ABSPATH' ) || exit;
$p     = $ctx['product'];
$hide  = $ctx['prices_hidden'];
$tiers = $p['tiers'] ?: [ [ 'min' => max( 1, $p['moq'] ), 'max' => null, 'price' => $p['cost'] ] ];
$sell  = $p['sell'] ?: $p['cost'];
$calc  = [ 'cost' => $p['cost'], 'sell' => $sell, 'delivery' => sib_example_delivery_fee(), 'moq' => $p['moq'], 'tiers' => $tiers ];
$fee   = sib_paystack_fee( $sell + sib_example_delivery_fee() );
$keep  = $sell - $p['cost'] - $fee;
$unit  = $tiers[0]['price'];
$qty   = $tiers[0]['min'];
$label = ! empty( $p['sup_raw'] ); // supplier block present
$default_mode = $p['dropship'] ? 'drop' : 'ws';
?>
<section>
	<div class="wrap" style="padding-top:28px;padding-bottom:96px;display:flex;flex-direction:column;gap:28px">
		<?php echo sib_view( 'parts/crumbs', [ 'crumbs' => $ctx['crumbs'] ] ); // phpcs:ignore ?>
		<div class="split split-top" style="gap:48px">
			<div style="display:flex;flex-direction:column;gap:12px" data-gallery>
				<?php if ( $p['img'] ) : ?>
					<img class="pd-img" data-gallery-main src="<?php echo esc_url( $p['img'] ); ?>" alt="<?php echo esc_attr( $p['name'] ); ?>" width="600" height="600" fetchpriority="high">
				<?php else : ?>
					<span class="pd-img pimg-ph" aria-hidden="true"><?php echo esc_html( mb_substr( $p['name'], 0, 1 ) ); ?></span>
				<?php endif; ?>
				<?php if ( count( $p['images'] ) > 1 ) : ?>
					<div class="pd-thumbs">
						<?php foreach ( array_slice( $p['images'], 0, 8 ) as $i => $src ) : ?>
							<button type="button" data-gallery-thumb="<?php echo esc_url( $src ); ?>" aria-pressed="<?php echo 0 === $i ? 'true' : 'false'; ?>" aria-label="<?php echo esc_attr( sprintf( __( 'Photo %d', 'shopinbos' ), $i + 1 ) ); ?>"><img src="<?php echo esc_url( $src ); ?>" alt="" width="72" height="72" loading="lazy"></button>
						<?php endforeach; ?>
					</div>
				<?php endif; ?>
				<?php if ( $p['sup_slug'] ) : ?>
					<a class="card" href="<?php echo esc_url( home_url( '/suppliers/' . $p['sup_slug'] . '/' ) ); ?>" style="padding:18px;display:flex;gap:14px;align-items:center;text-decoration:none;color:inherit">
						<span style="width:48px;height:48px;border-radius:14px;background:#F6F5F9;display:flex;align-items:center;justify-content:center;flex:none"><?php echo sib_icon( 'store', 22, '#16141F' ); // phpcs:ignore ?></span>
						<span style="flex:1"><span style="font-weight:800;display:block"><?php echo esc_html( $p['sup_name'] ); ?></span><span style="font-size:13px;color:#6B6779"><?php echo esc_html( implode( ' · ', array_filter( [ $p['sup_loc'], $p['sup_rating'] ? '★ ' . $p['sup_rating'] : '', $p['sup_raw']['responseTimeLabel'] ?? '' ] ) ) ); ?></span></span>
						<span class="tag tag-ok"><?php esc_html_e( 'Checked', 'shopinbos' ); ?></span>
					</a>
				<?php endif; ?>
			</div>
			<div style="display:flex;flex-direction:column;gap:20px" data-calc="<?php echo esc_attr( wp_json_encode( $calc ) ); ?>">
				<div style="display:flex;flex-direction:column;gap:10px">
					<h1 class="disp h2" style="font-size:40px"><?php echo esc_html( $p['name'] ); ?></h1>
					<div class="row" style="gap:8px;flex-wrap:wrap">
						<?php if ( $p['ships'] ) : ?><span class="tag"><?php echo esc_html( $p['ships'] ); ?></span><?php endif; ?>
						<?php if ( null !== $p['stock'] ) : ?><span class="tag <?php echo $p['in_stock'] ? '' : 'tag-amber'; ?>"><?php echo $p['in_stock'] ? esc_html( sprintf( __( '%d in stock', 'shopinbos' ), $p['stock'] ) ) : esc_html__( 'Out of stock right now', 'shopinbos' ); ?></span><?php endif; ?>
						<?php if ( $p['dropship'] ) : ?><span class="tag tag-peach"><?php esc_html_e( 'Ships with your label', 'shopinbos' ); ?></span><?php endif; ?>
					</div>
					<?php if ( $p['description'] ) : ?><p class="p"><?php echo esc_html( $p['description'] ); ?></p><?php endif; ?>
				</div>
				<?php if ( $p['dropship'] && $p['bulk'] ) : ?>
					<div class="seg" role="group" aria-label="<?php esc_attr_e( 'How you want to sell it', 'shopinbos' ); ?>" data-toggle="mode" style="align-self:flex-start">
						<button type="button" class="segb" data-value="drop" aria-pressed="true"><?php esc_html_e( 'Dropship · no stock', 'shopinbos' ); ?></button>
						<button type="button" class="segb" data-value="ws" aria-pressed="false"><?php esc_html_e( 'Buy wholesale', 'shopinbos' ); ?></button>
					</div>
				<?php endif; ?>

				<?php if ( $p['dropship'] ) : ?>
				<div class="card" data-toggle-show="mode:drop"<?php echo 'drop' !== $default_mode ? ' hidden' : ''; ?> style="padding:22px;display:flex;flex-direction:column;gap:16px">
					<?php if ( $hide ) : ?>
						<p class="p"><?php esc_html_e( 'Live prices are in the app. Add it to your store and set your price there.', 'shopinbos' ); ?></p>
					<?php else : ?>
						<div class="row between wrapflex"><div><div style="font-size:13px;color:#6B6779;font-weight:600"><?php esc_html_e( 'Your price', 'shopinbos' ); ?></div><div class="disp" style="font-size:34px" data-out="price" aria-live="polite"><?php echo esc_html( sib_money( $sell ) ); ?></div></div>
							<div class="stepper"><button type="button" data-act="minus" aria-label="<?php esc_attr_e( 'Lower price by 500 naira', 'shopinbos' ); ?>">−</button><button type="button" data-act="plus" aria-label="<?php esc_attr_e( 'Raise price by 500 naira', 'shopinbos' ); ?>">+</button></div></div>
						<?php if ( $p['sell'] ) : ?><div style="font-size:13px;color:#6B6779"><?php printf( esc_html__( 'Shops usually sell this for around %s.', 'shopinbos' ), esc_html( $p['sell_t'] ) ); ?></div><?php endif; ?>
						<div>
							<div class="kv"><span class="muted"><?php printf( esc_html__( 'Your customer pays (with %s delivery)', 'shopinbos' ), esc_html( sib_money( sib_example_delivery_fee() ) ) ); ?></span><b data-out="total"><?php echo esc_html( sib_money( $sell + sib_example_delivery_fee() ) ); ?></b></div>
							<div class="kv"><span class="muted"><?php esc_html_e( 'Supplier gets', 'shopinbos' ); ?></span><b><?php echo esc_html( $p['cost_t'] ); ?></b></div>
							<div class="kv"><span class="muted"><?php esc_html_e( 'Payment fee', 'shopinbos' ); ?></span><b data-out="fee"><?php echo esc_html( sib_money( $fee ) ); ?></b></div>
							<div class="kv"><span style="font-weight:800"><?php esc_html_e( 'You keep', 'shopinbos' ); ?></span><b style="font-size:17px;color:var(--ok)" data-out="keep"><?php echo esc_html( sib_money( $keep ) . ' · ' . ( $sell ? round( $keep / $sell * 100 ) : 0 ) . '%' ); ?></b></div>
						</div>
					<?php endif; ?>
					<a class="btn btn-acc btn-block" href="<?php echo esc_url( sib_go_url( 'dropship', [ 'productSlug' => $p['slug'] ] ) ); ?>"><?php esc_html_e( 'Sell this in my store', 'shopinbos' ); ?><?php echo sib_icon( 'arrow', 16 ); // phpcs:ignore ?></a>
					<div style="font-size:12.5px;color:#6B6779;text-align:center"><?php esc_html_e( 'Free to add. You only pay the supplier when a customer buys.', 'shopinbos' ); ?></div>
				</div>
				<?php endif; ?>

				<?php if ( $p['bulk'] ) : ?>
				<div class="card" data-toggle-show="mode:ws"<?php echo 'ws' !== $default_mode ? ' hidden' : ''; ?> style="padding:22px;display:flex;flex-direction:column;gap:16px">
					<?php if ( $hide ) : ?>
						<p class="p"><?php esc_html_e( 'Wholesale prices are in the app. Ask the supplier for a quote and they reply there.', 'shopinbos' ); ?></p>
					<?php else : ?>
						<div style="display:flex;flex-direction:column;gap:8px">
							<?php foreach ( $tiers as $i => $t ) :
								$range = isset( $tiers[ $i + 1 ] ) ? $t['min'] . '–' . ( $tiers[ $i + 1 ]['min'] - 1 ) : $t['min'] . '+';
								$save  = $p['cost'] > 0 ? round( ( 1 - $t['price'] / $p['cost'] ) * 100 ) : 0; ?>
								<div class="tier<?php echo 0 === $i ? ' is-active' : ''; ?>" data-tier-min="<?php echo (int) $t['min']; ?>" data-tier-price="<?php echo esc_attr( (string) $t['price'] ); ?>"><span style="font-weight:700"><?php echo esc_html( sprintf( __( '%s pieces', 'shopinbos' ), $range ) ); ?></span><span><b><?php echo esc_html( sib_money( $t['price'], $p['currency'] ) ); ?></b> <span style="font-size:12.5px;color:#6B6779"><?php echo esc_html( $save > 0 ? sprintf( __( 'each · %d%% off', 'shopinbos' ), $save ) : __( 'each', 'shopinbos' ) ); ?></span></span></div>
							<?php endforeach; ?>
						</div>
						<div class="row between wrapflex"><div><div style="font-size:13px;color:#6B6779;font-weight:600"><?php esc_html_e( 'Quantity', 'shopinbos' ); ?></div><div class="disp" style="font-size:30px" data-out="qty" aria-live="polite"><?php echo esc_html( sprintf( __( '%d pieces', 'shopinbos' ), $qty ) ); ?></div></div>
							<div class="stepper"><button type="button" data-act="qminus" aria-label="<?php esc_attr_e( 'Ten fewer', 'shopinbos' ); ?>">−</button><button type="button" data-act="qplus" aria-label="<?php esc_attr_e( 'Ten more', 'shopinbos' ); ?>">+</button></div></div>
						<div>
							<div class="kv"><span class="muted"><?php esc_html_e( 'Price each', 'shopinbos' ); ?></span><b data-out="unit"><?php echo esc_html( sib_money( $unit ) ); ?></b></div>
							<div class="kv"><span class="muted"><?php esc_html_e( 'Total', 'shopinbos' ); ?></span><b data-out="wstotal"><?php echo esc_html( sib_money( $unit * $qty ) ); ?></b></div>
							<?php if ( $p['sell'] ) : ?><div class="kv"><span style="font-weight:800"><?php printf( esc_html__( 'Profit if you sell them all at %s', 'shopinbos' ), esc_html( $p['sell_t'] ) ); ?></span><b style="color:var(--ok);font-size:17px" data-out="profit"><?php echo esc_html( sib_money( ( $p['sell'] - $unit ) * $qty ) ); ?></b></div><?php endif; ?>
						</div>
					<?php endif; ?>
					<a class="btn btn-ink btn-block" href="<?php echo esc_url( sib_go_url( 'request_quote', [ 'productSlug' => $p['slug'] ] ) ); ?>"><?php esc_html_e( 'Request a quote', 'shopinbos' ); ?><?php echo sib_icon( 'arrow', 16 ); // phpcs:ignore ?></a>
					<div style="font-size:12.5px;color:#6B6779;text-align:center"><?php esc_html_e( 'Your payment is held until the goods arrive.', 'shopinbos' ); ?></div>
				</div>
				<?php endif; ?>
			</div>
		</div>

		<div style="background:#F6F5F9;border-radius:28px;padding:32px;display:flex;flex-direction:column;gap:22px">
			<h2 class="disp h3"><?php esc_html_e( 'What happens when it sells', 'shopinbos' ); ?></h2>
			<ol class="g4" style="list-style:none;padding:0;margin:0">
				<?php foreach ( [
					[ __( 'Customer pays you', 'shopinbos' ), __( 'On your store, WhatsApp or Instagram. Card, transfer or pay on delivery.', 'shopinbos' ) ],
					[ __( 'Supplier accepts', 'shopinbos' ), __( 'Within 4 hours, or Peggy moves the order to another supplier with the same item.', 'shopinbos' ) ],
					[ __( 'Packed with your label', 'shopinbos' ), __( 'A rider collects it. Your customer gets tracking in your shop’s name.', 'shopinbos' ) ],
					[ __( 'Money splits', 'shopinbos' ), __( '48 hours after delivery, the supplier gets their cost and you get the rest.', 'shopinbos' ) ],
				] as $i => [ $t, $d ] ) : ?>
					<li style="display:flex;flex-direction:column;gap:8px"><span class="num"><?php echo (int) $i + 1; ?></span><b><?php echo esc_html( $t ); ?></b><p class="p" style="font-size:14px"><?php echo esc_html( $d ); ?></p></li>
				<?php endforeach; ?>
			</ol>
		</div>

		<?php if ( $ctx['more'] ) : ?>
			<div style="display:flex;flex-direction:column;gap:18px">
				<h2 class="disp h3"><?php esc_html_e( 'More to sell', 'shopinbos' ); ?></h2>
				<div class="g4"><?php foreach ( $ctx['more'] as $m ) {
					echo sib_view( 'parts/product-card', [ 'p' => $m, 'hide' => $hide, 'lazy' => true ] ); // phpcs:ignore
				} ?></div>
			</div>
		<?php endif; ?>
	</div>
</section>
