// Registering a business name with CAC through Shopinbos (src/lib/business-registration): the pure parts, shared by
// the form, the server and tests/business-registration.test.mjs. CAC's VAS Business Name Registration API
// (documenter.getpostman.com/view/54951313/2sBY4PQfw8, read October 2026):
//   POST /api/vas/engine/pre/bn-compliance?advanceCheck=true { proposedName, lineOfBusiness }
//     → { data: { message: "PROCEED_TO_FILING" | …, data: { complianceScorePercentage, similarityScorePercentage,
//          mostSimilarName, suggestedNames, recommendedActions: [{ message }] } } }
//   POST /api/vas/engine/pre/bn/validation  (same body as a registration) → { data: { field: ["problem", …] } }
//   POST /api/vas/engine/pre/business-name  → { data: { transactionRef, statusUrl } }
//   GET  /api/vas/portal/user/status/{ref}  → { data: { status: "pending" | "approved" | "queried", data: { rcNumber, … } } }
//   POST /api/vas/engine/pre/query { transactionRef, …only the queried fields } to answer a query
//   POST /api/vas/engine/certificate { rcNumber, transactionRef } → the certificate once approved

export const REGISTRATION_REFERENCE_PREFIX = "bizreg-";

/**
 *   draft            name checked and details saved, not paid
 *   pending_payment  sent to Paystack
 *   paid             payment verified; ONE caller moves it to submitting
 *   submitting       being sent to CAC
 *   submitted        CAC has it (pending review)
 *   queried          CAC asked for changes: the owner answers in the app
 *   approved         registered: CAC number and certificate
 *   failed           CAC refused it before it was filed (refunded, or refund_failed for the team)
 */
export type RegistrationStatus = "draft" | "pending_payment" | "payment_failed" | "paid" | "submitting" | "submitted" | "queried" | "approved" | "failed" | "refunded" | "refund_failed";

export const NIGERIAN_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River", "Delta", "Ebonyi", "Edo",
  "Ekiti", "Enugu", "F.C.T", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos",
  "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara",
] as const;

/** Lines of business most Shopinbos businesses fall under (CAC takes free text; these read well to its reviewers). */
export const LINES_OF_BUSINESS = [
  "General Merchandise",
  "Fashion Design",
  "Clothing and Accessories",
  "Beauty and Cosmetics",
  "Hair and Wigs",
  "Food and Beverages",
  "Catering Services",
  "Electronics and Gadgets",
  "Phones and Accessories",
  "Home and Kitchen",
  "Furniture and Interior Decor",
  "Agriculture and Farm Produce",
  "Health and Wellness",
  "Baby and Kids Products",
  "Books and Stationery",
  "Arts and Crafts",
  "Logistics and Delivery Services",
  "Content Creation",
  "Printing and Branding",
  "Event Planning",
  "Computer and IT Services",
] as const;

/** What the owner fills in (files go separately: passport photo, signature, ID). Names as CAC's API spells them. */
export interface RegistrationForm {
  proposedName: string;
  lineOfBusiness: string;
  businessCommencementDate: string;
  companyEmail: string;
  companyStreetNumber: string;
  companyAddress: string;
  companyCity: string;
  companyState: string;
  proprietorFirstname: string;
  proprietorSurname: string;
  proprietorOthername: string;
  proprietorGender: string;
  proprietorDob: string;
  proprietorNationality: string;
  proprietorEmail: string;
  proprietorPhonenumber: string;
  proprietorStreetNumber: string;
  proprietorServiceAddress: string;
  proprietorCity: string;
  proprietorLga: string;
  proprietorState: string;
  proprietorPostcode: string;
}

export const REGISTRATION_FIELDS = [
  "proposedName", "lineOfBusiness", "businessCommencementDate", "companyEmail", "companyStreetNumber", "companyAddress",
  "companyCity", "companyState", "proprietorFirstname", "proprietorSurname", "proprietorOthername", "proprietorGender",
  "proprietorDob", "proprietorNationality", "proprietorEmail", "proprietorPhonenumber", "proprietorStreetNumber",
  "proprietorServiceAddress", "proprietorCity", "proprietorLga", "proprietorState", "proprietorPostcode",
] as const satisfies readonly (keyof RegistrationForm)[];

export const REGISTRATION_FILES = ["passport", "signature", "meansOfId"] as const;
export type RegistrationFile = (typeof REGISTRATION_FILES)[number];

export const FILE_LABELS: Record<RegistrationFile, string> = {
  passport: "Passport photograph",
  signature: "Your signature",
  meansOfId: "Means of ID (NIN slip, voter's card, driver's licence or passport)",
};

