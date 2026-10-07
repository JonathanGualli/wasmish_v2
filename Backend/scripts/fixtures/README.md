# Archivos de prueba del importador de contactos

Para probar «Importar contactos» a mano, con los casos que salen en las listas
reales. **No** usan los teléfonos de `seed:contacts` (`59300099xxxx`): esos no
son números válidos de Ecuador y el importador los rechazaría. Estos sí tienen
formato válido (y podrían existir: no los uses fuera del modo de prueba de
campañas). Para borrarlos de la BD local:

```bash
mongosh wasmish --eval 'db.contacts.deleteMany({ phone: /^(593990099|573000999|59322099)/ })'
```

| Archivo | Qué prueba |
|---|---|
| `contactos-excel-es.csv` | Lo que guarda Excel en español: separador `;` y codificación Windows-1252 (tildes y eñes). Cabeceras con otros nombres («Celular», «Nombres», «Razón social», «Grupo») para el emparejamiento automático. |
| `contactos-utf8.csv` | Separador `,`, UTF-8, y etiquetas entre comillas que llevan comas (`"VIP, Quito"`). |
| `clientes-prueba.xlsx` | Una lista de clientes de Excel como las que trae la gente: hoja «Clientes», cabeceras que no son las de la plantilla («Celular», «Correo», «Observaciones») y columnas que sobran («Cédula», «Ciudad»). Teléfonos escritos de todas las formas, algunos guardados como número. Con el país en Ecuador da **16 nuevos, 1 repetido, 3 con aviso y 5 con error**. |

Casos dentro de cada uno: número local con 0, con `+593` y espacios, `00593`,
sin el 0 (Excel se lo quitó), notación científica, demasiado corto, letras,
vacío, fijo, de otro país, el mismo número escrito de dos formas, email roto y
nombre demasiado largo.
