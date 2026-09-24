# Alerta RD · SOS con Supabase y WhatsApp Business

Web responsive en español con dos espacios independientes: **Demostración** (simulaciones locales, ningún mensaje externo) y **Cuenta / SOS real** (Supabase Auth, contactos privados y procesamiento de SOS en el servidor).

## Estado de esta entrega — 24 de septiembre de 2026

- Conectada al proyecto Supabase **AlertaRD**, referencia `usxbxrxgrxfjuwvdvecs`.
- Tres migraciones aplicadas: tablas, RLS, funciones de servidor y programador.
- Desplegadas `sos-api`, `sos-dispatch` y `whatsapp-webhook`.
- Programador activo cada 5 segundos, con comprobación de actividad del procesador verificada.
- **WhatsApp todavía desactivado.** No se suministraron credenciales, número ni plantillas de Meta. Ningún mensaje real fue enviado durante el desarrollo.
- El envío real completo **no está verificado**. Queda pendiente una prueba expresamente autorizada con los números acordados.
- Las tablas existentes del otro módulo de la base (`profiles`, `users`, foro, etc.) se conservaron. Este módulo usa **Supabase Auth** (`auth.users`), no las contraseñas ni sesiones de esas tablas anteriores. Es necesario crear una cuenta desde la nueva interfaz.

Repositorio: https://github.com/HanselElmaduro/Alerta-RD-simulacion-de-app

Web de producción: https://alerta-rd-simulacion-de-app.vercel.app

Publicación anterior: https://alerta-rd-demo-interactiva.hanselh151.chatgpt.site

## Publicar en Vercel y corregir la confirmación por correo

1. En Vercel, importa `HanselElmaduro/Alerta-RD-simulacion-de-app`, rama `main`, raíz del repositorio. `vercel.json` configura **Other**, `npm ci`, `npm run build` y salida `dist`. Usa Node 24.x. La clave publishable incluida es pública; no agregues secretos de Meta a Vercel.
2. Copia el dominio de producción que Vercel asigne. En Supabase → **Authentication → URL Configuration**, establece **Site URL** a `https://alerta-rd-simulacion-de-app.vercel.app` y agrega **Redirect URLs** `https://alerta-rd-simulacion-de-app.vercel.app/auth-callback.html`. Conserva los destinos de otras aplicaciones que utilicen este proyecto. Para desarrollo puedes permitir `http://localhost:3000/auth-callback.html`.
3. En Supabase → **Edge Functions → Secrets**, agrega ese origen exacto (sin ruta ni barra final) a `ALLOWED_ORIGINS`, conservando los orígenes que sigas usando. Esta lista permite llamar al endpoint SOS; es distinta de la lista de redirecciones de Auth. Si no defines `ALLOWED_ORIGINS`, el código permite por defecto el dominio de producción anterior, el sitio previo de demostración y localhost. Una lista explícita reemplaza esos valores; debe incluir el dominio que realmente uses.
4. Usa la plantilla de confirmación estándar de Supabase con `{{ .ConfirmationURL }}`. El registro y el reenvío pasan explícitamente la página `auth-callback.html` como destino. Un enlace antiguo puede seguir apuntando a localhost: solicita uno nuevo **solo si el correo sigue pendiente**.
5. En la web publicada, selecciona **Cuenta / SOS real** → inicia sesión → **Más → Contactos → Agregar contacto**. Completa nombre, teléfono internacional (`+` y código de país) y parentesco; registra el consentimiento de la persona y guarda.

Si la confirmación abrió localhost y dio error, el correo puede haber quedado confirmado igualmente. Primero intenta iniciar sesión con la misma cuenta. No necesitas crear otra cuenta ni desactivar la verificación. Si no está confirmado, escribe tu correo en la pantalla de acceso y pulsa **Reenviar confirmación**. Este botón no exige contraseña y está sujeto a los límites de Supabase.

