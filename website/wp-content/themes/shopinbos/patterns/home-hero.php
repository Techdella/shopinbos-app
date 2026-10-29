<?php
/**
 * Title: Home hero with bento
 * Slug: shopinbos/home-hero
 * Categories: shopinbos-sections
 * Description: Centered headline, WhatsApp number sign-up form and a bento of product moments.
 */
$go = sib_theme_go( '', [ 'place' => 'hero' ] );
?>
<!-- wp:group {"tagName":"section","className":"bg-mist","style":{"spacing":{"padding":{"bottom":"120px"}}},"layout":{"type":"default"}} -->
<section class="wp-block-group bg-mist" style="padding-bottom:120px"><!-- wp:group {"className":"wrap hero-head","style":{"spacing":{"padding":{"top":"72px"}}},"layout":{"type":"default"}} -->
<div class="wp-block-group wrap hero-head" style="padding-top:72px"><!-- wp:html -->
<div class="row hero-tags" style="gap:10px;flex-wrap:wrap;justify-content:center"><span class="tag"><img src="<?php echo sib_theme_img( 'rex.webp' ); ?>" alt="" width="22" height="22">Rex builds your store</span><span class="tag"><img src="<?php echo sib_theme_img( 'peggy.webp' ); ?>" alt="" width="22" height="22">Peggy runs it with you</span></div>
<!-- /wp:html -->

<!-- wp:heading {"level":1,"className":"disp h1 hbig mw-920"} -->
<h1 class="wp-block-heading disp h1 hbig mw-920">Sell everywhere your customers are. From one app.</h1>
<!-- /wp:heading -->

<!-- wp:paragraph {"className":"lead mw-640"} -->
<p class="lead mw-640">Your store, WhatsApp, Instagram, TikTok and Google, with pay on delivery, riders, ads and money straight to your bank. Built for Nigerian shops, run from your phone.</p>
<!-- /wp:paragraph -->

<!-- wp:html -->
<form class="card heroform" action="<?php echo esc_url( $go ); ?>" method="get" data-signup-form>
	<label for="heroPhone"><span style="font-weight:700;font-size:15px">+234</span><input id="heroPhone" type="tel" inputmode="tel" autocomplete="tel-national" placeholder="Your WhatsApp number" aria-label="Your WhatsApp number"></label>
	<button class="btn btn-acc" type="submit">Start your shop<?php echo sib_theme_icon( 'arrow', 16 ); ?></button>
</form>
<div class="row" style="gap:18px;flex-wrap:wrap;justify-content:center;font-size:13.5px;color:#6B6779;font-weight:600">
	<span class="tick">Free shopinbos.com address</span><span class="tick">Go live before adding a bank</span><span class="tick">iPhone, Android and web</span>
</div>
<!-- /wp:html --></div>
<!-- /wp:group -->

<!-- wp:html -->
<div class="wrap" style="margin-top:56px">
	<div class="bento" role="img" aria-label="Examples of what Shopinbos does: a live store, a Peggy reply on WhatsApp, a paid order, a delivery code, and weekly sales">
		<div class="tile c2 r2" style="padding:0;min-height:460px">
			<img src="<?php echo sib_theme_img( 'store-hero.webp' ); ?>" alt="" width="560" height="746" fetchpriority="high" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">
			<div style="position:absolute;left:18px;right:18px;top:18px;display:flex;justify-content:space-between;align-items:center;gap:8px;background:rgba(255,255,255,0.92);border-radius:999px;padding:8px 8px 8px 18px;backdrop-filter:blur(8px)"><b class="brandfont" style="font-size:18px">Adaeze Studio</b><span class="tag tag-ok">Live · adaeze.shopinbos.com</span></div>
			<div style="position:absolute;left:18px;bottom:18px;background:#fff;border-radius:20px;padding:12px;display:flex;gap:12px;align-items:center;width:270px;max-width:calc(100% - 36px)"><img src="<?php echo sib_theme_img( 'camel-coat.webp' ); ?>" alt="" width="56" height="56" loading="lazy" style="width:56px;height:56px;border-radius:12px;object-fit:cover"><div style="flex:1"><b style="font-size:14px">Camel wrap coat</b><div style="font-size:13px;color:#6B6779">₦38,500 · 3 left</div></div><span style="width:36px;height:36px;border-radius:999px;background:#16141F;display:flex;align-items:center;justify-content:center"><?php echo sib_theme_icon( 'bag', 16, '#FFFFFF' ); ?></span></div>
		</div>
		<div class="tile c2 min0 bg-forest">
			<div class="row" style="gap:10px"><img src="<?php echo sib_theme_img( 'peggy.webp' ); ?>" alt="" width="30" height="30" loading="lazy"><b style="font-size:14px">Peggy · WhatsApp · just now</b></div>
			<div class="bubble" style="background:rgba(255,255,255,0.1);align-self:flex-start">How much for the linen shirt? Una get L?</div>
			<div class="bubble" style="background:#fff;color:#16141F;align-self:flex-end">Yes o! L dey, ₦18,500. Delivery to Lekki na ₦2,500. Make I send payment link?</div>
		</div>
		<div class="tile min0" style="background:#fff;border:1px solid #ECEAF2">
			<span class="tag tag-ok" style="align-self:flex-start">Paid · transfer</span>
			<div class="disp" style="font-size:40px">₦21,000</div>
			<p class="ts">Order SB-1047 · Kemi, Lekki</p>
		</div>
		<div class="tile min0" style="background:#FF6A2B;color:#fff">
			<b style="font-size:14px">Delivery code</b>
			<div class="row" style="gap:6px"><span class="digit sm">4</span><span class="digit sm">8</span><span class="digit sm">2</span><span class="digit sm">1</span></div>
			<p class="ts" style="opacity:0.92">Kemi gives it to the rider when the parcel is in her hands.</p>
		</div>
	</div>
</div>
<!-- /wp:html --></section>
<!-- /wp:group -->
