# Translations to review (delivery partners, rider pay, segments)

The Pidgin, Yorùbá, Hausa and Igbo text below was drafted by Claude and still needs a native speaker. That includes
the rider-pay and segment strings flagged in `SHOPINBOS_APP_SYNC.md`, the pay-on-delivery disclaimers (which also need
legal review, see `docs/legal-review-logistics.md`), and the strings added on 2026-10-22. Fix a line in
`shared/i18n/messages/<namespace>/<language>.ts`, keep every `{placeholder}` and plural exactly, and remove the file's
`// Draft: needs native-speaker review` line once the whole file is checked (see `shared/i18n/README.md`).

## Please check these first

1. **Disclaimers must mean exactly the English** (legal wording): the three rows in *delivery* and `cashScreen.sub` /
   `job.podBody` in *m_partner*. The English says four things: (a) it's an arrangement between the business and the
   partner, (b) the partner or their rider collects the cash, (c) settling up is between them, (d) Shopinbos doesn't
   handle, hold or guarantee the money.
2. **Yorùbá "between":** the files use both `láàrin` (48 times) and `láàárín` (49 times), and the disclaimers mix
   them. Pick one spelling.
3. **Hausa "pay" for riders:** `albashi` (salary) is used for per-delivery pay (`riders.payToday`, `riders.payLabel`,
   `riders.paySave`). Is `lada` or `kuɗin aiki` better for pay per job?
4. **Hausa "customers":** `kwastomomi` in the segment strings, `abokin ciniki` in the disclaimers. Use one.
5. **Earnings tab vs title (all four languages):** the rider app's tab says "money *I* made" (`tab.earnings`), and
   the screen title says "money *you* made" (`earn.title`). Both are "Earnings" in English. Keep both, or make
   them the same?
6. **Igbo `riders.payOptionShare`:** `Òkè` has tone marks, but the other Igbo strings don't use them.

Changed on 2026-10-22 without a native speaker (please confirm): Hausa `m_partner: cashScreen.sub`, "Yi alama a nan…"
→ "Yin alama a nan… za ku iya gani" (the sentence needs the verbal noun, "marking", not the command "mark").


### delivery (2)

| Key | English | Pidgin | Yorùbá | Hausa | Igbo |
|---|---|---|---|---|---|
| `pod.disclaimer` | Pay on delivery is an arrangement between you and your logistics partner. Cash is collected by the partner, and settlement is between you and them. Shopinbos does not handle, hold or guarantee pay-on-delivery funds. | Pay on delivery na arrangement between you and your logistics partner. Na the partner dey collect the cash, and settlement na between you and dem. Shopinbos no dey handle, hold or guarantee pay-on-delivery money. | Pay on delivery jẹ́ àdéhùn láàrin ìwọ àti logistics partner rẹ. Partner ni ó ń gba cash náà, settlement sì wà láàrin ìwọ àti wọn. Shopinbos kì í fọwọ́ kan owó pay on delivery, kì í tọ́jú rẹ̀, kò sì ṣe ìdánilójú rẹ̀. | Pay on delivery yarjejeniya ce tsakaninka da logistics partner ɗinka. Partner ne ke karɓar kuɗin hannu, kuma settlement tsakaninka da su ne. Shopinbos ba ya sarrafa, ba ya riƙewa, kuma ba ya ba da tabbacin kuɗin pay on delivery. | Pay on delivery bụ nkwekọrịta n'etiti gị na logistics partner gị. Ọ bụ partner na-anara cash ahụ, settlement dịkwa n'etiti gị na ha. Shopinbos anaghị emetụ ego pay on delivery aka, anaghị ejide ya, anaghịkwa ekwe nkwa maka ya. |
| `pod.disclaimerPartner` | Pay on delivery is an arrangement between you and the shop. Your rider collects the cash from the customer, and you settle it with the shop directly. Shopinbos does not handle, hold or guarantee pay-on-delivery funds. | Pay on delivery na arrangement between you and the shop. Na your rider dey collect the cash from the customer, and na you go settle am with the shop direct. Shopinbos no dey handle, hold or guarantee pay-on-delivery money. | Pay on delivery jẹ́ àdéhùn láàrin ìwọ àti ṣọ́ọ̀bù náà. Rider rẹ ni ó ń gba cash náà lọ́wọ́ oníbàárà, ìwọ àti ṣọ́ọ̀bù náà ni ẹ sì máa ṣe settlement rẹ̀ tààrà. Shopinbos kì í fọwọ́ kan owó pay on delivery, kì í tọ́jú rẹ̀, kò sì ṣe ìdánilójú rẹ̀. | Pay on delivery yarjejeniya ce tsakaninka da shagon. Rider ɗinka ne ke karɓar kuɗin hannu daga abokin ciniki, kuma kai ne za ka yi settlement da shagon kai tsaye. Shopinbos ba ya sarrafa, ba ya riƙewa, kuma ba ya ba da tabbacin kuɗin pay on delivery. | Pay on delivery bụ nkwekọrịta n'etiti gị na ụlọ ahịa ahụ. Ọ bụ rider gị na-anara cash ahụ n'aka onye ahịa, ọ bụkwa gị na ụlọ ahịa ahụ ga-eme settlement ya ozugbo. Shopinbos anaghị emetụ ego pay on delivery aka, anaghị ejide ya, anaghịkwa ekwe nkwa maka ya. |