La página de retorno consume la sesión, limpia los tokens de la URL y abre Contactos en el modo de cuenta. Los enlaces vencidos muestran cómo recuperar el acceso. Publicar el frontend no habilita WhatsApp: los envíos siguen desactivados hasta configurar Meta y autorizar una prueba.

## Arranque local

Requiere Node 22.22.2+, 24.15+ o 26 para ejecutar también las pruebas de interfaz.

```bash
npm ci
npm run build
npm start
```

Abrir `http://localhost:3000`. Los archivos compilados también están incluidos en `dist/`, de modo que `npm start` sirve la entrega sin reconstruirla.

La URL y clave **pública publishable** ya están en `dist/config.js`; RLS protege los datos. Para otro proyecto:

```bash
cp .env.example .env.local
# Completar solo PUBLIC_SUPABASE_URL y PUBLIC_SUPABASE_PUBLISHABLE_KEY.
node --env-file=.env.local scripts/build.mjs
```

`build.mjs` solo exporta esas dos variables, exige clave `sb_publishable_` y nunca copia las variables de Meta al navegador. `.env.example` y `supabase/functions/.env.example` contienen únicamente nombres, sin valores secretos. Los archivos `.env.*` reales están excluidos de Git.

## Recorrido de uso

1. Elegir **Cuenta / SOS real**, crear una cuenta y confirmar el correo. Iniciar sesión.
2. En Perfil, guardar el nombre que aparecerá en las alertas.
3. En Contactos, agregar un número internacional E.164 (por ejemplo, formato `+1809…`), nombre y relación. Registrar que esa persona aceptó recibir las alertas por WhatsApp. Sin consentimiento, se guarda pero no se envía a ese contacto.
4. Cuando el administrador habilite Meta, la pantalla SOS mostrará disponibilidad. Pulsar SOS inicia inmediatamente una cuenta regresiva de **10 segundos en el servidor**.
5. Cancelar antes del vencimiento requiere confirmación del servidor. Si no se cancela, el procesador envía automáticamente un mensaje individual a cada contacto seleccionado por el servidor. No abre WhatsApp ni requiere otro botón de envío.
6. La ubicación es opcional: se solicita al pulsar SOS, con 6 segundos de espera. Si no está disponible antes del vencimiento, el mensaje igualmente se envía indicando **Ubicación no disponible**.
7. Revisar Central / Historial para el resultado de cada contacto. El botón Actualizar permite consultar nuevos estados de entrega.

Cerrar la pestaña **no cancela** un SOS ya registrado. El servidor continúa. Si la primera petición no llegó a Supabase, no existe un SOS en el servidor: la interfaz muestra una solicitud por confirmar y reutiliza su identificador al recuperarla. Nunca debe interpretarse un error de red como cancelación confirmada.

Se impide pasar a demostración o cerrar sesión mientras el cliente conoce un SOS pendiente. La selección del espacio se conserva al recargar. Drive, Red de Ayuda, Ruta, PINs y Tutor siguen en demostración y nunca activan WhatsApp. Los PINs demo no cancelan un SOS real. Los contactos y el perfil de cada modo son independientes.

## Configuración de Supabase

En el proyecto actual, tablas, programador y Edge Functions **ya están instalados**. No vuelvas a aplicar las mismas migraciones manualmente.

En **Authentication → Sign In / Providers**, habilita Email con confirmación de correo. Configura **Authentication → URL Configuration** con la URL de la web como Site URL y los destinos de redirección permitidos; añade localhost para desarrollo. Configura SMTP propio si vas a usar registros y confirmaciones más allá de los límites del correo de desarrollo de Supabase. La web no realiza esa configuración por ti.

Para instalar en un proyecto Supabase nuevo y vacío:

```bash
npx supabase login
npx supabase link --project-ref TU_PROJECT_REF
npx supabase db push --dry-run
npx supabase db push
npx supabase functions deploy sos-api sos-dispatch whatsapp-webhook --project-ref TU_PROJECT_REF --use-api
```

