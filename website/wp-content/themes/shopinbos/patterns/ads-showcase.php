<?php
/**
 * Title: Ads that bring WhatsApp chats
 * Slug: shopinbos/ads-showcase
 * Categories: shopinbos-sections
 * Description: Peach folded section with a budget picker and Instagram, Facebook and TikTok ad previews.
 */
echo sib_block_group_open( 'fold bg-peach', 'section' );
ob_start();
?>
<div class="wrap fold-in split" data-ad-demo>
	<div class="col-22">
		<p class="eyebrow">Ads</p>
		<h2 class="disp h2">Ads that bring WhatsApp chats, or stop themselves</h2>
		<p class="lead">Pick a product. Peggy writes the ad, picks the photo and the people, and sends buyers straight to your WhatsApp. If an ad hasn’t sold by day 2, she pauses it.</p>
		<div style="display:flex;flex-direction:column;gap:12px">
			<b style="font-size:14px">Budget</b>
			<div style="display:flex;gap:8px;flex-wrap:wrap">
				<?php foreach ( [ 2000, 5000, 10000 ] as $b ) : ?>
					<button type="button" class="chip" data-ad-budget="<?php echo (int) $b; ?>" aria-pressed="<?php echo 5000 === $b ? 'true' : 'false'; ?>">₦<?php echo esc_html( number_format( $b ) ); ?> a day</button>
				<?php endforeach; ?>
			</div>
			<div class="row" style="gap:14px;flex-wrap:wrap"><b style="font-size:14px">For</b><div class="stepper"><button type="button" data-ad-minus aria-label="One day fewer">−</button><span data-ad-days aria-live="polite" style="font-weight:800;min-width:64px;text-align:center">5 days</span><button type="button" data-ad-plus aria-label="One day more">+</button></div><span style="font-size:14px;color:#5B3A2A">= <b data-ad-total aria-live="polite">₦25,000</b> from your Shopinbos balance</span></div>
		</div>
		<div class="row" style="gap:10px;flex-wrap:wrap"><a class="btn btn-ink" href="<?php echo esc_url( sib_theme_go( '', [ 'place' => 'ads' ] ) ); ?>">Make my first ad<?php echo sib_theme_icon( 'arrow', 16 ); ?></a><span style="font-size:13px;color:#5B3A2A">No ad account needed. We set it up with you.</span></div>
	</div>
	<div style="display:flex;flex-direction:column;gap:16px;align-items:center">
		<div class="seg" role="group" aria-label="Ad preview"><button type="button" class="segb" data-ad-plat-btn="ig" aria-pressed="true">Instagram</button><button type="button" class="segb" data-ad-plat-btn="fb" aria-pressed="false">Facebook</button><button type="button" class="segb" data-ad-plat-btn="tt" aria-pressed="false">TikTok</button></div>
		<div class="row" style="gap:16px;align-items:stretch;flex-wrap:wrap;justify-content:center">
			<div class="ad-phone" data-ad-plat="tt" hidden>
				<img src="<?php echo sib_theme_img( 'linen-set.webp' ); ?>" alt="Video ad of a woman in a linen set" loading="lazy" width="250" height="444" style="width:100%;height:100%;object-fit:cover;opacity:0.92">
				<div style="position:absolute;top:14px;left:14px;right:14px;display:flex;justify-content:space-between;color:#fff;font-size:12px;font-weight:700"><span>Sponsored</span><span>0:12</span></div>
				<div style="position:absolute;right:12px;bottom:120px;display:flex;flex-direction:column;gap:14px"><span style="width:40px;height:40px;border-radius:999px;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center"><?php echo sib_theme_icon( 'heart', 20, '#FFFFFF' ); ?></span><span style="width:40px;height:40px;border-radius:999px;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center"><?php echo sib_theme_icon( 'chat', 20, '#FFFFFF' ); ?></span></div>
				<div style="position:absolute;left:14px;right:60px;bottom:64px;color:#fff;font-size:13px;line-height:1.4"><b>@adaezestudio</b><br>Linen set, 3 ways. Lagos heat approved.</div>
				<div style="position:absolute;left:12px;right:12px;bottom:12px;background:#FF6A2B;color:#fff;border-radius:12px;min-height:40px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px">Shop now</div>
			</div>
			<div class="ad-card" data-ad-plat="ig">
				<div class="row" style="gap:10px;padding:12px 14px"><span class="brandfont" style="width:32px;height:32px;border-radius:999px;background:#F3EDE6;display:flex;align-items:center;justify-content:center;font-weight:600">A</span><div style="flex:1"><b style="font-size:13.5px">adaezestudio</b><div style="font-size:11.5px;color:#6B6779">Sponsored</div></div><?php echo sib_theme_icon( 'dots', 18, '#16141F' ); ?></div>
				<img src="<?php echo sib_theme_img( 'camel-coat.webp' ); ?>" alt="Ad photo of a camel wrap coat" loading="lazy" width="300" height="375" style="width:100%;aspect-ratio:4/5;object-fit:cover;display:block">
				<div style="background:#0C4A44;color:#fff;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;font-weight:800;font-size:14px">Send WhatsApp message<?php echo sib_theme_icon( 'arrow', 16 ); ?></div>
				<div style="padding:12px 14px;font-size:13.5px;line-height:1.45"><b>adaezestudio</b> Harmattan is coming. Our camel wrap coat is back, sizes S to L. ₦38,500, delivered in Lagos today.</div>
			</div>
			<div class="ad-card fb" data-ad-plat="fb" hidden>
				<div class="row" style="gap:10px;padding:12px 14px"><span class="brandfont" style="width:36px;height:36px;border-radius:999px;background:#F3EDE6;display:flex;align-items:center;justify-content:center;font-weight:600">A</span><div style="flex:1"><b style="font-size:14px">Adaeze Studio</b><div style="font-size:11.5px;color:#6B6779">Sponsored · Lagos</div></div></div>
				<div style="padding:0 14px 12px;font-size:14px;line-height:1.45">Payday treat? Our linen shirts are ₦18,500 and they go fast. Chat with us to order.</div>
				<img src="<?php echo sib_theme_img( 'linen-shirt.webp' ); ?>" alt="Ad photo of a white linen shirt" loading="lazy" width="320" height="320" style="width:100%;aspect-ratio:1/1;object-fit:cover;display:block">
				<div class="row between" style="padding:12px 14px;background:#F6F5F9"><div><div style="font-size:11.5px;color:#6B6779">WHATSAPP</div><b style="font-size:14px">Linen shirt · ₦18,500</b></div><span class="btn btn-ghost btn-s" style="min-height:36px">Send message</span></div>
			</div>
			<div class="ad-side">
				<div style="background:#fff"><div style="font-size:12px;color:#6B6779;font-weight:700">Day 3 · example</div><div class="disp" style="font-size:30px">41 chats</div><div style="font-size:13px;color:#6B6779">7 orders from ₦9,000 spent</div></div>
				<div style="background:#16141F;color:#fff;display:flex;flex-direction:column;gap:8px"><div class="row" style="gap:8px"><img src="<?php echo sib_theme_img( 'peggy.webp' ); ?>" alt="" width="26" height="26" loading="lazy"><b style="font-size:13px">Peggy</b></div><div style="font-size:13px;line-height:1.45;color:#E6E3EE">The coat ad is selling. Want me to add ₦2,000 a day until Friday?</div><div class="row" style="gap:6px"><span class="tag tag-acc">Yes</span><span class="tag tag-glass">Not now</span></div></div>
				<div style="background:#fff;display:flex;gap:10px;align-items:center"><span style="width:32px;height:32px;border-radius:999px;background:#FDF0D5;display:flex;align-items:center;justify-content:center;flex:none"><?php echo sib_theme_icon( 'clock', 16, '#8A5A08' ); ?></span><div style="font-size:12.5px;line-height:1.4"><b>Stop rule on</b><br>Pauses if no order by day 2</div></div>
			</div>
		</div>
	</div>
</div>
<?php
echo sib_block_html( ob_get_clean() );
echo sib_block_group_close( 'section' );
