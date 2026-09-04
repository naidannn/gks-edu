import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateClientDto } from './create-client.dto.js';

/**
 * Everything on a client is editable except the case-opening switch, which is a
 * creation-time action rather than a field.
 */
export class UpdateClientDto extends PartialType(OmitType(CreateClientDto, ['openCase'] as const)) {}