### m_partner (5)

| Key | English | Pidgin | Yorùbá | Hausa | Igbo |
|---|---|---|---|---|---|
| `cashScreen.sub` | Pay on delivery is between you and each seller. Shopinbos doesn’t collect, hold or guarantee this cash. Marking it here is just a record you can both see. | Pay on delivery na between you and each seller. Shopinbos no dey collect, hold or guarantee this cash. To mark am here na just record wey una two fit see. | Sanwó nígbà ìfijíṣẹ́ wà láàárín ìwọ àti olùtajà kọ̀ọ̀kan. Shopinbos kì í gba, mú tàbí ṣe ìdánilójú owó yìí. Sísàmì síbí jẹ́ àkọsílẹ̀ tí ẹ̀yin méjèèjì lè rí nìkan. | Biya bayan isarwa tsakaninka ne da kowane mai sayarwa. Shopinbos ba ya karɓa, riƙe ko ba da tabbacin wannan kuɗin. Yin alama a nan rikodi ne kawai da ku biyu za ku iya gani. | Ịkwụ mgbe e wetere dị n'etiti gị na onye na-ere ọ bụla. Shopinbos anaghị anata, ejide ma ọ bụ ekwe nkwa ego a. Ịka ya akara ebe a bụ naanị ndekọ unu abụọ ga-ahụ. |
| `job.podBody` | You and {shop} agreed this. Settling up the cash is between you and them. | You and {shop} agree am. To settle the cash na between you and dem. | Ìwọ àti {shop} ló fohùn ṣọ̀kan lórí èyí. Ọ̀rọ̀ owó náà wà láàárín ẹ̀yin méjèèjì. | Kai da {shop} kuka amince da wannan. Daidaita kuɗin tsakaninku ne. | Gị na {shop} kwekọrịtara nke a. Idozi ego ahụ dị n'etiti gị na ha. |
| `overdue.manual` | Pay each seller straight to their bank, or hand them the cash and they'll confirm it. | Pay each seller straight to their bank, or hand the cash give dem and dem go confirm am. | San fún olùtajà kọ̀ọ̀kan tààrà sí báńkì wọn, tàbí fi owó náà lé wọn lọ́wọ́, wọn yóò sì jẹ́rìí rẹ̀. | Biya kowane mai sayarwa kai tsaye zuwa bankinsa, ko ka ba shi kuɗin a hannu, shi kuma zai tabbatar. | Kwụọ onye na-ere ọ bụla ozugbo n'ụlọ akụ ha, ma ọ bụ nye ha ego ahụ n'aka, ha ga-akwado ya. |
| `money.method.seller` | Paid to the seller | Paid to the seller | A san án fún olùtajà | An biya mai sayarwa | Akwụrụ onye na-ere |
| `money.method.sellerConfirmed` | Seller confirmed | Seller don confirm | Olùtajà ti jẹ́rìí | Mai sayarwa ya tabbatar | Onye na-ere akwadola |

