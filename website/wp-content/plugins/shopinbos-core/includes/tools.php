<?php
/**
 * Free tools. Unlocked once with an email and WhatsApp number (V9 gate); results can be emailed or saved by signing up.
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
			: '<input class="input" id="' . esc_attr( $id ) . '" name="' . esc_attr( $name ) . '" type="' . ( 'money' === $type || 'number' === $type ? 'number' : esc_attr( $type ) ) . '"' . ( 'tel' === $type ? ' inputmode="tel"' : ( 'money' === $type || 'number' === $type ? ' inputmode="decimal"' : '' ) ) . $attrs . '>' );
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
		case 'invoice':
		case 'receipt':
			$inv = 'invoice' === $tool;
			return [
				sib_tool_field( 'biz', __( 'Your business name', 'shopinbos' ), 'text', [ 'value' => 'Tola Bags' ] )
				. sib_tool_field( 'logo', __( 'Logo letters (up to 3)', 'shopinbos' ), 'text', [ 'value' => 'TB', 'help' => __( 'Shown in a circle at the top.', 'shopinbos' ) ] )
				. sib_tool_field( 'biz_contact', __( 'Your phone and address', 'shopinbos' ), 'text', [ 'value' => '0803 412 7790 · Ikeja, Lagos' ] )
				. sib_tool_field( 'number', $inv ? __( 'Invoice number', 'shopinbos' ) : __( 'Receipt number', 'shopinbos' ), 'text', [ 'value' => $inv ? 'INV-001' : 'RCT-001' ] )
				. sib_tool_field( 'customer', __( 'Customer name', 'shopinbos' ), 'text', [ 'value' => 'Ngozi Okafor' ] )
				. sib_tool_field( 'customer_contact', __( 'Customer phone or address', 'shopinbos' ), 'text', [ 'placeholder' => '0812 000 0000' ] )
				. sib_tool_field( 'date', $inv ? __( 'Invoice date', 'shopinbos' ) : __( 'Date paid', 'shopinbos' ), 'date' )
				. ( $inv
					? sib_tool_field( 'due', __( 'Pay by (due date)', 'shopinbos' ), 'date' )
					: sib_tool_field( 'method', __( 'Paid by', 'shopinbos' ), 'select', [ 'options' => [ 'Bank transfer' => __( 'Bank transfer', 'shopinbos' ), 'Cash' => __( 'Cash', 'shopinbos' ), 'Card' => __( 'Card', 'shopinbos' ), 'POS' => __( 'POS', 'shopinbos' ), 'USSD' => __( 'USSD', 'shopinbos' ) ] ] ) )
				. sib_tool_items()
				. sib_tool_field( 'delivery', __( 'Delivery fee', 'shopinbos' ), 'money', [ 'value' => 2500, 'min' => 0 ] )
				. sib_tool_field( 'discount', __( 'Discount (naira off)', 'shopinbos' ), 'money', [ 'value' => 0, 'min' => 0 ] )
				. sib_tool_field( 'vat', __( 'VAT', 'shopinbos' ), 'select', [ 'options' => [ 'none' => __( 'No VAT', 'shopinbos' ), 'add' => __( 'Add 7.5% VAT', 'shopinbos' ) ] ] )
				. ( $inv ? sib_tool_field( 'bank', __( 'How to pay you (bank, account number, account name)', 'shopinbos' ), 'textarea', [ 'text' => "GTBank\n0123456789\nTola Bags Enterprise" ] ) : '' )
				. sib_tool_field( 'note', __( 'Note at the bottom', 'shopinbos' ), 'text', [ 'value' => $inv ? __( 'Thank you for your order.', 'shopinbos' ) : __( 'Thank you for buying from us.', 'shopinbos' ) ] ),
				[ 'subtotal' => __( 'Items', 'shopinbos' ), 'extras' => __( 'Delivery, discount and VAT', 'shopinbos' ), 'total' => $inv ? __( 'Total to pay', 'shopinbos' ) : __( 'Amount paid', 'shopinbos' ) ],
			];
		case 'vat':
			return [
				sib_tool_field( 'amount', __( 'Amount', 'shopinbos' ), 'money', [ 'value' => 50000, 'min' => 0, 'step' => '0.01' ] )
				. sib_tool_field( 'rate', __( 'VAT rate', 'shopinbos' ), 'number', [ 'value' => '7.5', 'min' => 0, 'max' => 50, 'step' => '0.1', 'prefix' => '%', 'help' => __( 'Nigeria’s VAT rate is 7.5%.', 'shopinbos' ) ] )
				. sib_tool_field( 'mode', __( 'What do you want to do?', 'shopinbos' ), 'select', [ 'options' => [ 'add' => __( 'Add VAT to this amount', 'shopinbos' ), 'remove' => __( 'Take VAT out (the amount already includes VAT)', 'shopinbos' ) ] ] ),
				[ 'before' => __( 'Amount before VAT', 'shopinbos' ), 'vat' => __( 'VAT', 'shopinbos' ), 'after' => __( 'Amount with VAT', 'shopinbos' ), 'note' => __( 'Worked out as', 'shopinbos' ) ],
			];
		case 'pos-charges':
			return [
				sib_tool_field( 'amount', __( 'Amount', 'shopinbos' ), 'money', [ 'value' => 20000, 'min' => 0 ] )
				. sib_tool_field( 'kind', __( 'What is the customer doing?', 'shopinbos' ), 'select', [ 'options' => [ 'withdraw' => __( 'Withdrawing cash', 'shopinbos' ), 'transfer' => __( 'Sending a transfer (paying cash to the agent)', 'shopinbos' ) ] ] )
				. sib_tool_field( 'rule', __( 'How the charge works', 'shopinbos' ), 'select', [ 'options' => [ 'step' => __( 'A fixed charge for every amount (like ₦100 per ₦5,000)', 'shopinbos' ), 'pct' => __( 'A percentage of the amount', 'shopinbos' ) ] ] )
				. sib_tool_field( 'charge', __( 'Charge', 'shopinbos' ), 'money', [ 'value' => 100, 'min' => 0, 'help' => __( 'Set what your agent charges (or what you charge). It differs by agent and area.', 'shopinbos' ) ] )
				. sib_tool_field( 'per', __( 'For every', 'shopinbos' ), 'money', [ 'value' => 5000, 'min' => 1, 'help' => __( 'Part of a step counts as a full step.', 'shopinbos' ) ] )
				. sib_tool_field( 'pct', __( 'Percentage (if you picked percentage)', 'shopinbos' ), 'number', [ 'value' => 1, 'min' => 0, 'step' => '0.1', 'prefix' => '%' ] )
				. sib_tool_field( 'pays', __( 'How is the charge paid?', 'shopinbos' ), 'select', [ 'options' => [ 'top' => __( 'On top of the amount', 'shopinbos' ), 'inside' => __( 'Taken out of the amount', 'shopinbos' ) ] ] )
				. sib_tool_field( 'cost', __( 'For agents: what the POS provider takes from you', 'shopinbos' ), 'money', [ 'value' => 0, 'min' => 0, 'help' => __( 'From your POS provider’s app. Leave 0 if you are the customer.', 'shopinbos' ) ] ),
				[ 'charge' => __( 'Charge', 'shopinbos' ), 'pays' => __( 'Customer pays', 'shopinbos' ), 'gets' => __( 'Customer gets (cash, or the amount sent)', 'shopinbos' ), 'profit' => __( 'Agent keeps after the provider’s cut', 'shopinbos' ) ],
			];
		case 'delivery-fee':
			return [
				sib_tool_field( 'zones', __( 'Your areas and prices (one per line: area = price)', 'shopinbos' ), 'textarea', [ 'text' => "Ikeja and nearby = 2000\nMainland = 2500\nIsland and Lekki = 3500\nOutside Lagos = 6000" ] )
				. sib_tool_field( 'kg', __( 'Weight included in the price', 'shopinbos' ), 'number', [ 'value' => 3, 'min' => 0, 'step' => '0.5', 'prefix' => 'kg' ] )
				. sib_tool_field( 'extra', __( 'Extra for each kg above that', 'shopinbos' ), 'money', [ 'value' => 500, 'min' => 0 ] )
				. sib_tool_field( 'free', __( 'Free delivery on orders above (0 = never)', 'shopinbos' ), 'money', [ 'value' => 50000, 'min' => 0 ] )
				. sib_tool_field( 'weight', __( 'Check a parcel: weight', 'shopinbos' ), 'number', [ 'value' => 5, 'min' => 0, 'step' => '0.5', 'prefix' => 'kg' ] )
				. sib_tool_field( 'base', __( 'Or by distance: starting fee', 'shopinbos' ), 'money', [ 'value' => 1000, 'min' => 0 ] )
				. sib_tool_field( 'perkm', __( 'Plus per km (0 = don’t show distance prices)', 'shopinbos' ), 'money', [ 'value' => 0, 'min' => 0 ] ),
				[ 'low' => __( 'Lowest delivery price', 'shopinbos' ), 'high' => __( 'Highest delivery price', 'shopinbos' ), 'parcel' => __( 'This parcel to your farthest area', 'shopinbos' ), 'list' => __( 'Your price list to share', 'shopinbos' ) ],
			];
		case 'markup':
			return [
				sib_tool_field( 'cost', __( 'What one item costs you', 'shopinbos' ), 'money', [ 'value' => 5000, 'min' => 0 ] )
				. sib_tool_field( 'mode', __( 'What do you know?', 'shopinbos' ), 'select', [ 'options' => [ 'markup' => __( 'The markup I want', 'shopinbos' ), 'price' => __( 'My selling price (show my markup)', 'shopinbos' ) ] ] )
				. sib_tool_field( 'markup', __( 'Markup', 'shopinbos' ), 'number', [ 'value' => 60, 'min' => 0, 'prefix' => '%' ] )
				. sib_tool_field( 'price', __( 'Selling price (if you picked that)', 'shopinbos' ), 'money', [ 'value' => 8500, 'min' => 0 ] ),
				[ 'markup' => __( 'Markup on cost', 'shopinbos' ), 'margin' => __( 'Profit margin on price', 'shopinbos' ), 'price' => __( 'Selling price', 'shopinbos' ), 'profit' => __( 'Profit per item', 'shopinbos' ), 'explain' => __( 'Markup or margin?', 'shopinbos' ) ],
			];
		case 'wholesale-price':
			return [
				sib_tool_field( 'retail', __( 'Price for one piece (retail)', 'shopinbos' ), 'money', [ 'value' => 5000, 'min' => 0 ] )
				. sib_tool_field( 'cost', __( 'What one piece costs you', 'shopinbos' ), 'money', [ 'value' => 3000, 'min' => 0 ] )
				. sib_tool_field( 'q1', __( 'Price break 1: from this many pieces', 'shopinbos' ), 'number', [ 'value' => 6, 'min' => 0 ] )
				. sib_tool_field( 'd1', __( 'Discount at break 1', 'shopinbos' ), 'number', [ 'value' => 5, 'min' => 0, 'max' => 90, 'prefix' => '%' ] )
				. sib_tool_field( 'q2', __( 'Price break 2: from this many', 'shopinbos' ), 'number', [ 'value' => 12, 'min' => 0 ] )
				. sib_tool_field( 'd2', __( 'Discount at break 2', 'shopinbos' ), 'number', [ 'value' => 10, 'min' => 0, 'max' => 90, 'prefix' => '%' ] )
				. sib_tool_field( 'q3', __( 'Price break 3: from this many (0 = skip)', 'shopinbos' ), 'number', [ 'value' => 50, 'min' => 0 ] )
				. sib_tool_field( 'd3', __( 'Discount at break 3', 'shopinbos' ), 'number', [ 'value' => 15, 'min' => 0, 'max' => 90, 'prefix' => '%' ] ),
				[ 'low' => __( 'Lowest price per piece', 'shopinbos' ), 'profit' => __( 'Your profit per piece at that price', 'shopinbos' ), 'safe' => __( 'Most discount before you make a loss', 'shopinbos' ), 'table' => __( 'Your price list to share', 'shopinbos' ) ],
			];
		case 'caption':
			return [
				sib_tool_field( 'product', __( 'Product', 'shopinbos' ), 'text', [ 'value' => 'Ankara two-piece set' ] )
				. sib_tool_field( 'detail', __( 'Best detail (what buyers love)', 'shopinbos' ), 'text', [ 'value' => 'soft cotton, sizes 8 to 18' ] )
				. sib_tool_field( 'price', __( 'Price (0 = don’t show)', 'shopinbos' ), 'money', [ 'value' => 25000, 'min' => 0 ] )
				. sib_tool_field( 'place', __( 'Your city or where you deliver', 'shopinbos' ), 'text', [ 'value' => 'Lagos' ] )
				. sib_tool_field( 'tone', __( 'Tone', 'shopinbos' ), 'select', [ 'options' => [ 'clear' => __( 'Clear English', 'shopinbos' ), 'pidgin' => __( 'Pidgin', 'shopinbos' ), 'hype' => __( 'Hype and fun', 'shopinbos' ), 'soft' => __( 'Soft and premium', 'shopinbos' ) ] ] )
				. sib_tool_field( 'cta', __( 'How people order', 'shopinbos' ), 'select', [ 'options' => [ 'dm' => __( 'Send a DM', 'shopinbos' ), 'wa' => __( 'Order on WhatsApp', 'shopinbos' ), 'link' => __( 'Tap the link in bio', 'shopinbos' ), 'comment' => __( 'Comment a code to order', 'shopinbos' ) ] ] )
				. sib_tool_field( 'code', __( 'Product code (for “comment to order”)', 'shopinbos' ), 'text', [ 'value' => 'ANK2' ] ),
				[ 'one' => __( 'Instagram caption', 'shopinbos' ), 'two' => __( 'Another way to say it', 'shopinbos' ), 'tiktok' => __( 'Short caption for TikTok', 'shopinbos' ), 'tags' => __( 'Hashtags', 'shopinbos' ) ],
			];
		case 'qr-label':
			return [
				sib_tool_field( 'name', __( 'Product name', 'shopinbos' ), 'text', [ 'value' => 'Leather tote bag' ] )
				. sib_tool_field( 'price', __( 'Price (0 = don’t show)', 'shopinbos' ), 'money', [ 'value' => 28000, 'min' => 0 ] )
				. sib_tool_field( 'code', __( 'Product code or SKU (for the barcode)', 'shopinbos' ), 'text', [ 'value' => 'BAG2', 'help' => __( 'Letters, numbers and simple signs like - or /.', 'shopinbos' ) ] )
				. sib_tool_field( 'link', __( 'What the QR code opens (link or text)', 'shopinbos' ), 'text', [ 'value' => 'https://tolabags.mybos.store', 'help' => __( 'Your product page, store or WhatsApp link.', 'shopinbos' ) ] )
				. sib_tool_field( 'show', __( 'Show on the label', 'shopinbos' ), 'select', [ 'options' => [ 'both' => __( 'QR code and barcode', 'shopinbos' ), 'qr' => __( 'QR code only', 'shopinbos' ), 'bar' => __( 'Barcode only', 'shopinbos' ) ] ] )
				. sib_tool_field( 'copies', __( 'Labels to print', 'shopinbos' ), 'select', [ 'options' => [ '1' => '1', '8' => '8', '12' => '12', '24' => __( '24 (a full A4 sheet)', 'shopinbos' ) ] ] ),
				[ 'opens' => __( 'The QR code opens', 'shopinbos' ), 'reads' => __( 'The barcode reads', 'shopinbos' ) ],
			];
		case 'ajo':
			return [
				sib_tool_field( 'type', __( 'Type of savings', 'shopinbos' ), 'select', [ 'options' => [ 'rotate' => __( 'Ajo or esusu (members take turns to collect)', 'shopinbos' ), 'thrift' => __( 'Daily thrift with a collector (alajo)', 'shopinbos' ) ] ] )
				. sib_tool_field( 'amount', __( 'Each person pays each time', 'shopinbos' ), 'money', [ 'value' => 10000, 'min' => 0 ] )
				. sib_tool_field( 'members', __( 'Number of members', 'shopinbos' ), 'number', [ 'value' => 10, 'min' => 1, 'max' => 200 ] )
				. sib_tool_field( 'every', __( 'How often you pay', 'shopinbos' ), 'select', [ 'options' => [ 'week' => __( 'Every week', 'shopinbos' ), 'month' => __( 'Every month', 'shopinbos' ), 'day' => __( 'Every day', 'shopinbos' ) ] ] )
				. sib_tool_field( 'start', __( 'First payout date', 'shopinbos' ), 'date' )
				. sib_tool_field( 'fee', __( 'Organiser or collector fee per payout', 'shopinbos' ), 'money', [ 'value' => 0, 'min' => 0 ] )
				. sib_tool_field( 'days', __( 'Thrift: days in one cycle', 'shopinbos' ), 'number', [ 'value' => 31, 'min' => 1, 'max' => 366 ] )
				. sib_tool_field( 'keep', __( 'Thrift: days the collector keeps', 'shopinbos' ), 'number', [ 'value' => 1, 'min' => 0, 'max' => 31 ] )
				. sib_tool_field( 'names', __( 'Members’ names in collection order (optional, one per line)', 'shopinbos' ), 'textarea', [ 'placeholder' => "Bisi\nChidi\nAisha" ] ),
				[ 'each' => __( 'Each member pays in one cycle', 'shopinbos' ), 'cycle' => __( 'One full cycle takes', 'shopinbos' ), 'pot' => __( 'Each payout', 'shopinbos' ), 'schedule' => __( 'Payout schedule', 'shopinbos' ) ],
			];
		case 'naira-dollar':
			return [
				sib_tool_field( 'dir', __( 'Convert', 'shopinbos' ), 'select', [ 'options' => [ 'usd' => __( 'Dollars to naira', 'shopinbos' ), 'ngn' => __( 'Naira to dollars', 'shopinbos' ) ] ] )
				. sib_tool_field( 'amount', __( 'Amount', 'shopinbos' ), 'number', [ 'value' => 100, 'min' => 0, 'step' => '0.01' ] )
				. sib_tool_field( 'rate', __( 'Naira for one dollar (your rate)', 'shopinbos' ), 'money', [ 'value' => 1500, 'min' => 0, 'step' => '0.01', 'help' => __( 'Type today’s rate from your bank, app or BDC. This tool does not fetch live rates.', 'shopinbos' ) ] )
				. sib_tool_field( 'buffer', __( 'Safety margin for rate changes', 'shopinbos' ), 'number', [ 'value' => 3, 'min' => 0, 'max' => 50, 'step' => '0.5', 'prefix' => '%' ] ),
				[ 'rate' => __( 'Rate used', 'shopinbos' ), 'converted' => __( 'At your rate', 'shopinbos' ), 'safe' => __( 'With the safety margin', 'shopinbos' ), 'note' => __( 'One dollar with the margin', 'shopinbos' ) ],
			];
		case 'slogan':
			return [
				sib_tool_field( 'name', __( 'Business name', 'shopinbos' ), 'text', [ 'value' => 'Tola Bags' ] )
				. sib_tool_field( 'what', __( 'What you sell', 'shopinbos' ), 'text', [ 'value' => 'bags' ] )
				. sib_tool_field( 'promise', __( 'What you promise (one or two words)', 'shopinbos' ), 'text', [ 'value' => 'quality', 'placeholder' => 'quality, fast delivery, fair prices' ] )
				. sib_tool_field( 'style', __( 'Style', 'shopinbos' ), 'select', [ 'options' => [ 'warm' => __( 'Warm and friendly', 'shopinbos' ), 'premium' => __( 'Premium', 'shopinbos' ), 'fun' => __( 'Fun and bold', 'shopinbos' ), 'local' => __( 'Proudly Nigerian', 'shopinbos' ) ] ] ),
				[ 'slogans' => __( 'Slogan ideas', 'shopinbos' ), 'tip' => __( 'Before you choose', 'shopinbos' ) ],
			];
	}
	return [ '', [] ];
}

/** Item rows for the invoice and receipt makers: description, quantity and unit price; tools.js adds and removes rows. */
function sib_tool_items(): string {
	$rows = [ [ 'Leather tote bag', 2, 28000 ], [ 'Gift wrapping', 1, 1500 ] ];
	$html = '';
	foreach ( $rows as [ $d, $q, $p ] ) {
		$html .= '<div class="sib-item" data-item>'
			. '<input class="input" name="i_desc" type="text" aria-label="' . esc_attr__( 'Item', 'shopinbos' ) . '" value="' . esc_attr( $d ) . '">'
			. '<input class="input" name="i_qty" type="number" inputmode="decimal" min="0" step="any" aria-label="' . esc_attr__( 'Quantity', 'shopinbos' ) . '" value="' . (int) $q . '">'
			. '<input class="input" name="i_price" type="number" inputmode="decimal" min="0" step="any" aria-label="' . esc_attr__( 'Price for one (₦)', 'shopinbos' ) . '" value="' . (int) $p . '">'
			. '<button type="button" class="sib-x" data-del-item aria-label="' . esc_attr__( 'Remove this item', 'shopinbos' ) . '">×</button></div>';
	}
	return '<div class="field sib-items-field"><span>' . esc_html__( 'Items', 'shopinbos' ) . '</span>'
		. '<div class="sib-items-head" aria-hidden="true"><span>' . esc_html__( 'Item', 'shopinbos' ) . '</span><span>' . esc_html__( 'Qty', 'shopinbos' ) . '</span><span>' . esc_html__( 'Price for one (₦)', 'shopinbos' ) . '</span><span></span></div>'
		. '<div class="sib-items" data-items>' . $html . '</div>'
		. '<button type="button" class="chip sib-add" data-add-item>+ ' . esc_html__( 'Add an item', 'shopinbos' ) . '</button></div>';
}

