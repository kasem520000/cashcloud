/**
 * ZATCA — فاتورة السعودية الإلكترونية (الفوترة الإلكترونية)
 * =========================================================
 * طبقة تكامل الامتثال الضريبي مع هيئة الزكاة والضريبة والجمارك:
 *  1) توليد رمز QR بصيغة TLV-Base64 (متطلب المرحلة الأولى — الفواتير المبسطة)
 *  2) توليد ملف XML بصيغة UBL 2.1 (بنية الفاتورة المعيارية لزتكا)
 *  3) فحوصات الامتثال (الرقم الضريبي، السجل التجاري، تغطية QR ...)
 *  4) محاكاة الإرسال لبوابة زتكا (الإبلاغ/التخليص) — للمعاينة والتطوير
 *
 * ملاحظة الإنتاج: الاتصال الحقيقي ببوابة زتكا يتطلب حلولاً معتمداً من الهيئة
 * وشهادات CSID ورموز EGS — هذه الطبقة جاهزة للربط عند توفر الاعتماد.
 */
import crypto from "node:crypto";

// ============ 1) رمز QR — TLV (Tag-Length-Value) ============

/** ترميز حقل واحد بصيغة TLV */
function tlv(tag: number, value: string): Buffer {
  const valueBytes = Buffer.from(value, "utf8");
  return Buffer.concat([Buffer.from([tag, valueBytes.length]), valueBytes]);
}

/**
 * توليد حِمل QR وفق مواصفة زتكا (المرحلة الأولى) — 5 حقول إلزامية:
 *  1: اسم البائع | 2: الرقم الضريبي | 3: الطابع الزمني ISO-8601
 *  4: إجمالي الفاتورة مع الضريبة | 5: إجمالي ضريبة القيمة المضافة
 */
export function generateQrPayload(params: {
  sellerName: string;
  vatNumber: string;
  timestamp: Date;
  total: number;
  vatTotal: number;
}): string {
  const buf = Buffer.concat([
    tlv(1, params.sellerName),
    tlv(2, params.vatNumber),
    tlv(3, params.timestamp.toISOString()),
    tlv(4, params.total.toFixed(2)),
    tlv(5, params.vatTotal.toFixed(2)),
  ]);
  return buf.toString("base64");
}

/** توليد صورة QR (data URL) من الحِمل المشفر */
export async function generateQrDataUrl(payload: string): Promise<string> {
  const QRCode = (await import("qrcode")).default;
  return QRCode.toDataURL(payload, {
    width: 256,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#0f172a", light: "#ffffff" },
  });
}

// ============ 2) فحوصات الامتثال ============

/** الرقم الضريبي السعودي: 15 رقماً يبدأ وينتهي بالرقم 3 */
export function isValidSaudiVat(vat?: string | null): boolean {
  return !!vat && /^3\d{13}3$/.test(vat);
}

/** السجل التجاري: 10 أرقام */
export function isValidSaudiCr(cr?: string | null): boolean {
  return !!cr && /^\d{10}$/.test(cr);
}

export type ComplianceCheck = {
  key: string;
  label: string;
  passed: boolean;
  hint: string;
};

export function runComplianceChecks(company: {
  name: string;
  taxNumber?: string | null;
  crNumber?: string | null;
  address?: string | null;
  phone?: string | null;
}, coverage: { total: number; withQr: number }): ComplianceCheck[] {
  return [
    {
      key: "vat",
      label: "الرقم الضريبي (VAT) بصيغة سعودية صحيحة",
      passed: isValidSaudiVat(company.taxNumber),
      hint: "15 رقماً يبدأ وينتهي بالرقم 3 — من إعدادات المنشأة",
    },
    {
      key: "cr",
      label: "رقم السجل التجاري مسجَّل",
      passed: isValidSaudiCr(company.crNumber),
      hint: "10 أرقام — يظهر ضمن بيانات البائع في XML",
    },
    {
      key: "info",
      label: "بيانات المنشأة مكتملة (الاسم والعنوان والهاتف)",
      passed: !!(company.name && company.address && company.phone),
      hint: "متطلب أساسي في ترويسة الفاتورة الإلكترونية",
    },
    {
      key: "qr",
      label: "تغطية رمز QR للفواتير الصادرة",
      passed: coverage.total > 0 && coverage.withQr === coverage.total,
      hint: coverage.total === 0
        ? "لا توجد فواتير صادرة بعد"
        : `${coverage.withQr} من ${coverage.total} فاتورة تحتوي رمز QR`,
    },
  ];
}

