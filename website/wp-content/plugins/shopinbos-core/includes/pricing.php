<?php
/**
 * The /pricing/ page body: plans for sellers, suppliers and delivery partners (tabs), monthly or yearly,
 * a full comparison table for each, how fees and payouts work with an example order, AI credits, boosts,
 * add-ons and questions. Prices live in seed/pricing.json; change them there and redeploy.
 */

defined( 'ABSPATH' ) || exit;

add_action( 'init', function () {
	sib_register_block_group( [
		'pricing' => [ __( 'Pricing (plans and comparison)', 'shopinbos' ), 'sib_render_pricing', [] ],
	], 'widgets' );
}, 11 );

function sib_pricing_data(): array {
	static $d = null;
	if ( null === $d ) {
		$d = (array) json_decode( (string) file_get_contents( SIB_CORE_DIR . '/includes/seed/pricing.json' ), true );
	}
	return $d;
}

function sib_naira( int $n ): string {
	return '₦' . number_format( $n );
}

function sib_pricing_cell( $v ): string {
	if ( true === $v ) {
		return '<span class="pr-yes" aria-label="' . esc_attr__( 'Included', 'shopinbos' ) . '">' . sib_icon( 'tick', 16, '#16794A' ) . '</span>';
	}
	if ( false === $v ) {
		return '<span class="pr-no" aria-label="' . esc_attr__( 'Not included', 'shopinbos' ) . '">—</span>';
	}
	return esc_html( (string) $v );
}

