# Контур — мини-CRM для строительных объектов

## Запуск локально

1. Установите зависимости: `npm install`.
2. Запустите приложение: `npm run dev`.
3. Для подключения к Supabase Cloud в `.env.local` используются `VITE_SUPABASE_URL` и `VITE_SUPABASE_PUBLISHABLE_KEY`. Чтобы вместо облака использовать локальный Supabase, замените эти значения на URL и anon key из `npx supabase status`.

## Подключение к Supabase Cloud

В `.env.local` уже указаны URL и publishable key проекта. Такой ключ предназначен для клиентского приложения; секретный `service_role` ключ во фронтенд не добавляйте.

Перед первым входом и регистрацией примените миграции и разверните Edge Functions из корня проекта. Для этого нужна учётная запись Supabase с доступом к проекту и пароль его базы данных:

```sh
npx supabase@3 login
npx supabase@3 link --project-ref nqhbvgotwtucdhjalkch
npx supabase@3 db push --yes --remote
npx supabase@3 functions deploy --remote=nqhbvgotwtucdhjalkch --yes
```

CLI попросит подтвердить доступ к проекту и базе. Миграции создают таблицы и политики доступа CRM. `register-company` настроена как публичная Edge Function, а остальные функции требуют авторизации. В Supabase Dashboard также задайте адрес веб-сайта в **Authentication → URL Configuration**. Для Docker-фронтенда в `deploy/supabase/.env` укажите `APP_SUPABASE_URL` и `APP_SUPABASE_PUBLISHABLE_KEY`.

## Сборка образа без публикации в Docker Hub

Публиковать приложение в Docker Hub не требуется. Compose соберёт образ фронтенда на сервере из исходников и сохранит его локально. Нужны сам проект на сервере и публичный доступ к registry для загрузки официальных образов Supabase, Node.js и Nginx.

## Развёртывание на Linux-сервере

Скопируйте полный проект на сервер (включая `src`, `public`, `supabase` и `deploy`) и перейдите в `deploy/supabase`. Если проект доступен в Git, его можно получить командой `git clone`; иначе загрузите папку через SCP/SFTP.

При первом запуске создайте приватный файл настроек и секреты:

```sh
sh prepare-env.sh
```

Откройте `.env` и задайте:

- `APP_IMAGE` — локальная метка образа, по умолчанию `stroi-crm:local`;
- `APP_SUPABASE_URL` и `APP_SUPABASE_PUBLISHABLE_KEY` — адрес и публичный ключ Supabase Cloud для CRM-фронтенда; без них фронтенд использует локальный self-hosted Supabase;
- `DASHBOARD_USERNAME` — отдельное имя пользователя для Studio;
- `SUPABASE_PUBLIC_URL` и `API_EXTERNAL_URL` — публичный адрес API, например `https://api.example.com` и `https://api.example.com/auth/v1`;
- `SITE_URL` и `ADDITIONAL_REDIRECT_URLS` — адрес сайта, например `https://crm.example.com` и `https://crm.example.com/**`.

После первоначальной настройки поднимайте приложение одной командой из `deploy/supabase`:

```sh
docker compose -f docker-compose.yml -f docker-compose.crm.yml up -d --build
```

При первом запуске Compose соберёт локальный образ CRM, поднимет self-hosted Supabase и применит миграции к его базе. При подключении к Supabase Cloud предварительно выполните команды из раздела выше: Compose не применяет миграции к облачной базе. Сайт слушает порт `APP_PORT` (по умолчанию 8080), self-hosted API — порт 8000. Перед публичным использованием настройте домены и HTTPS reverse proxy и закройте прямой доступ к Studio и Postgres. Не публикуйте `.env`, не добавляйте его в Git и сделайте защищённую резервную копию.

Если на сервере нет доступа к Docker Hub и другим публичным registry, сначала потребуется отдельно перенести туда все базовые и Supabase-образы; эта инструкция предполагает, что сервер может скачать публичные образы.

Compose-стек Supabase основан на [официальной Docker-конфигурации](https://github.com/supabase/supabase/tree/98b845a195e78fd20fa925136d6dcb9059d48070/docker); версии сервисных образов указаны в `deploy/supabase/docker-compose.yml`. Обновляйте их осознанно, сверяя изменения официальной конфигурации. Для долгосрочного хостинга оператор самостоятельно отвечает за обновления, резервные копии, TLS и мониторинг.

## Основные правила доступа

Первая регистрация создаёт компанию и главного постановщика через серверную Edge Function. Публичная регистрация пользователей Supabase отключена; постановщик добавляет сотрудников с ролью и временным паролем. При первом входе сотрудник должен сменить временный пароль. RLS ограничивает доступ к данным компании и задачам, а смена статуса выполняется серверной функцией базы данных с проверкой роли и допустимого перехода. История статусов доступна для чтения, но её записи нельзя менять из клиентского API.
