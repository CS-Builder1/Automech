import type { InspectionItem } from '@/db/types'
import { newId } from './id'

export interface InspectionTemplate {
  name: string
  categories: { category: string; items: string[] }[]
}

/** A pragmatic ~30-point inspection covering the usual courtesy-check areas. */
export const STANDARD_INSPECTION: InspectionTemplate = {
  name: 'Standard 30-point inspection',
  categories: [
    { category: 'Road test & exterior', items: ['Road test', 'Body / glass', 'Wiper blades', 'Horn'] },
    { category: 'Lights', items: ['Headlights', 'Brake lights', 'Turn signals', 'Reverse lights'] },
    { category: 'Brakes', items: ['Front pads / rotors', 'Rear pads / rotors', 'Brake fluid', 'Parking brake'] },
    { category: 'Tires & wheels', items: ['LF tire', 'RF tire', 'LR tire', 'RR tire', 'Spare', 'Tire pressures'] },
    { category: 'Under hood', items: ['Engine oil level', 'Coolant level', 'Brake fluid level', 'Power steering fluid', 'Washer fluid', 'Belts', 'Hoses', 'Air filter', 'Battery & terminals'] },
    { category: 'Underbody & suspension', items: ['Shocks / struts', 'CV axles / boots', 'Exhaust system', 'Fluid leaks'] },
  ],
}

export const TEMPLATES: InspectionTemplate[] = [STANDARD_INSPECTION]

/** Materialise a template into unrated inspection items. */
export function buildItems(template: InspectionTemplate): InspectionItem[] {
  return template.categories.flatMap((c) =>
    c.items.map((label) => ({ id: newId(), category: c.category, label, rating: 'na' as const })),
  )
}