function sib_render_pricing(): string {
	$d   = sib_pricing_data();
	$aud = (array) ( $d['audiences'] ?? [] );
	if ( ! $aud ) {
		return '';
	}
	$out = sib_pricing_css() . '<div class="pr" data-pr data-period="month">'
		. '<section class="pr-hero"><div class="wrap pr-center"><p class="eyebrow">' . esc_html__( 'Pricing', 'shopinbos' ) . '</p>'
		. '<h1 class="disp h1 pr-h1">' . esc_html__( 'Simple prices in naira. Start free.', 'shopinbos' ) . '</h1>'
		. '<p class="lead pr-lead">' . esc_html__( 'Sellers, suppliers and delivery partners each have a free plan. Payments are paid out to your bank account through Paystack. Upgrade to pay a lower fee and get more tools.', 'shopinbos' ) . '</p>'
		. '<div class="pr-switches"><div class="seg pr-aud" role="tablist" aria-label="' . esc_attr__( 'Plans for', 'shopinbos' ) . '">';
	$i = 0;
	foreach ( $aud as $key => $a ) {
		$out .= '<button type="button" class="segb" role="tab" id="pr-tab-' . esc_attr( $key ) . '" aria-controls="pr-' . esc_attr( $key ) . '" aria-selected="' . ( 0 === $i++ ? 'true' : 'false' ) . '" data-aud="' . esc_attr( $key ) . '">' . esc_html( $a['label'] ) . '</button>';
	}
	$out .= '</div><div class="seg pr-per" aria-label="' . esc_attr__( 'Billing', 'shopinbos' ) . '"><button type="button" class="segb" aria-pressed="true" data-per="month">' . esc_html__( 'Monthly', 'shopinbos' ) . '</button><button type="button" class="segb" aria-pressed="false" data-per="year">' . esc_html__( 'Yearly · 2 months free', 'shopinbos' ) . '</button></div></div></div></section>';

	$i = 0;
	foreach ( $aud as $key => $a ) {
		$plans = (array) $a['plans'];
		$out  .= '<section class="pr-panel" id="pr-' . esc_attr( $key ) . '" role="tabpanel" aria-labelledby="pr-tab-' . esc_attr( $key ) . '"' . ( 0 === $i++ ? '' : ' hidden' ) . '><div class="wrap">'
			. '<h2 class="pr-sr">' . esc_html( $a['title'] ) . '</h2><p class="pr-sub">' . esc_html( $a['lead'] ) . '</p>'
			. '<div class="pr-cards pr-n' . count( $plans ) . '">';
		foreach ( $plans as $p ) {
			$free  = 0 === (int) $p['month'];
			$out  .= '<div class="pr-card' . ( ! empty( $p['popular'] ) ? ' is-pop' : '' ) . '">' . ( ! empty( $p['popular'] ) ? '<span class="pr-badge">' . esc_html__( 'Most popular', 'shopinbos' ) . '</span>' : '' )
				. '<b class="pr-name">' . esc_html( $p['name'] ) . '</b><span class="pr-for">' . esc_html( $p['for'] ) . '</span>'
				. '<div class="pr-price">' . ( $free
					? '<b>' . esc_html__( 'Free', 'shopinbos' ) . '</b><span>' . esc_html__( 'forever', 'shopinbos' ) . '</span>'
					: '<b data-m>' . esc_html( sib_naira( (int) $p['month'] ) ) . '</b><b data-y hidden>' . esc_html( sib_naira( (int) $p['year'] ) ) . '</b><span data-m>' . esc_html__( '/ month', 'shopinbos' ) . '</span><span data-y hidden>' . esc_html__( '/ year', 'shopinbos' ) . '</span>' ) . '</div>'
				. '<span class="pr-fee">' . esc_html( $p['fee'] ) . '</span>'
				. '<a class="btn ' . ( ! empty( $p['popular'] ) ? 'btn-acc' : 'btn-ink' ) . ' pr-cta" href="' . esc_url( sib_go_url( $a['signup'], [ 'plan' => $p['key'], 'source' => 'pricing' ] ) ) . '">' . esc_html( $p['cta'] ) . '</a><ul class="pr-points">';
			foreach ( (array) $p['points'] as $pt ) {
				$out .= '<li>' . esc_html( $pt ) . '</li>';
			}
			$out .= '</ul></div>';
		}
		$out .= '</div>';

		// Comparison table.
		$out .= '<div class="pr-compare"><h3 class="disp pr-h3">' . esc_html( sprintf( __( 'Compare %s plans', 'shopinbos' ), mb_strtolower( $a['label'] ) ) ) . '</h3><div class="pr-tw"><table class="pr-table"><thead><tr><th scope="col"><span class="pr-sr">' . esc_html__( 'Feature', 'shopinbos' ) . '</span></th>';
		foreach ( $plans as $p ) {
			$out .= '<th scope="col">' . esc_html( $p['name'] ) . '</th>';
		}
		$out .= '</tr></thead><tbody>';
		foreach ( (array) $a['table'] as $row ) {
			if ( isset( $row['group'] ) ) {
				$out .= '<tr class="pr-group"><th colspan="' . ( count( $plans ) + 1 ) . '" scope="colgroup">' . esc_html( $row['group'] ) . '</th></tr>';
				continue;
			}
			$out .= '<tr><th scope="row">' . esc_html( $row['label'] ) . '</th>';
			foreach ( (array) $row['values'] as $v ) {
				$out .= '<td>' . sib_pricing_cell( $v ) . '</td>';
			}
			$out .= '</tr>';
		}
		$out .= '</tbody></table></div></div></div></section>';
	}

	// How fees and payouts work, with an example order.
	$out .= '<section class="pr-fees"><div class="wrap pr-split"><div><p class="eyebrow">' . esc_html__( 'Fees and payouts', 'shopinbos' ) . '</p><h2 class="disp pr-h2">' . esc_html__( 'Paid straight to your bank', 'shopinbos' ) . '</h2>'
		. '<p class="pr-p">' . esc_html__( 'When a customer pays by card, transfer or USSD, Paystack splits the payment at checkout: each business’s share is paid out to its own bank account.', 'shopinbos' ) . '</p>'
		. '<ul class="pr-list"><li><b>' . esc_html__( 'Payment fee:', 'shopinbos' ) . '</b> ' . esc_html__( 'Paystack charges 1.5% + ₦100 per local payment (the ₦100 is waived under ₦2,500), capped at ₦2,000. It is paid by the seller, like in any online store, and shown on every order.', 'shopinbos' ) . '</li>'
		. '<li><b>' . esc_html__( 'Shopinbos fees:', 'shopinbos' ) . '</b> ' . esc_html__( 'sellers pay a fee on store sales (3% to 0.5% by plan), suppliers a commission on marketplace orders (6% to 3%), and delivery partners a fee on delivery fees earned in the app (5% to 2%).', 'shopinbos' ) . '</li>'
		. '<li><b>' . esc_html__( 'Delivery:', 'shopinbos' ) . '</b> ' . esc_html__( 'the customer pays the delivery partner’s price, shown at checkout.', 'shopinbos' ) . '</li></ul></div>'
		. '<div class="pr-example"><b class="pr-ex-title">' . esc_html__( 'Example: one dropship order', 'shopinbos' ) . '</b><span class="pr-ex-sub">' . esc_html__( 'A customer pays ₦20,000 for a product plus ₦3,000 delivery. Seller on Starter, supplier and delivery partner on Free.', 'shopinbos' ) . '</span>'
		. '<table class="pr-ex"><thead><tr><th>' . esc_html__( 'Who', 'shopinbos' ) . '</th><th>' . esc_html__( 'Gets', 'shopinbos' ) . '</th><th>' . esc_html__( 'Shopinbos fee', 'shopinbos' ) . '</th><th>' . esc_html__( 'Keeps', 'shopinbos' ) . '</th></tr></thead><tbody>'
		. '<tr><td>' . esc_html__( 'Supplier (₦14,000 wholesale price)', 'shopinbos' ) . '</td><td>₦14,000</td><td>6% = ₦840</td><td>₦13,160</td></tr>'
		. '<tr><td>' . esc_html__( 'Seller (₦6,000 margin)', 'shopinbos' ) . '</td><td>₦6,000</td><td>' . esc_html__( '2% of ₦20,000 = ₦400', 'shopinbos' ) . '</td><td>₦5,600</td></tr>'
		. '<tr><td>' . esc_html__( 'Delivery partner', 'shopinbos' ) . '</td><td>₦3,000</td><td>5% = ₦150</td><td>₦2,850</td></tr></tbody></table>'
		. '<span class="pr-ex-note">' . esc_html__( 'Paystack’s fee on the ₦23,000 payment is about ₦445, paid by the seller, so the seller keeps about ₦5,155.', 'shopinbos' ) . '</span></div></div></section>';

	// AI credits.
	$out .= '<section class="pr-ai"><div class="wrap"><div class="pr-center"><p class="eyebrow">' . esc_html__( 'AI credits', 'shopinbos' ) . '</p><h2 class="disp pr-h2">' . esc_html__( 'Rex and Peggy run on credits', 'shopinbos' ) . '</h2>'
		. '<p class="pr-p">' . esc_html__( 'Every plan includes credits each month, and every new account gets 50 free. Each button shows its cost before you tap it. Failed jobs are refunded. Monthly credits reset each month; credits you buy last 12 months.', 'shopinbos' ) . '</p></div><div class="pr-packs">';
	foreach ( (array) $d['credit_packs'] as [ $name, $price, $credits ] ) {
		$out .= '<div class="pr-pack"><span>' . esc_html( $name ) . '</span><b>' . esc_html( $price ) . '</b><em>' . esc_html( sprintf( __( '%s credits', 'shopinbos' ), $credits ) ) . '</em></div>';
	}
	$out .= '</div><div class="pr-costs">';
	foreach ( (array) $d['credit_costs'] as $who => $rows ) {
		$out .= '<details class="pr-cost"' . ( 'Sellers' === $who ? ' open' : '' ) . '><summary>' . esc_html( sprintf( __( 'What things cost: %s', 'shopinbos' ), mb_strtolower( $who ) ) ) . '</summary><table class="pr-mini"><tbody>';
		foreach ( $rows as [ $what, $cost ] ) {
			$out .= '<tr><td>' . esc_html( $what ) . '</td><td>' . esc_html( $cost ) . '</td></tr>';
		}
		$out .= '</tbody></table></details>';
	}
	$out .= '</div></div></section>';

	// Boosts and add-ons.
	$mini = function ( array $rows ): string {
		$o = '<table class="pr-mini"><tbody>';
		foreach ( $rows as [ $a, $b ] ) {
			$o .= '<tr><td>' . esc_html( $a ) . '</td><td>' . esc_html( $b ) . '</td></tr>';
		}
		return $o . '</tbody></table>';
	};
	$out .= '<section class="pr-extras"><div class="wrap pr-split"><div class="pr-box"><b class="pr-h3 disp">' . esc_html__( 'Boosts for suppliers and delivery partners', 'shopinbos' ) . '</b><p class="pr-p">' . esc_html__( 'Get seen by more sellers. No plan needed; Pro plans include some featured time.', 'shopinbos' ) . '</p>' . $mini( (array) $d['boosts'] ) . '</div>'
		. '<div class="pr-box"><b class="pr-h3 disp">' . esc_html__( 'Add-ons', 'shopinbos' ) . '</b><p class="pr-p">' . esc_html__( 'Pay for extra messages and staff only when you need them.', 'shopinbos' ) . '</p>' . $mini( (array) $d['addons'] ) . '</div></div></section>';

	// Questions.
	$faq = [
		[ __( 'Is the Free plan really free?', 'shopinbos' ), __( 'Yes. Sellers can sell up to 20 products on yourname.mybos.store with no monthly price; a 3% fee applies to each store sale. Suppliers and delivery partners join and get verified free, and pay only when they earn through Shopinbos.', 'shopinbos' ) ],
		[ __( 'When do I get my money?', 'shopinbos' ), __( 'Usually within a few working days. Paystack splits every card, transfer and USSD payment at checkout and pays each business’s share out to its own bank account. For pay on delivery, the payment is confirmed when the rider enters the customer’s code.', 'shopinbos' ) ],
		[ __( 'Can I change plans later?', 'shopinbos' ), __( 'Yes. Upgrade or downgrade any time in the app. A lower fee starts on your next sale after you upgrade.', 'shopinbos' ) ],
		[ __( 'What does yearly billing save?', 'shopinbos' ), __( 'Two months. You pay for 10 months and get 12.', 'shopinbos' ) ],
		[ __( 'Is VAT included?', 'shopinbos' ), __( 'Prices are in naira and do not include VAT. VAT is added where it applies, and shown before you pay.', 'shopinbos' ) ],
		[ __( 'Can I use my own domain?', 'shopinbos' ), __( 'Yes, on Starter, Growth and Pro. The Free plan uses yourname.mybos.store.', 'shopinbos' ) ],
	];
	$out .= '<section class="pr-faq"><div class="wrap pr-narrow"><h2 class="disp pr-h2 pr-center">' . esc_html__( 'Pricing questions', 'shopinbos' ) . '</h2><div class="faq">';
	foreach ( $faq as [ $q, $a ] ) {
		$out .= '<details class="wp-block-details item toggle"><summary>' . esc_html( $q ) . '</summary><p>' . esc_html( $a ) . '</p></details>';
	}
	$out .= '</div><p class="pr-center pr-cmp">' . esc_html__( 'Coming from another platform?', 'shopinbos' ) . ' <a href="' . esc_url( home_url( '/compare/' ) ) . '">' . esc_html__( 'See how Shopinbos compares', 'shopinbos' ) . '</a></p></div></section></div>';

	$script = '<script data-no-optimize="1" data-no-defer="1">(function(){var r=document.querySelector("[data-pr]");if(!r)return;'
		. 'r.querySelectorAll("[data-aud]").forEach(function(b){b.addEventListener("click",function(){var k=b.getAttribute("data-aud");r.querySelectorAll("[data-aud]").forEach(function(x){x.setAttribute("aria-selected",x===b?"true":"false")});r.querySelectorAll(".pr-panel").forEach(function(p){p.hidden=p.id!=="pr-"+k});try{history.replaceState(null,"","#"+k)}catch(e){}})});'
		. 'r.querySelectorAll("[data-per]").forEach(function(b){b.addEventListener("click",function(){var y=b.getAttribute("data-per")==="year";r.querySelectorAll("[data-per]").forEach(function(x){x.setAttribute("aria-pressed",x===b?"true":"false")});r.querySelectorAll("[data-m]").forEach(function(e){e.hidden=y});r.querySelectorAll("[data-y]").forEach(function(e){e.hidden=!y})})});'
		. 'var h=location.hash.slice(1);var t=h?r.querySelector("[data-aud=\""+h+"\"]"):null;if(t)t.click();})();</script>';
	add_action( 'wp_footer', function () use ( $script ) {
		echo $script; // phpcs:ignore WordPress.Security.EscapeOutput
	}, 30 );
	return $out;
}

