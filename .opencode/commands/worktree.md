---
description: Crea un git worktree en .worktrees/<nombre> desde el argumento dado
---

Tomas $ARGUMENTS como nombre base del worktree.

1. Si $ARGUMENTS está vacío tras trim, no ejecutes nada y pide al usuario el nombre. Detente ahí.
2. Si no, sanitiza a kebab-case para <nombre>:
   - trim + minúsculas
   - quitar tildes/diacríticos (á->a, é->e, í->i, ó->o, ú->u, ñ->n, etc.)
   - espacios y `_` -> `-`
   - eliminar todo lo que no sea `[a-z0-9-]`
   - colapsar `--+` a `-`, quitar `-` inicial/final
   - Ej: `Mi Nueva Feature!` -> `mi-nueva-feature`
3. Ejecuta UNA sola vez con la herramienta bash, desde el root del proyecto, sin `cd` ni comandos adicionales:
   `git worktree add .worktrees/<nombre>`
4. No te cambies de directorio, no listes ramas, no crees branches manuales, no hagas commit, no edites archivos. Solo reporta el comando ejecutado y su salida.
5. Si los argumentos es muy largo, simplificalo a un nombre significativo.