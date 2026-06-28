// NHTSA vPIC VIN decoder — free, no API key, model years 1981+.
// Results are cached by the service worker (see vite.config.ts) and persisted on
// the vehicle record, so a once-decoded VIN keeps working offline.

export interface DecodedVin {
  year?: number
  make?: string
  model?: string
  trim?: string
  engine?: string
  type?: string
  raw: Record<string, string>
  errorText?: string
}

const VPIC_URL = 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues'

export function isPlausibleVin(vin: string): boolean {
  const v = vin.trim().toUpperCase()
  // 17 chars for MY1981+, excluding I/O/Q. Older/JDM VINs may be shorter.
  return /^[A-HJ-NPR-Z0-9]{11,17}$/.test(v)
}

export async function decodeVin(vin: string, signal?: AbortSignal): Promise<DecodedVin> {
  const clean = vin.trim().toUpperCase()
  const res = await fetch(`${VPIC_URL}/${encodeURIComponent(clean)}?format=json`, { signal })
  if (!res.ok) throw new Error(`VIN decode failed (${res.status})`)
  const json = await res.json()
  const row = (json?.Results?.[0] ?? {}) as Record<string, string>

  const raw: Record<string, string> = {}
  for (const [k, val] of Object.entries(row)) {
    if (val && val !== 'Not Applicable' && val !== '0') raw[k] = val
  }

  const yearNum = row.ModelYear ? parseInt(row.ModelYear, 10) : undefined
  const engineParts = [row.DisplacementL ? `${row.DisplacementL}L` : '', row.EngineCylinders ? `${row.EngineCylinders}cyl` : '', row.FuelTypePrimary || '']
    .filter(Boolean).join(' ')

  return {
    year: yearNum && !Number.isNaN(yearNum) ? yearNum : undefined,
    make: row.Make || undefined,
    model: row.Model || undefined,
    trim: row.Trim || row.Series || undefined,
    engine: engineParts || undefined,
    type: row.VehicleType || undefined,
    raw,
    errorText: row.ErrorText && row.ErrorText !== '0 - VIN decoded clean. Check Digit (9th position) is correct'
      ? row.ErrorText
      : undefined,
  }
}
