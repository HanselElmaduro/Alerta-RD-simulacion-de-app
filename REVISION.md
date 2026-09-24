# Revisión de la integración SOS — 24/09/2026

## Implementado y desplegado

Supabase AlertaRD (`usxbxrxgrxfjuwvdvecs`): tres migraciones aplicadas, cuatro tablas de usuario con RLS, tablas privadas del procesador, tres Edge Functions activas y Cron cada cinco segundos. Se comprobó actividad reciente del worker mediante su heartbeat. Se preservaron las tablas que ya existían.

El modo demostración conserva sus pantallas y almacenamiento local. El nuevo espacio de cuenta separa contactos/perfil/historial de los datos demo. El botón de SOS real permanece deshabilitado mientras faltan Meta, perfil, contactos consentidos o disponibilidad del procesador.

## Comprobaciones realizadas

- **23 pruebas Node aprobadas:** 13 de los flujos demo y 10 del backend SOS. Incluyen identidad validada, rechazo de user_id/teléfonos inyectados, deduplicación, límites de prueba, cancelación, ubicación ausente, respuesta de proveedor aceptada sin confundir entrega, rechazo, timeout y firma de webhook.
- **16 recorridos DOM de la demo aprobados:** navegación, formularios, temporizadores, Drive, Ruta, ayuda, contactos, PINs, Tutor y perfil.
- **Recorrido DOM autenticado aprobado:** acceso, perfil, alta/edición/borrado confirmado de contactos, consentimiento, modo desactivado, doble clic, denegación de ubicación, cancelación, estado aceptado y cierre de sesión. Cliente/API simulados, sin mensajes reales.
- **Prueba SQL transaccional en Supabase aprobada:** dos usuarios ficticios; aislamiento de perfiles/contactos/historial, prohibición de transferir propiedad, RPC inaccesibles al cliente, plazo de 10 s, cancelación, reclamación única, límite de solicitudes y orden/deduplicación de webhooks. Terminó con ROLLBACK; no quedaron datos de prueba.
- **Endpoints desplegados:** SOS sin JWT devuelve 401; procesador sin token interno devuelve 401; webhook sin configuración de Meta devuelve 503. Ninguna de esas peticiones puede enviar mensajes.
- **Programador:** heartbeat vigente observado desde la base. No se probó un envío a Meta.
- **Inspección de frontend:** solo clave pública publishable; ninguna credencial Meta ni clave de servidor incluida.

## Límites de esta revisión

No hubo prueba visual en un navegador real disponible en esta sesión. Las comprobaciones de interfaz son DOM simulado. No se verificó registro/confirmación de correo real, ni recepción en WhatsApp, ni firma procedente de Meta en vivo. La configuración de autenticación y Meta y una prueba real autorizada siguen pendientes.

No se enviaron alertas, mensajes de prueba ni notificaciones a terceros. No se afirma que WhatsApp esté operativo. La aceptación de una petición y la entrega son estados separados; los estados entregado/leído requieren webhooks firmados.

## Asesores de Supabase

La revisión no señaló falta de RLS en las tablas nuevas. Las tablas privadas tienen políticas explícitas para `service_role` y no tienen acceso de cliente.

El asesor también señaló avisos **preexistentes** en tablas del módulo anterior sin políticas y en `public.rls_auto_enable()`, una función SECURITY DEFINER ejecutable por roles de cliente. Esa función no pertenece a la integración y no fue modificada. Su propietario debe revisar su propósito antes de alterar permisos. Referencias: [función accesible sin sesión](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) y [función accesible con sesión](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Pendientes para autorizar la prueba real

Número emisor y WABA de Meta, token de usuario de sistema, dos plantillas aprobadas, versión e idioma, App Secret, verificación/suscripción del webhook, cuenta Auth confirmada y lista exacta de cuentas y destinatarios autorizados. Configurar como secretos del servidor y seguir el protocolo del README. El interruptor de envío queda desactivado por defecto.


## Publicación GitHub/Vercel y confirmación de correo — 24/09/2026

- Registro y reenvío con retorno explícito a `/auth-callback.html`.
- Retorno válido abre Contactos en modo cuenta; enlaces vencidos, ausencia de sesión y fallos de conexión ofrecen recuperación sin exponer tokens.
- Configuración de Vercel incluida (`dist`, `npm run build`).
- Build correcto; 27 pruebas de lógica/servidor/confirmación aprobadas, 16 recorridos DOM demo y recorrido DOM de cuenta/contactos/SOS con API simulada aprobados.
- No se enviaron correos de prueba ni alertas de WhatsApp reales. La prueba de entrega real sigue pendiente de autorización y credenciales Meta.


## Corrección de conexión desde Vercel — 24/09/2026

- Reproducido: OPTIONS desde el dominio de producción devolvía 403 «Origen no autorizado».
- Añadido el origen exacto en `sos-api`, sin cambiar autenticación, RLS ni habilitar envíos.
- Separados los fallos de disponibilidad SOS de los resultados de acceso, perfil y contactos.
- 29 pruebas de lógica/servidor aprobadas, incluyendo preflight autorizado, POST sin sesión rechazado y dominios ajenos bloqueados.
- Recorrido DOM comprueba que perfil/contactos se guardan con API de salud caída y que el aviso desaparece al recuperar el servicio.
- No se enviaron alertas reales.
