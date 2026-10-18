// @paystack/inline-js v2 ships no types: the part we use (resuming a transaction started on the server).
declare module "@paystack/inline-js" {
  interface ResumeCallbacks {
    onSuccess?: (transaction: { id: number; reference: string; message: string }) => void;
    onCancel?: () => void;
    onError?: (error: { message: string }) => void;
    onLoad?: (response: { id: number; accessCode: string }) => void;
  }
  export default class PaystackPop {
    resumeTransaction(accessCode: string, callbacks?: ResumeCallbacks): unknown;
  }
}
