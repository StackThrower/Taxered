# Taxered

Безкоштовний онлайн-сервіс для заповнення податкової декларації **F0121214 (Додаток Ф1)** —
розрахунок ПДФО та військового збору від операцій з інвестиційними активами. Усі розрахунки
виконуються в браузері, дані не передаються на сервер.

Порт проєкту [TaxDeclaration](https://github.com/StackThrower/TaxDeclaration) з Next.js на Angular.

## Можливості

- Форма F0121214: позиції (акції, облігації, опціони, дивіденди, крипто, нерухомість), курси НБУ на дату операції,
  розрахунок ПДФО 18% / 9% (дивіденди) + військовий збір 1.5% (≤2024) / 5% (≥2025)
- Імпорт XML-звітів Interactive Brokers (Flex Query) та Freedom Finance
- Експорт у PDF (з копією) та Excel для перевірки розрахунків
- Податковий калькулятор для 10 країн, база знань (Markdown-статті), довідка
- SSR + пререндер усіх сторінок, SEO-метадані та schema.org, `sitemap.xml`
- PWA (Angular service worker), світла/темна тема, cookie-банер (аналітика лише після згоди)
- Доступність: WCAG AA, перевірено axe-core на всіх сторінках у світлій і темній темі

## Стек

Angular 21 (standalone-компоненти, signals, zoneless, SSR/prerender), Tailwind CSS 4, Express,
jsPDF + jspdf-autotable, SheetJS (xlsx), marked, Lucide.

## Команди

```bash
npm install
npm start                 # dev-сервер: http://localhost:4200
npm run build             # production-збірка в dist/Taxered (з пререндером)
npm run serve:ssr:Taxered # запуск зібраного SSR-сервера (PORT, за замовчуванням 4000)
npm test                  # unit-тести (Vitest)
```

## Структура

```
src/
  app/
    core/          # сервіси: SEO, тема, cookie-згода, аналітика; рядки UI (i18n.ts); константи сайту
    layout/        # шапка, футер, перемикач теми, cookie-банер
    declaration/   # секція форм і форма F0121214 (tax-model.ts — чиста логіка розрахунку)
    pages/         # сторінки: головна, калькулятор, про проєкт, довідка, юридичні, база знань, 404
    lib/           # незалежні від фреймворку модулі: парсер XML брокерів, PDF, Excel, курси НБУ
    shared/        # компонент іконок
  content/articles # статті бази знань (Markdown з front matter, вбудовуються під час збірки)
  server.ts        # Express: заголовки безпеки (CSP тощо), редиректи, sitemap.xml, кешування
public/            # шрифти DejaVu для PDF, іконки, manifest, robots.txt
```

Щоб додати статтю: покладіть `uk-ua-<slug>.md` у `src/content/articles` і зареєструйте її в
`src/app/pages/knowledge/articles.ts`.

## Деплой

`Dockerfile` збирає застосунок і запускає самодостатній SSR-бандл (`node dist/Taxered/server/server.mjs`,
порт 3000). GitHub Actions (`.github/workflows/deploy.yml`) публікує образ у GHCR при пуші в `master`;
`terraform/` описує сервіс Cloud Run.

Дозволені хости для SSR задаються в `angular.json` → `security.allowedHosts`
(`taxered.stackthrow.com`, `*.run.app`, `localhost`).
