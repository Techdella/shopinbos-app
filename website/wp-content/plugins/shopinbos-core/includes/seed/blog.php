<?php
/**
 * Seed content: blog categories and the 9 launch posts (canvas v7, Blog board).
 * Loaded by `wp shopinbos setup`. Bodies are built from core paragraphs/headings and the article blocks,
 * so writers edit them like any other post.
 */

defined( 'ABSPATH' ) || exit;

function sib_seed_b( string $name, array $attrs = [] ): string {
	return serialize_block( [ 'blockName' => 'shopinbos/' . $name, 'attrs' => $attrs, 'innerBlocks' => [], 'innerHTML' => '', 'innerContent' => [] ] ) . "\n\n";
}

function sib_seed_p( string $text ): string {
	return sib_block_p( $text );
}

function sib_seed_h2( string $text ): string {
	return sib_block_h( 2, $text, '' );
}

function sib_seed_blog_categories(): array {
	return [
		[ 'selling-on-whatsapp', 'Selling on WhatsApp', '#E2F6F1', '#0C4A44', 'Status, broadcasts, catalogues and replies that turn chats into orders.' ],
		[ 'instagram-and-tiktok', 'Instagram and TikTok', '#E7E1FF', '#5B3FD6', 'Photos, short videos and posts that make people ask “how much?”.' ],
		[ 'payments', 'Payments', '#FDF0D5', '#8A5A08', 'Getting paid, pricing and pay on delivery without the stress.' ],
		[ 'delivery', 'Delivery', '#FFEDE4', '#B23E0A', 'Riders, packing, returns and what to do when a delivery goes wrong.' ],
		[ 'find-stock', 'Find stock', '#E3EEFD', '#1F5FBF', 'Suppliers, dropshipping and buying stock you can actually sell.' ],
		[ 'seller-stories', 'Seller stories', '#FCE4EC', '#A0204F', 'How other Nigerian shops set up and grow. Example stories are marked.' ],
	];
}

