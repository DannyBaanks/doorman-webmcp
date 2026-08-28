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
```

Salida real verificada:

```text
slice 3: 3 always-on tools and ownership policy passed
slice 4: human approval and one-shot delete passed
slice 5: no-WebMCP initialization path passed
```

## Servir la página

```text
py -m http.server 8765
```

Resultado real usado para la prueba del navegador: HTTP `200` para `index.html` en
`http://127.0.0.1:8765`.

## Leer la página

Con WebMCP ausente se muestra `WebMCP not available in this browser`; el tablero humano sigue
funcionando. Con WebMCP activo, las herramientas registradas aparecen en la superficie del agente.

## Trampas

- `delete_item` no debe aparecer antes de que una persona pulse `Approve once`.
- Una aprobación para un item no autoriza otro item.
- El permiso se consume al entrar al handler autorizado, incluso si el borrado falla después.
- Los recibos son observación local, no prueba criptográfica.
- La prueba headless de Chrome detectó WebMCP, pero su discovery dinámico fue inestable; no llamarlo
  PASS hasta repetirlo en Chrome interactivo o ChatGPT in-app.
