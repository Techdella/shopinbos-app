<?php
/**
 * Free tools. No sign-up to use them; results can be emailed or saved by signing up.
 * The form markup is rendered here so the page is useful (and indexable) before JS loads;
 * assets/js/tools.js does the maths in the browser.
 */

defined( 'ABSPATH' ) || exit;

add_action( 'init', function () {
	wp_register_script( 'sib-qrcode', SIB_CORE_URL . 'assets/js/qrcode.min.js', [], '1.4.4', [ 'strategy' => 'defer', 'in_footer' => true ] );
	wp_register_script( 'sib-tools', SIB_CORE_URL . 'assets/js/tools.js', [], SIB_CORE_VERSION, [ 'strategy' => 'defer', 'in_footer' => true ] );
} );

function sib_tool_field( string $name, string $label, string $type = 'number', array $o = [] ): string {
	$id    = 'sib-t-' . $name . '-' . wp_unique_id();
	$attrs = '';
	foreach ( [ 'min', 'max', 'step', 'placeholder', 'value' ] as $k ) {
		if ( isset( $o[ $k ] ) ) {
			$attrs .= ' ' . $k . '="' . esc_attr( (string) $o[ $k ] ) . '"';
		}
	}
	$prefix = $o['prefix'] ?? ( 'money' === $type ? '₦' : '' );
	$input  = 'select' === $type
		? '<select class="input" id="' . esc_attr( $id ) . '" name="' . esc_attr( $name ) . '">' . implode( '', array_map( fn( $k, $v ) => '<option value="' . esc_attr( $k ) . '">' . esc_html( $v ) . '</option>', array_keys( $o['options'] ), $o['options'] ) ) . '</select>'
		: ( 'textarea' === $type
			? '<textarea class="input" id="' . esc_attr( $id ) . '" name="' . esc_attr( $name ) . '"' . $attrs . '>' . esc_textarea( (string) ( $o['text'] ?? '' ) ) . '</textarea>'
			: '<input class="input" id="' . esc_attr( $id ) . '" name="' . esc_attr( $name ) . '" type="' . ( 'money' === $type || 'number' === $type ? 'number' : esc_attr( $type ) ) . '" inputmode="' . ( 'tel' === $type ? 'tel' : 'decimal' ) . '"' . $attrs . '>' );
	if ( $prefix ) {
		$input = '<span class="tool-prefix"><span aria-hidden="true">' . esc_html( $prefix ) . '</span>' . $input . '</span>';
	}
	return '<label class="field" for="' . esc_attr( $id ) . '">' . esc_html( $label ) . $input . ( ! empty( $o['help'] ) ? '<span class="psell" style="font-weight:500">' . esc_html( $o['help'] ) . '</span>' : '' ) . '</label>';
}

