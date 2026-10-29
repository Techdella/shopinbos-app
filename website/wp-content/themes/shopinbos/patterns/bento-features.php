<?php
/**
 * Title: Everything in one app (bento)
 * Slug: shopinbos/bento-features
 * Categories: shopinbos-sections
 * Description: "The whole shop" bento: Rex, inbox, pay on delivery, payouts, dropship, riders, labels.
 */
$tick = function ( $t ) { return '<div class="row" style="gap:8px">' . sib_theme_icon( 'tick', 18, '#16794A' ) . esc_html( $t ) . '</div>'; };
echo sib_block_group_open( 'bg-white', 'section', [ 'bottom' => '120px' ] ) . sib_block_group_open( 'wrap' );
echo sib_block_sec_head( 'Everything in one app', 'The whole shop, not just a website', 'Build, sell, deliver, get paid and grow. Every piece talks to the others, so you never copy an order from one app to another.' );
ob_start();
?>
<div class="bento">
	<div class="tile c2 r2" style="background:#E2F6F1;color:#0C4A44">
		<div class="row" style="gap:12px"><img src="<?php echo sib_theme_img( 'rex.webp' ); ?>" alt="Rex" width="52" height="52" loading="lazy"><div><p class="tt">Rex builds your store</p><p class="ts">Logo, colours, pages and products, from one chat.</p></div></div>
		<div class="mock-white" style="padding:14px;gap:10px;margin-top:auto;border-radius:22px">
			<div class="bubble" style="background:#16141F;color:#fff;align-self:flex-end;max-width:90%">Make it feel premium and set up a payday sale</div>
			<div style="display:flex;flex-direction:column;gap:6px;font-size:13.5px"><?php echo $tick( 'Switched to a dark theme with gold buttons' ) . $tick( 'Added a countdown to the 25th' ) . $tick( 'Made code PAYDAY10 for 10% off' ); ?></div>
			<div class="row" style="gap:8px"><span class="tag">Version 7</span><span class="tag">Undo</span><span class="tag tag-acc" style="margin-left:auto">Publish</span></div>
		</div>
		<div class="g2 keep2" style="gap:8px">
			<div class="serif-disp" style="background:#121212;color:#F4EFE6;border-radius:16px;padding:14px;letter-spacing:0.1em;font-size:15px">PAYDAY · 2d 14h</div>
			<div style="background:#fff;border-radius:16px;padding:10px 14px;display:flex;gap:6px;align-items:center"><span style="width:22px;height:22px;border-radius:999px;background:#121212"></span><span style="width:22px;height:22px;border-radius:999px;background:#C8A96A"></span><span style="width:22px;height:22px;border-radius:999px;background:#F4EFE6;border:1px solid #ECEAF2"></span><span style="font-size:12px;font-weight:700;color:#6B6779;margin-left:4px">Brand kit</span></div>
		</div>
	</div>
	<div class="tile r2 bg-ink">
		<div class="row" style="gap:10px"><img src="<?php echo sib_theme_img( 'peggy-wave.webp' ); ?>" alt="Peggy" width="44" height="44" loading="lazy"><div><p class="tt" style="font-size:17px">One inbox</p><p class="ts">Peggy drafts. You approve.</p></div></div>
		<div style="display:flex;flex-direction:column;gap:8px;margin-top:6px">
			<div class="inbox-item"><div class="row between"><b style="font-size:13.5px">Halima M.</b><span style="font-size:11px;color:#8BE3D3;font-weight:700">WhatsApp</span></div><div>Is the blazer still available?</div></div>
			<div class="inbox-item"><div class="row between"><b style="font-size:13.5px">tobi.a</b><span style="font-size:11px;color:#FFB18F;font-weight:700">Instagram</span></div><div>Price for 2 pieces?</div></div>
			<div class="inbox-item"><div class="row between"><b style="font-size:13.5px">Seun D.</b><span style="font-size:11px;color:#C9C6D3;font-weight:700">TikTok</span></div><div>You deliver to Ibadan?</div></div>
		</div>
		<div style="margin-top:auto;background:#8BE3D3;color:#0C4A44;border-radius:14px;padding:10px 12px;font-size:12.5px;font-weight:700">3 drafts ready · Send all</div>
	</div>
	<div class="tile" style="background:#FFEDE4;color:#5B3A2A">
		<p class="tt" style="color:#16141F">Pay on delivery, safely</p>
		<div class="row" style="gap:6px"><span class="digit">4</span><span class="digit">8</span><span class="digit">2</span><span class="digit">1</span></div>
		<p class="ts">Code checked by the rider. Cash paid in by 6pm.</p>
	</div>
	<div class="tile bg-mist">
		<p class="tt">Paid straight to your bank</p>
		<div class="disp" style="font-size:44px;margin-top:auto">₦146,200</div>
		<p class="ts">Usually in your bank the next working day.</p>
	</div>
	<div class="tile c2 bg-mist">
		<div class="row between wrapflex" style="gap:8px"><p class="tt">Sell without stock</p><a class="lnk arrow" href="<?php echo esc_url( home_url( '/marketplace/' ) ); ?>">Find stock</a></div>
		<div class="g3 keep3" style="gap:10px;grid-template-columns:repeat(3,minmax(0,1fr))">
			<?php foreach ( [ [ 'leather-slides.webp', '₦6,667' ], [ 'earbuds.webp', '₦8,100' ], [ 'check-blazer.webp', '₦16,420' ] ] as [ $img, $keep ] ) : ?>
				<div style="background:#fff;border-radius:16px;padding:8px"><img src="<?php echo sib_theme_img( $img ); ?>" alt="" width="160" height="160" loading="lazy" style="width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:10px"><div style="font-size:12px;font-weight:800;color:#16794A;margin-top:6px">Keep <?php echo esc_html( $keep ); ?></div></div>
			<?php endforeach; ?>
		</div>
	</div>
	<div class="tile" style="background:#fff;border:1px solid #ECEAF2">
		<p class="tt">Riders in one tap</p>
		<svg viewBox="0 0 200 110" style="width:100%;height:auto;margin-top:auto" role="img" aria-label="Route from Yaba to Lekki">
			<rect x="0" y="0" width="200" height="110" rx="16" fill="#F6F5F9"/>
			<path d="M0 70 C 50 60, 80 90, 200 50" stroke="#ECEAF2" stroke-width="8" fill="none"/>
			<path d="M20 30 C 60 30, 90 80, 170 78" stroke="#16141F" stroke-width="3" fill="none" stroke-dasharray="6 5"/>
			<circle cx="20" cy="30" r="7" fill="#16141F"/><rect x="163" y="71" width="14" height="14" rx="4" fill="#FF6A2B"/>
			<text x="30" y="26" font-size="10" font-weight="700" fill="#16141F" font-family="Plus Jakarta Sans">Yaba</text><text x="128" y="100" font-size="10" font-weight="700" fill="#16141F" font-family="Plus Jakarta Sans">Lekki · 38 min</text>
		</svg>
	</div>
	<div class="tile" style="background:#fff;border:1px solid #ECEAF2">
		<p class="tt">Labels with your logo</p>
		<div class="label-mock"><b class="brandfont" style="font-size:15px">Adaeze Studio</b><span>Linen shirt · L</span><b style="font-size:16px">₦18,500</b><span class="barcode"></span></div>
	</div>
</div>
<?php
echo sib_block_html( ob_get_clean() );
echo sib_block_group_close() . sib_block_group_close( 'section' );
