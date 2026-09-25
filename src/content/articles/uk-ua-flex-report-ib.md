---
title: "Як сформувати 2026 Flex-звіт в Interactive Brokers"
description: "Покрокова інструкція зі створення Flex-звіту для податкової декларації в Україні. Збір необхідних даних для декларування інвестиційних доходів."
category: "податки"
readTime: "4 хв"
publishedAt: "2025-12-17"
keywords:
  - "інвестиційні доходи україна"
  - "акції оподаткування"
  - "податкова декларація"
  - "форма F0121214"
---

# Покрокова інструкція зі створення Flex-звіту в Interactive Brokers

Увійти до облікового запису [Interactive Brokers](https://www.interactivebrokers.co.uk/sso/Login).

Вкладка **Performance & Reports \ Flex-запити** або за [цим посиланням](https://www.interactivebrokers.co.uk/AccountManagement/AmAuthentication?action=Reports).

В таблиці **Activity Flex Query** натискаємо +

Указуємо обов'язкове ім'я в полі **Query Name**

У таблиці **Sections** вибираємо **Cash Transaction → Dividends, Payment in Lieu of Dividends, Withholding Tax, 871(m) Withholding, Other Income, Brokers interest received, Bond Interest Paid, Bond Interest Received, Detail** та ставимо галочку **Select all → Save**.

У таблиці **Sections** вибираємо **Corporate Actions → Detail** та ставимо галочку **Select all → Save**

У таблиці **Sections** вибираємо **Grant Activity → Detail** та ставимо галочку **Select all → Save**

У таблиці **Sections** вибираємо **Trades → Closed Lots, Execution (якщо у вас були операції з опціонами)** та ставимо галочку **Select all → Save**

Вибираємо **Display Account Alias in Place of Account ID? → Yes**

Натискаємо **Continue → Create — Ok**

У вас має з'явитися рядок з ім'ям яке ви зазначили раніше, праворуч від назви, натисніть стрілку → **Run**

У діалоговому вікні, виберіть Период → **Custom Date Range** та вкажіть термін за який плануєте формувати звіт, зазвичай, це один календарний рік.

В діалозі, натисніть кнопку **Run** та дочекайтесь коли запит буде сформовано

Вигрузіть XML-файл запиту та переходьте до наступного кроку



