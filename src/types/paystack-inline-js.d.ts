// @paystack/inline-js (Paystack Popup v2) ships without types: the part the store checkout uses.
declare module "@paystack/inline-js" {
  interface PopupCallbacks {
    onSuccess?: (transaction: { id?: number; reference: string; message?: string; status?: string }) => void;
    onCancel?: () => void;
    onError?: (error: { message: string }) => void;
    onLoad?: (transaction: { id?: number; accessCode?: string }) => void;
  }
  export default class PaystackPop {
    resumeTransaction(accessCode: string, callbacks?: PopupCallbacks): unknown;
  }
}
