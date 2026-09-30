import { PropertyRepository } from '#features/properties/repositories/property_repository'
import { test } from '@japa/runner'

import type { PropertyRecord } from '#models/property'

/**
 * Bien enregistré avant le retrait de l'ameublement : son document Firestore
 * porte encore `details.furnishing`.
 */
const legacy = {
  _id: 'property-1',
  owner_id: 'owner-1',
  title: 'Studio Cocody',
  description: '',
  property_type: 'studio',
  status: 'published',
  details: {
    surface_area: null,
    bedrooms: 1,
    bathrooms: 1,
    living_rooms: 1,
    kitchens: 1,
    parking_spaces: 0,
    floor_number: null,
    total_floors: null,
    year_built: null,
    furnishing: 'furnished',
  },
  created_at: new Date('2026-01-01'),
  updated_at: new Date('2026-01-01'),
} as unknown as PropertyRecord

test.group('PropertyRepository.toDto — ameublement retiré', () => {
  test('n’expose plus l’ameublement d’un bien historique', ({ assert }) => {
    const details = PropertyRepository.toDto(legacy).details as unknown as Record<string, unknown>
    assert.notProperty(details, 'furnishing')
    assert.equal(details.bedrooms, 1)
  })

  test('laisse le document lu intact', ({ assert }) => {
    PropertyRepository.toDto(legacy)
    const details = legacy.details as unknown as Record<string, unknown>
    assert.equal(details.furnishing, 'furnished')
  })
})