/** Tool names by key: the plugin's list plus the newer tools (lead emails and the app's lead source use them). */
function sib_tool_label( string $tool ): string {
	$more = [
		'invoice'         => __( 'Invoice generator', 'shopinbos' ),
		'receipt'         => __( 'Receipt generator', 'shopinbos' ),
		'vat'             => __( 'VAT calculator', 'shopinbos' ),
		'pos-charges'     => __( 'POS charges calculator', 'shopinbos' ),
		'delivery-fee'    => __( 'Delivery fee calculator', 'shopinbos' ),
		'markup'          => __( 'Markup calculator', 'shopinbos' ),
		'wholesale-price' => __( 'Wholesale price calculator', 'shopinbos' ),
		'caption'         => __( 'Instagram and TikTok caption generator', 'shopinbos' ),
		'qr-label'        => __( 'QR code and barcode label maker', 'shopinbos' ),
		'ajo'             => __( 'Ajo and thrift calculator', 'shopinbos' ),
		'naira-dollar'    => __( 'Naira and dollar converter', 'shopinbos' ),
		'slogan'          => __( 'Slogan generator', 'shopinbos' ),
	];
	return ( function_exists( 'sib_tools_list' ) ? sib_tools_list() : [] )[ $tool ] ?? $more[ $tool ] ?? '';
}

