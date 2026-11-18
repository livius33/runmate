// Upload limits shared by the browser (components/settings/ImportCard.tsx) and the server. Pure, no imports.
export const MAX_FILE_BYTES = 20 * 1024 * 1024       // one activity file, uncompressed
export const MAX_ZIP_ENTRIES = 5000
export const MAX_UNPACKED_BYTES = 10 * MAX_FILE_BYTES // everything one upload inflates to (ZIP entries, inner ZIPs, .gz)
export const ACTIVITY_EXTENSIONS = ['.fit', '.gpx', '.tcx']
// One upload request (Vercel caps a body at 4.5 MB). The browser batches below both limits.
export const MAX_FILES_PER_REQUEST = 25
export const MAX_REQUEST_BYTES = 4 * 1024 * 1024