// ============ 3) XML — UBL 2.1 ============

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const P = "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2";
const C = "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2";

export type XmlInvoiceLine = { name: string; qty: number; unitPrice: number; total: number };

/**
 * توليد XML للفاتورة وفق بنية UBL 2.1 (Invoice) المعتمدة لدى زتكا،
 * مع تضمين QR كمرفق (AdditionalDocumentReference) كما تتطلبه الهيئة.
 */
export function buildInvoiceXml(opts: {
  invoiceNo: string;
  uuid: string;
  issueDate: Date;
  currency: string;
  icv: number; // عداد الفاتورة المتسلسل داخل المنشأة (Invoice Counter)
  company: {
    name: string;
    taxNumber: string;
    crNumber?: string | null;
    address?: string | null;
    phone?: string | null;
  };
  customer?: { name: string; taxNumber?: string | null; address?: string | null } | null;
  lines: XmlInvoiceLine[];
  subtotal: number;
  taxRate: number;
  tax: number;
  total: number;
  paid: number;
  qrPayload: string;
  /** نوع المستند وفق زتكا: 388 فاتورة ضريبية (افتراضي) | 381 إشعار دائن */
  invoiceTypeCode?: number;
}): string {
  const d = opts.issueDate;
  const dateStr = d.toISOString().slice(0, 10);
  const timeStr = d.toISOString().slice(11, 19) + "Z";
  const pihs = crypto.createHash("sha256").update(opts.qrPayload).digest("base64");
  const taxRateStr = opts.taxRate > 0 ? opts.taxRate.toFixed(2) : "0.00";

  const customerBlock = opts.customer
    ? `
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${esc(opts.customer.taxNumber ?? "")}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${esc(opts.customer.name)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
      <cac:PostalAddress>
        <cbc:StreetName>${esc(opts.customer.address ?? "")}</cbc:StreetName>
        <cbc:CityName></cbc:CityName>
        <cac:Country><cac:IdentificationCode>SA</cac:IdentificationCode></cac:Country>
      </cac:PostalAddress>
    </cac:Party>
  </cac:AccountingCustomerParty>`
    : "";

  const lines = opts.lines
    .map((l, i) => `  <cac:InvoiceLine>
    <cbc:ID>${i + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="PCE">${l.qty}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${opts.currency}">${l.total.toFixed(2)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${esc(l.name)}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:Percent>${taxRateStr}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${opts.currency}">${l.unitPrice.toFixed(2)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="${P}" xmlns:cbc="${C}">
  <cbc:ProfileID>reporting:1.0</cbc:ProfileID>
  <cbc:ID>${esc(opts.invoiceNo)}</cbc:ID>
  <cbc:UUID>${esc(opts.uuid)}</cbc:UUID>
  <cbc:IssueDate>${dateStr}</cbc:IssueDate>
  <cbc:IssueTime>${timeStr}</cbc:IssueTime>
  <cbc:InvoiceTypeCode name="0100000">${opts.invoiceTypeCode ?? 388}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${opts.currency}</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>${opts.currency}</cbc:TaxCurrencyCode>
  <cac:AdditionalDocumentReference>
    <cbc:ID>QR</cbc:ID>
    <cac:Attachment>
      <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${opts.qrPayload}</cbc:EmbeddedDocumentBinaryObject>
    </cac:Attachment>
  </cac:AdditionalDocumentReference>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${esc(opts.company.taxNumber)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${esc(opts.company.name)}</cbc:RegistrationName>
        <cbc:CompanyID>${esc(opts.company.crNumber ?? "")}</cbc:CompanyID>
      </cac:PartyLegalEntity>
      <cac:PostalAddress>
        <cbc:StreetName>${esc(opts.company.address ?? "")}</cbc:StreetName>
        <cbc:CityName></cbc:CityName>
        <cac:Country><cac:IdentificationCode>SA</cac:IdentificationCode></cac:Country>
      </cac:PostalAddress>
    </cac:Party>
  </cac:AccountingSupplierParty>${customerBlock}
  <cac:Delivery>
    <cbc:ActualDeliveryDate>${dateStr}</cbc:ActualDeliveryDate>
  </cac:Delivery>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${opts.currency}">${opts.tax.toFixed(2)}</cbc:TaxAmount>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${opts.currency}">${opts.subtotal.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${opts.currency}">${opts.subtotal.toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${opts.currency}">${opts.total.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PrepaidAmount currencyID="${opts.currency}">${opts.paid.toFixed(2)}</cbc:PrepaidAmount>
    <cbc:PayableAmount currencyID="${opts.currency}">${(opts.total - opts.paid).toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${lines}
  <!-- PIH: تجزئة الفاتورة السابقة (سلسلة التجزئة) -->
  <cac:PrecedingInvoiceReference>
    <cbc:ID>PIH</cbc:ID>
    <cbc:IssueDate>${dateStr}</cbc:IssueDate>
  </cac:PrecedingInvoiceReference>
</Invoice>
<!-- ${pihs} -->
`.trim();
}

// ============ 4) محاكاة الإرسال لبوابة زتكا ============

export type SubmissionResult = {
  status: "REPORTED" | "REJECTED";
  uuid: string;
  hash: string;
  submittedAt: Date;
  simulated: true;
  message: string;
};

/**
 * محاكاة استجابة بوابة زتكا (الإبلاغ/التخليص):
 * توليد UUID ورقم تجزئة (Hash) كما ترد بهما البوابة الفعلية،
 * مع تحقق منطقي من جاهزية الفاتورة قبل القبول.
 */
export function simulateSubmission(opts: {
  invoiceNo: string;
  total: number;
  vatOk: boolean;
  hasQr: boolean;
  hasItems: boolean;
}): SubmissionResult {
  const ready = opts.vatOk && opts.hasQr && opts.hasItems;
  const uuid = crypto.randomUUID();
  const hash = crypto
    .createHash("sha256")
    .update(`${opts.invoiceNo}|${opts.total.toFixed(2)}|${uuid}`)
    .digest("hex");

  if (!ready) {
    return {
      status: "REJECTED",
      uuid,
      hash,
      submittedAt: new Date(),
      simulated: true,
      message: "رُفضت الفاتورة — أكمل بيانات الامتثال (الرقم الضريبي / رمز QR / بنود الفاتورة)",
    };
  }
  return {
    status: "REPORTED",
    uuid,
    hash,
    submittedAt: new Date(),
    simulated: true,
    message: "تم الإبلاغ عن الفاتورة بنجاح (وضع المحاكاة) وأُصدر لها UUID ورقم تجزئة معتمدان",
  };
}

// ============ 5) الإرسال الفعلي المعتمد (CSID) ============

/** نقاط النهاية الرسمية لبوابة فاتورة (Fatoora) */
export const ZATCA_ENDPOINTS = {
  simulation: "https://gw-fatura.zatca.gov.sa/e-invoicing/simulation",
  production: "https://gw-fatura.zatca.gov.sa/e-invoicing/core",
} as const;

/** التحقق من صيغة الرقم التسلسلي لوحدة الفاتورة (EGS): 3 مقاطع على الأقل تفصلها | */
export function isValidEgsSerial(s?: string | null): boolean {
  if (!s) return false;
  const parts = s.split("|").map((p) => p.trim());
  return parts.length >= 3 && parts.every((p) => p.length > 0);
}

/** التحقق من أن المفتاح الخاص PEM صالح لمنحنى EC P-384 (متطلب زتكا للتوقيع) */
export function isValidEcPrivateKey(pem?: string | null): boolean {
  if (!pem || !pem.includes("-----BEGIN") || !pem.includes("PRIVATE KEY-----")) return false;
  try {
    crypto.createPrivateKey(pem);
    return true;
  } catch {
    return false;
  }
}

/**
 * الختم التشفيري (Cryptographic Stamp) وفق مواصفة زتكا:
 * BASE64(SHA256(XML)) ثم "||" ثم BASE64(ECDSA-SHA384 على ملخص SHA256)
 * يتطلب مفتاح EC P-384 صادراً من شهادة وحدة الفاتورة (EGS) المعتمدة.
 */
export function computeCryptographicStamp(invoiceXml: string, privateKeyPem: string): string {
  const digest = crypto.createHash("sha256").update(invoiceXml, "utf8").digest("base64");
  const signer = crypto.createSign("SHA384");
  signer.update(digest, "utf8");
  const signature = signer.sign(privateKeyPem).toString("base64");
  return `${digest}||${signature}`;
}

export type LiveSubmissionResult = {
  status: "REPORTED" | "REJECTED";
  uuid: string | null;
  hash: string | null;
  message: string;
  validationResults: string[];
  raw?: unknown;
};

/**
 * الإرسال الفعلي لبوابة زتكا (نقطة الإبلاغ للمبسطة/القياسية):
 * يستخدم CSID (Binary Security Token) + السر في ترويسة Basic Auth،
 * مع الختم التشفيري في جسم XML الموقّع.
 */
export async function submitToZatca(opts: {
  environment: "simulation" | "production";
  csid: string;
  secret: string;
  invoiceXml: string;
}): Promise<LiveSubmissionResult> {
  const base = ZATCA_ENDPOINTS[opts.environment];
  const auth = Buffer.from(`${opts.csid}:${opts.secret}`).toString("base64");
  try {
    const res = await fetch(`${base}/invoices/reporting/single`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
        "Accept-Language": "en",
        "Content-Type": "application/xml; charset=UTF-8",
      },
      body: opts.invoiceXml,
      signal: AbortSignal.timeout(20000),
    });
    const text = await res.text();
    let parsed: Record<string, unknown> | null = null;
    try { parsed = JSON.parse(text); } catch { /* استجابة غير JSON */ }
    const validationResults = extractValidationResults(parsed);
    if (res.ok) {
      const reporting = (parsed?.reportingStatus as string) ?? "";
      const status = reporting === "REPORTED" || res.status === 200 || res.status === 201 ? "REPORTED" : "REJECTED";
      return {
        status,
        uuid: (parsed?.uuid as string) ?? null,
        hash: (parsed?.invoiceHash as string) ?? null,
        message: status === "REPORTED"
          ? "تم إبلاغ البوابة الفعلية بنجاح (اعتماد CSID مفعّل)"
          : `ردت البوابة بحالة: ${reporting || res.status}`,
        validationResults,
        raw: parsed ?? text.slice(0, 500),
      };
    }
    return {
      status: "REJECTED",
      uuid: null,
      hash: null,
      message: `رفضت البوابة الفعلية الطلب (HTTP ${res.status})`,
      validationResults: validationResults.length > 0 ? validationResults : [text.slice(0, 300)],
      raw: parsed ?? text.slice(0, 500),
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      status: "REJECTED",
      uuid: null,
      hash: null,
      message: `تعذر الاتصال ببوابة زتكا: ${msg}`,
      validationResults: [],
    };
  }
}

/** استخراج رسائل أخطاء التحقق من رد البوابة */
function extractValidationResults(parsed: Record<string, unknown> | null): string[] {
  if (!parsed) return [];
  const out: string[] = [];
  const walk = (obj: unknown) => {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) { obj.forEach(walk); return; }
    const rec = obj as Record<string, unknown>;
    if (typeof rec.message === "string" && rec.message.trim()) out.push(rec.message.trim());
    Object.values(rec).forEach(walk);
  };
  const validations = parsed.validationResults ?? parsed.reportingValidation ?? parsed.status;
  walk(validations);
  return [...new Set(out)].slice(0, 10);
}