/**
 * How a tool's result shows: text rows (long answers, optionally with Copy and Share on WhatsApp), a printable
 * document (invoice, receipt, labels) and the sign-up button's words ('' = no button: nothing to save in the app).
 */
function sib_tool_spec( string $tool ): array {
	$save = __( 'Save this in Shopinbos', 'shopinbos' );
	$s    = [
		'business-name'       => [ 'text' => [ 'names', 'tip' ] ],
		'product-description' => [ 'text' => [ 'store', 'whatsapp', 'instagram' ], 'copy' => [ 'store', 'whatsapp', 'instagram' ] ],
		'invoice'             => [ 'doc' => 'invoice', 'cta' => __( 'Send invoices with a pay link in Shopinbos Business', 'shopinbos' ) ],
		'receipt'             => [ 'doc' => 'receipt', 'cta' => __( 'Send receipts with your logo in Shopinbos Business', 'shopinbos' ) ],
		'vat'                 => [ 'cta' => __( 'Add VAT at checkout in Shopinbos Business', 'shopinbos' ) ],
		'pos-charges'         => [ 'cta' => '' ],
		'delivery-fee'        => [ 'text' => [ 'list' ], 'copy' => [ 'list' ], 'share' => [ 'list' ], 'cta' => __( 'Set your own delivery prices in Shopinbos Business', 'shopinbos' ) ],
		'markup'              => [ 'text' => [ 'explain' ] ],
		'wholesale-price'     => [ 'text' => [ 'table' ], 'copy' => [ 'table' ], 'share' => [ 'table' ] ],
		'caption'             => [ 'text' => [ 'one', 'two', 'tiktok', 'tags' ], 'copy' => [ 'one', 'two', 'tiktok', 'tags' ], 'cta' => __( 'Let Peggy write captions in Shopinbos Business', 'shopinbos' ) ],
		'qr-label'            => [ 'doc' => 'labels', 'cta' => __( 'Print shipping labels with QR codes in Shopinbos Business', 'shopinbos' ) ],
		'ajo'                 => [ 'text' => [ 'schedule' ], 'copy' => [ 'schedule' ], 'share' => [ 'schedule' ], 'cta' => '' ],
		'naira-dollar'        => [ 'cta' => '' ],
		'slogan'              => [ 'text' => [ 'slogans', 'tip' ], 'copy' => [ 'slogans' ] ],
	];
	return ( $s[ $tool ] ?? [] ) + [ 'text' => [], 'copy' => [], 'share' => [], 'doc' => '', 'cta' => $save ];
}

