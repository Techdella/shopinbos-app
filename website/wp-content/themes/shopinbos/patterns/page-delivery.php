<?php
/**
 * Title: For delivery companies and riders page
 * Slug: shopinbos/page-delivery
 * Categories: shopinbos-pages
 * Description: Partner recruitment page with company/rider toggle, job mock, how it works and live partner list.
 * Post Types: page
 */
$card = fn( $icon, $t, $d ) => '<div class="card" style="padding:24px;display:flex;flex-direction:column;gap:12px">' . sib_theme_icon_box( $icon ) . '<div style="font-weight:800;font-size:17px">' . $t . '</div><p class="p" style="font-size:14.5px">' . $d . '</p></div>';
$fact = fn( $t, $d ) => '<div style="display:flex;flex-direction:column;gap:6px"><b>' . $t . '</b><p class="p" style="font-size:14px">' . $d . '</p></div>';
$apps = function_exists( 'sib_setting' ) ? [ sib_setting( 'riders_android_url' ), sib_setting( 'riders_ios_url' ), sib_setting( 'partner_api_docs_url' ) ] : [ '', '', '' ];
echo sib_block_group_open( 'bg-forest on-dark', 'section' );
ob_start();
?>
<div class="wrap split" style="padding-top:72px;padding-bottom:72px">
	<div class="col-22">
		<p class="eyebrow" style="color:#8BE3D3">For delivery companies and riders</p>
		<h1 class="disp h1 h1-58">Deliveries from Shopinbos shops, every day</h1>
		<p class="lead">Shops book you at checkout. You get the job, assign a rider, and get paid weekly. Cash on delivery is collected with a code, so nobody argues.</p>
		<div class="seg on-dark" role="group" aria-label="I am a" data-toggle="partner" style="align-self:flex-start"><button type="button" class="segb" data-value="company" aria-pressed="true">Delivery companies</button><button type="button" class="segb" data-value="rider" aria-pressed="false">Riders</button></div>
		<div class="row" style="flex-wrap:wrap" data-toggle-show="partner:company"><a class="btn btn-acc" href="<?php echo esc_url( sib_theme_go( 'partner_signup' ) ); ?>">Apply as a delivery company<?php echo sib_theme_icon( 'arrow', 16 ); ?></a><?php if ( $apps[2] ) : ?><a class="btn btn-glass" href="<?php echo esc_url( $apps[2] ); ?>">Read the API docs</a><?php endif; ?></div>
		<div id="riders" data-toggle-show="partner:rider" hidden style="display:flex;flex-direction:column;gap:12px"><p style="margin:0;color:#E6FBF6;font-size:15px;line-height:1.6">Ride for a delivery company on Shopinbos, or on your own in Lagos and Abuja. You need a NIN, a valid licence and a guarantor.</p><div class="row" style="flex-wrap:wrap"><a class="btn btn-acc" href="<?php echo esc_url( $apps[0] ?: sib_theme_go( 'rider_signup' ) ); ?>">Get Shopinbos Riders for Android</a><a class="btn btn-glass" href="<?php echo esc_url( $apps[1] ?: sib_theme_go( 'rider_signup' ) ); ?>">iPhone</a></div></div>
	</div>
	<div style="background:#fff;color:#16141F;border-radius:28px;padding:20px;display:flex;flex-direction:column;gap:14px;box-shadow:0 30px 60px -30px rgba(0,0,0,0.5)" role="img" aria-label="Example delivery job in the Partners app">
		<div class="row between"><b style="font-size:17px">New job · J-8843</b><span class="tag tag-peach">Accept in 4:52</span></div>
		<div style="display:flex;flex-direction:column;gap:10px;font-size:14px">
			<div class="row" style="gap:10px"><span style="width:10px;height:10px;border-radius:999px;background:#16141F;flex:none"></span><span><b>Pickup</b> · Adaeze Studio, Yaba</span></div>
			<div class="row" style="gap:10px"><span style="width:10px;height:10px;border-radius:3px;background:#FF6A2B;flex:none"></span><span><b>Drop-off</b> · Admiralty Way, Lekki Phase 1</span></div>
		</div>
		<div class="g2 keep2" style="gap:10px">
			<div style="background:#F6F5F9;border-radius:16px;padding:12px"><div style="font-size:12px;color:#6B6779;font-weight:600">You earn</div><b style="font-size:18px">₦2,125</b></div>
			<div style="background:#F6F5F9;border-radius:16px;padding:12px"><div style="font-size:12px;color:#6B6779;font-weight:600">Collect cash</div><b style="font-size:18px">₦21,000</b></div>
		</div>
		<div class="row" style="gap:10px"><span class="btn btn-ink btn-s" style="flex:1">Accept and assign</span><span class="btn btn-ghost btn-s">Decline</span></div>
	</div>
</div>
<?php
echo sib_block_html( ob_get_clean() );
echo sib_block_group_close( 'section' );

echo sib_block_group_open( 'sec', 'section' ) . sib_block_group_open( 'wrap' );
echo sib_block_group_open( 'col mw-720' ) . sib_block_p( 'How it works for partners', 'eyebrow' ) . sib_block_h( 2, 'Run it your way' ) . sib_block_group_close();
echo sib_block_html( '<div class="g3" style="margin-top:40px">'
	. $card( 'phone', 'Use our Partners app', 'A dispatch console on web and phone: new jobs, live rider map, cash to pay in, earnings and weekly statements.' )
	. $card( 'link', 'Or connect your system', 'Quote, book, cancel, track, proof of delivery and cash status over our API, with webhooks and a sandbox to test.' )
	. $card( 'shield', 'Cash on delivery, sorted', 'Riders confirm each delivery with the buyer’s code. Pay cash in by 6pm to your own virtual account and it matches automatically.' ) . '</div>'
	. '<div class="card facts" style="margin-top:24px">'
	. $fact( 'What you need', 'CAC registration, goods-in-transit insurance, riders with checked papers.' )
	. $fact( 'What it costs', 'Free to join. Shopinbos keeps [FEE] of each delivery fee.' )
	. $fact( 'Getting paid', 'Weekly to your company bank account, with a statement for every job.' )
	. $fact( 'Going live', 'Start in sandbox. After one test delivery passes, we switch you on.' ) . '</div>' );
echo sib_block_group_close() . sib_block_group_close( 'section' );

echo sib_block_group_open( 'sec bg-mist', 'section' ) . sib_block_group_open( 'wrap' );
echo sib_block_group_open( 'col' ) . sib_block_p( 'For sellers', 'eyebrow' ) . sib_block_h( 2, 'Who delivers for Shopinbos shops' ) . sib_block_p( 'Turn on the companies you want in the app. Your customers see live prices at checkout.', 'lead mw-640' ) . sib_block_group_close();
echo "<!-- wp:shopinbos/partner-grid /-->\n\n";
echo sib_block_group_close() . sib_block_group_close( 'section' );
