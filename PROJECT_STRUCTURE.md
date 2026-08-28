# وثيقة هيكل المشروع | Project Structure Documentation

منصة "المرسال" هي منصة تعليمية تفاعلية لمادة الأحياء لطلاب الثانوية العامة في مصر.
الواجهة مبنية بـ HTML/CSS/JavaScript خالص (Vanilla JS) مع **Vite** للتجميع، والواجهة
الخلفية مبنية بـ **Node.js + Express + Prisma + PostgreSQL (Neon)**.

---

## 1. شجرة الملفات العامة | Top-Level File Tree

```text
MSAsmaa/
├── index.html                  # الصفحة الرئيسية مع التميمة والمميزات
├── login.html                  # بوابة الدخول وإنشاء الحساب (تبويبات auth)
├── forgot-password.html        # استعادة كلمة المرور (إرسال التحقق)
├── reset-password.html         # تعيين كلمة مرور جديدة
├── registration-requests.html  # طلبات التسجيل للمعلم
├── students.html               # إدارة الطلاب المقبولين للمعلم
├── dashboard-teacher.html      # لوحة تحكم المعلم (مقاطع، مواد PDF، اختبارات)
├── lessons.html                # دليل المسارات الدراسية
├── course-biology.html         # منهج الأحياء - الصف الثالث الثانوي
├── lesson-view.html            # صفحة عرض الدرس (فيديو + مواد PDF + ملاحظات + امتحانات)
├── exams.html                  # مركز الامتحانات Hub (حسب الدرس / كل الامتحانات)
├── courses.html                # صفحة اختيار الكورسات
├── css/
│   ├── style.css               # الأنماط الرئيسية والمكونات المشتركة
│   ├── exams.css               # أنماط الامتحانات والمراجعة
│   ├── login.css               # أنماط صفحة الدخول والتميمة
│   └── mascot.css              # أنماط التميمة وتأثيراتها
├── public/
│   ├── js/curriculum.js        # مصدر الحقيقة لهيكل الأبواب والدروس
│   ├── js/profile-menu.js      # قائمة الملف الشخصي (تفتح فورياً من localStorage)
│   ├── js/components/          # مكوّنات التميمة (samaMascot, eyeTracking, navHover, scrollBiology)
│   └── sw.js                   # Service worker للرفع القابل للاستئناف
├── src/
│   ├── main.js                 # منطق الواجهة الرئيسي (nav, auth, إشعارات, إدارة...)
│   ├── exams.js                # منطق مركز الامتحانات والتقديم والمراجعة
│   ├── quizManagement.js       # إدارة الاختبارات (المعلم) - تفاصيل/مراجعة
│   ├── teacherQuizzes.js       # باني الاختبارات (المعلم)
│   ├── loginPage.js / forgotPasswordPage.js / resetPasswordPage.js
│   ├── studentsPage.js         # إدارة الطلاب
│   ├── components/navbar.js    # شريط التنقل الموحد
│   ├── components/skeleton.js  # مكوّن Skeletons لإعادة الاستخدام
│   ├── services/               # خدمات الواجهة الخلفية (bunny, quiz, materials, ...)
│   ├── routes/                 # مسارات Express (منها quizzes/)
│   ├── middleware(s)/          # مصادقة JWT
│   ├── scripts/                # سكربتات اختبار/فحص وتشخيص
│   └── config/                 # إعدادات (db, bunny.env.config)
├── app.js                      # نقطة دخول Express (المسارات كلها تُركّب هنا)
├── server.js                   # خادم التطوير المحلي
├── vite.config.js              # إعدادات Vite (مداخل الصفحات المبنية)
└── *.md                        # وثائق هذه القراءة (انظر أدناه)
```

> ملاحظة: لا يوجد مجلد `js/` في الجذر — كود الواجهة في `src/` والمكوّنات الثابتة في
> `public/js/`. الوثائق أدناه تعكس هذا الهيكل الحالي.

---

## 2. الصفحات والغرض منها | Pages and Purposes

1. **الصفحة الرئيسية (`index.html`)**: عرض تسويقي بالتميمة «سما» وتأثيراتها، المميزات،
   وشبكة المناهج الدراسية مع روابط للدروس.
2. **بوابة الدخول (`login.html`)**: صفحة مستقلة بمصادقة حقيقية (JWT) عبر
   `loginPage.js`؛ تدعم `?mode=signup` لفتح تبويب إنشاء الحساب مباشرة، ومعها
   `forgot-password.html` و`reset-password.html`.
