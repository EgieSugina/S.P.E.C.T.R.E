export interface LocalFileEntry {
  file: File
  relativePath: string
}

export interface CollectedLocalFiles {
  files: LocalFileEntry[]
  emptyDirs: string[]
}

export function joinRemotePath(base: string, relative: string): string {
  const normalized = relative.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalized) return base
  return base.endsWith('/') ? base + normalized : `${base}/${normalized}`
}

function readDirectoryEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    reader.readEntries(resolve, reject)
  })
}

function entryToFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject)
  })
}

async function readDirectoryEntry(
  entry: FileSystemDirectoryEntry,
  basePath: string
): Promise<CollectedLocalFiles> {
  const files: LocalFileEntry[] = []
  const emptyDirs: string[] = []
  const dirPath = basePath ? `${basePath}/${entry.name}` : entry.name
  const reader = entry.createReader()

  let entries: FileSystemEntry[] = []
  do {
    entries = await readDirectoryEntries(reader)
    for (const child of entries) {
      if (child.isFile) {
        const file = await entryToFile(child as FileSystemFileEntry)
        files.push({
          file,
          relativePath: `${dirPath}/${child.name}`,
        })
      } else if (child.isDirectory) {
        const nested = await readDirectoryEntry(child as FileSystemDirectoryEntry, dirPath)
        files.push(...nested.files)
        emptyDirs.push(...nested.emptyDirs)
      }
    }
  } while (entries.length > 0)

  if (files.length === 0 && emptyDirs.length === 0) {
    emptyDirs.push(dirPath)
  }

  return { files, emptyDirs }
}

async function collectFromEntry(entry: FileSystemEntry): Promise<CollectedLocalFiles> {
  if (entry.isFile) {
    const file = await entryToFile(entry as FileSystemFileEntry)
    return { files: [{ file, relativePath: file.name }], emptyDirs: [] }
  }
  if (entry.isDirectory) {
    return readDirectoryEntry(entry as FileSystemDirectoryEntry, '')
  }
  return { files: [], emptyDirs: [] }
}

export async function collectFromDataTransfer(dt: DataTransfer): Promise<CollectedLocalFiles> {
  const items = Array.from(dt.items).filter((item) => item.kind === 'file')
  if (items.length === 0) {
    return collectFromFileList(dt.files)
  }

  const files: LocalFileEntry[] = []
  const emptyDirs: string[] = []
  const seen = new Set<string>()

  for (const item of items) {
    const entry = item.webkitGetAsEntry?.() ?? null
    if (entry) {
      const collected = await collectFromEntry(entry)
      for (const f of collected.files) {
        if (!seen.has(f.relativePath)) {
          seen.add(f.relativePath)
          files.push(f)
        }
      }
      for (const d of collected.emptyDirs) {
        if (!seen.has(`dir:${d}`)) {
          seen.add(`dir:${d}`)
          emptyDirs.push(d)
        }
      }
      continue
    }

    const file = item.getAsFile()
    if (!file) continue
    const rel =
      (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
    if (!seen.has(rel)) {
      seen.add(rel)
      files.push({ file, relativePath: rel })
    }
  }

  return { files, emptyDirs }
}

export function collectFromFileList(fileList: FileList): CollectedLocalFiles {
  const files: LocalFileEntry[] = []
  for (const file of Array.from(fileList)) {
    const rel =
      (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
    files.push({ file, relativePath: rel })
  }
  return { files, emptyDirs: [] }
}
