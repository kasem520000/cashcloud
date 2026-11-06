/**
 * ecosystem.config.js — إعداد PM2 لنظام ERP محاسبي سحابي
 * ------------------------------------------------------
 * التشغيل:      pm2 start ecosystem.config.js
 * الحفظ الدائم:  pm2 save && pm2 startup
 * الحالة:        pm2 status
 * اللوجات:       pm2 logs erp-saas
 * إعادة تشغيل:   pm2 restart erp-saas
 *
 * ملاحظة: instances = 1 مع exec_mode = fork لأن قاعدة البيانات SQLite
 * (ملف واحد) ولا تدعم التشغيل العنقودي (cluster) بأمان.
 */
module.exports = {
  apps: [
    {
      name: "erp-saas", // اسم التطبيق في pm2
      script: "bun", // المشغّل
      args: "run start", // يشغّل سكربت start من package.json
      cwd: __dirname, // جذر المشروع (مكان هذا الملف)
      // ---------- البيئة ----------
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      // ---------- السلوك ----------
      autorestart: true, // إعادة التشغيل تلقائياً عند التعطل
      watch: false, // لا تعد التشغيل عند تغيّر الملفات (إنتاج)
      max_memory_restart: "512M", // إعادة تشغيل عند تجاوز 512MB ذاكرة
      // ---------- مثيل واحد (SQLite لا يحتاج cluster) ----------
      instances: 1,
      exec_mode: "fork",
      // ---------- اللوجات ----------
      // ملفات منفصلة عن server.log (سكربت start يكتب فيه أصلاً عبر tee)
      error_file: "./pm2-error.log",
      out_file: "./pm2-out.log",
      merge_logs: true,
      time: true, // طابع زمني مع كل سطر
      // ---------- مهل الإعادة ----------
      restart_delay: 3000, // انتظر 3 ثوانٍ قبل إعادة التشغيل
      min_uptime: "15s", // يعتبر التشغيل مستقراً بعد 15 ثانية
      max_restarts: 10, // حد أقصى لإعادات التشغيل المتتالية
    },
  ],
};