3. **صفحة الكورسات (`courses.html`)**: صفحة اختيار الكورسات، وتحوي بطاقة منهج الأحياء
   للانتقال إلى `course-biology.html`.
4. **لوحة تحكم المعلم (`dashboard-teacher.html`)**: رفع/إدارة مقاطع الفيديو ومواد PDF،
   باني وإنشاء الاختبارات، طلبات التسجيل، وإدارة الطلاب.
5. **فهرس المناهج (`lessons.html`)**: دليل المسارات يوجّه الطالب للمنهج المناسب.
6. **منهج الأحياء (`course-biology.html`)**: أكورديون الوحدات والدروس مع روابط
   `lesson-view.html?lesson=lesson-N&chapter=chX&title=...`.
7. **عرض الدرس (`lesson-view.html`)**: مشغّل فيديو (Bunny)، مواد PDF داخلية،
   تبويبَي *ملاحظات المعلمة* و*الامتحانات*، وشريط جانبي «دروس هذا الباب».
8. **مركز الامتحانات (`exams.html`)**: تبويبان (حسب الدرس / كل الاختبارات) + لوحة
   ترتيب الكورس الإجمالية، مع نوافذ التقديم والنتيجة والمراجعة.
9. **إدارة الاختبارات / الطلاب** صفحات داخلية للمعلم.

---

## 3. المكونات المشتركة وقابلة لإعادة الاستخدام | Reusable Components

* **شريط التنقل (`.navbar` + `src/components/navbar.js`)**: يُبنى ديناميكياً لكل
  الصفحات؛ نسخة مصغّرة لمن لم يسجّل الدخول ونسخة كاملة حسب الدور (طالب/معلم) مع بدّل
  الوضع الفاتح/الداكن.
* **قائمة الملف الشخصي (`public/js/profile-menu.js`)**: تفتح فورياً من `localStorage`
  بدون أي استدعاء شبكة.
* **مكوّن Skeletons (`src/components/skeleton.js`)**: `skeletonRows` / `skeletonCards` /
  `skeletonLines` / `skeletonError` (مع زر إعادة المحاولة) لكل حالات التحميل.
* **`.card` / `.btn` / `.badge` / `.table` / `.form-group`**: مكونات CSS مشتركة في
  `css/style.css`.

---

## 4. نظام الألوان والخطوط | Color Palette & Typography

* **الأخضر الغابي (الأساسي)**: `#0F4C3A` — الهوية والأزرار الهامة.
* **الأخضر الزمردي (التأكيدي)**: `#10B981` — المؤشرات ونسب التقدم والشارات الإيجابية.
* **الرمادي الطفلي (النصوص)**: `#0F172A`.
* **خلفية عامة**: `#F8FAFC`؛ **سطح البطاقات**: `#FFFFFF`.
* **ذهب/برتقالي (تحذيري)**: `#D97706` — التنبيهات والمعلّق.
* **حدود فاصلة**: `#E2E8F0`.
* **الخطوط**: **Tajawal** للعربي و**Inter** للاتيني (أرقام/مصطلحات) — عبر Google Fonts.
* **الوضع الليلي**: بيانات `data-theme="dark|light"` على `<html>` + متغيّرات CSS.

---

## 5. بنية المنهج | Curriculum Structure

`public/js/curriculum.js` هو **مصدر الحقيقة** الوحيد لهيكل المنهج: 7 أبواب
(`ch1`..`ch7`) وكل باب يحوي دروساً بمعرّفات `lesson-N` متسلسلة، ويحقن تلقائياً
`?lesson=..&chapter=..` في روابط الدروس المرئية. صفحة عرض الدرس تستخدمه لملء
الشريط الجانبي «دروس هذا الباب».

---

## 6. الوثائق المصاحبة | Accompanying Docs

| الملف | يغطي |
|---|---|
| `QUIZ_README.md` | نظام الامتحانات كاملاً (الواجهة + الواجهة الخلفية + الاختبار التلقائي) |
| `VIDEO_INTEGRATION_README.md` | رفع وتشغيل مقاطع الفيديو عبر Bunny Stream |
| `MATERIALS_README.md` | مواد الدرس PDF عبر Supabase Storage |
| `MASCOT_DESIGN_README.md` | التميمة «سما» وتأثيرات الواجهة |
| `MERGE_CONFLICT_RESOLUTION_REPORT.md` | تقرير حل تعارضات الدمج في `dist/` |
| `QUIZ_FULLSCREEN_AND_REVIEW_IMPLEMENTATION.md` | وضع ملء الشاشة ومراجعة الإجابات |
