export function assetUrl(name: string): string {
  const base = import.meta.env.BASE_URL || './'
  return base.endsWith('/') ? base + name : `${base}/${name}`
}
