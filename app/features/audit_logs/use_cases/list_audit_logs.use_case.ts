import type { ListAuditLogsInput, ListAuditLogsOutput } from '../dto/audit_log.dto.ts'
import AuditLogRepository from '../repositories/audit_log_repository.ts'

/** Journal d'audit, du plus récent au plus ancien. */
export class ListAuditLogsUseCase {
  constructor(private repo: AuditLogRepository = new AuditLogRepository()) {}

  async execute(input: ListAuditLogsInput): Promise<ListAuditLogsOutput> {
    const { data, total } = await this.repo.paginate(input)
    const currentPage = Math.max(1, input.page ?? 1)
    const perPage = Math.min(100, Math.max(1, input.per_page ?? 20))

    return {
      data: data.map(AuditLogRepository.toDto),
      meta: {
        total,
        perPage,
        currentPage,
        lastPage: Math.max(1, Math.ceil(total / perPage)),
      },
    }
  }
}

export default ListAuditLogsUseCase