/** Form fields and result rows for each tool. */
function sib_tool_markup( string $tool ): array {
	switch ( $tool ) {
		case 'profit-margin':
			return [
				sib_tool_field( 'price', __( 'Your selling price', 'shopinbos' ), 'money', [ 'value' => 18500, 'min' => 0 ] )
				. sib_tool_field( 'cost', __( 'What the product costs you', 'shopinbos' ), 'money', [ 'value' => 7500, 'min' => 0 ] )
				. sib_tool_field( 'delivery', __( 'Delivery you pay for (if free delivery)', 'shopinbos' ), 'money', [ 'value' => 0, 'min' => 0 ] )
				. sib_tool_field( 'other', __( 'Packaging and other costs', 'shopinbos' ), 'money', [ 'value' => 300, 'min' => 0 ] )
				. sib_tool_field( 'pay', __( 'How the customer pays', 'shopinbos' ), 'select', [ 'options' => [ 'paystack' => __( 'Card, transfer or USSD (Paystack)', 'shopinbos' ), 'cod' => __( 'Pay on delivery', 'shopinbos' ) ] ] ),
				[ 'fee' => __( 'Payment fee', 'shopinbos' ), 'costs' => __( 'Total costs', 'shopinbos' ), 'keep' => __( 'You keep', 'shopinbos' ), 'margin' => __( 'Profit margin', 'shopinbos' ) ],
			];
		case 'selling-price':
			return [
				sib_tool_field( 'cost', __( 'What the product costs you', 'shopinbos' ), 'money', [ 'value' => 6000, 'min' => 0 ] )
				. sib_tool_field( 'other', __( 'Packaging, delivery you cover and other costs', 'shopinbos' ), 'money', [ 'value' => 500, 'min' => 0 ] )
				. sib_tool_field( 'margin', __( 'Profit margin you want', 'shopinbos' ), 'number', [ 'value' => 40, 'min' => 1, 'max' => 90, 'prefix' => '%' ] )
				. sib_tool_field( 'pay', __( 'How the customer pays', 'shopinbos' ), 'select', [ 'options' => [ 'paystack' => __( 'Card, transfer or USSD (Paystack)', 'shopinbos' ), 'cod' => __( 'Pay on delivery', 'shopinbos' ) ] ] ),
				[ 'price' => __( 'Charge', 'shopinbos' ), 'fee' => __( 'Payment fee', 'shopinbos' ), 'keep' => __( 'You keep', 'shopinbos' ), 'markup' => __( 'Markup on cost', 'shopinbos' ) ],
			];
		case 'paystack-fee':
			return [
				sib_tool_field( 'amount', __( 'Amount', 'shopinbos' ), 'money', [ 'value' => 21000, 'min' => 0 ] )
				. sib_tool_field( 'mode', __( 'Who pays the fee?', 'shopinbos' ), 'select', [ 'options' => [ 'me' => __( 'I do (it comes out of what I get)', 'shopinbos' ), 'customer' => __( 'My customer (I add it to the price)', 'shopinbos' ) ] ] ),
				[ 'fee' => __( 'Paystack fee', 'shopinbos' ), 'charge' => __( 'Customer pays', 'shopinbos' ), 'get' => __( 'You get', 'shopinbos' ), 'note' => __( 'Rule used', 'shopinbos' ) ],
			];
		case 'whatsapp-link':
			return [
				sib_tool_field( 'phone', __( 'Your WhatsApp number', 'shopinbos' ), 'tel', [ 'placeholder' => '803 412 7790', 'prefix' => '+234' ] )
				. sib_tool_field( 'message', __( 'Message your customer sends', 'shopinbos' ), 'textarea', [ 'text' => __( 'Hello! I want to order', 'shopinbos' ) ] ),
				[ 'link' => __( 'Your link', 'shopinbos' ) ],
			];
		case 'landed-cost':
			return [
				sib_tool_field( 'yuan', __( 'Price per piece in yuan (¥)', 'shopinbos' ), 'number', [ 'value' => 35, 'min' => 0, 'step' => '0.01', 'prefix' => '¥' ] )
				. sib_tool_field( 'qty', __( 'Quantity', 'shopinbos' ), 'number', [ 'value' => 100, 'min' => 1 ] )
				. sib_tool_field( 'rate', __( 'Naira per yuan today', 'shopinbos' ), 'money', [ 'placeholder' => '220', 'min' => 0, 'step' => '0.01', 'help' => __( 'Use the rate your agent gives you.', 'shopinbos' ) ] )
				. sib_tool_field( 'weight', __( 'Weight per piece (kg)', 'shopinbos' ), 'number', [ 'value' => '0.3', 'min' => 0, 'step' => '0.01', 'prefix' => 'kg' ] )
				. sib_tool_field( 'freight', __( 'Shipping price per kg (air) in naira', 'shopinbos' ), 'money', [ 'placeholder' => '9000', 'min' => 0, 'help' => __( 'From your cargo agent. For sea, divide their CBM price by the kg you fit in one CBM.', 'shopinbos' ) ] )
				. sib_tool_field( 'local', __( 'China delivery, clearing and other fees (total)', 'shopinbos' ), 'money', [ 'value' => 0, 'min' => 0 ] ),
				[ 'goods' => __( 'Goods', 'shopinbos' ), 'ship' => __( 'Shipping', 'shopinbos' ), 'total' => __( 'Total landed cost', 'shopinbos' ), 'each' => __( 'Cost per piece', 'shopinbos' ) ],
			];
		case 'break-even':
			return [
				sib_tool_field( 'fixed', __( 'Monthly running costs (data, rent, plan, ads)', 'shopinbos' ), 'money', [ 'value' => 60000, 'min' => 0 ] )
				. sib_tool_field( 'price', __( 'Selling price per item', 'shopinbos' ), 'money', [ 'value' => 15000, 'min' => 0 ] )
				. sib_tool_field( 'cost', __( 'Cost per item (product, packaging, delivery you cover)', 'shopinbos' ), 'money', [ 'value' => 8000, 'min' => 0 ] )
				. sib_tool_field( 'pay', __( 'How most customers pay', 'shopinbos' ), 'select', [ 'options' => [ 'paystack' => __( 'Card, transfer or USSD (Paystack)', 'shopinbos' ), 'cod' => __( 'Pay on delivery', 'shopinbos' ) ] ] ),
				[ 'per' => __( 'You keep per sale', 'shopinbos' ), 'units' => __( 'Sales to break even each month', 'shopinbos' ), 'sales' => __( 'Sales value to break even', 'shopinbos' ), 'day' => __( 'That is about', 'shopinbos' ) ],
			];
		case 'discount':
			return [
				sib_tool_field( 'price', __( 'Normal price', 'shopinbos' ), 'money', [ 'value' => 20000, 'min' => 0 ] )
				. sib_tool_field( 'cost', __( 'What it costs you (all in)', 'shopinbos' ), 'money', [ 'value' => 11000, 'min' => 0 ] )
				. sib_tool_field( 'off', __( 'Discount', 'shopinbos' ), 'number', [ 'value' => 15, 'min' => 0, 'max' => 90, 'prefix' => '%' ] ),
				[ 'sale' => __( 'Sale price', 'shopinbos' ), 'keep' => __( 'You keep per sale (after Paystack fee)', 'shopinbos' ), 'before' => __( 'You kept before', 'shopinbos' ), 'more' => __( 'Sell this many more to earn the same', 'shopinbos' ) ],
			];
		case 'ad-budget':
			return [
				sib_tool_field( 'daily', __( 'Daily ad budget', 'shopinbos' ), 'money', [ 'value' => 5000, 'min' => 0 ] )
				. sib_tool_field( 'days', __( 'Number of days', 'shopinbos' ), 'number', [ 'value' => 7, 'min' => 1 ] )
				. sib_tool_field( 'cpo', __( 'Ad cost per order (from your past ads, or your guess)', 'shopinbos' ), 'money', [ 'value' => 2500, 'min' => 0 ] )
				. sib_tool_field( 'profit', __( 'Profit per order before ads', 'shopinbos' ), 'money', [ 'value' => 6000, 'min' => 0 ] ),
				[ 'spend' => __( 'Total ad spend', 'shopinbos' ), 'orders' => __( 'Orders you can expect', 'shopinbos' ), 'net' => __( 'Profit after ads', 'shopinbos' ), 'max' => __( 'Most you can pay per order and still profit', 'shopinbos' ) ],
			];
		case 'business-name':
			return [
				sib_tool_field( 'what', __( 'What you sell (one or two words)', 'shopinbos' ), 'text', [ 'value' => 'bags', 'placeholder' => 'bags, skincare, snacks' ] )
				. sib_tool_field( 'word', __( 'A word you like (your name, area or a feeling)', 'shopinbos' ), 'text', [ 'value' => 'Tola', 'placeholder' => 'Tola, Lekki, Glow' ] )
				. sib_tool_field( 'style', __( 'Style', 'shopinbos' ), 'select', [ 'options' => [ 'warm' => __( 'Warm and friendly', 'shopinbos' ), 'premium' => __( 'Premium', 'shopinbos' ), 'fun' => __( 'Fun and bold', 'shopinbos' ), 'local' => __( 'Proudly Nigerian', 'shopinbos' ) ] ] ),
				[ 'names' => __( 'Name ideas', 'shopinbos' ), 'tip' => __( 'Before you choose', 'shopinbos' ) ],
			];
		case 'product-description':
			return [
				sib_tool_field( 'name', __( 'Product name', 'shopinbos' ), 'text', [ 'value' => 'Leather tote bag', 'placeholder' => 'Leather tote bag' ] )
				. sib_tool_field( 'made', __( 'Made of / key detail', 'shopinbos' ), 'text', [ 'value' => 'soft brown leather, inner zip pocket' ] )
				. sib_tool_field( 'size', __( 'Size, weight or quantity', 'shopinbos' ), 'text', [ 'value' => 'fits a 14-inch laptop' ] )
				. sib_tool_field( 'for', __( 'Who it is for / when they use it', 'shopinbos' ), 'text', [ 'value' => 'work, church and weekend outings' ] )
				. sib_tool_field( 'price', __( 'Price', 'shopinbos' ), 'money', [ 'value' => 28000, 'min' => 0 ] )
				. sib_tool_field( 'delivery', __( 'Delivery', 'shopinbos' ), 'text', [ 'value' => 'same day in Lagos, 2 to 4 days elsewhere' ] ),
				[ 'store' => __( 'For your store', 'shopinbos' ), 'whatsapp' => __( 'For WhatsApp', 'shopinbos' ), 'instagram' => __( 'For Instagram and TikTok', 'shopinbos' ) ],
			];
	}
	return [ '', [] ];
}

