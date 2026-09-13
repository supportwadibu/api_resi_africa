import { test } from '@japa/runner'

import { belongsToResidence, sumResidenceExpenses } from '#features/finance/residence_scope'

const RESIDENCE = 'resi-adja'
const UNITS = new Set(['studio-1', 'studio-2', 'chambre-salon'])

/** Charge commune du lieu — électricité, gardien. */
const commune = (amount: number) => ({
  property_id: null,
  residence_id: RESIDENCE,
  amount,
})

/** Charge d'une unité — ménage, réparation. */
const unite = (propertyId: string, amount: number) => ({
  property_id: propertyId,
  residence_id: null,
  amount,
})

test.group('belongsToResidence', () => {
  test('une charge commune de la résidence est retenue', ({ assert }) => {
    assert.isTrue(belongsToResidence(commune(30000), RESIDENCE, UNITS))
  })

  test('une charge d’une unité de la résidence est retenue', ({ assert }) => {
    assert.isTrue(belongsToResidence(unite('studio-1', 5000), RESIDENCE, UNITS))
  })

  test('une charge commune d’une autre résidence est écartée', ({ assert }) => {
    assert.isFalse(
      belongsToResidence(
        { property_id: null, residence_id: 'resi-yopougon', amount: 9000 },
        RESIDENCE,
        UNITS
      )
    )
  })

  test('une charge d’un bien étranger à la résidence est écartée', ({ assert }) => {
    assert.isFalse(belongsToResidence(unite('villa-autonome', 12000), RESIDENCE, UNITS))
  })

  test('une dépense sans cible n’appartient à aucun relevé', ({ assert }) => {
    // L'historique antérieur à la règle d'exclusivité peut en porter : la
    // compter gonflerait les charges d'une résidence au hasard.
    assert.isFalse(
      belongsToResidence({ property_id: null, residence_id: null, amount: 7000 }, RESIDENCE, UNITS)
    )
  })

  test('une résidence sans unité ne retient que ses charges communes', ({ assert }) => {
    const aucune = new Set<string>()

    assert.isTrue(belongsToResidence(commune(30000), RESIDENCE, aucune))
    assert.isFalse(belongsToResidence(unite('studio-1', 5000), RESIDENCE, aucune))
  })
})

test.group('sumResidenceExpenses', () => {
  test('somme les charges communes et celles des unités', ({ assert }) => {
    // C'est le seul endroit du code où les deux niveaux se rencontrent.
    const expenses = [
      commune(30000), // électricité du lieu
      unite('studio-1', 5000), // ménage studio 1
      unite('studio-2', 7000), // réparation studio 2
    ]

    assert.equal(sumResidenceExpenses(expenses, RESIDENCE, UNITS), 42000)
  })

  test('ne compte aucune dépense deux fois', ({ assert }) => {
    // Une dépense portant les deux rattachements est impossible à l'écriture
    // (`resolveExpenseTarget` la refuse), mais si l'historique en portait une,
    // elle ne doit être comptée qu'une fois. `belongsToResidence` teste
    // `residence_id` d'abord et sort : la branche `property_id` n'est pas
    // évaluée.
    const douteuse = { property_id: 'studio-1', residence_id: RESIDENCE, amount: 10000 }

    assert.equal(sumResidenceExpenses([douteuse], RESIDENCE, UNITS), 10000)
  })

  test('écarte les charges des autres résidences et des biens autonomes', ({ assert }) => {
    const expenses = [
      commune(30000),
      { property_id: null, residence_id: 'resi-yopougon', amount: 50000 },
      unite('villa-autonome', 20000),
    ]

    assert.equal(sumResidenceExpenses(expenses, RESIDENCE, UNITS), 30000)
  })

  test('un lot vide donne zéro, pas NaN', ({ assert }) => {
    assert.equal(sumResidenceExpenses([], RESIDENCE, UNITS), 0)
  })

  test('le total d’une résidence est inférieur au total du propriétaire', ({ assert }) => {
    // Invariant de cohérence : restreindre à une résidence ne peut qu'enlever
    // des charges, jamais en ajouter.
    const expenses = [
      commune(30000),
      unite('studio-1', 5000),
      unite('villa-autonome', 20000),
      { property_id: null, residence_id: 'resi-yopougon', amount: 50000 },
    ]

    const totalProprietaire = expenses.reduce((sum, e) => sum + e.amount, 0)
    const totalResidence = sumResidenceExpenses(expenses, RESIDENCE, UNITS)

    assert.isBelow(totalResidence, totalProprietaire)
    assert.equal(totalResidence, 35000)
  })
})
