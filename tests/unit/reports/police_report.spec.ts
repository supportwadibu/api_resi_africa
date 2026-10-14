import { test } from '@japa/runner'

import {
  buildPoliceRows,
  policeFooterText,
  formatIdDocument,
  renderPoliceReport,
  type PoliceReportHeader,
  type PoliceRow,
} from '#features/reports/renderers/police_report'

import type { BookingDto } from '#features/bookings/dto/booking.dto'
import type { ClientDto } from '#features/clients/dto/client.dto'
import type { UserSummaryDto } from '#features/users/dto/user.dto'

function booking(overrides: Partial<BookingDto>): BookingDto {
  return {
    id: 'b',
    property_id: 'p',
    residence_id: null,
    owner_id: 'o',
    client_id: 'c',
    status: 'confirmed',
    start_date: new Date('2026-06-14T14:00:00Z'),
    end_date: new Date('2026-06-16T12:00:00Z'),
    days_count: 2,
    daily_price: 20000,
    duration_discount_percent: 0,
    subtotal_amount: 40000,
    discount_amount: 0,
    total_amount: 40000,
    promo_code: null,
    message: null,
    cancelled_at: null,
    completed_at: null,
    cancellation_reason: null,
    created_at: new Date('2026-06-01T00:00:00Z'),
    updated_at: new Date('2026-06-01T00:00:00Z'),
    refunded_amount: 0,
    referrer: null,
    referrer_commission_rate: 0,
    referrer_commission_amount: 0,
    ...overrides,
  }
}

function client(overrides: Partial<ClientDto>): ClientDto {
  return {
    id: 'c',
    full_name: 'Aya Traoré',
    phone: '0700000000',
    whatsapp: null,
    id_document_type: 'cni',
    id_document_number: 'C0012345',
    has_document_front: true,
    has_document_back: true,
    documents_status: 'complete',
    birth_date: new Date('1990-04-12T00:00:00Z'),
    birth_place: 'Bouaké',
    nationality: 'Ivoirienne',
    address: 'Cocody Angré',
    id_document_issued_at: new Date('2021-03-12T00:00:00Z'),
    stats: { total_stays: 1, total_paid: 0, last_stay_at: null },
    status: 'active',
    created_by: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }
}

const header: PoliceReportHeader = {
  hotel: 'Résidence Les Palmiers',
  commune: 'Cocody',
  from_date: '2026-06-01',
  to_date: '2026-06-30',
}

test.group('buildPoliceRows', () => {
  test('trie les séjours par date d’entrée', ({ assert }) => {
    const rows = buildPoliceRows(
      [
        booking({ id: 'late', check_in_at: new Date('2026-06-20T14:00:00Z') }),
        booking({ id: 'early', check_in_at: new Date('2026-06-02T14:00:00Z') }),
      ],
      new Map(),
      new Map()
    )
    assert.deepEqual(
      rows.map((row) => row.check_in_at.toISOString()),
      ['2026-06-02T14:00:00.000Z', '2026-06-20T14:00:00.000Z']
    )
  })

  test('lit nom et contact sur l’instantané, l’identité sur la fiche', ({ assert }) => {
    const [row] = buildPoliceRows(
      [
        booking({
          source: 'offline',
          client: { id: 'c', full_name: 'Aya T. (au séjour)', phone: '0711111111' },
        }),
      ],
      new Map([['c', client({ full_name: 'Aya Traoré (renommée)' })]]),
      new Map()
    )
    assert.equal(row.full_name, 'Aya T. (au séjour)')
    assert.equal(row.contact, '0711111111')
    assert.equal(row.birth_place, 'Bouaké')
    assert.equal(row.nationality, 'Ivoirienne')
    assert.equal(row.address, 'Cocody Angré')
    assert.equal(row.id_document.number, 'C0012345')
  })

  test('un client en ligne est lu sur son compte, sans identité', ({ assert }) => {
    const users = new Map<string, UserSummaryDto>([
      ['u1', { id: 'u1', full_name: 'Koffi N’Guessan', email: null, phone: '0522222222' }],
    ])
    const [row] = buildPoliceRows(
      [booking({ client_id: 'u1', source: 'online' })],
      new Map(),
      users
    )
    assert.equal(row.full_name, 'Koffi N’Guessan')
    assert.equal(row.contact, '0522222222')
    assert.isNull(row.birth_date)
    assert.isNull(row.id_document.number)
  })

  test('le départ est la sortie réelle quand elle est constatée', ({ assert }) => {
    const [row] = buildPoliceRows(
      [
        booking({
          status: 'completed',
          check_out_at: new Date('2026-06-16T12:00:00Z'),
          actual_check_out_at: new Date('2026-06-15T09:30:00Z'),
        }),
      ],
      new Map(),
      new Map()
    )
    assert.equal(row.check_out_at.toISOString(), '2026-06-15T09:30:00.000Z')
  })

  test('une réservation antérieure au comptoir retombe sur start/end', ({ assert }) => {
    const [row] = buildPoliceRows([booking({})], new Map(), new Map())
    assert.equal(row.check_in_at.toISOString(), '2026-06-14T14:00:00.000Z')
    assert.equal(row.check_out_at.toISOString(), '2026-06-16T12:00:00.000Z')
  })
})

