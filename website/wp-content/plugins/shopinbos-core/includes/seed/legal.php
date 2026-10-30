<?php
/**
 * Seed content: the legal documents (canvas v7, Legal board). Drafts for legal review.
 * [slug, title, lead, summary lines, [[heading, [paragraphs], in short], ...], contact email]
 */

defined( 'ABSPATH' ) || exit;

function sib_seed_legal_markup( array $summary, array $sections ): string {
	$out = sib_seed_b( 'legal-summary', [ 'items' => implode( "\n", $summary ) ] );
	foreach ( $sections as [ $heading, $paras, $short ] ) {
		$out .= sib_block_group_open( 'lgl-sec', 'section' ) . sib_block_h( 2, esc_html( $heading ), '' );
		foreach ( $paras as $para ) {
			$out .= sib_block_p( esc_html( $para ) );
		}
		$out .= sib_block_p( '<strong>' . esc_html__( 'In short:', 'shopinbos' ) . '</strong> ' . esc_html( $short ), 'in-short' ) . sib_block_group_close( 'section' );
	}
	return $out;
}

function sib_seed_legal_docs(): array {
	$extra = (array) json_decode( (string) file_get_contents( __DIR__ . '/legal-extra.json' ), true );
	return array_merge( sib_seed_legal_core(), $extra );
}

