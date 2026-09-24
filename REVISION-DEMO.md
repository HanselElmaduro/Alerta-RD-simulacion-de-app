# Referencias y revisión de Alerta RD

## Análisis de las 16 capturas

| Referencia | Pantalla / estado | Implementación |
|---|---|---|
| aaaa.jpeg | Perfil en edición | Formulario con guardar/cancelar y validación |
| bbb.jpeg | Perfil en consulta | Vista personal y médica, sin copiar datos visibles |
| ddd.jpeg | SOS físico desplegado | Panel de patrón virtual, grabación y práctica |
| dddd.jpeg | Drive sin activar | Consentimiento y configuración obligatoria |
| fff.jpeg | Historial vacío | Estado vacío útil y acceso a empezar una prueba |
| fffff.jpeg | Nuevo contacto en modal | Diálogo con validación y persistencia |
| gggg.jpeg | SOS principal | Botón principal, accesos rápidos, accidente demo |
| hhhh.jpeg | En Camino sin iniciar | Destino, contacto y minutos; nuevos estados activos |
| jjjj.jpeg | Lista de contactos | CRUD y confirmación al borrar |
| kkk.jpeg | Tutor | Solicitud ficticia, respuesta y vencimiento |
| sss.jpeg | PINs | Valores inicialmente vacíos, ocultos y diferentes |
| WhatsApp Image 2026-09-21 at 8.53.18 PM.jpeg | Menú Más | Central/Historial, Contactos, Seguridad y Perfil |
| WhatsApp Image 2026-09-21 at 8.53.19 PM.jpeg | Incorporación a Red de Ayuda | Reglas, consentimiento y posponer |
| WhatsApp Image 2026-09-21 at 8.53.20 PM.jpeg | Red de Ayuda activa/vacía | Escenarios cercanos ficticios y salida |
| xxx.jpeg | Segundo estado/captura de SOS físico | Misma experiencia de práctica, sin permiso Android falso |
| zzz.jpeg | Drive activo | Estado activo demo, monitor simulado y preferencias |

Se conservaron el fondo azul casi negro, las superficies azul grisáceo, el rojo SOS, el verde de confirmación, el amarillo de aviso y las cinco secciones inferiores. Se mejoraron espaciado, jerarquía, consistencia y distribución en escritorio. La composición distintiva de SOS conserva el círculo rojo y sus anillos; no incorpora la barra Android.

## Revisión automatizada

`npm test` ejecuta 13 pruebas independientes con `node:test`:

1. Estado vacío, recuperación de datos y almacenamiento inaccesible/corrupto.
2. Cancelación de SOS, conservación de detalles y contacto, sin finalización posterior.
3. Finalización de SOS una sola vez y prevención de incidentes simultáneos.
4. Tipo de evento preservado para Drive y accidente.
5. Requisitos de destino, contacto y tiempo de Ruta.
6. Vencimiento de trayecto, verificación y escalamiento único.
7. Llegada y conservación del contacto del trayecto tras borrarlo de la agenda.
8. Cancelación de trayecto sin eventos posteriores.
9. Tutor sin respuesta y prevención de escalamiento tras confirmación.
10. Persistencia de datos y plazos tras recarga.
11. Validación de contactos y duplicados.
12. PINs numéricos, diferentes y de longitud válida.
13. Temporizadores no negativos y formato de tiempo.

También se comprobaron 16 recorridos de interfaz con jsdom (`npm run test:ui`), todos aprobados:

- Pantalla inicial y cinco secciones.
- Validación/alta y edición de contactos.
- Ruta: contacto, extensión, vencimiento, escalamiento y llegada.
- Drive: configuración obligatoria, impacto, cancelación de reconfiguración y desactivación.
- Red: incorporación, alerta, detalle, cierre y salida.
- Perfil: guardar y cancelar sin sobrescribir.
- PINs: igualdad rechazada, valores ocultos, hash, código incorrecto y coacción.
- Tutor: confirmar y dejar vencer.
- SOS con contacto/detalle y cancelación con/sin PIN.
- SOS físico: grabar y reconocer un patrón.
- Geolocalización denegada/concedida mediante API simulada, y alternativa manual.
- Enlace al marcador advertido como acción real.
- Borrado confirmado y detalle de historial.
- Navegación de las nueve vistas sin excepciones JavaScript.

La sintaxis JavaScript de los módulos y el servidor local también fue validada. Las APIs de ubicación fueron simuladas únicamente en las pruebas automatizadas; la aplicación usa la API real del navegador cuando el usuario la solicita.

## Recorrido manual sugerido

| Flujo | Pasos | Resultado esperado |
|---|---|---|
| Contactos | Más → Contactos → Agregar, editar y eliminar | Validación; eliminación solo tras confirmar |
| SOS cancelado | SOS → escribir detalle/elegir contacto → Cancelar | Resultado cancelado visible en historial |
| SOS completado | SOS → dejar terminar los 10 segundos | Resultado local; ningún envío real |
| Ubicación denegada | Mi ubicación → Obtener → denegar | Explicación, reintento y referencia manual |
| Ubicación concedida | Mi ubicación → Obtener → aceptar | Coordenadas, precisión y mapa |
| Drive | Intentar activar incompleto, completar y activar | Bloqueo previo; estado Protección activa · demo |
| Impacto | Drive → Simular impacto → cancelar o esperar | Resultado correspondiente en historial |
| Ayuda | Aceptar → unirse → simular → consultar → cerrar | Escenario ficticio cerrado; salida confirmada |
| Ruta | Guardar contacto → destino/minutos → iniciar | Tiempo restante, llegada, extensión y cancelación |
| Ruta vencida | Simular vencimiento → esperar 15 segundos | Escalamiento simulado; contacto no notificado |
| PINs | Intentar dos iguales; guardar diferentes | Error con iguales, valores ocultos al guardar |
| Coacción | Practicar con el segundo PIN | Cancelación aparente y seguimiento simulado explícito |
| Tutor | Solicitud → Estoy bien; repetir y dejar vencer | Confirmación o escalamiento local según escenario |
| Perfil | Editar → Cancelar; editar → Guardar | Cancelar preserva la vista, guardar actualiza |
| SOS físico | Grabar 3–6 pulsaciones → probar secuencia | Coincidencia/no coincidencia y registro local |
| Persistencia | Crear datos y recargar | Datos y preferencias recuperados en el mismo origen |

## Alcance de verificación visual

Los estilos incluyen distribuciones a 1550, 1170, 960, 670 y 370 px, barra inferior con área segura móvil, superficies sin anchura móvil estirada y movimiento reducido. Se revisó el código responsive y la estructura accesible.

No fue posible ejecutar un recorrido ni capturas con el navegador de esta sesión. La comprobación de geolocalización real, marcador telefónico, zoom al 200%, lector de pantalla y acabado visual en dispositivos físicos queda para el recorrido manual. Las pruebas automatizadas validan lógica; no sustituyen esa comprobación visual.
