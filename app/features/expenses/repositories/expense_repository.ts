import Expense, { type ExpenseRecord } from '#models/expense'
import Property from '#models/property'
import Residence from '#models/residence'

import type {
  CreateExpenseInput,
  ExpenseDto,
  ExpensePropertySummary,
  ExpenseResidenceSummary,
  ExpenseSummaryDto,
  ListExpensesFilters,
  UpdateExpenseInput,
} from '../dto/expense.dto.ts'

export class ExpenseRepository {
  static toDto(doc: ExpenseRecord): ExpenseDto {
    return {
      id: doc._id,
      owner_id: doc.owner_id,
      property_id: doc.property_id ?? null,
      // Absent des dépenses antérieures aux résidences : elles portent
      // toutes un `property_id`.
      residence_id: doc.residence_id ?? null,
      category: doc.category,
      amount: doc.amount,
      spent_at: doc.spent_at,
      note: doc.note ?? null,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
    }
  }

  /**
   * Résout les cibles d'un lot de dépenses en une passe.
   *
   * Un `Map` par type de cible sur les identifiants distincts : plusieurs
   * dépenses portent couramment sur le même bien ou la même résidence, et une
   * lecture par dépense multiplierait les allers-retours Firestore pour rien.
   *
   * Les deux jointures sont faites ici plutôt que dans deux méthodes : une
   * charge commune n’a pas de bien, et un appelant qui n’en joindrait qu’une
   * renverrait une dépense sans libellé affichable.
   */
  private async attachTargets(expenses: ExpenseDto[]): Promise<ExpenseDto[]> {
    const onlyIds = (values: Array<string | null>) => [
      ...new Set(values.filter((id): id is string => Boolean(id))),
    ]

    const propertyIds = onlyIds(expenses.map((e) => e.property_id))
    const residenceIds = onlyIds(expenses.map((e) => e.residence_id))
    if (!propertyIds.length && !residenceIds.length) return expenses

    const properties = new Map<string, ExpensePropertySummary>()
    const residences = new Map<string, ExpenseResidenceSummary>()

    await Promise.all([
      ...propertyIds.map(async (id) => {
        const property = await Property.findById(id)
        if (property) {
          properties.set(id, {
            id: property._id,
            title: property.title,
            city: property.address?.city ?? '',
          })
        }
      }),
      ...residenceIds.map(async (id) => {
        const residence = await Residence.findById(id)
        if (residence) {
          residences.set(id, {
            id: residence._id,
            name: residence.name,
            city: residence.address?.city ?? '',
          })
        }
      }),
    ])

    return expenses.map((expense) => ({
      ...expense,
      // `null` plutôt qu’absent : une cible supprimée depuis doit se
      // distinguer d’une cible jamais renseignée.
      property: expense.property_id ? (properties.get(expense.property_id) ?? null) : null,
      residence: expense.residence_id ? (residences.get(expense.residence_id) ?? null) : null,
    }))
  }

  async create(input: CreateExpenseInput): Promise<ExpenseDto> {
    const doc = await Expense.create(input)
    const [withProperty] = await this.attachTargets([ExpenseRepository.toDto(doc)])
    return withProperty
  }

  async findByIdAndOwner(id: string, owner_id: string): Promise<ExpenseDto | null> {
    const doc = await Expense.findByIdAndOwner(id, owner_id)
    if (!doc) return null

    const [withProperty] = await this.attachTargets([ExpenseRepository.toDto(doc)])
    return withProperty
  }

  async update(
    id: string,
    input: UpdateExpenseInput,
    owner_id: string
  ): Promise<ExpenseDto | null> {
    // Les clés absentes ne doivent pas écraser l'existant : seules celles
    // effectivement fournies partent dans le patch.
    const patch: Record<string, unknown> = {}
    if (input.property_id !== undefined) patch.property_id = input.property_id
    if (input.category !== undefined) patch.category = input.category
    if (input.amount !== undefined) patch.amount = input.amount
    if (input.spent_at !== undefined) patch.spent_at = input.spent_at
    if (input.note !== undefined) patch.note = input.note?.trim() || null

    const doc = await Expense.findByIdAndUpdate(id, patch, owner_id)
    if (!doc) return null

    const [withProperty] = await this.attachTargets([ExpenseRepository.toDto(doc)])
    return withProperty
  }

  async delete(id: string, owner_id: string): Promise<boolean> {
    return Expense.deleteOne(id, owner_id)
  }

  async paginate(filters: ListExpensesFilters): Promise<{
    data: ExpenseDto[]
    total: number
    page: number
    perPage: number
  }> {
    const page = Math.max(1, filters.page ?? 1)
    const perPage = Math.min(100, Math.max(1, filters.per_page ?? 20))

    const { data, total } = await Expense.paginate(
      {
        owner_id: filters.owner_id,
        property_id: filters.property_id,
        residence_id: filters.residence_id,
        category: filters.category,
        from: filters.from,
        to: filters.to,
      },
      { limit: perPage, offset: (page - 1) * perPage }
    )

    return {
      data: await this.attachTargets(data.map((d) => ExpenseRepository.toDto(d))),
      total,
      page,
      perPage,
    }
  }

  async summary(filters: ListExpensesFilters): Promise<ExpenseSummaryDto> {
    const summary = await Expense.summary({
      owner_id: filters.owner_id,
      property_id: filters.property_id,
      residence_id: filters.residence_id,
      category: filters.category,
      from: filters.from,
      to: filters.to,
    })
    const { total, count } = summary

    return {
      total,
      count,
      by_category: summary.by_category.map((bucket) => ({
        ...bucket,
        // Un total nul ne donne aucune part : éviter la division par zéro
        // plutôt que de renvoyer `NaN` jusqu'au graphique.
        share_percent: total > 0 ? Math.round((bucket.amount / total) * 100) : 0,
      })),
    }
  }
}

export default ExpenseRepository
