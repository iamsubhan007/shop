/// Browser builds (used only for previewing) cannot unpack a compressed backup.
List<int> gunzip(List<int> bytes) => throw UnsupportedError('gzip');