El `config.toml` desactiva la validación JWT del gateway **porque cada endpoint implementa la autenticación correspondiente**: `sos-api` valida el token de Auth con `getUser`, `sos-dispatch` valida un token interno aleatorio, y el webhook verifica la firma de Meta. No elimines esas comprobaciones.

Después, ejecuta una vez en SQL Editor, sustituyendo la URL:

```sql
select vault.create_secret(
  'https://TU_PROJECT_REF.supabase.co',
  'alerta_project_url',
  'Alerta RD API URL'
) where not exists (
  select 1 from vault.secrets where name = 'alerta_project_url'
);
```

El secreto del procesador se genera dentro de Postgres y permanece en Vault; el servidor compara su hash. No aparece en archivos ni se envía al navegador. Cron usa `pg_cron` y `pg_net`. Para una instalación local de Supabase se debe ajustar la URL de Vault a la dirección interna alcanzable desde Postgres; las instrucciones anteriores son para Supabase alojado.

Comprobaciones administrativas sin mostrar secretos:

```sql
select public.alerta_worker_health() as procesador_disponible;
select jobname, schedule, active from cron.job where jobname='alerta-sos-dispatch';
select status, count(*) from public.alerta_sos_events group by status;
```

La salud debe ser `true` después de que Cron invoque la función desplegada. El procesador comprueba actividad aproximadamente cada minuto cuando no hay SOS. Una función desplegada o un programador activo, por sí solos, no demuestran que WhatsApp esté configurado.

## Pasos concretos en Meta