/** Result rows for a tool. $v9: the V9 design's class names. */
function sib_tool_rows( string $tool, array $results, bool $v9 = false ): string {
	$spec = sib_tool_spec( $tool );
	$rows = '';
	foreach ( $results as $k => $label ) {
		if ( in_array( $k, $spec['text'], true ) ) {
			$btns  = in_array( $k, $spec['copy'], true ) ? '<button type="button" class="chip" data-copy-r="' . esc_attr( $k ) . '">' . esc_html__( 'Copy', 'shopinbos' ) . '</button>' : '';
			$btns .= in_array( $k, $spec['share'], true ) ? '<button type="button" class="chip" data-share-r="' . esc_attr( $k ) . '">' . esc_html__( 'Share on WhatsApp', 'shopinbos' ) . '</button>' : '';
			$rows .= '<div class="tool-text"><span class="' . ( $v9 ? 'k' : 'muted' ) . '">' . esc_html( $label ) . '</span><b data-r="' . esc_attr( $k ) . '">–</b>' . ( $btns ? '<span class="tool-btns">' . $btns . '</span>' : '' ) . '</div>';
		} else {
			$rows .= '<div class="kv"><span' . ( $v9 ? '' : ' class="muted"' ) . '>' . esc_html( $label ) . '</span><b data-r="' . esc_attr( $k ) . '">–</b></div>';
		}
	}
	return $rows;
}

