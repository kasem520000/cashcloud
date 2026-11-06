/**
 * generate-env.ts — مولّد ملف ‎.env لنظام ERP محاسبي سحابي متعدد المنشآت
 * ---------------------------------------------------------------
 * التشغيل:
 *   bun run env:generate
 *   bun run env:generate --db-path ./db/custom.db --url https://erp.example.com --port 3000
 *   bun run env:generate --force            # الكتابة فوق ‎.env موجود
 *   bun run env:generate --resend-key "re_xxx" --email-from "ERP <noreply@domain.com>"
 *   bun run env:generate --whatsapp-token "EAAG..." --whatsapp-phone-id "123456789"
 *
 * الوسائط:
 *   --db-path   <مسار>   مسار ملف قاعدة البيانات (افتراضي: ./db/custom.db)
 *                         — يُحوَّل تلقائياً إلى مسار مطلق في الملف الناتج
 *                         — لنشر Docker مرّر: /app/db/custom.db
 *   --url       <رابط>   رابط التطبيق العام APP_URL (افتراضي: http://localhost:{port})
 *   --port      <رقم>    منفذ الخادم PORT (افتراضي: 3000)
 *   --force              الكتابة فوق ملف ‎.env موجود بدون تحذير
 *   --resend-key <مفتاح> مفتاح Resend للبريد الفعلي (اختياري)
 *   --email-from <نص>    المرسل، مثال: "ERP <noreply@domain.com>" (اختياري)
 *   --whatsapp-token <توكن>  توكن واتساب Cloud API الدائم (اختياري)
 *   --whatsapp-phone-id <معرف> معرّف رقم الهاتف في Meta (اختياري)
 *
 * يعمل بـ Bun مباشرة — لا يحتاج أي تبعيات (node:fs و node:path فقط).
 */
import fs from "node:fs";
import path from "node:path";

// ---------- أدوات مساعدة ----------

interface Options {
  dbPath: string;
  url: string | null;
  port: string;
  force: boolean;
  resendKey: string;
  emailFrom: string;
  whatsappToken: string;
  whatsappPhoneId: string;
}

const usage = () => {
  console.log(`
الاستخدام:
  bun run env:generate [وسائط]

الوسائط:
  --db-path <مسار>     مسار قاعدة البيانات (افتراضي: ./db/custom.db)
  --url <رابط>         رابط التطبيق العام (افتراضي: http://localhost:{port})
  --port <رقم>         منفذ الخادم (افتراضي: 3000)
  --force              الكتابة فوق ‎.env موجود
  --resend-key <مفتاح>      مفتاح Resend API (اختياري)
  --email-from <نص>         عنوان المرسل (اختياري)
  --whatsapp-token <توكن>   توكن واتساب الدائم (اختياري)
  --whatsapp-phone-id <معرف> معرّف هاتف واتساب (اختياري)
  --help               عرض هذه المساعدة
`);
};

/** قراءة وسائط سطر الأوامر — يدعم ‎--key value و ‎--key=value والوسائط المنطقية */
function parseArgs(argv: string[]): Options & { help: boolean } {
  const opts: Options & { help: boolean } = {
    dbPath: "./db/custom.db",
    url: null,
    port: "3000",
    force: false,
    resendKey: "",
    emailFrom: "",
    whatsappToken: "",
    whatsappPhoneId: "",
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    if (!raw.startsWith("--")) continue;
    let key = raw.slice(2);
    let value = "";
    const eq = key.indexOf("=");
    if (eq !== -1) {
      value = key.slice(eq + 1);
      key = key.slice(0, eq);
    }
    const nextValue = (): string => {
      if (value) return value;
      const nxt = argv[i + 1];
      if (nxt !== undefined && !nxt.startsWith("--")) {
        i++;
        return nxt;
      }
      return "";
    };
    switch (key) {
      case "db-path": opts.dbPath = nextValue() || opts.dbPath; break;
      case "url": opts.url = nextValue() || opts.url; break;
      case "port": opts.port = nextValue() || opts.port; break;
      case "resend-key": opts.resendKey = nextValue(); break;
      case "email-from": opts.emailFrom = nextValue(); break;
      case "whatsapp-token": opts.whatsappToken = nextValue(); break;
      case "whatsapp-phone-id": opts.whatsappPhoneId = nextValue(); break;
      case "force": opts.force = true; break;
      case "help": case "h": opts.help = true; break;
      default:
        console.warn(`⚠️  وسيط غير معروف: --${key} (تم تجاهله)`);
    }
  }
  return opts;
}

