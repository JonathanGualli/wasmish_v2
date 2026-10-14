# Brief de diseño — El PIN de dos pasos de una línea

> Para la IA de diseño. Describe **qué** tiene que poder hacer el usuario y **qué información** ve, no cómo se ve. Ya conoces Ajustes → Líneas (el diseño de varias líneas): esto es una pieza pequeña dentro de esa tarjeta, y tiene que sentirse parte de ella.

---

## 1. Contexto

Cuando un cliente conecta un número **nuevo** a Wasmish, Wasmish lo activa en WhatsApp por él, y al hacerlo le pone un **PIN de verificación en dos pasos**: seis dígitos que protegen el número. El cliente no lo elige ni lo ve en ese momento: lo genera Wasmish y lo guarda.

Para qué le sirve al cliente:

- **Llevarse el número**: si algún día lo pasa a otro proveedor o a la app de WhatsApp Business, WhatsApp le pedirá ese PIN.
- **Soporte de WhatsApp** también puede pedírselo para cambios en el número.

Casi nadie lo necesitará nunca, pero quien lo necesite **tiene que poder encontrarlo solo**, sin escribirnos.

No todas las líneas tienen PIN guardado. Si el número **ya estaba activo** en WhatsApp cuando se conectó (por ejemplo, el cliente venía de otro proveedor), Wasmish no lo activó y no conoce su PIN: lo tiene quien lo activó.

## 2. Qué tiene que poder hacer el usuario

En **Ajustes → Líneas**, para cada línea, también las desconectadas («Números anteriores»): el número sigue teniendo su PIN aunque ya no esté en Wasmish.

1. **Ver el PIN cuando lo pide**, no a la vista. Es un dato sensible: no tiene que aparecer al abrir Ajustes ni en una captura de pantalla cualquiera. Encaja con los datos técnicos de la línea (ID de la línea, ID de teléfono, ID de WhatsApp Business), en segundo plano.
2. **Copiarlo**, como ya se copian el ID de la línea y los demás IDs.
3. **Entender para qué sirve**, en una frase, junto al PIN: «Te lo pedirá WhatsApp si te llevas este número a otro proveedor o a la app de WhatsApp Business.»
4. **Una línea sin PIN guardado** dice por qué, sin alarmar: «Este número ya estaba activo en WhatsApp cuando lo conectaste. Su PIN lo tiene quien lo activó.»
5. Si pedirlo falla (sin conexión, error del servidor), se dice en el sitio y se puede reintentar.

## 3. Lo que el diseño tiene que transmitir

- **Es un dato del cliente, guardado para él**, no un ajuste que haya que tocar. No se cambia desde Wasmish.
- **Con una sola línea**, no añade ruido a Ajustes: va con los datos técnicos, no compite con el estado ni con los botones de la línea.
- Más adelante, cuando haya equipos y roles, **solo el owner y los administradores** lo verán (los que conectan líneas). Ahora lo ve cualquier usuario de la cuenta, porque todavía solo hay owners.

## 4. Un error nuevo al conectar

Si WhatsApp no deja activar el número al conectarlo, la conexión falla con este mensaje: «WhatsApp no dejó activar este número para enviar mensajes. Inténtalo de nuevo en unos minutos; si se repite, escríbenos.» Va donde ya se enseñan los errores de conectar (el botón de conectar y el formulario manual), con la opción de reintentar. No es un error del formulario: no marca ningún campo.
