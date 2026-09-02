# Guía de Doorman

```text
node tests/doorman.test.js
```

Regla de oro: `Doorman` no es un sandbox ni una frontera de seguridad; es una política cooperativa
que hace visible la autoridad de aplicación. El navegador sí mantiene fuera de la superficie una
herramienta que no está registrada.

## Pruebas locales

```text
node tests/doorman.test.js
node tests/interaction.test.js
```

Salida real verificada:

```text
slice 3: 3 always-on tools and ownership policy passed
slice 4: human approval and one-shot delete passed
slice 5: no-WebMCP initialization path passed

LOCAL_JS_INTERACTION_GATE: 69 tests
PASSED: 69
FAILED: 0
JS_FIXTURE_CONFORMANCE_MATCHES: 21
SDK_RUNTIME_PARITY: NOT_DEMONSTRATED
```

## Servir la página

```text
py -m http.server 8765
```

Resultado real usado para la prueba del navegador: HTTP `200` para `index.html` en
`http://127.0.0.1:8765`.

## Prueba pública WebMCP

Abre esta URL en Chrome compatible:

```text
https://dannybaanks.github.io/doorman-webmcp/
```

La página debe mostrar:

```text
WebMCP available
— an agent can discover the tools this page registers.
```

La prueba interactiva verificada siguió este orden, sin recargar la página:

1. `add_item` creó `pending approval diagnostic`.
2. `list_items` devolvió el ID `itm_7ss21ykp3`.
3. `request_approval` recibió ese ID y apareció la solicitud pendiente.
4. La persona pulsó `Approve once`.
5. `delete_item` quedó `REGISTERED — ONE SHOT`.
6. `delete_item` borró el item y quedó `UNREGISTERED`.

Salida final observada:

```text
#5 delete_item
ALLOWED
executed
approved_one_shot_target
approval: consumed

delete_item
UNREGISTERED
NONE
```

Esta prueba confirma la integración WebMCP real. No es un fresh-agent sin guía: incluyó llamadas
manuales y aprobación humana explícita.

## Leer la página

Con WebMCP ausente se muestra `WebMCP not available in this browser`; el tablero humano sigue
funcionando. Con WebMCP activo, las herramientas registradas aparecen en la superficie del agente.

## Trampas

- `delete_item` no debe aparecer antes de que una persona pulse `Approve once`.
- Una aprobación para un item no autoriza otro item.
- El permiso se consume al entrar al handler autorizado, incluso si el borrado falla después.
- Los recibos son observación local, no prueba criptográfica.
- El Chrome aislado usado por el helper de automatización puede no tener WebMCP habilitado. La
  prueba pública PASS se hizo en el Chrome interactivo compatible, no en ese perfil automatizado.
- `executeTool()` no debe decodificarse suponiendo siempre `content[0].text`; primero registra el
  valor crudo y sus claves. El listado visible confirmó el ID real antes de pedir aprobación.
- `interaction_reset` no es una herramienta del agente: solo existe como botón humano en la UI. El
  modelo no puede limpiar el registro que lo está midiendo.
- La ventana de deriva es acotada (8 turnos por defecto); tras suficientes turnos técnicos la
  deriva relacional se limpia sola. No lo confundas con acumulación infinita.
