<?php
/**
 * Title: Grow with us (suppliers, delivery, riders)
 * Slug: shopinbos/grow-with-us
 * Categories: shopinbos-sections
 * Description: Bento pointing suppliers, delivery companies and riders to their pages.
 */
echo sib_block_group_open( 'fold bg-mist', 'section' ) . sib_block_group_open( 'wrap fold-in', 'div', [ 'bottom' => '72px' ] );
echo sib_block_group_open( 'col', 'div' ) . sib_block_p( 'Grow with us', 'eyebrow' ) . sib_block_h( 2, 'Not a seller? There’s a place for you too' ) . sib_block_group_close();
ob_start();
?>
<div class="bento" style="margin-top:32px">
	<div class="tile c2" style="background:#FFEDE4;color:#5B3A2A;min-height:300px">
		<span class="tag tag-white" style="color:#B23E0A;align-self:flex-start">Suppliers and wholesalers</span>
		<p class="disp h3" style="color:#16141F;font-size:30px">Sell to shops across Nigeria</p>
		<p class="ts">List once. Shops sell your products under their brand and you ship with their label. Paid after delivery.</p>
		<a class="btn btn-ink" href="<?php echo esc_url( home_url( '/for-suppliers/' ) ); ?>" style="align-self:flex-start;margin-top:auto">Become a supplier<?php echo sib_theme_icon( 'arrow', 16 ); ?></a>
	</div>
	<div class="tile bg-forest" style="min-height:300px">
		<span class="tag tag-glass" style="align-self:flex-start">Delivery companies</span>
		<p class="tt" style="font-size:22px">Daily jobs from Shopinbos shops</p>
		<p class="ts">Partners app or your own system over our API.</p>
		<a class="btn btn-acc btn-s" href="<?php echo esc_url( home_url( '/delivery/' ) ); ?>" style="align-self:flex-start;margin-top:auto">Partner with us</a>
	</div>
	<div class="tile bg-ink" style="min-height:300px">
		<span class="tag tag-glass" style="align-self:flex-start">Riders</span>
		<p class="tt" style="font-size:22px">Ride with Shopinbos</p>
		<p class="ts">Jobs near you, cash collected with a code, paid weekly.</p>
		<a class="btn btn-ghost btn-s" href="<?php echo esc_url( home_url( '/delivery/#riders' ) ); ?>" style="align-self:flex-start;margin-top:auto">Get the Riders app</a>
	</div>
</div>
<?php
echo sib_block_html( ob_get_clean() );
echo sib_block_group_close() . sib_block_group_close( 'section' );
