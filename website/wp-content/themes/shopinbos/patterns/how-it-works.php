<?php
/**
 * Title: How it works (sticky stacked steps)
 * Slug: shopinbos/how-it-works
 * Categories: shopinbos-sections
 * Description: Four cards that stack as you scroll, from telling Rex about your shop to getting paid.
 */
$tick = fn( $t ) => '<div class="row" style="gap:10px;font-size:14px">' . sib_theme_icon( 'tick', 18, '#16794A' ) . esc_html( $t ) . '</div>';
$card = function ( $num, $title, $text, $bg, $fg, $mock ) {
	$attrs = [ 'className' => 'scard', 'backgroundColor' => $bg, 'textColor' => $fg, 'layout' => [ 'type' => 'default' ] ];
	$out   = '<!-- wp:group ' . wp_json_encode( $attrs ) . " -->\n<div class=\"wp-block-group scard has-{$fg}-color has-{$bg}-background-color has-text-color has-background\">";
	$out  .= sib_block_group_open( 'col' ) . sib_block_p( $num, 'disp snum' ) . sib_block_h( 3, $title, 'disp h2' ) . sib_block_p( $text, 'lead' ) . sib_block_group_close();
	$out  .= sib_block_html( '<div>' . $mock . '</div>' );
	return $out . sib_block_group_close();
};
$logo_opts = '<div class="mock-white"><div class="row" style="gap:10px"><img src="' . sib_theme_img( 'rex.webp' ) . '" alt="" width="40" height="40" loading="lazy"><b>Pick a logo for Adaeze Studio</b></div><div class="g2 keep2" style="gap:10px">'
	. '<div class="card brandfont" style="height:76px;display:flex;align-items:center;justify-content:center;font-size:22px;border:2px solid #FF6A2B">Adaeze</div>'
	. '<div class="card disp" style="height:76px;display:flex;align-items:center;justify-content:center;font-size:22px;background:#16141F;color:#F3EDE6">AS</div>'
	. '<div class="card serif-disp" style="height:76px;display:flex;align-items:center;justify-content:center;letter-spacing:0.12em;background:#F3EDE6">ADAEZE</div>'
	. '<div class="card" style="height:76px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;color:#8A4B2A">adaeze studio</div></div></div>';
$product = '<div class="mock-white" style="padding:16px;flex-direction:row;gap:14px;flex-wrap:wrap"><img src="' . sib_theme_img( 'camel-coat.webp' ) . '" alt="" width="130" height="160" loading="lazy" style="width:130px;height:160px;object-fit:cover;border-radius:16px"><div style="flex:1;min-width:160px;display:flex;flex-direction:column;gap:8px"><span class="tag" style="background:#E2F6F1;color:#0C4A44;align-self:flex-start">Filled in by Rex</span><b style="font-size:17px">Camel wrap coat</b><div class="kv"><span class="muted">Price</span><b>₦38,500</b></div><div class="kv"><span class="muted">Sizes</span><b>S, M, L</b></div><div class="kv"><span class="muted">Background</span><b style="color:#16794A">Cleaned</b></div></div></div>';
$channels = '<div style="background:rgba(255,255,255,0.08);border-radius:24px;padding:8px 18px">';
foreach ( [ [ 'Your store', 'Live', 'tag-ok' ], [ 'WhatsApp catalogue', 'Synced', 'tag-ok' ], [ 'Instagram and Facebook', 'Synced', 'tag-ok' ], [ 'TikTok Shop', 'Applied', 'tag-amber' ], [ 'Google', 'Synced', 'tag-ok' ] ] as $i => [ $n, $s, $c ] ) {
	$channels .= '<div class="row between" style="padding:13px 0;' . ( $i < 4 ? 'border-bottom:1px solid rgba(255,255,255,0.1)' : '' ) . '"><b>' . $n . '</b><span class="tag ' . $c . '">' . $s . '</span></div>';
}
$channels .= '</div>';
$paid = '<div class="mock-white"><div class="row between"><b>Order SB-1047</b><span class="tag tag-ok">Delivered</span></div>' . $tick( 'Kemi paid ₦21,000 by transfer' ) . $tick( 'Rider picked it up at 11:40' ) . $tick( 'Delivered with code 4 8 2 1' )
	. '<div style="background:#F6F5F9;border-radius:16px;padding:12px 14px"><div style="font-size:12.5px;color:#6B6779;font-weight:600">Paying to your bank on Friday</div><div class="disp" style="font-size:30px">₦146,200</div></div></div>';

echo sib_block_group_open( 'fold bg-mist', 'section' ) . sib_block_group_open( 'wrap fold-in' );
echo sib_block_group_open( 'col mw-720', 'div' ) . sib_block_p( 'How it works', 'eyebrow' ) . sib_block_h( 2, 'From “I want to sell” to your first order, in one evening' ) . sib_block_group_close();
echo '<!-- wp:group {"className":"stack","style":{"spacing":{"margin":{"top":"40px"}}},"layout":{"type":"default"}} -->' . "\n" . '<div class="wp-block-group stack" style="margin-top:40px">';
echo $card( '01', 'Tell Rex about your shop', 'Say what you sell in a sentence. Rex makes your logo, colours and store, and shows you before anything goes live.', 'white', 'ink', $logo_opts );
echo $card( '02', 'Add products from a photo', 'Snap a photo. Rex cleans the background, writes the name and description and suggests a price. Or import from Instagram.', 'mint-soft', 'forest', $product );
echo $card( '03', 'Sell where your customers are', 'One product list for your store, WhatsApp, Instagram, Facebook, TikTok Shop and Google. Peggy answers the chats.', 'forest', 'white', $channels );
echo $card( '04', 'Deliver and get paid', 'Book a rider in one tap. Buyers pay by card, transfer or cash on delivery. Your money lands every Friday.', 'peach', 'ink', $paid );
echo sib_block_group_close();
echo sib_block_group_close() . sib_block_group_close( 'section' );
