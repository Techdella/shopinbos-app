<?php
/**
 * Seed content: the help centre's topics and articles (how to use Shopinbos Business, the supplier screens and the
 * delivery partner screens). Button and screen names are the app's own words (shared/i18n/messages in the app repo).
 * Built from the article blocks so writers can edit every word. Pictures are illustrations of the app's screens
 * (seed/help-img/*.webp, made from the app's strings and colours, with example names and amounts) and are copied into
 * the media library once.
 */

defined( 'ABSPATH' ) || exit;

/** Help topics: [name, slug, description]. Slugs are kept from the first help centre so old links keep working. */
function sib_seed_help_topics(): array {
	return [
		[ 'Getting started', 'getting-started', 'Create your shop, add products, go live' ],
		[ 'Payments and money', 'payments-and-payouts', 'Payouts, fees, payment links and refunds' ],
		[ 'Delivery', 'delivery-and-pay-on-delivery', 'Delivery partners, labels, tracking, pay on delivery' ],
		[ 'Inbox and channels', 'whatsapp-and-social', 'WhatsApp, Instagram, Facebook, your shop link' ],
		[ 'Find stock and dropship', 'sourcing-and-dropshipping', 'Suppliers, quotes, wholesale and imports' ],
		[ 'Rex and Peggy', 'rex-and-peggy', 'AI credits, Peggy chatbot, Rex Studio' ],
		[ 'Domain and store design', 'store-and-design', 'Shop looks, logo and colours, your domain' ],
		[ 'Account and security', 'account-and-security', 'Logging in, staff, logging out' ],
		[ 'Products', 'products', 'Adding products, sizes, stock' ],
		[ 'Orders', 'orders', 'Sending, recording and refunding orders' ],
		[ 'Marketing', 'marketing-and-ads', 'Discounts, link in bio, posts, ads, affiliates' ],
		[ 'Plans and billing', 'plans-and-billing', 'Free, Starter, Growth and Pro' ],
		[ 'Suppliers', 'supplier-getting-started', 'For businesses that supply shops' ],
		[ 'Delivery partners', 'delivery-partner-getting-started', 'For delivery companies and riders' ],
	];
}

/** Articles shown under "Popular questions" on the help centre home, in order. */
function sib_seed_help_popular(): array {
	return [ 'when-will-i-get-my-money', 'how-pay-on-delivery-works', 'connect-whatsapp-facebook-and-instagram', 'book-a-rider-for-an-order', 'connect-your-own-domain', 'what-are-ai-credits', 'add-a-dropship-product', 'cancel-or-refund-an-order' ];
}

/**
 * A picture from seed/help-img, as an image block. Copied into the media library the first time (WP-CLI setup only),
 * so writers can swap it there. Returns '' when it can't be copied.
 */
function sib_seed_help_img( string $file, string $alt, string $caption = '' ): string {
	$path = __DIR__ . '/help-img/' . $file . '.webp';
	if ( ! file_exists( $path ) ) {
		return '';
	}
	$key   = 'help-img:' . $file . ':' . md5_file( $path );
	$found = get_posts( [ 'post_type' => 'attachment', 'post_status' => 'any', 'meta_key' => '_sib_source', 'meta_value' => $key, 'numberposts' => 1, 'fields' => 'ids' ] ); // phpcs:ignore WordPress.DB.SlowDBQuery
	$id    = $found ? (int) $found[0] : 0;
	if ( ! $id ) {
		if ( ! defined( 'WP_CLI' ) || ! WP_CLI ) {
			return '';
		}
		require_once ABSPATH . 'wp-admin/includes/file.php';
		require_once ABSPATH . 'wp-admin/includes/media.php';
		require_once ABSPATH . 'wp-admin/includes/image.php';
		$tmp = wp_tempnam( 'help-' . $file . '.webp' );
		copy( $path, $tmp );
		$id = media_handle_sideload( [ 'name' => 'help-' . $file . '.webp', 'tmp_name' => $tmp ], 0, $alt );
		if ( is_wp_error( $id ) ) {
			return '';
		}
		update_post_meta( $id, '_sib_source', $key );
		update_post_meta( $id, '_wp_attachment_image_alt', $alt );
	}
	$url = wp_get_attachment_url( $id );
	if ( ! $url ) {
		return '';
	}
	$cap = $caption ? '<figcaption class="wp-element-caption">' . esc_html( $caption ) . '</figcaption>' : '';
	return '<!-- wp:image {"id":' . $id . ',"sizeSlug":"full","linkDestination":"none","className":"help-shot"} -->' . "\n"
		. '<figure class="wp-block-image size-full help-shot"><img src="' . esc_url( $url ) . '" alt="' . esc_attr( $alt ) . '" class="wp-image-' . $id . '"/>' . $cap . '</figure>' . "\n"
		. "<!-- /wp:image -->\n\n";
}

