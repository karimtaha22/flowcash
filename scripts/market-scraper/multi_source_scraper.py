import asyncio
import json
import os
import sys
import re
from playwright.async_api import async_playwright
from deep_translator import GoogleTranslator

all_products = []
seen_signatures = set()
translator = GoogleTranslator(source='auto', target='ar')

TALABAT_SLUGS = [
    {"name": "شوكولاتة وسناكس", "slug": "snacks-chocolate/chocolate"},
    {"name": "بيض وألبان", "slug": "dairy-eggs/eggs"},
    {"name": "حليب طازج ومعبأ", "slug": "milk/fresh-milk"},
    {"name": "مستلزمات إفطار وحبوب", "slug": "breakfast-food/cereals"},
    {"name": "مستلزمات خبز وطبخ", "slug": "cooking-baking/baking-ingredients"},
    {"name": "معلبات وأسماك", "slug": "canned-jarred/canned-seafood"},
    {"name": "حفاضات ورعاية أطفال", "slug": "baby-corner/diapers"},
    {"name": "منظفات وغسيل صحون", "slug": "cleaning-laundry/dishwashing"},
    {"name": "مياه ومشروبات", "slug": "beverages/water"}
]

# قاموس مرادفات تلقائي لتغطية الكلمات اليومية الشائعة
SYNONYMS = {
    "حليب": "لبن milk",
    "لبن": "حليب milk",
    "milk": "لبن حليب",
    "زيت": "oil",
    "oil": "زيت",
    "ارز": "أرز rice",
    "أرز": "ارز rice",
    "rice": "ارز أرز",
    "شوكولاتة": "شوكولاته chocolate",
    "chocolate": "شوكولاتة شوكولاته",
    "مياه": "ماء water",
    "water": "مياه ماء",
    "جبنة": "جبن cheese",
    "cheese": "جبنة جبن",
    "شاي": "tea",
    "tea": "شاي",
    "قهوة": "بن coffee",
    "coffee": "قهوة بن",
    "المراعي": "almarai",
    "almarai": "المراعي",
    "جهينة": "juhayna",
    "juhayna": "جهينة",
    "حفاضات": "بامبرز diapers pampers",
    "diapers": "حفاضات بامبرز"
}

# ----------------------------------------------------------------------------
# Round 37 — دمج السكريبت ده مع تطبيق الويب (FlowCash). التعديلات كلها في
# القسم ده بس؛ منطق السحب نفسه (أمازون/نون/طلبات) متغيرش خالص:
#
# 1. push_products_to_db(): بتبعت all_products لـ
#    POST /api/reminders/grocery/market-import على دفعات (بدل ملف JSON بس)
#    — الراوت بيعمل upsert (تحديث لو الصنف/المتجر موجودين، إدراج لو جدد)
#    ويستخرج الماركة/الوزن/الوحدة تلقائيًا بنفسه (lib/marketCatalogParser.ts)
#    من اسم المنتج، فمحتاجناش نكرر نفس المنطق هنا بايثون.
# 2. SCRAPE_HEADLESS: افتراضيًا true دلوقتي (بدل False) عشان يشتغل من غير
#    شاشة على GitHub Actions — شغّله بـ`SCRAPE_HEADLESS=false` محليًا لو
#    عايز تتابع المتصفح شغال قدامك زي الأول.
# 3. الـ input() الأخير (اضغط Enter للإنهاء) بيتخطى تلقائيًا لما السكريبت
#    يشتغل من بيئة مش تفاعلية (CI) عشان مايعلقش لنهاية الوقت المسموح للـ job.
#
# متغيرات البيئة المطلوبة (كلها لازم تتحط كـ GitHub Secrets لو هتشغّل
# السكريبت عن طريق .github/workflows/market-price-scrape.yml):
#   FLOWCASH_APP_URL        — مثال: https://flowcash.vercel.app
#   MARKET_IMPORT_SECRET    — نفس القيمة المتحطة في متغير بيئة Vercel
#                              بنفس الاسم (MARKET_IMPORT_SECRET)
# ----------------------------------------------------------------------------
IMPORT_BATCH_SIZE = 200


