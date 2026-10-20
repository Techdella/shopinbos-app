<?php
/**
 * Seed content: the help centre's topics and the popular articles from the design canvas.
 * Built from the article blocks so writers can edit every word.
 */

defined( 'ABSPATH' ) || exit;

/** Help topics on the help centre home: [name, slug, description]. */
function sib_seed_help_topics(): array {
	return [
		[ 'Getting started', 'getting-started', 'Create your shop, add products, go live' ],
		[ 'Orders', 'orders', 'New orders, invoices, cancellations' ],
		[ 'Payments and payouts', 'payments-and-payouts', 'Paystack, transfers, Friday payouts' ],
		[ 'Delivery and pay on delivery', 'delivery-and-pay-on-delivery', 'Riders, codes, cash, returns' ],
		[ 'Your store and design', 'store-and-design', 'Templates, logo, domain' ],
		[ 'WhatsApp and social', 'whatsapp-and-social', 'Catalogue, Instagram, TikTok, ads' ],
		[ 'Find stock and dropship', 'sourcing-and-dropshipping', 'Suppliers, quotes, imports' ],
		[ 'Account and security', 'account-and-security', 'Sign-in codes, staff, closing an account' ],
	];
}

/** Popular articles: [slug, title, topic slug, summary, content]. */
function sib_seed_help_articles(): array {
	$b = 'sib_seed_b';
	$p = 'sib_seed_p';
	$h = 'sib_seed_h2';
	return [
		[ 'how-pay-on-delivery-works', 'How pay on delivery works, step by step', 'delivery-and-pay-on-delivery', 'Customers pay the rider when the parcel arrives, confirmed with a 4-digit code.',
			$p( 'Pay on delivery lets customers pay the rider when the parcel arrives. Shopinbos gives each order a 4-digit code, so the rider can only mark it delivered when the customer is happy.' )
			. $b( 'callout', [ 'kind' => 'note', 'title' => 'Who can use it', 'text' => 'Shops on the Growth and Pro plans, for orders up to ₦50,000, in Lagos, Abuja, Ibadan and Port Harcourt. Your delivery partner must also accept pay on delivery. More cities are coming.' ] )
			. $h( 'Turn on pay on delivery' )
			. $b( 'steps', [ 'title' => 'In the Shopinbos app', 'items' => "Open Settings, then Payments | Tap the gear at the bottom of your Home screen.\nSwitch on Pay on delivery | Choose the most a customer can order with pay on delivery, up to ₦50,000.\nPick your riders | Choose Shopinbos Riders or the delivery companies you trust.\nSave | Your checkout now shows “Pay when it arrives”." ] )
			. $h( 'What happens on delivery day' )
			. $b( 'checklist', [ 'title' => 'The rider will', 'items' => "Call the customer before arriving\nLet the customer check the item\nAsk for the 4-digit code\nCollect cash or a transfer, then confirm in the app" ] )
			. $b( 'callout', [ 'kind' => 'warn', 'title' => 'Never share the code yourself', 'text' => 'Only the customer should give the code to the rider. If you share it, the order can be marked delivered before the customer has the item.' ] )
			. $b( 'faq', [ 'title' => 'Common questions', 'items' => "When do I get the cash? | The cash belongs to you, not the rider or Shopinbos. Riders pass it on by 6pm the same day: they pay it in the app, which sends it straight to your bank, or hand it to you and you confirm it.\nWhat if the customer refuses the parcel? | The rider brings it back to you. You only pay the return delivery fee, and the order is marked “Refused”." ] ) ],

		[ 'create-your-shop', 'Create your shop in 5 minutes', 'getting-started', 'Sign up with your phone, tell Rex what you sell and share your link.',
			$p( 'You can have a working shop, with payments and delivery, in about five minutes from your phone.' )
			. $b( 'steps', [ 'title' => 'In the Shopinbos app', 'items' => "Sign up with your phone | We send a code on WhatsApp. No password, no card.\nTell Rex what you sell | He builds your store, logo and colours with you.\nAdd your products | Snap photos, or pick products from suppliers in Find stock.\nShare your link | Put it on WhatsApp Status, Instagram and TikTok." ] )
			. $b( 'callout', [ 'kind' => 'tip', 'title' => 'Start small', 'text' => 'Five good products with clear photos sell better than fifty rushed ones. You can add more any time.' ] ) ],

		[ 'cancel-or-refund-an-order', 'Cancel or refund an order', 'orders', 'Cancel an order before it ships, or refund a customer in full or in part.',
			$p( 'If a customer changes their mind or you can’t fulfil an order, you can cancel it or refund them from the order screen.' )
			. $b( 'steps', [ 'title' => 'In the Shopinbos app', 'items' => "Open Orders | Tap the order.\nTap More, then Cancel or Refund | Choose a full or part refund.\nAdd a reason | The customer gets a message with the reason and the amount." ] )
			. $b( 'callout', [ 'kind' => 'note', 'title' => 'Where the money goes', 'text' => 'Card, transfer and USSD refunds go back the way the customer paid, usually within 3 to 5 working days. Pay on delivery orders that were not paid have nothing to refund.' ] ) ],

		[ 'when-will-i-get-my-money', 'When will I get my money?', 'payments-and-payouts', 'Every Friday, to your bank account. You can also withdraw early.',
			$p( 'Every payment, whether by card, transfer, USSD or pay on delivery, lands in your Shopinbos balance. Your balance is paid to your bank account every Friday.' )
			. $b( 'steps', [ 'title' => 'How money moves', 'items' => "Customer pays | By card, transfer or USSD at checkout, or cash to the rider.\nIt shows in your balance | Online payments straight away; pay on delivery cash the same evening.\nFriday payout | Your balance goes to your bank account every Friday." ] )
			. $b( 'callout', [ 'kind' => 'tip', 'title' => 'Need it sooner?', 'text' => 'Tap Withdraw on the Money screen to send your balance to your bank any day.' ] )
			. $b( 'faq', [ 'title' => 'Common questions', 'items' => "Is there a minimum payout? | No. Whatever is in your balance on Friday is paid out.\nWhere do I change my bank account? | Settings, then Payouts. For your safety, we confirm the change with a code." ] ) ],

		[ 'connect-your-own-domain', 'Connect your own domain name', 'store-and-design', 'Use a domain you own, like yourshop.com, with free SSL.',
			$p( 'Your store works at yourname.mybos.store for free. On a paid plan you can also use a domain you own, like yourshop.com.ng.' )
			. $b( 'steps', [ 'title' => 'In the Shopinbos app', 'items' => "Open Store, then Domain | You will see your free mybos.store address.\nTap Connect a domain | Type the domain you own.\nAdd the records we show you | Copy them into your domain company’s settings (for example Whogohost or Namecheap).\nWait for the green tick | Usually within an hour. Your free SSL is set up for you." ] )
			. $b( 'callout', [ 'kind' => 'note', 'title' => 'Don’t have a domain yet?', 'text' => 'You can buy one from inside the app and it connects by itself.' ] ) ],

		[ 'add-your-whatsapp-business-catalogue', 'Add your WhatsApp Business catalogue', 'whatsapp-and-social', 'Show your Shopinbos products in your WhatsApp catalogue, kept in sync.',
			$p( 'Your WhatsApp Business catalogue can show the same products, prices and stock as your Shopinbos store, so you only update them in one place.' )
			. $b( 'steps', [ 'title' => 'In the Shopinbos app', 'items' => "Open Channels, then WhatsApp | Connect your WhatsApp Business number.\nTurn on Catalogue sync | Pick the products to show.\nCheck WhatsApp | Your catalogue updates within a few minutes." ] )
			. $b( 'callout', [ 'kind' => 'tip', 'title' => 'Sold out?', 'text' => 'When a product sells out in your store, it shows as unavailable in your catalogue too.' ] ) ],

		[ 'customer-refused-the-parcel', 'A customer refused the parcel at the gate', 'delivery-and-pay-on-delivery', 'What happens to the parcel, the delivery fee and the order.',
			$p( 'Sometimes a customer changes their mind when the rider arrives. Here is what happens next.' )
			. $b( 'checklist', [ 'title' => 'What happens', 'items' => "The rider marks the order “Refused” in the app\nThe parcel comes back to you or your supplier\nYou pay only the return delivery fee\nThe customer is noted, so you can ask for payment first next time" ] )
			. $b( 'callout', [ 'kind' => 'tip', 'title' => 'Fewer refusals', 'text' => 'Confirm the order on WhatsApp before you book the rider, and send clear photos and sizes. Peggy can do the confirming for you.' ] ) ],

		[ 'change-your-store-colours-and-logo', 'Change your store colours and logo', 'store-and-design', 'Update your logo, colours and fonts in a few taps, or ask Rex.',
			$p( 'You can change how your store looks at any time without losing your products.' )
			. $b( 'steps', [ 'title' => 'In the Shopinbos app', 'items' => "Open Store, then Design | You will see your template and colours.\nTap Logo or Colours | Upload a logo, or pick colours from your logo.\nPublish | Your store updates straight away." ] )
			. $b( 'callout', [ 'kind' => 'note', 'title' => 'Ask Rex', 'text' => 'Type what you want, like “make it feel premium with gold buttons”, and Rex makes the change for you to check.' ] ) ],

		[ 'add-a-staff-member', 'Add a staff member', 'account-and-security', 'Give helpers their own sign-in, with only the access they need.',
			$p( 'Staff get their own sign-in, so you never share your password and you can see who did what.' )
			. $b( 'steps', [ 'title' => 'In the Shopinbos app', 'items' => "Open Settings, then Staff | Tap Add staff.\nType their phone number | They get a code on WhatsApp to sign in.\nChoose what they can do | For example orders and chats, but not payouts." ] )
			. $b( 'callout', [ 'kind' => 'warn', 'title' => 'When someone leaves', 'text' => 'Remove them from Staff the same day. Their access stops at once.' ] ) ],

		[ 'request-a-quote-from-a-supplier', 'Request a quote from a supplier', 'sourcing-and-dropshipping', 'Ask a supplier for a wholesale price on a larger order.',
			$p( 'For larger orders, ask the supplier for a quote. You agree the price in the app before you pay.' )
			. $b( 'steps', [ 'title' => 'In the Shopinbos app', 'items' => "Open Find stock | Find the product you want.\nTap Buy wholesale, then Ask for a quote | Add how many you want and when you need them.\nCompare and accept | The supplier replies in the app, usually within a day." ] )
			. $b( 'callout', [ 'kind' => 'note', 'title' => 'Paid safely', 'text' => 'Your money is held until the goods are delivered, then the supplier is paid.' ] ) ],
	];
}
