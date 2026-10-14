<?php
/**
 * Title: About page
 * Slug: shopinbos/page-about
 * Categories: shopinbos-pages
 * Description: Who we are: hero, photo mosaic, what Shopinbos does, why we started, what we believe, how to reach us, closing CTA.
 * Post Types: page
 */
$img    = fn( $f ) => sib_theme_img( $f );
$mosaic = '<div class="wrap mosaic">'
	. '<div class="tile" style="background:#FFEDE4;grid-row:span 2"><img class="cut" src="' . $img( 'person-hero.webp' ) . '" alt="A seller showing a product on her phone" loading="lazy"><span class="chipw" style="left:14px;top:14px">Sells everywhere</span></div>'
	. '<div class="tile"><img class="fill" src="' . $img( 'person-food.webp' ) . '" alt="A baker behind his counter" loading="lazy" style="object-position:66% 30%"><span class="chipw" style="left:14px;bottom:14px">Snacks · Ibadan</span></div>'
	. '<div class="tile txt" style="background:#0C4A44;color:#fff"><img src="' . $img( 'rex.webp' ) . '" alt="" width="72" height="72" loading="lazy" style="width:72px;height:72px;object-fit:contain"><b class="disp" style="font-size:22px;line-height:1.15">Rex builds the store with you</b></div>'
	. '<div class="tile" style="background:#E7E1FF"><img class="cut" src="' . $img( 'person-cta-left.webp' ) . '" alt="A fashion seller" loading="lazy"><span class="chipw" style="left:14px;top:14px">Fashion</span></div>'
	. '<div class="tile"><img class="fill" src="' . $img( 'person-gadgets.webp' ) . '" alt="A gadget seller checking orders on his laptop" loading="lazy" style="object-position:60% 30%"><span class="chipw" style="left:14px;bottom:14px">Gadgets · Ikeja</span></div>'
	. '<div class="tile txt" style="background:#FFE27A"><img src="' . $img( 'peggy.webp' ) . '" alt="" width="72" height="72" loading="lazy" style="width:72px;height:72px;object-fit:contain"><b class="disp" style="font-size:22px;line-height:1.15">Peggy answers your customers</b></div>'
	. '<div class="tile" style="background:#FCE4EC"><img class="cut" src="' . $img( 'person-cta-right.webp' ) . '" alt="A smiling seller" loading="lazy"><span class="chipw" style="left:14px;top:14px">Made in Lagos</span></div>'
	. '</div>';
$card = fn( $bg, $icon, $fg, $title, $text, $class = 'card about-card' ) => sib_block_group_open( $class ) . sib_block_html( '<span class="av" style="background:' . $bg . ';width:48px;height:48px" aria-hidden="true">' . sib_theme_icon( $icon, 22, $fg ) . '</span>' ) . sib_block_h( 3, $title, 'disp tt' ) . sib_block_p( $text, 'p' ) . sib_block_group_close();

// Hero
echo sib_block_group_open( 'ahero', 'section' ) . sib_block_group_open( 'wrap ahero-in' )
	. sib_block_p( 'About Shopinbos', 'pill-label' )
	. sib_block_h( 1, 'We make it easy to <span class="grad">sell online</span> and reach your customers', 'disp h1 mw-900' )
	. sib_block_p( 'Find products to sell, sell them everywhere your customers are, run your store, talk to your customers and get paid. One app, built for Nigerian businesses.', 'lead mw-640' )
	. sib_block_buttons( [ [ 'Start your shop', '/go/signup', 'accent' ], [ 'Visit the free Academy', '/academy/', 'ghost' ] ], 'center' )
	. sib_block_group_close() . sib_block_group_close( 'section' );

// Mosaic
echo sib_block_group_open( 'about-mosaic', 'section' ) . sib_block_html( $mosaic ) . sib_block_group_close( 'section' );

