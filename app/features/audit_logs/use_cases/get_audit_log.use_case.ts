import { DomainError } from '#utils/domain_error'

import type { AuditLogDto } from '../dto/audit_log.dto.ts'
import AuditLogRepository from '../repositories/audit_log_repository.ts'

export class GetAuditLogUseCase {
  constructor(private repo: AuditLogRepository = new AuditLogRepository()) {}

  async execute(id: string): Promise<AuditLogDto> {
    const doc = await this.repo.findById(id)
    if (!doc) {
      throw new DomainError('audit_log_not_found', "Trace d'audit introuvable.", 404)
    }

    return AuditLogRepository.toDto(doc)
  }
}

export default GetAuditLogUseCase
