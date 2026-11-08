# Taxered

Безкоштовний онлайн-сервіс для заповнення податкової декларації про майновий стан і доходи
**F0100215** з **додатком Ф1 (F0121215)** — розрахунок ПДФО та військового збору від операцій з
інвестиційними активами й іноземних доходів. Усі розрахунки виконуються в браузері, дані не
передаються на сервер.

Порт проєкту [TaxDeclaration](https://github.com/StackThrower/TaxDeclaration) з Next.js на Angular.

## Можливості

- Форма декларації з Ф1: позиції (акції, облігації, опціони, дивіденди, проценти, крипто, нерухомість), курси НБУ
  на дату операції, розрахунок ПДФО 18% / 9% (дивіденди) + військовий збір 1.5% (≤2024) / 5% (≥2025),
  збиток минулих років, поріг пп. «а» 170.2.8, коди активів 1–4
- Пакет XML для Електронного кабінету: декларація F0100215 + додаток Ф1 F0121215 у windows-1251 з
  взаємними `LINKED_DOCS` (звітна / звітна нова / уточнююча); версія форми — за роком доходів
  (`src/app/lib/dps-xml/versions.ts`), кожен файл у тестах перевіряється офіційною XSD
  (`schemas/dps/2026`)
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
npm test                  # unit-тести (Vitest) + перевірка XML за XSD ДПС (потрібен xmllint)
```

`xmllint` є в macOS; у Debian/Ubuntu — `sudo apt-get install libxml2-utils`.

## Структура

```
src/
  app/
    core/          # сервіси: SEO, тема, cookie-згода, аналітика; рядки UI (i18n.ts); константи сайту
    layout/        # шапка, футер, перемикач теми, cookie-банер
    declaration/   # секція форм і форма декларації з Ф1 (tax-model.ts — чиста логіка розрахунку)
    pages/         # сторінки: головна, калькулятор, про проєкт, довідка, юридичні, база знань, 404
    lib/           # незалежні від фреймворку модулі: парсер XML брокерів, PDF, Excel, курси НБУ
      dps-xml/     # пакет XML для Е-кабінету: F0100215 + Ф1 F0121215, копійки, версії форм
    shared/        # компонент іконок
  content/articles # статті бази знань (Markdown з front matter, вбудовуються під час збірки)
  server.ts        # Express: заголовки безпеки (CSP тощо), редиректи, sitemap.xml, кешування
schemas/dps/       # офіційні XSD і бланки ДПС (джерела й SHA-256 — у README.md там же)
docs/specs/        # технічні завдання
public/            # шрифти DejaVu для PDF, іконки, manifest, robots.txt
```

Щоб додати статтю, покладіть `uk-ua-<slug>.md` у `src/content/articles` — вона підхопиться під час
збірки (`scripts/build-articles.mjs`).

## Деплой

`Dockerfile` збирає застосунок і запускає самодостатній SSR-бандл (`node dist/Taxered/server/server.mjs`,
порт 3000). GitHub Actions (`.github/workflows/deploy.yml`) публікує образ у GHCR при пуші в `master`;
`terraform/` описує сервіс Cloud Run.

Дозволені хости для SSR задаються в `angular.json` → `security.allowedHosts`
(`taxered.stackthrow.com`, `*.run.app`, `localhost`).
