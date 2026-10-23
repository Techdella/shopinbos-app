// Features that are built but switched off in the seller web app for now. Flip one to bring it back everywhere.
// Pure (no imports): safe in server and client code.

/**
 * SMS (campaigns, automations, order updates, review requests, texting a customer, the inbox SMS channel). Texts go
 * from the store's own connected SMS account, else Shopinbos's (SMS_PROVIDER, Brevo first), counted against the
 * plan's monthly messages and then SMS packs (src/lib/plans/messages.server.ts).
 */
export const SMS_ENABLED = true;

/**
 * Phone calls on the web (the Africa's Talking voice channel, "Call" from a conversation, call forwarding). Off:
 * calls come to the phone app, which opens the phone's own call app.
 */
export const WEB_CALLS_ENABLED = false;
