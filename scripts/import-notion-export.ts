/**
 * One-shot Notion export importer for Apnosh.
 *
 * Parses the 3 CSV databases + nested markdown pages from a Notion
 * workspace export and materializes:
 *   - clients (from Client Business Overview)
 *   - client_contacts (from Client database)
 *   - client_interactions (from Meetings database)
 *   - client_docs (from every nested markdown page)
 *
 * Relations are preserved: contacts link to businesses, meetings link to
 * both. Markdown pages attach to their parent business as client_docs.
 *
 * Run: npx tsx scripts/import-notion-export.ts <path-to-unpacked-export>
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import Papa from 'papaparse'

// Load env from .env.local
import { config as loadEnv } from 'dotenv'
loadEnv({ path: path.resolve(process.cwd(), '.env.local') })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminSupabase = ReturnType<typeof createClient<any>>

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE env vars. Run from project root.')
  process.exit(1)
}

const supabase: AdminSupabase = createClient(SUPABASE_URL, SERVICE_KEY)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(name: string): string {
  return name.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64)
}

function readCsv<T = Record<string, string>>(filePath: string): T[] {
  const content = fs.readFileSync(filePath, 'utf-8')
  // Notion CSVs start with BOM sometimes
  const cleaned = content.replace(/^\uFEFF/, '')
  const parsed = Papa.parse<T>(cleaned, {
    header: true,
    skipEmptyLines: 'greedy',
  })
  return parsed.data
}

/**
 * Notion relation cells look like: "Name1 (path/to/page.md), Name2 (path/to/other.md)"
 * Extract the page names.
 */
