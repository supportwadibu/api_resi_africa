import type { CreateResidenceInput, ResidenceDto } from '../dto/residence.dto.ts'
import ResidenceRepository from '../repositories/residence_repository.ts'

export class CreateResidenceUseCase {
  constructor(private repo: ResidenceRepository = new ResidenceRepository()) {}

  async execute(input: CreateResidenceInput): Promise<ResidenceDto> {
    return this.repo.create(input)
  }
}

export default CreateResidenceUseCase
