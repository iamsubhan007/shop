import Link from 'next/link';
import { getInitialSiteData } from '@/lib/server/siteData';
import { BUSINESS, SITE_NAME, siteUrl } from '@/lib/seo';
import { buildFaq, buildRestaurantSchema, facts, faqSchema, jsonLd, websiteSchema } from '@/lib/seoContent';

const list = (arr) => (arr.length <= 1 ? arr.join('') : `${arr.slice(0, -1).join(', ')} and ${arr[arr.length - 1]}`);

// Server-rendered text and structured data for the home page: what the shop is, what it bakes, and the questions
// customers ask, written in plain sentences that search engines and AI assistants can quote. Hours, delivery rules,
// payment methods and prices are read from the live settings and menu, so they are always the current ones.
export default async function HomeSeo() {
  const ctx = await getInitialSiteData();
  const url = siteUrl();
  const f = facts(ctx);
  const faq = buildFaq(ctx, url);
  const km = f.delivery?.enabled ? Number(f.delivery.radius_m) / 1000 : 0;
  const graph = [buildRestaurantSchema(ctx, url), websiteSchema(url), ...(faq.length ? [faqSchema(faq)] : [])];

  return (
    <>
      {graph.map((data, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(data) }} />
      ))}
      <section aria-labelledby="about-heading" className="bg-white border-t border-zinc-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 grid gap-10 lg:grid-cols-2">
          <div className="space-y-4 text-sm leading-relaxed text-zinc-700">
            <h2 id="about-heading" className="text-2xl font-black text-zinc-900 leading-tight">
              Fresh qeema naan, pizza naan and tandoori naans in {BUSINESS.area}
            </h2>
            <p>
              {SITE_NAME} is a tandoor naan shop at {BUSINESS.streetAddress}, {BUSINESS.locality}. Every naan is baked fresh to order, and you can
              order online for home delivery{km > 0 ? ` within ${Number.isInteger(km) ? km : km.toFixed(1)} km of the shop` : ''} or collect it from the shop.
            </p>
            {f.qeema.length > 0 && (
              <p>
                Looking for the best qeema naan in Lahore? Try our {list(f.qeema.map((p) => p.name))}, baked fresh in the tandoor.
              </p>
            )}
            <p>
              Our menu also has a tandoori pizza naan, cheese naans, aloo and besaan naans, rogni naans, parathas and sides, plus combo deals for the family.
            </p>
            <p className="flex flex-wrap gap-3 pt-1">
              <Link href="/Menu" className="inline-flex items-center rounded-full bg-red-700 px-5 py-2.5 text-xs font-bold text-white hover:bg-red-800 transition-colors">See the full menu</Link>
              <Link href="/#deals-section" className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-5 py-2.5 text-xs font-bold text-red-700 hover:bg-red-100 transition-colors">Today&apos;s combo deals</Link>
            </p>
          </div>

          {faq.length > 0 && (
            <div>
              <h2 className="text-2xl font-black text-zinc-900 mb-4">Frequently asked questions</h2>
              <div className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-zinc-50/60">
                {faq.map(({ q, a }) => (
                  <details key={q} className="group px-4 py-3">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-bold text-zinc-900">
                      <h3 className="text-sm font-bold">{q}</h3>
                      <span aria-hidden="true" className="text-lg leading-none text-red-700 transition-transform group-open:rotate-45">+</span>
                    </summary>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-700">{a}</p>
                  </details>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
