/**
 * Pure types + constants for client_knowledge_facts. Imported by
 * BOTH the server reads (get-facts.ts) and the client UI
 * (KnowledgeTab). Keep zero server-only imports here.
 */

export type FactCategory =
  | 'history' | 'specialty' | 'customer' | 'voice' | 'pet_peeve'
  | 'seasonality' | 'competitor' | 'event' | 'signature_item'
  | 'value_prop' | 'positioning' | 'owner_quote' | 'observation'

export const FACT_CATEGORIES: FactCategory[] = [
  'history', 'specialty', 'customer', 'voice', 'pet_peeve',
  'seasonality', 'competitor', 'event', 'signature_item',
  'value_prop', 'positioning', 'owner_quote', 'observation',
]

export const FACT_CATEGORY_LABELS: Record<FactCategory, string> = {
  history:        'History',
  specialty:      'Specialty',
  customer:       'Customer',
  voice:          'Voice',
  pet_peeve:      'Pet peeve',
  seasonality:    'Seasonality',
  competitor:     'Competitor',
  event:          'Event',
  signature_item: 'Signature item',
  value_prop:     'Value prop',
  positioning:    'Positioning',
  owner_quote:    'Owner quote',
  observation:    'Observation',
}

export type FactSource =
  | 'strategist_note' | 'client_conversation' | 'onboarding'
  | 'observation' | 'ai_extracted' | 'public_data' | 'review_mining'

export type FactConfidence = 'low' | 'medium' | 'high' | 'verified'