1. En [Meta for Developers](https://developers.facebook.com/), crea o selecciona la aplicación asociada a tu portafolio empresarial y habilita el producto/caso de uso de WhatsApp. Selecciona la cuenta de WhatsApp Business (WABA).
2. En la configuración de la API, registra y verifica el número emisor siguiendo el flujo de Meta. Para empezar, puedes usar el número de prueba de Meta y añadir/verificar los destinatarios de prueba permitidos. Para producción, completa los requisitos de número, nombre para mostrar, verificación empresarial, facturación y acceso que indique tu cuenta. No uses una integración no oficial ni automatices WhatsApp Web.
3. Anota **Phone Number ID** y **WhatsApp Business Account ID**. El Phone Number ID es un identificador de Meta, no el número telefónico visible.
4. Crea un usuario de sistema en la configuración del negocio, asígnale los activos de la aplicación y WABA, y genera un token con `whatsapp_business_messaging`. Para administrar plantillas/activos, configura también `whatsapp_business_management` donde corresponda. Elige el período de validez adecuado y planifica su rotación. El token temporal del panel de inicio no es una credencial operativa permanente.
5. En WhatsApp Manager, crea **dos plantillas** con parámetros numéricos, idioma español y solo componente BODY. Deben estar aprobadas por Meta y pertenecer a la WABA del número emisor. La clasificación y aprobación las decide Meta; no están garantizadas. El código espera tres parámetros de texto, en este orden: nombre, fecha/hora, ubicación.
6. Copia los nombres exactos de las plantillas, el código de idioma exacto y una versión Graph API soportada por tu aplicación a los secretos de Supabase. No presupongas que un nombre o código de idioma de ejemplo está aprobado.
7. Configura el webhook y suscríbete al campo `messages` de la WABA para recibir los estados.

Texto propuesto para la plantilla de operación, por ejemplo nombre `alerta_rd_sos`:

```text
ALERTA SOS de {{1}}. Activada el {{2}}.
Ubicación: {{3}}.
Esta persona solicita que la contactes. Si existe una emergencia, llama al 9-1-1.
```

Texto propuesto para la plantilla de prueba, por ejemplo nombre `alerta_rd_sos_prueba`:

```text
PRUEBA AUTORIZADA — NO ES UNA EMERGENCIA.
{{1}} está probando Alerta RD. Fecha y hora: {{2}}.
Ubicación de la prueba: {{3}}.
No acudas ni llames a emergencias por esta prueba.
```

Usa datos ficticios al aportar muestras para la aprobación. La fecha se genera en el servidor a partir de la creación del evento, en `America/Santo_Domingo`. La ubicación será una URL de Google Maps o el texto «Ubicación no disponible»; no se inventan coordenadas.

## Secretos del servidor

Configúralos en **Supabase → Edge Functions → Secrets**. También puedes usar un archivo local excluido de Git:

```bash
cp supabase/functions/.env.example .env.secrets
# Editar localmente, sin pegar los secretos en el chat ni en el frontend.
npx supabase secrets set --env-file .env.secrets --project-ref usxbxrxgrxfjuwvdvecs
```

| Nombre | Valor que debes configurar |
| --- | --- |
| `SOS_ENABLED` | `false` mientras se prepara; `true` únicamente cuando se autorice la prueba/envío |
| `SOS_TEST_ONLY` | `true` para pruebas limitadas; `false` solo después de validar y habilitar operación |
| `SOS_ALLOWED_PHONES` | Destinatarios autorizados, E.164 con `+`, separados por comas; obligatorio en prueba |
| `SOS_AUTHORIZED_USER_IDS` | UUID de las cuentas autorizadas, de Authentication → Users, separados por comas; obligatorio en prueba |
| `ALLOWED_ORIGINS` | Orígenes exactos separados por comas, sin barra final; incluye la web y localhost si corresponde |
| `WHATSAPP_ACCESS_TOKEN` | Token de usuario de sistema de Meta; únicamente en el servidor |
| `WHATSAPP_PHONE_NUMBER_ID` | Identificador numérico del número emisor |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | WABA ID usado para filtrar webhooks |
| `WHATSAPP_API_VERSION` | Versión Graph API soportada elegida en Meta, formato `vN.N` |
| `WHATSAPP_TEMPLATE_NAME` | Nombre exacto de la plantilla operativa aprobada |
| `WHATSAPP_TEST_TEMPLATE_NAME` | Nombre exacto de la plantilla de prueba aprobada, claramente «NO ES UNA EMERGENCIA» |
| `WHATSAPP_TEMPLATE_LANGUAGE` | Código exacto del idioma aprobado, por ejemplo `es` si así fue creada |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Cadena aleatoria elegida para verificar el callback con Meta |
| `META_APP_SECRET` | App Secret de Meta, usado para verificar la firma HMAC |

Los secretos `SUPABASE_URL` y las credenciales de servidor están disponibles en el entorno alojado de Edge Functions. Se admite `SUPABASE_SECRET_KEYS.default` o el `SUPABASE_SERVICE_ROLE_KEY` de compatibilidad. Nunca se configuran como variables públicas.

**Callback ya desplegado:**

```text
https://usxbxrxgrxfjuwvdvecs.supabase.co/functions/v1/whatsapp-webhook
```

En Meta, coloca ese callback y el mismo `WHATSAPP_WEBHOOK_VERIFY_TOKEN`. Suscribe `messages` y la aplicación a tu WABA. `GET` responde al challenge únicamente con el token correcto. `POST` exige `X-Hub-Signature-256`, verifica el cuerpo sin modificar con `META_APP_SECRET`, comprueba WABA, número emisor y destinatario, y guarda cambios idempotentes. Devuelve 503 si no puede guardar un estado para permitir el reintento del webhook.

## Estados y garantías del flujo

| Estado | Significado |
| --- | --- |
| Pendiente | Registrado en Supabase; aún puede cancelarse dentro de los 10 s |
| Cancelado | El servidor confirmó la cancelación a tiempo; ese evento no se despacha |
| En cola / Solicitando envío | Espera de procesamiento / POST iniciado |
| Aceptado por WhatsApp | La API devolvió un ID; **entrega sin confirmar** |
| Enviado / Entregado / Leído | Solo un webhook firmado de Meta confirmó ese estado |
| Error | Rechazo conocido, configuración desactivada o consentimiento retirado |
| Resultado incierto | Fallo de red, timeout, respuesta ambigua o worker interrumpido; no hay reintento automático |
| Vencido | La cola estuvo parada más de dos minutos; se evita enviar una alerta antigua inesperada |

El evento «Procesamiento finalizado» describe al procesador, no la entrega. Siempre se revisan sus resultados individuales. Los estados del webhook no retroceden de entregado/leído a enviado por recibir eventos fuera de orden. Una ausencia de «Leído» no demuestra que la persona no haya leído el mensaje.

- **Antiduplicados:** UUID de solicitud persistido antes de llamar al servidor, restricción única por usuario, bloqueo transaccional y reclamación `FOR UPDATE SKIP LOCKED`. Cada destinatario pasa de `queued` a `sending` una sola vez antes del POST.
- **Sin reintentos ciegos:** Meta puede aceptar una petición cuya respuesta se perdió. Se conserva `unknown`; no se promete «exactamente una entrega» ni se vuelve a enviar automáticamente. Revisar el proveedor antes de iniciar otro SOS.
- **Límites:** un SOS pendiente por usuario, 3 solicitudes cada 15 minutos y 10 al día, incluidas cancelaciones; máximo 5 contactos y sin números duplicados en una cuenta. Las cuentas anónimas y correos no confirmados no crean SOS. En pruebas también se exige lista de usuarios y teléfonos permitidos.
- **Consentimiento:** los destinatarios se consultan en la base, se copian al evento y se comprueba antes de enviar que el contacto continúa existiendo con el mismo número y consentimiento. Un envío ya iniciado no se puede retirar.
- **Privacidad:** perfiles/contactos con CRUD permitido según propietario; historial solo lectura del propietario. No hay inserciones ni mutaciones de eventos desde el cliente. Los RPC de procesamiento son `SECURITY INVOKER`, únicamente ejecutables por `service_role`. El navegador no suministra números ni ID de usuario al endpoint SOS.
- **Tiempo:** los 10 s los impone Postgres. Cron revisa cada 5 s, por lo que el POST comienza normalmente entre 10 y 15 s después de registrar el SOS, sujeto a red/carga/disponibilidad. El navegador no detecta accidentes ni garantiza atención o entrega de emergencia. Este canal no sustituye al 9-1-1.

## Pruebas seguras

### Automáticas — sin Meta y sin destinatarios reales

```bash
npm test
npm ci --prefix qa
npm run test:ui
npm run test:ui:real
node scripts/check-secrets.mjs
```

`npm test` usa un transporte falso para los casos de proveedor; las pruebas DOM usan un cliente Supabase simulado. No realizan POST a Meta. Cubren la demo, autenticación, CRUD, doble clic, cancelación, falta de ubicación, 200/400/500/timeout, autorización de pruebas y firma del webhook.

`tests/supabase-security.sql` puede ejecutarse completo como administrador en SQL Editor: crea usuarios ficticios dentro de una transacción, comprueba RLS y los RPC, y termina con `ROLLBACK`. No confirma filas ni hace llamadas HTTP. Ya se ejecutó correctamente en el proyecto conectado.

### Prueba real pendiente — avisar y acordar antes

1. Acordar expresamente con el propietario y destinatarios **qué números recibirán la prueba y cuándo**. No habilitar envíos como parte de una prueba automática.
2. Crear/confirmar una cuenta de prueba. Guardar perfil ficticio y solo contactos autorizados. Verificar también los destinatarios en Meta si se usa el número de prueba.
3. Configurar plantilla de prueba aprobada, credenciales, webhook, `SOS_TEST_ONLY=true`, listas de números y usuarios. Mantener `SOS_ENABLED=false` hasta terminar la preparación.
4. Avisar que el siguiente escenario enviará un mensaje real de prueba. Habilitar `SOS_ENABLED=true` y actualizar el estado en la web.
5. **Cancelar:** pulsar SOS y cancelar antes de 10 s. Confirmar estado `canceled`, entregas `canceled` y ausencia de mensaje en los destinatarios.
6. **Vencer:** pulsar una vez y esperar. Intentar doble clic; debe existir un solo evento para esa solicitud. Confirmar `accepted` con ID de Meta y, si el webhook está conectado, `sent`/`delivered`. Comprobar recepción con el destinatario: no inferirla solo del 200.
7. **Sin ubicación:** denegar el permiso; repetir otro SOS autorizado. El mensaje debe llegar con «Ubicación no disponible».
8. **Error:** usar una configuración de plantilla inexistente exclusivamente en un entorno de prueba aislado para obtener rechazo de Meta; restaurarla después. Para el entorno operativo, mantener esta comprobación en el transporte falso de las pruebas automáticas.
9. Respetar los límites (máximo 3 por 15 minutos); esperar entre bloques. Registrar fecha, ID de evento, resultado de cada número y confirmación humana. Al terminar, volver a `SOS_ENABLED=false` hasta decidir habilitar operación.

No se ha realizado ninguno de los envíos reales de esta sección. La operación general requerirá quitar el límite de prueba con `SOS_TEST_ONLY=false`, configurar la plantilla operativa y autorizar esa puesta en marcha.

## Estructura

| Ruta | Contenido |
| --- | --- |
| `dist/app.js`, `model.js`, `styles.css`, `icons.js` | Interfaz y simulaciones originales |
| `dist/real-ui.js`, `cloud.js`, `config.js` | Espacio autenticado e integración pública con Supabase |
| `dist/vendor/supabase.js` | SDK empaquetado localmente, sin CDN |
| `scripts/build.mjs` | Compila el SDK y exporta solo configuración pública |
| `supabase/migrations/` | SQL ordenado, alineado con versiones aplicadas en Supabase |
| `supabase/functions/_shared/` | Procesamiento, transporte y autenticación reutilizables |
| `supabase/functions/sos-api/` | Crear, cancelar, adjuntar ubicación y consultar disponibilidad |
| `supabase/functions/sos-dispatch/` | Procesador interno programado |
| `supabase/functions/whatsapp-webhook/` | Challenge y confirmaciones firmadas de Meta |
| `tests/`, `qa/` | Pruebas de lógica, servidor, permisos e interfaz |
| `REVISION.md` | Evidencia de revisión y límites de verificación |
| `DEMOSTRACION.md`, `REVISION-DEMO.md` | Documentación de la versión original de demostración |

Dependencias fijadas y archivos lock incluidos. El frontend estático se publica desde `dist/`; las funciones reales dependen de Supabase, Cron y Meta. No deben alojarse las credenciales del servidor en el servidor estático ni publicarse `.env.secrets`.

## Referencias oficiales

- [Supabase: autenticación de Edge Functions](https://supabase.com/docs/guides/functions/auth)
- [Supabase: RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase: programar funciones](https://supabase.com/docs/guides/functions/schedule-functions)
- [Supabase: secretos de Edge Functions](https://supabase.com/docs/guides/functions/secrets)
- [Meta: inicio de WhatsApp Business](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started)
- [Meta: colección oficial Cloud API](https://www.postman.com/meta/whatsapp-business-platform/collection/wlk6lh4/whatsapp-cloud-api)
- [Meta: ejemplos oficiales](https://github.com/fbsamples/whatsapp-api-examples)


### Si iniciaste sesión pero aparece un error del servidor SOS

El correo y el botón Cerrar sesión indican que el acceso a la cuenta se completó. Un error de la comprobación SOS no significa que tu contraseña esté mal. La versión corregida mantiene Contactos y Perfil utilizables si falla esa comprobación. El botón Actualizar estado vuelve a consultar el servicio, sin crear una alerta.

La causa corregida en este despliegue fue un preflight CORS `403 Origen no autorizado`: faltaba `https://alerta-rd-simulacion-de-app.vercel.app` en los orígenes del endpoint. Se añadió únicamente ese dominio exacto; no se abrió acceso a cualquier sitio de Vercel. La API sigue exigiendo un usuario autenticado con correo confirmado.