/** [slug, category, title, dek, date, cover, cover bg, fit, featured, views, lesson slug, body] */
function sib_seed_blog_posts(): array {
	$b = 'sib_seed_b';
	$p = 'sib_seed_p';
	$h = 'sib_seed_h2';

	$first10 = $p( 'Most new shops don’t need an ad budget for their first orders. They need the few hundred people who already watch their WhatsApp Status, and a clear reason for those people to message back.' )
		. $b( 'did-you-know', [ 'text' => 'For many Nigerian shoppers, WhatsApp Status is where they see new things first, before Instagram or TikTok. Your contacts already trust you, so a good Status post often sells faster than a paid ad.', 'foot' => 'Tip: check how many people viewed your last 5 Status posts. That is your free audience.' ] )
		. $h( '1. Post products, not just pictures' )
		. $p( 'A pretty picture gets a heart. A product post gets a message. The difference is the details people need to decide in two seconds.' )
		. $b( 'checklist', [ 'title' => 'Every product post should have', 'items' => "A clear photo taken in daylight\nThe price in naira, written on the picture\nHow to order: “Reply BAG to order”\nWhere you deliver and how fast" ] )
		. $b( 'callout', [ 'kind' => 'tip', 'text' => 'Put the price on the picture. People who have to ask “how much?” often never ask.' ] )
		. $h( '2. Post at the times people look' )
		. $p( 'Status disappears after 24 hours, so timing matters. Post your best product when your contacts are most likely to be on their phones.' )
		. $b( 'stats', [ 'title' => 'Common busy times on WhatsApp', 'items' => "7–9am | On the way to work\n12–2pm | Lunch break\n8–10pm | After dinner, usually the busiest", 'foot' => 'These are common patterns. Your own Status views will show what works for your customers.' ] )
		. $h( '3. Make ordering one tap' )
		. $p( 'Every extra message between “I want it” and “I’ve paid” is a chance for the customer to get distracted. Put your store link in every third Status so people can order and pay without waiting for you.' )
		. $b( 'steps', [ 'title' => 'What happens when someone taps your link', 'items' => "They pick the item | Size, colour and quantity, with the price you set.\nThey pay or choose pay on delivery | Card, transfer, USSD, or cash to the rider with a 4-digit code.\nYou get the order on WhatsApp | With the address and a button to book a rider.\nThe rider delivers | Your customer gets live updates. You get paid on Friday." ] )
		. $b( 'cta-inline', [ 'title' => 'Get your store link in 5 minutes', 'linkLabel' => 'See how it works', 'linkUrl' => '/' ] )
		. $h( '4. Let your customers sell for you' )
		. $p( 'A photo from a happy customer does more than ten of your own posts. Ask for one after every delivery, and post it the next morning with the product link.' )
		. $b( 'quote', [ 'text' => 'I posted the same bag three days in a row, each time with a different customer’s photo. On the third day I sold six.', 'name' => 'Adaeze', 'shop' => 'Adaeze Studio, Yaba', 'isExample' => true ] )
		. $b( 'callout', [ 'kind' => 'warn', 'text' => 'Don’t post 20 items at once. People tap past. Three to five good posts a day beats twenty rushed ones.' ] )
		. $h( '5. Follow up the same day' )
		. $p( 'Most lost orders are not “no”. They are “later” that nobody followed up. A short, friendly message the same evening brings many of them back.' )
		. $b( 'do-dont', [ 'title' => 'Following up', 'dos' => "Reply within an hour, even if it is “I’ll check and get back to you”\nSend a photo of the item packed and ready\nAsk for a voice note review after delivery", 'donts' => "Leave “price?” on read\nSend bank details without an order summary\nArgue in the chat when something goes wrong" ] )
		. $b( 'faq', [ 'items' => "How many Status views do I need to start getting orders? | There is no magic number. Sellers with 200 views get orders when the post is clear and the price is visible. Focus on making every post easy to act on.\nShould I use WhatsApp Business? | Yes. It is free, it lets you add a catalogue and quick replies, and it works with Shopinbos so Peggy can help you reply.\nCan Shopinbos post to my Status for me? | WhatsApp does not let apps post to Status. Peggy prepares the picture and the caption, so posting takes you two taps." ] )
		. $b( 'callout', [ 'kind' => 'note', 'title' => 'Learn it step by step', 'text' => 'This guide is also a free 4-minute lesson in the <a href="/academy/sell-on-whatsapp/turn-your-status-into-a-shop-window/">Shopinbos Academy</a>, with a checklist you can tick as you go. No sign-up needed.' ] );

	$pod = $p( 'Pay on delivery is how many Nigerians prefer to buy from a shop they don’t know yet. It builds trust, but it also brings the two problems every seller knows: the buyer who is “not around”, and the buyer who says they never got the parcel.' )
		. $p( 'You can keep pay on delivery and lose most of the stress. Here is how.' )
		. $h( '1. Confirm before the rider leaves' )
		. $p( 'Most failed deliveries start with an order nobody confirmed. Send a short message before you book the rider: the item, the price, the address and the time window. Ask the buyer to reply YES.' )
		. $b( 'callout', [ 'kind' => 'tip', 'text' => 'Shopinbos sends this confirmation for you on WhatsApp. If the buyer doesn’t reply within 2 hours, Peggy reminds you before a rider is booked.' ] )
		. $h( '2. Use a delivery code' )
		. $p( 'With Shopinbos, every pay on delivery order gets a 4-digit code that only the buyer sees. The buyer pays the rider in cash or by transfer, then gives the code. The rider types it in, and only then is the order marked delivered.' )
		. $b( 'steps', [ 'title' => 'How a code delivery works', 'items' => "The buyer gets a code on WhatsApp | It arrives with the rider’s name and live tracking.\nThe rider arrives and hands over the parcel | The buyer checks the item first.\nThe buyer pays and shares the code | Cash or transfer to the rider.\nThe order is marked delivered | You see it at once. The rider pays the cash in the same evening." ] )
		. $p( 'No code, no “delivered”. That ends most “I never got it” arguments before they start.' )
		. $h( '3. Decide what happens when a buyer refuses' )
		. $p( 'Some buyers will refuse at the gate. Decide your rule before it happens and put it on your store, so you are not making it up on the phone.' )
		. $b( 'do-dont', [ 'title' => 'When a buyer refuses the parcel', 'dos' => "Stay polite. Ask what is wrong and offer a swap if it is size or colour\nAsk the rider to bring the parcel back the same day\nNote the number. Ask for payment first next time", 'donts' => "Shout at the buyer or the rider\nLet the rider leave the parcel without the code\nKeep sending pay on delivery orders to the same number" ] )
		. $h( '4. Know your money' )
		. $p( 'Cash collected by riders shows in your Shopinbos balance the same evening. Your balance is paid to your bank every Friday, or you can withdraw any time.' )
		. $b( 'stats', [ 'title' => 'Pay on delivery on Shopinbos', 'items' => "4 digits | Code only the buyer sees\n6pm | Riders pay in cash the same evening\nFriday | Your balance paid to your bank", 'foot' => 'Payout times can move on public holidays. Check the app for your next payout date.', 'tone' => 'teal' ] )
		. $b( 'faq', [ 'items' => "Does pay on delivery cost extra on Shopinbos? | There is no payment fee on cash paid to the rider. You pay the delivery price you agreed with the rider or partner.\nWhat if the rider loses the cash? | Delivery partners on Shopinbos are responsible for the cash they collect. Report it in the app and we follow it up with the partner.\nCan I turn pay on delivery off for some products? | Yes. You can switch it on or off per product, or only allow it in some areas." ] )
		. $b( 'cta-inline', [ 'title' => 'Take pay on delivery with codes', 'text' => 'Included on the Growth and Pro plans. Riders pass the cash on by 6pm the same day.', 'linkLabel' => 'How pay on delivery works', 'linkUrl' => '/delivery/' ] );

	$drop = $p( 'Dropshipping means you sell a product you don’t hold. When a customer orders, the supplier packs it with your label and a rider delivers it. You never buy stock up front.' )
		. $p( 'It is a good way to start, but you should know exactly what you keep. Here are real numbers on one product: a ₦28,000 tote bag.' )
		. $h( '1. Where the ₦28,000 goes' )
		. $p( 'Say the supplier’s price to you is ₦17,500. You choose your own selling price, here ₦28,000. The buyer pays for delivery separately.' )
		. $b( 'stats', [ 'title' => 'One ₦28,000 tote bag, paid by card (Starter plan)', 'items' => "₦17,500 | Supplier price\n₦520 | Paystack fee (1.5% + ₦100)\n₦560 | Shopinbos fee (2% on Starter)\n₦9,420 | What you keep", 'foot' => 'Example numbers. Paystack fees are capped at ₦2,000 per payment. On Growth the fee is 1% (₦280), so you would keep ₦9,700.' ] )
		. $p( 'The supplier is paid their price after delivery. Your share is held for 48 hours after delivery in case of a return, then joins your balance for Friday’s payout.' )
		. $h( '2. What you risk' )
		. $p( 'You don’t risk money on stock. You risk your name. If the supplier is slow or the item is not what the photo showed, the customer blames you.' )
		. $b( 'callout', [ 'kind' => 'warn', 'text' => 'Never sell a product you have not seen. Order one sample for yourself first, even if it costs you a little.' ] )
		. $b( 'checklist', [ 'title' => 'Before you add a dropship product', 'items' => "Order one sample and check the quality\nCheck the supplier’s rating and delivery time in the marketplace\nTake your own photos if you can\nWrite the real delivery time on your store\nKnow the supplier’s return rule" ] )
		. $h( '3. Pick products that travel well' )
		. $p( 'Bags, shoes, accessories and small gadgets are easier than fragile or perishable goods. They don’t break, they don’t go off, and sizes are easy to explain.' )
		. $b( 'do-dont', [ 'title' => 'Choosing what to sell', 'dos' => "Start with 5 to 10 products in one category\nPrice so you keep at least 25% after fees\nPick suppliers who deliver in your city in 1 to 3 days", 'donts' => "Add 200 products on day one\nCompete only on being the cheapest\nSell anything you can’t describe honestly" ] )
		. $h( '4. When to switch to wholesale' )
		. $p( 'When one product sells every week, buy a few pieces at the wholesale price and keep them. You keep more per sale and you deliver faster. Keep dropshipping for the rest.' )
		. $b( 'cta-inline', [ 'eyebrow' => 'Find stock', 'title' => 'Browse products you can sell today', 'text' => 'Verified Nigerian suppliers, prices in naira, and your label on every parcel.', 'button' => 'Find stock', 'intent' => 'dropship', 'linkLabel' => 'See the marketplace', 'linkUrl' => '/marketplace/', 'tone' => 'ink' ] );

	$naira = $p( 'When the naira moves, your supplier’s price moves. If your price stays the same, your profit quietly shrinks. If you change it every day, regular customers stop trusting it.' )
		. $p( 'Here is a simple rule that keeps you safe without confusing anyone.' )
		. $h( '1. Know your cost every week' )
		. $p( 'Every Monday, check what each product now costs you: the item, packing and any delivery you cover. Write it down. Most sellers lose money because they price from memory.' )
		. $b( 'callout', [ 'kind' => 'tip', 'text' => 'Use the <a href="/tools/profit-margin-calculator/">profit margin calculator</a> once a week for your top five products. It takes two minutes.' ] )
		. $h( '2. Use a margin, not a fixed profit' )
		. $p( 'Decide the share of the price you want to keep, say 35%. When your cost goes up, the price goes up by the same share. Your profit keeps pace with the naira.' )
		. $b( 'stats', [ 'title' => 'Same 35% margin, two weeks apart', 'items' => "₦10,000 → ₦15,400 | Week 1 cost and price\n₦11,500 → ₦17,700 | Week 3 cost and price\n₦5,400 → ₦6,200 | What you keep per sale", 'foot' => 'Example numbers, before payment fees. Prices rounded up to the next ₦100.', 'tone' => 'light' ] )
		. $h( '3. Change prices on a schedule' )
		. $p( 'Pick one day a week to update prices, and only change them when the cost moved by more than 5%. Small moves can wait. Customers get used to a rhythm.' )
		. $b( 'do-dont', [ 'title' => 'Telling customers', 'dos' => "Be honest: “Our supplier’s price went up this week”\nGive regulars a few days’ notice on their favourites\nHonour any price you already quoted in a chat", 'donts' => "Change the price after someone has paid\nHide the increase in a smaller pack\nApologise for running a business" ] )
		. $h( '4. Protect your best sellers' )
		. $p( 'If one product brings people to your store, you can keep its price steady for longer and earn a little less on it, while other products carry the increase. Just decide it on purpose.' )
		. $b( 'takeaways', [ 'items' => "Check your costs every Monday\nPrice with a margin, not a fixed profit\nUpdate on one day a week, only for moves over 5%\nTell customers plainly and keep quoted prices" ] )
		. $b( 'cta-inline', [ 'title' => 'Change all your prices in one go', 'text' => 'Shopinbos lets you raise a whole category by a percentage, and updates your WhatsApp catalogue too.', 'linkLabel' => 'See pricing', 'linkUrl' => '/pricing/' ] );

	$tiktok = $p( 'On TikTok, nobody stops for an advert. They stop for something that looks real, quick and useful. The good news: your phone and ten minutes are enough.' )
		. $p( 'Here are five video ideas that make people comment “how much?”.' )
		. $h( '1. The unboxing' )
		. $p( 'Open a new delivery on camera. Show the packing, then the product, then one close-up. People love seeing what arrives.' )
		. $h( '2. Three ways to wear or use it' )
		. $p( 'One product, three looks or uses, three seconds each. It answers “will it suit me?” before anyone asks.' )
		. $h( '3. Before and after' )
		. $p( 'A plain outfit, then with your bag. A messy shelf, then with your organiser. The change does the selling.' )
		. $h( '4. Packing an order' )
		. $p( 'Film your hands packing a real order, with the customer’s name covered. It shows you are a real shop that really delivers.' )
		. $h( '5. Answer a real question' )
		. $p( 'Take a question from your chats, like “is the leather real?”, and answer it in 15 seconds with the product in your hand.' )
		. $b( 'checklist', [ 'title' => 'Before you post', 'items' => "Show the product in the first 2 seconds\nFilm in daylight, near a window\nPut the price in the caption or on screen\nAdd your store link in your bio\nReply to the first comments within an hour" ] )
		. $b( 'callout', [ 'kind' => 'tip', 'text' => 'Short beats perfect. A 12-second video you post today does more than a polished one you post next month.' ] )
		. $b( 'stats', [ 'title' => 'What to aim for', 'items' => "7–20 sec | Length that people watch to the end\n3 a week | Enough to learn what works\n1 hour | Reply to comments within it", 'foot' => 'Starting points, not rules. Your own views and comments will show what your customers like.' ] )
		. $b( 'faq', [ 'items' => "Do I need to show my face? | No. Hands, products and your voice are enough. Many shops never show a face.\nCan Shopinbos make videos for me? | Yes. Upload product photos and Shopinbos makes a short video for ₦1,000 each, ready for TikTok, Reels and Status.\nShould I sell on TikTok Shop? | If it is open in your area, apply from the app. Until then, your store link in your bio works well." ] )
		. $b( 'cta-inline', [ 'title' => 'Turn your photos into videos', 'text' => 'Rex builds your store, and your products are ready to share on TikTok, Instagram and WhatsApp.', 'linkLabel' => 'Learn TikTok in the Academy', 'linkUrl' => '/academy/instagram-tiktok-and-ads/' ] );

	$photos = $p( 'You don’t need a studio. You need daylight, something plain behind the product and a steady hand. These ten tips work with any phone.' )
		. $b( 'steps', [ 'title' => '10 phone photo tips', 'items' => "Shoot near a window | Soft daylight in the morning or late afternoon. Turn off the room light.\nUse a plain background | A white bedsheet, a wall or a sheet of cardboard.\nBounce light with white cardboard | Hold it opposite the window to fill in shadows.\nClean your lens | Wipe it with your shirt. Most blurry photos are a dirty lens.\nTap to focus | Tap on the product, then slide down a little if it looks too bright.\nDon’t zoom | Move closer instead. Zoom makes photos grainy.\nShoot from the angle buyers care about | Shoes from the side, bags from the front, food from above.\nTake one detail shot | The stitching, the zip, the texture.\nShow the size | A hand, a phone or a person next to it.\nKeep every photo the same style | Same background and light makes your store look professional." ] )
		. $b( 'callout', [ 'kind' => 'tip', 'text' => 'Take five photos of every product: front, back, side, detail and one in use. That is enough for your store and a week of Status posts.' ] )
		. $b( 'do-dont', [ 'title' => 'Common mistakes', 'dos' => "Use the back camera, not the selfie camera\nShoot more than you need and pick the best\nCrop so the product fills most of the photo", 'donts' => "Use heavy filters that change the colour\nShoot at night under yellow bulbs\nUse other shops’ photos of the same product" ] )
		. $b( 'callout', [ 'kind' => 'warn', 'text' => 'Colour must match real life. Most returns for “it’s not what I saw” start with a filter.' ] )
		. $b( 'cta-inline', [ 'title' => 'Rex tidies your photos for you', 'text' => 'Upload your phone photos and Rex removes the background, fixes the light and builds your store around them.', 'linkLabel' => 'See templates', 'linkUrl' => '/templates/' ] );

	$tola = $b( 'callout', [ 'kind' => 'note', 'title' => 'An example story', 'text' => 'Tola is not a real person. This story shows a common path we see, so you can picture the steps for your own shop.' ] )
		. $p( 'Tola sold bags from a small stall in Yaba for four years. Good stock, loyal customers, and everything in one notebook: orders, debts, who wanted which colour.' )
		. $h( '1. The notebook problem' )
		. $p( 'Customers began asking on WhatsApp instead of visiting. Tola answered every “price?” by hand, sent bank details, then waited. Some paid, some didn’t, and nobody could see what was left in stock.' )
		. $b( 'quote', [ 'text' => 'I was busy all day, but at night I could not say how much I made.', 'name' => 'Tola', 'shop' => 'Bags, Yaba', 'isExample' => true ] )
		. $h( '2. One link instead of fifty chats' )
		. $p( 'Tola photographed the twenty best sellers by the stall window one morning. Rex built a store from the photos, with prices and a pay on delivery option, in about ten minutes. The link went on every Status and in the Instagram bio.' )
		. $h( '3. Delivery across Lagos' )
		. $p( 'Before, Tola only sold to people who could come to Yaba. With riders booked from the order, the shop started selling to Lekki, Ikeja and Ikorodu. Pay on delivery with codes meant new customers felt safe buying.' )
		. $b( 'stats', [ 'title' => 'Tola’s first year online (example)', 'items' => "20 → 64 | Products in the store\n3 → 11 | Lagos areas delivered to\nFriday | Payouts instead of chasing transfers", 'foot' => 'Example figures to show the kind of change, not a real shop’s results.', 'tone' => 'light' ] )
		. $h( '4. What Tola would do again' )
		. $b( 'takeaways', [ 'items' => "Start with the 20 products that already sell\nPut the store link everywhere, every day\nUse pay on delivery to win new customers’ trust\nCheck the numbers every Friday, not every night" ] )
		. $b( 'cta-inline', [ 'title' => 'Move your shop from a notebook to one app', 'linkLabel' => 'Read more seller stories', 'linkUrl' => '/blog/category/seller-stories/' ] );

	$notmine = $p( 'Sooner or later a delivery goes wrong: the wrong item, a no-show or a damaged parcel. What you do in the next hour decides whether you lose a customer or keep one for years.' )
		. $h( '1. Stay calm and get the facts' )
		. $p( 'Before you reply, check the order: what was ordered, what was packed, who delivered and when. Ask the customer for a photo. Most problems are mix-ups, not lies.' )
		. $b( 'steps', [ 'title' => 'The first hour', 'items' => "Reply quickly | “Sorry about this. Let me check and fix it.” Even if you don’t know yet.\nAsk for a photo | Of the parcel and the label.\nCheck your records | The order, the packing photo and the rider’s notes.\nOffer one clear fix | Swap, refund or redelivery, with a time." ] )
		. $h( '2. Wrong item' )
		. $p( 'Apologise and send the right one. Ask the rider to collect the wrong item on the same trip. Don’t make the customer pay twice for your mistake.' )
		. $h( '3. Customer not around' )
		. $p( 'If the customer did not confirm, this one is on the process. Confirm every pay on delivery order before booking a rider. If they confirmed and still weren’t there, rebook once and ask for payment first next time.' )
		. $h( '4. Damaged parcel' )
		. $p( 'Ask for photos straight away. If the partner damaged it, report it in the app with the photos so the claim goes to them. Send a replacement or refund without waiting for the claim.' )
		. $b( 'callout', [ 'kind' => 'tip', 'text' => 'Take a photo of every parcel before it leaves. It takes five seconds and settles most arguments.' ] )
		. $b( 'do-dont', [ 'title' => 'In the chat', 'dos' => "Say sorry once, then fix it\nUse voice notes if typing feels cold\nTell them exactly when the fix will arrive", 'donts' => "Blame the rider in front of the customer\nGo silent while you check\nArgue about who is right" ] )
		. $b( 'faq', [ 'items' => "Who pays when the partner damages a parcel? | The delivery partner. Report it in the app with photos within 24 hours.\nShould I refund before I get the item back? | For small amounts and good customers, yes. It costs less than losing them.\nWhat if a customer says they never got it but the code was entered? | The code proves delivery. Share the delivery record calmly and offer to check with the rider." ] )
		. $b( 'cta-inline', [ 'title' => 'Deliveries with codes and photos', 'text' => 'Every Shopinbos delivery has tracking, a code and a record you can share.', 'linkLabel' => 'Delivery on Shopinbos', 'linkUrl' => '/delivery/' ] );

	$baker = $b( 'callout', [ 'kind' => 'note', 'title' => 'An example setup', 'text' => 'This is an example food brand, not a real one. It shows a setup any small food business can copy.' ] )
		. $p( 'A small snack brand in Surulere packs chin chin, plantain chips and spiced peanuts. Orders come in on WhatsApp, Instagram and TikTok from early morning. On a busy day it is 40 orders, and missing one means a customer who buys elsewhere next time.' )
		. $h( '1. A store link, not a price list picture' )
		. $p( 'Instead of sending a photo of the price list and typing every order by hand, the brand shares one store link. Customers pick products, pack sizes and quantities, and pay or choose pay on delivery.' )
		. $h( '2. Every order in one list' )
		. $p( 'Orders from the store, WhatsApp and Instagram all land in the Shopinbos app, with what is paid, packed and on the way. Stock goes down with every sale, so nobody sells a pack that is not on the shelf.' )
		. $b( 'steps', [ 'title' => 'A day at the snack brand', 'items' => "7:00 | Orders arrive from the store link, WhatsApp and Instagram.\n10:00 | Packs labelled and ticked as packed in the app.\n11:00 | Riders booked from the orders, interstate parcels sent with a delivery company.\n18:00 | Pay on delivery cash confirmed with codes and paid in." ] )
		. $h( '3. Fewer chats, more selling' )
		. $p( 'Peggy answers the common questions on WhatsApp: prices, pack sizes, delivery areas and “is it still available?”. The owner only steps in for bulk orders from shops.' )
		. $b( 'stats', [ 'title' => 'What changed (example)', 'items' => "40 a day | Orders without missing one\n1 link | Instead of typing every order\n0 | Orders lost in the chat", 'foot' => 'Example figures to show the kind of change, not a real shop’s results.' ] )
		. $b( 'checklist', [ 'title' => 'Copy this setup', 'items' => "Add every product with clear photos, pack sizes and prices\nTrack stock for each pack size\nShare the store link on Status every morning\nOffer bundles and a wholesale price for shops\nLet Peggy answer the common questions" ] )
		. $b( 'cta-inline', [ 'title' => 'Set up your food store', 'text' => 'Rex builds a food store from your product photos, with pack sizes, delivery and pay on delivery.', 'linkLabel' => 'See the Pantry template', 'linkUrl' => '/templates/pantry/' ] );

	return [
		[ 'how-to-get-your-first-10-orders-from-whatsapp-status', 'selling-on-whatsapp', 'How to get your first 10 orders from WhatsApp Status', 'No ad budget needed. Turn the people who already watch your Status into customers, one post at a time.', '2026-10-12 08:00', 'person-hero.webp', '#FFEDE4', 'contain', true, 420, 'turn-your-status-into-a-shop-window', $first10 ],
		[ 'pay-on-delivery-without-the-stress', 'payments', 'Pay on delivery without the stress: codes, riders and refunds', 'How the 4-digit code stops “I never got it” arguments, and what to do when a buyer refuses at the gate.', '2026-10-09 08:00', 'tote-bag.webp', '#FDF0D5', 'cover', false, 380, '', $pod ],
		[ 'dropshipping-in-nigeria-what-you-keep', 'find-stock', 'Dropshipping in Nigeria: what you keep and what you risk', 'Real numbers on a ₦28,000 tote bag, from supplier price to your bank on Friday.', '2026-10-06 08:00', 'leather-slides.webp', '#E3EEFD', 'cover', false, 350, '', $drop ],
		[ 'pricing-when-the-naira-moves', 'payments', 'Pricing your products when the naira moves every week', 'A simple rule for updating prices without scaring your regular customers.', '2026-10-02 08:00', 'camera.webp', '#F6F5F9', 'cover', false, 260, '', $naira ],
		[ 'selling-on-tiktok-short-videos', 'instagram-and-tiktok', 'Selling on TikTok: short videos that make people ask “how much?”', 'Five video ideas you can shoot on your phone in under ten minutes.', '2026-09-28 08:00', 'person-gadgets.webp', '#E7E1FF', 'cover', false, 300, '', $tiktok ],
		[ 'product-photo-tips-phone-and-window', 'instagram-and-tiktok', '10 product photo tips using only your phone and a window', 'Daylight, a plain sheet and one trick with a white cardboard. That is all.', '2026-09-24 08:00', 'block-heels.webp', '#FFEDE4', 'cover', false, 210, '', $photos ],
		[ 'from-a-yaba-stall-to-selling-across-lagos', 'seller-stories', 'From a Yaba stall to selling across Lagos: a bag seller’s first year online', 'What changed when the shop moved from a notebook to one app. An example story.', '2026-09-20 08:00', 'person-fashion.webp', '#FCE4EC', 'contain', false, 150, '', $tola ],
		[ 'when-a-delivery-goes-wrong', 'delivery', '“I didn’t order this”: what to do when a delivery goes wrong', 'A calm, step-by-step way to handle wrong items, no-shows and damaged parcels.', '2026-09-16 08:00', 'person-food.webp', '#FDF0D5', 'cover', false, 190, '', $notmine ],
		[ 'snack-brand-40-orders-a-day', 'seller-stories', 'How a small snack brand takes 40 orders a day without missing one', 'One store link for WhatsApp, Instagram and TikTok, stock that stays right and pay on delivery. An example setup.', '2026-09-11 08:00', 'bread-rolls.webp', '#FFF4DA', 'cover', false, 120, '', $baker ],
	];
}