/** Field names people read (CAC's queries name fields the API's way). */
export const FIELD_LABELS: Record<keyof RegistrationForm | RegistrationFile | "supportingDoc", string> = {
  proposedName: "Business name",
  lineOfBusiness: "Line of business",
  businessCommencementDate: "Date the business started",
  companyEmail: "Business email",
  companyStreetNumber: "Business street number",
  companyAddress: "Business address",
  companyCity: "Business city",
  companyState: "Business state",
  proprietorFirstname: "First name",
  proprietorSurname: "Surname",
  proprietorOthername: "Other name",
  proprietorGender: "Gender",
  proprietorDob: "Date of birth",
  proprietorNationality: "Nationality",
  proprietorEmail: "Your email",
  proprietorPhonenumber: "Your phone number",
  proprietorStreetNumber: "Your street number",
  proprietorServiceAddress: "Your address",
  proprietorCity: "Your city",
  proprietorLga: "Your LGA",
  proprietorState: "Your state",
  proprietorPostcode: "Postcode",
  passport: FILE_LABELS.passport,
  signature: FILE_LABELS.signature,
  meansOfId: FILE_LABELS.meansOfId,
  supportingDoc: "Supporting document",
};

const OPTIONAL = new Set<keyof RegistrationForm>(["proprietorOthername"]);

/** Every form value as a trimmed string (anything missing is ""). */
export function cleanRegistrationForm(input: unknown): RegistrationForm {
  const source = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const form = Object.fromEntries(REGISTRATION_FIELDS.map((key) => [key, typeof source[key] === "string" ? (source[key] as string).trim().slice(0, 200) : ""])) as unknown as RegistrationForm;
  form.proprietorGender = form.proprietorGender.toUpperCase();
  form.proprietorPhonenumber = form.proprietorPhonenumber.replace(/[^\d+]/g, "");
  return form;
}

