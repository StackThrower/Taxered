# XSD-схеми ДПС для F0100215 і F0121215

Офіційні схеми електронних форм податкової декларації про майновий стан і доходи (F01002xx)
і додатка Ф1 (F01212xx). Зберігаються в репозиторії, бо сервери tax.gov.ua недоступні з CI
за межами України. Використовуються в `npm test` для перевірки згенерованих XML (`xmllint`).

Завантажено 08.11.2026.

| Файл-джерело | URL | SHA-256 |
|---|---|---|
| `f0100215.arj` | https://tax.gov.ua/data/material/000/357/453385/f0100215.arj | `4ca17630212747fecd82694579e18cb0fda4c6918261c079883976d8a7b9a35e` |
| `xsd_all.arj` | https://tax.gov.ua/data/material/000/357/453385/xsd_all.arj | `9157d2fc575173e2f2d5b98f4b40013a93d5747611c1e88e0b26ee257a4d6ecb` |
| `common_types.xsd` | https://tax.gov.ua/data/material/000/357/453385/common_types.xsd | `f53226747bda74c793f2fd9e9b55d55e5073219f866b2cd29c10e60ba340fef1` |

Розпакування: `7zz x f0100215.arj` (Homebrew `sevenzip`) або `7z x` (p7zip-full) / `arj e`.

| Файл | Звідки | SHA-256 |
|---|---|---|
| `F0100215.xsd` | `f0100215.arj` (ідентичний копії з `xsd_all.arj`) | `911613c8664b4f6efc4a4b7d6f24cd8562a0a9ce1a4a827f5e994f6571165c24` |
| `F0121215.xsd` | `f0100215.arj` (ідентичний копії з `xsd_all.arj`) | `59a226daf57e9ec251af404a86edc94711b76a97c66309540739d21feac7bc39` |
| `F0100214.xsd` | `xsd_all.arj` | `ff31cb6e9867dea4b350c588224cc203f233ab6e6ca4554de9bea23e502ab255` |
| `F0121214.xsd` | `xsd_all.arj` | `f9f1956bb929c4b88f16d0c3e9b82cc00f8dc9344c88cfdbab503409c27ffe77` |
| `F0100213.xsd` | `xsd_all.arj` | `4e4eb0f8eda7760b5660b1ee5a97ae2d90b0bf04c62463a9c9dad1ddef86ecff` |
| `F0121213.xsd` | `xsd_all.arj` | `1b96d1d752bb8516941eea92b99cc21d6eb70a9677178d5b98d8cc46610bf10d` |
| `common_types.xsd` | окремий файл | `f53226747bda74c793f2fd9e9b55d55e5073219f866b2cd29c10e60ba340fef1` |
| `forms/F0100215.pdf` | `f0100215.arj`, бланк з кодами полів | `d52d71dc2887e5477c133e20d7f87fcc21435175164ed3611f73d3ed63a12f10` |
| `forms/F0121215.pdf` | `f0100215.arj`, бланк з кодами полів | `1ba9fb5b532c746c1468b0c2238ee6b33861198759401fba03c68b2af654f51c` |

Версії 13 і 14 відрізняються від 15 лише полями, які Taxered не заповнює (`R0131G3`,
`R0203G3`, `R023G6`…`R027G6`, `HD10`, тип `R026G2`), тому їх обслуговує той самий генератор
з іншим `C_DOC_VER` (мапа в `src/app/lib/dps-xml/versions.ts`). Усі версії включають один
актуальний `common_types.xsd`.

Схеми в кодуванні windows-1251; не перекодовувати.