### logistics (16)

| Key | English | Pidgin | Yorùbá | Hausa | Igbo |
|---|---|---|---|---|---|
| `riders.payToday` | {amount} rider pay today | {amount} rider pay today | {amount} owó rider lónìí | {amount} albashin rider yau | {amount} ụgwọ rider taa |
| `riders.payLabel` | Pay: {pay} | Pay: {pay} | Owó: {pay} | Albashi: {pay} | Ụgwọ: {pay} |
| `riders.payNotSet` | not set | you never set am | kò tíì ṣètò | ba a saita ba | edobeghị ya |
| `riders.payPerDrop` | {amount} a delivery | {amount} for each delivery | {amount} fún delivery kọ̀ọ̀kan | {amount} kowace delivery | {amount} maka delivery ọ bụla |
| `riders.payShare` | {percent}% of each fee | {percent}% of each fee | {percent}% owó delivery kọ̀ọ̀kan | {percent}% na kowane kuɗin delivery | {percent}% nke ego delivery ọ bụla |
| `riders.payHow` | How you pay this rider | How you dey pay this rider | Bí o ṣe ń sanwó rider yìí | Yadda kake biyan wannan rider | Otu ị si akwụ rider a ụgwọ |
| `riders.payOptionNone` | Not set (the app shows delivery fees) | You never set am (app go show delivery fee) | Kò tíì ṣètò (app máa fi owó delivery hàn) | Ba a saita ba (app zai nuna kuɗin delivery) | Edobeghị ya (app ga-egosi ego delivery) |
| `riders.payOptionPerDrop` | Naira for each delivery | Naira for each delivery | Naira fún delivery kọ̀ọ̀kan | Naira kowace delivery | Naira maka delivery ọ bụla |
| `riders.payOptionShare` | A share of each fee (%) | Share of each fee (%) | Ìpín owó delivery kọ̀ọ̀kan (%) | Kashi na kowane kuɗin delivery (%) | Òkè nke ego delivery ọ bụla (%) |
| `riders.payAmount` | Amount | Amount | Iye | Adadi | Ego ole |
| `riders.paySave` | Save pay | Save pay | Fi owó pamọ́ | Ajiye albashi | Chekwaa ụgwọ |
| `riders.paySaveAria` | Save {name}'s pay | Save {name} pay | Fi owó {name} pamọ́ | Ajiye albashin {name} | Chekwaa ụgwọ {name} |
| `riders.payHint` | The Riders app shows the rider what they earn. Each delivery keeps the pay it was done at. | Riders app go show the rider wetin dem make. Each delivery go keep the pay wey e get when dem do am. | Riders app máa fi owó tí rider pa hàn án. Delivery kọ̀ọ̀kan máa dúró lórí owó tí wọ́n fi ṣe é. | Riders app zai nuna wa rider abin da ya samu. Kowace delivery tana riƙe albashin da aka yi ta da shi. | Riders app ga-egosi rider ego ha kpatara. Delivery ọ bụla na-edebe ụgwọ e ji mee ya. |
| `payin.usualWay` | Pay each seller straight to their bank, or hand them the cash and they'll confirm it. | Pay each seller straight to their bank, or hand the cash give dem and dem go confirm am. | San fún olùtajà kọ̀ọ̀kan tààrà sí báńkì wọn, tàbí fi owó náà lé wọn lọ́wọ́, wọn yóò sì jẹ́rìí rẹ̀. | Biya kowane mai sayarwa kai tsaye zuwa bankinsa, ko ka ba shi kuɗin a hannu, shi kuma zai tabbatar. | Kwụọ onye na-ere ọ bụla ozugbo n'ụlọ akụ ha, ma ọ bụ nye ha ego ahụ n'aka, ha ga-akwado ya. |
| `cash.method.seller` | Paid to the seller | Paid to the seller | A san án fún olùtajà | An biya mai sayarwa | Akwụrụ onye na-ere |
| `cash.method.sellerConfirmed` | Seller confirmed | Seller don confirm | Olùtajà ti jẹ́rìí | Mai sayarwa ya tabbatar | Onye na-ere akwadola |

