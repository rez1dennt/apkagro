# Инвентаризация редактируемого контента

Источник: только public/ и опубликованные modules courses.js/organization.js. Генератор: `node scripts/build-content-defaults.mjs`. Приложение использует сохранённые JSON; генератор нужен для проверки начальной версии.

## Типизированные поверхности

| Поверхность | Контракт | Количество |
|---|---|---|
| benefits | benefits | 4 |
| steps | steps | 4 |
| faqs | faqs | 4 |
| programs | programs | 7 |
| pages | pages | 3 |
| Навигация | navigation.desktop/mobile/footer: id,label,url | 15 |
| Контакты и реквизиты | settings.contacts/organization | Все значения organization.js + телефон для показа |
| Документы | documents.consentPdf/consentWord/policyPdf/license | 4, исходные файлы не изменяются |
| Цвета | settings.colors (только исходные hex-токены) | 16 |
| Приём | settings.intake: enabled,deadline,deadlineLabel,consentVersion | Версия согласия создаётся сервером при публикации |
| SEO | seo и pages[].seo | title,description,ogTitle,ogDescription,ogType,ogImage,robots,themeColor,icon |
| Сообщения формы | messages: site-<digest> | 60 |

Юридические страницы: полный текст `.legal-body` (заголовки как жирные абзацы, списки, ссылки, пары реквизитов), отдельно title/intro/seo. Все семь аннотаций скопированы без сокращения. Карточки: title/cardTitle/category/icon/image/modalImage/alt/focus/hours/format/price/description/topics/disclaimer/buttonLabel/status. benefits/steps/faqs содержат полный текст, картинки и значки исходных элементов.

Технический каркас исключён осознанно: JS/CSS/font preload URLs, viewport/charset, DOM IDs/classes, wave path geometry, input machine names/types/options values, required/accept/maxlength, hidden CSRF/honeypot/protocol inputs. Это не пользовательский текст или управляемая медиа. Числа шагов и метаданные часов рисуются из коллекций. Общие подписи/значки карточек и раскрытия FAQ включены в реестр. Legal download links/text входят в Markdown, оформление download/icon задаётся доверенным шаблоном.

## Статистика исходных поверхностей

- index.html: 238 непустых текстовых узлов; все относятся к полям либо перечисленным типизированным поверхностям.
- privacy/index.html: 90 непустых текстовых узлов; все относятся к полям либо перечисленным типизированным поверхностям.
- consent/index.html: 66 непустых текстовых узлов; все относятся к полям либо перечисленным типизированным поверхностям.
- operator/index.html: 82 непустых текстовых узлов; все относятся к полям либо перечисленным типизированным поверхностям.

## Доверенный реестр полей

Два начальных атрибута скрытого #dialog-image сохранены в схеме для совместимости существующих документов; managedBy=programs исключает их из общих полей редактора. Фотография и её описание редактируются в программе. Общие подписи окна применяются как запасные значения, индивидуальные подписи программы имеют приоритет.

Поле всегда имеет id,label,group,kind,minLength,maxLength,targets. Text с BR хранится с переносами строки; text-node сохраняет leadingSpace/trailingSpace, чтобы соседние узлы не склеивались. Цели file/selector/attribute находятся только в проверенном коде. Рендерить поля до пересборки коллекций. CSS-url цели задают замену sourceUrl в указанном CSS-файле; gradients/crop/адаптивные правила сохраняются. Не принимать цели из API.