// ---------- البرنامج الرئيسي ----------

function main(): void {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    usage();
    return;
  }

  const root = process.cwd(); // جذر المشروع
  const envFile = path.join(root, ".env");

  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║   مولّد متغيرات البيئة — نظام ERP محاسبي سحابي        ║");
  console.log("╚══════════════════════════════════════════════════════╝");

  // 1) حماية الملف الموجود — إشعار ودّي بدل الفشل
  if (fs.existsSync(envFile) && !opts.force) {
    console.log("");
    console.log("ℹ️  يوجد ملف ‎.env بالفعل في جذر المشروع — تم الاحتفاظ به كما هو.");
    console.log("   هذا طبيعي إذا نزّلت المشروع مضغوطاً (يأتي معه ‎.env جاهز يعمل من أي مكان).");
    console.log("");
    console.log("   خياراتك:");
    console.log("   • الاستمرار به كما هو (موصى به للتشغيل المحلي) ✅");
    console.log("   • لإعادة توليده بمسارات مطلقة:  bun run env:generate --force");
    console.log("");
    console.log("✅ لا حاجة لأي إجراء — انتقل للخطوة التالية:");
    console.log("   bun run db:push && bun run seed && bun run dev");
    return;
  }

  // 2) المسار المطلق لقاعدة البيانات
  const dbPathAbs = path.resolve(root, opts.dbPath);
  const dbDir = path.dirname(dbPathAbs);
  const dbInsideProject = dbDir.startsWith(root + path.sep);
  if (!fs.existsSync(dbDir)) {
    if (dbInsideProject) {
      // مجلد داخل المشروع (مثل ./db) — أنشئه لضمان عمل db:push لاحقاً
      fs.mkdirSync(dbDir, { recursive: true });
      console.log(`📁 تم إنشاء مجلد قاعدة البيانات: ${dbDir}`);
    } else {
      // مسار خارج المشروع (مثل /app/db لحاوية Docker) — طبيعي ألا يكون موجوداً على هذا الجهاز
      console.log(`ℹ️  مسار قاعدة البيانات خارج مجلد المشروع (متوقَّع لبيئة Docker): ${dbDir}`);
    }
  }
  const dbExists = fs.existsSync(dbPathAbs);

  // 3) قيم افتراضية ذكية
  const appUrl = opts.url || `http://localhost:${opts.port}`;
  const emailFrom = opts.emailFrom || "ERP <noreply@yourdomain.com>";

  // 4) هل نحن في وضع محاكاة التكاملات؟
  const emailLive = opts.resendKey.trim().length > 0;
  const waLive = opts.whatsappToken.trim().length > 0 && opts.whatsappPhoneId.trim().length > 0;

  // 5) بناء المحتوى
  const lines: string[] = [
    "# ============================================================",
    "#  ملف ‎.env — وُلِّد تلقائياً بواسطة scripts/generate-env.ts",
    `#  تاريخ التوليد: ${new Date().toISOString()}`,
    "#  يمكنك تعديل أي قيمة يدوياً ثم إعادة تشغيل الخادم.",
    "# ============================================================",
    "",
    "# ---------- قاعدة البيانات (SQLite عبر Prisma) ----------",
    "# مسار مطلق (موصى به في الإنتاج) — الملف:",
    `#   ${dbPathAbs}`,
    `#   الحالة الحالية: ${dbExists ? "الملف موجود ✅" : "الملف غير موجود بعد — سيُنشأ تلقائياً عند تنفيذ bun run db:push"}`,
    `DATABASE_URL=file:${dbPathAbs}`,
    "",
    "# ---------- التطبيق ----------",
    "# الرابط العام للتطبيق (يُستخدم في روابط البريد والواتساب)",
    `APP_URL=${appUrl}`,
    "# منفذ تشغيل الخادم",
    `PORT=${opts.port}`,
    "",
    "# ============================================================",
    "#  ===== البريد الإلكتروني (Resend) =====",
    emailLive
      ? "# ✅ وضع الإرسال الفعلي مُفعَّل — المفتاح مضبوط أدناه."
      : "# 🔸 وضع المحاكاة: تُسجَّل الرسائل في النظام دون إرسال فعلي.",
    "# للحصول على مفتاح فعلي:",
    "#   1) أنشئ حساباً في https://resend.com",
    "#   2) وثّق دومينك من قسم Domains",
    "#   3) أنشئ API Key وضعه في RESEND_API_KEY",
    "#   4) أعد تشغيل الخادم (pm2 restart erp-saas)",
    "# ============================================================",
    `RESEND_API_KEY=${opts.resendKey.trim()}`,
    `EMAIL_FROM=${emailFrom}`,
    "",
    "# ============================================================",
    "#  ===== الواتساب (Meta Cloud API) =====",
    waLive
      ? "# ✅ وضع الإرسال الفعلي مُفعَّل — التوكن والمعرّف مضبوطان أدناه."
      : "# 🔸 وضع المحاكاة: تُولَّد روابط wa.me جاهزة دون إرسال فعلي.",
    "# للحصول على توكن دائم ومعرّف الهاتف:",
    "#   1) أنشئ تطبيق Business من https://developers.facebook.com/apps",
    "#   2) أضف منتج WhatsApp ثم أضف رقماً هاتفياً ووثّقه",
    "#   3) من لوحة WhatsApp → API Setup: انسخ Phone Number ID",
    "#      وأنشئ Access Token دائماً (System User token)",
    "#   4) ضع القيم هنا ثم أعد تشغيل الخادم",
    "# ============================================================",
    `WHATSAPP_TOKEN=${opts.whatsappToken.trim()}`,
    `WHATSAPP_PHONE_ID=${opts.whatsappPhoneId.trim()}`,
    "",
  ];

  // 6) الكتابة
  const content = lines.join("\n");
  fs.writeFileSync(envFile, content, "utf8");

  // 7) الملخص الأنيق
  console.log("");
  console.log("✅ تم توليد ملف ‎.env بنجاح");
  console.log(`   📄 المسار: ${envFile}`);
  console.log("");
  console.log("─ ملخص الإعدادات " + "─".repeat(34));
  console.log(`   • قاعدة البيانات : ${dbPathAbs}`);
  console.log(`   • رابط التطبيق    : ${appUrl}`);
  console.log(`   • المنفذ          : ${opts.port}`);
  console.log(`   • البريد          : ${emailLive ? "إرسال فعلي عبر Resend ✅" : "وضع محاكاة (سجل داخلي فقط) 🔸"}`);
  console.log(`   • الواتساب        : ${waLive ? "إرسال فعلي عبر Cloud API ✅" : "وضع محاكاة (روابط wa.me) 🔸"}`);
  console.log("─".repeat(50));
  console.log("");
  console.log("🚀 الخطوة التالية — جهّز قاعدة البيانات وشغّل الإنتاج:");
  console.log("");
  console.log("   bun run db:push && bun run seed && bun run build");
  console.log("");
  console.log("   ثم شغّل الخادم بإحدى الطريقتين:");
  console.log("   • PM2   :  pm2 start ecosystem.config.js");
  console.log("   • Docker:  docker compose up -d --build");
  console.log("");
  console.log("📖 دليل النشر الكامل: DEPLOYMENT.md");
}

main();