/** The first seven documents; the rest are in legal-extra.json. */
function sib_seed_legal_core(): array {
	return json_decode( <<<'JSON'
[
 [
  "terms",
  "Terms of service",
  "These terms are the agreement between you and Shopinbos when you use Shopinbos Business, our app and website to sell.",
  [
   "You own your shop, your products and your customers.",
   "You pay the plan you choose. Your customers’ card payments go straight to your bank.",
   "Rex and Peggy help, but you decide what gets published or sent.",
   "You can leave any time and take your data with you."
  ],
  [
   [
    "Who we are",
    [
     "Shopinbos Business, the Shopinbos app and website for sellers, suppliers and delivery partners, is run by Tech Della Solutions Ltd (RC 7038770), a company registered with the Corporate Affairs Commission in Nigeria, with its office in Lagos. “We” and “us” in these terms means Tech Della Solutions Ltd, which runs Shopinbos. These terms cover Shopinbos Business. Shopinbos Plug, a separate app for shoppers run by the same company, may be covered later; if it is, we will say so here.",
     "By creating an account or using Shopinbos Business, you agree to these terms. If you use Shopinbos Business for a business, you agree on behalf of that business."
    ],
    "This is an agreement between you and our company in Lagos."
   ],
   [
    "Your account",
    [
     "You sign in with a code sent to your phone or email. Keep your phone and email safe, because anyone with them can get into your account.",
     "You must be at least 18 years old. One person can run more than one shop, and you can add staff with their own sign-in."
    ],
    "Protect your phone. You must be 18 or older."
   ],
   [
    "Selling on Shopinbos",
    [
     "You are the seller of every order in your store. Your products, descriptions, photos and prices must be accurate, legal and in naira, and must follow our Seller rules.",
     "You keep ownership of everything you upload. You give us permission to show it, store it and share it with the services that run your store, only so we can provide Shopinbos to you."
    ],
    "You are responsible for what you sell. Your content stays yours."
   ],
   [
    "Fees and payouts",
    [
     "You pay the plan you choose on our Pricing page, plus the payment and delivery fees shown there. We tell you at least 30 days before any fee changes.",
     "Card and bank payments are processed by Paystack (or Korapay), which splits each payment at checkout: your share is settled straight to your bank, usually the next working day, and each dropship supplier’s cost straight to theirs. Shopinbos never holds your money.",
     "Refunds, returns and disputes with your own customers are between you and them, under your return policy and our minimum standard. Money owed between you and a supplier or delivery partner is handled in your Shopinbos Wallet, under the Supplier terms and Delivery partner terms.",
     "If a customer’s bank reverses a card payment (a chargeback) and Paystack takes it from Shopinbos, you owe it back to us. Until it is paid, part of your later sales pays it off. If we see signs of fraud, we may pause card payments to your store while we check, and tell you why."
    ],
    "Paid straight to your bank. We never hold your money."
   ],
   [
    "Rex, Peggy and other AI features",
    [
     "Rex and Peggy use artificial intelligence to draft store pages, replies, captions and ads. They can make mistakes. You are responsible for what you publish and send, and you can turn automatic replies off at any time.",
     "We do not use your customers’ private messages to train public AI models."
    ],
    "The AI helps, you stay in charge."
   ],
   [
    "Suppliers and delivery partners",
    [
     "Suppliers and delivery partners on Shopinbos are independent businesses. We check their registration documents before they join, but we do not make or ship their products ourselves.",
     "If a supplier sends the wrong or damaged goods, or a parcel is lost or damaged after pickup, claim it in your Shopinbos Wallet within 7 days of delivery. If you don’t agree, our team decides."
    ],
    "Partners are checked, independent businesses. Claim problems within 7 days."
   ],
   [
    "Ending your account",
    [
     "You can close your account at any time from Settings and download your products, orders and customer list first.",
     "We may pause or close an account that breaks these terms or our Seller rules. Except in cases of fraud or danger to others, we will warn you first and give you time to fix the problem."
    ],
    "You can leave any time. We warn you before closing your account, except for fraud."
   ],
   [
    "Our responsibility to you",
    [
     "We work hard to keep Shopinbos running, but we cannot promise it will never go down. If we are responsible for a loss, our total liability is limited to the fees you paid us in the 12 months before it happened.",
     "Nothing in these terms limits any responsibility that Nigerian law, including the Federal Competition and Consumer Protection Act, does not allow us to limit."
    ],
    "Our liability is limited to what you paid us in the last year, except where the law says otherwise."
   ],
   [
    "Disputes and the law",
    [
     "These terms are governed by the laws of the Federal Republic of Nigeria. If we disagree, we will first try to settle it through our support team. If that does not work, either of us may refer it to mediation at the Lagos Multi-Door Courthouse, and then to the courts of Lagos State."
    ],
    "Nigerian law applies. Talk to us first, then mediation, then the Lagos courts."
   ],
   [
    "Changes to these terms",
    [
     "If we change these terms, we will tell you in the app and on WhatsApp at least 30 days before the change takes effect. If you keep using Shopinbos after that, the new terms apply."
    ],
    "We give you 30 days’ notice of changes."
   ]
  ],
  "legal@shopinbos.com"
 ],
 [
  "privacy",
  "Privacy policy",
  "This policy explains what personal data we collect, why, who we share it with, and the rights you have under the Nigeria Data Protection Act 2023.",
  [
   "We collect only what we need to run your shop and pay you.",
   "Your customers’ data is yours. We only process it to run your store.",
   "We never sell personal data.",
   "You can see, correct, download or delete your data at any time."
  ],
  [
   [
    "Who is responsible for your data",
    [
     "Tech Della Solutions Ltd (RC 7038770) runs Shopinbos Business and is the data controller for information about you as a seller, supplier or delivery partner. This policy covers Shopinbos Business. Shopinbos Plug, a separate app for shoppers run by the same company, may be covered later; if it is, we will say so here. For your customers’ details, you are the controller and we process them for you, under these terms and the Nigeria Data Protection Act 2023 (NDPA).",
     "You can reach our Data Protection Officer at privacy@shopinbos.com."
    ],
    "We look after your data. You look after your customers’ data, and we help."
   ],
   [
    "What we collect",
    [
     "Account details: your name, phone number, email, business name and, for payouts, your bank details. For suppliers and delivery partners, your business registration (CAC or BN).",
     "Shop details: products, prices, orders, messages with customers and delivery addresses.",
     "Device and usage details: the app version, device type, approximate location and the pages you use, to keep Shopinbos secure and working well."
    ],
    "Your account, your shop, and basic device information."
   ],
   [
    "Why we use it",
    [
     "To run your store, take payments, arrange deliveries and pay you. To prevent fraud and meet our legal duties, including tax and anti-money-laundering rules. To improve Shopinbos. And, only if you agree, to send you tips and offers."
    ],
    "To run Shopinbos, keep it safe and follow the law. Marketing only with your OK."
   ],
   [
    "AI processing",
    [
     "When you use Rex or Peggy, the text and images involved are processed by our AI service providers under contracts that stop them from using your data to train their own public models. You can turn Peggy’s automatic replies off at any time."
    ],
    "AI providers process your data for you only, not for their own training."
   ],
   [
    "Who we share it with",
    [
     "Payment providers such as Paystack, to take payments and make payouts. Delivery partners, who receive only the buyer’s name, phone number and address needed for a delivery. Suppliers, who receive shipping details for dropship orders. Service providers who host our systems. Authorities, when the law requires it.",
     "We never sell personal data."
    ],
    "Only the people who need it to complete an order. We never sell it."
   ],
   [
    "Where it is stored and for how long",
    [
     "Your data is stored on secure servers, some of which may be outside Nigeria. When data leaves Nigeria, we use the safeguards the NDPA requires.",
     "We keep account data while your account is open. We keep financial records for 6 years after an order, as Nigerian law requires, and delete or anonymise everything else within 90 days of you closing your account."
    ],
    "Stored securely. Kept only as long as needed."
   ],
   [
    "Your rights",
    [
     "You can ask to see, correct, download or delete your personal data, or object to how we use it. Most of this you can do yourself in Settings. For anything else, email privacy@shopinbos.com and we will reply within 30 days.",
     "If you are not happy with our answer, you can complain to the Nigeria Data Protection Commission."
    ],
    "See it, fix it, download it, delete it. Complain to the NDPC if we get it wrong."
   ]
  ],
  "privacy@shopinbos.com"
 ],
 [
  "refunds",
  "Refunds and returns",
  "How refunds and returns work for people who buy from Shopinbos stores, and for Shopinbos plans.",
  [
   "Each shop sets its own return policy, but every shop must meet our minimum standard.",
   "Wrong or damaged items can be reported within 48 hours with a photo.",
   "With pay on delivery, check the parcel before you give the rider your code.",
   "Approved refunds reach you within 5 working days."
  ],
  [
   [
    "Buying from a Shopinbos store",
    [
     "Each shop sets its own return policy, shown on the product page and in your receipt. Every shop must at least accept returns for items that are wrong, damaged or not as described."
    ],
    "Each shop has its own policy, with a minimum standard."
   ],
   [
    "Reporting a problem",
    [
     "Report a problem within 48 hours of delivery using the link in your receipt or by replying on WhatsApp. Add a photo of the item and the packaging.",
     "Your payment went to the shop, not to Shopinbos, so refunds come from the shop. If a shop doesn’t answer within 2 days, tell us: we can’t refund you ourselves, but we can pause shops that don’t meet our minimum standard."
    ],
    "Report within 48 hours with a photo. Refunds come from the shop."
   ],
   [
    "Pay on delivery",
    [
     "When you pay on delivery, you get a 4-digit code. Check the parcel before you give the code to the rider. If the item is wrong, you can refuse it and you will not be charged."
    ],
    "Check first. Give the code only when you are happy."
   ],
   [
    "How refunds are paid",
    [
     "Approved refunds go back to the way you paid: to your card, your bank account for transfers, or your bank account for pay on delivery. Refunds arrive within 5 working days of approval."
    ],
    "Back to how you paid, within 5 working days."
   ],
   [
    "Dropship orders",
    [
     "Some products are shipped directly by a supplier. The shop you bought from arranges the return with them. You do not pay for returning a wrong or damaged item."
    ],
    "Free returns for wrong or damaged dropship items."
   ],
   [
    "Shopinbos plans",
    [
     "Monthly plans are not refunded, but you can cancel any time and keep your plan until the end of the month. Yearly plans can be refunded in full within 14 days of payment, and part-refunded for unused months after that."
    ],
    "Cancel monthly any time. Yearly plans: full refund within 14 days."
   ]
  ],
  "legal@shopinbos.com"
 ],
 [
  "cookies",
  "Cookies",
  "Cookies are small files that help our website and stores work. Here is what we use and how to control them.",
  [
   "We use essential cookies to keep you signed in and your basket working.",
   "Analytics cookies only run if you say yes.",
   "We do not use advertising cookies without your consent."
  ],
  [
   [
    "Essential cookies",
    [
     "These keep you signed in, remember what is in your basket and keep payments secure. The site does not work without them, so they cannot be turned off."
    ],
    "Needed for the site to work."
   ],
   [
    "Preference cookies",
    [
     "These remember choices like your language, so lessons open in Pidgin if that is what you picked."
    ],
    "Remember your choices."
   ],
   [
    "Analytics cookies",
    [
     "If you agree, we use these to count visits and see which pages help people most. The data is grouped and does not tell us who you are."
    ],
    "Only with your OK."
   ],
   [
    "Store owners’ cookies",
    [
     "Sellers can add tools like the Meta Pixel or Google Analytics to their stores. These only run after a shopper accepts them in the cookie banner."
    ],
    "Shop tracking tools wait for your consent."
   ],
   [
    "Changing your choice",
    [
     "Use “Cookie settings” at the bottom of any page to change your choice at any time."
    ],
    "Change it any time."
   ]
  ],
  "legal@shopinbos.com"
 ],
 [
  "seller-rules",
  "Seller rules",
  "The rules every shop on Shopinbos follows, so buyers can trust every store.",
  [
   "Sell only legal, genuine products.",
   "Describe items honestly and deliver what you show.",
   "Message customers only when they have asked to hear from you.",
   "Treat buyers, riders and suppliers with respect."
  ],
  [
   [
    "Things you cannot sell",
    [
     "Anything illegal in Nigeria. Fake or copied branded goods. Prescription medicines. Weapons and ammunition. Adult content. Items that need NAFDAC or SON approval when you do not have it. Live animals."
    ],
    "Nothing illegal, fake or dangerous."
   ],
   [
    "Honest listings",
    [
     "Use real photos of what you sell, or the supplier’s photos for dropship items. Show the full price in naira, including any charges, before checkout. Deliver within the time you promise."
    ],
    "What they see is what they get."
   ],
   [
    "Messaging customers",
    [
     "Send broadcasts only to people who have agreed to hear from you, and include a way to stop. Do not buy contact lists."
    ],
    "No spam."
   ],
   [
    "Respect",
    [
     "No insults, threats or discrimination towards buyers, riders, suppliers or our team."
    ],
    "Be decent."
   ],
   [
    "Selling a supplier’s products",
    [
     "For now you can only dropship from suppliers near you. Before you list a supplier’s products, call them, see the stock yourself (visit them or video call) and accept the Dropship agreement in the app. Some suppliers aren’t verified yet: the app shows that, with a risk score, so you can decide.",
     "Your customers are yours: you set the price and handle their refunds and returns under your own policy. If a supplier sends the wrong or damaged goods, or a delivery partner loses a parcel, claim it back in your Shopinbos Wallet within 7 days. If you owe a supplier, a delivery partner or Shopinbos and it is 7 days overdue, you can’t list new supplier products or place wholesale orders until it is paid."
    ],
    "Call them, see the stock, agree. Then sell."
   ],
   [
    "If a rule is broken",
    [
     "We may remove a product, pause your store or close your account, depending on how serious it is. Except for fraud or danger to others, we warn you first and tell you how to fix it."
    ],
    "We warn first, except for fraud."
   ]
  ],
  "legal@shopinbos.com"
 ],
 [
  "supplier-terms",
  "Supplier terms",
  "Extra terms for businesses that list products for Shopinbos shops to sell. These apply together with our Terms of service.",
  [
   "Your cost on every paid dropship order goes straight to your bank. Shopinbos never holds it.",
   "Accept or decline orders on time, and ship within 3 days under the shop’s name.",
   "You take back wrong, damaged or not-as-described items and pay the shop back.",
   "Paid for an order you didn’t send? Pay it back within 3 days, or it comes out of your next orders."
  ],
  [
   [
    "Joining",
    [
     "You need CAC registration, a business bank account in the same name, and stock you can ship within 3 days. We check your documents before your products go live."
    ],
    "Registered business, real stock."
   ],
   [
    "Listing products",
    [
     "Keep your prices, stock and photos up to date. If stock runs out, mark it in the portal straight away so shops stop selling it.",
     "Write your return policy on your profile. Shops see it before they list your products. It can be more generous than the minimum in these terms, never less."
    ],
    "Keep stock accurate, and say what you take back."
   ],
   [
    "Dropship agreements with shops",
    [
     "Before a shop can sell your products by dropship, they call you, see your stock (a visit or a video call) and accept the Dropship agreement in the app. Their request shows under Dropship agreements; accept it only if they really called you and saw your stock.",
     "The agreement is the same for every shop: you keep your stock and prices up to date, ship on time under the shop’s name, never contact the shop’s customers to sell to them directly, take back wrong or damaged items and pay back orders you were paid for but didn’t send. You can decline new orders at any time."
    ],
    "Shops call you and see your stock first. You both agree."
   ],
   [
    "Shipping dropship orders",
    [
     "Accept or decline each order in the time shown in the portal. Ship within 3 days using the shop’s label and no marketing of your own inside the parcel."
    ],
    "Ship fast, under the shop’s name."
   ],
   [
    "How you are paid",
    [
     "When a shopper pays by card or bank, Paystack splits the payment at checkout and settles your cost straight to your bank, on Paystack’s schedule (usually the next working day). Shopinbos never holds your money, and you see every payment in your Shopinbos Wallet.",
     "Listing is free. Any fee Shopinbos charges is shown in the app before it applies to you.",
     "If a shop hasn’t got a Shopinbos Wallet, or the shopper pays on delivery, the shop pays you directly."
    ],
    "Paid straight to your bank. We never hold it."
   ],
   [
    "Orders you were paid for but didn’t send",
    [
     "If you were paid for a dropship order at checkout and then decline it, miss the time to accept it, or it is cancelled before you send it, you owe the shop what you were paid. It shows in your Shopinbos Wallet, where you can pay it back.",
     "Pay it within 3 days. After that, until it is paid, up to half of your cost on each later order goes to the shop instead, straight to their bank."
    ],
    "Pay it back within 3 days."
   ],
   [
    "Returns and claims",
    [
     "You take back items that are wrong, damaged, faulty, not as described, or fewer than ordered, and you pay the shop back what they paid you for them. You collect them, or pay for them to be sent back.",
     "A shop can claim in the app within 7 days of delivery. You can accept the claim or say why it isn’t right. If you don’t agree, our team decides using what the app recorded (the order, tracking, dates and messages) and what you both send us. Either of you can ask for the decision to be reviewed by writing to legal@shopinbos.com.",
     "An accepted or upheld claim is due within 3 days. After that it comes out of your later orders in the same way.",
     "Returns because a shopper changed their mind are between the shop and the shopper, unless your own return policy offers to take them."
    ],
    "Your goods, your responsibility. We decide disputes."
   ],
   [
    "Quality",
    [
     "If too many of your orders are returned, late or not sent, we may pause your listings while we work with you to fix it.",
     "If something you owe is 7 days overdue, you are paused from new business: shops can’t find your products and no new shop can start selling them. Orders you already have carry on, so your sales keep paying it off. The pause lifts as soon as it is paid."
    ],
    "Quality keeps your listings live."
   ]
  ],
  "legal@shopinbos.com"
 ],
 [
  "delivery-partner-terms",
  "Delivery partner terms",
  "Extra terms for delivery companies and riders who take jobs from Shopinbos shops. These apply together with our Terms of service.",
  [
   "Delivery fees paid in the app go straight to your bank. Shopinbos never holds them.",
   "Cash from pay on delivery belongs to the shop: pass it on by 6pm the same day.",
   "You are responsible for parcels from pickup until delivery.",
   "A refused or failed delivery that isn’t your fault is still paid."
  ],
  [
   [
    "Joining",
    [
     "Delivery companies need CAC registration, goods-in-transit insurance and riders with checked papers. Riders joining directly need a valid ID, a roadworthy bike and a guarantor."
    ],
    "Registered, insured, checked."
   ],
   [
    "Taking jobs",
    [
     "Accept or decline each job in the app. Once accepted, pick up within the time shown and keep the buyer updated through the app."
    ],
    "Accept, pick up on time, keep people updated."
   ],
   [
    "Pay on delivery",
    [
     "Collect payment only with the buyer’s 4-digit code. The cash belongs to the shop that sold the order, never to you or to Shopinbos.",
     "Pass it to the shop by 6pm the same day (6pm the next day for cash collected after 6pm): pay it in the app, which sends it straight to the shop’s bank, or hand it over and the shop confirms it. Partners who are late are paused from new pay-on-delivery jobs until it is paid."
    ],
    "Code first. The shop’s cash, passed on by 6pm."
   ],
   [
    "How you are paid",
    [
     "When a shop pays your delivery fee in the app, Paystack settles it straight to your bank on its usual schedule. Shopinbos never holds it. Shops that don’t pay in the app pay you directly.",
     "Joining is free. Any fee Shopinbos charges is shown in the app before it applies to you."
    ],
    "Paid straight to your bank."
   ],
   [
    "Refused and failed deliveries",
    [
     "If the buyer refuses the parcel, isn’t there or can’t be reached, record it in the app and bring the parcel back to where you picked it up. The shop pays the delivery fee for the attempt and the return trip, as agreed in the quote. Whether the buyer gets their money back is between the shop and the buyer."
    ],
    "Not your fault: you are still paid."
   ],
   [
    "Lost or damaged parcels",
    [
     "You are responsible for a parcel from pickup until the buyer gives the delivery code. If it is lost or damaged in that time, you owe the shop what the goods were worth on the order. Your goods-in-transit insurance is there to cover this, and we help you with the paperwork.",
     "The shop claims in the app within 7 days. You can accept the claim or say why it isn’t right. If you don’t agree, our team decides using what the app recorded (pickup time, rider location, delivery code, photos) and what you both send us. Either of you can ask for the decision to be reviewed by writing to legal@shopinbos.com.",
     "An accepted or upheld claim is due within 3 days. After that, until it is paid, up to half of each delivery fee paid to you in the app goes to the shop instead, straight to their bank.",
     "If it is still owed 7 days after it was due, new shops can’t find or book you until it is paid. Shops you already work with can still book you, so your fees keep paying it off."
    ],
    "From pickup to the code, the parcel is yours to protect."
   ]
  ],
  "legal@shopinbos.com"
 ]
]
JSON, true );
}
