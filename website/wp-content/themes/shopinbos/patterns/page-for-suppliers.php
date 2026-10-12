<?php
/**
 * Title: For suppliers page
 * Slug: shopinbos/page-for-suppliers
 * Categories: shopinbos-pages
 * Description: Supplier recruitment page: hero with order mock, three ways to sell, requirements, live supplier list.
 * Post Types: page
 */
$join = sib_theme_go( 'supplier_signup' );
$card = fn( $icon, $t, $d ) => '<div class="card" style="padding:24px;display:flex;flex-direction:column;gap:12px">' . sib_theme_icon_box( $icon ) . '<div style="font-weight:800;font-size:17px">' . $t . '</div><p class="p" style="font-size:14.5px">' . $d . '</p></div>';
$fact = fn( $t, $d ) => '<div style="display:flex;flex-direction:column;gap:6px"><b>' . $t . '</b><p class="p" style="font-size:14px">' . $d . '</p></div>';

echo sib_block_group_open( 'bg-peach', 'section' ) . sib_block_group_open( 'wrap split', 'div', [ 'top' => '72px', 'bottom' => '72px' ] );
echo sib_block_group_open( 'col-22' ) . sib_block_p( 'For suppliers and wholesalers', 'eyebrow' ) . sib_block_h( 1, 'Your products in hundreds of shops. One place to manage them.', 'disp h1 h1-58' )
	. sib_block_p( 'Sellers on Shopinbos add your products to their stores and sell them under their own brand. You get the order, pack it with their label, and get paid after delivery.', 'lead' )
	. sib_block_buttons( [ [ 'Become a supplier', $join, 'ink' ], [ 'See the marketplace', home_url( '/marketplace/' ), 'ghost' ] ] ) . sib_block_group_close();
ob_start();
?>
<div class="card" style="padding:22px;display:flex;flex-direction:column;gap:14px;box-shadow:0 30px 60px -36px rgba(91,58,42,0.5)" role="img" aria-label="Example of the supplier portal: two dropship orders waiting to be accepted">
	<div class="row between"><b style="font-size:17px">New dropship orders</b><span class="tag tag-amber">2 waiting</span></div>
	<div class="row" style="gap:12px;padding:12px;border-radius:16px;background:#F6F5F9"><img src="<?php echo sib_theme_img( 'leather-slides.webp' ); ?>" alt="" width="54" height="54" style="width:54px;height:54px;border-radius:12px;object-fit:cover"><div style="flex:1"><b style="font-size:14.5px">Leather slides · size 41</b><div style="font-size:12.5px;color:#6B6779">For Adaeze Studio · to Lekki</div></div><div style="text-align:right"><b>₦6,000</b><div style="font-size:12px;color:#B23E0A;font-weight:700">Accept in 3h 12m</div></div></div>
	<div class="row" style="gap:12px;padding:12px;border-radius:16px;background:#F6F5F9"><img src="<?php echo sib_theme_img( 'suede-lace-ups.webp' ); ?>" alt="" width="54" height="54" style="width:54px;height:54px;border-radius:12px;object-fit:cover"><div style="flex:1"><b style="font-size:14.5px">Suede lace-ups · size 43</b><div style="font-size:12.5px;color:#6B6779">For Stride Lagos · to Surulere</div></div><div style="text-align:right"><b>₦9,500</b><div style="font-size:12px;color:#B23E0A;font-weight:700">Accept in 1h 40m</div></div></div>
	<div class="row" style="gap:10px"><span class="btn btn-ink btn-s" style="flex:1">Accept and print labels</span><span class="btn btn-ghost btn-s">Decline</span></div>
</div>
<?php
echo sib_block_html( ob_get_clean() );
echo sib_block_group_close() . sib_block_group_close( 'section' );

echo sib_block_group_open( 'sec', 'section' ) . sib_block_group_open( 'wrap' );
echo sib_block_group_open( 'col mw-720' ) . sib_block_p( 'How it works for suppliers', 'eyebrow' ) . sib_block_h( 2, 'Three ways to sell' ) . sib_block_group_close();
echo sib_block_html( '<div class="g3" style="margin-top:40px">'
	. $card( 'box', 'Dropship', 'Shops list your product at their price. You ship each order with their label and get your price 48 hours after delivery.' )
	. $card( 'layers', 'Wholesale', 'Set price tiers for bulk orders. Shops request quotes, pay upfront into escrow, and you’re paid when they confirm arrival.' )
	. $card( 'chat', 'Quotes', 'Shops ask for custom quantities and prices. Reply with an offer in the portal and agree the deal in one thread.' ) . '</div>'
	. '<div class="card facts" style="margin-top:24px">'
	. $fact( 'What you need', 'CAC registration, a business bank account, and stock you can ship within 3 days.' )
	. $fact( 'What it costs', 'Free to list. Shopinbos fee on each sale: [FEE].' )
	. $fact( 'Getting paid', 'To your bank every Friday, after delivery and the 48-hour return window.' )
	. $fact( 'Delivery', 'Book Shopinbos riders from the portal, or hand orders to your own dispatch.' ) . '</div>' );
echo sib_block_group_close() . sib_block_group_close( 'section' );

echo sib_block_group_open( 'sec bg-mist', 'section' ) . sib_block_group_open( 'wrap' );
echo sib_block_group_open( 'col' ) . sib_block_p( 'Suppliers on Shopinbos', 'eyebrow' ) . sib_block_h( 2, 'Who’s selling already' ) . sib_block_group_close();
echo "<!-- wp:shopinbos/supplier-grid {\"count\":6} /-->\n\n";
echo sib_block_group_close() . sib_block_group_close( 'section' );
echo '<!-- wp:pattern {"slug":"shopinbos/cta-band"} /-->';