def push_products_to_db(products, batch_size=IMPORT_BATCH_SIZE):
    """يبعت المنتجات لقاعدة بيانات FlowCash على دفعات (upsert — مفيش تكرار)."""
    app_url = os.environ.get("FLOWCASH_APP_URL", "").rstrip("/")
    secret = os.environ.get("MARKET_IMPORT_SECRET", "")
    if not app_url or not secret:
        print("[!] FLOWCASH_APP_URL أو MARKET_IMPORT_SECRET مش متحطين — تم تخطي الحفظ في قاعدة البيانات (الملف المحلي JSON لسه اتحفظ عادي).")
        return

    try:
        import requests
    except ImportError:
        print("[!] مكتبة requests مش متسجلة (pip install requests) — تم تخطي الحفظ في قاعدة البيانات.")
        return

    url = f"{app_url}/api/reminders/grocery/market-import"
    headers = {"Authorization": f"Bearer {secret}", "Content-Type": "application/json"}

    total_inserted = total_updated = total_skipped = 0
    for i in range(0, len(products), batch_size):
        batch = products[i:i + batch_size]
        payload = {
            "products": [
                {
                    "name": p.get("name"),
                    "price": p.get("price"),
                    "source": p.get("source"),
                    "image": p.get("image"),
                    "url": p.get("url"),
                    "old_price": p.get("old_price"),
                }
                for p in batch
            ]
        }
        try:
            res = requests.post(url, headers=headers, json=payload, timeout=30)
            if res.status_code == 200:
                data = res.json()
                total_inserted += data.get("inserted", 0)
                total_updated += data.get("updated", 0)
                total_skipped += data.get("skipped", 0)
                print(f"[✓] دفعة {i // batch_size + 1}: أضيف {data.get('inserted', 0)} / اتحدّث {data.get('updated', 0)} / اتخطى {data.get('skipped', 0)}")
            else:
                print(f"[!] فشلت دفعة {i // batch_size + 1} — HTTP {res.status_code}: {res.text[:200]}")
        except Exception as e:
            print(f"[!] خطأ في إرسال دفعة {i // batch_size + 1}: {e}")

    print(f"\n[✓] الإجمالي في قاعدة البيانات: أضيف {total_inserted} / اتحدّث {total_updated} / اتخطى {total_skipped}")


def load_existing_data(file_path="all_market_products.json"):
    """تحميل المنتجات السابقة حتى لا يمسح أي بيانات قديمة"""
    global all_products, seen_signatures
    if os.path.exists(file_path):
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                all_products = json.load(f)
                for item in all_products:
                    sig = f"{item.get('name', '').strip()}_{item.get('source', '')}_{item.get('price', '')}"
                    seen_signatures.add(sig)
            print(f"[*] تم تحميل {len(all_products)} منتج مسجل مسبقاً.")
        except Exception:
            all_products = []
            seen_signatures = set()

def enrich_product_keywords(name: str) -> dict:
    """توليد ترجمة ومرادفات عربية/إنجليزية لأي منتج تلقائياً"""
    name_clean = str(name).strip()
    has_english = bool(re.search(r'[a-zA-Z]', name_clean))
    name_ar = name_clean

    # إذا كان الاسم بالإنجليزية نترجمه للعربية آلياً
    if has_english:
        try:
            name_ar = translator.translate(name_clean)
        except Exception:
            name_ar = name_clean

    # تجميع الكلمات المفتاحية والمرادفات
    combined_words = f"{name_clean} {name_ar}".lower()
    extra_synonyms = []

    for key, syn_val in SYNONYMS.items():
        if key in combined_words:
            extra_synonyms.append(syn_val)

    search_keywords = f"{name_clean} {name_ar} {' '.join(extra_synonyms)}".strip()

    return {
        "name_original": name_clean,
        "name_ar": name_ar,
        "search_keywords": search_keywords
    }

def add_product(name, price, source, image=None, url=None, old_price=None):
    """إضافة المنتج وتوليد الحقول الثنائية للبحث"""
    if not name or price is None or price <= 0:
        return False

    name_clean = str(name).strip()
    sig = f"{name_clean}_{source}_{price}"

    if sig not in seen_signatures:
        seen_signatures.add(sig)

        # تجهيز الكلمات المفتاحية والترجمة
        enriched = enrich_product_keywords(name_clean)

        all_products.append({
            "name": enriched["name_original"],
            "name_ar": enriched["name_ar"],
            "search_keywords": enriched["search_keywords"],
            "price": float(price),
            "old_price": old_price,
            "image": image,
            "source": source,
            "url": url
        })
        print(f" [✓] [{source}] {enriched['name_original'][:30]} | {price} ج.م")
        return True
    return False

