# سكريبت سحب أسعار السوق (Round 37)

سكريبت Playwright (`multi_source_scraper.py`) بيسحب أسماء/أسعار منتجات من أمازون
مصر، نون، وطلبات مارت، وبيحفظها في قاعدة بيانات FlowCash (جدول `market_catalog`
العام) عن طريق `POST /api/reminders/grocery/market-import` — بالإضافة لملف
`all_market_products.json` المحلي زي ما كان بيعمل قبل كده.

## تشغيله محليًا

```bash
cd scripts/market-scraper
pip install -r requirements.txt
playwright install chromium

export FLOWCASH_APP_URL="https://flowcash.vercel.app"      # رابط تطبيقك الفعلي على Vercel
export MARKET_IMPORT_SECRET="نفس-القيمة-المتحطة-في-Vercel"
# اختياري — شغّل المتصفح ظاهر عشان تتابعه:
export SCRAPE_HEADLESS=false

python multi_source_scraper.py
```

## تشغيله أسبوعيًا تلقائيًا (GitHub Actions)

ملف `.github/workflows/market-price-scrape.yml` (في جذر المشروع) بيشغّل
السكريبت ده كل أسبوع تلقائيًا على سيرفرات GitHub المجانية (Vercel Hobby
مالوش cron أكتر من مرة يوميًا، ومحتاج مدة تنفيذ أطول من متصفح Playwright
عادي عشان كده منفصل عن التطبيق نفسه).

**لازم تضيف السرّين دول في إعدادات الريبو على GitHub** (Settings → Secrets
and variables → Actions → New repository secret):

| اسم الـ Secret | القيمة |
|---|---|
| `FLOWCASH_APP_URL` | رابط تطبيقك على Vercel، مثال: `https://flowcash.vercel.app` |
| `MARKET_IMPORT_SECRET` | قيمة سرّية من اختيارك (أي نص عشوائي طويل) — **لازم** تحط نفس القيمة بالظبط كمتغير بيئة `MARKET_IMPORT_SECRET` في إعدادات مشروع Vercel (Settings → Environment Variables) وتعمل Redeploy بعدها |

من غير الخطوة دي، الـ endpoint هيرفض أي طلب (401) وده مقصود — بيانات
بتتبعت من مكان مالوش جلسة مستخدم، فمحتاجة مفتاح سري بدل تسجيل دخول عادي.

يقدر كمان تشغّله يدويًا فورًا من تبويب Actions على GitHub (زرار
"Run workflow") من غير ما تستنى الموعد الأسبوعي.
