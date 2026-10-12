import type { DnsRecord } from "@/lib/domains/verification";

// The message a seller sends to "the person who set up your web address" (a nephew, a web designer, the
// company they bought it from). The seller never has to read it: they tap "Send on WhatsApp" or "Copy the steps".
// Technical words are fine here because the reader is the technical person.

export function setupStepsMessage(domain: string, records: DnsRecord[]) {
  const lines = [
    `Hi! Please help me connect my web address ${domain} to my Shopinbos shop. It takes about 5 minutes.`,
    "",
    `Log in where ${domain} was bought, open its DNS settings, and add these records:`,
    "",
  ];
  records.forEach((record, index) => {
    const need = record.purpose === "verify" ? "proves we own it" : record.required ? "required" : "optional";
    lines.push(`${index + 1}. ${record.type} record (${need})`);
    lines.push(`   Name: ${record.label}`);
    lines.push(`   Value: ${record.value}`);
  });
  lines.push(
    "",
    "If a record with the same name is already there, change it to this value. If you use Cloudflare, set it to DNS only (grey cloud).",
    "Shopinbos checks by itself and the shop opens on the new address once the records are in. Thank you!",
  );
  return lines.join("\n");
}

/** WhatsApp share link (the seller picks the contact). */
export function whatsappShareUrl(text: string) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
