<?php
/**
 * Title: Pricing page
 * Slug: shopinbos/page-pricing
 * Categories: shopinbos-pages
 * Description: Plans with a monthly/yearly toggle (prices are set in Settings > Shopinbos) and the fees table.
 * Post Types: page
 */
$fees = [
	[ 'Card, transfer and USSD payments (Paystack)', '1.5% + ₦100, capped at ₦2,000' ],
	[ 'Pay on delivery', 'No extra fee' ],
	[ 'Shopinbos commission on your sales', '[sib_price key="fee_commission"] on Starter. None on Growth and Pro' ],
	[ 'Delivery', 'The rider’s price, shown at checkout' ],
	[ 'WhatsApp broadcasts', 'Meta’s message price + [sib_price key="fee_broadcast"]' ],
	[ 'Product videos', '[sib_price key="fee_video"] per video' ],
	[ 'Payouts to your bank', 'Free every Friday' ],
];
echo sib_block_group_open( 'bg-mist', 'section' ) . sib_block_group_open( 'wrap col-22 pricing', 'div', [ 'top' => '56px', 'bottom' => '96px' ] );
echo sib_block_group_open( 'col center mw-680' ) . sib_block_p( 'Pricing', 'eyebrow' ) . sib_block_h( 1, 'Start small. Upgrade when you’re busy.', 'disp h2' )
	. sib_block_p( 'Every plan includes your store, Rex, pay on delivery and riders. Prices are in naira and include VAT.', 'lead' ) . sib_block_group_close();
echo "<!-- wp:shopinbos/pricing-plans /-->\n\n";
$rows = '';
foreach ( $fees as [ $k, $v ] ) {
	$rows .= '<div class="kv"><span>' . esc_html( $k ) . '</span><b>' . esc_html( $v ) . '</b></div>';
}
echo sib_block_html( '<div class="card" style="width:100%;padding:28px;display:flex;flex-direction:column;gap:6px"><h2 class="disp h3" style="margin-bottom:8px">Fees on every plan</h2>' . $rows . '</div>' );
echo sib_block_group_close() . sib_block_group_close( 'section' );
echo '<!-- wp:pattern {"slug":"shopinbos/faq"} /-->';
