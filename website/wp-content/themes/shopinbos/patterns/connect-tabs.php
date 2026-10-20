<?php
/**
 * Title: Connections (tabs)
 * Slug: shopinbos/connect-tabs
 * Categories: shopinbos-sections
 * Description: Dark folded section listing every channel, payment, delivery, ads and import connection, in tabs.
 */
$groups = [
	'sell'  => [ 'Sell on', [
		[ 'Your Shopinbos store', 'Your own site on yourname.mybos.store or your domain', 'Built in' ],
		[ 'WhatsApp Business', 'Catalogue, chats, payment links and order updates', 'Connect' ],
		[ 'Instagram Shop', 'Tag products in posts and reels, answer DMs', 'Connect' ],
		[ 'Facebook Shop', 'Your catalogue on your Page, Messenger in the inbox', 'Connect' ],
		[ 'TikTok Shop', 'Sell in videos and lives', 'Apply' ],
		[ 'Google', 'Free product listings in Search and Shopping', 'Connect' ],
		[ 'Jumia', 'List your products on the marketplace', 'Apply' ],
		[ 'Konga', 'List your products on the marketplace', 'Apply' ],
		[ 'Amazon', 'For brands that export', 'Waitlist' ],
	] ],
	'pay'   => [ 'Get paid', [
		[ 'Paystack', 'Cards, bank transfer and USSD at checkout', 'Built in' ],
		[ 'Pay on delivery', 'Cash or transfer to the rider, confirmed with a code', 'Built in' ],
		[ 'Your bank account', 'Payouts every Friday, or withdraw any time', 'Connect' ],
		[ 'Payment links', 'Send in any chat, paid in two taps', 'Built in' ],
		[ 'Invoices', 'For bulk and business customers, with reminders', 'Built in' ],
		[ 'Transfer account', 'A dedicated account number for your shop', 'Built in' ],
	] ],
	'ship'  => [ 'Deliver with', [
		[ 'Shopinbos Riders', 'Same-day bikes in Lagos and Abuja', 'Built in' ],
		[ 'GIG Logistics', 'Interstate, 2 to 4 days', 'Connect' ],
		[ 'Kwik', 'Same-day bikes in Lagos', 'Connect' ],
		[ 'Shipbubble', 'Compare rates across couriers', 'Connect' ],
		[ 'Dreacot', 'Lagos and Ibadan', 'Connect' ],
		[ 'NIPOST postcodes', 'Correct addresses at checkout', 'Built in' ],
	] ],
	'ads'   => [ 'Advertise on', [
		[ 'Instagram and Facebook ads', 'Click-to-WhatsApp and store visit ads', 'Connect' ],
		[ 'TikTok ads', 'Spark ads from your product videos', 'Soon' ],
		[ 'Google Shopping ads', 'Show up when people search', 'Soon' ],
		[ 'Creators and affiliates', 'Links, codes and commission paid on Fridays', 'Built in' ],
	] ],
	'bring' => [ 'Bring products from', [
		[ 'Instagram posts', 'Turn posts into products with prices', 'Connect' ],
		[ 'Shopify', 'Move products, customers and orders', 'Import' ],
		[ 'WooCommerce', 'Move products and customers', 'Import' ],
		[ 'Bumpa and Catlog', 'Bring your catalogue across', 'Import' ],
		[ 'CSV or Excel', 'Any spreadsheet, fixed up by Rex', 'Import' ],
		[ '1688 and Alibaba', 'Paste a link, get the landed cost', 'Built in' ],
	] ],
	'talk'  => [ 'Talk to customers', [
		[ 'WhatsApp broadcasts', 'Messages to customers who opted in', 'Built in' ],
		[ 'SMS', 'Order updates when there is no WhatsApp', 'Built in' ],
		[ 'Email', 'Receipts, abandoned bags and newsletters', 'Built in' ],
		[ 'Store chat', 'A chat bubble on your store, answered by Peggy', 'Built in' ],
	] ],
];
$status = [ 'Built in' => 'tag-ok', 'Connect' => 'tag-white', 'Apply' => 'tag-amber', 'Import' => 'tag-sky', 'Waitlist' => '', 'Soon' => '' ];
$mono   = [ '#FFEDE4', '#E2F6F1', '#E7E1FF', '#FDF0D5', '#E3EEFD', '#F6F5F9' ];
$total  = array_sum( array_map( fn( $g ) => count( $g[1] ), $groups ) );
$initials = function ( $name ) {
	$words = array_values( array_filter( explode( ' ', preg_replace( '/[^A-Za-z0-9 ]/', '', $name ) ) ) );
	return strtoupper( implode( '', array_map( fn( $w ) => $w[0], array_slice( $words, 0, 2 ) ) ) );
};