| ID | Название для редактора | Тип | Целей |
|---|---|---|---|
| other.text-975aa819f67d | Общие элементы — Перейти к содержанию | text | 4 |
| other.href-3764349b718c | Общие элементы — Ссылка (Перейти к содержанию) | url | 4 |
| header.href-0c39f1e0b48c | Шапка — Ссылка (Кадры в АПКФедеральный проект) | url | 1 |
| header.aria-label-07532326b6f1 | Шапка — Доступное название (Кадры в АПКФедеральный проект) | text | 4 |
| header.src-448dd8f0be61 | Шапка — Изображение (img) | image | 4 |
| header.alt-7bfd830e3e0d | Шапка — Описание изображения (img) | text | 4 |
| header.text-c57263e1fcf8 | Шапка — Кадры в АПК | text | 4 |
| header.text-0e9fe6fb01eb | Шапка — Федеральный проект | text | 4 |
| header.aria-label-a547786c3b5b | Шапка — Доступное название (О проектеПрограммыКак поступитьFAQКонтакты) | text | 4 |
| header.text-60704e28bc4c | Шапка — Подать заявку | text | 4 |
| header.href-3693edda9956 | Шапка — Ссылка (Подать заявку) | url | 1 |
| header.href-f173dc4ad45f | Шапка — Ссылка (use) | icon | 4 |
| header.aria-label-0cdbccb94555 | Шапка — Доступное название (button) | text | 4 |
| other.aria-label-69953e3ed98c | Общие элементы — Доступное название (О проектеПрограммыКак поступитьЧастые вопросыКонта) | text | 4 |
| other.text-90d1d902dcec | Общие элементы — Знания сегодня — возможности завтра. | text | 4 |
| hero.text-719c46c6b089 | Первый экран — Федеральный проект «Кадры в АПК» | text | 1 |
| hero.title | Первый экран — Постройте будущее в агропромышленном комплексе | text | 1 |
| hero.description | Первый экран — Бесплатное повышение квалификации для специалистов АПК по актуальным направлениям развития | text | 1 |
| hero.text-3744fd7dadff | Первый экран — Оставить заявку | text | 1 |
| hero.href-ef43bc8311bb | Первый экран — Ссылка (Оставить заявку) | url | 1 |
| hero.href-390c49e7b2b3 | Первый экран — Ссылка (use) | icon | 1 |
| hero.text-c6696d79edf4 | Первый экран — Смотреть программы | text | 1 |
| hero.href-1fa954b887d2 | Первый экран — Ссылка (Смотреть программы) | url | 1 |
| hero.href-ec7d32426165 | Первый экран — Ссылка (use) | icon | 1 |
| hero.text-abe08831d0b7 | Первый экран — Федеральный проект | text | 1 |
| hero.text-03ce240ded5b | Первый экран — Поддержка государства | text | 1 |
| hero.href-32c0245eba1c | Первый экран — Ссылка (use) | icon | 1 |
| hero.text-0ff7feb2c901 | Первый экран — Документ об образовании | text | 1 |
| hero.text-920c3b2029cb | Первый экран — Удостоверение о повышении квалификации | text | 1 |
| hero.href-d349fefa9fdd | Первый экран — Ссылка (use) | icon | 1 |
| hero.text-331a9f13a9f5 | Первый экран — Онлайн-обучение | text | 1 |
| hero.text-c100afd035f0 | Первый экран — Учитесь из любой точки России | text | 1 |
| hero.text-a947e180dca8 | Первый экран — Больше возможностей для развития села и людей | text | 1 |
| hero.src-b295ab86c623 | Первый экран — Изображение (img) | image | 1 |
| hero.alt-c7c817d283db | Первый экран — Описание изображения (img) | text | 1 |
| about.text-bed39347c1d8 | О проекте — Почему это важно | text | 1 |
| about.text-de41d1cac700 | О проекте — Ваш рост — вклад в развитие российского АПК | text | 1 |
| about.text-8329fb520ddf | О проекте — Современные знания, практические навыки и поддержка экспертов — для устойчивого развития а | text | 1 |
| programs.text-55a1866a9a18 | Программы — Популярные программы обучения | text | 1 |
| programs.text-1784de4b2c13 | Программы — Выберите программу, которая подходит именно вам | text | 1 |
| programs.text-4e8821fb2b02 | Программы — Все программы | text | 1 |
| programs.href-46b7de367f52 | Программы — Ссылка (Все программы) | url | 1 |
| programs.href-09b0261dd739 | Программы — Ссылка (use) | icon | 1 |
| programs.text-eb4cc5ccdf8a | Программы — Нажмите на карточку, чтобы узнать о программе и выбрать её для заявки. | text | 1 |
| programs.href-09cf81bb61d2 | Программы — Ссылка (use) | icon | 1 |
| steps.text-a755a7192e9c | Как поступить — Как поступить на обучение | text | 1 |
| steps.text-fb048b675332 | Как поступить — Всего несколько шагов до новых знаний и возможностей | text | 1 |
| application.title | Заявка — Оставьте заявку на обучение | text | 1 |
| application.text-05065ba628c2 | Заявка — Заполните форму, и мы свяжемся с вами для подтверждения участия | text | 1 |
| application.href-bcfffefd1a8f | Заявка — Ссылка (use) | icon | 1 |
| application.text-2348f62d1f7d | Заявка — Инвестиции в знания сегодня — это сильное аграрное завтра. | text | 1 |
| application.href-efddb86fe468 | Заявка — Ссылка (use) | icon | 1 |
| application.text-4d0f46d0327a | Заявка — Ваша программа | text | 1 |
| application.text-4b4129a8ba52 | Заявка — Выберите программу обучения | text | 1 |
| application.text-0fcbb819a4f5 | Заявка — Выбрать | text | 1 |
| application.text-48f7b0bae41d | Заявка — Ваш сайт | text | 1 |
| application.text-8fe38ef27894 | Заявка — Фамилия | text | 1 |
| application.text-377f9cea6920 | Заявка — * | text | 1 |
| application.placeholder-81cb0bae192c | Заявка — Подсказка (input) | text | 1 |
| application.text-0c9ade96fe62 | Заявка — Имя | text | 1 |
| application.text-b1579dba6902 | Заявка — * | text | 1 |
| application.placeholder-56fbcb1ddec2 | Заявка — Подсказка (input) | text | 1 |
| application.text-28f491bb2dd6 | Заявка — Отчество | text | 1 |
| application.text-e088c919b70f | Заявка — (если есть) | text | 1 |
| application.placeholder-716ce0dabd43 | Заявка — Подсказка (input) | text | 1 |
| application.text-86df5681617b | Заявка — Дата рождения | text | 1 |
| application.text-0ccf74cdead3 | Заявка — * | text | 1 |
| application.text-94d8ac5d4b40 | Заявка — Телефон | text | 1 |
| application.text-cd8813f63bb8 | Заявка — * | text | 1 |
| application.placeholder-b3fac0042774 | Заявка — Подсказка (input) | text | 1 |
| application.text-d0ab3c6931d2 | Заявка — Электронная почта | text | 1 |
| application.text-36992f684eb0 | Заявка — * | text | 1 |
| application.placeholder-9490f5a49d0f | Заявка — Подсказка (input) | text | 1 |
| application.text-66b6d34ac278 | Заявка — СНИЛС | text | 1 |
| application.text-06a7ee075e95 | Заявка — * | text | 1 |
| application.placeholder-820dc1189c96 | Заявка — Подсказка (input) | text | 1 |
| application.text-7bca7a759284 | Заявка — Уровень образования | text | 1 |
| application.text-7d55e45f091e | Заявка — * | text | 1 |
| application.text-cce69c972f39 | Заявка — Выберите из списка | text | 1 |
| application.text-c6c0298ccf45 | Заявка — Среднее профессиональное / высшее | text | 1 |
| application.text-69ecfd1d82ad | Заявка — Студент 4-го курса и старше | text | 1 |
| application.text-99538e77e704 | Заявка — Копия СНИЛС | text | 1 |
| application.text-a2e42c6d3383 | Заявка — * | text | 1 |
| application.href-386f9c6f5cbe | Заявка — Ссылка (use) | icon | 1 |
| application.text-ab8cd1e5d72a | Заявка — Выберите файл или перетащите | text | 1 |
| application.text-ceb1df4c1a99 | Заявка — PDF, JPG, PNG до 10 МБ | text | 1 |
| application.text-a16ab6e77459 | Заявка — Документ об образовании | text | 1 |
| application.text-250e26429238 | Заявка — * | text | 1 |
| application.href-827a5b69716a | Заявка — Ссылка (use) | icon | 1 |
| application.text-20290e6504e5 | Заявка — Выберите файл или перетащите | text | 1 |
| application.text-cee23e286893 | Заявка — Диплом или справка · до 10 МБ | text | 1 |
| application.text-3a5bb4c20781 | Заявка — Я даю | text | 1 |
| application.text-649b3654e5a0 | Заявка — согласие на обработку персональных данных | text | 1 |
| application.href-800e088d9706 | Заявка — Ссылка (согласие на обработку персональных данных) | url | 1 |
| application.text-9dbfcf6f433f | Заявка — * | text | 1 |
| application.text-7540d6c08999 | Заявка — Порядок обработки данных — в | text | 1 |
| application.text-c5ea76d37fa5 | Заявка — . | text | 1 |
| application.text-0195d9de6a30 | Заявка — политике обработки ПД | text | 1 |
| application.href-908fd496d27d | Заявка — Ссылка (политике обработки ПД) | url | 1 |
| application.href-f0bf1985b857 | Заявка — Ссылка (use) | icon | 1 |
| application.text-4a0407922f22 | Заявка — Для участия требуется профессиональное образование. Если вы учитесь на 4-м курсе или старш | text | 1 |
| application.text-9f01ea92cc01 | Заявка — Отправить заявку | text | 1 |
| application.href-1d64421182c4 | Заявка — Ссылка (use) | icon | 1 |
| application.text-9fba1df17826 | Заявка — Документы доступны только администратору | text | 1 |
| application.href-5e154940e3ba | Заявка — Ссылка (use) | icon | 1 |
| application.href-0b3b152b19dc | Заявка — Ссылка (use) | icon | 1 |
| application.text-68e7ae11c9e1 | Заявка — Первый шаг сделан | text | 1 |
| application.text-2925e5cb56cc | Заявка — Ваша заявка принята | text | 1 |
| application.text-6a88f1509fdb | Заявка — Мы проверим документы и свяжемся с вами по указанным контактам. Спасибо за интерес к обуче | text | 1 |
| application.text-645d2560b0a4 | Заявка — Вернуться к форме | text | 1 |
| application.text-d7edf5f9d9af | Заявка — Знания | text | 1 |
| application.text-c35a3516219a | Заявка — растят | text | 1 |
| application.text-c59e001edea9 | Заявка — возможности | text | 1 |
| application.href-75a52d09a47c | Заявка — Ссылка (use) | icon | 1 |
| faq.text-a24769b60ac3 | Вопросы — Частые вопросы | text | 1 |
| faq.text-1af40a671934 | Вопросы — Ответы на самые важные вопросы об обучении в рамках проекта | text | 1 |
| faq.text-0ede47634de4 | Вопросы — Есть другие вопросы? | text | 1 |
| faq.text-df2934c5254a | Вопросы — Напишите нам — мы поможем! | text | 1 |
| faq.text-54569fac0cfa | Вопросы — Связаться | text | 1 |
| faq.href-0d60c7a84073 | Вопросы — Ссылка (use) | icon | 1 |
| closing.title | Заключительный блок — Подайте заявку на обучение в рамках проекта «Кадры в АПК» | text | 1 |
| closing.text-4c0e117815ec | Заключительный блок — Развивайте свои профессиональные компетенции вместе с нами! | text | 1 |
| closing.text-2f7447cf73a3 | Заключительный блок — Оставить заявку | text | 1 |
| closing.href-9d352b8f899f | Заключительный блок — Ссылка (Оставить заявку) | url | 1 |
| closing.href-1b243ca49136 | Заключительный блок — Ссылка (use) | icon | 1 |
| closing.text-abfbfd6824ae | Заключительный блок — Сильные кадры — | text | 1 |
| closing.text-259e86769fce | Заключительный блок — сильное село — | text | 1 |
| closing.text-ae15171286c6 | Заключительный блок — сильная Россия | text | 1 |
| closing.href-efd86f2c1ed4 | Заключительный блок — Ссылка (use) | icon | 1 |
| footer.href-320ad137610b | Подвал — Ссылка (Кадры в АПКФедеральный проект) | url | 1 |
| footer.src-a6ef7d35336a | Подвал — Изображение (img) | image | 4 |
| footer.alt-965df74faeb5 | Подвал — Описание изображения (img) | text | 4 |
| footer.text-4d520a32c4fb | Подвал — Кадры в АПК | text | 4 |
| footer.text-6e7dad324528 | Подвал — Федеральный проект | text | 4 |
| footer.aria-label-717c4e56c856 | Подвал — Доступное название (О проектеПрограммыКак поступитьFAQ) | text | 4 |
| footer.href-1021ea09af85 | Подвал — Ссылка (use) | icon | 4 |
| footer.href-57e3257ff31b | Подвал — Ссылка (use) | icon | 4 |
| footer.text-924ebe40d3fe | Подвал — ОГРН 1207700044310 | text | 4 |
| footer.text-4ebc2a2184a1 | Подвал — ИНН 7707437711 | text | 4 |
| footer.text-eae6c06034c4 | Подвал — Лицензия на образовательную деятельность № Л035-01298-77/07267658 от 05.10.2026 | text | 4 |
| footer.text-39b836e29e88 | Подвал — Запись в реестре лицензий | text | 4 |
| footer.href-ac4465ec0bb5 | Подвал — Ссылка (use) | icon | 4 |
| footer.text-f171200fbe05 | Подвал — Выписка из реестра (PDF) | text | 4 |
| footer.download-faaa20d4edd4 | Подвал — Имя документа (Выписка из реестра (PDF)) | text | 4 |
| footer.href-30e165d6ce75 | Подвал — Ссылка (use) | icon | 4 |
| footer.text-6ffcc1f67df0 | Подвал — Скачать согласие (PDF) | text | 4 |
| footer.download-285b9c824bd2 | Подвал — Имя документа (Скачать согласие (PDF)) | text | 4 |
| footer.href-b11bc1018afc | Подвал — Ссылка (use) | icon | 4 |
| footer.text-55cfd6163eb6 | Подвал — Скачать политику (PDF) | text | 4 |
| footer.download-49a3be477afb | Подвал — Имя документа (Скачать политику (PDF)) | text | 4 |
| footer.href-887ec3e82c72 | Подвал — Ссылка (use) | icon | 4 |
| footer.text-0654df7571b7 | Подвал — © 2026. Проект «Кадры в АПК». | text | 4 |
| footer.text-a6a6c1ac1a05 | Подвал — Политика обработки ПД | text | 4 |
| footer.href-824810887836 | Подвал — Ссылка (Политика обработки ПД) | url | 4 |
| footer.text-8ed762a626c3 | Подвал — Согласие на обработку ПД | text | 4 |
| footer.href-ac6ede3c0fb9 | Подвал — Ссылка (Согласие на обработку ПД) | url | 4 |
| footer.text-e6215a471c89 | Подвал — Сведения об операторе | text | 4 |
| footer.href-79acea53ee31 | Подвал — Ссылка (Сведения об операторе) | url | 4 |
| footer.text-d14939b29ff3 | Подвал — Cookie | text | 4 |
| other.aria-label-3990491e7531 | Общие элементы — Доступное название (button) | text | 1 |
| other.href-dc06e1d2aa97 | Общие элементы — Ссылка (use) | icon | 1 |
| other.src-9f2d827b4070 | Общие элементы — Изображение (img) | image | 1 |
| other.alt-b02b5a8f7b2b | Общие элементы — Описание изображения (img) | text | 1 |
| other.text-07cc44cc2cb0 | Общие элементы — Онлайн-программа повышения квалификации | text | 1 |
| other.text-1db1c090f064 | Общая подпись длительности для программ на 72 часа | text | 1 |
| other.href-cad9ace07c4f | Общие элементы — Ссылка (use) | icon | 1 |
| other.text-1e052b1d9eb0 | Общий формат для программ со стандартным значением Онлайн | text | 1 |
| other.href-eb86cc469dd4 | Общие элементы — Ссылка (use) | icon | 1 |
| other.text-a3d0eae4c33c | Общая стоимость для программ со стандартным значением Бесплатно | text | 1 |
| other.text-51ccb64f7fe1 | Общие элементы — О чём программа | text | 1 |
| other.text-a94ec463c8ec | Общие элементы — Учебный план и условия участия можно уточнить у координатора. | text | 1 |
| other.text-083dd138ad9a | Общая кнопка выбора (если у программы стандартная подпись) | text | 1 |
| other.href-10d7e1f65431 | Общие элементы — Ссылка (use) | icon | 1 |
| cookie.aria-label-bca79d829b73 | Cookie — Доступное название (button) | text | 4 |
| cookie.href-4982c9956a72 | Cookie — Ссылка (use) | icon | 4 |
| cookie.href-00eb74450b17 | Cookie — Ссылка (use) | icon | 4 |
| cookie.text-339e73f3c95c | Cookie — Технические cookie | text | 4 |
| cookie.text-e7a1476bb527 | Cookie — Технические cookie нужны для формы и защищённого входа. Аналитика и рекламные cookie не по | text | 4 |
| cookie.text-b6bbdcba5390 | Cookie — Понятно | text | 4 |
| cookie.text-9481f17ed51a | Cookie — Подробнее о cookie | text | 4 |
| cookie.href-fd7b7b958284 | Cookie — Ссылка (Подробнее о cookie) | url | 4 |
| other.text-be740a4459d8 | Общие элементы — Для выбора программы и отправки заявки включите JavaScript. Связаться с координатором: | text | 1 |
| other.text-ab5245da4241 | Общие элементы — . | text | 1 |
| seo.preload-b80bd8a6c977 | SEO — предварительно загружаемое изображение | image | 1 |
| header.href-af9e2714beca | Шапка — Ссылка (Кадры в АПКФедеральный проект) | url | 3 |
| header.href-55fed59513e6 | Шапка — Ссылка (Подать заявку) | url | 3 |
| legal.aria-label-28d181c27834 | Документы — Доступное название (Главная/Документы) | text | 3 |
| legal.text-b41625c64981 | Документы — Главная | text | 3 |
| legal.href-6432eff78869 | Документы — Ссылка (Главная) | url | 3 |
| legal.text-8bd600e4f0da | Документы — / | text | 3 |
| legal.text-f25646902478 | Документы — Документы | text | 3 |
| footer.href-5b3931be5622 | Подвал — Ссылка (Кадры в АПКФедеральный проект) | url | 3 |
| legal.icon-be26a5e24d6d | Документы — значок download | icon | 2 |
| legal.icon-519bb6c7290a | Документы — значок document | icon | 2 |
| legal.icon-2e3d54abccf4 | Документы — значок download | icon | 2 |
| legal.download-2d647095c2e5 | Документы — имя скачиваемого файла Согласие на обработку персональных данных.pdf | text | 2 |
| legal.download-bf90b5795d90 | Документы — имя скачиваемого файла Согласие на обработку персональных данных.docx | text | 2 |
| legal.download-4c7acc197ddf | Документы — имя скачиваемого файла Политика обработки персональных данных.pdf | text | 2 |
| legal.icon-759b1aa56b51 | Документы — значок download | icon | 1 |
| legal.icon-bf9dbe01f8be | Документы — значок document | icon | 1 |
| legal.icon-8be2f71b6c41 | Документы — значок download | icon | 1 |
| legal.download-03fea80bba9f | Документы — имя скачиваемого файла Выписка из реестра лицензий.pdf | text | 1 |
| legal.download-c0fa518529e1 | Документы — имя скачиваемого файла Согласие на обработку персональных данных.pdf | text | 1 |
| legal.download-c9de61eeabd4 | Документы — имя скачиваемого файла Согласие на обработку персональных данных.docx | text | 1 |
| legal.download-9b2d45321574 | Документы — имя скачиваемого файла Политика обработки персональных данных.pdf | text | 1 |
| programs.chrome-d48e8fc452db | Программы — Выбрана | text | 1 |
| programs.chrome-f8f7aecd9c69 | Программы — О программе | text | 1 |
| programs.chrome-980a6876aab5 | Программы — Подробнее | text | 1 |
| faq.toggle-icon | Вопросы — значок раскрытия | icon | 1 |
| programs.icon-7c7ee9ae3c96 | Общие значки — выбранная программа | icon | 1 |
| programs.icon-f79e8a5360f6 | Общие значки — описание программы | icon | 1 |
| programs.icon-798924fc7374 | Общие значки — подробнее | icon | 1 |
| programs.icon-5a00bf43f39e | Общие значки — кнопка мобильного меню | icon | 4 |
| background.d235017774a2 | Оформление — фон .hero | background | 1 |
| background.bf33f27f8cfe | Оформление — фон .leaf-decoration | background | 1 |
| background.ffebf653ba88 | Оформление — фон .leaf-decoration | background | 1 |
| background.fe53c5919139 | Оформление — фон .hero | background | 1 |
| background.47e808e78e40 | Оформление — фон .application__landscape | background | 1 |
| background.4fcbaba07f78 | Оформление — фон .application__landscape | background | 1 |
| background.89ba2a78fd3c | Оформление — фон .application__landscape | background | 1 |
| background.12815e091371 | Оформление — фон .hero | background | 1 |
| background.0f67561cff15 | Оформление — фон .application__landscape | background | 1 |
| background.c308a047ad4c | Оформление — фон .application__landscape | background | 1 |
| background.3cf8d281aec8 | Оформление — фон .field select | background | 1 |
| background.54dabd78f724 | Оформление — фон .faq-contact | background | 1 |
| background.71b7e5a687a6 | Оформление — фон .closing | background | 1 |
| background.75bd60af883d | Оформление — фон .hero | background | 1 |
| background.e471fce6e794 | Оформление — фон .application__landscape | background | 1 |
| background.bb9bd0cc6612 | Оформление — фон .faq-contact | background | 1 |
| settings.contacts.email | Общее значение — settings.contacts.email | alias | 25 |
| settings.contacts.phoneLabel | Общее значение — settings.contacts.phoneLabel | alias | 8 |
| settings.contacts.phone | Общее значение — settings.contacts.phone | alias | 8 |
| settings.organization.shortName | Общее значение — settings.organization.shortName | alias | 10 |
| settings.organization.name | Общее значение — settings.organization.name | alias | 10 |
| settings.organization.ogrn | Общее значение — settings.organization.ogrn | alias | 8 |
| settings.organization.inn | Общее значение — settings.organization.inn | alias | 8 |
| settings.organization.address | Общее значение — settings.organization.address | alias | 8 |
| settings.organization.license | Общее значение — settings.organization.license | alias | 8 |
| settings.organization.licenseDate | Общее значение — settings.organization.licenseDate | alias | 8 |
| settings.organization.registryUrl | Общее значение — settings.organization.registryUrl | alias | 6 |
| documents.license | Общее значение — documents.license | alias | 6 |
| documents.consentPdf | Общее значение — documents.consentPdf | alias | 10 |
| documents.policyPdf | Общее значение — documents.policyPdf | alias | 10 |
| documents.consentWord | Общее значение — documents.consentWord | alias | 6 |
| settings.organization.licensingAuthority | Общее значение — settings.organization.licensingAuthority | alias | 2 |

