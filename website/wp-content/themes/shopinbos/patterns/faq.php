<?php
/**
 * Title: FAQ (questions and answers)
 * Slug: shopinbos/faq
 * Categories: shopinbos-sections, shopinbos-content
 * Description: Split section with a heading and expandable questions. Becomes FAQPage schema automatically.
 */
$faq = [
	[ 'Do I need a website or a laptop?', 'No. You can build, run and grow your whole shop from the Shopinbos app on your phone. The web app is there when you want a bigger screen, and the advanced store builder works on a laptop.' ],
	[ 'Can I sell products I don’t have in stock?', 'Yes. Pick products from Nigerian suppliers on Shopinbos and add them to your store at your own price. When a customer buys, the supplier packs it with your label and a rider delivers it. You never buy stock first.' ],
	[ 'How does pay on delivery work?', 'For orders up to ₦50,000, buyers can pay the rider in cash or by transfer. They get a 4-digit code and only hand it over when the parcel is in their hands. The rider pays the cash to you directly by 6pm the same day.' ],
	[ 'When do I get my money?', 'Card, transfer and USSD payments settle straight to your own bank account, usually the next working day. Shopinbos never holds your money. For dropship orders, your share and the supplier’s price are split when the buyer pays, and each goes straight to its own bank.' ],
	[ 'Can I use my own domain?', 'Yes. Your store starts at yourname.shopinbos.com for free. You can connect a domain you already own, or buy one inside Shopinbos, and we handle the SSL.' ],
	[ 'What languages does Peggy speak?', 'English, Pidgin, Yorùbá, Hausa and Igbo. She replies in the language your customer writes in, in the voice you set.' ],
];
echo sib_block_group_open( 'bg-mist', 'section', [ 'top' => '24px', 'bottom' => '120px' ] ) . sib_block_group_open( 'wrap split split-top' );
echo sib_block_group_open( 'col' ) . sib_block_p( 'Questions', 'eyebrow' ) . sib_block_h( 2, 'Good to know' ) . sib_block_p( 'Can’t find your answer? Chat with us on WhatsApp and a person will reply.', 'lead' ) . sib_block_group_close();
echo sib_block_group_open( 'faq' );
foreach ( $faq as $i => [ $q, $a ] ) {
	$open  = 0 === $i;
	$attrs = $open ? ' {"showContent":true}' : '';
	echo "<!-- wp:details{$attrs} -->\n<details class=\"wp-block-details\"" . ( $open ? ' open' : '' ) . "><summary>{$q}</summary><!-- wp:paragraph -->\n<p>{$a}</p>\n<!-- /wp:paragraph --></details>\n<!-- /wp:details -->\n\n";
}
echo sib_block_group_close();
echo sib_block_group_close() . sib_block_group_close( 'section' );