// What Shopinbos does: the six things a seller needs
$does = [
	[ 'box', '#E3EEFD', '#1F5FBF', 'Find products', 'Stock from verified Nigerian suppliers. Dropship without buying stock, or buy wholesale for a better price.' ],
	[ 'store', '#FFEDE4', '#B23E0A', 'Sell products', 'Rex builds your online store in minutes. Sell there, and on WhatsApp, Instagram, TikTok, Facebook and Google.' ],
	[ 'layers', '#E7E1FF', '#5B3FD6', 'Manage your store', 'Products, prices, stock and orders from every channel in one place, on your phone.' ],
	[ 'truck', '#FDF0D5', '#8A5A08', 'Run your store', 'Card, transfer and pay on delivery, riders booked from the order, and receipts that go out on their own.' ],
	[ 'chat', '#E2F6F1', '#0C4A44', 'Speak with your customers', 'Peggy helps you reply in your chats, follow up and send offers, in English or Pidgin.' ],
	[ 'naira', '#E2F5EA', '#16794A', 'Earn money', 'Payouts to your bank every Friday, and the numbers that show what is selling.' ],
];
echo sib_block_group_open( 'sec', 'section' ) . sib_block_group_open( 'wrap col-32' )
	. sib_block_group_open( 'col center mw-720' ) . sib_block_p( 'What Shopinbos does', 'pill-label' ) . sib_block_h( 2, 'Everything you need to sell online, in one app', 'disp h2 center' ) . sib_block_group_close()
	. sib_block_group_open( 'g3' );
foreach ( $does as [ $icon, $bg, $fg, $title, $text ] ) {
	echo $card( $bg, $icon, $fg, $title, $text );
}
echo sib_block_group_close() . sib_block_group_close() . sib_block_group_close( 'section' );

// Why we started + values
echo sib_block_group_open( 'bg-mist sec', 'section' ) . sib_block_group_open( 'wrap col-32' )
	. sib_block_group_open( 'split split-top' )
	. sib_block_group_open( 'col' ) . sib_block_p( 'Why we started', 'pill-label left' ) . sib_block_h( 2, 'Selling online shouldn’t need a tech degree' ) . sib_block_group_close()
	. sib_block_group_open( 'col about-text' )
	. sib_block_p( 'Nigerian businesses sell everywhere: in their own store, on WhatsApp and Instagram, on TikTok and Facebook, and on Google. Customers find them in one place, ask questions in another and pay in a third. Most tools built for “e-commerce” only cover one of those, and ask sellers to learn new words and new dashboards.' )
	. sib_block_p( 'We built Shopinbos to bring it together. One app to find products, sell them wherever your customers are, manage and run your store, talk to your customers and earn money, with pay on delivery and riders built in. Rex and Peggy do the technical parts, in plain words, in English and Pidgin.' )
	. sib_block_group_close() . sib_block_group_close()
	. sib_block_group_open( 'g3' )
	. $card( '#FFEDE4', 'chat', '#B23E0A', 'Plain words, always', 'If a seller has to ask what a word means, we change the word.' )
	. $card( '#E2F6F1', 'users', '#0C4A44', 'Your customers are yours', 'Your list, your chats, your brand. Take them with you any time.' )
	. $card( '#FDF0D5', 'globe', '#8A5A08', 'Sell where your customers are', 'Your store, chats, social media and Google, all connected. We go to your customers; they don’t have to come to us.' )
	. sib_block_group_close()
	. sib_block_group_close() . sib_block_group_close( 'section' );

// Talk to us
echo sib_block_group_open( 'sec', 'section' ) . sib_block_group_open( 'wrap col-22' )
	. sib_block_h( 2, 'Talk to us', 'disp h2 center' )
	. sib_block_group_open( 'g3' )
	. $card( '#25D366', 'whatsapp', '#FFFFFF', 'Sellers and support', 'WhatsApp, 8am to 8pm every day, in English or Pidgin. <a href="/contact/">Contact us</a>' )
	. $card( '#F6F5F9', 'mail', '#16141F', 'Partners and press', '<a href="mailto:hello@shopinbos.com">hello@shopinbos.com</a> · <a href="mailto:press@shopinbos.com">press@shopinbos.com</a>' )
	. $card( '#F6F5F9', 'pin', '#16141F', 'Office', 'Shopinbos Technologies Limited, Lagos, Nigeria. Visits by appointment.' )
	. sib_block_group_close()
	. sib_block_group_close() . sib_block_group_close( 'section' );

// Closing CTA
echo '<!-- wp:shopinbos/cta-band {"tone":"orange","title":"Build with us","text":"Start your shop free, or partner with us as a supplier or delivery company.","linkLabel":"Become a partner","linkUrl":"/for-suppliers/"} /-->' . "\n";
