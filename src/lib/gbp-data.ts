/**
 * GBP Data Parsing & Import
 * Ported from Lovable analytics dashboard
 */
import * as XLSX from 'xlsx'
import type { GBPMetricField, GBPMonthlyData } from '@/types/database'

// --- File Parsing ---

export interface ParsedSheet {
  headers: string[]
  rows: Record<string, unknown>[]
}

export function parseFile(file: File): Promise<ParsedSheet> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array', cellDates: true })
        const sheetName = wb.SheetNames[0]
        const sheet = wb.Sheets[sheetName]
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
        if (!json.length) {
          reject(new Error('File is empty or has no data rows'))
          return
        }
        const headers = Object.keys(json[0])
        resolve({ headers, rows: json })
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsArrayBuffer(file)
  })
}

// --- Metric Field Definitions ---

export const METRIC_FIELDS: { value: GBPMetricField | '__skip'; label: string }[] = [
  { value: 'search_mobile', label: 'Search Mobile' },
  { value: 'search_desktop', label: 'Search Desktop' },
  { value: 'maps_mobile', label: 'Maps Mobile' },
  { value: 'maps_desktop', label: 'Maps Desktop' },
  { value: 'calls', label: 'Calls' },
  { value: 'messages', label: 'Messages' },
  { value: 'bookings', label: 'Bookings' },
  { value: 'directions', label: 'Directions' },
  { value: 'website_clicks', label: 'Website Clicks' },
  { value: 'food_orders', label: 'Food Orders' },
  { value: 'food_menu_clicks', label: 'Menu Clicks' },
  { value: 'hotel_bookings', label: 'Hotel Bookings' },
  { value: '__skip', label: 'Skip (ignore)' },
]

// --- Auto Column Mapping ---

export function autoDetectMapping(headers: string[]): Record<string, GBPMetricField | '__skip'> {
  const mapping: Record<string, GBPMetricField | '__skip'> = {}
  let foodOrdersAssigned = false

  const patterns: [RegExp, GBPMetricField][] = [
    [/viewed your Business Profile on Google Search.*Mobile/i, 'search_mobile'],
    [/viewed your Business Profile on Google Search.*Desktop/i, 'search_desktop'],
    [/viewed your Business Profile on Google Maps.*Mobile/i, 'maps_mobile'],
    [/viewed your Business Profile on Google Maps.*Desktop/i, 'maps_desktop'],
    [/interactions with the call button/i, 'calls'],
    [/conversations initiated/i, 'messages'],
    [/bookings made/i, 'bookings'],
    [/requests for directions/i, 'directions'],
    [/interactions with the website button/i, 'website_clicks'],
    [/interactions with the hotel supplier/i, 'hotel_bookings'],
    [/search.*mobile/i, 'search_mobile'],
    [/search.*desktop/i, 'search_desktop'],
    [/maps.*mobile/i, 'maps_mobile'],
    [/maps.*desktop/i, 'maps_desktop'],
    [/\bcall/i, 'calls'],
    [/\bmessage/i, 'messages'],
    [/\bbooking/i, 'bookings'],
    [/\bdirection/i, 'directions'],
    [/website.*click/i, 'website_clicks'],
    [/\bhotel/i, 'hotel_bookings'],
  ]

  const foodOrderPattern = /food.{0,30}order/i

  for (const header of headers) {
    let matched = false

    if (foodOrderPattern.test(header)) {
      if (!foodOrdersAssigned) {
        mapping[header] = 'food_orders'
        foodOrdersAssigned = true
      } else {
        mapping[header] = 'food_menu_clicks'
      }
      matched = true
    }

    if (!matched) {
      for (const [regex, field] of patterns) {
        if (regex.test(header)) {
          mapping[header] = field
          matched = true
          break
        }
      }
    }

    if (!matched) mapping[header] = '__skip'
  }
  return mapping
}

// --- Date Extraction ---

export function extractDatesFromRows(rows: Record<string, unknown>[]): { month: number; year: number }[] {
  const dates: { month: number; year: number }[] = []
  for (const row of rows) {
    for (const val of Object.values(row)) {
      if (val instanceof Date && !isNaN(val.getTime())) {
        dates.push({ month: val.getMonth() + 1, year: val.getFullYear() })
        break
      }
      if (typeof val === 'string') {
        const d = new Date(val)
        if (!isNaN(d.getTime()) && d.getFullYear() > 2000) {
          dates.push({ month: d.getMonth() + 1, year: d.getFullYear() })
          break
        }
        const monthMatch = val.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+(\d{4})$/i)
        if (monthMatch) {
          const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
          const mi = monthNames.indexOf(monthMatch[1].toLowerCase().slice(0, 3))
          if (mi >= 0) {
            dates.push({ month: mi + 1, year: parseInt(monthMatch[2]) })
            break
          }
        }
      }
      if (typeof val === 'number' && val > 40000 && val < 60000) {
        const d = new Date((val - 25569) * 86400 * 1000)
        dates.push({ month: d.getMonth() + 1, year: d.getFullYear() })
        break
      }
    }
  }
  return dates
}

export function extractDateFromFilename(filename: string): { month: number; year: number } | null {
  const match = filename.match(/(\d{4})-(\d{1,2})-(\d{1,2})\s*-\s*(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (match) {
    const year = parseInt(match[1])
    const month = parseInt(match[2])
    if (month >= 1 && month <= 12 && year >= 2000 && year <= 2100) return { month, year }
  }
  return null
}

// --- Helpers ---

export function formatMonth(month: number, year: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

/** Build a GBPMonthlyData row from parsed data + mapping */
export function buildGBPRow(
  row: Record<string, unknown>,
  mapping: Record<string, GBPMetricField | '__skip'>,
  businessId: string,
  date: { month: number; year: number }
): Omit<GBPMonthlyData, 'id' | 'created_at'> {
  const result: Record<string, unknown> = {
    business_id: businessId,
    month: date.month,
    year: date.year,
    search_mobile: 0, search_desktop: 0,
    maps_mobile: 0, maps_desktop: 0,
    calls: 0, messages: 0, bookings: 0, directions: 0,
    website_clicks: 0, food_orders: 0, food_menu_clicks: 0, hotel_bookings: 0,
  }

  for (const [header, field] of Object.entries(mapping)) {
    if (field === '__skip') continue
    const val = row[header]
    result[field] = typeof val === 'number' ? val : parseInt(String(val)) || 0
  }

  return result as Omit<GBPMonthlyData, 'id' | 'created_at'>
}