## Общие источники и отображение

Записи реестра с `source` являются alias, не ключами `fields`. Значение берётся из пути source. `defaultValue` — канонический оригинал. Для alias с `sourceText` меняется только известный литерал; при неизменном defaultValue сохраняется исходная форма/грамматика текста. `markdown-alias` применяется до преобразования pages[pageId].body. Одинаковые markdown-alias цели дедуплицировать; длинные sourceText (mailto/tel/полное наименование) заменять раньше коротких. Метаданные source/selector/defaultValue/sourceText никогда не принимаются из запроса.

`transform: footer-name` сохраняет одни внешние «…» в футере: убрать внутренние „…“ из канонического name. Исходный footer sourceText не содержит вложенных кавычек; весь текст юридических страниц сохраняется в исходной редакции.

Поля с target.variables содержат обязательные `{{settings.organization.*}}` подстановки вокруг редактируемых подписей («ОГРН», «Лицензия … от»). Подстановки разрешены только из перечня variables этой цели. Рендерер вставляет plain text общего значения, не HTML. settings.organization.email/phone синхронизируются валидатором с settings.contacts.

Доверенная выборка публичных медиа: `referencedMedia(content,{publicOnly:true})` исключает draft/archived программы/страницы и hiddenSections. Полная выборка/история защищает файлы от удаления. Публичный bootstrap должен дополнительно фильтровать сами коллекции; полное хранилище содержит приватные будущие записи.