function sib_render_tool( array $a ): string {
	$tool = $a['tool'] ?: ( get_post() ? (string) get_post_meta( get_the_ID(), 'sib_tool', true ) : '' );
	[ $fields, $results ] = sib_tool_markup( $tool );
	if ( ! $fields ) {
		return is_admin() || wp_is_json_request() ? '<p>' . esc_html__( 'Pick a tool in the block settings.', 'shopinbos' ) . '</p>' : '';
	}
	wp_enqueue_script( 'sib-tools' );
	if ( 'whatsapp-link' === $tool ) {
		wp_enqueue_script( 'sib-qrcode' );
	}
	$rows  = '';
	$texty = in_array( $tool, [ 'business-name', 'product-description' ], true );
	foreach ( $results as $k => $label ) {
		$rows .= $texty
			? '<div class="tool-text"><span class="muted">' . esc_html( $label ) . '</span><b data-r="' . esc_attr( $k ) . '">–</b>' . ( 'product-description' === $tool ? '<button type="button" class="chip" data-copy-r="' . esc_attr( $k ) . '">' . esc_html__( 'Copy', 'shopinbos' ) . '</button>' : '' ) . '</div>'
			: '<div class="kv"><span class="muted">' . esc_html( $label ) . '</span><b data-r="' . esc_attr( $k ) . '">–</b></div>';
	}
	$extra = 'whatsapp-link' === $tool
		? '<div data-r-qr style="display:flex;justify-content:center;padding:12px;background:#fff;border-radius:16px"></div><div class="row wrapflex"><button type="button" class="btn btn-ink btn-s" data-copy>' . esc_html__( 'Copy link', 'shopinbos' ) . '</button><button type="button" class="btn btn-ghost btn-s" data-download-qr>' . esc_html__( 'Download QR', 'shopinbos' ) . '</button></div>'
		: '';
	return '<div class="tool card split split-top" data-sib-tool="' . esc_attr( $tool ) . '">'
		. '<form class="col" onsubmit="return false" novalidate>' . $fields . '</form>'
		. '<div class="tool-out col" aria-live="polite"><p class="eyebrow">' . esc_html__( 'Your result', 'shopinbos' ) . '</p><div>' . $rows . '</div>' . $extra
		. '<div class="tool-cta col" style="gap:10px;margin-top:8px"><a class="btn btn-acc btn-block" href="' . esc_url( sib_go_url( 'tool_result', [ 'tool' => $tool ] ) ) . '">' . esc_html__( 'Save this in Shopinbos', 'shopinbos' ) . '</a>'
		. sib_render_lead_form( [ 'kind' => 'tool', 'heading' => __( 'Or email me the result', 'shopinbos' ), 'tool' => $tool ] ) . '</div></div></div>';
}
