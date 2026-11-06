# 🚀 دليل النشر الكامل — نظام ERP محاسبي سحابي متعدد المنشآت

دليل عملي خطوة بخطوة لنشر النظام على خادم VPS يعمل بنظام Ubuntu، بطريقتين (PM2 الموصى بها، أو Docker Compose)، مع تهيئة Nginx وشهادة SSL والجدار الناري والنسخ الاحتياطي.

---

## 📑 المحتويات

1. [المتطلبات](#1-المتطلبات)
2. [الطريقة الأولى — PM2 (موصى بها)](#2-الطريقة-الأولى--pm2-موصى-بها)
3. [الطريقة الثانية — Docker Compose](#3-الطريقة-الثانية--docker-compose)
4. [Nginx كوكيل عكسي + HTTPS](#4-nginx-كوكيل-عكسي--https)
5. [الجدار الناري (UFW)](#5-الجدار-الناري-ufw)
6. [النسخ الاحتياطي](#6-النسخ-الاحتياطي)
7. [التحديثات](#7-التحديثات)
8. [تفعيل التكاملات (بريد + واتساب)](#8-تفعيل-التكاملات-بريد--واتساب)
9. [استكشاف الأخطاء](#9-استكشاف-الأخطاء)
10. [بيانات الدخول التجريبية](#10-بيانات-الدخول-التجريبية)

---

## 1) المتطلبات

| المتطلب | التفاصيل |
|---|---|
| نظام التشغيل | Ubuntu 22.04 LTS أو أحدث (يعمل أيضاً على Debian 11+) |
| الموارد | 1 vCPU، **1GB رام** على الأقل (2GB موصى بها) |
| المساحة | 5GB حرة على الأقل |
| الدومين | دومين موجّه (A Record) إلى عنوان IP الخاص بالخادم — مثال: `erp.yourdomain.com` |
| الوصول | صلاحيات root أو sudo |

تحقق من إعدادات DNS قبل البدء:

```bash
# يجب أن يُرجع عنوان IP الخاص بخادمك
ping erp.yourdomain.com
```

---

## 2) الطريقة الأولى — PM2 (موصى بها)

هذه الطريقة أخفّ وأسرع وتناسب خوادم 1GB رام لأنها لا تحتاج Docker.

### 2.1 تحديث النظام

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl unzip git
```

### 2.2 تثبيت Bun

```bash
curl -fsSL https://bun.sh/install | bash
```

أعد تحميل الجلسة ليعمل أمر `bun`:

```bash
source ~/.bashrc
# تحقق
bun --version
```

> **بديل Node.js:** إن كنت تفضّل Node 20+ بدلاً من Bun:
> ```bash
> curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
> sudo apt install -y nodejs
> ```
> جميع أوامر التشغيل تبقى كما هي (`npm run ...` بدل `bun run ...`) لأنها سكربتات قياسية.

### 2.3 رفع المشروع وفكّ الضغط

```bash
# من جهازك المحلي: ارفع الملف المضغوط للمشروع
scp erp-saas.zip user@SERVER_IP:/home/user/

# على الخادم: أنشئ مجلد التطبيق وفكّ الضغط
sudo mkdir -p /home/user/erp
sudo unzip /home/user/erp-saas.zip -d /home/user/erp
cd /home/user/erp
```

### 2.4 تثبيت الاعتماديات

```bash
bun install
```

### 2.5 توليد ملف البيئة `.env`

الطريقة السهلة — المولّد التفاعلي:

```bash
# محلياً على الخادم (يحول المسار لمطلق تلقائياً)
bun run env:generate --url https://erp.yourdomain.com

# أو مع مفاتيح التكاملات مباشرة
bun run env:generate --url https://erp.yourdomain.com \
  --resend-key "re_xxxxxxxx" \
  --whatsapp-token "EAAG..." --whatsapp-phone-id "123456789"
```

أو الطريقة اليدوية:

```bash
cp .env.example .env
nano .env
```

أهم قيمة يجب تعديلها: `DATABASE_URL` — استخدم **المسار المطلق** لملف قاعدة البيانات على الخادم:

```env
DATABASE_URL=file:/home/user/erp/db/custom.db
APP_URL=https://erp.yourdomain.com
PORT=3000
```

### 2.6 تهيئة قاعدة البيانات

```bash
# إنشاء الجداول (يدفع مخطط Prisma إلى SQLite)
bun run db:push

# البيانات التجريبية — اختياري لكنه مفيل للاختبار الأولي
bun run seed
```

### 2.7 بناء نسخة الإنتاج

```bash
bun run build
```

> يستغرق البناء دقيقة إلى ثلاث دقائق حسب قوة الخادم.

### 2.8 التشغيل عبر PM2

```bash
# تثبيت pm2 (أي طريقة تكفي)
bunx pm2          # مؤقتاً عبر bun
# أو بشكل دائم:
sudo npm i -g pm2 # إن كان node مثبتاً
```

```bash
# التشغيل باستخدام ملف الإعداد الجاهز
pm2 start ecosystem.config.js

# التحقق من الحالة
pm2 status
pm2 logs erp-saas --lines 50

# حفظ العملية وإطلاقها تلقائياً مع إعادة تشغيل الخادم
pm2 save
pm2 startup
# نفّذ الأمر الذي يطبعه لك pm2 startup كما هو (sudo env PATH=...)
```

### 2.9 التحقق

```bash
curl localhost:3000/api
# المفترض أن تري استجابة JSON من الخادم
```

ثم افتح `https://erp.yourdomain.com` بعد إكمال قسم Nginx أدناه.

---

## 3) الطريقة الثانية — Docker Compose

### 3.1 تثبيت Docker + Compose Plugin

```bash
# تثبيت Docker رسمياً
curl -fsSL https://get.docker.com | sudo sh

# أضف مستخدمك لمجموعة docker (لتجنب sudo مع كل أمر)
sudo usermod -aG docker $USER
newgrp docker

# تحقق
docker --version
docker compose version
```

### 3.2 تجهيز ملف البيئة

في وضع Docker، قاعدة البيانات تُحمَّل من مجلد المضيف `./db` داخل الحاوية على المسار `/app/db`، لذا يجب أن يكون `DATABASE_URL` بالمسار **الداخلي للحاوية**:

```bash
# الطريقة السهلة — المولّد يفهم المسار المطلق كما هو:
bun run env:generate --url https://erp.yourdomain.com --db-path /app/db/custom.db

# أو يدوياً:
cp .env.example .env
# ثم عدّل في nano .env:
#   DATABASE_URL=file:/app/db/custom.db
#   APP_URL=https://erp.yourdomain.com
```

> ⚠️ **لا تستخدم مسار الخادم المطلق مع Docker** — الحاوية لا ترى إلا `/app` الداخلية. مجلد `./db` على الخادم يُوصَل تلقائياً بـ `/app/db` عبر الـ volume المعرّف في `docker-compose.yml`.

### 3.3 التشغيل

```bash
docker compose up -d --build
```

سيقوم تلقائياً عند أول تشغيل بـ: تثبيت الاعتماديات → توليد Prisma → بناء Next.js → دفع المخطط → تشغيل الخادم على المنفذ 3000.

### 3.4 اللوجات والمراقبة

```bash
# متابعة اللوجات مباشرة
docker compose logs -f app

# حالة الحاوية
docker compose ps

# تنفيذ أوامر داخل الحاوية
docker compose exec app bun run seed        # البيانات التجريبية
docker compose exec app bunx prisma studio  # مستعرض قاعدة البيانات (اختياري)
```

### 3.5 التحديث بإصدار جديد

```bash
# ارفع الكود الجديد ثم:
docker compose up -d --build
```

قاعدة البيانات محفوظة في `./db` على الخادم — **لن تتأثر** بإعادة البناء.

---

## 4) Nginx كوكيل عكسي + HTTPS

### 4.1 تثبيت Nginx

```bash
sudo apt install -y nginx
sudo systemctl enable --now nginx
```

### 4.2 ملف الموقع

أنشئ الملف:

```bash
sudo nano /etc/nginx/sites-available/erp
```

واحفظ فيه المحتوى التالي (استبدل `erp.yourdomain.com` بدومينك):

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name erp.yourdomain.com;

    # حجم أقصى مناسب لرفع المنتجات والمرفقات
    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # تمرير ترقية WebSocket (إن لزم مستقبلاً)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # تمرير معلومات العميل الحقيقية
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # مهل زمنية مريحة للتقارير الثقيلة
        proxy_read_timeout 120s;
        proxy_connect_timeout 60s;
    }
}
```

فعّل الموقع وأعد تحميل Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/erp /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

### 4.3 شهادة SSL مجانية (Let's Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx

sudo certbot --nginx -d erp.yourdomain.com
```

أجب عن الأسئلة (بريد إداري، موافقة على الشروط)، واختر `Redirect` عند السؤال عن HTTP→HTTPS. يقوم certbot تلقائياً بتجديد الشهادة قبل انتهائها (cron مجدول افتراضياً).

> بعد تفعيل HTTPS حدّث `APP_URL` في `.env` إلى `https://erp.yourdomain.com` ثم `pm2 restart erp-saas` (أو `docker compose restart app`) لتنعكس الروابط الصحيحة في البريد والواتساب.

---

## 5) الجدار الناري (UFW)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp     # HTTP
sudo ufw allow 443/tcp    # HTTPS
sudo ufw enable
sudo ufw status
```

> ⚠️ **لا تفتح المنفذ 3000** — التطبيق يُدار محلياً عبر Nginx فقط، وفتحه يعرض قاعدة البيانات والخدمة للإنترنت مباشرة بدون تشفير.

---

## 6) النسخ الاحتياطي

قاعدة البيانات ملف SQLite واحد، والنسخ منه آمن أثناء التشغيل في أغلب الحالات (إن أردت ضماناً كاملاً أوقف الخدمة لحظة النسخ).

### نسخة يدوية

```bash
# نسخ قاعدة البيانات مع طابع زمني
cp db/custom.db backups/custom-$(date +%F-%H%M).db

# لا تنس ملف البيئة (يحتوي المفاتيح)
cp .env backups/env-$(date +%F).backup
```

### نسخ يومي تلقائي عبر cron

```bash
mkdir -p /home/user/erp/backups
crontab -e
```

أضف السطر (نسخ يومي الساعة 3 فجراً + الاحتفاظ بآخر 14 نسخة):

```cron
0 3 * * * cd /home/user/erp && cp db/custom.db backups/custom-$(date +\%F).db && ls -1t backups/custom-*.db | tail -n +15 | xargs -r rm
```

> **للنسخ خارج الخادم** (موصى به): استخدم `rclone` أو `rsync` لدفع مجلد `backups/` إلى S3 أو Google Drive أو خادم آخر.

> **في وضع Docker:** انسخ من مجلد المضيف مباشرة `./db/custom.db` — نفس الأوامر أعلاه.

---

## 7) التحديثات

عند توفر إصدار جديد من الكود:

```bash
cd /home/user/erp

# 1) خذ نسخة احتياطية أولاً (أمان)
cp db/custom.db backups/custom-before-update-$(date +%F-%H%M).db

# 2) ارفع الكود الجديد (unzip فوق المجلد أو git pull)

# 3) حدّث الاعتماديات والمخطط والبناء
bun install
bun run db:push        # يضيف الجداول/الأعمدة الجديدة بدون حذف البيانات

# 4) أعد البناء
bun run build

# 5) أعد التشغيل
pm2 restart erp-saas
```

**في وضع Docker:**

```bash
docker compose up -d --build
```

---

## 8) تفعيل التكاملات (بريد + واتساب)

النظام يعمل بدون أي من هذين التكاملين — يتحول تلقائياً إلى **وضع المحاكاة** (تسجيل الرسائل داخلياً للبريد، وروابط wa.me للواتساب).

### 8.1 البريد الإلكتروني — Resend

1. أنشئ حساباً في [resend.com](https://resend.com) (خطة مجانية: 3000 بريد شهرياً).
2. من قسم **Domains** → أضف دومينك ووثّقه عبر سجلات DNS (SPF/DKIM) التي تعرضها المنصة.
3. من قسم **API Keys** → أنشئ مفتاحاً يبدأ بـ `re_`.
4. ضع القيم في `.env`:

```env
RESEND_API_KEY=re_xxxxxxxxxxxxxxxx
EMAIL_FROM=ERP <noreply@yourdomain.com>
```

5. أعد التشغيل: `pm2 restart erp-saas` (أو `docker compose restart app`).

> للتجربة بدون دومين موثق: استخدم `EMAIL_FROM=ERP <onboarding@resend.dev>` — يعمل الإرسال لكن للبريد المسجّل في حساب Resend فقط.

### 8.2 الواتساب — Meta Cloud API

1. من [developers.facebook.com/apps](https://developers.facebook.com/apps) أنشئ تطبيقاً من نوع **Business**.
2. أضف منتج **WhatsApp** ثم من إعداداته أضف رقماً هاتفياً ووثّقه (OTP).
3. من تبويب **WhatsApp → API Setup** انسخ:
   - **Phone Number ID** (معرّف رقم الهاتف).
   - أنشئ **Access Token دائماً**: من Business Settings → System Users → أنشئ مستخدماً نظامياً بصلاحية `whatsapp_business_messaging` وولّد له توكناً.
4. ضع القيم في `.env`:

```env
WHATSAPP_TOKEN=EAAGxxxxxxxxxxxxxxxx
WHATSAPP_PHONE_ID=123456789012345
```

5. أعد التشغيل: `pm2 restart erp-saas` (أو `docker compose restart app`).

> 💡 لاختبار سريع قبل التوثيق الرسمي: حساب المطور يمنح 3 أرقام محادثة مجانية للأبد (WhatsApp Test Numbers).

---

## 9) استكشاف الأخطاء

| المشكلة | السبب المحتمل | الحل |
|---|---|---|
| `EADDRINUSE: port 3000 in use` | عملية أخرى تحتكر المنفذ | `lsof -i :3000` ثم `kill -9 <PID>` — أو غيّر `PORT` في `.env` وأعد التشغيل |
| فشل `bun run build` (نفاد الذاكرة) | خادم 1GB رام | أضف swap مؤقتاً: `sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile` ثم أعد البناء |
| `Error: database is locked` | عمليات متزامنة على SQLite | تأكد `instances: 1` في ecosystem.config.js ولا تشغّل نسختين من الخادم؛ أعد التشغيل `pm2 restart erp-saas` |
| الجداول غير موجودة / `P2021` | لم يُنفَّذ دفع المخطط | `bun run db:push` (أو داخل Docker: `docker compose exec app bunx prisma db push`) |
| الصفحة بيضاء / 404 بعد النشر | لم يُنسخ مجلد static | أعد `bun run build` كاملاً — السكربت ينسخ `.next/static` إلى standalone تلقائياً |
| `prisma` لا يجد قاعدة البيانات | `DATABASE_URL` مسار نسبي أو خاطئ | استخدم مساراً مطلقاً: `bun run env:generate --force --db-path ./db/custom.db` — وفي Docker: `--db-path /app/db/custom.db` |
| `Permission denied` على db/ | مالك المجلد غير مستخدم التشغيل | `sudo chown -R $USER:$USER /home/user/erp` (وفي Docker: `sudo chown -R 1000:1000 db/`) |
| البريد لا يصل | مفتاح Resend فارغ أو دومين غير موثق | راجع القسم 8.1 وتأكد من التوثيق، ثم راجع سجل الرسائل داخل النظام (وضع المحاكاة يسجل كل شيء) |
| الواتساب يفتح wa.me فقط | التوكن/المعرّف غير مضبوطين | راجع القسم 8.2 ثم `pm2 restart erp-saas` |
| `pm2: command not found` بعد إعادة الدخول | غير مثبت عالمياً | `sudo npm i -g pm2` أو استخدم `bunx pm2` |
| الموقع لا يفتح من الخارج | جدار ناري / DNS | `sudo ufw status` (افتح 80 و443 فقط) وتأكد أن `ping erp.yourdomain.com` يشير لـ IP الخادم |

**أوامر تشخيص سريعة:**

```bash
pm2 status && pm2 logs erp-saas --lines 30   # حالة التطبيق ولوجاته
curl -I localhost:3000                        # هل يستجيب الخادم محلياً؟
sudo nginx -t                                 # صحة إعدادات Nginx
docker compose logs --tail 50 app             # لوجات Docker
df -h / && free -m                            # المساحة والذاكرة
```

---

## 10) بيانات الدخول التجريبية

بعد تنفيذ `bun run seed` تتوفر هذه الحسابات (كلمة السر = اسم المستخدم + 123):

| المستخدم | كلمة السر | الدور | ملاحظات |
|---|---|---|---|
| `admin` | `admin123` | **مدير المنصة** (Super Admin) | الوصول الكامل + لوحة إدارة المنصة |
| `sara` | `sara123` | محاسب | شركة الأفق للتجارة + مدير في مؤسسة النخبة |
| `khaled` | `khaled123` | مبيعات | شركة الأفق للتجارة |
| `mona` | `mona123` | مالك | متجر الواحة (نقاط البيع POS) |

تغطي البيانات التجريبية 3 منشآت (باقة Pro / تجريبية / Basic) مع منتجات وفواتير ومشتريات وقيود محاسبية كاملة لتجربة كل الشاشات فوراً.

> 🔐 **تحذير أمني مهم:** هذه بيانات عامة معروفة — **غيّر كلمات السر فوراً** بعد أول دخول (من إدارة الفريق)، ولا تشغّل `seed` على خادم إنتاج يحتوي بيانات حقيقية لأنه يمسح البيانات الحالية ويعيد إنشاءها.

---

## 📎 روابط ذات صلة

- التشغيل المحلي وهيكل المشروع: [README.md](README.md)
- مرجع متغيرات البيئة: [.env.example](.env.example)
- مولّد البيئة: `bun run env:generate --help`