Сохраняемый черновик может иметь незаполненные новые записи; `validateContent(content,{forPublication:true})` проверяет готовность видимого контента. Небезопасные URL, HTML, типы, размеры и структуры отклоняются при любом сохранении.

## Полный контракт дополнительных секций и Open Graph

extraSections.type: text, image, cta, faq, cards, gallery. Общие поля: id,type,title,body,image,alt,imageFocus,buttonLabel,buttonUrl,items. items — типизированная коллекция: FAQ {id,title,body}, карточки {id,title,body,icon,image,alt,imageFocus,buttonLabel,buttonUrl}, галерея {id,image,alt,imageFocus,caption}. У text/image/cta items всегда пуст. Карточки допускают отсутствие фотографии/значка; при публикации нужен заголовок и обе части заданной кнопки. Галерея при публикации требует изображение, непустой alt и числовой focus. У видимых коллекций требуется хотя бы один элемент. Лимиты: cards 50, gallery/faq 100.

SEO главной страницы: title,description,robots,ogTitle,ogDescription,ogType,ogImage,themeColor,icon. SEO каждой страницы: title,description,robots,ogTitle,ogDescription,ogType,ogImage. ogType=website; ogImage — проверенный локальный URL изображения или пустая строка (метаданные изображения изначально отсутствуют). Исходные OG title/description сохраняются; у страниц без OG используются их исходные title/description. Медиа OG исключается из публичного набора для draft/archived страниц.

Каждая доверенная target содержит section:string|null. Владение определяется при сборке по реальному DOM: .field select относится к application, .leaf-decoration к programs, модальный .course-dialog также к programs. Для целей, общих нескольким секциям, sections содержит полный перечень (null означает общий элемент). Runtime не выводит владение из строк селекторов. Полный набор защищает все файлы, публичный набор проверяет эти явные сведения.

Локальные URL содержат только канонический путь: percent-encoded aliases в path отклоняются для полей, навигации, Markdown и SEO. Кодирование параметров внешних URL не превращается в локальные медиа.

Форматирование Markdown: абзацы, маркированные/нумерованные списки, emphasis/strong, inline links и ATX headings (# .. ###### + пробел). Исполняемый HTML, изображения Markdown, блоки кода, цитаты, таблицы и reference-links запрещены. Рендерер строит элементы безопасно; в rich body исходный h1 показывается как h2, остальные уровни сохраняются для одного h1 документа.
