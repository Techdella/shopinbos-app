<?php
/**
 * Title: Integrations marquee
 * Slug: shopinbos/integrations-marquee
 * Categories: shopinbos-sections
 * Description: Folded white band with a scrolling row of apps Shopinbos works with.
 */
$apps = [ [ 'WA', 'WhatsApp', '#E2F6F1' ], [ 'IG', 'Instagram', '#FFEDE4' ], [ 'FB', 'Facebook', '#E3EEFD' ], [ 'TT', 'TikTok Shop', '#F6F5F9' ], [ 'G', 'Google', '#FDF0D5' ], [ 'PS', 'Paystack', '#E2F6F1' ], [ 'JU', 'Jumia', '#FFEDE4' ], [ 'KO', 'Konga', '#E7E1FF' ], [ 'GIG', 'GIG Logistics', '#E3EEFD' ], [ 'KW', 'Kwik', '#FDF0D5' ], [ 'SH', 'Shopify import', '#E2F6F1' ], [ '16', '1688', '#FFEDE4' ] ];
$pills = function ( $hidden ) use ( $apps ) {
	$out = '';
	foreach ( $apps as [ $m, $name, $bg ] ) {
		$out .= '<span class="pill"' . ( $hidden ? ' aria-hidden="true"' : '' ) . '><span class="mono" style="background:' . $bg . '">' . esc_html( $m ) . '</span>' . esc_html( $name ) . '</span>';
	}
	return $out;
};
?>
<!-- wp:group {"tagName":"section","className":"fold bg-white","style":{"spacing":{"padding":{"top":"40px","bottom":"72px"}}},"layout":{"type":"default"}} -->
<section class="wp-block-group fold bg-white" style="padding-top:40px;padding-bottom:72px"><!-- wp:paragraph {"className":"marq-title"} -->
<p class="marq-title">Works with the apps you and your customers already use</p>
<!-- /wp:paragraph -->

<!-- wp:html -->
<div class="marq-wrap"><div class="marq"><?php echo $pills( false ) . $pills( true ); ?></div></div>
<!-- /wp:html --></section>
<!-- /wp:group -->