/** Buttons under the result for the printable tools, and the document preview (shown under the form and result). */
function sib_tool_doc( string $tool, bool $v9 = false ): array {
	$doc = sib_tool_spec( $tool )['doc'];
	if ( ! $doc ) {
		return [ '', '' ];
	}
	$main  = $v9 ? 'btn b-wh' : 'btn btn-ink btn-s';
	$other = $v9 ? 'btn b-gh' : 'btn btn-ghost btn-s';
	if ( 'labels' === $doc ) {
		$btns = '<div class="sib-doc-btns"><button type="button" class="' . $main . '" data-print>' . esc_html__( 'Print labels', 'shopinbos' ) . '</button>'
			. '<button type="button" class="' . $other . '" data-download="qr">' . esc_html__( 'Download QR code', 'shopinbos' ) . '</button>'
			. '<button type="button" class="' . $other . '" data-download="bar">' . esc_html__( 'Download barcode', 'shopinbos' ) . '</button></div>';
		return [ '<div class="sib-label-preview" data-r-label></div>' . $btns, '' ];
	}
	$btns = '<div class="sib-doc-btns"><button type="button" class="' . $main . '" data-print>' . esc_html__( 'Print or save as PDF', 'shopinbos' ) . '</button>'
		. '<button type="button" class="' . $other . '" data-share-doc>' . esc_html__( 'Send on WhatsApp', 'shopinbos' ) . '</button>'
		. '<button type="button" class="' . $other . '" data-copy-doc>' . esc_html__( 'Copy as text', 'shopinbos' ) . '</button></div>';
	$prev = '<div class="sib-doc-wrap"><p class="' . ( $v9 ? 'k mutd' : 'eyebrow' ) . '">' . esc_html( 'invoice' === $doc ? __( 'Your invoice', 'shopinbos' ) : __( 'Your receipt', 'shopinbos' ) ) . '</p><div class="sib-doc" data-r-doc data-doc="' . esc_attr( $doc ) . '"></div></div>';
	return [ $btns, $prev ];
}

