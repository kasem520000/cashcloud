# ============================================================
#  نظام ERP محاسبي سحابي — Dockerfile
#  مراحل بسيطة وموثوقة (بلا standalone معقد داخل الصورة)
#  البناء:   docker build -t erp-saas .
#  التشغيل:  docker compose up -d --build  (انظر docker-compose.yml)
# ============================================================

# ---------- المرحلة الأساسية: Bun ----------
FROM oven/bun:1 AS base
WORKDIR /app

# ---------- التبعيات ----------
# ملاحظة: ملف القفل في هذا المشروع هو bun.lock
# (النمط bun.lock* يغطي bun.lock و bun.lockb إن وُجد لاحقاً)
COPY package.json bun.lock* ./
RUN bun install

# ---------- الكود ----------
COPY . .

# توليد عميل Prisma (يتطلبه src/lib/db.ts)
RUN bunx prisma generate

# بناء الإنتاج (next build + نسخ static/public إلى standalone)
RUN bun run build

# ---------- التشغيل ----------
EXPOSE 3000

# دفع مخطط قاعدة البيانات (ينشئ الجداول عند أول تشغيل) ثم تشغيل الخادم
# قاعدة البيانات محفوظة عبر volume: ./db:/app/db (انظر docker-compose.yml)
# تأكد أن DATABASE_URL في ‎.env يشير إلى: file:/app/db/custom.db
CMD ["sh", "-c", "bunx prisma db push --accept-data-loss && bun run start"]