# ----------------- سحب أمازون -----------------
async def scrape_amazon(context, section_name: str, target_url: str, max_pages: int = 7):
    page = await context.new_page()
    print(f"\n==================================================")
    print(f"[*] سحب أمازون: [{section_name}]")
    print(f"==================================================")

    for page_num in range(1, max_pages + 1):
        url = f"{target_url}&page={page_num}"
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=60000)
            await page.wait_for_timeout(2000)

            for _ in range(2):
                await page.mouse.wheel(0, 2500)
                await page.wait_for_timeout(1000)

            items = await page.evaluate('''() => {
                const results = [];
                const cards = document.querySelectorAll('div[data-component-type="s-search-result"], div[class*="s-result-item"]');

                cards.forEach(card => {
                    const titleEl = card.querySelector('h2 span, h2 a span, [class*="title"]');
                    const name = titleEl ? titleEl.innerText.trim() : null;

                    const priceWholeEl = card.querySelector('.a-price-whole');
                    const priceFractionEl = card.querySelector('.a-price-fraction');

                    let price = null;
                    if (priceWholeEl) {
                        const whole = priceWholeEl.innerText.replace(/[,.]/g, '').trim();
                        const fraction = priceFractionEl ? priceFractionEl.innerText.trim() : '00';
                        price = parseFloat(`${whole}.${fraction}`);
                    }

                    const oldPriceEl = card.querySelector('.a-text-price .a-offscreen');
                    let oldPrice = null;
                    if (oldPriceEl) {
                        const rawOld = oldPriceEl.innerText.replace(/[^0-9.]/g, '').trim();
                        oldPrice = parseFloat(rawOld) || null;
                    }

                    const imgEl = card.querySelector('img.s-image, img');
                    const img = imgEl ? imgEl.src : null;

                    const linkEl = card.querySelector('h2 a, a[class*="link"]');
                    const link = linkEl ? linkEl.href : null;

                    if (name && price && price > 0) {
                        results.push({ name, price, old_price: oldPrice, image: img, url: link });
                    }
                });
                return results;
            }''')

            added = 0
            for it in items:
                if add_product(it['name'], it['price'], f"Amazon - {section_name}", it['image'], it['url'], it.get('old_price')):
                    added += 1

            print(f"[+] أضيف {added} منتج من أمازون صفحة {page_num}")
            if len(items) == 0:
                break

        except Exception as e:
            print(f"[!] خطأ صفحة {page_num}: {e}")
            break

    await page.close()

# ----------------- سحب نون -----------------
async def scrape_noon(context, section_name: str, target_url: str, max_pages: int = 3):
    page = await context.new_page()
    print(f"\n==================================================")
    print(f"[*] سحب نون مصر: [{section_name}]")
    print(f"==================================================")

    for page_num in range(1, max_pages + 1):
        sep = "&" if "?" in target_url else "?"
        url = f"{target_url}{sep}page={page_num}"
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=60000)
            await page.wait_for_timeout(3000)

            for _ in range(3):
                await page.mouse.wheel(0, 3000)
                await page.wait_for_timeout(1000)

            noon_items = await page.evaluate('''() => {
                const results = [];
                const el = document.querySelector('script#__NEXT_DATA__');
                if (el) {
                    try {
                        const data = JSON.parse(el.innerText);
                        const findHits = (obj) => {
                            if (obj && typeof obj === 'object') {
                                if (obj.name && (obj.price || obj.offer_price || obj.sale_price)) {
                                    const p = obj.price || obj.offer_price || obj.sale_price;
                                    let img = obj.image_key || obj.image;
                                    if (img && typeof img === 'string' && !img.startsWith('http')) {
                                        img = `https://f.nooncdn.com/p/${img}.jpg`;
                                    }
                                    results.push({ name: obj.name.trim(), price: parseFloat(p), image: img });
                                }
                                for (let k of Object.keys(obj)) findHits(obj[k]);
                            }
                        };
                        findHits(data);
                    } catch(e) {}
                }
                return results;
            }''')

            added = 0
            for it in noon_items:
                if add_product(it['name'], it['price'], f"Noon - {section_name}", it.get('image'), url):
                    added += 1

            print(f"[+] أضيف {added} منتج من نون صفحة {page_num}")
            if len(noon_items) == 0:
                break

        except Exception as e:
            print(f"[!] خطأ في نون صفحة {page_num}: {e}")
            break

    await page.close()