function sib_render_tool( array $a ): string {
	$tool = $a['tool'] ?: ( get_post() ? (string) get_post_meta( get_the_ID(), 'sib_tool', true ) : '' );
	[ $fields, $results ] = sib_tool_markup( $tool );
	if ( ! $fields ) {
		return is_admin() || wp_is_json_request() ? '<p>' . esc_html__( 'Pick a tool in the block settings.', 'shopinbos' ) . '</p>' : '';
	}
	wp_enqueue_script( 'sib-tools' );
	if ( in_array( $tool, [ 'whatsapp-link', 'qr-label' ], true ) ) {
		wp_enqueue_script( 'sib-qrcode' );
	}
	$rows  = sib_tool_rows( $tool, $results );
	$spec  = sib_tool_spec( $tool );
	[ $docbtns, $preview ] = sib_tool_doc( $tool );
	$extra = 'whatsapp-link' === $tool
		? '<div data-r-qr style="display:flex;justify-content:center;padding:12px;background:#fff;border-radius:16px"></div><div class="row wrapflex"><button type="button" class="btn btn-ink btn-s" data-copy>' . esc_html__( 'Copy link', 'shopinbos' ) . '</button><button type="button" class="btn btn-ghost btn-s" data-download-qr>' . esc_html__( 'Download QR', 'shopinbos' ) . '</button></div>'
		: $docbtns;
	return '<div class="tool card split split-top" data-sib-tool="' . esc_attr( $tool ) . '">'
		. '<form class="col" onsubmit="return false" novalidate>' . $fields . '</form>'
		. '<div class="tool-out col" aria-live="polite"><p class="eyebrow">' . esc_html__( 'Your result', 'shopinbos' ) . '</p><div>' . $rows . '</div>' . $extra
		. '<div class="tool-cta col" style="gap:10px;margin-top:8px">' . ( $spec['cta'] ? '<a class="btn btn-acc btn-block" href="' . esc_url( sib_go_url( 'tool_result', [ 'tool' => $tool ] ) ) . '">' . esc_html( $spec['cta'] ) . '</a>' : '' )
		. sib_render_lead_form( [ 'kind' => 'tool', 'heading' => __( 'Or email me the result', 'shopinbos' ), 'tool' => $tool ] ) . '</div></div>' . ( $preview ? '<div style="grid-column:1/-1;flex-basis:100%">' . $preview . '</div>' : '' ) . '</div>';
}
