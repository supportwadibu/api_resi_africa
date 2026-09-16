import { test } from '@japa/runner'
import { renderReservationsReport } from '#features/reports/renderers/reservations_report'

const context = {
  owner_name: 'Kouassi',
  residence_name: null,
  period: {
    window: { from: new Date('2026-03-01T00:00:00Z'), to: new Date('2026-04-01T00:00:00Z') },
    label: 'Mars 2026',
    from_date: '2026-03-01',
    to_date: '2026-03-31',
  },
  generated_at: new Date('2026-04-02T09:30:00Z'),
}

const rows = [
  {
    booking_id: 'b1',
    check_in_at: new Date('2026-03-02T14:00:00Z'),
    check_out_at: new Date('2026-03-06T11:00:00Z'),
    property_title: 'Studio A',
    client_name: 'Aya Traoré',
    client_phone: '+225 07 00 00 00',
    has_id_document: true,
    days_count: 4,
    total_amount: 100000,
    settled_amount: 100000,
    source: 'online' as const,
  },
  {
    booking_id: 'b2',
    check_in_at: new Date('2026-03-10T14:00:00Z'),
    check_out_at: new Date('2026-03-12T11:00:00Z'),
    property_title: 'Studio B',
    client_name: 'Koffi N’Guessan',
    client_phone: '+225 05 11 11 11',
    has_id_document: false,
    days_count: 2,
    total_amount: 60000,
    settled_amount: 20000,
    source: 'offline' as const,
  },
]

test.group('renderReservationsReport', () => {
  test('affiche le nom et le téléphone du client', ({ assert }) => {
    const html = renderReservationsReport(rows, context)

    assert.include(html, 'Aya Traoré')
    assert.include(html, '+225 07 00 00 00')
  })

  test('dit « Fournie » ou « Non fournie », jamais « Vérifiée »', ({ assert }) => {
    const html = renderReservationsReport(rows, context)

    assert.include(html, 'Fournie')
    assert.include(html, 'Non fournie')
    assert.notInclude(html, 'Vérifiée')
  })

  test('distingue le canal en ligne du comptoir', ({ assert }) => {
    const html = renderReservationsReport(rows, context)

    assert.include(html, 'En ligne')
    assert.include(html, 'Comptoir')
  })

  test('liste les séjours au solde incomplet', ({ assert }) => {
    const html = renderReservationsReport(rows, context)

    assert.include(html, 'Paiements en attente')
    assert.match(html, /40\s?000/)
  })

  test('échappe un nom de client contenant du HTML', ({ assert }) => {
    const html = renderReservationsReport([{ ...rows[0], client_name: '<b>Pirate</b>' }], context)

    assert.notInclude(html, '<b>Pirate</b>')
    assert.include(html, '&lt;b&gt;Pirate&lt;/b&gt;')
  })

  test('porte l’avertissement sur l’état de la pièce au moment de l’édition', ({ assert }) => {
    const html = renderReservationsReport(rows, context)

    assert.include(html, 'au moment de l’édition')
  })

  test('porte la mention sur les données personnelles', ({ assert }) => {
    const html = renderReservationsReport(rows, context)

    assert.include(html, 'données personnelles')
  })

  test('signale que les règlements en espèces n’apparaissent pas', ({ assert }) => {
    const html = renderReservationsReport(rows, context)

    assert.include(html, 'espèces')
  })

  test('reste valide sur une période sans réservation', ({ assert }) => {
    const html = renderReservationsReport([], context)

    assert.include(html, 'Aucune réservation sur la période')
  })
})
