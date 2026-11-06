/**
 * التفقيط — تحويل المبالغ الرقمية إلى كلمات عربية
 * (متطلب شائع في الفواتير السعودية والشيكات)
 */

const ONES = [
  "", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة",
  "عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر",
  "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر",
];

const TENS = [
  "", "عشرة", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون",
];

const HUNDREDS = [
  "", "مئة", "مئتان", "ثلاثمئة", "أربعمئة", "خمسمئة", "ستمئة", "سبعمئة", "ثمانمئة", "تسعمئة",
];

const CURRENCIES: Record<string, { main: string; frac: string }> = {
  SAR: { main: "ريال سعودي", frac: "هللة" },
  EGP: { main: "جنيه مصري", frac: "قرش" },
  USD: { main: "دولار أمريكي", frac: "سنت" },
  AED: { main: "درهم إماراتي", frac: "فلس" },
  QAR: { main: "ريال قطري", frac: "درهم" },
  KWD: { main: "دينار كويتي", frac: "فلس" },
  OMR: { main: "ريال عماني", frac: "بيسة" },
  YER: { main: "ريال يمني", frac: "فلس" },
  JOD: { main: "دينار أردني", frac: "قرش" },
  IQD: { main: "دينار عراقي", frac: "فلس" },
};

/** تحويل عدد < 1000 إلى كلمات */
function below1000(n: number): string {
  if (n <= 0) return "";
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (h > 0) parts.push(HUNDREDS[h]);
  if (r > 0) {
    if (r < 20) parts.push(ONES[r]);
    else {
      const t = Math.floor(r / 10);
      const o = r % 10;
      parts.push(o > 0 ? `${ONES[o]} و${TENS[t]}` : TENS[t]);
    }
  }
  return parts.join(" و");
}

/** صيغة المقياس (مفرد/مثنى/جمع): ألف/ألفان/آلاف */
function scaleWord(n: number, forms: [string, string, string]): string {
  if (n === 1) return forms[0];
  if (n === 2) return forms[1];
  if (n >= 3 && n <= 10) return `${below1000(n)} ${forms[2]}`;
  return `${below1000(n)} ${forms[0]}`;
}

/** تحويل عدد صحيح (حتى المليارات) إلى كلمات عربية */
export function numberToArabicWords(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return "صفر";
  const parts: string[] = [];
  const billions = Math.floor(n / 1_000_000_000);
  const millions = Math.floor((n % 1_000_000_000) / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  if (billions > 0) parts.push(scaleWord(billions, ["مليار", "مليارا", "مليارات"]));
  if (millions > 0) parts.push(scaleWord(millions, ["مليون", "مليونان", "ملايين"]));
  if (thousands > 0) parts.push(scaleWord(thousands, ["ألف", "ألفان", "آلاف"]));
  if (rest > 0) parts.push(below1000(rest));
  return parts.join(" و");
}

/**
 * تفقيط مبلغ نقدي مع العملة والكسور:
 * مثال: 115.5 SAR → «مئة وخمسة عشر ريال سعودي وخمسون هللة فقط لا غير»
 */
export function tafqit(amount: number, currency = "SAR"): string {
  const cur = CURRENCIES[currency] ?? { main: currency, frac: "قرش" };
  const rounded = Math.round(Math.abs(amount) * 100) / 100;
  const whole = Math.floor(rounded);
  const frac = Math.round((rounded - whole) * 100);

  const sign = amount < 0 ? "سالب " : "";
  if (frac === 0) {
    return `${sign}${numberToArabicWords(whole)} ${cur.main} فقط لا غير`;
  }
  return `${sign}${numberToArabicWords(whole)} ${cur.main} و${numberToArabicWords(frac)} ${cur.frac} فقط لا غير`;
}