function parseNotionRelations(cell: string | undefined): string[] {
  if (!cell) return []
  return cell
    .split(/,\s*(?=[A-Z])/)
    .map(part => {
      const match = part.match(/^([^(]+)\s*\(/)
      return match ? match[1].trim() : part.trim()
    })
    .filter(Boolean)
    .map(n => n.replace(/^Untitled.*/, '')) // skip untitled relations
    .filter(Boolean)
}

/**
 * Classify a markdown filename/path into a doc category.
 */
function inferCategory(title: string): string {
  const t = title.toLowerCase()
  if (t.includes('competitor')) return 'competitor_analysis'
  if (t.includes('strategy') || t.includes('defining')) return 'strategy'
  if (t.includes('content plan') || t.includes('content calendar')) return 'content_planning'
  if (t.includes('content idea') || t.includes('ideas bank')) return 'content_ideas'
  if (t.includes('pillar')) return 'content_pillars'
  if (t.includes('meeting')) return 'meeting_notes'
  if (t.includes('onboarding')) return 'onboarding'
  if (t.includes('snapshot') || t.includes('summary')) return 'summary'
  return 'other'
}

/**
 * Strip Notion's page-ID suffix from a filename. Notion names files like
 * "Do Si KBBQ 262b76ef097881b289f0f2ea02f88728.md" -- we want just "Do Si KBBQ".
 */
function cleanNotionName(filename: string): string {
  return filename
    .replace(/\s*[a-f0-9]{32}(?:\.md|\.csv)?(?:_all)?$/i, '')
    .replace(/\.md$/, '')
    .trim()
}

/**
 * Parse a Notion markdown file: front-matter-style header lines like
 * "Email: foo@bar.com" followed by the body.
 */
function parseNotionMarkdown(content: string): {
  headerFields: Record<string, string>
  body: string
} {
  const lines = content.split('\n')
  const headerFields: Record<string, string> = {}

  // Skip "# Title" line + blank lines
  let i = 0
  while (i < lines.length && (lines[i].startsWith('# ') || lines[i].trim() === '')) i++

  // Collect "Key: Value" lines until we hit non-field content
  while (i < lines.length) {
    const line = lines[i]
    const match = line.match(/^([A-Z][A-Za-z ]{1,40}):\s+(.+)$/)
    if (!match || line.startsWith('#')) break
    headerFields[match[1].trim()] = match[2].trim()
    i++
  }

  // Rest is the body
  const body = lines.slice(i).join('\n').trim()
  return { headerFields, body }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const exportRoot = process.argv[2]
  if (!exportRoot) {
    console.error('Usage: tsx scripts/import-notion-export.ts <path-to-unpacked-export>')
    process.exit(1)
  }

  // Discover the Notion "Client List (CRM)" folder
  const crmDir = fs.existsSync(path.join(exportRoot, 'Client List (CRM)'))
    ? path.join(exportRoot, 'Client List (CRM)')
    : exportRoot

  if (!fs.existsSync(crmDir)) {
    console.error(`CRM directory not found at ${crmDir}`)
    process.exit(1)
  }

  console.log(`\n=== Importing from: ${crmDir} ===\n`)

  // ────────────────────────────────────────────────────────────────
  // Step 1: Businesses (Client Business Overview) -> clients table
  // ────────────────────────────────────────────────────────────────

  const businessesCsvPath = fs.readdirSync(crmDir)
    .find(f => f.startsWith('Client Business Overview') && f.endsWith('_all.csv'))
  if (!businessesCsvPath) throw new Error('Client Business Overview CSV not found')

  const businessRows = readCsv<Record<string, string>>(path.join(crmDir, businessesCsvPath))
  console.log(`Found ${businessRows.length} businesses in CSV`)

  const businessNameToId = new Map<string, string>()

  for (const row of businessRows) {
    const name = (row['Company Name'] || row['\uFEFFCompany Name'] || '').trim()
    if (!name) continue

    const slug = slugify(name)
    const services = (row['Service'] || '').split(',').map(s => s.trim()).filter(Boolean)
    const dateBegan = row['Date Began']
    const onboardingDate = dateBegan ? new Date(dateBegan).toISOString().split('T')[0] : null
    const location = row['Location'] || null
    const tier = row['Package']?.match(/tier (\d)/i)
      ? `Tier ${row['Package'].match(/tier (\d)/i)![1]}`
      : null
    const type = row['Type'] || null
    const subType = row['Sub Type'] || null

    // Upsert client
    const { data: existing } = await supabase
      .from('clients')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()

    let clientId: string
    if (existing?.id) {
      clientId = existing.id
      console.log(`  [~] ${name} already exists, updating (${clientId})`)
      await supabase
        .from('clients')
        .update({
          industry: type,
          location,
          services_active: services,
          tier: null, // leave CRM tier alone -- Notion Tier != Apnosh tier
          onboarding_date: onboardingDate,
          notes: subType ? `Sub Type: ${subType}` : null,
        })
        .eq('id', clientId)
    } else {
      const { data: inserted, error } = await supabase
        .from('clients')
        .insert({
          name,
          slug,
          industry: type,
          location,
          services_active: services,
          billing_status: 'active',
          onboarding_date: onboardingDate,
          notes: subType ? `Sub Type: ${subType}` : null,
        })
        .select('id')
        .single()

      if (error || !inserted) {
        console.error(`  [!] Failed to insert ${name}:`, error?.message)
        continue
      }
      clientId = inserted.id
      console.log(`  [+] ${name} (${clientId})`)

      // Sister rows
      await supabase.from('client_brands').insert({ client_id: clientId })
      await supabase.from('client_patterns').insert({ client_id: clientId })
    }

    businessNameToId.set(name, clientId)
  }

  // ────────────────────────────────────────────────────────────────
  // Step 2: Contacts (Client) -> client_contacts table
  // ────────────────────────────────────────────────────────────────

  const clientsCsvPath = fs.readdirSync(crmDir)
    .find(f => f.startsWith('Client ') && f.endsWith('_all.csv') && !f.startsWith('Client Business') && !f.startsWith('[ARCHIVED'))
  if (!clientsCsvPath) {
    console.log('No Client CSV found, skipping contacts')
  } else {
    const contactRows = readCsv<Record<string, string>>(path.join(crmDir, clientsCsvPath))
    console.log(`\nFound ${contactRows.length} contacts in CSV`)

    for (const row of contactRows) {
      const name = (row['Name'] || row['\uFEFFName'] || '').trim()
      if (!name) continue

      // Parse their linked businesses
      const companyRelations = parseNotionRelations(row['Company'])
      const linkedBusinesses = companyRelations
        .map(n => businessNameToId.get(n))
        .filter((id): id is string => !!id)

      if (linkedBusinesses.length === 0) {
        console.log(`  [?] ${name}: no business match, skipping`)
        continue
      }

      // Create a contact for each linked business
      for (const clientId of linkedBusinesses) {
        // Check if contact already exists for this client
        const { data: existing } = await supabase
          .from('client_contacts')
          .select('id')
          .eq('client_id', clientId)
          .eq('full_name', name)
          .maybeSingle()

        if (existing?.id) {
          console.log(`  [~] ${name} already at this client`)
          continue
        }

        const phone = row['Phone'] === 'N/A' ? null : (row['Phone'] || null)
        const email = row['Email'] === 'N/A' ? null : (row['Email'] || null)
        // Normalize Notion contact method strings to our enum
        // (portal | email | phone | text). "Call" -> phone, "Discord"
        // -> null, "Other" -> null.
        const rawMethod = (row['Primary Contact Method'] || '').split(',')[0]?.trim().toLowerCase() ?? ''
        const methodMap: Record<string, string | null> = {
          email: 'email', phone: 'phone', call: 'phone',
          text: 'text', sms: 'text',
          portal: 'portal',
          discord: null, slack: null, other: null, '': null,
        }
        const preferredMethod = methodMap[rawMethod] ?? null

        // Role is constrained to a specific enum. Map Notion's freeform
        // Title to the closest Apnosh role.
        const titleLower = (row['Title'] || '').toLowerCase()
        const role: string = /owner|ceo|founder/.test(titleLower) ? 'owner'
          : /manager|mgr/.test(titleLower) ? 'manager'
          : /market/.test(titleLower) ? 'marketing_lead'
          : /bill|finance|account/.test(titleLower) ? 'billing'
          : /coo|director|vp|chief/.test(titleLower) ? 'owner'  // treat exec-level as owner
          : titleLower ? 'other' : 'other'

        const { error } = await supabase.from('client_contacts').insert({
          client_id: clientId,
          full_name: name,
          email,
          phone,
          title: row['Title'] || null,  // freeform title preserved
          role,                          // strict enum satisfied
          pronouns: row['Pronouns'] || null,
          preferred_contact_method: preferredMethod,
          is_primary: true,
          source: 'notion_import',
        })

        if (error) {
          console.error(`  [!] ${name}:`, error.message)
        } else {
          console.log(`  [+] ${name} -> client ${clientId}`)
        }
      }
    }
  }

  // ────────────────────────────────────────────────────────────────
  // Step 3: Meetings -> client_interactions table
  // ────────────────────────────────────────────────────────────────

  const meetingsCsvPath = fs.readdirSync(crmDir)
    .find(f => f.startsWith('Meetings') && f.endsWith('_all.csv'))
  if (meetingsCsvPath) {
    const meetingRows = readCsv<Record<string, string>>(path.join(crmDir, meetingsCsvPath))
    console.log(`\nFound ${meetingRows.length} meetings in CSV`)

    for (const row of meetingRows) {
      const name = (row['Name'] || row['\uFEFFName'] || '').trim()
      if (!name) continue

      // Link to business via "Client Business Overview" relation
      const businesses = parseNotionRelations(row['Client Business Overview'])
      let clientId: string | undefined
      for (const b of businesses) {
        const id = businessNameToId.get(b)
        if (id) { clientId = id; break }
      }

      // If no business link, try the contact -> their business
      if (!clientId) {
        const contacts = parseNotionRelations(row['Client'])
        if (contacts.length > 0) {
          const { data: contact } = await supabase
            .from('client_contacts')
            .select('client_id')
            .eq('full_name', contacts[0])
            .limit(1)
            .maybeSingle()
          clientId = contact?.client_id
        }
      }

      if (!clientId) {
        console.log(`  [?] ${name}: no client match, skipping`)
        continue
      }

      // Notion date cells can include ranges like
      // "January 26, 2026 2:00 PM (PST) → 3:00 PM". Take the start only.
      let occurredAt: string
      try {
        const rawDate = row['Date']
        const before = rawDate ? rawDate.split('→')[0].replace(/\([A-Z]+\)/g, '').trim() : ''
        const parsed = before ? new Date(before) : new Date()
        occurredAt = isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString()
      } catch {
        occurredAt = new Date().toISOString()
      }

      // Read body from the corresponding markdown file
      const meetingDir = path.join(crmDir, 'Meetings')
      let body: string | null = null
      if (fs.existsSync(meetingDir)) {
        const mdFile = fs.readdirSync(meetingDir).find(f =>
          f.endsWith('.md') && cleanNotionName(f) === name
        )
        if (mdFile) {
          const raw = fs.readFileSync(path.join(meetingDir, mdFile), 'utf-8')
          const { body: parsedBody } = parseNotionMarkdown(raw)
          body = parsedBody || null
        }
      }

      const { error } = await supabase.from('client_interactions').insert({
        client_id: clientId,
        kind: 'meeting',
        subtype: row['Type'] || null,
        occurred_at: occurredAt,
        summary: name,
        body,
        performed_by_name: row['Organizer'] || null,
        metadata: {
          location: row['Location'] || null,
          imported_from: 'notion',
        },
      })

      if (error) {
        console.error(`  [!] ${name}:`, error.message)
      } else {
        console.log(`  [+] ${name} -> client ${clientId}`)
      }
    }
  }

  // ────────────────────────────────────────────────────────────────
  // Step 4: All business-level markdown pages -> client_docs
  // ────────────────────────────────────────────────────────────────

  const businessDir = path.join(crmDir, 'Client Business Overview')
  if (!fs.existsSync(businessDir)) {
    console.log('\nNo Client Business Overview directory for docs import')
  } else {
    console.log(`\nImporting docs from ${businessDir}...`)
    const topLevelFiles = fs.readdirSync(businessDir)

    for (const entry of topLevelFiles) {
      const full = path.join(businessDir, entry)
      const stat = fs.statSync(full)

      if (stat.isDirectory()) {
        // This is a business's subpage folder (e.g. "Do Si KBBQ/")
        const businessName = cleanNotionName(entry)
        const clientId = businessNameToId.get(businessName)
        if (!clientId) {
          console.log(`  [?] No matching client for folder ${businessName}`)
          continue
        }

        // Recursively import all .md files
        await importDocsRecursively(full, clientId, null)
      } else if (entry.endsWith('.md')) {
        // Top-level business page itself -- use as business "summary" doc
        const businessName = cleanNotionName(entry)
        const clientId = businessNameToId.get(businessName)
        if (!clientId) continue

        const raw = fs.readFileSync(full, 'utf-8')
        const { body } = parseNotionMarkdown(raw)

        await supabase.from('client_docs').insert({
          client_id: clientId,
          title: businessName + ' — Overview',
          slug: slugify(businessName) + '-overview',
          category: 'summary',
          body_markdown: body,
          source: 'notion_import',
          source_id: entry.replace(/\.md$/, ''),
          created_by_name: 'system (Notion import)',
        })
        console.log(`  [+] Overview page: ${businessName}`)
      }
    }
  }

  // ────────────────────────────────────────────────────────────────
  // Step 5: Per-contact markdown pages -> client_docs (profile context)
  // ────────────────────────────────────────────────────────────────

  const contactDir = path.join(crmDir, 'Client')
  if (fs.existsSync(contactDir)) {
    console.log('\nImporting contact profile pages...')
    for (const entry of fs.readdirSync(contactDir)) {
      if (!entry.endsWith('.md')) continue

      const contactName = cleanNotionName(entry)
      const raw = fs.readFileSync(path.join(contactDir, entry), 'utf-8')
      const { body } = parseNotionMarkdown(raw)

      // Find which clients this contact is at
      const { data: contacts } = await supabase
        .from('client_contacts')
        .select('client_id')
        .eq('full_name', contactName)

      for (const c of (contacts ?? []) as Array<{ client_id: string }>) {
        await supabase.from('client_docs').insert({
          client_id: c.client_id,
          title: `${contactName} — Profile notes`,
          slug: slugify(contactName) + '-profile',
          category: 'other',
          body_markdown: body,
          source: 'notion_import',
          source_id: entry.replace(/\.md$/, ''),
          created_by_name: 'system (Notion import)',
        })
      }
      console.log(`  [+] Contact notes: ${contactName}`)
    }
  }

  // ────────────────────────────────────────────────────────────────
  // Done -- summary
  // ────────────────────────────────────────────────────────────────

  console.log('\n\n=== Import complete ===')

  const { count: clientCount } = await supabase.from('clients').select('*', { count: 'exact', head: true })
  const { count: contactCount } = await supabase.from('client_contacts').select('*', { count: 'exact', head: true })
  const { count: meetingCount } = await supabase.from('client_interactions').select('*', { count: 'exact', head: true }).eq('kind', 'meeting')
  const { count: docCount } = await supabase.from('client_docs').select('*', { count: 'exact', head: true })

  console.log(`  clients:          ${clientCount}`)
  console.log(`  client_contacts:  ${contactCount}`)
  console.log(`  meetings:         ${meetingCount}`)
  console.log(`  client_docs:      ${docCount}`)
}

async function importDocsRecursively(dir: string, clientId: string, parentId: string | null) {
  const entries = fs.readdirSync(dir)
  for (const entry of entries) {
    const full = path.join(dir, entry)
    const stat = fs.statSync(full)

    if (entry.endsWith('.md')) {
      const title = cleanNotionName(entry)
      const raw = fs.readFileSync(full, 'utf-8')
      const { body } = parseNotionMarkdown(raw)
      const category = inferCategory(title)

      const { data: inserted } = await supabase.from('client_docs').insert({
        client_id: clientId,
        title,
        slug: slugify(title),
        category,
        parent_doc_id: parentId,
        body_markdown: body,
        source: 'notion_import',
        source_id: entry.replace(/\.md$/, ''),
        created_by_name: 'system (Notion import)',
      }).select('id').single()

      // If there's a subfolder with the same name, recurse into it with this doc as parent
      const subfolder = path.join(dir, cleanNotionName(entry).replace(/[<>:"/\\|?*]/g, ''))
      const altSubfolder = path.join(dir, entry.replace(/\.md$/, ''))
      const subDir = fs.existsSync(subfolder) ? subfolder : fs.existsSync(altSubfolder) ? altSubfolder : null
      if (subDir && fs.statSync(subDir).isDirectory() && inserted?.id) {
        await importDocsRecursively(subDir, clientId, inserted.id)
      }
    } else if (stat.isDirectory()) {
      // Orphan folder (no matching .md) -- import contents flat under parent
      await importDocsRecursively(full, clientId, parentId)
    }
  }
}

main().catch(err => {
  console.error('\n!!! Import failed:', err)
  process.exit(1)
})
