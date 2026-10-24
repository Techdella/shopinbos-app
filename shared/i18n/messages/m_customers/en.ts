// Phone app (apps/mobile): Customers and one customer (app/customers). The words the web shows too (filters, sort,
// WhatsApp and email explanations) come from the web's "customers" namespace; these are the phone's own.
const en = {
  // The list (app/customers/index.tsx)
  "row.orders": "{count, plural, one {# order} other {# orders}}",
  showing: "Showing {shown} of {total}",
  more: "Show more",
  // One customer (app/customers/[key].tsx)
  call: "Call",
  whatsapp: "WhatsApp",
  "contact.phone": "Phone",
  "contact.email": "Email",
  "contact.none": "This customer didn't leave a phone number or email.",
  "chat.openChats": "Open in Chats",
  "chat.none": "No messages yet. What you send here also shows in Chats.",
  "chat.sentHere": "Sent. You'll find it in Chats too.",
  "wa.templateHow": "You make templates on the web, and WhatsApp checks each one before you can use it.",
  "wa.templateChosen": "You're sending an approved message template.",
  "wa.change": "Change",
  "msg.notSent": "Not sent",
  "msg.read": "Read",
  "msg.delivered": "Delivered",
  "msg.sending": "Sending…",
  "filters.title": "Filters",
  "filters.done": "Done",
  "filters.clear": "Clear filters",
} satisfies Record<string, string>;

export default en;