function sib_pricing_css(): string {
	return '<style>
.pr-hero { padding: 64px 0 28px; background: linear-gradient(#F6F5F9, #fff); }
.pr-center { text-align: center; display: flex; flex-direction: column; align-items: center; gap: 14px; }
.pr-h1 { margin: 0; max-width: 860px; }
.pr-lead { max-width: 720px; margin: 0; }
.pr-switches { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; margin-top: 10px; }
.pr-aud .segb[aria-selected="true"] { background: var(--ink, #16141F); color: #fff; }
.pr-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.pr-panel { padding: 8px 0 56px; }
.pr-panel[hidden] { display: none; }
.pr-sub { text-align: center; color: #6B6779; max-width: 680px; margin: 0 auto 26px; }
.pr-cards { display: grid; gap: 18px; align-items: stretch; }
.pr-n4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.pr-n3 { grid-template-columns: repeat(3, minmax(0, 1fr)); max-width: 1040px; margin: 0 auto; }
.pr-card { position: relative; border: 1px solid #ECEAF2; border-radius: 26px; padding: 26px 22px; display: flex; flex-direction: column; gap: 10px; background: #fff; }
.pr-card.is-pop { border: 2px solid #FF6A2B; box-shadow: 0 24px 48px -28px rgba(255,106,43,.55); }
.pr-badge { position: absolute; top: -13px; left: 22px; background: #FF6A2B; color: #fff; font-size: 12px; font-weight: 800; padding: 4px 10px; border-radius: 999px; }
.pr-name { font-size: 20px; }
.pr-for { font-size: 14px; color: #6B6779; min-height: 40px; }
.pr-price { display: flex; align-items: baseline; gap: 6px; margin-top: 4px; }
.pr-price b { font-family: var(--f-display, inherit); font-size: 36px; letter-spacing: -.02em; }
.pr-price span { color: #6B6779; font-size: 14px; }
.pr-price [hidden] { display: none; }
.pr-fee { align-self: flex-start; font-size: 13px; font-weight: 700; background: #F6F5F9; border-radius: 999px; padding: 4px 10px; }
.pr-cta { justify-content: center; margin: 6px 0 4px; }
.pr-points { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 9px; font-size: 14.5px; }
.pr-points li { display: flex; gap: 8px; line-height: 1.4; }
.pr-points li::before { content: ""; flex: none; width: 16px; height: 16px; margin-top: 2px; background: #16794A; -webkit-mask: var(--i-tick) center/contain no-repeat; mask: var(--i-tick) center/contain no-repeat; }
.pr-compare { margin-top: 48px; }
.pr-h3 { font-size: 24px; margin: 0 0 14px; display: block; }
.pr-tw { overflow-x: auto; border: 1px solid #ECEAF2; border-radius: 22px; }
.pr-table { width: 100%; border-collapse: collapse; font-size: 14.5px; min-width: 640px; }
.pr-table th, .pr-table td { padding: 12px 16px; border-bottom: 1px solid #F0EEF5; text-align: center; vertical-align: middle; }
.pr-table thead th { position: sticky; top: 0; background: #fff; font-size: 15px; }
.pr-table tbody th { text-align: left; font-weight: 600; color: #2B2836; }
.pr-table tr.pr-group th { background: #F6F5F9; text-align: left; font-size: 12px; letter-spacing: .1em; text-transform: uppercase; color: #6B6779; font-weight: 800; }
.pr-table tbody tr:last-child > * { border-bottom: 0; }
.pr-table th:first-child { position: sticky; left: 0; background: #fff; z-index: 1; }
.pr-table tr.pr-group th:first-child { background: #F6F5F9; }
.pr-yes { display: inline-flex; } .pr-no { color: #B9B6C6; }
.pr-fees { background: #0E2A38; color: #F4F1EA; padding: 72px 0; }
.pr-fees .eyebrow { color: #73D8C8; }
.pr-split { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 40px; align-items: start; }
.pr-h2 { font-size: 36px; margin: 6px 0 12px; letter-spacing: -.02em; }
.pr-p { line-height: 1.6; margin: 0 0 12px; }
.pr-fees .pr-p, .pr-list { color: #D5E2E6; }
.pr-list { padding-left: 18px; display: flex; flex-direction: column; gap: 10px; line-height: 1.55; }
.pr-list b { color: #fff; }
.pr-example { background: #fff; color: #16141F; border-radius: 24px; padding: 24px; display: flex; flex-direction: column; gap: 10px; }
.pr-ex-title { font-size: 18px; } .pr-ex-sub, .pr-ex-note { font-size: 13.5px; color: #6B6779; line-height: 1.5; }
.pr-ex { width: 100%; border-collapse: collapse; font-size: 13.5px; }
.pr-ex th, .pr-ex td { padding: 9px 6px; border-bottom: 1px solid #F0EEF5; text-align: right; }
.pr-ex th:first-child, .pr-ex td:first-child { text-align: left; }
.pr-ex td:last-child { font-weight: 800; color: #16794A; }
.pr-ai { padding: 72px 0 40px; }
.pr-ai .pr-p { max-width: 720px; color: #45424F; }
.pr-packs { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin: 24px 0; }
.pr-pack { border: 1px solid #ECEAF2; border-radius: 20px; padding: 18px; display: flex; flex-direction: column; gap: 4px; text-align: center; }
.pr-pack span { font-weight: 700; color: #6B6779; font-size: 14px; } .pr-pack b { font-size: 26px; font-family: var(--f-display, inherit); } .pr-pack em { font-style: normal; font-weight: 700; color: #16794A; }
.pr-costs { display: flex; flex-direction: column; gap: 10px; }
.pr-cost { border: 1px solid #ECEAF2; border-radius: 18px; padding: 14px 18px; }
.pr-cost summary { cursor: pointer; font-weight: 700; }
.pr-mini { width: 100%; border-collapse: collapse; font-size: 14.5px; margin-top: 8px; }
.pr-mini td { padding: 9px 0; border-bottom: 1px solid #F0EEF5; }
.pr-mini td:last-child { text-align: right; font-weight: 700; white-space: nowrap; padding-left: 12px; }
.pr-mini tr:last-child td { border-bottom: 0; }
.pr-extras { padding: 32px 0 72px; }
.pr-box { border: 1px solid #ECEAF2; border-radius: 24px; padding: 24px; }
.pr-box .pr-p { color: #6B6779; font-size: 14.5px; }
.pr-faq { background: #F6F5F9; padding: 72px 0; }
.pr-narrow { max-width: 780px; }
.pr-faq .faq { margin-top: 18px; }
.pr-cmp { margin-top: 24px; font-weight: 600; } .pr-cmp a { color: #C2410C; }
@media (max-width: 1080px) { .pr-n4 { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 820px) { .pr-n3 { grid-template-columns: 1fr; max-width: 460px; } .pr-split { grid-template-columns: 1fr; } .pr-packs { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 640px) {
	.pr-hero { padding: 40px 0 20px; }
	.pr-n4 { grid-template-columns: 1fr; }
	.pr-for { min-height: 0; }
	.pr-switches .seg { max-width: 100%; overflow-x: auto; flex-wrap: nowrap; }
	.pr-switches .segb { flex: none; white-space: nowrap; padding: 0 14px; }
	.pr-h2 { font-size: 28px; }
	.pr-table { font-size: 13.5px; min-width: 560px; }
	.pr-table th, .pr-table td { padding: 10px 10px; }
	.pr-fees, .pr-ai, .pr-faq { padding: 52px 0; }
	.pr-ex { font-size: 12.5px; }
}
</style>';
}
