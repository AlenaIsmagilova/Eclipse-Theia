# Theia Notification Center

Тестовое приложение реализует сквозной центр уведомлений для Eclipse Theia:
Node.js backend хранит последние 100 уведомлений и публикует типизированные
RPC-события, а browser frontend показывает toast и историю в боковой панели.

## Что такое Eclipse Theia

Theia — TypeScript-платформа для создания собственных browser/desktop IDE.
Это не классическая Eclipse IDE и не обычное VS Code extension. Приложение
разделено на browser frontend и Node.js backend с отдельными DI-контейнерами;
они общаются через JSON-RPC поверх WebSocket. Общие wire-типы находятся в
`notification-center/src/common`.

Проект использует зафиксированную community-stable версию Theia `1.71.2` и
Yarn Classic.

## Структура

- `browser-app` — запускаемое browser-приложение Theia.
- `notification-center/src/common` — DTO и двунаправленный RPC-контракт.
- `notification-center/src/node` — in-memory `NotificationService` и тесты.
- `notification-center/src/browser` — RPC client, custom toast overlay,
  ReactWidget и команды.

## Запуск

Требуются Node.js 22+ и Yarn 1.22.x.

```bash
yarn
yarn build
yarn start:browser
```

После запуска откройте <http://localhost:3000>. Панель **Notification Center**
находится справа. Через палитру команд (`F1`) доступны демонстрационные команды:

- `Notification Center: Push Info`
- `Notification Center: Push Warning`
- `Notification Center: Push Error`

## Проверки

```bash
yarn test
yarn build
```

`yarn test` запускает backend unit-тесты. `yarn build` дополнительно собирает
полное browser-приложение и тем самым проверяет DI-модули и bundling frontend.

## Поведение

- Backend назначает время создания и хранит последние 100 записей в порядке
  добавления.
- Панель группирует записи по локальной дате в секции `Today`, `Yesterday` и
  `Earlier`; группы и записи отображаются от новых к старым.
- Info и warning toast закрываются через 5 секунд; error остаётся до ручного
  закрытия.
- Actions из toast и панели передают `notificationId`/`actionId` обратно на
  backend.
- `Clear All` очищает backend-историю и синхронизирует все открытые frontend.
- История хранится in-memory и сбрасывается при остановке backend — файловая
  персистентность не входит в выбранный объём задачи.