const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`));
const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);

/** Field → what's wrong, before anything goes to CAC (CAC's own pre-check runs after). Empty when it's fine. */
export function registrationFormProblems(form: RegistrationForm, now = new Date()): Partial<Record<keyof RegistrationForm, string>> {
  const problems: Partial<Record<keyof RegistrationForm, string>> = {};
  for (const key of REGISTRATION_FIELDS) if (!OPTIONAL.has(key) && !form[key]) problems[key] = "Required";
  if (form.proposedName && (form.proposedName.trim().split(/\s+/).length < 2 || form.proposedName.length < 4)) problems.proposedName = "Use at least two words, e.g. \"Ada Fabrics Ventures\".";
  if (form.proprietorGender && !["MALE", "FEMALE"].includes(form.proprietorGender)) problems.proprietorGender = "Choose male or female";
  if (form.proprietorDob) {
    if (!isDate(form.proprietorDob)) problems.proprietorDob = "Use a real date";
    else {
      const born = new Date(`${form.proprietorDob}T12:00:00Z`);
      const adult = new Date(Date.UTC(now.getUTCFullYear() - 18, now.getUTCMonth(), now.getUTCDate()));
      if (born > adult) problems.proprietorDob = "You must be 18 or older";
    }
  }
  if (form.businessCommencementDate && (!isDate(form.businessCommencementDate) || new Date(`${form.businessCommencementDate}T12:00:00Z`) > now)) problems.businessCommencementDate = "Use a date that isn't in the future";
  if (form.proprietorEmail && !isEmail(form.proprietorEmail)) problems.proprietorEmail = "Enter a valid email";
  if (form.companyEmail && !isEmail(form.companyEmail)) problems.companyEmail = "Enter a valid email";
  if (form.proprietorPhonenumber && !/^(\+?234|0)[789][01]\d{8}$/.test(form.proprietorPhonenumber)) problems.proprietorPhonenumber = "Enter a Nigerian phone number, e.g. 08012345678";
  if (form.proprietorPostcode && !/^\d{6}$/.test(form.proprietorPostcode)) problems.proprietorPostcode = "6 digits, e.g. 100001";
  return problems;
}

/** The body CAC's registration and pre-check endpoints take: the form plus the files as data URLs. */
export function registrationPayload(form: RegistrationForm, files: Record<RegistrationFile, string>) {
  const { proposedName, ...rest } = form;
  return { ...rest, proposedOption1: proposedName, ...files };
}

export interface NameCheck {
  /** CAC's verdict: the name can be filed. */
  canProceed: boolean;
  complianceScore: number | null;
  similarityScore: number | null;
  mostSimilarName: string | null;
  suggestions: string[];
  /** What CAC says to do, in its words. */
  advice: string[];
}

const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const strings = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && Boolean(v.trim())) : []);

/** Reads the BN compliance answer. null when it isn't one. */
export function readNameCheck(body: unknown): NameCheck | null {
  const outer = (body && typeof body === "object" ? (body as Record<string, unknown>).data : null) as Record<string, unknown> | null;
  if (!outer || typeof outer !== "object") return null;
  const inner = (outer.data && typeof outer.data === "object" ? outer.data : {}) as Record<string, unknown>;
  const message = typeof outer.message === "string" ? outer.message : "";
  const actions = Array.isArray(inner.recommendedActions)
    ? inner.recommendedActions.map((a) => (a && typeof a === "object" ? (a as { message?: unknown }).message : null)).filter((m): m is string => typeof m === "string" && Boolean(m.trim()))
    : [];
  return {
    canProceed: /^PROCEED/i.test(message) && inner.success !== false,
    complianceScore: num(inner.complianceScorePercentage),
    similarityScore: num(inner.similarityScorePercentage),
    mostSimilarName: typeof inner.mostSimilarName === "string" ? inner.mostSimilarName : null,
    suggestions: strings(inner.suggestedNames).slice(0, 5),
    advice: [...actions, ...(typeof inner.recommendedAction === "string" ? [inner.recommendedAction] : [])].filter((m) => !/^proceed to filing$/i.test(m)).slice(0, 4),
  };
}

/** CAC's pre-check problems as field → messages (its keys are the API's field names; proposedOption1 is the name). */
export function readPreCheck(body: unknown): Record<string, string[]> {
  const data = body && typeof body === "object" ? (body as Record<string, unknown>).data : null;
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const problems: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const messages = strings(value);
    if (messages.length) problems[key === "proposedOption1" ? "proposedName" : key] = messages;
  }
  return problems;
}

export interface RegistrationQuery {
  field: string;
  comment: string;
  date: string | null;
}

export interface RegistrationState {
  status: "pending" | "approved" | "queried" | "unknown";
  rcNumber: string | null;
  entityName: string | null;
  registeredAt: string | null;
  tin: string | null;
  queries: RegistrationQuery[];
}

/** Reads the status endpoint (and the sandbox's query/approve answers, which share the shape). */
export function readRegistrationStatus(body: unknown): RegistrationState {
  const outer = (body && typeof body === "object" ? (body as Record<string, unknown>).data : null) as Record<string, unknown> | null;
  const raw = String(outer?.status ?? "").toLowerCase();
  const details = (outer?.data && typeof outer.data === "object" ? outer.data : {}) as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : typeof value === "number" ? String(value) : null);
  const queries = Array.isArray(outer?.queries)
    ? (outer!.queries as unknown[])
        .filter((q): q is Record<string, unknown> => Boolean(q) && typeof q === "object")
        .map((q) => ({ field: text(q.reason) ?? "", comment: text(q.comment) ?? "", date: text(q.date) }))
        .filter((q) => q.comment)
    : [];
  return {
    status: raw === "approved" || raw === "registered" ? "approved" : raw === "queried" ? "queried" : raw === "pending" || raw === "submitted" || raw === "in_review" ? "pending" : "unknown",
    rcNumber: text(details.rcNumber),
    entityName: text(details.entityName),
    registeredAt: text(details.registrationDate),
    tin: text(details.tin),
    queries,
  };
}

/** A query's field in people's words ("proposedOption1" → "Business name"). */
export function queryFieldLabel(field: string): string {
  const key = field === "proposedOption1" ? "proposedName" : field;
  return (FIELD_LABELS as Record<string, string>)[key] ?? field;
}

/** The status people see on their registration. */
export function registrationStatusText(status: RegistrationStatus): { label: string; tone: "success" | "warning" | "danger" | "info" | "muted" } {
  switch (status) {
    case "approved":
      return { label: "Registered", tone: "success" };
    case "submitted":
    case "paid":
    case "submitting":
      return { label: "With CAC", tone: "info" };
    case "queried":
      return { label: "CAC needs changes", tone: "warning" };
    case "refunded":
      return { label: "Refunded", tone: "muted" };
    case "failed":
    case "refund_failed":
      return { label: "Not filed", tone: "danger" };
    case "pending_payment":
    case "payment_failed":
      return { label: "Awaiting payment", tone: "muted" };
    default:
      return { label: "Draft", tone: "muted" };
  }
}