/** Articles: [slug, title, topic slug, summary, content]. */
function sib_seed_help_articles(): array {
	$b = 'sib_seed_b';
	$p = 'sib_seed_p';
	$h = 'sib_seed_h2';
	$i = 'sib_seed_help_img';
	// Steps: "Heading | description" per line.
	$s = fn( string $items, string $title = 'In the Shopinbos Business app' ) => sib_seed_b( 'steps', [ 'title' => $title, 'items' => $items ] );
	$tip  = fn( string $text, string $title = '' ) => sib_seed_b( 'callout', [ 'kind' => 'tip', 'title' => $title, 'text' => $text ] );
	$note = fn( string $text, string $title = '' ) => sib_seed_b( 'callout', [ 'kind' => 'note', 'title' => $title, 'text' => $text ] );
	$warn = fn( string $text, string $title = '' ) => sib_seed_b( 'callout', [ 'kind' => 'warn', 'title' => $title, 'text' => $text ] );
	$faq  = fn( string $items ) => sib_seed_b( 'faq', [ 'title' => 'Common questions', 'items' => $items ] );

	return [
		/* ---------- Getting started ---------- */
		[ 'create-your-shop', 'Create your shop in 5 minutes', 'getting-started', 'Sign up with your phone, tell Rex what you sell, add a product and put your shop live.',
			$p( 'You can have a working shop, with payments and delivery, from your phone in a few minutes. Here is the whole journey. Each step has its own article if you want more detail.' )
			. $i( 'go-live', 'The last setup step, Getting paid and delivering, and the screen that says your shop is open' )
			. $s( "Sign up with your phone | Open Shopinbos Business, tap Start with my phone number and type the code we send you on WhatsApp. No password.\nTell Rex what you sell | Rex makes a shop name, colours and a look for you. Change anything.\nAdd your first products | Snap photos, import a spreadsheet, or pick products from suppliers. One is enough to go live.\nChoose how you get paid | Bank transfer, Card and USSD, and the other ways in Getting paid and delivering.\nTap Put my shop live | Then share your link on your WhatsApp Status." )
			. $tip( 'Five good products with clear photos sell better than fifty rushed ones. You can add more any time.', 'Start small' ) ],

		[ 'sign-up-for-shopinbos-business', 'Sign up for Shopinbos Business', 'getting-started', 'Create your account with your phone number and a code. No password to remember.',
			$p( 'Shopinbos Business is the app you run your shop from. You sign up with your phone number and a 6-digit code, so there is no password to remember.' )
			. $i( 'signup', 'The welcome screen with Start with my phone number, and the Check your WhatsApp code screen' )
			. $s( "Open the app and tap Start with my phone number | Already have a shop? Tap I already have a shop instead.\nPick what you do | Choose Seller. Suppliers and delivery partners pick their own card.\nType your name and phone number | Use the number you have WhatsApp on.\nTap Send me a code on WhatsApp | No WhatsApp on this number? Tap Send it by SMS.\nType the code and tap Verify | You can also copy it and tap Paste code." )
			. $faq( "Can I sign up with email instead? | Yes. Tap Use email instead and we email you a code. You can also continue with Google.\nIt says the number already has an account | Log in instead. You don't need to sign up again.\nCan I use the same number for a supplier account? | Each account is for one kind of business. Use a different number or email for your supplier or delivery business." ) ],

		[ 'set-up-your-shop-with-rex', 'Set up your shop with Rex', 'getting-started', 'Tell Rex what you sell and he builds your brand, colours and shop look with you.',
			$p( 'Rex is the AI that builds your shop. After you sign up, he asks a few questions and makes a brand for you. You can change every word and colour.' )
			. $i( 'rex-setup', 'Tell Rex what you sell, then I made a brand for you. Change anything.' )
			. $s( "Tell Rex what you sell | Type it in your own words, like “Ankara fabrics and ready-made gowns”.\nPick where you are starting from | I have products, Find me products (dropship or import), or Services or digital.\nCheck your brand | Rex suggests a shop name and colours. Tap Type my own to change the name.\nAsk for changes | Type something like “make it warmer, use green” in Ask Rex to change the design.\nTap Looks good | Your shop address, like yourname.mybos.store, is saved with your name." )
			. $note( 'Setting up your store with Rex uses AI credits from your plan. Every plan includes some each month.', 'AI credits' ) ],

		[ 'put-your-shop-live', 'Put your shop live and share it', 'getting-started', 'Choose how customers pay, tap Put my shop live and share your link.',
			$p( 'The last setup step is Getting paid and delivering. Once your shop is live, your link works and customers can order.' )
			. $s( "Choose how customers can pay | Bank transfer, Card and USSD, Pay on delivery (Growth and Pro) and Finish on WhatsApp.\nAdd your payout bank | Tap Add bank now, or Later. It stays on your checklist.\nTap Put my shop live | If your plan has a fee, you pay it on Paystack next.\nShare your link | Tap Share on WhatsApp, Instagram bio or QR poster." )
			. $tip( 'Share it on your WhatsApp Status first. That’s where your customers are.', 'Your first orders' )
			. $faq( "Where is my checklist? | Start here shows what's left. Each step ticks itself off when it's done, and you can skip the optional ones.\nCan I change things after going live? | Yes. Products, prices, colours and delivery can all change any time." ) ],

		[ 'find-your-way-around-the-app', 'Find your way around the app', 'getting-started', 'Home, Orders, the orange +, Chats and Menu: what each one does.',
			$p( 'Shopinbos Business has four tabs and an orange + button at the bottom of the screen.' )
			. $i( 'app-tour', 'The Home tab with today’s sales and Do these next, and the Menu with the main tools' )
			. $s( "Home | What you sold today and Do these next, the things that need you.\nOrders | Every order, with filters like To send, Not paid and On the way.\n+ (Add or sell) | Add a product, Record a sale, Get more customers or Share my shop.\nChats | Customer messages from WhatsApp, Instagram, Facebook and your shop's live chat.\nMenu | Everything else: Products, Find stock, Delivery, Payouts, Settings and more. Use the search at the top to find a tool.", 'The tabs' )
			. $note( 'On a computer, log in at app.shopinbos.com. The same tools are in the menu on the left, and some, like the full store builder, are easier on a bigger screen.', 'On a computer' ) ],

		/* ---------- Products ---------- */
		[ 'add-a-product-from-photos', 'Add products from photos or a spreadsheet', 'products', 'Snap a photo and Rex writes the name, price and description, or import a CSV or Excel file.',
			$p( 'There are three ways to add products. Pick whichever is quickest for you.' )
			. $i( 'first-products', 'Add your first products with three choices: Snap photos, Import from a CSV or Excel file, Pick from suppliers' )
			. $s( "Tap the orange + and Add a product | Or open Menu, then Products.\nSnap photos | Rex names each product, suggests a price and writes the description. You check them before anything goes live.\nOr import a file | Choose Import from a CSV or Excel file. Rex matches the columns and flags anything missing, like prices or photos.\nOr pick from suppliers | Products from suppliers appear in your shop at your price. See Add a dropship product.\nCheck and save | Fix anything Rex got wrong, then show the product to customers." )
			. $tip( 'Bright photos on a plain background sell faster. Daylight near a window works well.', 'Better photos' ) ],

		[ 'sizes-colours-and-stock', 'Sizes, colours and stock', 'products', 'Add variants, keep your stock numbers right and stop selling what has run out.',
			$p( 'Variants are versions of one product, like sizes or colours. Each can have its own stock and price. When stock runs out, the product shows as sold out.' )
			. $s( "Open the product | Menu, then Products, then tap it.\nAdd sizes or colours | One dress in S, M and L, in red and green, is six variants.\nSet how many you have | Type the stock for each one. Sales take it down by themselves.\nGive it a code (optional) | A short product code, like DRS3, helps you find it fast when you record a sale." )
			. $note( 'Record sales you make on WhatsApp or at your stall too (the orange +, then Record a sale), so your stock stays right.', 'Keep stock right' ) ],

		[ 'group-products-into-collections', 'Group products into collections', 'products', 'Make shelves like “New arrivals” or “Under ₦10,000” on your shop.',
			$p( 'Collections are groups of products shown together on your shop, like a shelf.' )
			. $s( "Open Menu, then Store pages | Tap the Collections tab.\nTap New collection | Give it a name, like New arrivals.\nAdd products | Tap Add a product for each one.\nTap Create collection | Change the pictures and order on the web if you want." ) ],

		/* ---------- Orders ---------- */
		[ 'send-an-order', 'Send an order: pack it, get a rider, mark it delivered', 'orders', 'What to do when a new order comes in, from packing to delivered.',
			$p( 'New orders show in the Orders tab under Needs action. Open one to see who bought what, how they paid and what to do next.' )
			. $i( 'orders', 'The Orders tab with the To send filter, and an order with Get a rider, I sent it myself and Print a label' )
			. $s( "Open Orders and tap To send | These are paid orders waiting to go.\nOpen the order and pack it | Check the items and the address.\nTap Get a rider | Your delivery partner picks it up. Or tap I sent it myself.\nPrint a label | Stick it on the parcel. See Print a shipping label.\nTap It was delivered | When the customer has it. Partner deliveries update by themselves." )
			. $faq( "The customer will pick it up | Tap It’s ready, tell the customer, then Customer has collected it when they come.\nWhere do I see the rider’s code? | On the order, under the rider’s name. Only hand the parcel over if the rider gives you that code." ) ],

		[ 'record-a-sale', 'Record a sale from WhatsApp or your stall', 'orders', 'Add a sale you made in person or in a chat, so your stock and totals stay right.',
			$p( 'Sold something at your stall, on the phone or on WhatsApp? Record it. It is added to today’s sales and taken off your stock.' )
			. $i( 'record-sale', 'The orange + menu with Record a sale, and the How did they pay? step' )
			. $s( "Tap the orange + and Record a sale | Or Orders, then Record a sale.\nWhat did they buy? | Tap a product, find it by code, or type something new.\nHow did they pay? | Bank transfer, Cash, POS or card, or Not paid yet.\nWho bought it? | Their name, and their phone or WhatsApp if you want.\nTap Save sale | You can then see the order, send it or print a label." ) ],

		[ 'mark-an-order-as-paid', 'Mark an order as paid, or remind the customer', 'orders', 'For orders paid to you directly, and customers who haven’t paid yet.',
			$p( 'Orders paid at checkout are marked paid for you. If a customer paid you directly, or hasn’t paid yet, you can do it from the order.' )
			. $i( 'record-paid', 'An unpaid order with How did they pay?, They paid. Mark as paid, and Remind them on WhatsApp' )
			. $s( "Open the order | Orders, then Not paid.\nIf they paid you | Pick Transfer, Cash or POS and tap They paid. Mark as paid.\nIf they haven't | Tap Not paid yet? Remind them on WhatsApp. We write the message for you." )
			. $note( 'Unpaid bank transfer orders are cancelled after the time to pay, and the items go back into stock. Change the time in Payments and payouts, under Time to pay by transfer.', 'Time to pay' ) ],

		[ 'cancel-or-refund-an-order', 'Cancel or refund an order', 'orders', 'Cancel an order before it ships, or cancel and refund the customer.',
			$p( 'If a customer changes their mind or you can’t send an order, cancel it from the order screen.' )
			. $i( 'refund', 'The Cancel and refund the customer? message with Yes, cancel and refund' )
			. $s( "Open the order | Orders, then tap it.\nNot paid? Tap Cancel this order | The customer isn't charged and the order moves to Cancelled.\nPaid? Tap Cancel and refund the customer | Then Yes, cancel and refund." )
			. $note( 'Card payments made at checkout go back the way the customer paid. If they paid you directly by transfer or cash, you send the money back yourself.', 'Where the money goes' )
			. $faq( "Can I keep the order after all? | Yes. Tap Keep the order or Keep it on the message.\nA dropship supplier can’t send it | You can Find another supplier, or Cancel and refund the customer. See How a dropship order works." ) ],

		/* ---------- Payments and money ---------- */
		[ 'when-will-i-get-my-money', 'When will I get my money?', 'payments-and-payouts', 'Paid out to your bank account through Paystack, usually within a few working days.',
			$p( 'Card and online payments are paid out to your bank account through Paystack, usually within a few working days. Paystack’s fee and your plan’s fee come off each payment.' )
			. $s( "Customer pays | By card, transfer or USSD at checkout or with a payment link.\nThe payment is confirmed | You see it in the order, with no screenshots needed.\nPaid out to your bank | Paystack pays it to the bank in your Shopinbos Wallet.\nFollow it in Money | Menu, then Money, shows what is coming to your bank and what was paid.", 'How money moves' )
			. $faq( "Where do I see each payment? | Menu, then Payouts: every paid order and where the money for it went.\nIs there a minimum payout? | No. Every confirmed payment is paid out, whatever the amount.\nI was paid by cash or transfer to my own account | That money is already with you. It shows in Payouts as Collected yourself.\nCan I take money out of my Wallet balance? | No. The Wallet balance is for AI credits and other Shopinbos services. Your sales are paid out to your bank." ) ],

		[ 'add-your-payout-bank', 'Add your payout bank and verify your ID', 'payments-and-payouts', 'Set up your Shopinbos Wallet so card payments are paid out to your bank.',
			$p( 'Your Shopinbos Wallet is where you tell us your bank. Until it is set up, customers can still pay by bank transfer or on delivery.' )
			. $i( 'payout-bank', 'Your account number, then Is this your account? with Yes, save this account' )
			. $s( "Open Menu, then Payments and payouts | Tap Add payout bank.\nChoose your bank and type your account number | 10 digits.\nTap Check account | Your bank tells us the account name.\nTap Yes, save this account | Paystack checks the account. It shows Connected when it's ready." )
			. $h( 'Verify your ID' )
			. $p( 'Checking your NIN or BVN earns your shop a verified badge and approves an account in your name.' )
			. $i( 'wallet', 'The Shopinbos Wallet with Verify your ID, a NIN field and Verify my ID' )
			. $s( "Open Menu, then Money | Tap Verify now, or 2. Verify your ID.\nType your NIN or BVN | 11 digits, with your name and date of birth.\nAgree to the check and tap Verify my ID | We check it with the official records." )
			. $warn( 'If the bank account isn’t in your name or your business’s, our team checks it first (usually within a day). We tell you when payments start going to it.', 'Someone else’s account' ) ],

		[ 'ways-customers-can-pay', 'Ways customers can pay', 'payments-and-payouts', 'Bank transfer, card and USSD, pay on delivery and finishing on WhatsApp.',
			$p( 'You choose which ways to pay show at your checkout. Keep at least one on.' )
			. $i( 'pay-methods', 'Payments and payouts with Ways customers can pay switched on and off' )
			. $s( "Open Menu, then Payments and payouts | Scroll to Ways customers can pay.\nSwitch each one on or off | Bank transfer, Card and USSD, Pay on delivery, Finish on WhatsApp.\nSet the time to pay by transfer | Unpaid transfer orders are cancelled after this time." )
			. $faq( "Bank transfer doesn’t show at checkout | It shows once your payout bank is checked. Each order gets its own account number and the payment is confirmed for you.\nPay on delivery doesn’t show | It is on the Growth and Pro plans, for orders up to ₦50,000 in places your delivery partners cover, once they turn it on too.\nWhat is Finish on WhatsApp? | Customers can send their order to you on WhatsApp and pay there, for example with a payment link." ) ],

		[ 'fees-on-each-sale', 'What each sale costs: fees explained', 'payments-and-payouts', 'Your plan’s fee per online sale, plus Paystack’s fee. VAT is added where it applies.',
			$p( 'Shopinbos takes a small fee on each sale paid online in your store. The fee depends on your plan. Paystack also takes its own card and transfer fee. Both come off the payment before it is paid out to you.' )
			. $b( 'stats', [ 'title' => 'Fee on each store sale', 'items' => "3% | Free\n2% | Starter\n1% | Growth\n0.5% | Pro", 'foot' => 'From the Shopinbos plans. VAT is added where it applies.', 'tone' => 'light' ] )
			. $faq( "Is there a fee on cash sales I record? | No. Sales you record yourself (cash, POS, transfer to your own account) were never paid through Shopinbos.\nWhere do I see the fee? | Each payment in Money shows the amount, the fee and what reached you.\nHow do I pay less? | A paid plan lowers the fee. See Shopinbos plans and fees." ) ],

		[ 'send-a-payment-link', 'Send a payment link in a chat', 'payments-and-payouts', 'Make a link for exact products, send it on WhatsApp, and the order shows in Orders when they pay.',
			$p( 'A payment link is a page your customer opens from a chat. They choose delivery and pay. The order lands in Orders.' )
			. $i( 'payment-link', 'New payment link with a product and One customer only, then Your link is ready' )
			. $s( "Open Menu, then Payment links | Tap New payment link.\nAdd products | Pick them and set How many.\nChoose One customer only or not | One-time links close once paid. Turn it off to reuse the link in your bio or Status.\nPick how long it works | From 1 hour to No end date. More options lets you set an agreed price and a note.\nTap Make link, then Send on WhatsApp | You get a notification when they pay." )
			. $note( 'Peggy can also make payment links for you, and for customers in a chat.', 'Ask Peggy' ) ],

		/* ---------- Delivery ---------- */
		[ 'how-pay-on-delivery-works', 'How pay on delivery works, step by step', 'delivery-and-pay-on-delivery', 'The customer pays the shop at the door, then gives the rider a 4-digit code.',
			$p( 'Pay on delivery lets customers pay when the parcel reaches them. They pay your shop, not the rider: with the link we text them or the rider’s QR code. Then they read the rider a 4-digit delivery code, and only then does the rider hand over the parcel.' )
			. $note( 'On the Growth and Pro plans, for orders up to ₦50,000, in places your delivery partners cover. Your delivery partner must turn it on too.', 'Who can use it' )
			. $h( 'Turn it on' )
			. $s( "Open Menu, then Delivery | Tap one of My delivery partners, then Delivery settings.\nTurn on pay on delivery | It shows at checkout once the partner turns it on too.\nCheck Payments and payouts | Pay on delivery should be on under Ways customers can pay." )
			. $h( 'What happens at the door' )
			. $i( 'pod', 'The rider’s screen: the customer pays at the door with a QR code, then gives the 4-digit customer code' )
			. $s( "The rider arrives | The customer is asked to pay the order amount.\nThe customer pays the shop | With the link we sent them, or by scanning the rider's QR code.\nThey get a code | A 4-digit delivery code on their WhatsApp.\nThe rider types the code | When it is correct, they hand over the parcel.", 'At the door' )
			. $warn( 'Never share the delivery code yourself. Only the customer should give it to the rider, once they have paid and checked the parcel.', 'Keep the code with the customer' )
			. $faq( "What if the customer won't pay? | The rider brings the parcel back as you agreed with the delivery partner. See A customer refused the parcel.\nWhen do I get the money? | It is paid out to your bank through Paystack like any other online payment." ) ],

		[ 'customer-refused-the-parcel', 'A customer refused the parcel at the door', 'delivery-and-pay-on-delivery', 'What happens to the parcel, the delivery fee and the order.',
			$p( 'Sometimes a customer changes their mind when the rider arrives. Here is what happens next.' )
			. $b( 'checklist', [ 'title' => 'What happens', 'items' => "The rider tells their company in the app: Customer refused it\nYou see it on the order and in delivery problems\nThe parcel comes back to you\nThe partner’s return fee (Return to sender on their rate card) applies", 'interactive' => false ] )
			. $tip( 'Confirm the order on WhatsApp before you book the rider, and send clear photos and sizes. Peggy can draft the message for you.', 'Fewer refusals' ) ],

		[ 'find-a-delivery-partner', 'Find and connect a delivery partner', 'delivery-and-pay-on-delivery', 'Pick checked delivery companies that cover where you sell. Connecting takes a tap, at their public prices.',
			$p( 'Delivery partners pick up your parcels and take them to your customers. Their prices show at your checkout.' )
			. $i( 'delivery-hub', 'The Delivery screen and Find partners with filters for Doorstep and Pickup points' )
			. $s( "Open Menu, then Delivery | Check Where I sell and Where I ship from first.\nTap Find delivery partners | You see partners that cover where you sell. All are checked by Shopinbos.\nFilter | Doorstep, Pickup points, Same-day or Interstate.\nOpen a partner | See their coverage, rate card, re-attempt and return fees.\nConnect | They now show at checkout. Change what customers can choose in Delivery settings." )
			. $faq( "How many partners can I connect? | Free 1, Starter 3, Growth 10, Pro unlimited.\nA partner sent me a private rate | Tap it under My delivery partners and Accept the new rate. It is used for new orders only." ) ],

		[ 'set-your-own-delivery-fees', 'Set your own delivery fees, pickup or self-delivery', 'delivery-and-pay-on-delivery', 'Delivery areas with your own fees, customer pickup and delivering orders yourself.',
			$p( 'You don’t have to use a delivery partner for every order. You can set your own delivery areas and fees, let customers pick up, or deliver yourself.' )
			. $i( 'zones', 'My own delivery prices with delivery areas and fees, and New delivery area' )
			. $s( "Open Menu, then Delivery | Under At checkout, use, pick My own prices.\nTap My own delivery prices, then Add a delivery area | Give it a name, like Lagos Mainland.\nAdd the places it covers | Cities, states or areas. An area with no places covers everywhere else.\nType the delivery fee | You can make it free over an amount.\nSave | Customers get the first area that matches their city or state.", 'Your own delivery prices' )
			. $s( "Customers can pick up from me | Turn it on and add the pickup address, opening hours and directions. Pickup is free.\nI deliver myself | Set your own fee for customers in the state you ship from. You keep the fee.\nNo partner covers the area? | Choose what customers see: Pickup only or a flat fee.", 'Your own options' ) ],

		[ 'book-a-rider-for-an-order', 'Book a rider for an order', 'delivery-and-pay-on-delivery', 'Send a paid order with your delivery partner and hand it over with the pickup code.',
			$p( 'When an order is paid and packed, book your delivery partner from the order. They accept the job and send a rider.' )
			. $s( "Open the order | Orders, then To send.\nTap Get a rider | The job goes to the delivery partner the customer chose at checkout.\nWait for them to accept | The order says they accepted it, and shows the rider’s name.\nHand it over with the code | Only hand the parcel over if the rider gives you the pickup code shown on the order.\nFollow it | The order moves to On the way, then Delivered." )
			. $warn( 'If the partner doesn’t accept in time, the order shows Needs a new partner. See When a delivery partner can’t take an order.', 'No answer?' ) ],

		[ 'print-a-shipping-label', 'Print a shipping label (4×6 or A4)', 'delivery-and-pay-on-delivery', 'Print on a label printer or any printer. Each label has a QR code to track the order.',
			$p( 'Every order has a shipping label with the address, what to collect and a QR code to track it.' )
			. $i( 'label', 'What will you print on? with Label printer and A4 paper, and a 4×6 label with a QR code' )
			. $s( "Open the order and tap Print a label | You see the Shipping label.\nPick what you print on | Label printer: one 4 × 6 inch sticker. A4 paper: any printer, cut it out and tape it on.\nTap Print or share | Or Send as text (WhatsApp) to your rider." )
			. $faq( "What does the label say about money? | Paid orders say Paid. Don't collect money. Pay on delivery orders show the amount to collect.\nThe print link has expired | Go back to the app and tap Print again.\nCan I print many at once? | On the web, Labels and print lets you print labels for several orders." ) ],

		[ 'track-a-delivery', 'Track a delivery and share tracking', 'delivery-and-pay-on-delivery', 'See where an order is, share the tracking link, and report a problem.',
			$p( 'Each order sent with a delivery partner has a tracking page.' )
			. $i( 'track', 'The Track screen with the order’s steps, Share tracking and Report a problem' )
			. $s( "Open the order and tap Track | See From and To, the partner’s estimate and each step.\nShare tracking | Tap Share tracking to send the customer a link.\nSomething wrong? | Under Report a problem: Message your delivery partner (late, damaged or lost) or Get help from Shopinbos." )
			. $note( 'On Starter and above, the tracking page carries your shop’s brand.', 'Branded tracking' ) ],

		[ 'when-a-delivery-partner-cant-take-an-order', 'When a delivery partner can’t take an order', 'delivery-and-pay-on-delivery', 'Declined, not accepted in time or failed: send it to another partner.',
			$p( 'Sometimes a partner declines a job or doesn’t accept it in time. The order shows Needs a new partner, with their reason.' )
			. $i( 'exception', 'An order saying the partner can’t take this one, with Send to another partner' )
			. $s( "Open the order | It is under Needs action in Orders.\nTap Send to another partner | You see your connected partners that cover the address.\nPick one | You pay the new partner’s price." )
			. $note( 'If the first partner was already paid, they owe it back to you. On Growth and Pro, Delivery exceptions on the web lists every delivery that needs you.', 'Good to know' ) ],

		/* ---------- Inbox and channels ---------- */
		[ 'connect-whatsapp-facebook-and-instagram', 'Connect WhatsApp, Facebook and Instagram', 'whatsapp-and-social', 'Bring customer chats into Chats and show your products on WhatsApp, Facebook and Instagram.',
			$p( 'Connect your accounts once. Customer messages come into Chats, and your products show on each one.' )
			. $i( 'connect', 'Connect accounts with WhatsApp connected and Connect buttons for Facebook & Instagram and Google' )
			. $s( "Open Chats and tap Connect WhatsApp, Facebook and Instagram | Or Menu, then Sell everywhere.\nTap Connect on WhatsApp | Follow the steps for your WhatsApp Business number.\nTap Connect on Facebook & Instagram | You sign in with Facebook and pick your Page.\nWait a few minutes | It says Connected and how many products are showing." )
			. $faq( "It says I need a business account | Facebook and Instagram need a free Meta business account. Google needs a free Google Merchant Center account. The app links to each.\nInstagram isn't added | In the Instagram app, switch to a business account and link it to your Facebook Page, then connect again.\nWhat happens if I disconnect? | New messages and product updates stop there. Your past chats stay." ) ],

		[ 'add-your-whatsapp-business-catalogue', 'Show your products in your WhatsApp catalogue', 'whatsapp-and-social', 'Your Shopinbos products, prices and stock inside WhatsApp, kept in sync.',
			$p( 'Once WhatsApp is connected, customers see your products right inside WhatsApp, with the same prices and stock as your shop.' )
			. $s( "Connect WhatsApp | Menu, then Sell everywhere, then Connect on WhatsApp.\nCheck the products | The card shows how many products are showing, and asks you to fix any that can't show (for example, no photo).\nUpdate in one place | Change a price or stock in Shopinbos and WhatsApp follows." )
			. $tip( 'On the web, Inbox has a WhatsApp store too: customers browse, add to cart and pay inside your WhatsApp chat, and the orders land in Shopinbos.', 'WhatsApp store' ) ],

		[ 'reply-to-customers-in-chats', 'Reply to customers in Chats', 'whatsapp-and-social', 'All your customer messages in one list, with notes, snooze and Peggy.',
			$p( 'Chats brings messages from WhatsApp, Instagram, Facebook, your shop’s live chat and contact form into one list. Messages with suppliers and delivery partners are there too.' )
			. $i( 'chats', 'The Chats tab with Open, Unread, Snoozed and Done, and a WhatsApp conversation' )
			. $s( "Open Chats | Use Open, Unread, Snoozed and Done to sort them.\nTap a conversation and reply | Your reply goes back on the same app the customer used.\nAdd a private note | Only your team sees it.\nSnooze it | For 1 hour, 3 hours, tomorrow or next week.\nAsk Peggy | She can write answers to your customers for you." ) ],

		[ 'set-up-auto-replies', 'Set an away message and opening hours', 'whatsapp-and-social', 'Answer customers automatically when you’re closed.',
			$p( 'Auto-replies send themselves, so customers who message at night aren’t left waiting.' )
			. $i( 'autoreplies', 'Auto-replies with the Away message switched on and opening hours' )
			. $s( "Open Chats, then Auto-replies | Or Menu, then Auto-replies.\nTurn on your away message | Write what customers get when you're closed.\nSet your opening hours | The away message sends outside them." )
			. $note( 'Want answers to questions too, not just an away message? Turn on the Peggy chatbot.', 'Peggy chatbot' ) ],

		[ 'share-your-shop-link-and-qr-code', 'Share your shop on WhatsApp, Instagram and TikTok', 'whatsapp-and-social', 'Your @handle, short link and a QR code for your bio, Status, parcels and stall.',
			$p( 'Every shop has an @handle, a short link and a QR code. Put the link in your Instagram and TikTok bio and your WhatsApp Status, and print the QR code for your parcels and stall.' )
			. $i( 'shop-link', 'Shop link & QR with the @handle, short link, QR code, Print stickers and Print a flyer' )
			. $s( "Open Menu, then Your shop link & QR | You see your @handle and short link.\nCopy or share it | Tap Copy, Share or Send on WhatsApp.\nPrint it | Print stickers (12 on an A4 sheet) or Print a flyer (2 A5 flyers on A4).\nChange your @handle if you need to | 3 to 24 letters, numbers or _." )
			. $warn( 'Your old link and QR code stop working when you change your @handle. Print new ones after.', 'Changing your @handle' ) ],

		/* ---------- Marketing ---------- */
		[ 'create-a-discount-code', 'Create a discount code or automatic offer', 'marketing-and-ads', 'Codes customers type at checkout, offers that apply by themselves, and one-use coupons.',
			$p( 'Discounts and coupons is on the web, under Marketing. You can also ask Peggy in the app, for example “Make a 10% discount code for this weekend”.' )
			. $i( 'discount', 'Discounts and coupons on the web with a new discount code form' )
			. $s( "Open Marketing, then Discounts | At app.shopinbos.com.\nTap New code | Or New automatic offer for one without a code.\nName it and type the code | Like SALLAH20.\nChoose the kind | Percentage off, Amount off, Free delivery or Buy X get Y.\nSave | You see what each code brought in.", 'On the web' )
			. $tip( 'Discounts with an end date make people decide faster. Try a 24-hour code and share it on WhatsApp.', 'Make it urgent' ) ],

		[ 'make-a-link-in-bio-page', 'Make a link in bio page', 'marketing-and-ads', 'One page with your products, Buy now buttons and WhatsApp, for your Instagram and TikTok bio.',
			$p( 'Link in bio is one page with your products and links. Put its link in your Instagram and TikTok bio.' )
			. $i( 'link-in-bio', 'Link in bio with the page live, views, and its products and links' )
			. $s( "Open Menu, then Link in bio | You see your page and its views.\nAdd blocks | Products, WhatsApp, social links and a sign-up. Colours and photo are easier to change on a bigger screen.\nTap Save page | Then Share, and paste the link in your bio." ) ],

		[ 'plan-social-posts', 'Plan social posts on the Posts calendar', 'marketing-and-ads', 'Make posts for Instagram, Facebook, WhatsApp and TikTok and plan them day by day.',
			$p( 'Social posts are planned on a calendar, so each one goes out on time.' )
			. $i( 'posts', 'The Posts calendar with planned and posted posts' )
			. $s( "Open Menu, then Posts calendar | You see posts already made and planned, day by day.\nCreate a post | Write it yourself, or let Rex design it in Rex Studio.\nPick the day and time | It goes out on the accounts you connected." ) ],

		[ 'run-an-ad', 'Run a Facebook and Instagram ad', 'marketing-and-ads', 'Run ads yourself on your own ad account, or let the Shopinbos team run them.',
			$p( 'Ads shows your products to new people on Facebook and Instagram, and tells you what each campaign brought in.' )
			. $i( 'ads', 'The Ads screen with Run it myself, Let the team run it, and a live campaign' )
			. $s( "Open Menu, then Ads | Choose how to run it.\nRun it yourself | Connect your Facebook ad account and Page, pick up to 20 products, your audience and a daily budget. Peggy can write the words.\nOr let the team run it | Pay the setup fee and the team calls you within one working day.\nLaunch | Watch the results. Pause, resume or end it any time." )
			. $note( 'When you run it yourself, Meta charges the card on your ad account, up to the budget you set.', 'Who you pay' ) ],

		[ 'affiliates-and-refer-and-earn', 'Affiliates and Refer & earn', 'marketing-and-ads', 'Give creators a link that earns them a share, and invite other businesses for rewards.',
			$h( 'Creators and affiliates' )
			. $p( 'Give a creator their own link. When someone buys through it and the order is delivered, they earn a share. You pay them; Shopinbos keeps the count.' )
			. $i( 'affiliates', 'Creators and affiliates on the web, with two example creators' )
			. $s( "Open Marketing, then Affiliates | On the web.\nAdd a creator | Set their commission.\nShare their link with them | Their sales and earnings show here.", 'On the web' )
			. $h( 'Refer & earn' )
			. $p( 'Invite other businesses with your own link. You get free plan months or AI credits when they start selling. Open Refer & earn on the web to get your link.' ) ],

		/* ---------- Find stock ---------- */
		[ 'add-a-dropship-product', 'Add a dropship product to your shop', 'sourcing-and-dropshipping', 'Sell a supplier’s product without buying stock. Set your price and see what you keep.',
			$p( 'Find stock shows products from checked Nigerian suppliers. With dropship, you don’t buy anything now: when a customer pays you, the supplier sends it to them and you keep the difference.' )
			. $i( 'find-stock', 'Find products to sell with a product card, and the dropship price breakdown with You keep' )
			. $s( "Open Menu, then Find stock to sell | Search, or filter by category, cost and the supplier's city.\nOpen a product | See Cost, the suggested price and Ships in.\nSet your selling price | See what the supplier gets, the card and transfer fee and what you keep.\nTap Put it in my shop | It is added hidden, as a draft.\nShow it to customers | Open My products and put it live." )
			. $faq( "How many dropship products can I have? | Free 5, Starter 50, Growth and Pro unlimited.\nCan I message the supplier? | Yes. Tap Message on the product. Chats with suppliers are in Partner messages." ) ],

		[ 'how-dropship-orders-work', 'How a dropship order works', 'sourcing-and-dropshipping', 'Who packs it, whose label goes on it, and what happens if the supplier can’t send it.',
			$p( 'When a customer buys a dropship product, the order goes to the supplier. They pack it in plain packaging with your shop’s delivery label, and a rider takes it to your customer. To your customer, it is your shop’s order.' )
			. $s( "Your customer pays | At your checkout.\nThe supplier accepts and packs it | In its own packaging with your label. No flyers or supplier phone numbers.\nA rider collects it | You follow it in Orders like any other order.\nYou keep the difference | Your share is paid out to your bank through Paystack.", 'Step by step' )
			. $faq( "The supplier can't send it | The order tells you. Pick Find another supplier, or Cancel and refund the customer.\nThe supplier was paid but didn't send it | Money shows it under Money a supplier should return to you. Ask them to transfer it back, then refund or replace the order.\nIs there an agreement? | Yes. You and the supplier both accept a dropship agreement first: how fast they ship, and that they never sell to your customers directly." ) ],

		[ 'request-a-quote-from-a-supplier', 'Buy wholesale and request a quote', 'sourcing-and-dropshipping', 'Ask a supplier for their price on a larger order, then pay when you agree.',
			$p( 'To buy stock to keep and sell yourself, order wholesale. For a larger quantity, ask the supplier for a quote first.' )
			. $i( 'quote', 'A wholesale product with price tiers and Request a quote, then Wholesale orders with a price sent' )
			. $s( "Open the product in Find stock | Check the wholesale price tiers and the minimum order (MOQ).\nType the quantity and where it should go | You see an estimated total.\nTap Request a quote | The supplier answers in Chats and we tell you.\nCheck Wholesale orders | Price requests show Waiting for the supplier, then Price sent.\nAccept and pay | The supplier confirms the final price and delivery in their quote." ) ],

		[ 'import-from-china', 'Import from China', 'sourcing-and-dropshipping', 'Our sourcing partner buys on 1688, checks the goods and ships them to you, with a naira price.',
			$p( 'Can’t find it from Nigerian suppliers? Our sourcing partner buys on 1688, checks it and ships it to you.' )
			. $i( 'china', 'Import from China in three steps with Request an import quote' )
			. $s( "Open Find stock and scroll to Import from China | Tap Request an import quote.\nPaste a 1688 link or a photo | Say how many you want.\nGet a landed price | In naira, with shipping and duty included.\nPay, then track it | My imports shows quotes and shipments on the way." )
			. $note( 'Free plans can browse. Starter and Growth can import; Pro gets priority.', 'Which plans' ) ],

		/* ---------- Rex and Peggy ---------- */
		[ 'what-are-ai-credits', 'What are AI credits?', 'rex-and-peggy', 'What Rex and Peggy use when they work for you, how many your plan includes and what uses them.',
			$p( 'AI credits are what AI actions use up in Shopinbos, like Rex writing a product description or making a picture, or Peggy answering a customer. Your plan gives you some every month, and some things are free each day.' )
			. $b( 'stats', [ 'title' => 'AI credits a month', 'items' => "20 | Free\n150 | Starter\n500 | Growth\n1,500 | Pro", 'foot' => 'From the Shopinbos plans. Monthly credits refill each month.', 'tone' => 'light' ] )
			. $b( 'checklist', [ 'title' => 'What uses credits (examples)', 'items' => "Product title and description: 2\nRemove an image background: 3\nEnhance or create a lifestyle product photo: 10\nSocial media caption or ad copy: 2\nAI store setup: 20\nAI chat replies to your customers: 1 per conversation", 'interactive' => false ] )
			. $faq( "Where do I see my credits? | Tap the credits count at the top of the app (AI credits). It shows what is free on your plan today and what you have left.\nWhat happens when I run out? | Top up, or wait for your plan's credits to refill at the start of next month." ) ],

		[ 'buy-more-ai-credits', 'Buy more AI credits', 'rex-and-peggy', 'Top up with Paystack, or turn on automatic top-up.',
			$p( 'If you need more than your plan includes, buy a pack of credits. Credits you buy are used after your plan’s monthly ones.' )
			. $i( 'credits', 'The AI credits sheet with packs, automatic top-up and Buy credits' )
			. $s( "Open AI credits | Tap the credits count, then Top up. Or open Credits on the web.\nPick a pack | From ₦2,000 for 200 credits.\nTap Buy credits | Pay securely with Paystack.\nTurn on automatic top-up if you want | We top you up when credits run out, at most 3 times a day." )
			. $note( 'Buying plans and credits is on the web at app.shopinbos.com, not in the phone app.', 'Where to pay' ) ],

		[ 'ask-peggy', 'Ask Peggy to check your shop and do tasks', 'rex-and-peggy', 'Peggy checks your orders, stock and sales, and does the work you ask for.',
			$p( 'Peggy is the AI helper in Shopinbos Business. She can check your orders, stock and sales, and do the work: mark orders paid or sent, change prices and stock, make discount codes, and draft posts and messages.' )
			. $i( 'peggy', 'Ask Peggy: a request for a weekend discount code, done by Peggy' )
			. $s( "Tap Ask Peggy anything on Home | Or Ask Peggy in Chats.\nAsk in your own words | Like “Which orders do I need to send?” or “What should I restock?”.\nCheck what she did | Changes she makes are marked Peggy did this." )
			. $tip( 'Peggy remembers your preferences, regular suppliers and brand voice. You can check or clear what she knows any time on the web in Settings, under Peggy & Rex.', 'She learns your shop' ) ],

		[ 'turn-on-the-peggy-chatbot', 'Let Peggy answer shoppers (Peggy chatbot)', 'rex-and-peggy', 'Peggy answers questions on your shop’s chat, day and night, from your products, prices and policies.',
			$p( 'The Peggy chatbot answers shoppers on your shop’s chat using your products, prices and policies, and can send them a link to order.' )
			. $i( 'chatbot', 'Peggy chatbot switched on, answering a delivery question' )
			. $s( "Open Menu, then Peggy chatbot | Switch it on.\nCheck your details | Make sure your products, delivery fees and legal pages are filled in. Peggy answers from them.\nWatch the first chats | Read her answers in Chats. You can reply yourself any time." )
			. $note( 'Each AI reply to a customer uses 1 credit per conversation.', 'Credits' ) ],

		[ 'make-pictures-in-rex-studio', 'Make product photos and posts in Rex Studio', 'rex-and-peggy', 'Clean product photos, logos, flyers and short videos, made by Rex.',
			$p( 'Rex Studio is where Rex, the AI designer, makes product photos, logos and posts for you.' )
			. $i( 'rex-studio', 'Rex Studio with a product photo before and after, and Product photos, Logo, Flyers and posts' )
			. $s( "Open Menu, then Rex Studio | Or the Studio on the web.\nPick what you want | Product photos (clean background or a lifestyle photo), Logo, or Flyers and posts.\nChoose a product photo | Rex makes new pictures. Keep the ones you like.\nFor video | Video studio turns your product photos into short videos for TikTok, Reels and Status." ) ],

		/* ---------- Domain and store design ---------- */
		[ 'your-free-mybos-store-address', 'Your free mybos.store web address', 'store-and-design', 'Every shop gets a free address like yourname.mybos.store.',
			$p( 'Your shop has a free web address, like adafabrics.mybos.store, on every plan. It is made from your shop name when you set up.' )
			. $s( "Open Menu, then Web address | You see Your free address and whether it is Live.\nCopy or share it | Tap Copy or Share.\nWant your own .com? | Use your own domain on Starter and above. See Connect your own domain." ) ],

		[ 'connect-your-own-domain', 'Connect your own domain', 'store-and-design', 'Use a domain you own, like yourshop.com, or buy one in the app.',
			$p( 'On Starter, Growth and Pro you can use your own domain, like adafabrics.com, instead of your free mybos.store address.' )
			. $i( 'domain', 'Web address with Use your own domain, then the records to add and Check now' )
			. $s( "Open Menu, then Web address | Tap Use your own domain.\nType your domain | Choose with www. or without, and tap Continue.\nAdd the records we show | Copy each Host / Name and Value / Points to into the DNS settings where you bought the domain.\nTap Check now | It can take up to an hour to work. When it says Connected, your shop opens on your domain." )
			. $faq( "I don't have a domain yet | Tap Buy a new one. Search for a name and pay on Paystack. We buy it and set it up for you.\nIt says one record was copied wrongly | Copy it again exactly as shown, then tap Check now.\nCan you do it for me? | Yes. Tap Ask us to connect it, tell us where you bought it, and we'll do the setup with you." ) ],

		[ 'change-your-store-colours-and-logo', 'Change your shop’s logo, colours and words', 'store-and-design', 'Edit your shop name, tagline, logo, colour and homepage sections, then publish.',
			$p( 'You can change how your shop looks at any time without losing your products.' )
			. $i( 'edit-shop', 'Edit my shop with name, tagline, logo and colour, and Shop look with looks to choose from' )
			. $s( "Open Menu, then Edit store | Edit my shop opens.\nChange Name and words | Shop name, tagline and the announcement bar.\nChange Logo and colour | Tap Change logo and pick a shop colour.\nMove homepage sections | Show, hide or move the banner, featured products and more.\nTap Publish changes | Saved changes show to shoppers once you publish." )
			. $tip( 'Tap Ask Rex to change it and type what you want, like “make it feel premium”. Rex makes the change for you to check.', 'Ask Rex' ) ],

		[ 'pick-a-shop-look', 'Pick a shop look (template)', 'store-and-design', 'Choose a ready-made look or let Rex build one. Your products, prices and delivery stay the same.',
			$p( 'A shop look is the overall design of your shop: colours, fonts and layout. Changing it keeps your products, prices and delivery.' )
			. $s( "Open Menu, then Shop looks | You see Build with Rex or pick a look.\nPreview a look | Tap Preview my shop to see it with your products.\nTap Use this look | Or Ask Rex to build it for me.\nPublish | If it was saved as a draft, your live shop keeps its old look until you publish." )
			. $note( 'Free plans have the basic looks. Starter and above have all of them, and Growth and Pro add seasonal campaigns. For full control of the layout, open the store builder on a computer.', 'Which looks' ) ],

		/* ---------- Account and security ---------- */
		[ 'log-in-and-log-out', 'Log in with a code, and log out of all devices', 'account-and-security', 'No password needed: we send a code each time. Log out everywhere if you lose a phone.',
			$p( 'Shopinbos Business logs you in with a code sent to your WhatsApp, by SMS or by email, so there is no password to remember or share.' )
			. $i( 'login', 'Welcome back with Send me a code on WhatsApp, and the Log out message in the Menu' )
			. $p( 'If you set a password, you can also log in with your email and password, and change it on the web in Settings, then Security.' )
			. $s( "Open the app and tap I already have a shop | Welcome back opens.\nType your phone number | Or tap Email.\nTap Send me a code on WhatsApp | Type the code, or paste it.", 'Log in' )
			. $s( "Open Menu and scroll to the bottom | Tap Log out.\nTo log out everywhere | On the web, open Settings, then Security, and tap Log out of all devices. This logs you out on every phone and computer, including that browser.\nSee where you're signed in | Security also lists Signed-in devices and Recent activity.", 'Log out' )
			. $warn( 'Shopinbos will never ask you for your login code. Don’t share it with anyone, including people who say they are from Shopinbos.', 'Keep your code to yourself' ) ],

		[ 'add-a-staff-member', 'Add a staff member', 'account-and-security', 'Give helpers their own login. Billing, payouts and your bank stay with you.',
			$p( 'Staff sign in with their own email and work in your store: products, orders, customers, marketing and Rex. Billing, payouts, your bank account and the team stay with you, the owner.' )
			. $i( 'team', 'Team on the web with the owner, a staff member and Invite someone' )
			. $s( "Open Settings, then the Team tab | On the web at app.shopinbos.com.\nTap Invite someone | Type their name and email.\nTap Send invite | They join when they open the link in the email.\nRemove them when they leave | Tap Remove. Their access stops." )
			. $faq( "How many staff can I add? | Free 1, Starter 2, Growth 5, Pro 15 seats, including you. Need one more? Add a seat for ₦1,000 a month.\nThey didn't get the email | If email isn't set up, the app shows a link to send them yourself." ) ],

		/* ---------- Plans and billing ---------- */
		[ 'shopinbos-plans-and-fees', 'Shopinbos plans and fees', 'plans-and-billing', 'Free, Starter, Growth and Pro: prices, fees per sale and what each one adds.',
			$p( 'Every plan has your store, Rex and delivery partners. Paid plans lower the fee on each sale and unlock more.' )
			. $b( 'checklist', [ 'title' => 'The plans', 'items' => "Free: ₦0 a month, 3% per sale, up to 20 products, yourname.mybos.store, 20 AI credits a month\nStarter: ₦6,000 a month, 2% per sale, your own domain, up to 200 products, all themes, 150 AI credits\nGrowth: ₦18,000 a month, 1% per sale, unlimited products, pay on delivery, 5 staff accounts, 500 AI credits\nPro: ₦40,000 a month, 0.5% per sale, 15 staff accounts, unlimited delivery partners, priority support, 1,500 AI credits", 'interactive' => false ] )
			. $p( 'Yearly plans give you 2 months free. VAT is added where it applies. See the full table on the <a href="/pricing/">pricing page</a>.' ) ],

		[ 'change-your-plan', 'Upgrade or change your plan', 'plans-and-billing', 'Choose a plan on the web and pay with Paystack. To move down, cancel from your Paystack email.',
			$p( 'Plans, billing and AI credits are on the web, not in the phone app.' )
			. $s( "Log in at app.shopinbos.com | Open Settings, then the Billing tab.\nPick monthly or yearly | Yearly gives you 2 months free.\nTap Choose and pay on Paystack | Your plan updates. It may take a moment to show everywhere." )
			. $note( 'To move to a smaller plan, cancel from your Paystack email. You keep your plan until it ends.', 'Moving down' ) ],

		/* ---------- Suppliers ---------- */
		[ 'join-as-a-supplier', 'Join Shopinbos as a supplier', 'supplier-getting-started', 'Create a supplier account, tell us what you supply and where you send from.',
			$p( 'Suppliers list their stock once. Shops sell it under their own brand (dropship) or buy it wholesale. You pack with their label and are paid after delivery.' )
			. $s( "Sign up and pick Supplier | Or tap I supply shops. Each account is for one kind of business.\nYour business | Business name and what you supply.\nWhere do you send from? | Your city and address. Riders pick up from here.\nWhere do you sell? | We show you delivery partners that pick up from your city.\nGet verified | Add your documents in Account, then Verification. You can show products to shops once we've checked your business.", 'In the supplier app' )
			. $note( 'Free (Verified) costs nothing a month, with a 6% commission per marketplace order. Supplier Plus and Supplier Pro lower it and add more.', 'Supplier plans' ) ],

		[ 'supplier-verification', 'Get your supplier business verified', 'supplier-getting-started', 'Verify your ID and your CAC or BN registration to get the Verified badge.',
			$p( 'Shops see verified suppliers first. Verification is free.' )
			. $s( "Open Money, then Verification | Or Account, then Verification.\nVerify your ID | Your NIN or BVN.\nVerify your business registration | Add your CAC (RC) or business name (BN) registration.\nWait for the check | Our team checks it, usually within a day. You see Verified when it's done." ) ],

		[ 'supplier-add-products', 'Add products and wholesale prices', 'supplier-getting-started', 'Photos, stock, wholesale price, minimum order and suggested retail price.',
			$p( 'Each product you add can be dropshipped by shops, bought wholesale, or both.' )
			. $i( 'supplier-product', 'My products with Live and In review products, stock and suggested retail price' )
			. $s( "Open Products and tap Add a product | Take a photo.\nSet your wholesale price and stock | Units in stock and the minimum order quantity (MOQ).\nAdd a suggested retail price | Shops see it as a guide.\nTurn on Show it to shops | New products may show In review first.\nAdd price tiers on the web | Wholesale price tiers and regions are easier in your browser." ) ],

		[ 'supplier-pack-and-send', 'Pack and send an order (suppliers)', 'supplier-getting-started', 'Accept, pack with the shop’s label, hand it to the rider with the code, and get paid after delivery.',
			$p( 'When a shop sells your product, the order shows under New in Orders. Dropship orders go straight to the shop’s customer as the shop’s order.' )
			. $i( 'supplier-order', 'A supplier order with Accept, Pack it with the shop’s label, and the code to give the rider' )
			. $s( "Tap Accept order | Can't do it? Tap I can't do this one and we tell the shop.\nPack it | Dropship: in its own packaging with the shop's delivery label. No flyers or your number.\nChoose how you want the label | Show it on my phone, Print it or send it, or Write it by hand.\nPick when a rider can collect it | You don't pay for delivery.\nHand it over with the code | Only hand it over if the rider gives you the code on the order." )
			. $faq( "When am I paid? | Your cost on paid dropship orders is paid to the bank in your Shopinbos Wallet through Paystack. Money shows what you've earned.\nCan I sell to the shop's customer directly? | No. It's the shop's order and customer. That's how the shop keeps buying from you." ) ],

		[ 'supplier-answer-a-quote-request', 'Answer a quote request', 'supplier-getting-started', 'Send your price for a large order and when it can be ready.',
			$p( 'When a shop wants a large order of one product, the quote request shows in Quotes and on Home.' )
			. $i( 'supplier-quote', 'A quote request with Your price for each one, When can it be ready and Send my quote' )
			. $s( "Open the quote request | See what the shop wants, how many and where.\nType your price for each one | You see the total.\nPick when it can be ready | Today, In 3 days, In a week or In 2 weeks.\nAdd an MOQ or message if you want | Like “Price includes packaging.”\nTap Send my quote | If the shop says yes, the order shows under New." ) ],

		/* ---------- Delivery partners ---------- */
		[ 'join-as-a-delivery-partner', 'Join Shopinbos as a delivery partner', 'delivery-partner-getting-started', 'Create a partner account, set where you deliver and your prices, and get verified.',
			$p( 'Delivery companies get jobs from Shopinbos shops and suppliers. Shops book you at checkout or connect with you; you accept, assign a rider and deliver with a code.' )
			. $s( "Sign up and pick Delivery partner | Or tap I deliver.\nSet your coverage | Where you pick up and where you deliver.\nSet your rate card | Prices by route, service and parcel size.\nAdd your riders | They use the Riders app.\nGet verified | Upload your CAC and ID in Verification. Checks usually take 1 to 2 working days.", 'In the partner app' )
			. $note( 'Free (Verified) costs nothing a month, with 5% of each delivery fee. Logistics Plus and Logistics Pro lower it and cover more states.', 'Partner plans' ) ],

		[ 'partner-coverage-and-rates', 'Set your coverage and rate card', 'delivery-partner-getting-started', 'Where you pick up and deliver, your prices, re-attempt and return fees.',
			$p( 'Sellers, suppliers and their customers see your rate card at checkout. Only shops in places you cover can book you.' )
			. $i( 'partner-rates', 'Your rate card with routes and prices, and re-attempt and return to sender fees' )
			. $s( "Open Menu, then Coverage and rates | Set where you pick up and deliver.\nOpen Your rate card | Tap + Add a price for each route and service.\nSet your other fees | Re-attempt fee and Return to sender.\nSend private rates | Agree a price with a shop in Chats, then send them a private rate. It replaces your public price for them once they accept." ) ],

		[ 'partner-add-riders', 'Add riders to the Riders app', 'delivery-partner-getting-started', 'Add a rider with their name and WhatsApp number. They get a link to the Riders app.',
			$p( 'Riders use their own simple app to see jobs, pick up with a code and deliver with the customer’s code.' )
			. $i( 'partner-riders', 'Riders with who is on a job, free or offline, and Add a rider' )
			. $s( "Open Riders and tap Add a rider | Type their name and WhatsApp number.\nWe message them | They get a WhatsApp message with a link to the Riders app.\nThey switch Online | When they start work, you see them as Free now or On a job." ) ],

		[ 'partner-accept-and-assign-jobs', 'Accept a job and assign a rider', 'delivery-partner-getting-started', 'Accept new jobs quickly and send the closest free rider.',
			$p( 'When a shop books you, the job shows on Today and in Jobs.' )
			. $i( 'partner-job', 'A job with Accept and assign, and Who’s taking it? with the closest free riders' )
			. $s( "Open the job | See the shop, pickup, drop-off and delivery fee.\nTap Accept and assign | Or Accept, assign later.\nPick a rider | Closest free riders are first. Tap Accept and send them.\nCan't take it? | Decline and say why. The seller can send it to another partner." ) ],

		[ 'pickup-and-delivery-codes', 'Pickup and delivery codes, and pay on delivery', 'delivery-partner-getting-started', 'How riders pick up with a code, deliver with the customer’s code, and handle pay on delivery.',
			$p( 'Codes protect everyone. The rider gives the shop a pickup code to collect the parcel, and the customer gives the rider a 4-digit delivery code to receive it.' )
			. $i( 'rider-pickup', 'The Riders app Pick up screen asking for the 4-digit pickup code' )
			. $s( "At pickup | The rider taps I'm there, enter code, and the shop checks the code before handing the parcel over.\nAt the door | The rider asks the customer for the 4-digit code on their WhatsApp and types it in.\nNo code? | The rider can take a photo of the parcel with the person who took it, and type their name.\nProblem? | Something wrong? tells your company: customer not answering, address not found, parcel damaged or refused.", 'In the Riders app' )
			. $warn( 'On pay on delivery jobs the customer pays the shop with the link or the rider’s QR code. Your rider never takes cash: when the app says Paid, they ask for the delivery code and hand the parcel over.', 'Pay on delivery' ) ],
	];
}
