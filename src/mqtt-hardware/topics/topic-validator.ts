import { BadRequestException } from '@nestjs/common';

export class TopicValidator {
  static validatePositiveInteger(
    value: number | undefined | null,
    fieldname: string,
  ): void {
    if (!Number.isInteger(value) || value === null || value === undefined) {
      throw new BadRequestException(
        `${fieldname} é obrigatório e deve ser um número inteiro positivo.`,
      );
    }

    if (value <= 0) {
      throw new BadRequestException(`${fieldname} deve ser maior que zero.`);
    }
  }

  static validateTopics(topic: string, fieldname: string): void {
    if (!topic || topic.trim().length === 0) {
      throw new BadRequestException(`${fieldname} não pode ser vazio.`);
    }

    if (topic.includes(' ')) {
      throw new BadRequestException(`${fieldname} não pode conter espaços.`);
    }

    if (topic.includes('//')) {
      throw new BadRequestException(`${fieldname} não pode conter "//".`);
    }

    if (topic.startsWith('/')) {
      throw new BadRequestException(`${fieldname} não pode começar com "/".`);
    }

    if (topic.endsWith('/')) {
      throw new BadRequestException(`${fieldname} não pode terminar com "/".`);
    }
  }

  static validateTopicSegment(segment: string, fieldname: string): void {
    if (!segment || segment.trim().length === 0) {
      throw new BadRequestException(`${fieldname} não pode ser vazio.`);
    }

    if (segment.includes(' ')) {
      throw new BadRequestException(`${fieldname} não pode conter espaços.`);
    }

    if (segment.includes('/')) {
      throw new BadRequestException(`${fieldname} não pode conter "/".`);
    }
  }
}
