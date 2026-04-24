/**
 * Apnosh -- Looker Studio GBP CSV -> Drive folder bridge.
 *
 * WHAT THIS DOES
 *   Looker Studio's scheduled delivery emails a CSV attachment every
 *   morning. This script runs on a Gmail trigger, finds those emails,
 *   saves the attachment to a specific Drive folder, and labels the
 *   email as processed so we don't double-save.
 *
 * SETUP (one-time, ~5 minutes)
 *   1. Go to script.google.com -> New project -> paste this whole file.
 *   2. Fill in the two CONFIG values below.
 *   3. Run `setup()` once from the editor. It will:
 *        - create the Gmail label if missing
 *        - create an hourly trigger
 *   4. Accept the OAuth scopes when prompted (Gmail + Drive).
 *
 * LOOKER STUDIO CONFIG (do this in Looker)
 *   - File -> Schedule delivery
 *   - Frequency: Daily, 6:00am
 *   - Recipient: the Gmail address running this script
 *   - Attachment format: CSV
 *   - Subject line MUST contain the SUBJECT_MATCH string below so the
 *     script can find the right email.
 */

// ============================================================
// CONFIG -- EDIT THESE TWO LINES BEFORE RUNNING setup()
// ============================================================

// The Drive folder ID that the portal's ingest job watches. Grab it
// from the folder URL: drive.google.com/drive/folders/<THIS_PART>
const DRIVE_FOLDER_ID = 'PASTE_FOLDER_ID_HERE'

// Substring the script uses to find the right email. Match whatever
// Looker Studio puts in the subject line -- the default looks like
// "Scheduled delivery: GBP Daily Report".
const SUBJECT_MATCH = 'GBP Daily Report'

// Gmail label name (created automatically by setup() if missing)
const PROCESSED_LABEL = 'apnosh-gbp-processed'

// ============================================================
// Main job -- safe to run on a timer as often as hourly.
// Idempotent: labeled emails are skipped.
// ============================================================

function processGbpReports() {
  const label = GmailApp.getUserLabelByName(PROCESSED_LABEL)
  if (!label) {
    throw new Error(`Label "${PROCESSED_LABEL}" missing. Run setup() first.`)
  }

  const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID)

  // Only look at emails from the last 2 days to keep the query fast.
  const query = `subject:"${SUBJECT_MATCH}" -label:${PROCESSED_LABEL} newer_than:2d`
  const threads = GmailApp.search(query, 0, 20)

  let saved = 0
  threads.forEach(thread => {
    thread.getMessages().forEach(msg => {
      msg.getAttachments().forEach(att => {
        const name = att.getName()
        if (!name.toLowerCase().endsWith('.csv')) return

        // Prefix with today's date so multiple days don't overwrite each other
        const stamp = Utilities.formatDate(msg.getDate(), 'UTC', 'yyyy-MM-dd')
        const finalName = `${stamp}_${name}`

        folder.createFile(att.copyBlob()).setName(finalName)
        saved++
      })
    })
    thread.addLabel(label)
  })

  console.log(`Processed ${threads.length} threads, saved ${saved} CSVs to Drive.`)
}

// ============================================================
// One-time setup
// ============================================================

function setup() {
  // 1. Label
  if (!GmailApp.getUserLabelByName(PROCESSED_LABEL)) {
    GmailApp.createLabel(PROCESSED_LABEL)
    console.log(`Created label "${PROCESSED_LABEL}"`)
  }

  // 2. Trigger (every hour) -- remove old copies first
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'processGbpReports')
    .forEach(t => ScriptApp.deleteTrigger(t))

  ScriptApp.newTrigger('processGbpReports')
    .timeBased()
    .everyHours(1)
    .create()

  console.log('Hourly trigger installed. Script will run processGbpReports() every hour.')

  // 3. Validate folder access early so we surface permission errors now
  const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID)
  console.log(`Drive folder verified: "${folder.getName()}" -- ${folder.getUrl()}`)
}
