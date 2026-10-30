# Rex's photo library

The stock photos Rex offers sellers for store banners, About sections and other image slots (seller onboarding and
the store editor). The typed manifest is `shared/rex-photo-library.ts`; this page is the licence record.

- **Photos:** 57, all free (non-Plus) photos from [Unsplash](https://unsplash.com/?utm_source=shopinbos&utm_medium=referral).
- **Licence:** [Unsplash License](https://unsplash.com/license) — free for commercial and non-commercial use, no
  permission or attribution required. Not allowed: selling the photos unaltered, or compiling them into a competing
  photo service. We credit every photographer anyway.
- **Downloads recorded:** each photo's download was registered through the Unsplash API (`download_location`), as
  the Unsplash API guidelines require, on 2026-10-30.
- **Where the files live:** Shopinbos Supabase Storage, public bucket `shopinbos-media`, under
  `rex-library/<category>/<unsplashId>.jpg` (1600px wide, JPEG q80) and `<unsplashId>-480.jpg` (480px thumbnail).
  Base URL: `https://zdnwdkykcqaarlpwqjow.supabase.co/storage/v1/object/public/shopinbos-media/rex-library`.
- **Selection rules:** bright, commercial, Nigerian / West-African and Black people and contexts where relevant; no
  visible logos or brands, no text overlays, no children as the focus, no religious or political content.

## Adding photos

1. Pick a free (non-Plus) Unsplash photo and record its download (Unsplash API `download_location`, or the Unsplash
   MCP `download_asset` tool).
2. Upload `<id>.jpg` (`w=1600&fm=jpg&q=80`) and `<id>-480.jpg` (`w=480`) to
   `shopinbos-media/rex-library/<category>/` and check both public URLs return 200.
3. Add the entry to `shared/rex-photo-library.ts` and a row below, then run
   `node --test tests/rex-photo-library.test.mjs`.

## Photos and credits

### hair_beauty (8)

| Unsplash id | Photo | Photographer | Source | Size |
|---|---|---|---|---|
| `QS9ZX5UnS14` | Woman with a long braided ponytail on a warm tan background | [Jessica Felicio](https://unsplash.com/@jekafe?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/QS9ZX5UnS14?utm_source=shopinbos&utm_medium=referral) | 1600×2240 |
| `K2D7muBun1A` | Woman with braided hair in a colourful blouse | [Gustavo Spindula](https://unsplash.com/@gspindula?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/K2D7muBun1A?utm_source=shopinbos&utm_medium=referral) | 1600×2400 |
| `yWcWeMGVPjk` | Woman with long braid extensions on a white background | [J Morgan](https://unsplash.com/@jerrold01?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/yWcWeMGVPjk?utm_source=shopinbos&utm_medium=referral) | 1600×2409 |
| `EUedgXxvTAs` | Woman with natural twist-out hair by a white wall | [Leighann Blackwood](https://unsplash.com/@ohleighann?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/EUedgXxvTAs?utm_source=shopinbos&utm_medium=referral) | 1600×2400 |
| `zoYLGk2oULA` | Woman applying moisturiser to her face | [Leighann Blackwood](https://unsplash.com/@ohleighann?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/zoYLGk2oULA?utm_source=shopinbos&utm_medium=referral) | 1600×2400 |
| `62wQhEghaw0` | Woman with an afro and glossy lips | [Good Faces](https://unsplash.com/@goodfacesagency?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/62wQhEghaw0?utm_source=shopinbos&utm_medium=referral) | 1600×2407 |
| `O3D_mUpZzcM` | Smiling woman applying face powder | [Ben Masora](https://unsplash.com/@benmasora?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/O3D_mUpZzcM?utm_source=shopinbos&utm_medium=referral) | 1600×2399 |

### fashion (8)

| Unsplash id | Photo | Photographer | Source | Size |
|---|---|---|---|---|
| `SfPOkp6-2eA` | Stacks of colourful printed fabrics | [Eva Blue](https://unsplash.com/@evablue?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/SfPOkp6-2eA?utm_source=shopinbos&utm_medium=referral) | 1600×1067 |
| `ypNtKLYNXOU` | Man in a matching suit with a colourful geometric print | [John Ekow](https://unsplash.com/@jaughnekow_?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/ypNtKLYNXOU?utm_source=shopinbos&utm_medium=referral) | 1600×2400 |
| `6EvUrguVz7s` | Smiling young woman in an Ankara print dress | [Theresa Ude](https://unsplash.com/@theresaude?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/6EvUrguVz7s?utm_source=shopinbos&utm_medium=referral) | 1600×2409 |
| `-9b2fdmU4bQ` | Woman in a colourful wax-print headwrap and top | [Barney Goodman](https://unsplash.com/@bgoodpic?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/-9b2fdmU4bQ?utm_source=shopinbos&utm_medium=referral) | 1600×2386 |
| `2HBxrhyv8No` | Women in matching gold tops and patterned skirts | [ishakah rumbani](https://unsplash.com/@zecbob?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/2HBxrhyv8No?utm_source=shopinbos&utm_medium=referral) | 1600×1067 |
| `1SAFRlUY0lk` | Tailor sewing at a machine in his shop | [Ali Mkumbwa](https://unsplash.com/@mkumbwajr?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/1SAFRlUY0lk?utm_source=shopinbos&utm_medium=referral) | 1600×1198 |
| `qnKhZJPKFD8` | Clothing boutique interior with hanging racks | [Clark Street Mercantile](https://unsplash.com/@mercantile?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/qnKhZJPKFD8?utm_source=shopinbos&utm_medium=referral) | 1600×1068 |
| `7F7kEHj72MQ` | Patterned blouses on wooden hangers on a clothing rack | [Aviv Rachmadian](https://unsplash.com/@avivrchmdn?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/7F7kEHj72MQ?utm_source=shopinbos&utm_medium=referral) | 1600×1067 |

### food (7)

| Unsplash id | Photo | Photographer | Source | Size |
|---|---|---|---|---|
| `PqG32DYCTM8` | Jollof rice with grilled fish, skewers and fresh vegetables | [Keesha's Kitchen](https://unsplash.com/@keeshasskitchen?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/PqG32DYCTM8?utm_source=shopinbos&utm_medium=referral) | 1600×1067 |
| `woC24wGXsQ8` | Bowl of jollof rice with chicken skewers | [Keesha's Kitchen](https://unsplash.com/@keeshasskitchen?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/woC24wGXsQ8?utm_source=shopinbos&utm_medium=referral) | 1600×1067 |
| `b4Ht8TQ1JGo` | Plate of jollof rice with chicken | [Keesha's Kitchen](https://unsplash.com/@keeshasskitchen?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/b4Ht8TQ1JGo?utm_source=shopinbos&utm_medium=referral) | 1600×2400 |
| `0A03YQqU4CU` | Hands holding a bowl of egusi soup with assorted meats | [Tosan Dudun](https://unsplash.com/@babadudu19?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/0A03YQqU4CU?utm_source=shopinbos&utm_medium=referral) | 1600×1382 |
| `rbEtzd20Qcw` | Bowls of moi moi (steamed bean cake) | [Femi Oyekoya](https://unsplash.com/@femi_oyekoya?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/rbEtzd20Qcw?utm_source=shopinbos&utm_medium=referral) | 1600×2844 |
| `oNcs1L6VJtM` | Baker holding a fresh loaf of bread | [Steward Masweneng](https://unsplash.com/@stewardesign?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/oNcs1L6VJtM?utm_source=shopinbos&utm_medium=referral) | 1600×1295 |
| `U4QkDQW84sg` | Fresh fruit and vegetable juices in glass bottles | [Zlatko Đurić](https://unsplash.com/@zladuric?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/U4QkDQW84sg?utm_source=shopinbos&utm_medium=referral) | 1600×1203 |

### gadgets (6)

| Unsplash id | Photo | Photographer | Source | Size |
|---|---|---|---|---|
| `aCAxMbGlr2A` | Smiling woman with short braids looking at her phone | [Ninthgrid](https://unsplash.com/@ninthgrid_?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/aCAxMbGlr2A?utm_source=shopinbos&utm_medium=referral) | 1600×1067 |
| `DavJROC1lBM` | Woman using a smartphone | [Good Faces](https://unsplash.com/@goodfacesagency?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/DavJROC1lBM?utm_source=shopinbos&utm_medium=referral) | 1600×1065 |
| `B0doEELZDO0` | Two friends smiling at something on a phone | [Ninthgrid](https://unsplash.com/@ninthgrid_?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/B0doEELZDO0?utm_source=shopinbos&utm_medium=referral) | 1600×1067 |
| `e8etaVo85AY` | Man working on a laptop at a desk | [Oluwatobi Fasipe](https://unsplash.com/@fasipe_tobi?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/e8etaVo85AY?utm_source=shopinbos&utm_medium=referral) | 1600×1200 |
| `6hCe6OboSAM` | Young man working from home on a laptop | [Sweet Life](https://unsplash.com/@sweetlifediabetes?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/6hCe6OboSAM?utm_source=shopinbos&utm_medium=referral) | 1600×1067 |

### home (6)

| Unsplash id | Photo | Photographer | Source | Size |
|---|---|---|---|---|
| `c0JoR_-2x3E` | Bright living room with furniture and a large mirror | [Spacejoy](https://unsplash.com/@spacejoy?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/c0JoR_-2x3E?utm_source=shopinbos&utm_medium=referral) | 1600×1172 |
| `85pCvDWDMmI` | White and wood living room set | [Spacejoy](https://unsplash.com/@spacejoy?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/85pCvDWDMmI?utm_source=shopinbos&utm_medium=referral) | 1600×900 |
| `ml2RSaDME-k` | Green sofa with green and white throw pillows | [Spacejoy](https://unsplash.com/@spacejoy?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/ml2RSaDME-k?utm_source=shopinbos&utm_medium=referral) | 1600×938 |
| `d9qnD33cBJs` | Cookware set on floating kitchen shelves | [Dane Deaner](https://unsplash.com/@danedeaner?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/d9qnD33cBJs?utm_source=shopinbos&utm_medium=referral) | 1600×1280 |
| `seDjj4dmC9s` | Frying pan beside fresh tomatoes on a blue surface | [Icons8 Team](https://unsplash.com/@icons8?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/seDjj4dmC9s?utm_source=shopinbos&utm_medium=referral) | 1600×1068 |
| `TWOnvtstmeU` | Wooden sideboard with potted plants, vases and wicker baskets | [Toa Heftiba](https://unsplash.com/@heftiba?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/TWOnvtstmeU?utm_source=shopinbos&utm_medium=referral) | 1600×2400 |

### people (9)

| Unsplash id | Photo | Photographer | Source | Size |
|---|---|---|---|---|
| `EOkN2pRjFsg` | Businesswoman at the counter of her small shop | [Ali Mkumbwa](https://unsplash.com/@mkumbwajr?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/EOkN2pRjFsg?utm_source=shopinbos&utm_medium=referral) | 1600×1067 |
| `5dFuO02OHh0` | Street vendor with her phone in front of a fruit stand | [Ali Mkumbwa](https://unsplash.com/@mkumbwajr?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/5dFuO02OHh0?utm_source=shopinbos&utm_medium=referral) | 1600×1143 |
| `WUG0QcXVh0k` | Fruit vendor giving a thumbs up at his market stand | [Ali Mkumbwa](https://unsplash.com/@mkumbwajr?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/WUG0QcXVh0k?utm_source=shopinbos&utm_medium=referral) | 1600×1068 |
| `PK_t0Lrh7MM` | Smiling woman in a yellow blazer holding a tablet | [alex starnes](https://unsplash.com/@alexstarnes?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/PK_t0Lrh7MM?utm_source=shopinbos&utm_medium=referral) | 1600×2000 |
| `V5XaBkW6PO8` | Woman packing an order into a cardboard box | [M. Cooper](https://unsplash.com/@mcoopercreative?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/V5XaBkW6PO8?utm_source=shopinbos&utm_medium=referral) | 1600×1280 |
| `ddrlTPoEuqQ` | Two happy friends taking a selfie with shopping bags | [Vitaly Gariev](https://unsplash.com/@silverkblack?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/ddrlTPoEuqQ?utm_source=shopinbos&utm_medium=referral) | 1600×900 |
| `NGvxl1Y48rQ` | Two women looking into their shopping bags | [Vitaly Gariev](https://unsplash.com/@silverkblack?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/NGvxl1Y48rQ?utm_source=shopinbos&utm_medium=referral) | 1600×900 |
| `QReuKow1YdY` | Delivery courier in an orange cap holding a parcel | [Mathias Reding](https://unsplash.com/@matreding?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/QReuKow1YdY?utm_source=shopinbos&utm_medium=referral) | 1600×2400 |
| `t0Aio60jD4Q` | Smiling driver standing behind a delivery van | [Victória Kubiaki](https://unsplash.com/@victoriakubiaki?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/t0Aio60jD4Q?utm_source=shopinbos&utm_medium=referral) | 1600×1068 |

### backgrounds (8)

| Unsplash id | Photo | Photographer | Source | Size |
|---|---|---|---|---|
| `7-QXQ1lrYy0` | Close-up of a colourful woven pattern | [engin akyurt](https://unsplash.com/@enginakyurt?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/7-QXQ1lrYy0?utm_source=shopinbos&utm_medium=referral) | 1600×1200 |
| `lxJA7iwj0pQ` | Abstract ribbed geometric pattern in warm brown tones | [Logan Voss](https://unsplash.com/@loganvoss?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/lxJA7iwj0pQ?utm_source=shopinbos&utm_medium=referral) | 1600×900 |
| `HZm2XR0whdw` | Soft off-white canvas paper texture | [Olga Thelavart](https://unsplash.com/@olga_o?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/HZm2XR0whdw?utm_source=shopinbos&utm_medium=referral) | 1600×1181 |
| `xz485Eku8O4` | White canvas with a fine woven texture | [Annie Spratt](https://unsplash.com/@anniespratt?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/xz485Eku8O4?utm_source=shopinbos&utm_medium=referral) | 1600×1200 |
| `TMxUnMAAwFA` | Green palm leaf against a clear blue sky | [Jakob Owens](https://unsplash.com/@jakobowens1?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/TMxUnMAAwFA?utm_source=shopinbos&utm_medium=referral) | 1600×1067 |
| `tZbULR3VWhQ` | Lush green palm leaves | [Jessica Favaro](https://unsplash.com/@jessicafavaro?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/tZbULR3VWhQ?utm_source=shopinbos&utm_medium=referral) | 1600×1067 |
| `qYsmxkxZtbM` | Soft teal and white abstract backdrop | [Sincerely Media](https://unsplash.com/@sincerelymedia?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/qYsmxkxZtbM?utm_source=shopinbos&utm_medium=referral) | 1600×900 |
| `4P5DMXQXzRI` | Teal painted wall with a thin white line | [Tim Mossholder](https://unsplash.com/@timmossholder?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/4P5DMXQXzRI?utm_source=shopinbos&utm_medium=referral) | 1600×1067 |

### markets (5)

| Unsplash id | Photo | Photographer | Source | Size |
|---|---|---|---|---|
| `SAzxVLbZWkk` | Avocados, African star apples and pineapples at a Lagos fruit market | [Ima Enoch](https://unsplash.com/@ima_ayo?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/SAzxVLbZWkk?utm_source=shopinbos&utm_medium=referral) | 1600×1200 |
| `ME416b6sp2I` | Woman selling peppers at her market stall | [Omotayo Tajudeen](https://unsplash.com/@omotayo_ty?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/ME416b6sp2I?utm_source=shopinbos&utm_medium=referral) | 1600×1067 |
| `PLMiACbs7Y4` | Assorted fruits on display at a market | [Photos By Beks](https://unsplash.com/@photosbybeks?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/PLMiACbs7Y4?utm_source=shopinbos&utm_medium=referral) | 1600×1067 |
| `vLZC-lONFg0` | Women shopping at an outdoor market in Senegal | [Jean Papillon](https://unsplash.com/@jeanpapillon?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/vLZC-lONFg0?utm_source=shopinbos&utm_medium=referral) | 1600×1047 |
| `CMYyo5ce-Ac` | Art dealer at the Lekki Arts Market in Lagos | [Motunrayo Babatunde](https://unsplash.com/@motunbabs?utm_source=shopinbos&utm_medium=referral) | [Unsplash](https://unsplash.com/photos/CMYyo5ce-Ac?utm_source=shopinbos&utm_medium=referral) | 1600×1281 |