# ----------------- سحب طلبات مارت -----------------
async def scrape_talabat_section(context, cat):
    page = await context.new_page()
    target_url = f"https://www.talabat.com/ar/egypt/grocery/620009/tmart-new-maadi-taqseem-laselky/{cat['slug']}?aid=7575"
    try:
        await page.goto(target_url, wait_until="domcontentloaded", timeout=45000)
        await page.wait_for_timeout(2500)

        next_data = await page.evaluate('''() => {
            const el = document.querySelector('script#__NEXT_DATA__');
            return el ? JSON.parse(el.innerText) : null;
        }''')

        if next_data:
            added = 0
            def parse_recursive(obj):
                nonlocal added
                if isinstance(obj, dict):
                    if ("name" in obj or "title" in obj) and ("price" in obj or "originalPrice" in obj):
                        name = obj.get("name") or obj.get("title")
                        price = obj.get("price") or obj.get("originalPrice")
                        img = obj.get("image") or obj.get("imageUrl")
                        if name and price and isinstance(price, (int, float)) and price > 0:
                            if add_product(name, price, f"Talabat - {cat['name']}", img, target_url, obj.get("originalPrice")):
                                added += 1
                    for v in obj.values():
                        parse_recursive(v)
                elif isinstance(obj, list):
                    for item in obj:
                        parse_recursive(item)

            parse_recursive(next_data)
            print(f"[+] أضيف {added} منتج من قسم طلبات [{cat['name']}]")
    except Exception as e:
        print(f"[!] خطأ في طلبات {cat['name']}: {e}")
    finally:
        await page.close()

# ----------------- التشغيل الرئيسي -----------------
async def main():
    load_existing_data()

    # Round 37 — افتراضيًا headless دلوقتي (GitHub Actions مفيهوش شاشة).
    # شغّل SCRAPE_HEADLESS=false محليًا لو عايز تتابع المتصفح شغال قدامك.
    headless = os.environ.get("SCRAPE_HEADLESS", "true").strip().lower() != "false"

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=headless)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            locale="ar-EG",
            permissions=["geolocation"],
            geolocation={"latitude": 29.9602, "longitude": 31.2569},
            viewport={"width": 1366, "height": 768}
        )

        # 1. سحب أمازون (سوبر ماركت + مطبخ)
        await scrape_amazon(context, "سوبر_ماركت", "https://www.amazon.eg/s?srs=26082334031&language=ar_AE", max_pages=7)
        await scrape_amazon(context, "المنزل_والمطبخ", "https://www.amazon.eg/s?k=%D9%85%D8%B3%D8%AA%D9%84%D8%B2%D9%85%D8%A7%D8%AA+%D9%85%D8%B7%D8%A8%D8%AE+%D9%88%D9%85%D9%86%D8%B2%D9%84&language=ar_AE", max_pages=3)

        # 2. سحب نون
        await scrape_noon(context, "بقالة", "https://www.noon.com/egypt-ar/grocery/", max_pages=3)
        await scrape_noon(context, "منظفات", "https://www.noon.com/egypt-ar/grocery-store/home-care-and-cleaning/", max_pages=3)

        # 3. سحب طلبات مارت
        print(f"\n==================================================")
        print(f"[*] سحب أقسام طلبات مارت")
        print(f"==================================================")
        for cat in TALABAT_SLUGS:
            await scrape_talabat_section(context, cat)
            await asyncio.sleep(1)

        await browser.close()

    # حفظ الملف النهائي الثنائي (عربي + إنجليزي)
    with open("all_market_products.json", "w", encoding="utf-8") as f:
        json.dump(all_products, f, ensure_ascii=False, indent=2)

    print(f"\n==================================================")
    print(f"[✓] إجمالي المنتجات في الملف النهائي: {len(all_products)} منتج")
    print(f"[✓] تم توليد حقول البحث والترجمة (العربية + الإنجليزية) بنجاح!")
    print(f"[✓] الملف جاهز ومحدث: all_market_products.json")
    print(f"==================================================")

    # Round 37 — حفظ في قاعدة بيانات FlowCash (مش بس الملف المحلي)
    push_products_to_db(all_products)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as err:
        print(f"\n[X] خطأ عام: {err}")
    finally:
        # Round 37 — لو السكريبت شغال في بيئة مش تفاعلية (GitHub Actions مثلاً)
        # مفيش حد هيدوس Enter — بنتخطى الانتظار عشان الـ job ميعلقش لحد ما
        # الوقت المسموح يخلص.
        if sys.stdin.isatty():
            input("\nاضغط Enter للإنهاء...")
