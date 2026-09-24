# Alerta RD · Demostración interactiva

Web app responsive, en español, inspirada en las 16 capturas proporcionadas. Diseñada como una aplicación: SOS, Drive, Ayuda, Ruta y Más, con navegación inferior persistente y un panel lateral en escritorio.

## Iniciar en tu computadora

Necesitas **Node.js 20.11 o superior** (incluido Node.js 22 o 24). No requiere instalar paquetes.

1. Extrae el ZIP y abre la carpeta `Alerta-RD` en Visual Studio Code.
2. Abre una terminal en esa carpeta.
3. Ejecuta:

```bash
npm start
```

4. Abre **http://localhost:3000**.

Para detenerla, presiona `Ctrl+C`. Para ejecutar las pruebas:

```bash
npm test
```

Los 16 recorridos adicionales de interfaz pueden ejecutarse de forma opcional con **Node.js 22.22.2+, 24.15+ o 26+** y las dependencias de prueba:

```bash
npm --prefix qa ci
npm run test:ui
```

Estas dependencias no son necesarias para iniciar la aplicación ni para las 13 pruebas de lógica. Los recorridos usan un DOM simulado, sin automatizar llamadas o servicios externos.

No abras `index.html` con doble clic: se utilizan módulos JavaScript. Sirve `dist/` desde un servidor HTTP. En Windows puedes cambiar el puerto con `$env:PORT=3001; npm start` desde PowerShell. La ubicación real y la criptografía de PINs necesitan un contexto seguro: HTTPS o localhost.

## Estructura

```text
Alerta-RD/
  dist/
    index.html          Documento principal y metadatos
    app.js              Vistas, formularios, modales y acciones
    model.js            Estado, validación, plazos e historial
    icons.js            Iconos SVG de la interfaz
    styles.css          Diseño responsive, accesibilidad y movimiento reducido
    favicon.svg         Identidad del sitio
  tests/
    flows.test.mjs      Pruebas de reglas y transiciones
  qa/                   Recorridos de interfaz con jsdom (opcionales)
  server.mjs            Servidor local sin dependencias
  package.json          Comandos de inicio y pruebas
  README.md
  REVISION.md           Análisis de referencias y revisión de flujos
```

El contenido desplegable es `dist/`. Puedes alojarlo como sitio estático. No necesita backend, claves, cuentas ni base de datos.

## Qué incluye

- **SOS:** cuenta regresiva de 10 segundos, detalles y contacto, cancelación y resultado local. Accidente demo de 15 segundos.
- **Ubicación:** permiso real del navegador, precisión/coordenadas y enlace a Google Maps. Alternativa manual ante denegación, timeout o falta de soporte. La ubicación no se persiste.
- **Llamar:** confirmación informativa y enlace `tel:911` que abre el marcador compatible; nunca registra una llamada como realizada.
- **SOS físico:** editor de 3 a 6 pulsaciones y práctica con botones virtuales; no solicita accesibilidad de Android ni intercepta teclas físicas.
- **Drive:** consentimiento obligatorio, transporte, ubicación del dispositivo y plazo de 5 a 60 segundos; activar, reconfigurar, cancelar cambios, desactivar y simular impacto. Monitor claramente simulado, sin sensores reales.
- **Ayuda:** incorporación voluntaria, reglas, opción de posponer, alertas ficticias consultables/cerrables y salida de la red.
- **Ruta:** destino, contacto guardado y duración de 1 a 1440 minutos. Llegada, ampliación y cancelación. Botón para simular el vencimiento sin esperar; verificación de 15 segundos y escalamiento simulado.
- **Contactos:** altas, edición y borrado confirmado; validación de nombre, teléfono, relación y teléfono duplicado.
- **Historial:** eventos ordenados del más reciente al más antiguo, con fecha, hora, tipo, estado y detalle.
- **Seguridad:** dos PINs de 4 a 6 dígitos, diferentes, inicialmente vacíos y ocultos; se guardan con sal aleatoria y SHA-256. Práctica normal y de coacción, también desde un SOS activo. No son credenciales ni protección de producción.
- **Tutor:** solicitud externa ficticia, 20 segundos para responder y resultado local.
- **Perfil:** nombre, teléfono y datos médicos, edición/guardado/cancelación. Sin datos personales precargados.

## Persistencia y límites

Los contactos, perfil, PINs resumidos, preferencias, patrón, red, historial y plazos activos se guardan en `localStorage`, bajo `alerta-rd-demo-v1`. Los datos son por navegador y origen; el enlace alojado y localhost tienen espacios separados. Borrar los datos del sitio elimina la demo guardada. El modo privado o un almacenamiento bloqueado puede impedir la persistencia; se muestra un mensaje y la sesión continúa en memoria.

Los temporizadores usan fechas límite. Se recalculan al recargar o volver a la pestaña. Si un trayecto vence mientras la página no puede ejecutarse, su verificación comienza cuando la página vuelve a ejecutarse. **No se garantiza ejecución ni vigilancia en segundo plano, con la pantalla cerrada o con el navegador cerrado.**

No hay SMS, correos, Web Push, acceso remoto, rastreo, envío al 9-1-1 ni conexión con personas reales. Los eventos nunca se presentan como alertas externas enviadas. «Llamar» es una excepción claramente advertida: abre una aplicación telefónica externa cuando existe. Abrir Google Maps es una navegación externa iniciada por el usuario.

Una versión real requeriría backend, autenticación/autorización, servicios de mensajería con confirmación real de entrega y una implementación móvil apropiada para sensores/background. Nada de ello está implementado ni se da por existente en esta demo.

## Accesibilidad y privacidad

HTML semántico, formularios etiquetados, foco visible, navegación por teclado, diálogo nativo modal, cierre con Escape, pestañas con flechas, feedback por `role=status` / `role=alert`, objetivos táctiles y `prefers-reduced-motion`. No se copian barras de estado de Android. No se incorporaron fotografías ni datos personales de las capturas a los archivos del sitio.

Los PINs son para practicar: el almacenamiento local no constituye un sistema seguro frente a quien tiene acceso al dispositivo. Evita reutilizar códigos personales reales.