### rider (2)

| Key | English | Pidgin | Yorùbá | Hausa | Igbo |
|---|---|---|---|---|---|
| `app.earnedToday` | Earned today | Wetin you make today | Owó tí o pa lónìí | Abin da ka samu yau | Ego ị kpatara taa |
| `run.youEarn` | You earn {amount} | You go make {amount} | O máa pa {amount} | Za ka samu {amount} | Ị ga-enweta {amount} |

### m_rider (9)

| Key | English | Pidgin | Yorùbá | Hausa | Igbo |
|---|---|---|---|---|---|
| `earnedToday` | Earned today | Wetin you make today | Owó tí o pa lónìí | Abin da ka samu yau | Ego ị kpatara taa |
| `doneEarned` | Added to your earnings. | We don add am to wetin you make. | A ti fi kún owó tí o pa. | An ƙara shi cikin abin da ka samu. | Agbakwunyela ya n'ego ị kpatara. |
| `tab.earnings` | Earnings | Money wey I make | Owó tí mo pa | Kuɗin shiga | Ego m nwetara |
| `offer.earnCollect` | You earn {earn} · collect {cash} cash | You go make {earn} · collect {cash} cash | O máa pa {earn} · gba {cash} owó lọ́wọ́ | Za ka samu {earn} · karɓi {cash} tsabar kuɗi | Ị ga-enweta {earn} · nara {cash} ego n'aka |
| `youEarn` | You earn {amount} | You go make {amount} | O máa pa {amount} | Za ka samu {amount} | Ị ga-enweta {amount} |
| `earn.title` | Earnings | Money wey you make | Owó tí o pa | Kuɗin shiga | Ego ị nwetara |
| `earn.week` | This week | This week | Ọ̀sẹ̀ yìí | Wannan makon | Izu a |
| `earn.line` | {count, plural, one {# delivery} other {# deliveries}} · {company} pays you | {count, plural, one {# delivery} other {# deliveries}} · {company} go pay you | {count, plural, other {delivery #}} · {company} ló máa sanwó fún ọ | {count, plural, other {delivery #}} · {company} ne za su biya ka | {count, plural, other {delivery #}} · {company} ga-akwụ gị ụgwọ |
| `earn.none` | No deliveries yet this week. | No delivery yet this week. | Kò tíì sí delivery ní ọ̀sẹ̀ yìí. | Babu delivery tukuna a wannan makon. | Enweghị delivery n'izu a ka ugbu a. |

### customers (5)

| Key | English | Pidgin | Yorùbá | Hausa | Igbo |
|---|---|---|---|---|---|
| `segment.label` | Segment | Segment | Segment | Segment | Segment |
| `segment.all` | All customers | All customers | Gbogbo oníbàárà | Duk kwastomomi | Ndị ahịa niile |
| `segment.none` | No saved segments yet. | You never save any segment yet. | Kò sí segment tí o ti fipamọ́ síbẹ̀. | Babu segment da aka ajiye tukuna. | Enweghị segment echekwara ugbu a. |
| `segment.manage` | Create or edit segments | Create or edit segments | Ṣẹ̀dá tàbí ṣàtúnṣe àwọn segment | Ƙirƙira ko gyara segments | Mepụta ma ọ bụ dezie segments |
| `segment.showing` | Showing customers in “{name}”, matched by email or phone number. | Na customers wey dey “{name}” we dey show, we match dem by email or phone number. | À ń fi àwọn oníbàárà inú “{name}” hàn, a fi email tàbí nọ́mbà fóònù bá wọn mu. | Ana nuna kwastomomin “{name}”, an daidaita su ta email ko lambar waya. | Na-egosi ndị ahịa nọ na “{name}”, ejiri email ma ọ bụ nọmba ekwentị kwekọọ ha. |

### marketing (1)

| Key | English | Pidgin | Yorùbá | Hausa | Igbo |
|---|---|---|---|---|---|
| `seg.seePeople` | See people | See the people | Wo àwọn ènìyàn náà | Duba mutanen | Hụ ndị ahụ |