echo sib_block_group_open( 'fold bg-ink on-dark', 'section' ) . sib_block_group_open( 'wrap fold-in' );
echo sib_block_group_open( 'split', 'div' );
echo sib_block_group_open( 'col' ) . sib_block_p( 'Connect', 'eyebrow' ) . sib_block_h( 2, 'Plug in everything you already use' ) . sib_block_group_close();
echo sib_block_p( $total . ' connections and counting. Most take one tap: sign in, pick what to share, and your products and orders stay in sync.', 'lead' );
echo sib_block_group_close();
ob_start();
?>
<div data-tabs>
	<div role="tablist" aria-label="Connection types" style="display:flex;gap:8px;flex-wrap:wrap;margin:40px 0 24px">
		<?php $i = 0; foreach ( $groups as $key => [ $label, $items ] ) : ?>
			<button class="ctab" type="button" role="tab" id="ctab-<?php echo esc_attr( $key ); ?>" aria-controls="cpanel-<?php echo esc_attr( $key ); ?>" aria-selected="<?php echo 0 === $i ? 'true' : 'false'; ?>" tabindex="<?php echo 0 === $i ? '0' : '-1'; ?>"><?php echo esc_html( $label ); ?><span><?php echo count( $items ); ?></span></button>
		<?php $i++; endforeach; ?>
	</div>
	<?php $i = 0; foreach ( $groups as $key => [ $label, $items ] ) : ?>
		<div class="cgrid cpanel" role="tabpanel" id="cpanel-<?php echo esc_attr( $key ); ?>" aria-labelledby="ctab-<?php echo esc_attr( $key ); ?>"<?php echo $i ? ' hidden' : ''; ?>>
			<?php foreach ( $items as $n => [ $name, $desc, $st ] ) : ?>
				<div class="ctile">
					<?php $logo = sib_brand_logo( $name, 26 ) ?: sib_service_icon( $name ); ?>
					<span class="mono<?php echo $logo ? ' has-logo' : ''; ?>" style="background:<?php echo esc_attr( $logo ? '#FFFFFF' : $mono[ $n % 6 ] ); ?>"><?php echo $logo ? $logo : esc_html( $initials( $name ) ); // phpcs:ignore ?></span>
					<div style="flex:1;display:flex;flex-direction:column;gap:4px"><b style="font-size:15.5px"><?php echo esc_html( $name ); ?></b><span style="font-size:13.5px;color:#C9C6D3;line-height:1.45"><?php echo esc_html( $desc ); ?></span></div>
					<span class="tag <?php echo $status[ $st ]; ?>" style="flex:none"><?php echo esc_html( $st ); ?></span>
				</div>
			<?php endforeach; ?>
		</div>
	<?php $i++; endforeach; ?>
</div>
<div style="margin-top:24px;border-radius:28px;padding:24px 28px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);display:flex;gap:20px;align-items:center;flex-wrap:wrap">
	<span style="width:48px;height:48px;border-radius:14px;background:#FF6A2B;display:flex;align-items:center;justify-content:center;flex:none"><?php echo sib_theme_icon( 'link', 22, '#FFFFFF' ); ?></span>
	<div style="flex:1;min-width:240px"><b style="font-size:17px">Change one thing, it changes everywhere</b><p style="margin:4px 0 0;color:#C9C6D3;font-size:14.5px">Edit a price or sell the last piece, and your store, WhatsApp catalogue, Instagram, TikTok and Google update together.</p></div>
</div>
<?php
echo sib_block_html( ob_get_clean() );
echo sib_block_group_close() . sib_block_group_close( 'section' );
