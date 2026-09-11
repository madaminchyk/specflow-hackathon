# Публикация SpecFlow

Публикация не выполнялась автоматически. Эти действия выполняет участник команды с правами GitHub/Vercel. GitHub хранит код, Vercel запускает полный режим, Pages публикует только статическое демо. Домен покупать не нужно. Условия тарифов и квоты проверяйте в аккаунте; проект не обещает фиксированное число бесплатных дней.

## 1. Подготовка GitHub

Проверьте `.gitignore`, убедитесь, что `.env` не попал в изменения. Запустите проверки из README. Если репозиторий уже настроен, используйте существующий remote, проверив `git remote -v`.

Для нового репозитория создайте пустой репозиторий в GitHub UI. Локальные команды **выполняйте сами после просмотра изменений**, подставив настоящий URL:

```sh
git status
git diff
git add .
git commit -m "Build SpecFlow requirements workspace"
git remote add origin https://github.com/YOUR_TEAM/specflow-hackathon.git
git push -u origin HEAD
```

`git remote add` пропустите, если origin существует. Нельзя помещать токен в remote URL. CI использует lockfile через `npm ci` и проверяет форматирование, типы, lint, тесты и сборку.

## 2. Vercel: frontend + API

1. В Vercel откройте **Add New → Project**, подключите GitHub и импортируйте репозиторий.
2. Root Directory — корень репозитория. Framework — Vite. Install Command — `npm ci`. Build Command — `npm run build`. Output Directory — `dist`. Выберите поддерживаемый Node.js 22 или 24.
3. Для демо не добавляйте AI-ключ. Для облачного режима внесите `YANDEX_API_KEY` сервисного аккаунта и `YANDEX_FOLDER_ID` для анализа в серверные Environment Variables проекта. Остальные настройки и значения по умолчанию перечислены в `.env.example` и README. `VITE_BASE_PATH=/` — единственная публичная настройка пути; секрет никогда не получает префикс `VITE_`. После появления URL задайте `APP_ORIGIN` точно, например `https://your-project.vercel.app`, и повторно разверните проект. Не включайте URL preview-deployment в production-origin случайно.
4. Если включаете платный AI, ограничьте доступ к deployment и расходы в аккаунте провайдера. В приложении нет пользовательской авторизации; CORS/origin-проверка не защищает от прямых серверных запросов.
5. Запустите Deploy. Проверьте, что созданы функции `/api/analyze` и `/api/transcribe`. `vercel.json` задаёт сборку, статические заголовки и максимум 120 секунд для функций. Если тариф/настройки аккаунта не допускают такой duration, уменьшите его и серверные/клиентские таймауты согласованно.
6. Откройте главную, демо, экспорт. Обновите URL `/#/project/<id>` в том же браузере. Используется HashRouter, поэтому rewrite всех URL на index не требуется и не перехватывает API.
7. Без ключа валидный POST на AI возвращает 503; GET возвращает 405. С ключом проверьте тестовую запись до 30 секунд и 1 МБ, WAV PCM 16-bit mono или OggOpus mono. SpeechKit v1 возвращает один сегмент с приблизительным временем, без диаризации. Проверьте текст и анализ требований отдельно: успешное распознавание сохраняется даже при ошибке анализа. Живой вызов не входит в текущий mock-прогон.

Vercel поддерживает Node.js/TypeScript-функции в `api/` и Node request/response handlers: [официальная документация](https://vercel.com/docs/functions/runtimes/node-js). Ограничения payload и времени определяются платформой: [Vercel Functions Limits](https://vercel.com/docs/functions/limitations). Здесь синхронное аудио ограничено 1 000 000 байт и 30 секундами из-за режима SpeechKit; base64 увеличивает тело JSON. Таймаут одного облачного запроса — до 55 секунд, анализ может сделать один повтор, поэтому функция должна допускать оба запроса. Большие записи отклоняются с `ASYNC_REQUIRED`, очередь не запущена: [план асинхронного режима](ASYNC_TRANSCRIPTION.md).

## Диагностика API на Vercel

Оба endpoint находятся в корневом `api/`: `/api/analyze` и `/api/transcribe`.
Фронтенд обращается к ним на текущем домене, отдельный base URL не нужен.
Vite proxy на порт 3001 используется только локально; в production работают Node.js Functions.
Root Directory в настройках Vercel должен указывать на каталог с `package.json`, `api/` и `vercel.json`.
Не добавляйте SPA-rewrite, перехватывающий `/api/*`: интерфейс использует hash-маршруты.

`GET /api/analyze` и `GET /api/transcribe` должны возвращать HTTP 405 с JSON
`{"error":"Используйте POST."}` без обращения к Yandex. HTTP 500 с
`FUNCTION_INVOCATION_FAILED` означает падение функции, а не отсутствие API-маршрута.
Относительные импорты серверного дерева используют `.js` для Node ESM;
`npm run build` дополнительно проверяет их с `tsconfig.server.json` (NodeNext).
Обоснование: [обязательные расширения Node ESM](https://nodejs.org/api/esm.html#mandatory-file-extensions).

Локальный `.env` не переносится в Vercel. В Environment Variables для **Production**
нужны `YANDEX_API_KEY` и, для анализа, `YANDEX_FOLDER_ID` либо `YANDEX_ANALYSIS_MODEL_URI`.
Если задан `APP_ORIGIN`, он должен точно совпадать с origin сайта без завершающего `/`.
После изменения переменных нужен новый deployment. Значения ключей не помещайте в логи,
скриншоты, клиентские переменные `VITE_*` или Git. При отсутствии ключа исправно запущенный
обработчик возвращает JSON с HTTP 503 и `NOT_CONFIGURED`.

## 3. GitHub Pages: статическое демо

1. В GitHub откройте Settings → Pages → Source → GitHub Actions.
2. В Actions выберите **Deploy static demo to Pages**, запустите **Run workflow** на нужной ветке.
3. Workflow установит `VITE_BASE_PATH=/<repository-name>/` (для репозитория `*.github.io` — `/`), выполнит `npm ci`, проверки и сборку, отправит только `dist` через официальный Pages artifact.
4. Откройте URL deployment. Нажмите демо и обновите hash-маршрут. Файлы ресурсов и manifest должны загружаться из base path. Этот вариант не содержит серверных функций; AI-обработка покажет сообщение о недоступном сервере.

Никаких секретов Yandex в workflow Pages добавлять нельзя. Для локального воспроизведения сборки с подпутём в PowerShell:

```powershell
$env:VITE_BASE_PATH='/specflow-hackathon/'
npm run build
npm run preview
```

Затем открыть `http://127.0.0.1:4173/specflow-hackathon/`. Чтобы вернуть обычную сборку, установите `VITE_BASE_PATH=/` и пересоберите. Настройка base согласована с [руководством Vite по статической публикации](https://vite.dev/guide/static-deploy.html).

## 4. После публикации

Проверьте локальный режим без ключа, обновление страницы, сохранение правки, DOCX/Markdown, мобильную навигацию и ошибки AI. Для офлайн-проверки сначала загрузите production-сборку, затем перезагрузите без сети. Обновления service worker активируются после закрытия старых вкладок; он не кеширует API-ответы и записи. Не используйте `npm run preview` как промышленный сервер.

Если нужна другая модель, проверьте её поддержку Structured Outputs или сегментной транскрибации. Значения env конфигурируемы, но возможности моделей не взаимозаменяемы автоматически. Рабочая локальная архитектура и тесты не являются подтверждением успешного deployment — проверьте журнал и URL своего аккаунта.
