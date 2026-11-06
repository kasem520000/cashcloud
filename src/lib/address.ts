/**
 * تنسيق العنوان الوطني السعودي (آمن للاستخدام في العميل والخادم)
 * الحقول: رقم المبنى، الشارع، الحي، المدينة، الرمز البريدي، الرقم الإضافي
 */
export function formatNationalAddress(c: {
  buildingNo?: string | null;
  streetName?: string | null;
  district?: string | null;
  city?: string | null;
  postalCode?: string | null;
  additionalNo?: string | null;
  address?: string | null;
}): string {
  const structured = [c.buildingNo, c.streetName, c.district, c.city, c.postalCode]
    .filter(Boolean)
    .join("، ");
  if (structured) return structured;
  return c.address ?? "—";
}

/** هل الحقول الأساسية للعنوان الوطني مكتملة؟ */
export function hasNationalAddress(c: {
  buildingNo?: string | null;
  streetName?: string | null;
  district?: string | null;
  city?: string | null;
  postalCode?: string | null;
}): boolean {
  return !!(c.buildingNo && c.streetName && c.district && c.city && c.postalCode);
}
