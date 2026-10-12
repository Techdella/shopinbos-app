<?php
/**
 * Title: A week of posts (social media)
 * Slug: shopinbos/social-week
 * Categories: shopinbos-sections
 * Description: Content calendar bento with video studio, captions, broadcasts and affiliates.
 */
$days = [
	[ 'Mon', [ [ 'Reel · Linen set 3 ways', '#FFEDE4', '#B23E0A' ] ] ],
	[ 'Tue', [ [ 'Status · Back in stock', '#E2F6F1', '#0C4A44' ] ] ],
	[ 'Wed', [ [ 'Carousel · New in', '#E7E1FF', '#3B2A85' ], [ 'TikTok · Unboxing', '#16141F', '#FFFFFF' ] ] ],
	[ 'Thu', [ [ 'Broadcast · VIPs', '#FDF0D5', '#8A5A08' ] ] ],
	[ 'Fri', [ [ 'Reel · Payday picks', '#FFEDE4', '#B23E0A' ], [ 'Needs your OK', '#FFFFFF', '#B23E0A' ] ] ],
	[ 'Sat', [ [ 'Live · Try-on', '#16141F', '#FFFFFF' ] ] ],
	[ 'Sun', [ [ 'Status · Reviews', '#E2F6F1', '#0C4A44' ] ] ],
];
echo sib_block_group_open( 'fold bg-white', 'section' ) . sib_block_group_open( 'wrap fold-in' );
echo sib_block_sec_head( 'Social media', 'A week of posts, planned before Monday', 'Peggy plans posts around what’s selling, writes captions in your voice and posts at the times your customers are online. You approve with a tap.' );
ob_start();
?>
<div class="bento">
	<div class="tile c3 bg-mist">
		<div class="row between wrapflex" style="gap:8px"><p class="tt">This week</p><span class="tag tag-white">9 posts · 2 need your OK</span></div>
		<div class="cal">
			<?php foreach ( $days as [ $d, $posts ] ) : ?>
				<div><b><?php echo esc_html( $d ); ?></b><?php foreach ( $posts as [ $t, $bg, $fg ] ) : ?><div class="post" style="background:<?php echo esc_attr( $bg ); ?>;color:<?php echo esc_attr( $fg ); ?>"><?php echo esc_html( $t ); ?></div><?php endforeach; ?></div>
			<?php endforeach; ?>
		</div>
	</div>
	<div class="tile r2 bg-ink" style="padding:14px">
		<div style="position:relative;border-radius:20px;overflow:hidden;flex:1;min-height:300px">
			<img src="<?php echo sib_theme_img( 'knit-sweater.webp' ); ?>" alt="Product video frame" loading="lazy" width="300" height="300" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">
			<span style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:56px;height:56px;border-radius:999px;background:rgba(255,255,255,0.92);display:flex;align-items:center;justify-content:center"><?php echo sib_theme_icon( 'play', 22, '#16141F' ); ?></span>
			<span class="tag" style="position:absolute;left:10px;top:10px;background:rgba(0,0,0,0.5);color:#fff">9:16 · Pidgin voice</span>
		</div>
		<div style="padding:6px 6px 4px;display:flex;flex-direction:column;gap:4px"><p class="tt" style="font-size:17px">Video studio</p><p class="ts">Three photos in, a reel out. Voiceover in English, Pidgin, Yorùbá or Hausa.</p></div>
	</div>
	<div class="tile" style="background:#E2F6F1;color:#0C4A44">
		<p class="tt">Captions in your voice</p>
		<div style="background:#fff;color:#16141F;border-radius:16px;padding:12px;font-size:13px;line-height:1.5;margin-top:auto">“Omo, this linen set no dey carry heat at all. ₦29,500, sizes S to XL. Tap the link before e finish.”</div>
	</div>
	<div class="tile" style="background:#fff;border:1px solid #ECEAF2">
		<p class="tt">Broadcasts</p>
		<div style="background:#E7F7EE;border-radius:16px;padding:10px;font-size:12.5px;line-height:1.45;margin-top:auto"><b>Adaeze Studio</b><br>Hi Halima! The blazer you liked is back in your size. Want me to keep one for you?</div>
		<span style="font-size:12.5px;color:#6B6779;font-weight:600">To 214 customers who opted in</span>
	</div>
	<div class="tile" style="background:#FF6A2B;color:#fff">
		<p class="tt">Creators and affiliates</p>
		<div class="disp" style="font-size:40px;margin-top:auto">10%</div>
		<p class="ts" style="opacity:0.92">Give creators a link. They earn on every delivered order, paid Fridays.</p>
	</div>
</div>
<?php
echo sib_block_html( ob_get_clean() );
echo sib_block_group_close() . sib_block_group_close( 'section' );
