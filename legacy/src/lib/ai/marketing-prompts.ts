export type MarketingCopyType = "email_subject" | "email_body" | "coupon_description" | "whatsapp_template" | "sms_promo" | "social_caption" | "product_description" | "abandoned_cart";

export interface MarketingPrompt {
  type: MarketingCopyType;
  label: string;
  systemPrompt: string;
  fields: { key: string; label: string; type: "text" | "textarea" | "select"; placeholder?: string; options?: { value: string; label: string }[] }[];
}

export const MARKETING_PROMPTS: Record<MarketingCopyType, MarketingPrompt> = {
  email_subject: {
    type: "email_subject",
    label: "Email Subject Line",
    fields: [
      { key: "product", label: "Product or offer", type: "text", placeholder: "e.g. Summer Sale - 30% off" },
      { key: "audience", label: "Audience", type: "select", options: [
        { value: "all", label: "All subscribers" },
        { value: "returning", label: "Returning customers" },
        { value: "new", label: "New subscribers" },
        { value: "vip", label: "VIP customers" },
      ]},
      { key: "tone", label: "Tone", type: "select", options: [
        { value: "urgent", label: "Urgent / FOMO" },
        { value: "friendly", label: "Friendly & warm" },
        { value: "premium", label: "Premium / exclusive" },
        { value: "playful", label: "Playful & fun" },
      ]},
      { key: "goal", label: "Goal", type: "select", options: [
        { value: "open", label: "High open rate" },
        { value: "click", label: "High click rate" },
        { value: "convert", label: "Conversion-focused" },
      ]},
    ],
    systemPrompt: `You are Rex, the marketing copywriter for Shopinbos sellers.
Generate compelling email subject lines for an ecommerce store.
Rules:
- Return exactly 5 subject lines as a JSON array of strings
- No emojis unless the brand is playful
- Keep under 60 characters each
- Make them feel personal, not generic
- Match the requested tone and goal
- Do not use all-caps spammy patterns
- Use power words and curiosity gaps when appropriate
Return: { "subjects": ["...", "...", "...", "...", "..."] }`,
  },

  email_body: {
    type: "email_body",
    label: "Email Body Copy",
    fields: [
      { key: "product", label: "Product or offer", type: "text", placeholder: "e.g. New arrivals - premium hair bundles" },
      { key: "audience", label: "Audience", type: "select", options: [
        { value: "all", label: "All subscribers" },
        { value: "returning", label: "Returning customers" },
        { value: "new", label: "New subscribers" },
        { value: "vip", label: "VIP customers" },
      ]},
      { key: "tone", label: "Tone", type: "select", options: [
        { value: "friendly", label: "Friendly & warm" },
        { value: "professional", label: "Professional" },
        { value: "urgent", label: "Urgent / FOMO" },
        { value: "storytelling", label: "Storytelling" },
      ]},
      { key: "includeCta", label: "Call to action", type: "select", options: [
        { value: "shop", label: "Shop Now" },
        { value: "learn", label: "Learn More" },
        { value: "claim", label: "Claim Offer" },
        { value: "book", label: "Book Appointment" },
      ]},
    ],
    systemPrompt: `You are Rex, the marketing copywriter for Shopinbos sellers.
Write a compelling email body for an ecommerce store campaign.
Rules:
- Write in plain text (no HTML)
- 100-200 words
- No emojis
- Start with a strong subject line suggestion followed by "---"
- Include a clear CTA at the end
- Personalize where possible (use {{name}} for customer name, {{store}} for store name)
- Match the requested tone
Return: { "body": "...", "subject": "..." }`,
  },

  coupon_description: {
    type: "coupon_description",
    label: "Coupon / Discount Copy",
    fields: [
      { key: "discount", label: "Discount value", type: "text", placeholder: "e.g. 20% off, Free shipping" },
      { key: "product", label: "Product or category", type: "text", placeholder: "e.g. All braiding hair" },
      { key: "tone", label: "Tone", type: "select", options: [
        { value: "urgent", label: "Urgent / Limited time" },
        { value: "exclusive", label: "Exclusive / VIP" },
        { value: "friendly", label: "Friendly & welcoming" },
        { value: "bold", label: "Bold & exciting" },
      ]},
      { key: "channel", label: "Channel", type: "select", options: [
        { value: "email", label: "Email" },
        { value: "whatsapp", label: "WhatsApp" },
        { value: "sms", label: "SMS" },
        { value: "social", label: "Social Media" },
      ]},
    ],
    systemPrompt: `You are Rex, the promotions copywriter for Shopinbos sellers.
Write short, punchy coupon and discount promotion copy.
Rules:
- Generate 3 variations as a JSON array
- Each variation: { "headline": "...", "description": "...", "cta": "..." }
- Keep headlines under 50 characters
- Keep descriptions under 120 characters
- No emojis
- Create urgency without being pushy
- Match the tone and channel requested
Return: { "variations": [...] }`,
  },

  whatsapp_template: {
    type: "whatsapp_template",
    label: "WhatsApp Message Template",
    fields: [
      { key: "product", label: "Product or offer", type: "text", placeholder: "e.g. New braiding styles available" },
      { key: "purpose", label: "Purpose", type: "select", options: [
        { value: "promo", label: "Promotional" },
        { value: "order_update", label: "Order update" },
        { value: "abandoned", label: "Abandoned cart recovery" },
        { value: "greeting", label: "Welcome / Greeting" },
        { value: "feedback", label: "Feedback request" },
      ]},
      { key: "includeLink", label: "Include link", type: "select", options: [
        { value: "yes", label: "Yes, include link" },
        { value: "no", label: "No link" },
      ]},
    ],
    systemPrompt: `You are Rex, the WhatsApp marketing assistant for Shopinbos sellers.
Write WhatsApp message templates for customer communication.
Rules:
- Keep under 160 characters per message
- Conversational, warm tone
- No emojis
- Use {{name}} for customer name, {{store}} for store name
- Include a clear next step
- For abandoned cart: create urgency without pressure
- For order update: be clear and helpful
- For promo: highlight the value first
Return: { "templates": ["...", "...", "..."] }`,
  },

  sms_promo: {
    type: "sms_promo",
    label: "SMS Promotion",
    fields: [
      { key: "product", label: "Product or offer", type: "text", placeholder: "e.g. Flash sale - 24hrs only" },
      { key: "tone", label: "Tone", type: "select", options: [
        { value: "urgent", label: "Urgent" },
        { value: "friendly", label: "Friendly" },
        { value: "exclusive", label: "Exclusive" },
      ]},
      { key: "includeLink", label: "Include link", type: "select", options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ]},
    ],
    systemPrompt: `You are Rex, the SMS copywriter for Shopinbos sellers.
Write short SMS promotional messages.
Rules:
- Maximum 160 characters per message (1 SMS segment)
- Generate 3 variations
- No emojis
- Include store name naturally
- Create urgency without spammy language
- If includeLink is yes, end with a short link placeholder {{link}}
Return: { "messages": ["...", "...", "..."] }`,
  },

  social_caption: {
    type: "social_caption",
    label: "Social Media Caption",
    fields: [
      { key: "product", label: "Product or offer", type: "text", placeholder: "e.g. Premium lace wigs" },
      { key: "platform", label: "Platform", type: "select", options: [
        { value: "instagram", label: "Instagram" },
        { value: "facebook", label: "Facebook" },
        { value: "tiktok", label: "TikTok" },
        { value: "twitter", label: "X / Twitter" },
      ]},
      { key: "vibe", label: "Vibe", type: "select", options: [
        { value: "aesthetic", label: "Aesthetic / Visual" },
        { value: "educational", label: "Educational" },
        { value: "promo", label: "Promotional" },
        { value: "story", label: "Storytelling" },
        { value: "testimonial", label: "Testimonial-style" },
      ]},
      { key: "hashtags", label: "Include hashtags", type: "select", options: [
        { value: "yes", label: "Yes, include 5-8 hashtags" },
        { value: "no", label: "No hashtags" },
      ]},
    ],
    systemPrompt: `You are Rex, the social media copywriter for Shopinbos sellers.
Write engaging social media captions for an ecommerce brand.
Rules:
- Generate 3 caption options
- Match the platform style (Instagram: aesthetic, TikTok: punchy, Twitter: short & witty)
- No emojis
- Include a CTA
- If hashtags requested, include 5-8 relevant ones at the end
- Keep captions under 220 characters (excluding hashtags)
Return: { "captions": ["...", "...", "..."] }`,
  },

  product_description: {
    type: "product_description",
    label: "Product Description",
    fields: [
      { key: "product", label: "Product name", type: "text", placeholder: "e.g. Brazilian Body Wave 18 inch" },
      { key: "features", label: "Key features", type: "textarea", placeholder: "e.g. 100% human hair, tangle-free, 4x4 closure" },
      { key: "tone", label: "Tone", type: "select", options: [
        { value: "luxury", label: "Luxury / Premium" },
        { value: "professional", label: "Professional / Detailed" },
        { value: "friendly", label: "Friendly & Approachable" },
        { value: "minimal", label: "Minimal / Clean" },
      ]},
      { key: "includeSpecs", label: "Include specs", type: "select", options: [
        { value: "yes", label: "Yes, include specifications" },
        { value: "no", label: "No, keep it concise" },
      ]},
    ],
    systemPrompt: `You are Rex, the product copywriter for Shopinbos sellers.
Write compelling product descriptions that convert browsers into buyers.
Rules:
- Focus on benefits, not just features
- Address common buyer objections
- Include sensory and emotional language
- Generate 2 variations (short and detailed)
- No emojis
- Each variation: { "title": "...", "description": "...", "highlights": ["...", "..."], "cta": "..." }
Return: { "variations": [...] }`,
  },

  abandoned_cart: {
    type: "abandoned_cart",
    label: "Abandoned Cart Recovery",
    fields: [
      { key: "product", label: "Product in cart", type: "text", placeholder: "e.g. 2x Brazilian hair bundles" },
      { key: "tone", label: "Tone", type: "select", options: [
        { value: "friendly", label: "Friendly reminder" },
        { value: "urgent", label: "Urgent / Low stock" },
        { value: "helpful", label: "Helpful / Supportive" },
        { value: "discount", label: "Offer discount" },
      ]},
      { key: "channel", label: "Channel", type: "select", options: [
        { value: "email", label: "Email" },
        { value: "whatsapp", label: "WhatsApp" },
        { value: "sms", label: "SMS" },
      ]},
    ],
    systemPrompt: `You are Rex, the cart recovery copywriter for Shopinbos sellers.
Write abandoned cart recovery messages that bring customers back.
Rules:
- Generate 2 message options
- Friendly, non-pushy tone
- Remind them what they're missing, don't guilt them
- Include a clear CTA to return to cart
- If offering discount, mention it naturally
- No emojis
- Personalise with {{name}} and {{store}}
- Return as JSON array
Each message: { "subject": "...", "body": "...", "cta": "..." }
Return: { "messages": [...] }`,
  },
};
