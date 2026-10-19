// Features that are built but switched off in the seller web app for now. Flip one to bring it back everywhere.
// Pure (no imports): safe in server and client code.

/**
 * SMS (campaigns, automations, order updates, review requests, the inbox SMS channel). Off for now: sellers never
 * see an SMS option. Campaigns and automations already made with SMS still show what they are.
 */
export const SMS_ENABLED = false;

/**
 * Phone calls on the web (the Africa's Talking voice channel, "Call" from a conversation, call forwarding). Off:
 * calls come to the phone app, which opens the phone's own call app.
 */
export const WEB_CALLS_ENABLED = false;
