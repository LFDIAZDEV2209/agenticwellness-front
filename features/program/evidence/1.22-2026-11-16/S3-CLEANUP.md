# Limpieza de objetos QA de esta sesión

El API 5122 heredó `Storage:Provider=S3`. Durante la preparación inicial se
subieron 14 WAV silenciosos de 16.044 bytes a `cooppadresd-storage-prod`.
Fue un error tratar el storage del API local como local. No se subieron más
objetos tras identificarlo. Los casos definitivos reutilizan claves existentes
y limpian únicamente filas QA de PostgreSQL, sin eliminar sus blobs compartidos.

Claves exactas subidas en esta sesión:

```text
media/qa/qa122-ac3bbb43/original.wav
media/qa/qa122-bd70cb6d/original.wav
media/qa/qa122-bd70cb6d/replacement.wav
media/qa/qa122-bd70cb6d/wrongType.wav
media/qa/qa122-bd70cb6d/unpublished.wav
media/qa/qa122-056d9a12/original.wav
media/qa/qa122-056d9a12/replacement.wav
media/qa/qa122-056d9a12/wrongType.wav
media/qa/qa122-056d9a12/unpublished.wav
media/qa/qa123-ec65407c/original.wav
media/qa/qa123-db1a1071/original.wav
media/qa/qa123-db1a1071/replacement.wav
media/qa/qa123-db1a1071/wrongType.wav
media/qa/qa123-db1a1071/unpublished.wav
```

Se listaron primero ambos prefijos con `aws s3api list-objects-v2`. Había
8 objetos visibles; los otros 6 ya tenían marcadores de borrado de la limpieza
inicial. Se cruzaron los manifiestos QA, las filas locales y las fechas/tamaños
de `list-object-versions` antes de borrar.

El bucket tiene versionado: el primer `delete-objects` dejó marcadores, por lo
que se listaron las versiones y se ejecutó de nuevo con un manifiesto de pares
`Key`/`VersionId` exactos. Se eliminaron 14 versiones de contenido y 20
marcadores propios de los reintentos, incluidos 6 de claves que nunca llegaron
a tener contenido. Se validaron los cinco identificadores de corrida, nombres
de archivo, tamaños y fechas contra una lista permitida explícita.

```powershell
aws s3api list-objects-v2 --bucket cooppadresd-storage-prod --prefix media/qa/qa122-
aws s3api list-objects-v2 --bucket cooppadresd-storage-prod --prefix media/qa/qa123-
aws s3api list-object-versions --bucket cooppadresd-storage-prod --prefix media/qa/qa122-
aws s3api list-object-versions --bucket cooppadresd-storage-prod --prefix media/qa/qa123-
aws s3api delete-objects --bucket cooppadresd-storage-prod --delete file://s3-delete-versions.json
```

Resultado: 34 entradas eliminadas, sin errores. La última lectura de ambos
prefijos no contiene objetos, versiones ni marcadores. Los JSON contiguos
conservan el listado previo, manifiesto, respuesta y verificación final.
