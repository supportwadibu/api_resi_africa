import { toManagerDto, type ManagerDto } from '../dto/manager.dto.ts'
import ManagerRepository from '../repositories/manager_repository.ts'

/**
 * Gérants d'un propriétaire.
 *
 * La liste part des affectations et non des comptes : `manager_assignments` est
 * indexée sur `owner_id`, alors que retrouver les comptes par
 * `metadata.created_by` demanderait un index de plus sur `users` — et
 * rattacherait des comptes dont l'affectation aurait été supprimée.
 *
 * Une affectation dont le compte a disparu est écartée plutôt que rendue
 * incomplète : il n'y a rien à afficher ni à gérer.
 */
export class ListManagersUseCase {
  constructor(private repo: ManagerRepository = new ManagerRepository()) {}

  async execute(ownerId: string): Promise<ManagerDto[]> {
    const assignments = await this.repo.listAssignments(ownerId)
    if (assignments.length === 0) return []

    const accounts = await this.repo.findAccounts(assignments.map((a) => a.manager_id))

    return assignments
      .map((assignment) => {
        const account = accounts.get(assignment.manager_id)
        return account ? toManagerDto(account, assignment) : null
      })
      .filter((dto): dto is ManagerDto => dto !== null)
  }
}

export default ListManagersUseCase