test.group('formatIdDocument', () => {
  test('nature, numéro et date de délivrance', ({ assert }) => {
    assert.equal(
      formatIdDocument({
        type: 'cni',
        number: 'C0012345',
        issued_at: new Date('2021-03-12T00:00:00Z'),
      }),
      'CNI n° C0012345 du 12/03/2021'
    )
  })

  test('les parties absentes sont omises', ({ assert }) => {
    assert.equal(
      formatIdDocument({ type: 'passeport', number: null, issued_at: null }),
      'Passeport'
    )
    assert.equal(formatIdDocument({ type: null, number: null, issued_at: null }), '')
  })
})

test.group('renderPoliceReport', () => {
  const row: PoliceRow = {
    full_name: 'Aya <Traoré>',
    birth_date: new Date('1990-04-12T00:00:00Z'),
    birth_place: 'Bouaké',
    nationality: 'Ivoirienne',
    id_document: { type: 'cni', number: 'C0012345', issued_at: null },
    address: 'Cocody Angré',
    check_in_at: new Date('2026-06-14T14:00:00Z'),
    check_out_at: new Date('2026-06-16T12:00:00Z'),
    contact: '0700000000',
  }

  test('porte les en-têtes officiels et le formulaire', ({ assert }) => {
    const html = renderPoliceReport([row], header)
    assert.include(html, 'MINISTÈRE DE L’INTÉRIEUR ET DE LA SÉCURITÉ')
    assert.include(html, 'BRIGADE MONDAINE')
    assert.include(html, '/MIS/DGPN/PPA/BM')
    assert.include(html, 'RÉPUBLIQUE DE CÔTE D’IVOIRE')
    assert.include(html, 'Union – Discipline – Travail')
    assert.include(html, 'Résidence Les Palmiers')
    assert.include(html, 'Cocody')
    assert.include(html, '01/06/2026')
    assert.include(html, '30/06/2026')
  })

  test('écrit date et heure en deux lignes, à l’heure d’Abidjan', ({ assert }) => {
    const html = renderPoliceReport([row], header)
    assert.include(html, '14/06/26<br />14h00')
    assert.include(html, '16/06/26<br />12h00')
  })

  test('échappe les saisies libres', ({ assert }) => {
    const html = renderPoliceReport([row], header)
    assert.include(html, 'Aya &lt;Traoré&gt;')
    assert.notInclude(html, 'Aya <Traoré>')
  })

  test('numérote les lignes', ({ assert }) => {
    const html = renderPoliceReport([row, { ...row, full_name: 'Second' }], header)
    assert.match(html, /<td class="num">1<\/td>/)
    assert.match(html, /<td class="num">2<\/td>/)
  })

  test('une commune inconnue laisse une ligne à remplir', ({ assert }) => {
    const html = renderPoliceReport([row], { ...header, commune: null })
    assert.include(html, 'COMMUNE DE :')
    assert.include(html, 'class="blank"')
  })

  test('une période sans séjour le dit, sans tableau vide muet', ({ assert }) => {
    const html = renderPoliceReport([], header)
    assert.include(html, 'Aucune personne hébergée sur la période.')
  })
})

test.group('buildPoliceRows — personnes réellement hébergées', () => {
  const now = new Date('2026-06-15T10:00:00Z')

  test('écarte un client pas encore entré à l’édition', ({ assert }) => {
    // Une réservation future reste « confirmée » jusqu'à la clôture : seule
    // l'heure d'entrée dit si la personne est arrivée.
    const rows = buildPoliceRows(
      [
        booking({ id: 'arrive', check_in_at: new Date('2026-06-14T14:00:00Z') }),
        booking({ id: 'a-venir', check_in_at: new Date('2026-06-20T14:00:00Z') }),
      ],
      new Map(),
      new Map(),
      now
    )
    assert.lengthOf(rows, 1)
    assert.equal(rows[0].check_in_at.toISOString(), '2026-06-14T14:00:00.000Z')
  })

  test('garde un client entré à l’instant même', ({ assert }) => {
    const rows = buildPoliceRows([booking({ check_in_at: now })], new Map(), new Map(), now)
    assert.lengthOf(rows, 1)
  })
})

test.group('policeFooterText', () => {
  test('neutre, sans la marque de la plateforme', ({ assert }) => {
    const text = policeFooterText({ ...header, from_date: '2026-06-01', to_date: '2026-06-30' })
    assert.notInclude(text, 'RESI')
    assert.include(text, 'Résidence Les Palmiers')
    assert.include(text, '01/06/2026')
  })
})

test.group('renderPoliceReport — commune saisie', () => {
  test('imprime la commune fournie', ({ assert }) => {
    const html = renderPoliceReport([], { ...header, commune: 'Cocody' })
    assert.include(html, '<strong>Cocody</strong>')
  })
})
